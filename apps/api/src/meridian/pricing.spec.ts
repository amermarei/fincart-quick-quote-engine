import { describe, expect, it } from 'vitest';
import { priceMeridian } from '../carriers/meridian.carrier';
import type { MerchantContext, CarrierOutcome } from '../carriers/types';

/**
 * Exact-answer cases hand-computed from the rate card ($semantics is
 * authoritative). If a case disagrees with the engine, the EXPECTED value
 * wins — re-read $semantics before touching the test.
 *
 * Zone A (US-US): divisor 6000, breaks 799/1249/1249+96/2689+74, fuel 11.5%,
 *   transit 3d, cutoff 17:00, tax 0%.
 * Zone B (US-CA): divisor 6000, breaks 1899/2749/2749+184/5509+151, fuel 14%,
 *   transit 6d, cutoff 15:30, tax 5%.
 * Zone C (US-GB): divisor 5000, breaks 3450/4980/4980+366/10470+298, fuel
 *   18.5% cap 2200, transit 11d, cutoff 14:00, tax 0%.
 */

const STANDARD: MerchantContext = { tier: 'standard', carrierAccountRef: 'ACCT-STD-001' };
const ENTERPRISE: MerchantContext = { tier: 'enterprise', carrierAccountRef: 'ACCT-ENT-001' };

const QUOTED_AT = '2026-09-08T10:00:00-04:00'; // Tuesday, before any cutoff

function usShipment(weightKg: number, dims: [number, number, number], destPostcode: string) {
  return {
    origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
    destination: { countryCode: 'US', postcode: destPostcode },
    parcel: { weightKg, lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2] },
    quotedAt: QUOTED_AT,
  };
}

function quoted(outcome: CarrierOutcome) {
  if (outcome.status !== 'QUOTED') {
    throw new Error(`expected QUOTED, got ${JSON.stringify(outcome)}`);
  }
  return outcome.rate;
}

describe('chargeable weight and weight breaks', () => {
  it('rounds chargeable weight up to the 0.5 kg multiple', () => {
    // weight 6.01 dominates volume -> chargeable 6.5 -> base 1249 + ceil(1.5)*96
    const rate = quoted(priceMeridian(usShipment(6.01, [1, 1, 1], '10001'), STANDARD));
    expect(rate.baseMinor).toBe(1441);
  });

  it('leaves a chargeable weight already on a multiple unchanged', () => {
    // weight 6.0 -> chargeable 6.0 -> base 1249 + ceil(1)*96 = 1345
    const rate = quoted(priceMeridian(usShipment(6.0, [1, 1, 1], '10001'), STANDARD));
    expect(rate.baseMinor).toBe(1345);
  });

  it('selects the ≤1 kg flat break', () => {
    const rate = quoted(priceMeridian(usShipment(1.0, [1, 1, 1], '10001'), STANDARD));
    expect(rate.baseMinor).toBe(799);
  });

  it('just above 5.0 selects the 5-20 formula break, not the ≤5 flat', () => {
    // chargeable 5.01 -> 1249 + ceil(0.01)*96 = 1345; the ≤5 flat is 1249
    const rate = quoted(priceMeridian(usShipment(5.01, [1, 1, 1], '10001'), STANDARD));
    expect(rate.baseMinor).toBe(1345);
  });

  it('prices exactly 5.0 with the ≤5 flat break', () => {
    const rate = quoted(priceMeridian(usShipment(5.0, [1, 1, 1], '10001'), STANDARD));
    expect(rate.baseMinor).toBe(1249);
  });
});

describe('fuel, tax, handling, totals', () => {
  it('computes zone A fuel and total for a standard merchant', () => {
    // base 1249, fuel round(1249*0.115)=144, handling 250, tax 0
    const rate = quoted(priceMeridian(usShipment(5.0, [1, 1, 1], '10001'), STANDARD));
    expect(rate.baseMinor).toBe(1249);
    expect(rate.taxMinor).toBe(0);
    expect(rate.totalMinor).toBe(1249 + 144 + 250);
  });

  it('waives the handling fee for enterprise merchants', () => {
    const rate = quoted(priceMeridian(usShipment(5.0, [1, 1, 1], '10001'), ENTERPRISE));
    expect(rate.totalMinor).toBe(1249 + 144);
  });

  it('applies zone B tax to base + all surcharges, rounded half-up', () => {
    // US->CA: base 2749, fuel round(2749*0.14)=385, handling 250,
    // tax round((2749+385+250)*0.05)=round(169.2)=169
    const shipment = {
      origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
      destination: { countryCode: 'CA', postcode: 'M5V 2T6' },
      parcel: { weightKg: 5.0, lengthCm: 1, widthCm: 1, heightCm: 1 },
      quotedAt: QUOTED_AT,
    };
    const rate = quoted(priceMeridian(shipment, STANDARD));
    expect(rate.baseMinor).toBe(2749);
    expect(rate.taxMinor).toBe(169);
    expect(rate.totalMinor).toBe(2749 + 385 + 250 + 169);
  });

  it('caps the zone C fuel surcharge after rounding', () => {
    // US->GB, chargeable 25.1 -> open break base 10470 + ceil(5.1)*298 = 12258
    // fuel round(12258*0.185)=2268 -> capped to 2200; tax 0; handling 250
    const shipment = {
      origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
      destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
      parcel: { weightKg: 25.1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      quotedAt: QUOTED_AT,
    };
    const rate = quoted(priceMeridian(shipment, STANDARD));
    expect(rate.baseMinor).toBe(12258);
    expect(rate.totalMinor).toBe(12258 + 2200 + 250);
  });
});

describe('oversize and remote-area surcharges', () => {
  it('treats exactly 120 cm as NOT oversize', () => {
    // weight 6 dominates volume (120*10*10/6000=2), chargeable 6.0
    const rate = quoted(priceMeridian(usShipment(6.0, [120, 10, 10], '10001'), STANDARD));
    expect(rate.totalMinor).toBe(1345 + 155 + 250);
  });

  it('applies oversize strictly above 120 cm', () => {
    const rate = quoted(priceMeridian(usShipment(6.0, [120.01, 10, 10], '10001'), STANDARD));
    expect(rate.totalMinor).toBe(1345 + 155 + 1850 + 250);
  });

  it('matches remote-area postcodes case-insensitively with whitespace removed', () => {
    const rate = quoted(priceMeridian(usShipment(5.0, [1, 1, 1], 'IV12 1AB'), STANDARD));
    expect(rate.totalMinor).toBe(1249 + 144 + 1200 + 250);
  });

  it('does not charge the remote surcharge for an ordinary postcode', () => {
    const rate = quoted(priceMeridian(usShipment(5.0, [1, 1, 1], '10001'), STANDARD));
    expect(rate.totalMinor).toBe(1249 + 144 + 250);
  });
});

describe('no-service lanes', () => {
  it('returns NO_SERVICE for a lane outside the contract zones', () => {
    const shipment = {
      origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
      destination: { countryCode: 'JP', postcode: '100-0001' },
      parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
      quotedAt: QUOTED_AT,
    };
    const outcome = priceMeridian(shipment, STANDARD);
    expect(outcome.status).toBe('NO_SERVICE');
  });
});