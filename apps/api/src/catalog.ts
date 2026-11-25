import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, Hono } from "hono";
import type { CatalogFieldErrors } from "../../../packages/shared/catalog.ts";
import { isCountryCode } from "../../../packages/shared/countries.ts";

export function registerCatalogRoutes(app: Hono, db: DatabaseSync) {
  const findPort = db.prepare("SELECT id FROM ports WHERE id = ?");
  const clearPorts = db.prepare("DELETE FROM vessel_ports WHERE vesselId = ?");
  const assignPort = db.prepare("INSERT INTO vessel_ports (vesselId, portId) VALUES (?, ?)");

  for (const kind of ["ports", "vessels"] as const) {
    const isPort = kind === "ports";
    const label = isPort ? "Port" : "Vessel";
    const prefix = isPort ? "PRT" : "VSL";
    const other = isPort ? "vessels" : "ports";
    const [ownId, otherId] = isPort ? ["portId", "vesselId"] : ["vesselId", "portId"];
    const columns = ["name", "description", "status", ...(isPort
      ? ["countryCode"] : ["category", "productKey", "instellixProductId"])];
    const list = db.prepare(`SELECT id, ${columns.join(", ")} FROM ${kind} ORDER BY name, id`);
    const get = db.prepare(`SELECT id, ${columns.join(", ")} FROM ${kind} WHERE id = ?`);
    const related = db.prepare(`
      SELECT r.id, r.name, r.status FROM ${other} r
      JOIN vessel_ports a ON r.id = a.${otherId} WHERE a.${ownId} = ? ORDER BY r.name, r.id
    `);
    const insert = db.prepare(`INSERT INTO ${kind} (${columns.join(", ")}, id) VALUES (${columns.map(() => "?").join(", ")}, ?)`);
    const update = db.prepare(`UPDATE ${kind} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`);
    const path = `/api/${kind}`;

    app.get(path, (c) => c.json(list.all()));
    app.get(`${path}/:id`, (c) => {
      const id = c.req.param("id");
      const record = get.get(id);
      return record ? c.json({ record, assignments: related.all(id) }) : c.json({ error: `${label} not found` }, 404);
    });

    async function save(c: Context, id?: string) {
      if (c.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return c.json({ error: "Expected JSON" }, 415);
      }
      let body: Record<string, unknown>;
      try {
        const value: unknown = await c.req.json();
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return c.json({ error: "Expected an object" }, 400);
        }
        body = value as Record<string, unknown>;
      } catch {
        return c.json({ error: "Invalid JSON" }, 400);
      }

      const fields: CatalogFieldErrors = {};
      function text(key: keyof CatalogFieldErrors, max: number, required = false) {
        const raw = body[key];
        const value = typeof raw === "string" ? raw.trim() : "";
        if ((raw != null && typeof raw !== "string") || (required && !value) || value.length > max) {
          fields[key] = `Enter ${required ? "text" : "no more than"}${required ? " of up to" : ""} ${max} characters.`;
        }
        return value || null;
      }
      const name = text("name", 120, true);
      const description = text("description", 1000);
      const status = body.status;
      if (status !== "Active" && status !== "Inactive") fields.status = "Select a status.";
      const values = [name, description, typeof status === "string" ? status : null];
      const portIds = new Set<string>();
      if (isPort) {
        const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
        if (!isCountryCode(countryCode)) fields.countryCode = "Select a valid country.";
        values.push(countryCode);
      } else {
        values.push(text("category", 80, true), text("productKey", 120, true), text("instellixProductId", 120));
        if (!Array.isArray(body.portIds)) fields.portIds = "Select existing ports.";
        else for (const portId of body.portIds) {
          if (typeof portId !== "string" || !findPort.get(portId)) {
            fields.portIds = "One or more selected ports do not exist.";
            break;
          }
          portIds.add(portId);
        }
      }
      if (Object.keys(fields).length) return c.json({ fields }, 422);

      const recordId = id ?? `${prefix}-${randomUUID()}`;
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = (id ? update : insert).run(...values, recordId);
        if (result.changes === 0) {
          db.exec("ROLLBACK");
          return c.json({ error: `${label} not found` }, 404);
        }
        if (!isPort) {
          clearPorts.run(recordId);
          for (const portId of portIds) assignPort.run(recordId, portId);
        }
        const record = get.get(recordId);
        const assignments = related.all(recordId);
        db.exec("COMMIT");
        return c.json({ record, assignments }, id ? 200 : 201);
      } catch (error) {
        db.exec("ROLLBACK");
        if (error instanceof Error && "errcode" in error && error.errcode === 2067) {
          return c.json({ fields: { name: isPort ? "A port with this name already exists in this country." : "A vessel with this name already exists." } }, 409);
        }
        throw error;
      }
    }

    app.post(path, (c) => save(c));
    app.put(`${path}/:id`, (c) => save(c, c.req.param("id")));
  }
}
