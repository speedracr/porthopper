import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CatalogDetail, CatalogRecord } from "../../../packages/shared/catalog.ts";
import { createApp } from "./app.ts";
import { initializeDatabase } from "./initialize-database.ts";

function client(db: DatabaseSync) {
  const app = createApp(db);
  return async function request<T = CatalogDetail>(path: string, status: number, body?: object, method = "POST") {
    const response = await app.request(`/api/${path}`, body && {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  };
}

test("upgrades customer databases and seeds the catalog without overwriting edits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "porthopper-"));
  const file = join(directory, "test.sqlite");
  let db = new DatabaseSync(file);
  try {
    for (const migration of ["001-customers.sql", "002-customer-country-codes.sql"]) {
      db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
    }
    db.exec("PRAGMA user_version = 2");
    db.exec(readFileSync(new URL("../seed.sql", import.meta.url), "utf8"));
    db.exec("UPDATE customers SET name = 'Edited Player' WHERE id = 'CUS-1001'");

    initializeDatabase(db);
    let request = client(db);
    assert.equal((await request<{ name: string }>("customers/CUS-1001", 200)).name, "Edited Player");
    assert.deepEqual((await request<CatalogRecord[]>("ports", 200)).map((port) => port.name),
      ["Gothenburg", "Hamburg", "Rotterdam", "Southampton"]);
    assert.equal((await request<CatalogRecord[]>("vessels", 200)).length, 3);
    await request("vessels/VSL-1001", 200, {
      name: "Harbor Wren II", category: "Tugboat", status: "Inactive", productKey: "tugboat", portIds: [],
    }, "PUT");

    db.close();
    db = new DatabaseSync(file);
    initializeDatabase(db);
    request = client(db);
    const persisted = await request("vessels/VSL-1001", 200);
    assert.equal(persisted.record.name, "Harbor Wren II");
    assert.equal(persisted.record.status, "Inactive");
    assert.deepEqual(persisted.assignments, []);
    const customer = {
      name: "Test Player", username: "test_player", email: "test@players.example",
      residenceCountry: "DE", billingCountry: "NL", status: "Active",
    };
    const created = await request<{ id: string }>("customers", 201, customer);
    const edited = await request<typeof customer>(`customers/${created.id}`, 200, { ...customer, status: "Suspended" }, "PUT");
    assert.equal(edited.status, "Suspended");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates and edits ports and vessels with validated many-to-many assignments", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const request = client(db);
    const port = { name: "Bergen", countryCode: "no", status: "Active", description: "West coast" };
    await request("ports", 422, { ...port, countryCode: "ZZ" });
    const { record: createdPort } = await request("ports", 201, port);
    assert.ok("countryCode" in createdPort);
    assert.equal(createdPort.countryCode, "NO");
    await request("ports", 409, { ...port, name: " bergen " });
    await request(`ports/${createdPort.id}`, 200, { ...port, name: "Bergen Harbor", status: "Inactive" }, "PUT");

    const vessel = {
      name: "Fjord Finch", category: "Tugboat", status: "Active", productKey: "tugboat",
      instellixProductId: "mock-tug", portIds: [createdPort.id, "PRT-1001", "PRT-1001"],
    };
    const { record, assignments } = await request("vessels", 201, vessel);
    assert.ok("instellixProductId" in record);
    assert.equal(record.instellixProductId, "mock-tug");
    assert.notEqual(record.id, record.instellixProductId);
    assert.deepEqual(assignments.map(({ name }) => name), ["Bergen Harbor", "Hamburg"]);
    assert.equal((await request("ports/PRT-1001", 200)).assignments.length, 3);
    await request("vessels", 409, { ...vessel, name: "FJORD FINCH" });
    await request(`vessels/${record.id}`, 422, { ...vessel, name: "Rejected", portIds: ["missing"] }, "PUT");
    assert.deepEqual(await request(`vessels/${record.id}`, 200), { record, assignments });
    await request(`vessels/${record.id}`, 200, { ...vessel, instellixProductId: "", portIds: ["PRT-1002"] }, "PUT");
    assert.equal((await request(`ports/${createdPort.id}`, 200)).assignments.length, 0);
    assert.ok((await request("ports/PRT-1002", 200)).assignments.some(({ id }) => id === record.id));
  } finally {
    db.close();
  }
});
