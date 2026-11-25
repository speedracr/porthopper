# Product Requirements Document

## Goal

An Admin operator can trace a player's measured Active Play Time from a Play Session to its billing submission and recover from a failed handoff. The first slice runs locally with one synthetic player linked to one fictional customer account.

## Workflow

1. A synthetic client starts a Play Session through the backend API and sends activity signals every 10 seconds while the player is active.
2. The backend records Active Play Time in whole seconds. The player can end the session explicitly. After 30 seconds without an accepted signal, the session expires and the client must start a new one.
3. A finalized session with positive usage produces one Play Time Usage Record, which the backend submits to the mock billing adapter.
4. Admin opens to a Play Sessions table showing player, customer account, session status, recorded time, and billing status. Billing status is **Pending** while awaiting submission, **No usage** for finalized zero-second sessions, and **Submitted** or **Failed** after the adapter responds. **Retry** is available for failed submissions.

## Acceptance criteria

- A second session start for the same player conflicts while the first session is active. A replay of the original start returns the original session.
- Signals at 0, 10, and 20 seconds record 20 seconds of usage. Replaying an accepted signal leaves the total unchanged.
- An accepted signal adds at most 10 seconds. A gap of 30 seconds or more adds zero seconds, expires the session, and requires a new session. The backend expires abandoned sessions without further client requests.
- Ending or expiring a session adds no time after its last accepted signal. A zero-second session produces no submission.
- Repeated finalization creates at most one usage record. After a simulated submission failure, Admin shows **Failed**. Retrying uses the same record ID and quantity and shows **Submitted** after success.
- Session totals and billing status survive a backend restart. The workflow runs locally without Instellix credentials.

## Scope

The first slice covers local metering, a mock billing handoff, and the Admin session table. The game is represented by synthetic API requests. Fleet and customer management, dashboards and charts, manual adjustments, authentication and roles, shared environments, live Instellix access, rating, invoices, and one-time purchases are deferred.
