# Port Hopper

Port Hopper is a fictional, desktop-first maritime browser game with a separate business backend and admin dashboard. The project is intended to demonstrate usage-based billing integrations with Instellix (formerly Nitrobox).

## Repository structure

- `apps/admin` — operations dashboard workspace
- `apps/game` — maritime game workspace
- `apps/api` — business backend workspace
- `packages/shared` — shared types and validated contracts when needed
- `docs` — product and architecture specifications
- `design/mockups` — frontend reference screenshots

## Run locally

Use Node.js 22.12+ and run `npm ci` from the repository root. Initialize the SQLite database and seed seven fictional customers, four ports, and three fictional vessels:

```sh
npm run db:init
```

You can rerun this command without overwriting existing records or restoring removed vessel assignments. The database is stored in `apps/api/data/porthopper.sqlite`.

If upgrading an existing database, stop the API and rerun `npm run db:init` before restarting.

Start the API and Admin in separate terminals:

```sh
npm run dev:api
npm run dev:admin
```

Open the local URL printed by Vite. Admin proxies `/api` to the loopback-only API on port 3001. Customer, port, and vessel data comes from SQLite.

Open **Configuration → Ports** or **Configuration → Vessels** to create and edit records. Set availability using **Assigned ports** on the vessel form. Inactive records remain linked until you remove their assignments.

### Voyages

Open **Voyages → Start voyage** and select an active player, port, and available vessel. Use **End voyage** on the detail page to record elapsed time. Times are UTC; elapsed duration is stored at millisecond precision and converted to measured minutes without billing rounding.

To enable **Create test voyage**, start the local API with `PORT_HOPPER_TEST_VOYAGES=1 npm run dev:api`. The administrative test endpoint is disabled by default. This flag is not authentication: keep the API and Admin proxy local. Choose a start date/time in the selected port's time zone and a duration in minutes; the form calculates the end time. Historical dates and periods spanning months or years are supported. Nonexistent or ambiguous daylight-saving times are rejected. Completed voyages can be edited until usage submission begins.

### Mock usage submission

On a completed voyage with positive duration, choose **Submit usage**. The backend persists an immutable snapshot and stable external usage identifier before contacting the server-side mock adapter. The detail page shows the result and attempt history. Accepted usage cannot be submitted again; **Retry** is available only after confirmed failure and reuses the original snapshot. Unknown outcomes require reconciliation and cannot be retried through Admin.

The mock accepts usage by default and returns a synthetic receipt reference. To exercise failures locally, start the API with `PORT_HOPPER_MOCK_USAGE_SCENARIO=reject`, `temporary`, or `ambiguous` (for example, `PORT_HOPPER_MOCK_USAGE_SCENARIO=temporary npm run dev:api`). Restart without that variable to retry a confirmed failure successfully. These controls are server-side only and are prohibited under `NODE_ENV=production`. The usage adapter makes no external requests and performs no rating, invoicing, or payments. All Admin operations remain local and unauthenticated in this increment.

### Instellix connectivity (Step 7A)

**Configuration → Instellix** shows integration mode, connection status, last successful check, and sanitized errors. **Test connection** performs only authentication and a fixed read-only configuration request. Status and access tokens are held in backend memory and reset on restart. Existing usage submission always uses the mock adapter, including when connectivity mode is live.

Mock is the default and sends no requests. No staging tenant has been contacted or verified. Before enabling live connectivity, obtain company approval for external connectivity and AI-assisted integration work, then confirm the tenant's exact staging API origin, OAuth realm, API version, and `tenant-management-read` permission with your authorized contact. Do not guess tenant settings or put them into issues, logs, or committed files.

Configure these **server process environment variables**, using `.env.example` only as a template:

| Variable | Value |
| --- | --- |
| `INSTELLIX_MODE` | `mock` (default) or `live` |
| `INSTELLIX_CONNECTIVITY_APPROVED` | `false` by default; set `true` only after approval and tenant compatibility checks |
| `INSTELLIX_API_BASE_URL` | Exact onboarding-provided HTTPS API origin, without a path, query, fragment, or embedded credentials |
| `INSTELLIX_REALM` | Onboarding-provided OAuth realm/tenant segment |
| `INSTELLIX_CLIENT_ID` | Server-only client ID |
| `INSTELLIX_CLIENT_SECRET` | Server-only client secret |

The API reads its process environment; it does not automatically load `.env` files. Supply values via your shell or approved secret tooling. Keep secrets out of frontend variables and Git. Incomplete or unapproved live configuration is disabled without network traffic. HTTP is permitted only through a code-injected loopback transport in automated tests, never by runtime environment configuration.

Public contracts verified for this increment:
- [Authentication](https://docs.instellix.io/reference/authentication): `POST /{realm}/oauth2/token`, HTTP Basic credentials and `application/x-www-form-urlencoded` with `grant_type=client_credentials`; cache `access_token` using `expires_in`.
- [Get Configured Locales](https://docs.instellix.io/reference/getlocales): `GET /v2/translation-locales`, `tenant-management-read`, response `{ locales: string[] }`. No customer, usage, billing, invoice, or payment records are requested. The response is validated and discarded.

Requests are bounded by timeouts and do not follow redirects. Concurrent checks share one operation. Authentication failures, denied scope, throttling, incompatible responses, and network errors have fixed sanitized messages. A read-check 401 invalidates the cached token; a subsequent manual check renews it. There are no automatic retries or startup connectivity checks. A successful check confirms only this endpoint's accessibility, not write permissions or broader integration readiness.
