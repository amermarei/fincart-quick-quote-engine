# Quick Quote Engine

Multi-carrier quote aggregation for Fincart: one authenticated endpoint quotes
SwiftPost, Atlas Logistics, and Meridian Freight in parallel and streams the rates
to a single-page React app as they arrive.

## Run it (under five minutes)

Prerequisites: Docker (compose v2), Node 22 for the benchmark/test commands, and
access to the hosted PostgreSQL (Aiven) whose URL lives in `.env`.

```bash
cp .env.example .env        # paste the real DATABASE_URL credentials (Aiven Postgres)
npx tsx scripts/create-test-db.ts    # one-time: dedicated qqe_test database for tests
docker-compose up --build   # web at http://localhost:5173, api at http://localhost:4000
```

Without Docker: `npm install && npm run build:api && npm run dev:api` (the API
uses the Aiven database directly; the web app runs with `npm run dev:web`).

Seeded merchants (also in `apps/api/src/auth/seeded-credentials.ts`):

| Tier | Email | Password |
|---|---|---|
| standard | `standard@fincart.test` | `standard-pass` |
| enterprise | `enterprise@fincart.test` | `enterprise-pass` |
| plus | `plus@fincart.test` | `plus-pass` |

Tier-dependent pricing: Meridian's handling fee (250¢) is waived for plus and
enterprise.

## Latency

Run the shipped benchmark against the running stack:

```bash
npm run bench        # 200 sequential US->GB requests, client-measured, ~10 min
```

Reported numbers (seed 42, 200 sequential requests, client-measured, against the
Aiven Postgres-backed API):

- p95 time-to-first-rate: 189.7 ms
- p95 time-to-complete: 2,970.9 ms

How we hit them: the three carriers run in parallel the moment a shipment is
validated, and Meridian is a local calculation with no network latency, so its rate
is streamed out within milliseconds (SSE over a POST response — the response
headers flush immediately and rates are written as they resolve). The stream never
waits for the database: persistence runs behind it and is awaited only after the
terminal event, so a remote Postgres round trip can't delay a single rate. The
remote vendors (200–3000 ms sleeps, ~18–20% failure) are raced against a per-carrier
deadline, and the request as a whole is budgeted to 3,400 ms: a rate-limited Atlas
retry is only attempted if it still fits the budget, otherwise the carrier is given
up on and reported as such — a partial result is a good result. Nothing ever hangs.

## Database choice

PostgreSQL via Prisma. The application uses the hosted Aiven instance (the
stakeholder's Postgres); docker-compose ships its own `postgres:16` service so the
evaluator's stack is self-contained. The test suite runs against a dedicated
`qqe_test` database on the same instance, and refuses to reset anything that isn't
named `qqe_test` — the real database is never touched. Real Postgres enums for
tiers and carrier outcomes; money stored as integer cents.

## Shortcuts

- **SSE over POST instead of EventSource.** EventSource can't POST; the brief pins
  one endpoint taking a shipment, so the client parses the stream from a fetch
  body — worth the extra client code for the latency contract.
- **One budgeted retry per carrier.** The brief only allows retries inside the
  overall deadline; more would add little at bench scale.
- **Persistence runs behind the stream.** Awaiting remote-DB writes before
  streaming broke the first-rate budget (measured ~1.1 s), so the stream emits
  immediately and the handler awaits the writes before resolving. A DB outage
  degrades persistence (logged), never the stream.
- **A 30-second in-memory merchant cache** in the auth guard — one remote lookup
  per request would eat the 800 ms budget; tier and account reference still come
  from the merchant record, never token claims.
- **No refresh tokens or user management** (the brief pins seeded merchants).
- **Bench timing uses one client-side parse loop** — honest per the contract, but
  would not survive a hostile proxy.
- **History stored as per-carrier rows, not a JSON blob** — keeps tenant isolation
  and honest failure history queryable.

With two more days: SSE auto-reconnect with an offline retry queue, exponential
backoff measured against the deadline, and a browser-side bench harness to drop
the hostile-proxy caveat.

## Tests

```bash
npm test        # deterministic: resets the test DB, boots the API, runs everything
```

Covers: rate-card exactness boundaries (weight breaks, fuel cap, oversize/remote,
handling waiver, rounding, per-component FX), transit/cutoff/holiday rules,
determinism, aggregation partial-failure and slow-carrier give-up, the streaming
endpoint over real HTTP, tenant isolation, and the frontend four states + retry.

`PROMPTS.md` documents the AI assistance used.