# Port Hopper: Project Status

## Current state

Steps 1–6 remain functional: persistent player/catalog/voyage management, historical sessions, precise usage snapshots, mock submission, safe retries, and conservative unknown-outcome handling.

Latest increment: **Step 7A — read-only Instellix connectivity**.

- Server-only environment configuration defaults to mock. Live checks require complete tenant settings and explicit connectivity approval.
- OAuth client credentials use documented HTTP Basic authentication and multipart form data. Tokens are cached in memory with expiry skew; concurrent checks share one operation.
- An explicit Admin check calls only `GET /v2/translation-locales` with `tenant-management-read`. Redirects are rejected; requests have timeouts and no automatic retries.
- Configuration shows mode, connection status, last success, and actionable sanitized errors. Credentials, tokens, and upstream response bodies are never returned.
- Usage submission remains mock even when connectivity mode is live.

## Verification

18 API tests passed, including real loopback HTTP simulations of OAuth, caching/renewal, concurrency, failure classification, redirects, timeouts, and sanitization. API/Admin TypeScript checks, Admin production build, and whitespace checks passed. Security/UI source review found no concrete issues; no browser visual verification performed.

## Limitations and decisions

No live tenant requests performed. Company approval and actual staging URL/realm/version/permission verification remain pending. Live connectivity remains disabled by default. Configure secrets outside Git using the README variable list; `.env` files are not automatically loaded. Status and tokens reset on restart.

The application remains local and unauthenticated. No live usage, synchronization, invoices, payments, background jobs, or gameplay changes were added. Existing unknown usage outcomes still require future reconciliation.

## Next increment

**Step 7B:** agree its scope and required tenant mappings/permissions before implementation. Do not enable live operations until approval and tenant compatibility are confirmed.
