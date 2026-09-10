import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { BASE_URL, login } from './test-server';

const validShipment = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

interface StreamFrame {
  event: string;
  data: unknown;
}

function parseSse(body: string): StreamFrame[] {
  const frames: StreamFrame[] = [];
  for (const block of body.split('\n\n')) {
    if (!block.trim()) continue;
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    frames.push({ event, data: JSON.parse(data) });
  }
  return frames;
}

describe('POST /quotes — streaming quote endpoint', () => {
  it('streams rates and closes with a done event', async () => {
    const token = await login('standard@fincart.test', 'standard-pass');
    const res = await request(BASE_URL)
      .post('/quotes')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send(validShipment);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const frames = parseSse(res.text);
    const rates = frames.filter((f) => f.event === 'rate');
    const done = frames.filter((f) => f.event === 'done');
    const statuses = frames.filter((f) => f.event === 'carrier-status');

    expect(rates.length).toBeGreaterThan(0);
    expect(done).toHaveLength(1);

    for (const rate of rates) {
      const r = rate.data as Record<string, unknown>;
      expect(typeof r.carrier).toBe('string');
      expect(typeof r.service).toBe('string');
      expect(typeof r.baseMinor).toBe('number');
      expect(typeof r.taxMinor).toBe('number');
      expect(typeof r.totalMinor).toBe('number');
      expect(r.currency).toBe('USD');
      expect(typeof r.etaFrom).toBe('string');
      expect(typeof r.etaTo).toBe('string');
    }

    expect(statuses.every((s) => (s.data as { status: string }).status !== 'QUOTED')).toBe(true);
  }, 15000);

  it('rejects an invalid shipment with 400', async () => {
    const token = await login('standard@fincart.test', 'standard-pass');
    const bad = {
      ...validShipment,
      parcel: { ...validShipment.parcel, weightKg: 0 },
    };
    const res = await request(BASE_URL)
      .post('/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send(bad);
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(BASE_URL).post('/quotes').send(validShipment);
    expect(res.status).toBe(401);
  });
});