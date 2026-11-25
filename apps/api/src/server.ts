import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDatabase } from "./database.ts";
import { schemaVersion } from "./initialize-database.ts";

function openInitializedDatabase() {
  try {
    const database = openDatabase(false);
    if (database.prepare("PRAGMA user_version").get()?.user_version === schemaVersion) return database;
    database.close();
  } catch {
    // Use the same actionable startup message for a missing or unreadable database.
  }
  throw new Error("Port Hopper database unavailable. Run npm run db:init first.");
}

const app = createApp(openInitializedDatabase());
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3001 }, ({ port }) => {
  console.log(`Port Hopper API listening on http://127.0.0.1:${port}`);
});
