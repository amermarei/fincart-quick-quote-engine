# Research: Quick Quote Engine

**Feature**: specs/001-quick-quote-engine | **Date**: 2026-09-08

Stack mandated by the stakeholder this session: **NestJS + Prisma for the backend,
React (+ Tailwind) for the frontend, TypeScript for both.** No Technical Context
NEEDS CLARIFICATION remained after that choice; the research below resolves every
design decision the brief leaves open, each with rationale and alternatives.

---

## R1. Repository layout — npm-workspaces monorepo

- **Decision**: npm workspaces with `apps/api` (NestJS), `apps/web` (React/Vite),
  `packages/shared` (Zod schemas), `packages/starter` (read-only starter SDKs + rate card).
- **Rationale**: the brief mandates a `packages/shared` workspace for client/server
  validation schemas, which forces a workspace root; npm workspaces ship with the
  Node/npm the evaluator already has (zero extra tooling, `npm install` at root
  resolves everything, `npm run bench` at root works as the brief expects).
- **Alternatives considered**: pnpm workspaces (faster installs, extra global tool to
  install and explain in the README); Turborepo/Nx (task graph we do not need at three
  packages; heavier setup); single package with path aliases (no clean way to keep
  read-only vendor code isolated and type-checked under its own strict config).

## R2. Rate streaming transport — SSE over a POST response

- **Decision**: `POST /quotes` responds `text/event-stream`; the server writes
  `rate` / `carrier-status` / `done` events as each carrier resolves; the frontend
  consumes the body with `fetch()` + a ReadableStream reader (not `EventSource`).
- **Rationale**: the latency contract (first usable rate at the client p95 < 800 ms)
  requires streaming, not a buffered response. `EventSource` cannot POST, and the
  brief pins "one authenticated endpoint that takes a shipment" — a POST returning an
  event stream keeps exactly one endpoint. NestJS (Express adapter) can set the SSE
  headers on a POST handler and flush per event; the response starts immediately, so
  the local Meridian rate (no network latency) reaches the client in milliseconds.
- **Alternatives considered**: `@nestjs/websockets` gateway (bidirectional machinery
  we do not need, worse fit for one-shot request/response semantics); POST returning
  202 + `GET /quotes/:id/stream` via `@Sse()` (two endpoints for one quote, plus a
  persistence round-trip before the client can subscribe); polling (wrecks the
  first-rate budget); plain NDJSON chunking (equivalent, but SSE gives us named event
  types for free, which maps cleanly onto the four UI states).

## R3. Seed/env ordering — dotenv as the first import in `main.ts`

- **Decision**: `import 'dotenv/config'` is the first statement of `apps/api/src/main.ts`,
  before the `AppModule` import; provider modules are only reachable through the
  module graph, so `PROVIDER_SEED` is guaranteed set before `rngFor()` runs at module
  load. Tests set the seed the same way in their bootstrap file, before importing
  anything that (transitively) imports `packages/starter`.
- **Rationale**: the brief warns the seed is read at module load and silently ignored
  otherwise; the Nest CLI compiles to CommonJS, where import order is execution order,
  so a first-position dotenv import is sufficient and provable in one line.
- **Alternatives considered**: `@nestjs/config` ConfigModule (loads when the module
  graph initializes — after provider files are already imported; too late);
  `node --env-file` (easy to forget; the README must work with plain `npm start`
  inside docker-compose); requiring dotenv inside each provider (modifies read-only
  files — forbidden).

## R4. Carrier orchestration — parallel fan-out with deadline budgets

- **Decision**: all three carriers start in parallel the moment a request is
  validated. Meridian is computed locally (first rate, effectively instant).
  Each remote carrier gets a per-carrier deadline (`CARRIER_TIMEOUT_MS`, default
  â‰ˆ 3000 ms — the SDKs sleep 200–3000 ms); the request as a whole gets an overall
  budget (`REQUEST_DEADLINE_MS`, default â‰ˆ 3400 ms). On an Atlas 429 the retry is
  honoured only if `elapsed + retryAfterMs + worst-case latency` still fits the
  remaining budget; otherwise the carrier is given up on and reported. Whatever
  resolved by budget end is emitted; unresolved carriers are emitted as given-up; the
  stream then closes. Failure/degradation behavior is a documented, deliberate choice
  (a short design note in the README, as the brief asks).
- **Rationale**: vendors take up to 3 s and fail ~18–20%; Atlas 429s add
  250–750 ms retry hints, so a naive retry can bust the 3.5 s complete budget. A
  budget-aware give-up rule is the only way both p95 numbers hold. Partial results
  are good results; nothing hangs.
- **Alternatives considered**: sequential fastest-first (kills the complete budget —
  3 s + 3 s â‰« 3.5 s); unbounded retries with backoff (hangs, violates the
  contract); fixed single timeout without budget arithmetic (a 429 retry landing at
  3.4 s still completes past the deadline).

## R5. Money arithmetic — integer cents + explicit half-away-from-zero rounding

- **Decision**: a single `money.ts` helper module. All merchant-facing amounts are
  integer cents. `roundHalfAwayFromZero(x) = Math.sign(x) * Math.round(Math.abs(x))`
  (JS `Math.round` is half-toward-+âˆž, wrong for negatives). Atlas (CAD, major units,
  tax-exclusive): each component is converted separately —
  `usdCents = roundHalfAway(cadMajor * 100 * fx)` — never a converted total with
  components derived. SwiftPost (USD minor units, tax-inclusive): base =
  `amount - tax_amount`, total = `amount`, no conversion. Meridian computes entirely
  in minor units, rounding only where `$semantics` says (fuel before cap, tax last).
  Request-side unit conversions to vendors (`kg â†’ lb`, `cm â†’ in`) pass unrounded
  values with the exact constants 1 kg = 2.20462262 lb, 1 in = 2.54 cm.
- **Rationale**: the grader checks arithmetic against reference cases; every rounding
  point is pinned in the brief. Keeping one helper module makes each pinned rule a
  named, unit-testable function (`roundHalfAwayFromZero`, `cadToUsdCents`,
  `chargeableWeightKg`, …) with exact-answer tests at the boundaries.
- **Alternatives considered**: `Math.round` alone (silently wrong for negatives and
  FP-edge .5 cases); a decimal library like decimal.js (adds a dependency for
  magnitudes where integer-cents arithmetic is exact; the input space is two-decimal
  vendor prices and integer rate-card minors, which integer math handles exactly);
  converting totals then deriving components (explicitly forbidden by the brief).

## R6. Time, timezones, and business-day transit — Luxon + contract calendar

- **Decision**: Luxon for all wall-clock math. The Meridian delivery estimate is
  computed by: interpret `quotedAt` in the origin's IANA zone (from the shipment);
  if the local time is at or after the zone's `cutoff_local`, add 1 to
  `transit_business_days`; then count business days (Mon–Fri) excluding the
  origin-country dates in the rate card's `holidays` block, starting strictly after
  the quote date — the quote date itself is never counted. Years not listed in the
  calendar have no holidays; the calendar is never supplemented.
- **Rationale**: cutoff comparison and "first business day strictly after" require
  correct local-time arithmetic in an arbitrary IANA zone — exactly Luxon's core
  competency; holiday exclusion is a simple set lookup on the ISO date string.
  Everything keys off `quotedAt`, never `Date.now()`, so quotes and tests reproduce.
- **Alternatives considered**: date-fns-tz (fine, but business-day stepping would be
  hand-rolled the same way — no advantage); raw `Intl.DateTimeFormat` timezone
  offsets (manual offset math, error-prone across DST boundaries); server-local time
  (wrong by definition — the origin zone is per-shipment).

## R7. Persistence — PostgreSQL (Aiven + compose) via Prisma

- **Decision**: PostgreSQL via Prisma. The application database is the hosted
  Aiven instance (`.env` â†’ `DATABASE_URL`); the docker-compose deliverable spins up
  its own `postgres:16` service so the evaluator's stack is self-contained. Tests
  run against a dedicated `qqe_test` database on the same Aiven instance (a guard
  refuses to run if the DB name is not `qqe_test`). Money is stored as integer
  minor units; shipment weight/dimensions as Prisma `Decimal`; every quote request
  is persisted with one row per carrier outcome (quoted / failed / no-service /
  given-up), linked to the owning merchant. History is a scoped `findMany` on the
  JWT's merchant id.
- **Rationale**: stakeholder-mandated ORM and a stakeholder-provided hosted
  Postgres (Aiven). **Evolution**: the first validated build used SQLite (the
  sandbox had no Docker/Postgres); with a real Postgres available the schema was
  switched back to `postgresql` with proper enums (`MerchantTier`, `CarrierId`,
  `QuoteRateStatus`), migrations were generated offline and deployed, and the whole
  suite now runs against real Postgres. Two latency-driven refinements were
  required once the DB became remote (R2's stream now never blocks on a DB write —
  persistence runs behind the stream and is awaited before the handler resolves —
  and the auth guard caches merchant records for 30 s; tier/accountRef still come
  from the merchant record, never token claims).
- **Alternatives considered**: SQLite (kept the suite green locally but was a
  deviation, now retired); MongoDB (document shape fits, but Prisma+Postgres is the
  mandated pair); storing rates as one JSON blob (loses per-carrier queryability;
  tenant-isolation and history rendering want rows).

## R8. Auth — JWT bearer, merchant resolved from DB per request

- **Decision**: `POST /auth/login` (email + password, bcrypt hashes in the seed)
  issues a JWT with the merchant id as `sub`. A guard verifies the token on every
  protected route and the request-scoped merchant record (tier, carrier account
  reference) is loaded from the database — the tier is not trusted from the token
  body, so a stale claim can never misprice a quote. No signup, reset, or refresh.
- **Rationale**: the brief pins JWT + seeded merchants; resolving tier/accountRef
  from the record on each request keeps pricing identity authoritative and makes
  the tenant-isolation test meaningful.
- **Alternatives considered**: embedding tier in the JWT (stale on tier change;
  also a second source of truth); sessions (brief says JWT); API keys (not asked
  for).

## R9. Frontend — Vite + React Hook Form + shared Zod, Tailwind kept minimal

- **Decision**: Vite SPA. The shipment form uses React Hook Form with the
  `packages/shared` Zod schema via a resolver, so client and server validation are
  literally the same rules. Results consume the quote stream via a small
  SSE-over-fetch helper; rates append as they arrive (fast carrier first, by
  construction). Four states rendered honestly: loading, partial success (naming
  the failed carriers), complete, no-service-for-this-lane; a retry button re-runs
  the quote. Real `<label>` elements, error messages associated to inputs,
  keyboard-operable throughout. Tailwind is used only for terse, utilitarian layout
  (`flex`, spacing, borders) — no design system, no animation.
- **Rationale**: RHF + shared Zod is pinned by the brief; Vite is the default React
  toolchain and starts fast for the docker workflow. Tailwind is the stakeholder's
  choice this session; the brief explicitly does not evaluate styling, so it is
  capped at minimal utilities to spend zero design time.
- **Alternatives considered**: Next.js (SSR/router we do not need for one page);
  formik (brief pins RHF); styled-components/CSS modules (more files for the same
  non-evaluated outcome); polling the history endpoint for results (busts the
  first-rate budget).

## R10. Testing — Vitest everywhere + Supertest for the real-HTTP integration test

- **Decision**: one Vitest workspace config across `apps/api`, `apps/web`,
  `packages/shared`. Rate-card logic is tested with exact-answer boundary cases
  (weight-break edges 1/5/20 kg, 0.5 kg chargeable round-up 6.01 â†’ 6.5, fuel cap
  round-then-cap, 120 cm strictly-greater oversize, remote-prefix case/whitespace
  matching, cutoff-at-boundary transit, holiday skipping, half-up rounding
  745.5 â†’ 746). Aggregation is tested for a partial-failure case and a
  slow-carrier case using the seeded vendors (fixed `PROVIDER_SEED`, `quotedAt`
  fixtures — no clock). One Supertest integration test hits a real HTTP endpoint
  end-to-end. The tenant-isolation test proves merchant A cannot read merchant B's
  history (fails if scoping breaks). One Testing Library frontend test covers the
  form/state behavior. Test bootstrap sets the seed env before importing providers.
- **Rationale**: the brief demands determinism and quality-over-coverage; a single
  TS-native runner keeps the monorepo test command trivial (`npm test` at root)
  and Vitest's per-file isolation makes the seed-before-import guarantee easy.
- **Alternatives considered**: Jest (NestJS default, but a second config world for
  the React side); Playwright for the frontend test (heavier than one component
  behavior needs); mocking the vendors entirely (asserts mock behaviour — exactly
  what the brief says not to do; the seeded SDKs are deterministic, so we use the
  real ones).

## R11. Benchmark — `npm run bench`, client-side measurement

- **Decision**: a standalone `scripts/bench.ts` (run with tsx) that logs in, fires
  200 sequential `POST /quotes` requests on the US â†’ GB lane with a fixed
  `PROVIDER_SEED`, and measures — from the client — time-to-first-`rate`-event and
  time-to-`done`-event per request, reporting p95 for both. Run time â‰ˆ 10 minutes,
  as the brief predicts.
- **Rationale**: both contract numbers are defined "measured at the client, not
  server-side", so the only honest measurement point is the bench script's own
  clock; sequential matches the stated methodology; shipping it in-repo makes the
  figures reproducible for the evaluator.
- **Alternatives considered**: server-side timing (explicitly disqualified);
  parallel requests (methodology mismatch — the 200 are sequential); k6/autocannon
  (another tool to install; a 60-line tsx script is easier to read and reproduce).

## R12. Starter material placement — `packages/starter`, layout preserved

- **Decision**: copy `starter/lib/rng.ts`, `starter/providers/swiftpost.ts`,
  `starter/providers/atlas.ts`, and `starter/rate-cards/meridian.json` into
  `packages/starter` keeping their internal relative layout (`lib/`, `providers/`,
  `rate-cards/`), so `import { rngFor, sleep } from '../lib/rng'` resolves
  unchanged — the one line the brief permits changing is not changed at all. The
  package compiles under `tsc --strict` with `@types/node`; the rate card is loaded
  as data only by the Meridian loader in `apps/api/src/meridian/`.
- **Rationale**: the brief says the starter type-checks as shipped and that a
  strict-mode failure means the path is wrong; preserving the internal layout makes
  that structurally true. Isolating them in their own package makes "read-only"
  enforceable in review (one directory to eyeball).
- **Alternatives considered**: inlining into `apps/api/src` (works, but scatters
  read-only files among ours); changing the import to a package path (permitted but
  unnecessary churn); wrapping the SDKs with an interface layer inside the package
  (a modification risk for zero gain — adapters live in `apps/api/src/carriers`).

## R13. The two context-hungry Meridian rules — explicit pricing context

- **Decision**: the Meridian engine is not a pure `(shipment) => Rate` function; it
  takes `(shipment, merchantContext)` where `merchantContext = { tier }`, and reads
  `quotedAt` from the shipment itself. The handling fee consults
  `merchantContext.tier` against `waived_for_tiers`; the transit rule consults
  `quotedAt` + the shipment's origin timezone + the zone cutoff and holiday
  calendar. The other two carriers receive the same context object and ignore what
  they do not need (Atlas consumes `carrierAccountRef` for its `accountRef` field).
- **Rationale**: the brief flags these two rules as the interesting part and leaves
  the accommodation to us; a uniform context object keeps one carrier-interface
  shape for all three, keeps tier out of the request body (constitution:
  identity from JWT + merchant record), and keeps `quotedAt` the sole time source.
- **Alternatives considered**: passing tier as a shipment field (forbidden — the
  body carries no merchant identity); a per-carrier bespoke signature per rule
  (three different shapes to maintain for one call site); computing transit
  outside the pricing engine (splits `$semantics` logic across modules — worse
  testability against the boundary cases).
