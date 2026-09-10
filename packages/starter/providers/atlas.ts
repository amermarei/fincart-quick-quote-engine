/**
 * Atlas Logistics Partner API (v1.4) — vendor-supplied client.
 *
 * DO NOT MODIFY. Treat as a third-party SDK.
 *
 * ---------------------------------------------------------------------------
 * POST /partner/v1.4/rates
 *
 * Atlas is a Canadian carrier and its API follows Atlas internal conventions.
 *
 * Request (AtlasRateRequest):
 *   from / to            ISO 3166-1 alpha-2
 *   weightLb             pounds, decimal
 *   dimensionsIn         { l, w, h } in inches
 *   accountRef           merchant account reference
 *
 * Response (AtlasRateResponse):
 *   data.price           decimal, major units of data.currency, EXCLUDING tax
 *   data.tax             decimal, major units, additional to price
 *   data.currency        ISO 4217 — Atlas prices all lanes in CAD
 *   data.serviceLevel    service identifier
 *   data.eta.minHours    lower bound of transit, hours
 *   data.eta.maxHours    upper bound of transit, hours
 *
 * Coverage: Atlas operates in the countries listed in SERVED_COUNTRIES. Both
 * ends of the lane must be served or the request is rejected with 422.
 *
 * Errors: throws AtlasApiError. Atlas rate-limits aggressively and returns 429
 * with a retryAfterMs hint; 429s are safe to retry, 5xx may or may not be.
 * ---------------------------------------------------------------------------
 */

import { rngFor, sleep } from '../lib/rng';

const rng = rngFor('atlas');

export interface AtlasRateRequest {
  from: string;
  to: string;
  weightLb: number;
  dimensionsIn: { l: number; w: number; h: number };
  accountRef: string;
}

export interface AtlasRateResponse {
  data: {
    price: number;
    tax: number;
    currency: 'CAD';
    serviceLevel: string;
    eta: { minHours: number; maxHours: number };
  };
}

export class AtlasApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AtlasApiError';
  }
}

const FAILURE_RATE = 0.2;
const SERVED_COUNTRIES = new Set(['US', 'CA', 'MX', 'GB', 'DE', 'AU', 'IE', 'FR']);

export async function getRates(
  req: AtlasRateRequest,
): Promise<AtlasRateResponse> {
  await sleep(400 + Math.floor(rng() * 2600));

  if (!SERVED_COUNTRIES.has(req.from) || !SERVED_COUNTRIES.has(req.to)) {
    throw new AtlasApiError(`Lane ${req.from}-${req.to} outside Atlas network`, 422);
  }

  const roll = rng();
  if (roll < FAILURE_RATE * 0.6) {
    throw new AtlasApiError('Too many requests', 429, 250 + Math.floor(rng() * 500));
  }
  if (roll < FAILURE_RATE) {
    throw new AtlasApiError('Internal error', 500);
  }

  const volumetricLb =
    (req.dimensionsIn.l * req.dimensionsIn.w * req.dimensionsIn.h) / 166;
  const chargeableLb = Math.max(req.weightLb, volumetricLb);
  const domestic = req.from === req.to;
  const price =
    Math.round((16.4 + chargeableLb * 1.92) * (domestic ? 1 : 2.15) * 100) / 100;

  return {
    data: {
      price,
      tax: Math.round(price * 0.13 * 100) / 100,
      currency: 'CAD',
      serviceLevel: domestic ? 'atlas-standard' : 'atlas-intl-express',
      eta: {
        minHours: domestic ? 24 : 72,
        maxHours: domestic ? 72 : 168,
      },
    },
  };
}
