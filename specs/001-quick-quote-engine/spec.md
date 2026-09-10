# Feature Specification: Quick Quote Engine

**Feature Branch**: `001-quick-quote-engine`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "read the task.pdf very carefully and know every detail of the task before continuing planning" — resolved to the complete Fincart "Quick Quote Engine" brief in `Task.pdf`, including the authoritative starter material (`starter/providers/swiftpost.ts`, `starter/providers/atlas.ts`, `starter/lib/rng.ts`, `starter/rate-cards/meridian.json`, `.env.example`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant gets a comparable quote list in seconds (Priority: P1)

A logged-in merchant fills in a shipment (origin country, postcode and IANA timezone;
destination country and postcode; parcel weight and dimensions; optional quote timestamp)
and receives a single, comparable list of rates from all three carriers — SwiftPost and
Atlas via their vendor integrations, and Meridian Freight via our contracted rate card.
Rates stream onto the screen as they arrive; the fastest carrier's rate appears first.
The whole exchange is bounded: the first usable rate reaches the merchant quickly and
everything that will arrive, or be given up on, completes within the overall deadline.

**Why this priority**: choosing a courier in seconds is the product's entire reason to
exist; the latency contract (p95 time-to-first-rate < 800 ms, p95 time-to-complete
< 3,500 ms, measured at the client) is a hard requirement, not an aspiration.

**Independent Test**: log in with seeded credentials, submit a valid US → GB shipment,
and observe rates arriving one by one with the timing measured at the client.

**Acceptance Scenarios**:

1. **Given** a logged-in merchant, **When** they submit a valid US → GB shipment,
   **Then** rates render as they arrive, the fastest carrier's rate is visible first,
   p95 time-to-first-rate is under 800 ms, and p95 time-to-complete is under 3,500 ms
   over 200 sequential requests with the provider seed fixed.
2. **Given** the same shipment, the same `quotedAt`, and a fixed provider seed,
   **When** the quote is repeated, **Then** identical rates are returned (quotes are
   reproducible; anything time-dependent derives from `quotedAt`, never the clock).
3. **Given** any successfully quoted carrier, **When** its rate is displayed,
   **Then** it carries at minimum: carrier, service, base price, tax, total (all in USD
   integer cents), and an estimated delivery date or range.

---

### User Story 2 - Merchant trusts the numbers (Priority: P2)

A merchant compares prices knowing the arithmetic is exact and pinned: amounts are
presented in USD integer cents; foreign-currency components are converted with the
configured fixed rates (no live FX lookups) and each component is converted and rounded
separately; rounding is half away from zero and happens only where a rule says so.
Meridian prices follow the contracted rate card's `$semantics` precisely — chargeable
weight rounded up to 0.5 kg, weight-break boundaries inclusive of the break below, fuel
surcharge rounded then capped, oversize and remote-area surcharges, handling fee waived
for plus/enterprise merchants, tax applied to base plus all surcharges, and delivery
estimates counted in business days against the contract's own holiday calendar and
local cutoff times. Merchant tier and carrier account reference come from the
authenticated merchant record, never the request body, so tier-dependent pricing is
consistent and testable.

**Why this priority**: the evaluator checks arithmetic against reference cases with
exact answers; wrong money breaks both trust and the assessment.

**Independent Test**: run the rate-card test cases (weight-break edges, the surcharge
cap, the rounding rule) and confirm exact expected amounts in cents.

**Acceptance Scenarios**:

1. **Given** a Meridian chargeable weight of exactly 5.0 kg, **When** priced,
   **Then** the "up to 5 kg" break applies (not the 5-to-20 break) and the total
   matches the exact expected cents.
2. **Given** a plus or enterprise merchant, **When** a Meridian quote is priced,
   **Then** the handling fee is waived entirely; a standard-tier merchant is charged
   it once per quote request.
3. **Given** an Atlas quote returned in CAD, **When** presented, **Then** price and tax
   are each converted to USD cents separately at the fixed rate and rounded half-up —
   never a converted total with components derived from it.
4. **Given** a quote requested at or after the zone's local cutoff in the origin
   timezone, **When** the delivery estimate is computed, **Then** one business day is
   added before counting; the quote date itself is never counted as a transit day; and
   origin-country holidays from the contract calendar are excluded.

---

### User Story 3 - Merchant sees honest results when carriers fail (Priority: P3)

Carriers fail roughly 18–20% of the time and Atlas rate-limits. A merchant who submits a
shipment still gets value: successful carriers' rates arrive, the carriers that failed or
were given up on are named honestly, and a retry path is offered. A lane that no carrier
serves is a valid request that renders as "no service for this lane" — an empty, honest
result rather than an error. No request ever hangs: waiting is bounded by per-carrier and
overall deadlines, and the degradation behaviour is a deliberate, explainable design
choice.

**Why this priority**: with unreliable vendors, the difference between a hung request
and a partial result is the difference between an unusable and a usable product.

**Independent Test**: exercise the partial-failure and slow-carrier aggregation cases,
and submit a no-service lane (e.g. US → JP) through the form.

**Acceptance Scenarios**:

1. **Given** one carrier failing, **When** results render, **Then** the other carriers'
   rates appear and the failed carrier is named as failed (partial-success state).
2. **Given** a lane no carrier serves (e.g. US → JP), **When** the shipment is
   submitted, **Then** the request is valid and returns an empty result rendered as
   no-service, not an error.
3. **Given** a failed or incomplete quote, **When** the merchant chooses retry,
   **Then** a fresh quote attempt runs.
4. **Given** a carrier exceeding its per-carrier deadline or the overall request
   deadline arriving, **When** the request completes, **Then** it completes without
   hanging, returning whatever arrived plus named failures.

---

### User Story 4 - Merchant's account and history stay private (Priority: P4)

A merchant logs in with seeded credentials and receives a token. Every quote request and
its results are persisted. A merchant can review their own quote history — and only
their own: another merchant's history is never readable, and this isolation is proven by
an automated test that fails if the scoping breaks.

**Why this priority**: multi-tenant trust is non-negotiable, and the tenant-isolation
test is an explicit deliverable.

**Independent Test**: log in as merchant A, request quote history, and verify only A's
records return; run the isolation test that must fail if merchant A can read merchant
B's history.

**Acceptance Scenarios**:

1. **Given** a logged-in merchant, **When** they request their quote history,
   **Then** only their own quote requests and results are returned.
2. **Given** merchant A's session, **When** an attempt is made to read merchant B's
   quote history, **Then** the attempt fails, proven by an automated test.

---

### User Story 5 - Evaluator runs and verifies the whole deliverable (Priority: P5)

The evaluator clones the repository, starts everything with one command (docker-compose
or equivalent), logs in with README-documented credentials for both a standard-tier and
an enterprise-tier merchant, reproduces the latency figures with the included benchmark
script, and runs a deterministic test suite that passes repeatedly without flaking. The
README stays short: how to run it in under five minutes, the latency numbers with one
paragraph on how they were hit, and a shortcuts section (max 250 words) naming the least
comfortable shortcut and what two more days would fix.

**Why this priority**: "If we cannot run it in under five minutes we cannot assess it" —
runnability and verifiability gate everything else.

**Independent Test**: from a clean environment, follow the README verbatim: start,
log in with both tiers, run the benchmark, run the tests.

**Acceptance Scenarios**:

1. **Given** a clean environment with the prerequisites, **When** the evaluator follows
   the README, **Then** the system is running within five minutes.
2. **Given** the included benchmark script, **When** run against the US → GB lane with
   the provider seed fixed, **Then** it reports reproducible p95 time-to-first-rate and
   time-to-complete numbers measured at the client.
3. **Given** the test suite, **When** run repeatedly, **Then** it passes every run
   without flaking, despite carrier randomness and time-of-day rules.

---

### Edge Cases

- Chargeable weight exactly on a 0.5 kg multiple stays (6.0 → 6.0); just above rounds
  up (6.01 → 6.5). Weight exactly 1.0 / 5.0 / 20.0 kg selects the break below, not the
  next one up.
- Oversize is strictly greater than 120 cm on any single dimension: exactly 120 is not
  oversize; 120.01 is.
- Remote-area postcode prefixes match case-insensitively with all whitespace removed
  ("iv1 …" matches the IV prefix).
- Zone C fuel surcharge is rounded first, then capped at the cap amount; a computed
  surcharge above the cap pays the cap.
- A quote exactly at the local cutoff time counts as at-or-after (+1 business day); a
  quote on a weekend or holiday never counts the quote date itself as a transit day;
  years absent from the holiday calendar have no holidays — the contract calendar is
  authoritative and is never supplemented with public holiday data.
- `quotedAt` malformed → rejected; absent → defaults to now; a timezone given as an
  offset instead of an IANA zone name → rejected.
- Zero or negative weight, impossible (non-positive) dimensions, and country codes that
  are not ISO 3166-1 alpha-2 → rejected with field-associated validation errors.
- SwiftPost returns a tax-inclusive USD amount: the presented base price is derived as
  amount minus tax amount; the total is the amount itself — no double conversion.
- Atlas returns CAD in major units with tax exclusive: each component converts
  separately; a 429 carries a retry hint that is safe to honour only within deadlines;
  a 5xx may or may not be retried.
- A carrier exceeding its deadline is given up on and named as failed, never awaited
  indefinitely; if all carriers fail, the response still completes without hanging and
  names every failure.
- A lane served by only some carriers returns only those carriers' rates (absence is
  not an error).

## Requirements *(mandatory)*

### Functional Requirements

**Quote request and validation**

- **FR-001**: The system MUST expose one authenticated endpoint that accepts a shipment
  — origin (country code, postcode, IANA timezone name), destination (country code,
  postcode), parcel (weight kg; length, width, height cm), and optional `quotedAt`
  (ISO 8601, defaulting to now) — and returns rates from all three carriers.
- **FR-002**: Validation schemas MUST be shared between client and server from a single
  shared package. The server MUST reject zero or negative weight, impossible
  dimensions, malformed country codes (not ISO 3166-1 alpha-2), malformed timezone
  names (not IANA zone names), and malformed `quotedAt` (not ISO 8601).
- **FR-003**: Carrier serviceability MUST NOT be encoded in the shared validation
  schemas; a lane no carrier serves is a valid request with an empty result.

**Money and units (pinned arithmetic)**

- **FR-004**: All merchant-facing monetary amounts MUST be USD minor units (integer
  cents).
- **FR-005**: Currency conversion MUST use the fixed rates from configuration (e.g.
  CAD 0.73); live FX lookups are forbidden.
- **FR-006**: Rounding MUST be half away from zero (745.5 → 746; banker's rounding
  forbidden), applied only at the points a rule names, with full precision carried in
  between.
- **FR-007**: FX conversion MUST convert each monetary component separately, in minor
  units, then round; a total MUST NOT be converted with components derived from it.
- **FR-008**: Unit conversions MUST use exactly 1 kg = 2.20462262 lb and 1 in = 2.54 cm,
  and converted values passed to vendors MUST be unrounded.
- **FR-009**: Every returned rate MUST carry at minimum: carrier, service, base price,
  tax, total, and an estimated delivery date or range.

**Meridian rate-card pricing (per `$semantics`, which is authoritative)**

- **FR-010**: Chargeable weight MUST be max(actual kg, volume / volumetric divisor)
  rounded UP to the nearest 0.5 kg multiple; a value already on a multiple is unchanged.
- **FR-011**: Weight breaks MUST select the first break whose up_to_kg is ≥ chargeable
  weight; flat breaks are the base, otherwise base = break.base + ceil(chargeable −
  from_kg) × per_kg; boundaries are inclusive of the break below (exactly 5.0 selects
  the up-to-5 break).
- **FR-012**: Fuel surcharge MUST be the configured percent of base, rounded, then
  capped at the configured cap where present (round before capping).
- **FR-013**: The oversize surcharge MUST apply when any single dimension is strictly
  greater than the configured threshold (exactly 120 cm is not oversize).
- **FR-014**: The remote-area surcharge MUST apply when the destination postcode starts
  with any listed prefix, compared case-insensitively with all whitespace removed.
- **FR-015**: The handling fee MUST be charged once per quote request and MUST be
  waived entirely for merchants whose account tier is in the waived set (plus,
  enterprise).
- **FR-016**: Tax MUST be the zone's tax percent applied to (base + all surcharges,
  including the handling fee), rounded; total MUST be base + surcharges + tax.
- **FR-017**: Delivery estimates MUST count transit business days Mon–Fri excluding
  origin-country holidays from the contract's authoritative calendar; day 1 is the
  first business day strictly after the quote date in the origin timezone (the quote
  date is never counted); a quote at or after the zone's local cutoff adds one business
  day before counting. Years not listed in the calendar have no holidays, and the
  calendar MUST NOT be supplemented with public holiday data.
- **FR-018**: Meridian zone selection (and its tax percent) MUST follow the lanes
  listed in the rate card; lanes outside the listed zones have no Meridian service and
  MUST NOT be priced.

**Determinism**

- **FR-019**: All time-dependent pricing MUST derive from `quotedAt` rather than a
  direct clock read; the same shipment, `quotedAt`, and fixed provider seed MUST
  reproduce identical quotes.
- **FR-020**: Environment configuration MUST be loaded before any provider module is
  imported (the provider seed is read at module load; configuring after import silently
  disables reproducibility). Each provider holds one RNG stream for the process, so a
  different retry strategy changes the random draws — reproducibility is per-strategy.

**Latency contract**

- **FR-021**: The system MUST meet, measured at the client over 200 sequential US → GB
  quote requests with the provider seed fixed: p95 time-to-first-rate < 800 ms and p95
  time-to-complete < 3,500 ms. A reproducible benchmark script (e.g. `npm run bench`)
  MUST be included so the figures can be reproduced.

**Resilience**

- **FR-022**: Partial results MUST be good results: a carrier that fails, is
  rate-limited, or exceeds its deadline MUST be excluded and named as failed without
  blocking the response; waiting MUST be bounded by per-carrier and overall deadlines;
  failure and degradation behaviour MUST be a deliberate, documented design choice.
- **FR-023**: Atlas rate-limit (429) responses carry a retry hint and are safe to retry
  within the deadlines; 5xx responses MAY be treated as non-retryable. Retry behaviour
  MUST NOT hang the request.

**Auth and persistence**

- **FR-024**: The system MUST provide a login endpoint issuing a JWT for seeded
  merchants; no signup, no password reset, no refresh tokens.
- **FR-025**: Every quote request and its results MUST be persisted.
- **FR-026**: Quote history MUST return only the calling merchant's records, and an
  automated test MUST fail if merchant A can read merchant B's history.
- **FR-027**: Merchant accounts MUST carry an account tier (standard | plus |
  enterprise) and a carrier account reference; both MUST come from the JWT and the
  merchant record, never the request body; the tier feeds the rate card and the
  reference feeds Atlas.
- **FR-028**: At least one standard and one enterprise merchant MUST be seeded, with
  both credential sets documented in the README (tier-dependent pricing is evaluated).

**Frontend**

- **FR-029**: The UI MUST be a single-page shipment form using React Hook Form with the
  shared validation schema, keyboard-operable, with real `<label>` elements and errors
  associated to their inputs.
- **FR-030**: Rates MUST render as they arrive, consistent with the latency contract —
  the fast carrier's rate appears before the slow ones.
- **FR-031**: The UI MUST handle four states honestly: loading, partial success (some
  carriers failed — say which), complete, and no-service-for-this-lane; and MUST
  provide a retry path when things fail. Styling is explicitly not evaluated.

**Tests**

- **FR-032**: The test suite MUST be deterministic — passing on repeated runs without
  flaking, with the provider seed fixed before providers load and time driven from
  `quotedAt`.
- **FR-033**: Rate-card logic MUST be tested with real cases including the boundaries —
  weight-break edges, the surcharge cap, and the rounding rule — with exact answers.
- **FR-034**: Aggregation MUST be tested for a partial-failure case and a slow-carrier
  case.
- **FR-035**: One integration test MUST hit a real HTTP endpoint.
- **FR-036**: One frontend test MUST be included (of the author's choosing).

**Delivery**

- **FR-037**: The README MUST be short and contain: (1) run instructions achievable in
  under five minutes (docker-compose up or equivalent) with seeded credentials for both
  merchant tiers; (2) the measured latency numbers plus one paragraph on how they were
  hit; (3) a shortcuts section of at most 250 words naming the least-comfortable
  shortcut, why it was taken, and what two more days would change. `PROMPTS.md` MUST be
  included if AI assistance was used.
- **FR-038**: The read-only starter files (both vendor SDKs, the RNG support library,
  the rate-card data) MUST remain unmodified except the single import line fixing the
  path to the RNG library; the copied starter code MUST type-check under strict
  TypeScript with Node type definitions installed — if it does not, the path is wrong.
- **FR-039**: Deployment MUST be local docker-compose; no remote deployment is required.

### Key Entities *(include if feature involves data)*

- **Merchant**: an account with login credentials, an account tier
  (standard | plus | enterprise), and a carrier account reference; owns quote history.
- **Shipment (quote request)**: origin (country code, postcode, IANA timezone),
  destination (country code, postcode), parcel (weight kg, dimensions cm), and optional
  `quotedAt` (ISO 8601, defaulting to now).
- **Rate**: a quoted price for a shipment from one carrier — carrier, service, base
  price, tax, total (USD cents), estimated delivery date or range, and per-carrier
  outcome (quoted | failed-with-reason | no-service | given-up-on-deadline).
- **Quote record**: the persisted pairing of a shipment request with the full set of
  carrier rates and outcomes, scoped to one merchant.
- **Rate card (Meridian)**: the contracted pricing data — zones and tax percents,
  volumetric divisors, weight breaks, fuel/oversize/remote/handling surcharges, cutoff
  times, transit days, and the authoritative holiday calendar — interpreted strictly
  per its `$semantics` block.
- **Auth session**: a JWT identifying the calling merchant, from which tier and carrier
  account reference are resolved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Over 200 sequential US → GB quote requests with the provider seed fixed,
  measured at the client: p95 time-to-first-rate is under 800 ms and p95
  time-to-complete is under 3,500 ms, reproducible via the included benchmark script.
- **SC-002**: 100% match against reference arithmetic cases: rounding (half away from
  zero), per-component FX conversion, unit conversions, and rate-card boundaries
  (weight-break edges, fuel-surcharge cap, 0.5 kg chargeable-weight round-up,
  cutoff/holiday transit counting).
- **SC-003**: The full test suite passes on repeated consecutive runs without flaking,
  covering rate-card boundaries, partial-failure and slow-carrier aggregation, one real
  HTTP integration test, tenant isolation, and one frontend test.
- **SC-004**: An evaluator following the README gets the system running within five
  minutes and can log in with both seeded merchant tiers, observing tier-dependent
  pricing differences.
- **SC-005**: Merchant A cannot read merchant B's quote history — proven by an
  automated test that fails if the scoping breaks.
- **SC-006**: The same shipment, `quotedAt`, and provider seed produce identical quotes
  across repeated runs.
- **SC-007**: All four interface states are demonstrably handled — loading, partial
  success naming the failed carriers, complete, and no-service-for-this-lane — and a
  retry path recovers from failure.
- **SC-008**: A lane no carrier serves returns a valid, empty, honestly-rendered
  result rather than an error, and no request ever hangs waiting for a carrier.

## Assumptions

- SwiftPost's returned amount is tax-inclusive USD minor units; the presented base
  price is derived as amount minus tax amount, and the total is the amount itself.
- Atlas's ETA (an hours range) converts to an estimated delivery date range derived
  from `quotedAt`; Atlas prices in CAD and each monetary component (price, tax) is
  converted and rounded separately at the fixed rate.
- "Impossible dimensions" means non-positive length, width, or height; no
  upper-bound rule is invented (carrier coverage stays out of validation).
- The two Meridian rules that need context beyond a pure `(shipment) => Rate` function
  — the tier-dependent handling fee and the time-and-timezone-dependent transit
  counting — are accommodated by an explicit design choice to be settled at planning
  time; the brief leaves the accommodation open on purpose.
- Seeded merchants with static credentials are acceptable for auth; both credential
  sets live in the README.
- Styling is not evaluated: unstyled semantic HTML scores the same as a polished
  design system; no time is spent on logos, brand colours, responsive grids, or
  animation.
- A benchmark run of roughly ten minutes is expected and acceptable.
- The starter material is copied into the repository wherever its structure wants the
  files; the vendor SDKs and RNG library stay read-only, and the rate card stays
  data-only (the pricing logic is ours to write).
- `$semantics` in the rate card is authoritative for interpretation; rate-card
  ambiguities are resolved by re-reading it, and its holiday calendar is never
  supplemented.
- Deployment is local docker-compose only; secrets and connection settings come from
  environment configuration copied from the provided example.
