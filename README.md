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

The mock accepts usage by default and returns a synthetic receipt reference. To exercise failures locally, start the API with `PORT_HOPPER_MOCK_USAGE_SCENARIO=reject`, `temporary`, or `ambiguous` (for example, `PORT_HOPPER_MOCK_USAGE_SCENARIO=temporary npm run dev:api`). Restart without that variable to retry a confirmed failure successfully. These controls are server-side only and are prohibited under `NODE_ENV=production`. No rating, invoicing, payments, or external requests occur. All Admin operations remain local and unauthenticated in this increment.
