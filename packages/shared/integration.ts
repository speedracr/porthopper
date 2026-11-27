export type IntegrationTraceEntry = (
  | { stage: "auth"; method: "POST"; path: "/{realm}/oauth2/token" }
  | { stage: "read-only"; method: "GET"; path: "/v2/translation-locales" }
) & {
  status: number | null;
  durationMs: number;
  outcome: "success" | "rejected" | "invalid_response" | "timeout" | "network";
  upstreamErrorId?: string;
};

export interface IntegrationStatus {
  mode: "mock" | "live";
  status: "not_checked" | "connected" | "failed" | "disabled";
  lastSuccessfulCheck: string | null;
  error: string | null;
  trace: IntegrationTraceEntry[];
}
