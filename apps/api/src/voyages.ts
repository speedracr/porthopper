import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, Hono } from "hono";
import type { Voyage } from "../../../packages/shared/voyages.ts";

type VoyageRow = Omit<Voyage, "startedAt" | "endedAt" | "durationSeconds" | "measuredMinutes" | "status" | "isTest"> & {
  startedAtMs: number;
  endedAtMs: number | null;
  durationMs: number | null;
  isTest: number;
};

function toVoyage({ startedAtMs, endedAtMs, durationMs, isTest, ...context }: VoyageRow): Voyage {
  return {
    ...context,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: endedAtMs === null ? null : new Date(endedAtMs).toISOString(),
    durationSeconds: durationMs === null ? null : durationMs / 1000,
    measuredMinutes: durationMs === null ? null : durationMs / 60_000,
    status: endedAtMs === null ? "Active" : "Completed",
    isTest: isTest === 1,
  };
}

export function registerVoyageRoutes(app: Hono, db: DatabaseSync, {
  now = Date.now, allowTestVoyages = false,
}: { now?: () => number; allowTestVoyages?: boolean } = {}) {
  const path = "/api/voyages";
  const list = db.prepare("SELECT * FROM voyages ORDER BY startedAtMs DESC, id");
  const get = db.prepare("SELECT * FROM voyages WHERE id = ?");
  const insert = db.prepare(`
    INSERT INTO voyages (id, playerId, playerName, billingCountry, portId, portName, performanceCountry,
                        vesselId, vesselName, productKey, startedAtMs, endedAtMs, isTest)
    SELECT ?, c.id, c.name, c.billingCountry, p.id, p.name, p.countryCode,
           v.id, v.name, v.productKey, ?, ?, ?
    FROM vessel_ports a
    JOIN ports p ON p.id = a.portId
    JOIN vessels v ON v.id = a.vesselId
    JOIN customers c ON c.id = ?
    WHERE p.id = ? AND v.id = ? AND p.status = 'Active' AND v.status = 'Active' AND c.status = 'Active'
    RETURNING *
  `);
  const end = db.prepare(`
    UPDATE voyages SET endedAtMs = MAX(startedAtMs, ?)
    WHERE id = ? AND endedAtMs IS NULL RETURNING *
  `);

  app.get(path, (c) => c.json({ voyages: (list.all() as VoyageRow[]).map(toVoyage), canCreateTestVoyage: allowTestVoyages }));
  app.get(`${path}/:id`, (c) => {
    const row = get.get(c.req.param("id")) as VoyageRow | undefined;
    return row ? c.json(toVoyage(row)) : c.json({ error: "Voyage not found." }, 404);
  });
  app.post(`${path}/:id/end`, (c) => {
    const id = c.req.param("id");
    const row = (end.get(now(), id) ?? get.get(id)) as VoyageRow | undefined;
    return row ? c.json(toVoyage(row)) : c.json({ error: "Voyage not found." }, 404);
  });

  async function create(c: Context, isTest: boolean) {
    if (isTest && !allowTestVoyages) return c.json({ error: "Not found" }, 404);
    if (c.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return c.json({ error: "Expected JSON" }, 415);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Expected a voyage object" }, 400);
    const { playerId, portId, vesselId, durationSeconds } = body as Record<string, unknown>;
    const isId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 80;
    if (!isId(playerId) || !isId(portId) || !isId(vesselId)) {
      return c.json({ error: "Select a player, port, and vessel." }, 422);
    }
    const timestamp = now();
    const durationMs = typeof durationSeconds === "number" ? Math.round(durationSeconds * 1000) : NaN;
    if (isTest && (!Number.isSafeInteger(durationMs) || durationMs < 0 ||
        durationMs / 1000 !== durationSeconds || timestamp - durationMs < -8.64e15)) {
      return c.json({ error: "Enter a valid duration in seconds with up to three decimal places." }, 422);
    }
    try {
      const row = insert.get(`VYG-${randomUUID()}`, isTest ? timestamp - durationMs : timestamp,
        isTest ? timestamp : null, Number(isTest), playerId, portId, vesselId) as VoyageRow | undefined;
      if (!row) return c.json({ error: "Select an active player and a vessel available at an active port." }, 422);
      return c.json(toVoyage(row), 201);
    } catch (error) {
      if (error instanceof Error && "errcode" in error && error.errcode === 2067) {
        return c.json({ error: "This player already has an active voyage." }, 409);
      }
      throw error;
    }
  }

  app.post(path, (c) => create(c, false));
  app.post("/api/admin/voyages/test", (c) => create(c, true));
}
