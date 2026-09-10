/**
 * SwiftPost Rating API v2 — vendor-supplied client.
 *
 * DO NOT MODIFY. This stands in for a third-party SDK. Treat it as a black box
 * that you have no control over: you cannot change its latency, its failure
 * behaviour, or the shape of what it returns.
 *
 * ---------------------------------------------------------------------------
 * POST /v2/rating/quote
 *
 * Request body (see SwiftPostQuoteRequest):
 *   origin_cc, destination_cc   ISO 3166-1 alpha-2
 *   weight                      kilograms, decimal
 *   dims                        { length, width, height } in centimetres
 *
 * Response body (see SwiftPostQuoteResponse):
 *   quote.amount                integer, minor units of quote.currency
 *   quote.currency              ISO 4217
 *   quote.tax_treatment         "inclusive" — amount already contains tax
 *   quote.tax_amount            integer, minor units; the tax portion of amount
 *   quote.service               service code
 *   quote.transit.days          calendar days in transit
 *
 * Errors: throws SwiftPostError. Rating is unavailable for some lanes
 * (see UNSERVED_LANES) and the service is not 100% available.
 * ---------------------------------------------------------------------------
 */

import { rngFor, sleep } from '../lib/rng';

const rng = rngFor('swiftpost');

export interface SwiftPostQuoteRequest {
  origin_cc: string;
  destination_cc: string;
  weight: number;
  dims: { length: number; width: number; height: number };
}

export interface SwiftPostQuoteResponse {
  quote: {
    amount: number;
    currency: 'USD';
    tax_treatment: 'inclusive';
    tax_amount: number;
    service: string;
    transit: { days: number };
  };
}

export class SwiftPostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SwiftPostError';
  }
}

const UNSERVED_LANES = new Set(['US-JP', 'CA-AU']);
const FAILURE_RATE = 0.18;

export async function quote(
  req: SwiftPostQuoteRequest,
): Promise<SwiftPostQuoteResponse> {
  await sleep(200 + Math.floor(rng() * 2800));

  const lane = `${req.origin_cc}-${req.destination_cc}`;
  if (UNSERVED_LANES.has(lane)) {
    throw new SwiftPostError(`No service for lane ${lane}`, 422, 'LANE_UNSERVED');
  }

  if (rng() < FAILURE_RATE) {
    throw new SwiftPostError('Rating engine unavailable', 503, 'UPSTREAM_DOWN');
  }

  const chargeable = Math.max(
    req.weight,
    (req.dims.length * req.dims.width * req.dims.height) / 5000,
  );
  const zoneMultiplier = req.origin_cc === req.destination_cc ? 1 : 2.4;
  const gross = Math.round((950 + chargeable * 310) * zoneMultiplier);

  return {
    quote: {
      amount: gross,
      currency: 'USD',
      tax_treatment: 'inclusive',
      tax_amount: Math.round(gross - gross / 1.08),
      service: 'SP-GROUND',
      transit: { days: req.origin_cc === req.destination_cc ? 3 : 7 },
    },
  };
}
