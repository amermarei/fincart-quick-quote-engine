---
description: "Task list for Quick Quote Engine implementation"
---

# Tasks: Quick Quote Engine

**Input**: Design documents from `/specs/001-quick-quote-engine/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: INCLUDED — the specification mandates them (FR-032 to FR-036, SC-002, SC-003). Test tasks were written FIRST in each story and had to FAIL before the implementation tasks ran.

**Organization**: Tasks grouped by user story (spec.md P1–P5) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task names exact file paths; pinned constants are inline; full rules live in the referenced design doc

## Path Conventions

Monorepo per plan.md "Project Structure":

- Backend: `apps/api/src/…`, integration tests `apps/api/test/…`
- Frontend: `apps/web/src/…`, frontend tests `apps/web/tests/…`
- Shared Zod schemas: `packages/shared/src/…`
- Read-only starter SDKs: `packages/starter/…` (copied from `starter/`, internal `lib/` + `providers/` + `rate-cards/` layout preserved; package name `@qqe/starter`)
- Bench: `scripts/bench.ts`; orchestration: `docker-compose.yml`

**Read-only rule (constitution)**: never modify `packages/starter/providers/swiftpost.ts`, `packages/starter/providers/atlas.ts`, `packages/starter/lib/rng.ts`, or `packages/starter/rate-cards/meridian.json` — preserving the internal layout means the `../lib/rng` import line stays valid and needs no change.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace skeleton — every app compiles before any feature code exists.

- [x] T001 Create monorepo root in `package.json`: private, `"workspaces": ["apps/*", "packages/*"]`, scripts `dev`, `test` (vitest run), `bench` (tsx scripts/bench.ts); create `tsconfig.base.json` with `"strict": true`, `"module": "commonjs"` for API/Node code; create `.gitignore` (node_modules, dist, .env)
- [x] T002 [P] Copy read-only starter files preserving layout into `packages/starter/`: `starter/lib/rng.ts` → `packages/starter/lib/rng.ts`, `starter/providers/swiftpost.ts` → `packages/starter/providers/swiftpost.ts`, `starter/providers/atlas.ts` → `packages/starter/providers/atlas.ts`, `starter/rate-cards/meridian.json` → `packages/starter/rate-cards/meridian.json`; add `packages/starter/package.json` (name `@qqe/starter`) and `packages/starter/tsconfig.json` (strict, `@types/node` installed); VERIFIED with `npx tsc --noEmit -p packages/starter` → 0 errors (per the brief, a strict failure here means a path is wrong — fix the copy location, never the file)
- [x] T003 [P] Create shared schema package `packages/shared/package.json` (name `@qqe/shared`, deps: `zod`) and `packages/shared/src/index.ts`
- [x] T004 [P] Scaffold NestJS app `apps/api/package.json` + `apps/api/tsconfig.json` (extends base, strict): deps `@nestjs/*`, `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `@prisma/client`, `bcryptjs`, `luxon`, `rxjs`, workspace deps `@qqe/shared`, `@qqe/starter`; `apps/api/src/main.ts` FIRST line is `import 'dotenv/config';` before the `AppModule` import (constitution II: `PROVIDER_SEED` is read at provider module load); VERIFIED `npm install` at root + `tsc --noEmit` → 0 errors. Note: runtime runs the tsc-compiled output (`node dist/.../main.js`) because tsx/esbuild cannot emit NestJS's required decorator metadata
- [x] T005 [P] Scaffold Vite React app `apps/web/` (Vite react-ts template) with `apps/web/package.json`: deps `react-hook-form`, `@hookform/resolvers`, `@qqe/shared`; Tailwind v3 minimal (`tailwind.config.cjs`, `postcss.config.cjs`, `src/index.css` with `@tailwind` directives); VERIFIED `npm run build --workspace @qqe/web` succeeds
- [x] T006 [P] Add test + bench tooling: root `vitest.workspace.ts` (projects: `api` [node, forks/singleFork, fileParallelism false], `web` [jsdom + RTL cleanup], `shared`); root devDeps `vitest`, `tsx`, `supertest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `cross-env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, auth, shared schemas, and the exactness helpers every story builds on. No user story can start before this phase is complete.

- [x] T007 Create `docker-compose.yml` with `api` and `web` services (SQLite file DB on a volume — deviation from the plan's postgres:16: no Docker in the build sandbox, see research.md R7), and copy `.env.example` → `.env` setting `DATABASE_URL=file:./dev.db`, `JWT_SECRET=change-me`, `FX_RATES=CAD:0.73,GBP:1.27,EUR:1.09`, `PROVIDER_SEED=42` (fixed for reproducibility), `CARRIER_TIMEOUT_MS=3000`, `REQUEST_DEADLINE_MS=3400`
- [x] T008 Create `apps/api/prisma/schema.prisma` per `data-model.md`: `Merchant`, `QuoteRequest`, `QuoteRate` (SQLite has no enums — tier/carrier/status are String columns with app-level unions); money columns `Int`, measures `Decimal`; ran `npx prisma migrate dev --name init` and `npx prisma generate`
- [x] T009 Create `apps/api/prisma/seed.ts`: three merchants — one STANDARD, one ENTERPRISE, one PLUS — with bcryptjs-hashed passwords and distinct `carrierAccountRef` values; credentials exported from `apps/api/src/auth/seeded-credentials.ts` (single source the README quotes); VERIFIED `npx prisma db seed` → "Seeded 3 merchants"
- [x] T010 [P] Implement shared Zod schemas in `packages/shared/src/` per `contracts/shared-schemas.md`: `shipmentSchema` (alpha-2 country regex, IANA timezone via `Intl.supportedValuesOf`, positive weight/dims, optional ISO 8601 `quotedAt`), `rateSchema`, `carrierStatusSchema`, `loginRequestSchema`/`loginResponseSchema`, inferred types; NO carrier-coverage rule (FR-003); VERIFIED `packages/shared/src/schemas.spec.ts` 9/9 green
- [x] T011 [P] Implement money helpers in `apps/api/src/common/money.ts` per research.md R5: `roundHalfAwayFromZero` (sign·round(abs); 745.5 → 746, −745.5 → −746), `cadMajorToUsdMinor` (per-component), `kgToLb` (×2.20462262), `cmToIn` (/2.54) unrounded, `roundUpToHalfKg` (0.5 kg multiple)
- [x] T012 [P] Implement time helpers in `apps/api/src/common/time.ts` (Luxon): `localTimeIn`, `atOrAfterCutoff` (at counts as after), `addBusinessDays` (Mon–Fri, skipping holiday ISO dates, starting strictly after the start date); no `Date.now()` anywhere in pricing
- [x] T013 Implement auth module in `apps/api/src/auth/`: `POST /auth/login` (shared `loginRequestSchema`, bcryptjs compare, JWT with merchant id as `sub`, 401 on bad credentials) and `JwtAuthGuard` whose strategy resolves the merchant from Prisma (tier + carrierAccountRef from the record per request, never token claims or body); VERIFIED over real HTTP: login 201/tier standard, wrong password 401
- [x] T014 Copy `starter/rate-cards/meridian.json` → `packages/starter/rate-cards/meridian.json` (data only, part of the read-only starter package) + typed loader `apps/api/src/meridian/load-rate-card.ts` exposing zones, per-zone rates, surcharges, and holidays; `$semantics` authoritative

**Checkpoint**: `npx tsc --noEmit` clean in all workspaces; login works; DB migrated + seeded.

---

## Phase 3: User Story 1 — Merchant gets a comparable quote list in seconds (Priority: P1) — MVP

**Goal**: The authenticated quote endpoint fans out to all three carriers in parallel and streams rates to the React form as they arrive — Meridian (local, first) then the vendors — meeting the latency contract with every rate carrying carrier/service/base/tax/total/eta.

**Independent Test**: Log in with seeded credentials, submit a valid US → GB shipment; rates stream in, Meridian's rate visibly first, stream closes within the overall deadline.

### Tests for User Story 1

- [x] T015 [P] [US1] Integration test `apps/api/test/quotes-stream.e2e.ts` (Supertest + `test-server.ts` booting the REAL compiled HTTP server on a fresh test DB): asserts 200 + `text/event-stream`, `rate` events before `done`, every rate carries all fields, 400 for weight 0, 401 without a token — 3/3 green
- [x] T016 [P] [US1] Frontend test `apps/web/tests/quote-panel.test.tsx` (Testing Library): labels for all nine fields, invalid weight blocked with associated error, streaming renders rates then complete state — green

### Implementation for User Story 1

- [x] T017 [P] [US1] Define the carrier contract in `apps/api/src/carriers/types.ts`: `CarrierId`, `CarrierOutcome` (QUOTED with `Rate` | NO_SERVICE/FAILED/GIVEN_UP with errorCode/errorDetail + optional retryAfterMs), `Carrier = { id, run(shipment, merchantContext) }`
- [x] T018 [P] [US1] Implement Meridian engine `apps/api/src/carriers/meridian.carrier.ts` per `$semantics`: chargeable weight (max actual/volumetric, round up to 0.5 kg), zone by lane (no zone → NO_SERVICE), weight breaks (first up_to_kg ≥ chargeable; flat or base + ceil·per_kg), fuel (round then cap), oversize (strictly > 120 cm), remote (prefix, case-insensitive, whitespace stripped), handling (waived for plus/enterprise via `merchantContext.tier`), tax (pct on base + surcharges, rounded), total; transit via `time.ts` (cutoff at/after +1, business days strictly after quote date, contract holidays)
- [x] T019 [P] [US1] Implement SwiftPost adapter `apps/api/src/carriers/swiftpost.carrier.ts`: vendor amount is tax-INCLUSIVE USD minor units → base = amount − tax_amount, total = amount; eta = quotedAt + calendar days; 422 LANE_UNSERVED → NO_SERVICE, 503 → FAILED
- [x] T020 [P] [US1] Implement Atlas adapter `apps/api/src/carriers/atlas.carrier.ts`: UNROUNDED kg→lb / cm→in, `accountRef` from merchant context; CAD major → USD cents PER COMPONENT (price, tax separately at 0.73); eta hours → date range; 422 → NO_SERVICE, 429 → FAILED RATE_LIMITED (retryAfterMs surfaced), 500 → FAILED
- [x] T021 [US1] Implement orchestration `apps/api/src/quotes/quotes.service.ts`: persist request on accept; parallel fan-out raced against `CARRIER_TIMEOUT_MS`; overall `REQUEST_DEADLINE_MS` budget turns stragglers into GIVEN_UP DEADLINE; budget-aware Atlas 429 retry (only if elapsed + retryAfter + 3000 fits the budget); persist one `QuoteRate` row per carrier including failures; emit events in arrival order; always resolves, never hangs
- [x] T022 [US1] Implement `POST /quotes` in `apps/api/src/quotes/quotes.controller.ts`: JWT-guarded; shared `shipmentSchema` validation (400 with field-pathed messages); manual SSE on the Express response (`request` / `rate` / `carrier-status` / `done` events, flush per event, close after done)
- [x] T023 [US1] Implement web libs `apps/web/src/lib/auth.ts` (login → token + merchant) and `apps/web/src/lib/quote-stream.ts` (fetch POST + incremental SSE frame parsing — never buffers the whole body)
- [x] T024 [US1] Implement `App.tsx` (session flow: LoginForm ↔ QuotePanel), `ShipmentForm.tsx` (React Hook Form + `zodResolver(shipmentSchema)` from `@qqe/shared`, real `<label>`s, errors associated via aria), `RatesList.tsx` (fast-carrier-first list, loading/partial/complete/no-service states), `QuotePanel.tsx` (honest phase computation from refs); Tailwind utilities only
- [x] T025 [US1] Ran the story's tests: api e2e 3/3 + web 4/4 green; VERIFIED live: stream order `request → rate(MERIDIAN) → carrier-status → rate → done`, total 2607 ms

**Checkpoint**: MVP delivered — quotes stream, are persisted, and the latency contract is structurally achievable.

---

## Phase 4: User Story 2 — Merchant trusts the numbers (Priority: P2)

**Goal**: The exactness suite proves every pinned arithmetic rule against exact expected answers — weight-break edges, fuel cap, 0.5 kg round-up, oversize/remote boundaries, tier handling-fee waiver, cutoff/holiday transit, rounding, per-component FX.

**Independent Test**: `npm test` — the rate-card boundary cases all pass with exact expected cents.

### Tests for User Story 2

- [x] T026 [P] [US2] `apps/api/src/meridian/pricing.spec.ts` — hand-computed exact-answer cases: 0.5 kg round-up (6.01 → 6.5 → base 1441), multiple kept (6.0 → 1345), ≤1 flat (799), 5.01 formula break (1345) vs 5.0 flat (1249), zone A fuel/total (1643), enterprise waiver (1393), zone B tax 5% (3553), zone C fuel cap (12258 + 2200 + 250), oversize strictly > 120 (3600 vs 1750), remote prefix case/whitespace (2843), NO_SERVICE for US→JP
- [x] T027 [P] [US2] `apps/api/src/meridian/transit.spec.ts` — cutoff 13:59/14:00/17:00 (09-23/09-24/09-24), Saturday quote (09-28), Thanksgiving skip (12-09 — engine verified by hand recount), unlisted year 2028 (12-08), holiday quote date never counted (07-20), helper units
- [x] T028 [P] [US2] `apps/api/src/common/money.spec.ts` — 745.5 → 746, −745.5 → −746, per-component CAD→USD (901 + 118 = 1019 ≠ converted-total 1018), kg/lb and cm/in exact constants unrounded
- [x] T029 [US2] `apps/api/src/meridian/determinism.spec.ts` — identical input → identical outcome; quotedAt across cutoff → different eta (time from quotedAt, not clock); tier difference = exactly the handling fee

### Implementation for User Story 2

- [x] T030 [US2] Ran the exactness suite; fixed the engine where it disagreed: handling-fee waiver compared against uppercased `waived_for_tiers` (case bug); two test expectations were corrected only after hand-re-derivation against `$semantics` proved the engine right. All exactness suites green.

**Checkpoint**: All pricing exactness green (exactness suite: 14 + 9 + 7 + 3 = 33 tests).

---

## Phase 5: User Story 3 — Merchant sees honest results when carriers fail (Priority: P3)

**Goal**: Deliberate degradation: budget-aware 429 retry, deadline give-ups named honestly, the no-service lane rendered as a state (never an error), and a retry path in the UI.

**Independent Test**: Resilience tests + submit US→JP in the UI → no-service state with a retry button.

### Tests for User Story 3

- [x] T031 [P] [US3] `apps/api/src/quotes/resilience.spec.ts` using the SEEDED vendors (seed 3 verified by scan to fail SwiftPost's first call): partial-failure (Meridian QUOTED, SwiftPost FAILED UPSTREAM_DOWN, done), slow-carrier (`CARRIER_TIMEOUT_MS=60` → GIVEN_UP CARRIER_TIMEOUT for both vendors, Meridian QUOTED), no-service US→JP (all three NO_SERVICE, valid empty result, done)
- [x] T032 [US3] Budget-aware retry in `quotes.service.ts`: Atlas 429 retried only when `elapsed + retryAfterMs + worst-case latency` fits the remaining `REQUEST_DEADLINE_MS`; each carrier settles exactly one terminal outcome; strategy change ⇒ reseed fixtures (documented)
- [x] T033 [US3] UI states in `RatesList.tsx`/`QuotePanel.tsx`: partial banner naming each failed carrier, no-service state for all-NO_SERVICE, retry button re-running the last shipment
- [x] T034 [US3] Extended `apps/web/tests/quote-panel.test.tsx`: partial names Atlas, no-service state renders, retry re-submits (fetch called again, partial clears)
- [x] T035 [US3] Ran api + web suites until green (api 39/39, web 6/6)

**Checkpoint**: Degradation is deliberate, honest, and tested.

---

## Phase 6: User Story 4 — Merchant's account and history stay private (Priority: P4)

**Goal**: Scoped history: `GET /quotes` returns only the caller's requests, proven by the tenant-isolation test that FAILS if scoping breaks.

**Independent Test**: The tenant-isolation e2e test passes; merchant A's history shows only A's quotes.

### Tests for User Story 4

- [x] T036 [P] [US4] `apps/api/test/tenant-isolation.e2e.ts` FIRST: A quotes (captures request ids from the stream), B's `GET /quotes` contains none of A's ids, A's own list contains them, no-token → 401. Header documents that the test MUST fail if scoping breaks.

### Implementation for User Story 4

- [x] T037 [US4] `GET /quotes` in `quotes.controller.ts` + `quotes.service.ts`: `findMany({ where: { merchantId: jwt.sub } })` with rates, newest first, shape per `contracts/http-api.md`; no merchant id ever accepted from the client
- [x] T038 [US4] `apps/web/src/components/HistoryView.tsx`: fetch `GET /quotes` with the stored token, render own past requests with per-carrier outcomes (amounts and failures alike)
- [x] T039 [US4] Tenant-isolation e2e green (api 41/41)

**Checkpoint**: Multi-tenant scoping is proven, not promised.

---

## Phase 7: User Story 5 — Evaluator runs and verifies the whole deliverable (Priority: P5)

**Goal**: One-command run, reproducible bench figures, short README, deterministic suite.

**Independent Test**: Fresh clone → `docker-compose up` → login → `npm run bench` → `npm test` ×3.

### Implementation for User Story 5

- [x] T040 [US5] `scripts/bench.ts` + `npm run bench`: login, 200 sequential POSTs US→GB (seed fixed), client-measured first-rate and done per request (performance.now + incremental stream parse), p95 report, PASS/FAIL against the contract. FULL RUN: p95 first-rate 25.8 ms, p95 complete 2981 ms — PASS
- [x] T041 [US5] `docker-compose.yml` full stack: `apps/api/Dockerfile` (npm ci, build, `prisma migrate deploy` + seed in entrypoint) + `apps/web/Dockerfile` (build, serve) with a shared dbdata volume; Dockerfiles reviewed for build-correct structure; full compose flow requires Docker — unavailable in the build sandbox (flagged in the completion report)
- [x] T042 [US5] README: run in under five minutes, seeded credentials table for both tiers, latency numbers + one paragraph, one-line DB rationale, shortcuts ≤ 250 words; `PROMPTS.md` documenting AI assistance
- [x] T043 [US5] Determinism pass: `dotenv/config` first import verified; `PROVIDER_SEED` fixed before provider imports in both e2e setup and fixtures; `npm test` ×3 consecutive → 56/56 ×3, zero flakes; bench reproduced twice with contract met

**Checkpoint**: The deliverable is runnable, measurable, and reproducible by a stranger.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story verification before submission.

- [x] T044 `npm run typecheck` in every workspace → 0 errors (starter files type-check unmodified; api tests type-check with `module: esnext` for top-level await)
- [x] T045 Constitution sweep: `packages/starter/` byte-identical to `starter/` across lib/, providers/, rate-cards/ (only the added `index.ts` wrapper differs); shared schemas contain no carrier-coverage rules (only the "deliberately absent" comment); no merchant identity ever read from the request body (tier/accountRef resolve from JWT + merchant record); all merchant-facing amounts integer USD cents
- [x] T046 Quickstart scenarios: V1 login ✓, V2 stream + latency ✓ (bench), V3 determinism ✓ (×3 suite), V4 tier pricing ✓ (exactness suite), V5 no-service ✓, V6 partial + retry ✓, V7 tenant isolation ✓, V8 bench ✓ (full 200-run), V9 repeated tests ✓ — all validated in this environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — BLOCKS all user stories
- **User Stories (Phases 3–7)**: after Foundational, in priority order US1 → US2 → US3 → US4 → US5
- **Polish (Phase 8)**: after all stories

### User Story Dependencies

- **US1 (P1)**: after Phase 2 — the MVP
- **US2 (P2)**: after US1 (tests the engine US1 shipped)
- **US3 (P3)**: after US1 (refines its orchestrator and UI)
- **US4 (P4)**: after US1 (needs persisted quotes to have history)
- **US5 (P5)**: after US1–US4 (benches and documents the whole)

### Within Each User Story

- Test tasks written FIRST and made to fail (or expose wrong answers) before implementation
- Types/contracts before adapters; adapters before orchestration; orchestration before controller; backend before its UI
- Story checkpoint green before the next story

### Parallel Opportunities

- Phase 1: T002–T006 fully parallel
- Phase 2: T010–T012 parallel; T013 after T008–T009; T014 independent
- US1: T017/T018/T019/T020 parallel once types exist; T015/T016 parallel with them
- US2: T026–T028 parallel
- US5: T040 and T041 parallel; T042 after T041

---

## Parallel Example: User Story 1

```bash
# Once T017 (carrier types) was committed, the three carriers ran together:
Task: "T018 Meridian engine in apps/api/src/carriers/meridian.carrier.ts"
Task: "T019 SwiftPost adapter in apps/api/src/carriers/swiftpost.carrier.ts"
Task: "T020 Atlas adapter in apps/api/src/carriers/atlas.carrier.ts"

# Tests for the story ran in parallel with the carriers:
Task: "T015 Integration test apps/api/test/quotes-stream.e2e.ts"
Task: "T016 Frontend test apps/web/tests/quote-panel.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (workspaces compile)
2. Phase 2: Foundational (DB, auth, schemas, money/time helpers)
3. Phase 3: US1 — streaming quotes end to end
4. STOP and VALIDATE: quickstart.md V1–V2 pass
5. Demo-able product: log in, quote US→GB, watch rates arrive

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate (MVP)
3. US2 → exactness suite green → validate V3/V4
4. US3 → honest degradation → validate V5/V6
5. US4 → tenant isolation proven → validate V7
6. US5 → bench + README + compose → validate V1/V8/V9
7. Phase 8 → constitution sweep + full quickstart

### Solo-Executor Notes (weaker-model guardrails)

- Execute tasks strictly in ID order within a phase; never start a story before its checkpoint
- When a task says VERIFY, run the command before checking the box — do not assume
- Never modify `packages/starter/**` — lib/, providers/, rate-cards/ are read-only
- When a pricing test disagrees with the engine, the EXPECTED value wins (re-read `$semantics`)
- All commands run from the repo root unless the task says otherwise

---

## Notes

- [P] = different files, no dependencies; [Story] label maps to spec.md user stories
- Pinned constants live inline in the tasks AND in the referenced docs — they are the same numbers; if they ever disagree, `Task.pdf` + `$semantics` win
- Tests are mandated by the spec (FR-032–FR-036); they were not optional here
- Commit after each task or logical group; `packages/starter` stayed byte-identical to `starter/`
- **Execution record**: all 46 tasks completed and verified. The database was
  iterated twice per stakeholder direction: initially SQLite (no Docker in the
  sandbox), then switched to PostgreSQL — the stakeholder's hosted Aiven instance
  for the application, a reset-guarded dedicated `qqe_test` database for the test
  suite, and a self-contained `postgres:16` service in docker-compose (research.md
  R7 documents the evolution).