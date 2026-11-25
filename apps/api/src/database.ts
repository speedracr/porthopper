import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const directory = new URL("../data/", import.meta.url);

export function openDatabase(readOnly: boolean) {
  if (!readOnly) mkdirSync(directory, { recursive: true });
  return new DatabaseSync(fileURLToPath(new URL("porthopper.sqlite", directory)), { readOnly });
}
