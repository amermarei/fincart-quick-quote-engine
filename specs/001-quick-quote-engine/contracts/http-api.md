# HTTP API Contract: Quick Quote Engine

**Feature**: specs/001-quick-quote-engine | **Date**: 2026-09-08

The service exposes one auth endpoint and one quote endpoint (two methods). All
request/response bodies are JSON unless noted; the quote response is an
`text/event-stream`. Authentication is `Authorization: Bearer <JWT>` on every quote
route. Shipment validation uses the shared schemas
([shared-schemas.md](./shared-schemas.md)) — the same schemas the frontend form uses.

Base URL (local docker-compose): `http://localhost:4000` (web app on its own port,
proxied where convenient).

---

## POST /auth/login

Issues a JWT for a seeded merchant. No signup, no reset, no refresh.

Request:

```json
{ "email": "<seeded email>", "password": "<seeded password>" }
```

Responses:

| Status | Body | Meaning |
|---|---|---|
| 201 | `{ "accessToken": "<jwt>", "merchant": { "id", "email", "tier" } }` | credentials accepted |
| 401 | `{ "statusCode": 401, "message": "Invalid credentials" }` | unknown email or wrong password |

The JWT carries the merchant id as `sub`; tier and carrier account reference are
resolved server-side from the merchant record on every request (never from the body,
never trusted from the token claims).

---

## POST /quotes

Submits a shipment and streams rates as they arrive. This is the one endpoint that
takes a shipment (FR-001); streaming is what makes the latency contract achievable
(research R2).

Request headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`,
`Accept: text/event-stream`.

Request body: the [Shipment schema](./shared-schemas.md#shipment) — origin
(country code, postcode, IANA timezone), destination (country code, postcode),
parcel (weightKg, lengthCm, widthCm, heightCm), optional `quotedAt` (ISO 8601,
default now).

Responses:

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ "statusCode": 400, "message": ["…"], "error": "Bad Request" }` | schema validation failed (weight, dimensions, country codes, timezone, or quotedAt) |
| 401 | `{ "statusCode": 401, "message": "Unauthorized" }` | missing/invalid JWT |
| 200 | `text/event-stream` | stream opens immediately; events below |

### Stream events (in arrival order; one terminal outcome per carrier)

`rate` — a successfully quoted carrier (minimum fields per FR-009):

```text
event: rate
data: {"carrier":"MERIDIAN","service":"…","baseMinor":…,"taxMinor":…,
       "totalMinor":…,"currency":"USD","etaFrom":"2026-09-21","etaTo":"2026-09-21"}
```

`carrier-status` — a carrier that will not produce a rate (partial success is a good
result; the UI names these honestly):

```text
event: carrier-status
data: {"carrier":"ATLAS","status":"FAILED"|"NO_SERVICE"|"GIVEN_UP",
       "errorCode":"…","errorDetail":"…"}
```

`done` — terminal event; every carrier has resolved or been given up on; the stream
closes after it:

```text
event: done
data: {"requestId":"<uuid>"}
```

Timing contract (client-measured, 200 sequential US → GB requests, seed fixed):
p95 first `rate` event < 800 ms; p95 `done` event < 3,500 ms. The local Meridian
calculation is emitted first in practice; remote carriers emit as they resolve or
hit their deadline budgets (research R4). A lane no carrier serves is a valid
request: the stream contains only `carrier-status` NO_SERVICE events plus `done`,
and the UI renders the no-service state — it is never a 4xx.

Every request — including no-service and all-failed ones — is persisted with its
per-carrier outcomes before `done` is emitted.

---

## GET /quotes

Returns the calling merchant's quote history — only theirs (FR-026; the
tenant-isolation test attacks this).

Headers: `Authorization: Bearer <JWT>`.

Responses:

| Status | Body | Meaning |
|---|---|---|
| 401 | `{ "statusCode": 401, "message": "Unauthorized" }` | missing/invalid JWT |
| 200 | `{ "quotes": [ QuoteRecord… ] }` | the caller's records, newest first |

`QuoteRecord`: `{ id, quotedAt, createdAt, shipment: { origin, destination, parcel },
rates: [ { carrier, status, service?, baseMinor?, taxMinor?, totalMinor?, currency,
etaFrom?, etaTo?, errorCode?, errorDetail? } ] }` — the persisted shape from
[data-model.md](../data-model.md).

Scoping is by the JWT `sub` only; any attempt to reach another merchant's records
(e.g. guessing a request id) must fail — there is no endpoint that takes a merchant
id as input.
