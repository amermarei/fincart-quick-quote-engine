import { describe, expect, it, afterEach } from 'vitest';

/**
 * Aggregation resilience tests (FR-022, FR-023, FR-034) using the SEEDED
 * vendor SDKs — no mocks. PROVIDER_SEED must be set BEFORE the vendors
 * module loads (it is read at module load), hence the dynamic import below —
 * a static import would hoist above the env assignment.
 *
 * Seed 3 (verified by scan): SwiftPost's first call fails 503
 * UPSTREAM_DOWN on the US->GB lane, so it is a deterministic partial
 * failure fixture.
 */

process.env.PROVIDER_SEED = '3';

const { QuotesService } = await import('./quotes.service');


type CarrierOutcome = import('../carriers/types').CarrierOutcome;

const shipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

const merchant = {
  id: 'm-test',
  email: 'test@fincart.test',
  tier: 'standard' as const,
  carrierAccountRef: 'ACCT-TEST-001',
};

const prismaMock = {
  quoteRequest: { create: async () => ({ id: 'req-test' }) },
  quoteRate: { create: async () => ({}) },
} as never;

type NonQuotedOutcome = Extract<CarrierOutcome, { status: 'FAILED' | 'NO_SERVICE' | 'GIVEN_UP' }>;

async function runQuote(overrides?: { carrierTimeoutMs?: string; deadlineMs?: string; shipment?: typeof shipment }) {
  if (overrides?.carrierTimeoutMs !== undefined) process.env.CARRIER_TIMEOUT_MS = overrides.carrierTimeoutMs;
  if (overrides?.deadlineMs !== undefined) process.env.REQUEST_DEADLINE_MS = overrides.deadlineMs;
  const events: Array<CarrierOutcome | { event: string; requestId: string }> = [];
  const service = new QuotesService(prismaMock);
  await service.quote(overrides?.shipment ?? shipment, merchant, (e) => events.push(e));
  return events;
}

afterEach(() => {
  delete process.env.CARRIER_TIMEOUT_MS;
  delete process.env.REQUEST_DEADLINE_MS;
});

describe('partial failure (seed 3: SwiftPost 503 on first call)', () => {
  it('returns the other carriers rates, names the failure, and completes', async () => {
    const events = await runQuote();

    const meridian = events.find((e) => (e as CarrierOutcome).carrier === 'MERIDIAN');
    const swiftpost = events.find((e) => (e as CarrierOutcome).carrier === 'SWIFTPOST');
    const done = events.find((e) => (e as { event?: string }).event === 'done');

    expect((meridian as CarrierOutcome).status).toBe('QUOTED');
    expect((swiftpost as NonQuotedOutcome).status).toBe('FAILED');
    expect((swiftpost as NonQuotedOutcome).errorCode).toBe('UPSTREAM_DOWN');
    expect(done).toBeDefined();
  }, 20000);
});

describe('slow-carrier give-up', () => {
  it('marks carriers over the per-carrier deadline as GIVEN_UP and completes', async () => {
    const events = await runQuote({ carrierTimeoutMs: '60' });

    const swiftpost = events.find((e) => (e as CarrierOutcome).carrier === 'SWIFTPOST');
    const atlas = events.find((e) => (e as CarrierOutcome).carrier === 'ATLAS');
    const meridian = events.find((e) => (e as CarrierOutcome).carrier === 'MERIDIAN');
    const done = events.find((e) => (e as { event?: string }).event === 'done');

    expect((swiftpost as NonQuotedOutcome).status).toBe('GIVEN_UP');
    expect((atlas as NonQuotedOutcome).status).toBe('GIVEN_UP');
    expect((meridian as CarrierOutcome).status).toBe('QUOTED');
    expect(done).toBeDefined();
  }, 20000);
});

describe('no-service lane (US -> JP)', () => {
  it('returns a valid empty result: all carriers NO_SERVICE, still completes', async () => {
    const jpShipment = {
      origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
      destination: { countryCode: 'JP', postcode: '100-0001' },
      parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
    };
    const events = await runQuote({ shipment: jpShipment });
    const noService = events.filter(
      (e) => (e as CarrierOutcome).status === 'NO_SERVICE',
    );
    const quoted = events.filter((e) => (e as CarrierOutcome).status === 'QUOTED');
    const done = events.find((e) => (e as { event?: string }).event === 'done');

    expect(noService).toHaveLength(3);
    expect(quoted).toHaveLength(0);
    expect(done).toBeDefined();
  }, 20000);
});
