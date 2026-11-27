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
      assert.equal((await integration.check()).status, "disabled");
    }
    assert.equal(createIntegration({ env: env("http://remote.example"), allowLoopbackHttpForTests: true }).status().status, "disabled");
    assert.equal(calls, 0);
  } finally { await http.close(); }
});

test("real HTTP Basic multipart OAuth, fixed read, cache skew expiry and concurrent check singleflight", async () => {
  let auth = 0; let reads = 0; let clock = 1_000_000;
  const http = await server(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/synthetic-realm/oauth2/token") {
      auth++;
      assert.equal(req.method, "POST");
      assert.equal(req.headers.authorization, `Basic ${Buffer.from("synthetic-client:synthetic-secret").toString("base64")}`);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers["content-type"]! } });
      assert.match(req.headers["content-type"]!, /^multipart\/form-data;/);
      assert.equal((await body.formData()).get("grant_type"), "client_credentials");
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
    const results = await Promise.all(Array.from({ length: 10 }, () => integration.check()));
    assert.ok(results.every((result) => result.status === "connected"));
    assert.equal(auth, 1); assert.equal(reads, 1);
    await integration.check(); assert.equal(auth, 1);
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
    assert.equal(failed.error, "Access token expired or rejected. Run the check again to renew it.");
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
      assert.deepEqual(Object.keys(value).sort(), ["error", "lastSuccessfulCheck", "mode", "status"]);
      assert.equal(value.status, "failed");
      assert.match(value.error, scenario === "timeout" ? /timed out/ : scenario.includes("redirect")
        ? /network request failed/ : scenario.startsWith("bad-") ? /Invalid integration response/ : /request failed/);
      const serialized = JSON.stringify(value);
      for (const secret of ["synthetic-secret", "synthetic-token", "synthetic-client", http.origin]) assert.ok(!serialized.includes(secret));
      assert.equal(escaped, 0);
    } finally { db.close(); await http.close(); }
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
      assert.equal(result.error, message);
      assert.equal(auth, 1); assert.equal(reads, authentication ? 0 : 1);
      assert.deepEqual(integration.status(), result);
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
