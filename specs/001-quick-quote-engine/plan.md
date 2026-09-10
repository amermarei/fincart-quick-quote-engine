# Implementation Plan: Quick Quote Engine

**Branch**: `001-quick-quote-engine` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-quick-quote-engine/spec.md`

## Summary

An authenticated NestJS quote service that fans a shipment out to three carriers — the
SwiftPost and Atlas vendor SDKs (read-only, seeded RNG, 200–3000 ms latency, ~18–20%
failure) and a locally computed Meridian rate card (per its authoritative
`$semantics`) — and streams rates to a React single-page app as they arrive, meeting a
client-measured latency contract (p95 time-to-first-rate < 800 ms, p95 time-to-complete
< 3,500 ms over 200 sequential US → GB requests). Prisma/PostgreSQL persists every
quote request and its per-carrier results, scoped per merchant; JWT auth with seeded
standard- and enterprise-tier merchants drives tier-aware pricing. Money is USD integer
cents with half-away-from-zero rounding and per-component fixed FX; all time-dependent
pricing derives from `quotedAt`; `PROVIDER_SEED` is loaded before provider imports so
runs reproduce. Delivered as a local docker-compose stack with a reproducible
`npm run bench` script and a deterministic Vitest/Supertest/Testing-Library suite.
Stack per stakeholder: NestJS + Prisma backend, React + Tailwind frontend, TypeScript
strict everywhere.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) for backend, frontend, and shared
packages; Node 22 LTS for tooling and runtime.

**Primary Dependencies**: NestJS (backend framework), Prisma ORM + PostgreSQL 16,
@nestjs/jwt + Passport (login), React + Vite (SPA), React Hook Form + shared Zod
schemas (form + server validation), Tailwind CSS (minimal utility styling only —
styling is not evaluated), Luxon (IANA-timezone cutoff and business-day transit math),
tsx (bench script runner).

**Storage**: PostgreSQL via Prisma — the hosted Aiven instance for the application
(`DATABASE_URL` in `.env`), a dedicated `qqe_test` database on it for the test
suite (reset-guarded), and a self-contained `postgres:16` service in
docker-compose for the evaluator. Money is integer minor units; measures are
`Decimal`. Vendor SDKs and the Meridian rate card live as read-only files in
`packages/starter` (the starter material, renamed to match the brief) and `apps/api` resources.

**Testing**: Vitest across the monorepo — rate-card boundary unit tests with exact
answers, aggregation partial-failure/slow-carrier tests, Supertest integration test
hitting a real HTTP endpoint, the tenant-isolation test, and one Testing Library
frontend test. Deterministic runs fix `PROVIDER_SEED` before provider imports and
drive time from `quotedAt`.

**Target Platform**: Local docker-compose (postgres + api + web); Node 22 for local
development commands (bench, tests).

**Project Type**: Web service + SPA in an npm-workspaces monorepo
(`apps/api`, `apps/web`, `packages/shared`, `packages/starter`).

**Performance Goals**: p95 time-to-first-rate < 800 ms and p95 time-to-complete
< 3,500 ms, both measured at the client over 200 sequential US → GB quote requests
with `PROVIDER_SEED` fixed; reproducible via `npm run bench` (run ≈ 10 minutes).

**Constraints**: USD minor units (integer cents) for all merchant-facing amounts; fixed
FX from `FX_RATES` (no live lookups); half-away-from-zero rounding only at named
points; 1 kg = 2.20462262 lb and 1 in = 2.54 cm with unrounded vendor-side
conversions; all time-dependent pricing from `quotedAt`; env loaded before provider
module imports; vendor SDKs and RNG library read-only (only the rng import path may
change); Meridian `$semantics` authoritative; tenant-scoped history; setup achievable
in under five minutes; styling explicitly not evaluated.

**Scale/Scope**: 3 seeded merchants (at least one standard, one enterprise), 3
carriers, a single local evaluator; no remote deployment, no signup/reset/refresh.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate (constitution principle) | Status | How the plan satisfies it |
|---|---|---|
| I. Exact Money & Units | PASS | Integer-cents money helpers; `roundHalfAwayFromZero` applied only where a rule names it; per-component FX conversion then round; unrounded request-side unit conversions to vendors (research.md R5) |
| II. Deterministic Time & Seeding | PASS | All time-dependent pricing derives from `quotedAt`; `dotenv/config` is the first import in `main.ts` so `PROVIDER_SEED` is set before any provider module loads; tests fix the seed before provider import (research.md R3) |
| III. Client-Measured Latency Contract | PASS | `POST /quotes` responds as an SSE stream; carriers fanned out in parallel with Meridian computed locally (first rate well under 800 ms); per-carrier and overall deadline budgets bound completion; `npm run bench` measures p95 at the client (research.md R2, R4) |
| IV. Partial Results Over Hung Requests | PASS | Per-carrier deadline + overall request budget; Atlas 429 retried only when it fits the budget; given-up carriers named as failures in the stream and UI; retry path in the frontend (research.md R4) |
| V. Shared-Schema Validation | PASS | Zod schemas in `packages/shared` used by both server and React Hook Form; no carrier coverage in schemas — an unserved lane is a valid empty result |
| Non-negotiable constraints | PASS | Starter files copied into `packages/starter` preserving their internal `lib/` + `providers/` + `rate-cards/` layout so the rng import line needs no change at all; `$semantics` authoritative for Meridian; tier and carrier account reference resolved from the JWT + merchant record, never the request body; automated tenant-isolation test; seeded standard + enterprise merchants documented in the README; local docker-compose delivery |

No violations at Phase 0 entry.

### Post-Design Constitution Re-check (after Phase 1)

Re-evaluated against research.md, data-model.md, contracts/, and quickstart.md:

- **I. Exact Money & Units — PASS**: data model stores money as integer minor
  units only; contracts pin per-component CAD→USD conversion and the
  SwiftPost tax-inclusive base derivation; one rounding helper with exact-answer
  boundary tests (research R5).
- **II. Deterministic Time & Seeding — PASS**: `quotedAt` is the only time source
  in every contract and the only stored pricing timestamp; seed ordering is
  structurally guaranteed by the first-position dotenv import (research R3);
  quickstart V3/V9 verify reproducibility and flake-free repeated runs.
- **III. Client-Measured Latency Contract — PASS**: the quote endpoint is a
  streaming contract by definition (SSE events in arrival order); the bench
  scenario (quickstart V8) reproduces both p95 numbers from the client.
- **IV. Partial Results Over Hung Requests — PASS**: `carrier-status` events name
  FAILED / NO_SERVICE / GIVEN_UP outcomes; deadline budgets make give-up explicit
  (research R4); quickstart V5/V6 exercise the honest states and retry.
- **V. Shared-Schema Validation — PASS**: one shared-schemas contract used by
  server and form; carrier coverage explicitly excluded — no-service is a 200
  stream, never a 4xx.
- **Non-negotiable constraints — PASS**: vendor files keep their internal layout
  (no line changes at all, research R12); Meridian engine is specified strictly
  per `$semantics`; tier/accountRef resolve from JWT + merchant record only;
  seeded standard + enterprise merchants; tenant isolation is a persisted-scope
  attack test; delivery is local docker-compose.

No violations after design. The plan is ready for `/speckit.tasks`.

## Project Structure

### Documentation (this feature)

```text
specs/001-quick-quote-engine/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── http-api.md
│   └── shared-schemas.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/
  api/                          # NestJS backend (TypeScript strict)
    prisma/
    ├── schema.prisma           # Merchant, QuoteRequest, QuoteRate
    └── seed.ts                 # seeded merchants: standard + enterprise (+ plus)
    src/
    ├── main.ts                 # 'dotenv/config' as FIRST import, then AppModule
    ├── app.module.ts
    ├── auth/                   # POST /auth/login, JWT issue + guard
    ├── quotes/                 # POST /quotes (SSE stream), GET /quotes (scoped history)
    ├── meridian/               # rate-card loader + pricing engine per $semantics
    ├── carriers/               # SwiftPost/Atlas adapters: unit conversion, deadlines, budgeted 429 retry
    ├── merchants/              # merchant resolution: tier + carrier account reference
    └── common/                 # money.ts (round-half-away, fixed FX), time.ts (IANA cutoff, business days, contract holidays)
    test/                       # Supertest integration + tenant-isolation tests
  web/                          # React + Vite SPA (TypeScript strict)
    src/
    ├── App.tsx                 # single-page shipment form + streaming results
    ├── components/             # form (RHF + shared zod), rate list, four UI states
    └── lib/                    # SSE-over-fetch client, api client, retry
    tests/                      # Testing Library frontend test
packages/
  shared/                       # Zod schemas + types shared client/server (shipment, rate, auth)
  starter/                      # copied read-only starter material (@qqe/starter); internal lib/ + providers/ + rate-cards/ layout kept so the rng import line is unchanged
scripts/
  └── bench.ts                  # npm run bench — 200 sequential requests, client-side p95 report
docker-compose.yml              # api + web: one-command start, migrations + seed on boot
.env                            # copied from .env.example (FX_RATES, PROVIDER_SEED, deadlines, JWT_SECRET, DATABASE_URL, PORT)
```

**Structure Decision**: npm-workspaces monorepo. The brief mandates a
`packages/shared` workspace for the client/server Zod schemas, so a workspace root is
required anyway; npm workspaces add no extra tooling for the evaluator. The vendor SDKs
live in their own read-only package with the original internal layout preserved
(`providers/` + `lib/`), which keeps the relative `../lib/rng` import valid — no line
in the read-only files changes. Backend and frontend are separate apps per the
stakeholder stack (NestJS + Prisma; React + Vite + Tailwind). The bench script sits at
the repo root because it measures the deployed stack from the outside, exactly as the
evaluator will.

## Complexity Tracking

None — no constitution violations to justify.
