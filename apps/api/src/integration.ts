import type { IntegrationStatus, IntegrationTraceEntry } from "../../../packages/shared/integration.ts";

export interface IntegrationOptions {
  env?: NodeJS.ProcessEnv;
  /** Test transport only: never enabled by environment configuration. */
  allowLoopbackHttpForTests?: boolean;
  now?: () => number;
  timeoutMs?: number;
}

// Only locally constructed failures may supply public error text.
class IntegrationFailure extends Error {}
const invalidResponse = () => new IntegrationFailure("Invalid integration response. Verify API compatibility.");

const traceStages = {
  auth: { stage: "auth", method: "POST", path: "/{realm}/oauth2/token" },
  "read-only": { stage: "read-only", method: "GET", path: "/v2/translation-locales" },
} as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readUpstreamErrorId(response: Response): Promise<string | undefined> {
  const reader = response.body?.locked ? undefined : response.body?.getReader();
  if (!reader) return;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  let expired = false;
  const deadline = setTimeout(() => { expired = true; cancel(); }, 250);
  try {
    const bytes = new Uint8Array(8 * 1024);
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (expired) return;
      if (done) break;
      if (value.length > bytes.length - size) return;
      bytes.set(value, size);
      size += value.length;
    }
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
    if (data && typeof data === "object" && !Array.isArray(data) && "uuid" in data
      && typeof data.uuid === "string" && data.uuid.length === 36 && uuidPattern.test(data.uuid)) return data.uuid;
  } catch {
    // Correlation is optional; the HTTP status remains authoritative.
  } finally {
    clearTimeout(deadline);
    cancel();
  }
}

export function createIntegration(options: IntegrationOptions = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const mode = env.INSTELLIX_MODE ?? "mock";
  let blocked: string | null = null;
  let origin = "";
  const realm = env.INSTELLIX_REALM ?? "";
  const clientId = env.INSTELLIX_CLIENT_ID ?? "";
  const clientSecret = env.INSTELLIX_CLIENT_SECRET ?? "";
  if (mode !== "mock" && mode !== "live") blocked = "Invalid integration mode.";
  else if (mode === "live") {
    if (env.INSTELLIX_CONNECTIVITY_APPROVED !== "true") blocked = "Connectivity approval required.";
    else {
      try {
        const raw = env.INSTELLIX_API_BASE_URL ?? "";
        const url = new URL(raw);
        const testHttp = options.allowLoopbackHttpForTests === true && url.protocol === "http:"
          && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
        if ((!testHttp && url.protocol !== "https:") || url.username || url.password
          || url.search || url.hash || url.pathname !== "/" || raw.includes("?") || raw.includes("#")
          || !/^https?:\/\/[^/]+\/?$/.test(raw)
          || !/^[A-Za-z0-9_-]+$/.test(realm) || !clientId.trim() || clientId.includes(":") || !clientSecret.trim()) throw new Error();
        origin = url.origin;
      } catch { blocked = "Invalid or incomplete integration configuration."; }
    }
  }
  let state: IntegrationStatus = {
    mode: mode === "live" ? "live" : "mock",
    status: mode === "mock" || blocked ? "disabled" : "not_checked",
    lastSuccessfulCheck: null,
    error: blocked,
    trace: [],
  };
  let token: { value: string; expiresAt: number } | undefined;

  let checkFlight: Promise<IntegrationStatus> | undefined;

  async function jsonRequest<T>(trace: IntegrationTraceEntry[], key: keyof typeof traceStages,
    url: string, init: RequestInit, validate: (value: unknown) => T): Promise<T> {
    const signal = AbortSignal.timeout(options.timeoutMs ?? 5000);
    const authentication = key === "auth";
    const stage = authentication ? "Authentication" : "Read-only check";
    const startedAt = performance.now();
    const entry: IntegrationTraceEntry = { ...traceStages[key], status: null, durationMs: 0, outcome: "network" };
    try {
      const response = await fetch(url, { ...init, method: entry.method, redirect: "error", signal });
      entry.status = response.status;
      if (response.status !== 200) {
        entry.outcome = "rejected";
        let message = "Integration request failed. Try again later.";
        if (response.status === 400) {
          message = authentication
            ? "Token request rejected. Verify the OAuth realm and client configuration."
            : "Read request rejected. Verify endpoint compatibility with the tenant API version.";
        } else if (response.status >= 500) {
          message = "Upstream service unavailable or failed. Check the staging service status before retrying.";
        } else if (response.status === 401) {
          token = undefined;
          message = authentication
            ? "Authentication rejected. Check configured client credentials."
            : "Access token expired or rejected. Run the check again to renew it.";
        } else if (response.status === 403) {
          message = authentication
            ? "Authentication forbidden. Check configured client credentials and client access."
            : "Access forbidden. Check the tenant-management-read scope.";
        } else if (response.status === 404) {
          message = "Integration endpoint unavailable. Verify the API base URL, realm, and API version.";
        } else if (response.status === 429) {
          message = "Integration request throttled. Try again later.";
        }
        if (response.status >= 400) {
          const id = await readUpstreamErrorId(response);
          if (id !== undefined) entry.upstreamErrorId = id;
        } else {
          void response.body?.cancel().catch(() => {});
        }
        throw new IntegrationFailure(`${stage} (HTTP ${response.status}): ${message}`);
      }
      let value: unknown;
      try { value = await response.json(); }
      catch (error) {
        if (signal.aborted) throw error;
        throw invalidResponse();
      }
      const result = validate(value);
      entry.outcome = "success";
      return result;
    } catch (error) {
      if (entry.outcome === "rejected") throw error;
      if (error instanceof IntegrationFailure) {
        entry.outcome = "invalid_response";
        throw new IntegrationFailure(`${stage}: ${error.message}`);
      }
      entry.outcome = signal.aborted ? "timeout" : "network";
      throw new IntegrationFailure(`${stage}: ${signal.aborted
        ? "Integration request timed out. Try again later."
        : "Integration network request failed. Check connectivity and endpoint configuration; redirects are not allowed."}`);
    } finally {
      entry.durationMs = Math.round(performance.now() - startedAt);
      trace.push(entry);
    }
  }

  async function getToken(trace: IntegrationTraceEntry[]): Promise<string> {
    if (token && token.expiresAt > now()) return token.value;
    const form = new FormData();
    form.set("grant_type", "client_credentials");
    const startedAt = now();
    token = await jsonRequest(trace, "auth", `${origin}/${realm}/oauth2/token`, {
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }, body: form,
    }, (value) => {
      const invalidToken = () => new IntegrationFailure("Invalid token response. Verify API compatibility.");
      if (!value || typeof value !== "object") throw invalidToken();
      const data = value as Record<string, unknown>;
      if (typeof data.access_token !== "string" || !/^[A-Za-z0-9\-._~+/]+=*$/.test(data.access_token)
        || typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer"
        || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0
        || data.expires_in > Number.MAX_SAFE_INTEGER / 1000) throw invalidToken();
      const lifetime = data.expires_in * 1000;
      return { value: data.access_token, expiresAt: startedAt + lifetime - Math.min(30_000, lifetime * 0.1) };
    });
    return token.value;
  }

  function snapshot(completed = state): IntegrationStatus {
    return { ...completed, trace: completed.trace.map((entry) => ({ ...entry })) };
  }

  return {
    status: () => snapshot(),
    async check(): Promise<IntegrationStatus> {
      if (state.status === "disabled") return snapshot();
      checkFlight ??= (async () => {
        const trace: IntegrationTraceEntry[] = [];
        try {
          const accessToken = await getToken(trace);
          await jsonRequest(trace, "read-only", `${origin}${traceStages["read-only"].path}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }, (value) => {
            if (!value || typeof value !== "object" || !("locales" in value)
              || !Array.isArray(value.locales) || !value.locales.every((locale: unknown) => typeof locale === "string")) {
              throw new IntegrationFailure("Invalid locales response. Verify API compatibility.");
            }
          });
          state = { ...state, trace, status: "connected", lastSuccessfulCheck: new Date(now()).toISOString(), error: null };
        } catch (error) {
          state = { ...state, trace, status: "failed", error: error instanceof IntegrationFailure
            ? error.message : "Integration connectivity check failed." };
        }
        return state;
      })().finally(() => { checkFlight = undefined; });
      return snapshot(await checkFlight);
    },
  };
}
