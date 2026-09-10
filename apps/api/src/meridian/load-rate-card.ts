import rateCardJson from '../../../../packages/starter/rate-cards/meridian.json';

/**
 * Typed view over the contracted Meridian rate card. The JSON file is DATA
 * ONLY — never modified. The `$semantics` block in it is the authoritative
 * specification for how every field below is used.
 */

export interface WeightBreak {
  upToKg: number | null;
  fromKg?: number;
  base?: number;
  perKg?: number;
  flat?: number;
}

export interface ZoneRate {
  volumetricDivisor: number;
  weightBreaks: WeightBreak[];
  fuelPct: number;
  fuelCapMinor?: number;
  transitBusinessDays: number;
  cutoffLocal: string;
}

export interface Zone {
  lanes: string[];
  taxPct: number;
}

export interface RateCard {
  carrier: string;
  contractRef: string;
  currency: string;
  zones: Record<string, Zone>;
  rates: Record<string, ZoneRate>;
  oversizeOverCm: number;
  oversizeFlatMinor: number;
  remoteAreaFlatMinor: number;
  remoteAreaPrefixes: string[];
  handlingFlatMinor: number;
  handlingWaivedForTiers: string[];
  holidays: Record<string, string[]>;
}

function toNumber(value: number | undefined, name: string): number {
  if (value === undefined) throw new Error(`rate-card: missing ${name}`);
  return value;
}

function toNumberOrUndefined(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value;
}

export function loadRateCard(): RateCard {
  const card = rateCardJson as any;

  const rates: Record<string, ZoneRate> = {};
  for (const [zoneKey, zoneValue] of Object.entries(card.rates)) {
    const zone = zoneValue as any;
    rates[zoneKey] = {
      volumetricDivisor: toNumber(zone.volumetric_divisor, `rates.${zoneKey}.volumetric_divisor`),
      weightBreaks: (zone.weight_breaks as any[]).map((b: any) => ({
        upToKg: b.up_to_kg === null ? null : toNumber(b.up_to_kg, 'weight_breaks.up_to_kg'),
        fromKg: toNumberOrUndefined(b.from_kg),
        base: toNumberOrUndefined(b.base),
        perKg: toNumberOrUndefined(b.per_kg),
        flat: toNumberOrUndefined(b.flat),
      })),
      fuelPct: toNumber(zone.fuel_surcharge?.pct, `rates.${zoneKey}.fuel_surcharge.pct`),
      fuelCapMinor: toNumberOrUndefined(zone.fuel_surcharge?.cap_minor),
      transitBusinessDays: toNumber(zone.transit_business_days, `rates.${zoneKey}.transit_business_days`),
      cutoffLocal: zone.cutoff_local as string,
    };
  }

  const zones: Record<string, Zone> = {};
  for (const [zoneKey, zoneValue] of Object.entries(card.zones)) {
    const zone = zoneValue as any;
    zones[zoneKey] = {
      lanes: zone.lanes as string[],
      taxPct: toNumber(zone.tax_pct, `zones.${zoneKey}.tax_pct`),
    };
  }

  const surcharges = card.surcharges as any;
  const holidays: Record<string, string[]> = {};
  for (const [country, dates] of Object.entries(card.holidays)) {
    holidays[country] = dates as string[];
  }

  return {
    carrier: card.carrier as string,
    contractRef: card.contract_ref as string,
    currency: card.currency as string,
    zones,
    rates,
    oversizeOverCm: toNumber(surcharges.oversize?.oversize_over_cm, 'surcharges.oversize.oversize_over_cm'),
    oversizeFlatMinor: toNumber(surcharges.oversize?.flat_minor, 'surcharges.oversize.flat_minor'),
    remoteAreaFlatMinor: toNumber(surcharges.remote_area?.flat_minor, 'surcharges.remote_area.flat_minor'),
    remoteAreaPrefixes: (surcharges.remote_area?.destination_postcode_prefixes as string[]) ?? [],
    handlingFlatMinor: toNumber(surcharges.handling_fee?.flat_minor, 'surcharges.handling_fee.flat_minor'),
    handlingWaivedForTiers: (surcharges.handling_fee?.waived_for_tiers as string[]) ?? [],
    holidays,
  };
}

export const RATE_CARD: RateCard = loadRateCard();