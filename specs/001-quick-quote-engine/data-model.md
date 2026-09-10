# Data Model: Quick Quote Engine

**Feature**: specs/001-quick-quote-engine | **Date**: 2026-09-08

Storage: PostgreSQL via Prisma — the application database is the hosted Aiven
instance; the test suite uses a dedicated `qqe_test` database on it (reset-guarded
by name); docker-compose provides its own `postgres:16` for the evaluator. Money
is always integer minor units (USD cents); shipment measurements use exact
decimals. Field-level validation rules come from the shared Zod schemas
([shared-schemas.md](./contracts/shared-schemas.md)) and are enforced at the API
boundary before anything is persisted. Enums (`MerchantTier`, `CarrierId`,
`QuoteRateStatus`) are real PostgreSQL enums.

## Entities

### Merchant

An account the evaluator can log in as. Seeded only — no signup, no reset, no refresh.

| Field | Type | Rules |
|---|---|---|
| id | UUID (PK) | issued at seed time |
| email | string, unique | login identifier; both seeded credential sets appear in the README |
| passwordHash | string | bcrypt; plaintext only ever in the README/seed config |
| tier | enum `STANDARD` \| `PLUS` \| `ENTERPRISE` | drives Meridian handling-fee waiver (`waived_for_tiers`: plus, enterprise); tier-dependent pricing is evaluated, so at least one STANDARD and one ENTERPRISE merchant must exist |
| carrierAccountRef | string | passed to Atlas as `accountRef`; comes from the merchant record, never the request body |
| createdAt | timestamp | — |

Relationships: one Merchant has many QuoteRequests.

### QuoteRequest

One submitted shipment, persisted on every request — including lanes where no
carrier quotes (those are valid requests with empty results).

| Field | Type | Rules |
|---|---|---|
| id | UUID (PK) | referenced by the stream's terminal `done` event and by history |
| merchantId | UUID (FK → Merchant) | from the JWT `sub`, never from the body — the row is scoped to its owner from birth |
| originCountry | char(2) | ISO 3166-1 alpha-2, uppercase |
| originPostcode | string | free-form; Meridian remote-area prefixes match on it case-insensitively with whitespace removed |
| originTimezone | string | IANA zone name (e.g. `America/New_York`), not an offset — needed for the Meridian cutoff and business-day counting |
| destinationCountry | char(2) | ISO 3166-1 alpha-2 |
| destinationPostcode | string | free-form |
| weightKg | decimal | > 0 |
| lengthCm / widthCm / heightCm | decimal | each > 0 (impossible dimensions rejected at the boundary) |
| quotedAt | timestamp | ISO 8601 from the request, defaulting to now; the sole time source for all pricing — stored verbatim for reproducibility |
| createdAt | timestamp | server receipt time, audit only (never used in pricing) |

Relationships: one QuoteRequest has many QuoteRates. State: a request row is created
when validation passes; its outcome set is final once the stream closes (every
carrier resolved, failed, or given up).

### QuoteRate

One row per carrier per request — including failures, no-service, and give-ups, so
history is honest and "persist every quote request and its results" is literally true.

| Field | Type | Rules |
|---|---|---|
| id | UUID (PK) | — |
| requestId | UUID (FK → QuoteRequest) | — |
| carrier | enum `SWIFTPOST` \| `ATLAS` \| `MERIDIAN` | — |
| status | enum `QUOTED` \| `FAILED` \| `NO_SERVICE` \| `GIVEN_UP` | see state transitions below |
| service | string, nullable | carrier service code (e.g. `SP-GROUND`, `atlas-intl-express`, Meridian's contracted service) |
| baseMinor / taxMinor / totalMinor | integer, nullable | USD cents; present iff status = QUOTED; per-component FX and half-away-from-zero rounding per the pinned money rules |
| currency | char(3), default `USD` | presentation currency is always USD |
| etaFrom / etaTo | date, nullable | estimated delivery date or range, derived from `quotedAt` (Meridian: business-day math; SwiftPost: calendar days; Atlas: hours range → date range) |
| errorCode | string, nullable | e.g. `UPSTREAM_DOWN`, `LANE_UNSERVED`, `RATE_LIMITED`, `DEADLINE` |
| errorDetail | string, nullable | human-readable reason shown in the partial-success UI state |
| arrivedAt | timestamp | when this carrier's outcome resolved relative to the request — makes the fast-carrier-first behavior inspectable |

Relationships: belongs to QuoteRequest.

## State Transitions (per QuoteRate, during one quote stream)

```text
carrier dispatched
  ├─ vendor/calculation returns a quote  → QUOTED        (money + eta fields set)
  ├─ vendor rejects lane/coverage (422)  → NO_SERVICE    (errorCode LANE_UNSERVED / coverage)
  ├─ vendor error (503/500/…, no budget) → FAILED        (errorCode from vendor)
  └─ deadline budget exhausted            → GIVEN_UP     (errorCode DEADLINE)
```

Atlas 429 is not a terminal state: it is retried only while the retry fits the
remaining overall budget (research R4); otherwise it ends as FAILED (RATE_LIMITED) or
GIVEN_UP (DEADLINE). A QuoteRequest is complete when all three carriers have reached
a terminal state; the stream emits `done` and closes; nothing ever hangs.

## Validation Rules (enforced by the shared Zod schemas at the boundary)

- Country codes: exactly two uppercase A–Z letters (ISO 3166-1 alpha-2).
- Timezone: a valid IANA zone name — an offset like `-05:00` is rejected.
- `quotedAt`: ISO 8601 datetime string; omitted → defaults to now.
- Weight: strictly positive number. Dimensions: all three strictly positive.
- Carrier serviceability is **not** validated and **must not** appear in the
  schema — an unserved lane is a valid request with an empty result
  (FR-003; constitution Principle V).

## Prisma Mapping Notes

- Money columns are `Int` (minor units) — never floats.
- `weightKg` and dimensions are `Decimal` — exactness matters because chargeable
  weight, weight breaks, and vendor unit conversions consume them.
- History query: `findMany({ where: { merchantId: jwt.sub } })` with rates included,
  newest first — the same guarded scope that the tenant-isolation test attacks as
  merchant A reading merchant B.
- Seed: three merchants — one STANDARD, one ENTERPRISE (required pair), one PLUS
  (exercises the middle tier) — credentials in the README.
