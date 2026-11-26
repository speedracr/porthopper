# Architecture

## Components and ownership

- **Admin** uses React and TypeScript and accesses session and billing status through the Port Hopper backend.
- **Backend** uses strict TypeScript with Hono as the preferred HTTP framework. It owns player-to-customer associations, voyages (Play Sessions), authoritative measured usage, and usage submission. Ports and vessels also belong to the backend.
- **Billing adapter** is server-side. The mock adapter runs locally without credentials. A future, separate Instellix adapter will use authorized public endpoints after explicit approval. Instellix owns products and contracts, rating, invoices, and payment records. Client applications access billing information through the backend.
- **Rating inputs** come from the voyage context. The selected vessel or vessel category maps to the Instellix product, and the harbor determines the service performance location. Store or resolve these independently of the customer's billing country and of tax location.

## Persistence and lifecycle

Each customer record represents an individual player's game account. Preserve the local customer ID and keep any external Instellix customer reference optional and separate. Store residence and billing country independently. Performance country comes from the voyage's harbor, and tax location is a separate billing concept.

Use SQLite for the local backend. Persist the synthetic customer account and player association, session owner and timestamps, the recorded total, accepted activity signal IDs, and each finalized usage record and submission status. Enforce one active session per player and one usage record per finalized session with database constraints. Resolve an expired prior session before allowing a new one.

Use the backend clock. The browser timer is for display only. A session starts with zero usage and a 30-second window for the first activity signal. The first accepted signal sets the timing baseline and adds zero. Each subsequent accepted signal adds the elapsed time since the previous accepted signal, capped at 10 seconds. A gap of 30 seconds or more expires the session without crediting the gap. Keep measured time at subsecond precision and expose whole seconds for display. At finalization, convert the measured duration to the configured billing unit (initially minutes) and apply the configured rounding rule. The signal interval and inactivity timeout are configurable, with the credit cap matching the configured interval.

Check for expiry on startup and periodically during operation. The API also checks expiry when processing a session request. An expired session ends at its last accepted signal, or at its start if it received none. Ending explicitly also grants no trailing time. Only active gameplay should generate activity signals. This local slice relies on synthetic activity signals and a server-side clock. Production validation of player activity remains open.

Finalize the session and create its positive-usage record in one transaction. Persist pending submissions before calling the adapter. Reconcile pending submissions on startup and serialize attempts for each record. Use the stable usage record ID as the adapter idempotency key, including after a crash or an operator retry. The mock must handle a repeated key without a second logical submission. Live adapter idempotency and recovery semantics require verification before live use.

Mission outcome has no role in finalization or quantity. Keep duration measurement separate from usage submission so reporting can later submit periodic increments from the measured total. For the MVP, activity signals only meter time and submission happens once per finalized session.

### Step 5: Admin-managed voyages

This increment measures backend elapsed time from Admin start to end, before the activity-signal and billing workflow above is implemented. SQLite stores UTC epoch milliseconds and derives the immutable elapsed duration from the finalized timestamps. The API exposes UTC timestamps, fractional seconds, and measured minutes, not a billable quantity. Each voyage snapshots the player, port, vessel, product key, and both billing and performance countries. Tax location is nullable and is not inferred from either country.

## API contract boundaries

Validate inputs at the API boundary. The seeded player is resolved by local backend configuration. Requests carry identifiers and activity signals, while the backend determines ownership, customer attribution, timestamps, and quantity.

| Consumer | Operation | Expected behavior |
| --- | --- | --- |
| Game contract, exercised by a synthetic client | Start session | Use a stable client request ID. Replay returns the same session. A distinct start conflicts while a session is active. |
| Game contract, exercised by a synthetic client | Send activity | Supply a session ID and unique signal ID. Replay leaves the total unchanged. A new signal for an expired session requires a new session. |
| Game contract, exercised by a synthetic client | End session | Supply the session ID. Repeated end requests return the finalized result. |
| Admin | List sessions | Return player, customer account, session status, recorded seconds, and billing status. |
| Admin | Retry submission | Retry a failed record using its existing ID and immutable quantity. |

Run the first slice on localhost with synthetic data. Keep credentials server-side and out of logs. A future in-game purchase would be a separate one-time charge or transaction associated with the player and customer account, independent of play-time metering.
