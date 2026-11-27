import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createIntegration } from "./integration.ts";
import { createApp } from "./app.ts";
import { initializeDatabase } from "./initialize-database.ts";

async function server(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const http = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => {
    http.close((error) => error ? reject(error) : resolve()); http.closeAllConnections();
  }) };
}
function env(origin: string): NodeJS.ProcessEnv {
  return { INSTELLIX_MODE: "live", INSTELLIX_CONNECTIVITY_APPROVED: "true", INSTELLIX_API_BASE_URL: origin,
    INSTELLIX_REALM: "synthetic-realm", INSTELLIX_CLIENT_ID: "synthetic-client", INSTELLIX_CLIENT_SECRET: "synthetic-secret" };
}
const token = { access_token: "synthetic-token", token_type: "bearer", expires_in: 100 };

test("configuration fails closed and mock checks remain disabled without outbound requests", async () => {
  let calls = 0;
  const http = await server((_req, res) => { calls++; res.end(); });
  try {
    for (const config of [{}, { ...env(http.origin), INSTELLIX_MODE: "invalid" },
      { ...env(http.origin), INSTELLIX_CONNECTIVITY_APPROVED: "false" }, env(http.origin),
      ...["https://user:password@host.example", "https://host.example/path", "https://host.example?", "https://host.example#", "not-url"].map((url) => env(url)),
      { ...env("https://host.example"), INSTELLIX_REALM: "../realm" },
      { ...env("https://host.example"), INSTELLIX_CLIENT_SECRET: "" }]) {
      const integration = createIntegration({ env: config });
      const result = await integration.check();
      assert.equal(result.status, "disabled");
      assert.deepEqual(result.trace, []);
    }
    assert.equal(createIntegration({ env: env("http://remote.example"), allowLoopbackHttpForTests: true }).status().status, "disabled");
    assert.equal(calls, 0);
  } finally { await http.close(); }
});

test("real HTTP Basic URL-encoded OAuth, fixed read, cache skew expiry and concurrent check singleflight", async () => {
  let auth = 0; let reads = 0; let clock = 1_000_000;
  const http = await server(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/synthetic-realm/oauth2/token") {
      auth++;
      assert.equal(req.method, "POST");
      assert.equal(req.headers.authorization, `Basic ${Buffer.from("synthetic-client:synthetic-secret").toString("base64")}`);
      if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers["content-type"] ?? "")) {
        res.writeHead(415).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      assert.deepEqual([...body], [["grant_type", "client_credentials"]]);
      res.end(JSON.stringify(token));
    } else {
      reads++; assert.equal(req.url, "/v2/translation-locales"); assert.equal(req.method, "GET");
      assert.equal(req.headers.authorization, "Bearer synthetic-token");
      res.end(JSON.stringify({ locales: ["en"] }));
    }
  });
  try {
    const integration = createIntegration({ env: env(http.origin), allowLoopbackHttpForTests: true, now: () => clock });
    assert.equal(integration.status().status, "not_checked");
    const checks = Array.from({ length: 10 }, () => integration.check());
    assert.deepEqual(integration.status().trace, []);
    const results = await Promise.all(checks);
    assert.ok(results.every((result) => result.status === "connected"), JSON.stringify(results[0]?.trace));
    assert.equal(auth, 1); assert.equal(reads, 1);
    const initial = results[0]!;
    assert.deepEqual(initial.trace.map(({ durationMs, ...entry }) => {
      assert.ok(Number.isInteger(durationMs) && durationMs >= 0);
      return entry;
    }), [
      { stage: "auth", method: "POST", path: "/{realm}/oauth2/token", status: 200, outcome: "success" },
      { stage: "read-only", method: "GET", path: "/v2/translation-locales", status: 200, outcome: "success" },
    ]);
    assert.ok(results.every((result) => JSON.stringify(result.trace) === JSON.stringify(initial.trace)));
    initial.trace[0]!.status = 999;
    assert.equal(results[1]!.trace[0]!.status, 200);
    assert.equal(integration.status().trace[0]!.status, 200);
    const cached = await integration.check(); assert.equal(auth, 1);
    assert.deepEqual(cached.trace.map(({ stage }) => stage), ["read-only"]);
    assert.deepEqual(integration.status(), cached);
    clock += 91_000;
    await integration.check(); assert.equal(auth, 2);
  } finally { await http.close(); }
});

test("401 invalidates without retries; a later manual check renews and failures preserve last success", async () => {
  let auth = 0; let reads = 0;
  const http = await server((req, res) => {
    if (req.url?.endsWith("/token")) { auth++; res.end(JSON.stringify(token)); }
    else { reads++; res.statusCode = reads === 2 ? 401 : 200; res.end(JSON.stringify({ locales: [] })); }
  });
  try {
    const integration = createIntegration({ env: env(http.origin), allowLoopbackHttpForTests: true });
    const success = await integration.check();
    const failed = await integration.check();
    assert.equal(failed.status, "failed"); assert.equal(failed.lastSuccessfulCheck, success.lastSuccessfulCheck);
    assert.equal(failed.error, "Read-only check (HTTP 401): Access token expired or rejected. Run the check again to renew it.");
    assert.equal(auth, 1); assert.equal(reads, 2);
    assert.equal((await integration.check()).status, "connected"); assert.equal(auth, 2); assert.equal(reads, 3);
  } finally { await http.close(); }
});

test("timeouts, redirects, invalid responses and raw errors stay sanitized through routes", async () => {
  for (const scenario of ["timeout", "redirect", "auth-redirect", "bad-token", "bad-locales", "raw-error"]) {
    let escaped = 0;
    const http = await server((req, res) => {
      if (req.url === "/leak") { escaped++; res.end("synthetic-secret"); return; }
      const isAuth = req.url?.endsWith("/token");
      if (scenario === "timeout") return;
      if ((scenario === "redirect" && !isAuth) || scenario === "auth-redirect") {
        res.writeHead(302, { Location: "/leak" }); res.end(); return;
      }
      if (scenario === "raw-error") { res.statusCode = 500; res.end("synthetic-secret synthetic-token"); return; }
      res.end(JSON.stringify(isAuth ? (scenario === "bad-token" ? { ...token, expires_in: "100" } : token) : { locales: [123] }));
    });
    const db = new DatabaseSync(":memory:");
    try {
      initializeDatabase(db);
      const app = createApp(db, undefined, { env: env(http.origin), allowLoopbackHttpForTests: true, timeoutMs: 50 });
      const initial = await app.request("/api/admin/integration");
      assert.equal((await initial.json()).status, "not_checked");
      const response = await app.request("/api/admin/integration/check", { method: "POST" });
      assert.equal(response.status, 200);
      const value = await response.json();
      assert.deepEqual(Object.keys(value).sort(), ["error", "lastSuccessfulCheck", "mode", "status", "trace"]);
      assert.equal(value.status, "failed");
      assert.match(value.error, scenario === "timeout" ? /timed out/ : scenario.includes("redirect")
        ? /network request failed/ : scenario.startsWith("bad-") ? /Invalid .* response/ : /HTTP 500/);
      const last = value.trace.at(-1);
      assert.equal(last.outcome, scenario === "timeout" ? "timeout" : scenario.includes("redirect")
        ? "network" : scenario.startsWith("bad-") ? "invalid_response" : "rejected");
      assert.equal(last.status, scenario.startsWith("bad-") ? 200 : scenario === "raw-error" ? 500 : null);
      const serialized = JSON.stringify(value);
      for (const secret of ["synthetic-secret", "synthetic-token", "synthetic-client", http.origin]) assert.ok(!serialized.includes(secret));
      assert.equal(escaped, 0);
    } finally { db.close(); await http.close(); }
  }
});

test("HTTP errors identify the failing stage and status without leaking upstream details", async () => {
  for (const authentication of [true, false]) {
    for (const status of [400, 500, 502, 503]) {
      const http = await server((req, res) => {
        if (req.url?.endsWith("/token") && !authentication) { res.end(JSON.stringify(token)); return; }
        res.statusCode = status;
        res.statusMessage = "synthetic-secret";
        res.setHeader("X-Request-Id", "synthetic-secret");
        res.end("synthetic-secret synthetic-token synthetic-client");
      });
      try {
        const integration = createIntegration({ env: env(http.origin), allowLoopbackHttpForTests: true });
        const result = await integration.check();
        assert.equal(result.status, "failed");
        assert.ok(result.error?.startsWith(`${authentication ? "Authentication" : "Read-only check"} (HTTP ${status}): `));
        assert.ok(!JSON.stringify(result).includes("synthetic-"));
        assert.ok(!JSON.stringify(result).includes(http.origin));
      } finally { await http.close(); }
    }
  }
});

test("HTTP failures have fixed actionable classifications without immediate retries", async () => {
  for (const [authentication, status, message] of [
    [true, 401, "Authentication rejected. Check configured client credentials."],
    [true, 403, "Authentication forbidden. Check configured client credentials and client access."],
    [false, 403, "Access forbidden. Check the tenant-management-read scope."],
    [false, 404, "Integration endpoint unavailable. Verify the API base URL, realm, and API version."],
    [false, 429, "Integration request throttled. Try again later."],
  ] as const) {
    let auth = 0; let reads = 0;
    const http = await server((req, res) => {
      const isAuth = req.url?.endsWith("/token");
      if (isAuth) auth++; else reads++;
      if (isAuth && !authentication) res.end(JSON.stringify(token));
      else { res.statusCode = status; res.end("synthetic-secret synthetic-token raw failure"); }
    });
    try {
      const integration = createIntegration({ env: env(http.origin), allowLoopbackHttpForTests: true });
      const result = await integration.check();
      assert.equal(result.status, "failed");
      assert.equal(result.error, `${authentication ? "Authentication" : "Read-only check"} (HTTP ${status}): ${message}`);
      assert.equal(auth, 1); assert.equal(reads, authentication ? 0 : 1);
      assert.deepEqual(integration.status(), result);
    } finally { await http.close(); }
  }
});

test("only a complete bounded error JSON body can supply a top-level UUID", async () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const marker = "synthetic-private-metadata";
  for (const scenario of ["valid", "invalid", "nested", "oversized", "stalled", "truncated"]) {
    const http = await server((req, res) => {
      if (req.url?.endsWith("/token")) { res.end(JSON.stringify(token)); return; }
      res.writeHead(503, marker, { "Content-Type": "application/json", "X-Request-Id": id });
      const body = JSON.stringify({
        ...(scenario === "nested" ? {} : { uuid: scenario === "invalid" ? `${id}\n` : id }),
        status: 200, message: marker, timestamp: marker, path: `/${marker}`, errors: [{ uuid: id, message: marker }],
        padding: scenario === "oversized" ? "x".repeat(9 * 1024) : "",
      });
      if (scenario === "stalled") { res.write(body); return; }
      res.end(scenario === "truncated" ? body.slice(0, -1) : body);
    });
    try {
      const integration = createIntegration({ env: env(http.origin), allowLoopbackHttpForTests: true, timeoutMs: 1000 });
      const result = await integration.check();
      assert.match(result.error ?? "", /^Read-only check \(HTTP 503\): Upstream service unavailable/);
      const entry = result.trace.at(-1)!;
      assert.equal(entry.status, 503);
      assert.equal(entry.outcome, "rejected");
      assert.equal(entry.upstreamErrorId, scenario === "valid" ? id : undefined);
      assert.ok(!JSON.stringify(result).includes(marker));
    } finally { await http.close(); }
  }
});

test("GET route returns the last successful check without making requests", async () => {
  let requests = 0;
  const http = await server((req, res) => {
    requests++;
    res.end(JSON.stringify(req.url?.endsWith("/token") ? token : { locales: ["en"] }));
  });
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const app = createApp(db, undefined, { env: env(http.origin), allowLoopbackHttpForTests: true });
    const checked = await (await app.request("/api/admin/integration/check", { method: "POST" })).json();
    assert.equal(checked.status, "connected");
    assert.equal(checked.error, null);
    assert.ok(checked.lastSuccessfulCheck);
    const response = await app.request("/api/admin/integration");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), checked);
    assert.equal(requests, 2);
  } finally { db.close(); await http.close(); }
});
