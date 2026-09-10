/**
 * Client-side latency benchmark (FR-021): 200 sequential POST /quotes
 * requests on the US -> GB lane with the provider seed fixed, measuring
 * time-to-first-rate and time-to-done AT THE CLIENT for each request, then
 * reporting p95 for both. Runtime ~10 minutes at 200 requests.
 *
 * Usage:  npm run bench            (requires the API running, see README)
 * Env:    BENCH_N        default 200
 *         BENCH_URL      default http://localhost:4000
 *         PROVIDER_SEED  must match the server's fixed seed
 */

import { performance } from 'node:perf_hooks';

const N = Number(process.env.BENCH_N ?? 200);
const BASE_URL = process.env.BENCH_URL ?? 'http://localhost:4000';

const EMAIL = process.env.BENCH_EMAIL ?? 'standard@fincart.test';
const PASSWORD = process.env.BENCH_PASSWORD ?? 'standard-pass';

const SHIPMENT = {
  origin: { countryCode: 'US', postcode: '10001', timezone: 'America/New_York' },
  destination: { countryCode: 'GB', postcode: 'SW1A 1AA' },
  parcel: { weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 10 },
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarize(values: number[], label: string): void {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const p95 = percentile(sorted, 95);
  console.log(
    `${label}: p95=${p95.toFixed(1)}ms mean=${mean.toFixed(1)}ms ` +
      `min=${sorted[0].toFixed(1)}ms max=${sorted[sorted.length - 1].toFixed(1)}ms (n=${values.length})`,
  );
}

interface QuoteTimings {
  firstRateMs: number;
  doneMs: number;
}

async function quoteOnce(token: string): Promise<QuoteTimings> {
  const started = performance.now();
  const res = await fetch(`${BASE_URL}/quotes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(SHIPMENT),
  });
  if (!res.ok || !res.body) {
    throw new Error(`quote failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstRateMs: number | null = null;
  let doneMs: number | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.includes('event: rate') && firstRateMs === null) {
        firstRateMs = performance.now() - started;
      }
      if (frame.includes('event: done')) {
        doneMs = performance.now() - started;
      }
      idx = buffer.indexOf('\n\n');
    }
  }

  if (firstRateMs === null || doneMs === null) {
    throw new Error('stream finished without rate/done events');
  }
  return { firstRateMs, doneMs };
}

async function main(): Promise<void> {
  console.log(`Bench: ${N} sequential US->GB requests against ${BASE_URL}`);

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error('login failed — is the API running?');
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  const firstRate: number[] = [];
  const done: number[] = [];

  for (let i = 0; i < N; i += 1) {
    const t = await quoteOnce(accessToken);
    firstRate.push(t.firstRateMs);
    done.push(t.doneMs);
    if ((i + 1) % 25 === 0 || i === 0) {
      console.log(`  request ${i + 1}/${N} — first=${t.firstRateMs.toFixed(0)}ms done=${t.doneMs.toFixed(0)}ms`);
    }
  }

  console.log('\nResults (client-measured):');
  summarize(firstRate, 'time-to-first-rate');
  summarize(done, 'time-to-complete');

  const firstP95 = percentile([...firstRate].sort((a, b) => a - b), 95);
  const doneP95 = percentile([...done].sort((a, b) => a - b), 95);
  const ok = firstP95 < 800 && doneP95 < 3500;
  console.log(
    ok
      ? 'PASS: p95 time-to-first-rate < 800 ms and p95 time-to-complete < 3,500 ms'
      : `FAIL: contract not met (first=${firstP95.toFixed(1)}ms, done=${doneP95.toFixed(1)}ms)`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});