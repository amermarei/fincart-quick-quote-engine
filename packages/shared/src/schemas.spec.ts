import { describe, expect, it } from 'vitest';
import {
  carrierStatusSchema,
  loginRequestSchema,
  rateSchema,
  shipmentSchema,
} from './schemas';

const validShipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

describe('shipmentSchema', () => {
  it('accepts a valid shipment', () => {
    expect(shipmentSchema.safeParse(validShipment).success).toBe(true);
  });

  it('rejects zero and negative weight', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, parcel: { ...validShipment.parcel, weightKg: 0 } }).success).toBe(false);
    expect(shipmentSchema.safeParse({ ...validShipment, parcel: { ...validShipment.parcel, weightKg: -1 } }).success).toBe(false);
  });

  it('rejects non-positive dimensions', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, parcel: { ...validShipment.parcel, lengthCm: 0 } }).success).toBe(false);
  });

  it('rejects malformed country codes', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, origin: { ...validShipment.origin, countryCode: 'usa' } }).success).toBe(false);
    expect(shipmentSchema.safeParse({ ...validShipment, origin: { ...validShipment.origin, countryCode: 'U' } }).success).toBe(false);
  });

  it('rejects an offset as a timezone', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, origin: { ...validShipment.origin, timezone: '-05:00' } }).success).toBe(false);
  });

  it('rejects malformed quotedAt and accepts ISO 8601', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, quotedAt: 'not-a-date' }).success).toBe(false);
    expect(shipmentSchema.safeParse({ ...validShipment, quotedAt: '2026-09-08T14:00:00Z' }).success).toBe(true);
    expect(shipmentSchema.safeParse({ ...validShipment, quotedAt: '2026-09-08T14:00:00+02:00' }).success).toBe(true);
  });
});

describe('rate/carrier-status/login schemas', () => {
  it('accepts a well-formed rate', () => {
    const rate = {
      carrier: 'MERIDIAN',
      service: 'MER-GROUND',
      baseMinor: 1000,
      taxMinor: 100,
      totalMinor: 1100,
      currency: 'USD',
      etaFrom: '2026-09-21',
      etaTo: '2026-09-21',
    };
    expect(rateSchema.safeParse(rate).success).toBe(true);
    expect(rateSchema.safeParse({ ...rate, currency: 'CAD' }).success).toBe(false);
  });

  it('accepts a carrier-status payload', () => {
    expect(
      carrierStatusSchema.safeParse({
        carrier: 'ATLAS',
        status: 'FAILED',
        errorCode: 'RATE_LIMITED',
        errorDetail: 'Too many requests',
      }).success,
    ).toBe(true);
  });

  it('validates login requests', () => {
    expect(loginRequestSchema.safeParse({ email: 'merchant@fincart.test', password: 'x' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});