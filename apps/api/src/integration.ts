import type { IntegrationStatus } from "../../../packages/shared/integration.ts";

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
  };
  let token: { value: string; expiresAt: number } | undefined;
  let tokenFlight: Promise<string> | undefined;
  let checkFlight: Promise<IntegrationStatus> | undefined;

  async function jsonRequest(url: string, init: RequestInit, authentication = false): Promise<unknown> {
    const signal = AbortSignal.timeout(options.timeoutMs ?? 5000);
    try {
      const response = await fetch(url, { ...init, redirect: "error", signal });
      if (response.status !== 200) {
        let message = "Integration request failed. Try again later.";
        if (response.status === 401) {
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
        await response.body?.cancel();
        throw new IntegrationFailure(message);
      }
      try { return await response.json(); }
      catch (error) {
        if (signal.aborted) throw error;
        throw invalidResponse();
      }
    } catch (error) {
      if (error instanceof IntegrationFailure) throw error;
      throw new IntegrationFailure(signal.aborted
        ? "Integration request timed out. Try again later."
        : "Integration network request failed. Check connectivity and endpoint configuration; redirects are not allowed.");
    }
  }

  function getToken(): Promise<string> {
    if (token && token.expiresAt > now()) return Promise.resolve(token.value);
    if (tokenFlight) return tokenFlight;
    tokenFlight = (async () => {
      const form = new FormData();
      form.set("grant_type", "client_credentials");
      const startedAt = now();
      const value = await jsonRequest(`${origin}/${realm}/oauth2/token`, {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }, body: form,
      }, true);
      if (!value || typeof value !== "object") throw invalidResponse();
      const data = value as Record<string, unknown>;
      if (typeof data.access_token !== "string" || !/^[A-Za-z0-9\-._~+/]+=*$/.test(data.access_token)
        || typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer"
        || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0
        || data.expires_in > Number.MAX_SAFE_INTEGER / 1000) throw invalidResponse();
      const lifetime = data.expires_in * 1000;
      token = { value: data.access_token, expiresAt: startedAt + lifetime - Math.min(30_000, lifetime * 0.1) };
      return token.value;
    })().finally(() => { tokenFlight = undefined; });
    return tokenFlight;
  }

  return {
    status: (): IntegrationStatus => ({ ...state }),
    check(): Promise<IntegrationStatus> {
      if (state.status === "disabled") return Promise.resolve({ ...state });
      if (checkFlight) return checkFlight;
      checkFlight = (async () => {
        try {
          const accessToken = await getToken();
          const value = await jsonRequest(`${origin}/v2/translation-locales`, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!value || typeof value !== "object" || !("locales" in value)
            || !Array.isArray(value.locales) || !value.locales.every((locale: unknown) => typeof locale === "string")) throw invalidResponse();
          state = { ...state, status: "connected", lastSuccessfulCheck: new Date(now()).toISOString(), error: null };
        } catch (error) {
          state = { ...state, status: "failed", error: error instanceof IntegrationFailure
            ? error.message : "Integration connectivity check failed." };
        }
        return { ...state };
      })().finally(() => { checkFlight = undefined; });
      return checkFlight;
    },
  };
}
