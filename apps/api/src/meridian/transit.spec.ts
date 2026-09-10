import { describe, expect, it } from 'vitest';
import { priceMeridian } from '../carriers/meridian.carrier';
import type { MerchantContext } from '../carriers/types';
import { addBusinessDays, atOrAfterCutoff, localTimeIn } from '../common/time';

/**
 * Transit rule (FR-017): transit_business_days counted Mon-Fri excluding the
 * origin country's contract holidays; day 1 is the first business day
 * strictly AFTER the quote date in the origin timezone (never the quote date
 * itself); a quote at/after the zone cutoff adds one business day.
 * All fixtures are zone C (US->GB, 11 business days, cutoff 14:00).
 */

const STANDARD: MerchantContext = { tier: 'standard', carrierAccountRef: 'ACCT-STD-001' };

function usGbShipment(quotedAt: string) {
  return {
    origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
    destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
    parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
    quotedAt,
  };
}

function eta(quotedAt: string): string {
  const outcome = priceMeridian(usGbShipment(quotedAt), STANDARD);
  if (outcome.status !== 'QUOTED') throw new Error('expected QUOTED');
  return outcome.rate.etaFrom;
}

describe('cutoff rule', () => {
  it('quotes before the 14:00 cutoff use the base transit days', () => {
    // Tue 2026-09-08 13:59 New York -> 11 business days from Wed 09-09
    expect(eta('2026-09-08T13:59:00-04:00')).toBe('2026-09-23');
  });

  it('quotes AT the cutoff add one business day', () => {
    // 14:00:00 exactly counts as at-or-after -> 12 business days
    expect(eta('2026-09-08T14:00:00-04:00')).toBe('2026-09-24');
  });

  it('quotes after the cutoff add one business day', () => {
    expect(eta('2026-09-08T17:00:00-04:00')).toBe('2026-09-24');
  });
});

describe('business-day counting', () => {
  it('never counts the quote date itself, even on a weekend', () => {
    // Saturday 2026-09-12 -> day 1 is Monday 09-14 -> 11 business days
    expect(eta('2026-09-12T10:00:00-04:00')).toBe('2026-09-28');
  });

  it('skips contract holidays (US Thanksgiving 2026-11-26)', () => {
    // Mon 2026-11-23 10:00 -> day 1 Tue 11-24; skip 11-26;
    // 24,25,(26 skip),27,30,12-01,02,03,04,07,08,09 = 11th business day
    expect(eta('2026-11-23T10:00:00-04:00')).toBe('2026-12-09');
  });

  it('counts no holidays in years absent from the contract calendar', () => {
    // 2028 has no holidays in the card: Thu 11-23 -> day 1 Fri 11-24
    expect(eta('2028-11-23T10:00:00-04:00')).toBe('2028-12-08');
  });

  it('treats a quote on a holiday as normal (date never counted)', () => {
    // US Independence Day 2026-07-03 is a Friday holiday; quote date is not
    // counted, so day 1 is Mon 07-06. 11 business days from 07-06.
    expect(eta('2026-07-03T10:00:00-04:00')).toBe('2026-07-20');
  });
});

describe('time helper units', () => {
  it('atOrAfterCutoff compares wall-clock time in the given zone', () => {
    const local = localTimeIn('2026-09-08T14:00:00-04:00', 'America/New_York');
    expect(atOrAfterCutoff(local, '14:00')).toBe(true);
    const before = localTimeIn('2026-09-08T13:59:00-04:00', 'America/New_York');
    expect(atOrAfterCutoff(before, '14:00')).toBe(false);
  });

  it('addBusinessDays counts strictly after the start date', () => {
    const start = localTimeIn('2026-09-08T10:00:00-04:00', 'America/New_York');
    const result = addBusinessDays(start, 3, new Set());
    expect(result.toISODate()).toBe('2026-09-11'); // Wed 09, Thu 10, Fri 11
  });
});