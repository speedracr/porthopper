# Product Requirements Document

## Goal

An Admin operator can trace a player's measured Active Play Time from a Play Session to its billing submission and recover from a failed handoff. The first slice runs locally with one synthetic player linked to one fictional customer account.

## Billing model

Port Hopper is a B2C game. Each customer is an individual player with a game account who may consume paid gameplay services. Customer records include display name, username, email, country of residence, billing country, and account status. A record can also include a billing address when needed and an Instellix customer reference when available.

A voyage is a gameplay session. The player can end it at any time and the measured Active Play Time remains billable regardless of mission outcome. Billing is based on gameplay minutes rather than a count of voyages.

The selected vessel or vessel category determines the Instellix product used for rating. The harbor determines the service performance location. Customer billing country, service performance location, and tax location are separate concepts.

## Current increment: Step 6

The workflow below describes the eventual activity-signal model. Steps 5–6 currently use Admin-managed start/end and simulated completed voyages. Step 6 submits precise measured seconds explicitly from Admin, without billing-unit conversion or rounding. One persisted submission snapshot and external usage identifier are retained per voyage. Confirmed failures can be retried unchanged; accepted and uncertain outcomes cannot be resubmitted.

Administrators can create historical sessions using port-local date/time and duration in minutes, and edit completed sessions before submission. End time is derived in UTC; DST gaps and ambiguous local times are rejected. Submission freezes measured usage and its geographic context. Mock scenarios include acceptance, rejection, temporary failure, and ambiguous outcome; no real billing operations occur.

A future optional game **Time Machine** will select a fictional start time before gameplay while the backend measures actual elapsed duration independently. This is documentation only, not part of Step 6 implementation.

## Workflow

1. A synthetic client starts a Play Session through the backend API and sends activity signals every 10 seconds while the player is active.
2. The backend authoritatively measures Active Play Time. The browser timer is for display only. The player can end the session explicitly. After 30 seconds without an accepted signal, the session expires and the client must start a new one.
3. A finalized session with positive usage produces one Play Time Usage Record. The backend converts the measured duration to the configured billing unit (initially minutes), applies the configured rounding rule, and submits the quantity to the mock billing adapter.
4. Admin opens to a Play Sessions table showing player, customer account, session status, recorded time, and billing status. Billing status is **Pending** while awaiting submission, **No usage** for finalized zero-second sessions, and **Submitted** or **Failed** after the adapter responds. **Retry** is available for failed submissions.

## Acceptance criteria

- A second session start for the same player conflicts while the first session is active. A replay of the original start returns the original session.
- Signals at 0, 10, and 20 seconds record 20 seconds of usage. Replaying an accepted signal leaves the total unchanged.
- An accepted signal adds at most 10 seconds. A gap of 30 seconds or more adds zero seconds, expires the session, and requires a new session. The backend expires abandoned sessions without further client requests.
- Ending or expiring a session adds no time after its last accepted signal. A zero-second session produces no submission.
- Ending a session before mission completion preserves its measured time. The usage quantity follows the configured billing unit and rounding rule.
- Repeated finalization creates at most one usage record. After a simulated submission failure, Admin shows **Failed**. Retrying uses the same record ID and quantity and shows **Submitted** after success.
- Session totals and billing status survive a backend restart. The workflow runs locally without Instellix credentials.

## Scope

The first slice covers local metering, a mock billing handoff, and the Admin session table. The game is represented by synthetic API requests. Fleet and customer management, dashboards and charts, manual adjustments, authentication and roles, shared environments, live Instellix access, rating, invoices, and one-time purchases are deferred.

Periodic usage reporting is a future option. Future purchases are separate one-time charges or transactions.
