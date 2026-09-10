<!--
Sync Impact Report
==================
Version change: (unratified template, no prior version) → 1.0.0
Modified principles: none (initial ratification; all template placeholders replaced)
Added sections:
  - Core Principles I–V (Exact Money & Units; Deterministic Time & Seeding;
    Client-Measured Latency Contract; Partial Results Over Hung Requests;
    Shared-Schema Validation at the Boundary)
  - Non-Negotiable Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: none
Follow-up TODOs: none (no placeholders intentionally deferred)
-->

# Fincart Quick Quote Engine Constitution

## Core Principles

### I. Exact Money & Units (NON-NEGOTIABLE)
- All merchant-facing monetary amounts MUST be USD minor units (integer cents).
- Currency conversion MUST use the fixed rates in `FX_RATES` (`.env`); live FX lookups
  are forbidden.
- Rounding MUST be half away from zero (745.5 → 746). Banker's rounding is forbidden.
- Round only at the points a rule explicitly names; carry full precision in between.
- Convert each monetary component separately, in minor units, then round; never convert a
  total and derive components from it.
- Mass: 1 kg = 2.20462262 lb. Length: 1 in = 2.54 cm exactly. Conversions passed to
  vendors MUST be unrounded.
- Rationale: arithmetic is checked against pinned reference cases; exactness is scored.

### II. Deterministic Time & Seeding
- Anything time-dependent in pricing MUST derive from `quotedAt` (ISO 8601, defaults to
  now), never from a direct clock read.
- Environment config MUST be loaded BEFORE importing anything under
  `starter/providers/`, or `PROVIDER_SEED` is silently ignored and nothing reproduces.
- Tests MUST pass on repeated runs without flaking; a fixed seed plus `quotedAt`-driven
  time is the sanctioned mechanism.
- Rationale: quotes must be reproducible and tests deterministic, despite carrier
  randomness and time-of-day pricing rules.

### III. Client-Measured Latency Contract (NON-NEGOTIABLE)
- p95 time-to-first-rate MUST be < 800 ms and p95 time-to-complete MUST be < 3,500 ms,
  measured at the client, not server-side, over 200 sequential US → GB quote requests
  with `PROVIDER_SEED` fixed.
- Rates MUST stream to the client as they arrive; the fast carrier appears before the
  slow ones.
- A reproducible benchmark script (e.g. `npm run bench`) MUST ship with the repo.
- Rationale: the latency contract is a hard requirement of the product, not an
  aspiration.

### IV. Partial Results Over Hung Requests
- Carriers fail ~18–20% of the time and Atlas rate-limits; a partial result is a good
  result and a hung request is not.
- Failure and degradation behavior MUST be a deliberate design choice — bounded by the
  configured per-carrier and overall deadlines — and ready to explain.
- The UI MUST state honestly which carriers failed (partial-success state) and provide a
  retry path.
- Rationale: graceful degradation under vendor unreliability is a core product property.

### V. Shared-Schema Validation at the Boundary
- Zod schemas MUST live in a `packages/shared` workspace and be reused by both client
  and server.
- The API MUST reject zero or negative weight, impossible dimensions, malformed country
  codes, malformed timezone names, and malformed `quotedAt`.
- Carrier serviceability is NOT a validation concern: an unserved lane is a valid
  request with an empty no-service result. Carrier coverage MUST NOT be encoded in the
  shared schema.
- Rationale: one request contract is the single source of truth for both sides, without
  smuggling business coverage into it.

## Non-Negotiable Constraints

- `starter/providers/swiftpost.ts`, `starter/providers/atlas.ts`, and
  `starter/lib/rng.ts` are read-only vendor code. Only the import line pointing to
  `rng.ts` may be changed, and only to fix the path.
- The copied `starter/` code MUST type-check under `tsc --strict` with `@types/node`
  installed; if it does not, the path is wrong.
- The `$semantics` block in `starter/rate-cards/meridian.json` is the authoritative
  specification for Meridian pricing (rounding, chargeable weight, weight breaks, fuel,
  oversize, remote-area, handling, business-day transit, tax). Ambiguity is resolved by
  re-reading `$semantics`.
- Two Meridian rules need context beyond a pure `(shipment) => Rate` function (account
  tier from the rate card; Atlas carrier account reference). Accommodating them is a
  deliberate design decision that must be documented.
- Merchant identity never comes from the request body: account tier and carrier account
  reference come from the JWT and the merchant record.
- Every rate returned MUST carry at minimum: carrier, service, base price, tax, total,
  and an estimated delivery date or range.
- Auth surface: `POST /auth/login` issues a JWT (seeded merchants only — no signup, no
  password reset, no refresh tokens). `GET /quotes` returns only the calling merchant's
  history. An automated test MUST fail if merchant A can read merchant B's history.
- At least one standard and one enterprise merchant MUST be seeded, with both credential
  sets in the README (tier-dependent pricing is tested). The database choice is
  documented in the README in one line.

## Development Workflow & Quality Gates

- Tests: quality over coverage — prefer tests that would catch a real regression over
  volume that asserts mock behaviour.
- Required test cases: rate-card boundaries with exact answers (weight-break edges,
  surcharge cap, rounding rule), aggregation partial-failure and slow-carrier cases, one
  integration test hitting a real HTTP endpoint, the tenant-isolation test from Part 2,
  and one frontend test of the author's choosing.
- Frontend: single-page form using React Hook Form + the shared Zod schema; four honest
  states (loading, partial success naming failed carriers, complete,
  no-service-for-this-lane); a retry path; keyboard-operable with real `<label>`
  elements and errors associated to their inputs. Styling is explicitly not evaluated —
  do not spend time there.
- README MUST be short and contain: (1) run instructions achievable in under five
  minutes (`docker-compose up` or equivalent) with seeded credentials for both merchant
  tiers; (2) measured latency numbers plus one paragraph on how they were hit; (3)
  shortcuts, max 250 words, naming the least-comfortable shortcut and what two more
  days would fix. Include `PROMPTS.md` if AI assistance was used.
- Deployment expectation is local docker-compose; no remote deployment is required.

## Governance

- This constitution supersedes ad-hoc practice for the Quick Quote Engine work; conflicts
  resolve in its favor.
- Amendments require documentation, an approval decision, and a migration plan for
  affected work before taking effect.
- Versioning follows MAJOR.MINOR.PATCH semantics: MAJOR for backward-incompatible
  principle removals or redefinitions, MINOR for new or materially expanded
  principles/sections, PATCH for clarifications and wording fixes.
- Every spec and change MUST be reviewed against these principles; deviations must be
  justified in writing.
- External authorities: the read-only starter files and the `meridian.json` `$semantics`
  block override this document on their own subject matter.

**Version**: 1.0.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-09-08
