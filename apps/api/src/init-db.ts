import { readFileSync } from "node:fs";
import { isCountryCode } from "../../../packages/shared/countries.ts";
import { openDatabase } from "./database.ts";

const db = openDatabase(false);
try {
  db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
  const migrations = ["001-customers.sql", "002-customer-country-codes.sql"];
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
  db.exec("COMMIT");
  console.log("Customer database initialized.");
} finally {
  db.close();
}
