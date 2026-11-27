import { useFetcher } from "react-router";
import type { IntegrationStatus } from "../../../packages/shared/integration";

const statuses = { not_checked: "Not checked", connected: "Connected", failed: "Failed", disabled: "Disabled" };

export async function loadIntegration(): Promise<IntegrationStatus> {
  const response = await fetch("/api/admin/integration", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Response(null, { status: response.status });
  return response.json();
}

export async function testIntegration() {
  try {
    const response = await fetch("/api/admin/integration/check", { method: "POST" });
    if (response.ok) return { result: await response.json() as IntegrationStatus, error: null };
  } catch { /* Show a local transport error without exposing exception details. */ }
  return { result: null, error: "Unable to test connection. Try again." };
}

export function IntegrationConnection({ initial }: { initial: IntegrationStatus }) {
  const fetcher = useFetcher<typeof testIntegration>();
  const result = fetcher.data?.result ?? initial;
  const busy = fetcher.state !== "idle";
  return <section className="mt-6" aria-labelledby="integration-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="integration-heading">Instellix</h2>
      <fetcher.Form method="post">
        <button className="admin-action" disabled={busy || result.status === "disabled"}>
          {busy ? "Testing…" : "Test connection"}
        </button>
      </fetcher.Form>
    </div>
    <dl className="table-panel grid gap-5 p-5 sm:grid-cols-3" aria-live="polite">
      <div><dt>Integration mode</dt><dd>{result.mode === "mock" ? "Mock" : "Live"}</dd></div>
      <div><dt>Connection status</dt><dd>{statuses[result.status]}</dd></div>
      <div><dt>Last successful check</dt><dd>{result.lastSuccessfulCheck
        ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(result.lastSuccessfulCheck))} UTC`
        : "—"}</dd></div>
    </dl>
    {(fetcher.data?.error || result.error) && <p className="mt-3 text-sm text-red-700" role="alert">{fetcher.data?.error ?? result.error}</p>}
    {!fetcher.data?.error && result.trace?.length > 0 && <details className="table-panel mt-3">
      <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">Last connection trace</summary>
      <pre className="overflow-x-auto border-t bg-muted p-4 text-xs leading-relaxed" tabIndex={0} aria-label="Last connection trace"><code>{JSON.stringify(result.trace, null, 2)}</code></pre>
    </details>}
  </section>;
}
