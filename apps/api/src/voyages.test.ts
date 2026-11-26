import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Voyage, Voyages } from "../../../packages/shared/voyages.ts";
import { createApp } from "./app.ts";
import { initializeDatabase } from "./initialize-database.ts";

const selection = { playerId: "CUS-1002", portId: "PRT-1001", vesselId: "VSL-1001" };

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
