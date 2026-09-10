# Quickstart: Quick Quote Engine

**Feature**: specs/001-quick-quote-engine | **Date**: 2026-09-08

Runnable validation scenarios that prove the feature end-to-end. Commands and expected
outcomes only — implementation lives in the repo; shapes live in
[contracts/http-api.md](./contracts/http-api.md) and
[contracts/shared-schemas.md](./contracts/shared-schemas.md); persistence shapes in
[data-model.md](./data-model.md).

## Prerequisites

- Docker (with compose v2)
- Node 22 LTS + npm (for `npm run bench` and `npm test`)

## Setup (target: under five minutes)

```bash
cp .env.example .env        # fill in the real DATABASE_URL credentials (Aiven Postgres)
npx tsx scripts/create-test-db.ts   # one-time: creates the dedicated qqe_test database
docker-compose up --build   # postgres:16 + api (migrate + seed on boot) + web
```

Without Docker, the API runs against the Aiven database directly:
`npm run build:api && npm run dev:api`.

The README (implementation phase) carries the seeded login credentials for a
standard-tier and an enterprise-tier merchant. The API serves on the configured
`PORT` (default 4000); the web app on its own local port.

## Validation Scenarios

**V1 — Login issues a JWT.**
Log in via the web app (or `POST /auth/login`) with either seeded merchant.
Expected: an access token is issued; wrong credentials are rejected 401.

**V2 — US → GB quote meets the latency contract.**
Log in as the standard merchant, submit: origin US (postcode + IANA timezone),
destination GB, a mid-size parcel (e.g. 5 kg, 30×20×10 cm), no `quotedAt`.
Expected: rates stream in — the local Meridian rate arrives first (well under a
second), the vendor rates follow as they resolve; every rate shows carrier, service,
base, tax, total (USD integer cents) and a delivery estimate; all carriers resolve or
are named as failed/given-up, and the stream closes well inside the overall deadline.

**V3 — Determinism.**
Resubmit the same shipment (same fixed `PROVIDER_SEED`, same defaulted clock for
`quotedAt` — or pass the same explicit `quotedAt` twice).
Expected: identical rates both times (constitution Principle II).

**V4 — Tier-dependent pricing.**
Repeat V2 logged in as the enterprise merchant.
Expected: Meridian's handling fee is waived (250-cent difference vs the standard
merchant's quote for the same shipment).

**V5 — No-service lane is a valid request.**
Submit origin US, destination JP.
Expected: no rate events; every carrier reports NO_SERVICE; the UI renders the
no-service-for-this-lane state — never an error code (FR-003, SC-008).

**V6 — Partial success is honest.**
With the seed fixed, find or force a request where a carrier fails (the vendors fail
~18–20% of the time; the bench log identifies runs).
Expected: the successful carriers' rates render, the failed carrier is named as
failed, and a retry path is offered.

**V7 — History is scoped per merchant.**
After quoting as both merchants, open each merchant's history view (or `GET /quotes`).
Expected: each merchant sees only their own requests and outcomes; the automated
tenant-isolation test also proves this (SC-005).

**V8 — Benchmark reproduces the contract numbers.**

```bash
npm run bench        # ~10 minutes: 200 sequential US→GB requests, seed fixed
```

Expected: the report shows p95 time-to-first-rate < 800 ms and p95
time-to-complete < 3,500 ms, measured at the client (SC-001).

**V9 — Test suite is deterministic and passes repeatedly.**

```bash
npm test             # repeat 3× in a row
```

Expected: every run passes with no flakes — rate-card boundary cases with exact
answers, aggregation partial-failure and slow-carrier cases, the real-HTTP
integration test, tenant isolation, and the frontend test (SC-002, SC-003).

## Expected Outcome Summary

All nine scenarios passing demonstrates the success criteria: the latency contract,
exact pinned arithmetic, honest degradation, tenant isolation, reproducibility, and
the under-five-minute setup the evaluation requires.
