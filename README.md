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

Use Node.js 22.12+ and run `npm ci` from the repository root. Initialize the SQLite database and seed seven fictional customers:

```sh
npm run db:init
```

You can rerun this command without overwriting existing customer records. The database is stored in `apps/api/data/porthopper.sqlite`.

If upgrading from Step 2, stop the API and rerun `npm run db:init` to migrate existing customer country names to ISO country codes before restarting.

Start the API and Admin in separate terminals:

```sh
npm run dev:api
npm run dev:admin
```

Open the local URL printed by Vite. Admin proxies `/api` to the loopback-only API on port 3001. Customer data comes from SQLite.
