# Shared Schemas Contract: Quick Quote Engine

**Feature**: specs/001-quick-quote-engine | **Date**: 2026-09-08

`packages/shared` holds the Zod schemas used by **both** the NestJS server and the
React Hook Form client — one source of truth for the request contract (constitution
Principle V). The schemas define shape and boundary validation only; carrier
serviceability is deliberately absent (FR-003): an unserved lane is a valid request
with an empty result.

## Shipment

Submitted as the body of `POST /quotes` (and bound by the frontend form).

| Field | Type | Rules |
|---|---|---|
| origin.countryCode | string | exactly two uppercase A–Z letters (ISO 3166-1 alpha-2) |
| origin.postcode | string | non-empty |
| origin.timezone | string | a valid IANA zone name (e.g. `America/New_York`); an offset like `-05:00` is invalid |
| destination.countryCode | string | two uppercase A–Z letters |
| destination.postcode | string | non-empty |
| parcel.weightKg | number | strictly > 0 (zero or negative rejected) |
| parcel.lengthCm | number | strictly > 0 |
| parcel.widthCm | number | strictly > 0 |
| parcel.heightCm | number | strictly > 0 (impossible dimensions rejected at the boundary) |
| quotedAt | string, optional | ISO 8601 datetime; omitted → the server defaults it to now |

Derived (server-side, not schema fields): chargeable weight, zone selection, unit
conversions to vendors — all per the pinned arithmetic (research R5).

## Rate (stream event payload and persisted row)

| Field | Type | Rules |
|---|---|---|
| carrier | enum `SWIFTPOST` \| `ATLAS` \| `MERIDIAN` | — |
| service | string | carrier service code |
| baseMinor / taxMinor / totalMinor | integer | USD cents; tax-exclusive base+tax = total for Meridian and Atlas; for SwiftPost the vendor amount is tax-inclusive, so base = amount − taxAmount and total = amount |
| currency | literal `USD` | presentation currency |
| etaFrom / etaTo | ISO date | estimated delivery date or range, derived from `quotedAt` only |

## CarrierStatus (stream event payload)

| Field | Type | Rules |
|---|---|---|
| carrier | enum as above | — |
| status | enum `FAILED` \| `NO_SERVICE` \| `GIVEN_UP` | terminal outcomes for carriers that produce no rate |
| errorCode | string | `UPSTREAM_DOWN`, `LANE_UNSERVED`, `RATE_LIMITED`, `DEADLINE`, … |
| errorDetail | string | human-readable; surfaced in the partial-success UI state |

## LoginRequest / LoginResponse

| Field | Type | Rules |
|---|---|---|
| LoginRequest.email | string | email format |
| LoginRequest.password | string | non-empty |
| LoginResponse.accessToken | string | JWT with merchant id as `sub` |
| LoginResponse.merchant | `{ id, email, tier }` | tier ∈ `standard` \| `plus` \| `enterprise` |

## Validation Error Shape

Schema failures return HTTP 400 with a field-pathed message list
(`{ statusCode, message: ["origin.timezone must be an IANA zone name"], error }`);
the frontend maps the same schema's field errors onto the corresponding inputs with
real `<label>` associations (FR-029).
