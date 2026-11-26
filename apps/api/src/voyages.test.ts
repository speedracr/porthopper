import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Voyage, Voyages } from "../../../packages/shared/voyages.ts";
import { createApp } from "./app.ts";
import { createMockBillingAdapter } from "./billing.ts";
import { readFileSync } from "node:fs";
import { initializeDatabase } from "./initialize-database.ts";

import { portLocalToEpoch, formatPortLocal, portTimeZones } from "../../../packages/shared/port-time.ts";
import type { UsageRequest, SubmitUsageResult } from "../../../packages/shared/billing.ts";

test("port-local editing preserves millisecond timestamps", () => {
  for (const zone of Object.values(portTimeZones)) {
    const instant = Date.parse("2025-01-31T23:59:59.875Z");
    assert.equal(portLocalToEpoch(formatPortLocal(instant, zone), zone), instant);
  }
  assert.equal(portLocalToEpoch("2025-01-01T12:00:00.1", "Europe/London"), Date.parse("2025-01-01T12:00:00.100Z"));
});

const selection = { playerId: "CUS-1002", portId: "PRT-1001", vesselId: "VSL-1001" };

test("upgrades a Step 5 database without changing existing voyages", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const request = client(createApp(db, { allowTestVoyages: true }));
    const voyage = await request("admin/voyages/test", 201, "POST", { ...selection, durationSeconds: 60 });
    db.exec("DROP TABLE usage_attempts; DROP TABLE usage_submissions; PRAGMA user_version = 4");
    initializeDatabase(db);
    const upgraded = client(createApp(db));
    assert.deepEqual(await upgraded(`voyages/${voyage.id}`, 200), voyage);
    assert.equal((await upgraded(`admin/voyages/${voyage.id}/usage`, 200, "POST")).usageSubmission?.status, "accepted");
  } finally { db.close(); }
});

test("upgrades preliminary usage snapshots to seconds and persisted timestamps", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    db.exec("DROP TABLE usage_attempts; DROP TABLE usage_submissions");
    db.exec(readFileSync(new URL("../migrations/005-usage.sql", import.meta.url), "utf8"));
    db.prepare(`INSERT INTO voyages (id, playerId, playerName, billingCountry, portId, portName, performanceCountry,
      vesselId, vesselName, productKey, startedAtMs, endedAtMs, isTest)
      VALUES ('legacy', 'CUS-1002', 'Player', 'GB', 'PRT-1001', 'Hamburg', 'DE', 'VSL-1001', 'Wren', 'tugboat', 0, 61251, 1)`).run();
    db.prepare("INSERT INTO usage_submissions VALUES ('usage-legacy', 'legacy', 'failed', NULL, ?)").run(JSON.stringify({ id: "usage-legacy", quantity: 1.02085, unit: "minutes" }));
    db.exec(`INSERT INTO usage_attempts (submissionId, startedAt, completedAt, outcome) VALUES
      ('usage-legacy', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', 'temporary'); PRAGMA user_version = 5`);
    initializeDatabase(db);
    const row = db.prepare("SELECT * FROM usage_submissions").get()!;
    assert.deepEqual(JSON.parse(String(row.request)), { id: "usage-legacy", durationSeconds: 61.251 });
    assert.equal(row.createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(row.attemptedAt, row.createdAt);
    assert.throws(() => db.exec("UPDATE usage_submissions SET createdAt = 'changed'"));
  } finally { db.close(); }
});

test("conflicting external IDs become unknown and cannot be resubmitted", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    let calls = 0;
    const request = client(createApp(db, { allowTestVoyages: true, billingAdapter: {
      async submitUsage() { calls++; return { outcome: "accepted", externalId: "same-external-id" }; },
    } }));
    const first = await request("admin/voyages/test", 201, "POST", { ...selection, durationSeconds: 0.125 });
    const second = await request("admin/voyages/test", 201, "POST", { ...selection, durationSeconds: 0.125 });
    assert.equal((await request(`admin/voyages/${first.id}/usage`, 200, "POST")).usageSubmission?.status, "accepted");
    const path = `admin/voyages/${second.id}/usage`;
    const result = await request(path, 200, "POST");
    assert.equal(result.usageSubmission?.status, "unknown");
    assert.equal(result.usageSubmission?.attempts[0]?.outcome, "ambiguous");
    await request(path, 200, "POST");
    assert.equal(calls, 2);
  } finally { db.close(); }
});

test("mock development scenarios are prohibited in production", () => {
  const environment = process.env.NODE_ENV;
  const scenario = process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO;
  try {
    process.env.NODE_ENV = "production";
    process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO = "accept";
    assert.throws(() => createMockBillingAdapter(), /disabled in production/);
    delete process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO;
    assert.throws(() => createMockBillingAdapter("temporary"), /disabled in production/);
    assert.doesNotThrow(() => createMockBillingAdapter());
  } finally {
    if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
    if (scenario === undefined) delete process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO; else process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO = scenario;
  }
});

test("port local times reject DST gaps, overlaps and invalid dates across the four ports", () => {
  for (const zone of Object.values(portTimeZones)) {
    const local = "2026-01-15T12:30:00";
    assert.equal(formatPortLocal(portLocalToEpoch(local, zone), zone), local);
    assert.throws(() => portLocalToEpoch("2026-02-30T12:00", zone));
    const hour = zone === "Europe/London" ? "01" : "02";
    assert.throws(() => portLocalToEpoch(`2026-03-29T${hour}:30`, zone));
    assert.throws(() => portLocalToEpoch(`2026-10-25T${hour}:30`, zone));
  }
});

test("historical timing, atomic submission, immutable retry and accepted replay", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const calls: Readonly<UsageRequest>[] = [];
    let timestamp = Date.parse("2026-02-01T00:00:00Z");
    let resolve!: (result: SubmitUsageResult) => void;
    const request = client(createApp(db, { now: () => timestamp, allowTestVoyages: true, billingAdapter: {
      submitUsage(input) { calls.push(input); return new Promise((done) => { resolve = done; }); },
    } }));
    let voyage = await request("admin/voyages/test", 201, "POST", { ...selection, startedAtLocal: "2026-01-15T12:00", durationMinutes: 2.5 });
    assert.equal(voyage.startedAt, "2026-01-15T11:00:00.000Z");
    assert.equal(voyage.portTimeZone, "Europe/Berlin");
    voyage = await request(`admin/voyages/${voyage.id}/timing`, 200, "POST", { startedAtLocal: "2026-01-15T13:00", durationMinutes: 1.02085 });
    const path = `admin/voyages/${voyage.id}/usage`;
    const first = request(path, 200, "POST");
    await new Promise((done) => setImmediate(done));
    assert.equal((await request(path, 200, "POST")).usageSubmission?.status, "submitting");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.durationSeconds, 61.251);
    assert.equal("quantity" in calls[0]!, false);
    assert.equal("unit" in calls[0]!, false);
    resolve({ outcome: "temporary" });
    const failed = (await first).usageSubmission!;
    assert.equal(failed.status, "failed");
    assert.equal(failed.createdAt, new Date(timestamp).toISOString());
    assert.equal(failed.attemptedAt, failed.createdAt);
    timestamp += 1000;
    await request(`admin/voyages/${voyage.id}/timing`, 409, "POST", { startedAtLocal: "2026-01-15T14:00", durationMinutes: 4 });
    const retry = request(path, 200, "POST");
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(calls[1], calls[0]);
    resolve({ outcome: "accepted", externalId: "mock-accepted" });
    const accepted = (await retry).usageSubmission!;
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.createdAt, failed.createdAt);
    assert.equal(accepted.attemptedAt, new Date(timestamp).toISOString());
    assert.equal(accepted.attemptedAt, accepted.attempts[1]!.startedAt);
    assert.equal(accepted.attempts.length, 2);
    assert.equal(accepted.externalId, "mock-accepted");
    await request(path, 200, "POST");
    assert.equal(calls.length, 2);
    assert.throws(() => db.prepare("UPDATE usage_submissions SET request = '{}' WHERE id = ?").run(accepted.id));
    const restarted = client(createApp(db));
    assert.deepEqual((await restarted(path, 200)).usageSubmission, accepted);
  } finally { db.close(); }
});

test("ambiguous errors are sanitized and interrupted attempts become unknown without retry", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    let calls = 0;
    let request = client(createApp(db, { allowTestVoyages: true, billingAdapter: {
      async submitUsage() { calls++; throw new Error("secret credential"); },
    } }));
    const voyage = await request("admin/voyages/test", 201, "POST", { ...selection, durationSeconds: 60 });
    const path = `admin/voyages/${voyage.id}/usage`;
    const unknown = await request(path, 200, "POST");
    assert.equal(unknown.usageSubmission?.status, "unknown");
    assert.ok(!JSON.stringify(unknown).includes("secret"));
    await request(path, 200, "POST");
    assert.equal(calls, 1);
    db.exec("UPDATE usage_submissions SET status = 'submitting'; UPDATE usage_attempts SET completedAt = NULL, outcome = NULL, error = NULL");
    request = client(createApp(db));
    const recovered = await request(path, 200, "POST");
    assert.equal(recovered.usageSubmission?.status, "unknown");
    assert.equal(recovered.usageSubmission?.attempts[0]?.outcome, "ambiguous");
    assert.equal(recovered.usageSubmission?.attempts.length, 1);
  } finally { db.close(); }
});

function client(app: ReturnType<typeof createApp>) {
  return async function request<T = Voyage>(path: string, status: number, method = "GET", body?: object) {
    const response = await app.request(`/api/${path}`, {
      method,
      ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  };
}

test("persists active voyages and completes them once using their original context and the server clock", async () => {
  const directory = mkdtempSync(join(tmpdir(), "porthopper-voyages-"));
  const file = join(directory, "test.sqlite");
  let db = new DatabaseSync(file);
  let timestamp = Date.parse("2026-01-01T01:00:00.000Z");
  const now = () => timestamp;
  try {
    initializeDatabase(db);
    let request = client(createApp(db, { now }));
    const active = await request("voyages", 201, "POST", { ...selection, durationSeconds: 9000 });
    assert.equal(active.status, "Active");
    assert.equal(active.startedAt, "2026-01-01T01:00:00.000Z");
    assert.equal(active.durationSeconds, null);
    assert.equal(active.billingCountry, "GB");
    assert.equal(active.performanceCountry, "DE");
    assert.equal(active.taxLocation, null);
    await request("voyages", 409, "POST", selection);

    db.exec(`
      UPDATE customers SET name = 'Renamed Player', billingCountry = 'NL' WHERE id = 'CUS-1002';
      UPDATE ports SET name = 'Renamed Port', countryCode = 'SE' WHERE id = 'PRT-1001';
      UPDATE vessels SET name = 'Renamed Vessel', productKey = 'new-product' WHERE id = 'VSL-1001';
      DELETE FROM vessel_ports WHERE portId = 'PRT-1001' AND vesselId = 'VSL-1001';
    `);
    db.close();
    db = new DatabaseSync(file);
    request = client(createApp(db, { now }));
    assert.deepEqual(await request(`voyages/${active.id}`, 200), active);

    timestamp += 61_250;
    const completed = await request(`voyages/${active.id}/end`, 200, "POST");
    assert.deepEqual(completed, {
      ...active, status: "Completed", endedAt: "2026-01-01T01:01:01.250Z",
      durationSeconds: 61.25, measuredMinutes: 61.25 / 60,
    });
    timestamp += 10_000;
    assert.deepEqual(await request(`voyages/${active.id}/end`, 200, "POST"), completed);
    assert.deepEqual((await request<Voyages>("voyages", 200)).voyages, [completed]);
    await request("voyages", 201, "POST", { ...selection, portId: "PRT-1002" });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects unavailable or inactive selections and gates synthetic completed voyages", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    let request = client(createApp(db));
    await request("voyages", 422, "POST", { ...selection, portId: "PRT-1004" });
    await request("voyages", 422, "POST", { ...selection, playerId: "CUS-1006" });
    db.exec("UPDATE ports SET status = 'Inactive' WHERE id = 'PRT-1002'");
    await request("voyages", 422, "POST", { ...selection, portId: "PRT-1002" });
    await request("voyages/missing/end", 404, "POST");
    const path = "admin/voyages/test";
    const input = { ...selection, durationSeconds: 0.125 };
    await request(path, 404, "POST", input);
    assert.equal((await request<Voyages>("voyages", 200)).canCreateTestVoyage, false);

    request = client(createApp(db, { allowTestVoyages: true, now: () => Date.parse("2026-01-01T00:00:00Z") }));
    await request(path, 422, "POST", { ...input, durationSeconds: -1 });
    await request(path, 422, "POST", { ...input, durationSeconds: 0.0001 });
    const created = await request(path, 201, "POST", input);
    assert.equal(created.isTest, true);
    assert.equal(created.status, "Completed");
    assert.equal(created.durationSeconds, 0.125);
    assert.equal(created.startedAt, "2025-12-31T23:59:59.875Z");
    assert.equal(created.endedAt, "2026-01-01T00:00:00.000Z");
    assert.equal((await request<Voyages>("voyages", 200)).canCreateTestVoyage, true);
  } finally {
    db.close();
  }
});
