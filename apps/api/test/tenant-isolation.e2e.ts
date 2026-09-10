import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { BASE_URL, login } from './test-server';

/**
 * Tenant isolation (FR-026): merchant A must never see merchant B's quote
 * history. THIS TEST MUST FAIL if the scoping breaks — the history query is
 * keyed only by the JWT subject, and no endpoint accepts a merchant id.
 */

const shipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

function parseRequestIds(body: string): string[] {
  const ids: string[] = [];
  for (const block of body.split('\n\n')) {
    if (block.includes('event: request')) {
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (line) ids.push((JSON.parse(line.slice(5).trim()) as { requestId: string }).requestId);
    }
  }
  return ids;
}

describe('tenant isolation', () => {
  it('merchant A cannot read merchant B\'s quote history', async () => {
    const tokenA = await login('standard@fincart.test', 'standard-pass');
    const tokenB = await login('enterprise@fincart.test', 'enterprise-pass');

    const quoteA = await request(BASE_URL)
      .post('/quotes')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Accept', 'text/event-stream')
      .send(shipment);
    expect(quoteA.status).toBe(200);

    const aRequestIds = parseRequestIds(quoteA.text);
    expect(aRequestIds.length).toBeGreaterThan(0);

    // The stream ends before the background persistence completes, so poll
    // briefly for the persisted row (bounded — the persistence is awaited
    // before the request handler resolves, but the client sees `done` first).
    let historyB: request.Response | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const res = await request(BASE_URL)
        .get('/quotes')
        .set('Authorization', `Bearer ${tokenB}`);
      const ids = (res.body as { quotes: Array<{ id: string }> }).quotes.map((q) => q.id);
      if (!ids.some((id) => aRequestIds.includes(id))) {
        historyB = res;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(historyB?.status).toBe(200);

    const bodyB = historyB!.body as { quotes: Array<{ id: string }> };
    const bIds = bodyB.quotes.map((q) => q.id);
    for (const id of aRequestIds) {
      expect(bIds).not.toContain(id);
    }

    const historyA = await request(BASE_URL)
      .get('/quotes')
      .set('Authorization', `Bearer ${tokenA}`);
    const bodyA = historyA.body as { quotes: Array<{ id: string }> };
    expect(bodyA.quotes.some((q) => aRequestIds.includes(q.id))).toBe(true);
  }, 30000);

  it('rejects history access without a token', async () => {
    const res = await request(BASE_URL).get('/quotes');
    expect(res.status).toBe(401);
  });
});