import { Injectable } from '@nestjs/common';
import type { Rate, Shipment } from '@qqe/shared';
import { RATE_CARD } from '../meridian/load-rate-card';
import { roundHalfAwayFromZero, roundUpToHalfKg } from '../common/money';
import { addBusinessDays, atOrAfterCutoff, localTimeIn } from '../common/time';
import type { CarrierOutcome, CarrierStrategy, MerchantContext } from './types';

/**
 * Meridian Freight pricing engine.
 *
 * The `$semantics` block in rate-card.json is the authoritative specification
 * for every rule below. Two rules need context a pure (shipment) => Rate
 * function lacks — the tier-dependent handling fee and the
 * time-and-timezone-dependent transit estimate — and get it via
 * (merchantContext, quotedAt) (research R13).
 */

function normalizePostcode(postcode: string): string {
  return postcode.replace(/\s+/g, '').toLowerCase();
}

function isRemoteArea(postcode: string): boolean {
  const normalized = normalizePostcode(postcode);
  return RATE_CARD.remoteAreaPrefixes.some((prefix) =>
    normalized.startsWith(prefix.toLowerCase()),
  );
}

function computeEta(
  quotedAtIso: string,
  originTimezone: string,
  originCountry: string,
  businessDays: number,
): string {
  const local = localTimeIn(quotedAtIso, originTimezone);
  const holidays = new Set(RATE_CARD.holidays[originCountry] ?? []);
  const eta = addBusinessDays(local, businessDays, holidays);
  return eta.toISODate() ?? quotedAtIso.slice(0, 10);
}

@Injectable()
export class MeridianCarrierStrategy implements CarrierStrategy {
  readonly id = 'MERIDIAN' as const;

  async run(shipment: Shipment, ctx: MerchantContext): Promise<CarrierOutcome> {
    return priceMeridian(shipment, ctx);
  }
}

export function priceMeridian(
  shipment: Shipment,
  ctx: MerchantContext,
): CarrierOutcome {
  const quotedAt = shipment.quotedAt ?? new Date().toISOString();
  const lane = `${shipment.origin.countryCode}-${shipment.destination.countryCode}`;

  const zoneKey = Object.keys(RATE_CARD.zones).find((key) =>
    RATE_CARD.zones[key].lanes.includes(lane),
  );
  if (!zoneKey) {
    return {
      carrier: 'MERIDIAN',
      status: 'NO_SERVICE',
      errorCode: 'LANE_UNSERVED',
      errorDetail: `No Meridian contract rate for lane ${lane}`,
    };
  }

  const zone = RATE_CARD.zones[zoneKey];
  const rate = RATE_CARD.rates[zoneKey];

  const volumetric =
    (shipment.parcel.lengthCm * shipment.parcel.widthCm * shipment.parcel.heightCm) /
    rate.volumetricDivisor;
  const chargeable = roundUpToHalfKg(Math.max(shipment.parcel.weightKg, volumetric));

  const breakRow = rate.weightBreaks.find((b) => b.upToKg === null || chargeable <= b.upToKg);
  if (!breakRow) {
    return {
      carrier: 'MERIDIAN',
      status: 'FAILED',
      errorCode: 'NO_BREAK',
      errorDetail: `No weight break covers ${chargeable} kg`,
    };
  }

  let base: number;
  if (breakRow.flat !== undefined) {
    base = breakRow.flat;
  } else if (breakRow.base !== undefined && breakRow.perKg !== undefined && breakRow.fromKg !== undefined) {
    base = breakRow.base + Math.ceil(chargeable - breakRow.fromKg) * breakRow.perKg;
  } else {
    return {
      carrier: 'MERIDIAN',
      status: 'FAILED',
      errorCode: 'BAD_BREAK',
      errorDetail: 'Weight break is malformed',
    };
  }

  const fuel = Math.min(
    roundHalfAwayFromZero((base * rate.fuelPct) / 100),
    rate.fuelCapMinor ?? Number.POSITIVE_INFINITY,
  );

  const oversize = shipment.parcel.lengthCm > RATE_CARD.oversizeOverCm ||
    shipment.parcel.widthCm > RATE_CARD.oversizeOverCm ||
    shipment.parcel.heightCm > RATE_CARD.oversizeOverCm
    ? RATE_CARD.oversizeFlatMinor
    : 0;

  const remote = isRemoteArea(shipment.destination.postcode)
    ? RATE_CARD.remoteAreaFlatMinor
    : 0;

  const handling = RATE_CARD.handlingWaivedForTiers
    .map((t) => t.toUpperCase())
    .includes(ctx.tier.toUpperCase())
    ? 0
    : RATE_CARD.handlingFlatMinor;

  const surcharges = fuel + oversize + remote + handling;
  const tax = roundHalfAwayFromZero(((base + surcharges) * zone.taxPct) / 100);
  const total = base + surcharges + tax;

  const businessDays =
    rate.transitBusinessDays +
    (atOrAfterCutoff(localTimeIn(quotedAt, shipment.origin.timezone), rate.cutoffLocal) ? 1 : 0);
  const eta = computeEta(quotedAt, shipment.origin.timezone, shipment.origin.countryCode, businessDays);

  const rateResult: Rate = {
    carrier: 'MERIDIAN',
    service: 'MER-GROUND',
    baseMinor: base,
    taxMinor: tax,
    totalMinor: total,
    currency: 'USD',
    etaFrom: eta,
    etaTo: eta,
  };

  return { carrier: 'MERIDIAN', status: 'QUOTED', rate: rateResult };
}