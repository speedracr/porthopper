import { readFileSync } from "node:fs";
import { isCountryCode } from "../../../packages/shared/countries.ts";
import type { DatabaseSync } from "node:sqlite";

const migrations = ["001-customers.sql", "002-customer-country-codes.sql", "003-ports-vessels.sql", "004-voyages.sql"];
export const schemaVersion = migrations.length;

export function initializeDatabase(db: DatabaseSync) {
  db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
  try {
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (typeof version !== "number" || version < 0 || version > migrations.length) {
      throw new Error("Unsupported database schema version");
    }
    for (const [index, filename] of migrations.entries()) {
      if (index < version) continue;
      db.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
      db.exec(`PRAGMA user_version = ${index + 1}`);
    }
    if (version < 2) {
      const countries = db.prepare("SELECT residenceCountry, billingCountry FROM customers").all();
      if (countries.some(({ residenceCountry, billingCountry }) =>
        !isCountryCode(String(residenceCountry)) || !isCountryCode(String(billingCountry)))) {
        throw new Error("Unrecognized legacy customer country. Customer migration was rolled back.");
      }
    }
    db.exec(readFileSync(new URL("../seed.sql", import.meta.url), "utf8"));
    if (version < 3) db.exec(readFileSync(new URL("../seed-catalog.sql", import.meta.url), "utf8"));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
