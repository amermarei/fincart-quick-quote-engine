import { describe, expect, it } from 'vitest';
import type { Shipment } from '@qqe/shared';
import type { CarrierOutcome, CarrierStrategy, MerchantContext } from './types';
import { CarrierStrategyContext } from './carrier-strategy.context';
import { MeridianCarrierStrategy } from './meridian.carrier';

const shipment: Shipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
  quotedAt: '2026-09-08T10:00:00-04:00',
};

const ctx: MerchantContext = { tier: 'standard', carrierAccountRef: 'ACCT-TEST-001' };

class FakeStrategy implements CarrierStrategy {
  constructor(
    readonly id: 'SWIFTPOST' | 'ATLAS',
    private readonly outcome: CarrierOutcome,
  ) {}

  async run(): Promise<CarrierOutcome> {
    return this.outcome;
  }
}

const quotedSwift = {
  carrier: 'SWIFTPOST' as const,
  status: 'QUOTED' as const,
  rate: {
    carrier: 'SWIFTPOST' as const,
    service: 'SP-GROUND',
    baseMinor: 100,
    taxMinor: 10,
    totalMinor: 110,
    currency: 'USD' as const,
    etaFrom: '2026-09-15',
    etaTo: '2026-09-15',
  },
};

describe('CarrierStrategyContext — strategy registry', () => {
  it('starts with the DI-provided strategies and reports membership', () => {
    const context = new CarrierStrategyContext([new MeridianCarrierStrategy()]);
    expect(context.size).toBe(1);
    expect(context.has('MERIDIAN')).toBe(true);
    expect(context.has('ATLAS')).toBe(false);
  });

  it('adds a strategy at runtime without duplicating ids', () => {
    const context = new CarrierStrategyContext([]);
    context.add(new MeridianCarrierStrategy());
    context.add(new MeridianCarrierStrategy());
    expect(context.size).toBe(1);
  });

  it('removes a strategy at runtime', () => {
    const context = new CarrierStrategyContext([
      new MeridianCarrierStrategy(),
      new FakeStrategy('SWIFTPOST', quotedSwift),
    ]);
    expect(context.remove('SWIFTPOST')).toBe(true);
    expect(context.remove('SWIFTPOST')).toBe(false);
    expect(context.size).toBe(1);
  });

  it('runs exactly the registered strategies', async () => {
    const context = new CarrierStrategyContext([new FakeStrategy('SWIFTPOST', quotedSwift)]);
    const settled: CarrierOutcome[] = [];
    const results = await context.runAll(shipment, ctx, {
      carrierTimeoutMs: 3000,
      onSettle: (o) => settled.push(o),
    });
    expect(results.map((r) => r.carrier)).toEqual(['SWIFTPOST']);
    expect(settled.map((r) => r.carrier)).toEqual(['SWIFTPOST']);
  });

  it('executes the Meridian strategy and produces a QUOTED outcome', async () => {
    const context = new CarrierStrategyContext([new MeridianCarrierStrategy()]);
    const results = await context.runAll(shipment, ctx, { carrierTimeoutMs: 3000 });
    expect(results).toHaveLength(1);
    expect(results[0].carrier).toBe('MERIDIAN');
    expect(results[0].status).toBe('QUOTED');
  });
});