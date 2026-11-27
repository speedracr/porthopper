export interface IntegrationStatus {
  mode: "mock" | "live";
  status: "not_checked" | "connected" | "failed" | "disabled";
  lastSuccessfulCheck: string | null;
  error: string | null;
}
