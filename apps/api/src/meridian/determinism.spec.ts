import { describe, expect, it } from 'vitest';
import { priceMeridian } from '../carriers/meridian.carrier';
import type { MerchantContext } from '../carriers/types';

const STANDARD: MerchantContext = { tier: 'standard', carrierAccountRef: 'ACCT-STD-001' };

const shipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

describe('determinism (FR-019)', () => {
  it('produces identical outcomes for identical input', () => {
    const a = priceMeridian({ ...shipment, quotedAt: '2026-09-08T10:00:00-04:00' }, STANDARD);
    const b = priceMeridian({ ...shipment, quotedAt: '2026-09-08T10:00:00-04:00' }, STANDARD);
    expect(a).toEqual(b);
  });

  it('derives eta from quotedAt, not the system clock', () => {
    const beforeCutoff = priceMeridian(
      { ...shipment, quotedAt: '2026-09-08T13:59:00-04:00' },
      STANDARD,
    );
    const afterCutoff = priceMeridian(
      { ...shipment, quotedAt: '2026-09-08T14:00:00-04:00' },
      STANDARD,
    );
    if (beforeCutoff.status !== 'QUOTED' || afterCutoff.status !== 'QUOTED') {
      throw new Error('expected QUOTED');
    }
    expect(beforeCutoff.rate.etaFrom).not.toBe(afterCutoff.rate.etaFrom);
  });

  it('varies tier-dependent pricing by merchant context only', () => {
    const standard = priceMeridian({ ...shipment, quotedAt: '2026-09-08T10:00:00-04:00' }, STANDARD);
    const enterprise = priceMeridian(
      { ...shipment, quotedAt: '2026-09-08T10:00:00-04:00' },
      { tier: 'enterprise', carrierAccountRef: 'ACCT-ENT-001' },
    );
    if (standard.status !== 'QUOTED' || enterprise.status !== 'QUOTED') {
      throw new Error('expected QUOTED');
    }
    // enterprise waives the 250 handling fee
    expect(standard.rate.totalMinor).toBe(enterprise.rate.totalMinor + 250);
  });
});