import { openDatabase } from "./database.ts";
import { initializeDatabase } from "./initialize-database.ts";

const db = openDatabase(false);
try {
  initializeDatabase(db);
  console.log("Port Hopper database initialized.");
} finally {
  db.close();
}
