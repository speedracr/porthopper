# Port Hopper: Project Status

## Current state

Steps 1–6 implemented. Persistent player, port, vessel, and voyage management remains functional.

Latest increment: mock billing integration and retroactive usage management.

- Admin creates historical completed voyages using port-local start time and minutes, with a calculated end time; completed voyages can be edited before submission.
- Initial four ports have stable IANA time zones. Invalid dates, DST gaps, and ambiguous times are rejected. UTC persistence and millisecond precision are retained.
- Admin submits positive measured usage and inspects identifiers, timestamps, status, and sanitized attempt history.
- SQLite enforces one submission per voyage; stable identifiers and immutable snapshots survive restarts. Confirmed failures retry the original snapshot. Accepted usage is not resubmitted.
- Ambiguous/interrupted attempts become `unknown`, with no retry action or automatic resubmission.
- Mock scenarios are configured server-side for acceptance, rejection, temporary failure, and ambiguity; no live requests occur.

## Verification

API and Admin TypeScript checks, 12 API tests, Admin production build, and diff whitespace checks passed. UI reviewed in code; no browser-based visual verification performed.

## Limitations and decisions

Local unauthenticated operation only. Keep API/proxy local. No billing rounding, pricing, tax determination, real Instellix integration, or background retries. Unknown outcomes need future reconciliation. Game activity-signal metering and Time Machine remain unimplemented; the latter is documented in PRD/architecture.

Run `npm run db:init` with the API stopped to migrate an existing database. See README for mock scenario controls.

## Next recommended increment

Confirm the Step 7 scope before implementation. Resolve authorized public Instellix API mapping and company-policy approval before any live integration.
