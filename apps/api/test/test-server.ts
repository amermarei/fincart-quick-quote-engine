import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Boots the real compiled HTTP server once per test process (guarded via
 * globalThis) against a dedicated PostgreSQL database (qqe_test) on the
 * configured Aiven instance, then hands tests a base URL. The e2e tests hit
 * a REAL HTTP endpoint against REAL Postgres — no in-process Nest app, no
 * mocks, no embedded database.
 *
 * SAFETY: the reset (`prisma db push --force-reset`) is refused unless the
 * target database is literally named qqe_test — the developer database is
 * never touched.
 */

export const TEST_PORT = 4599;
export const BASE_URL = `http://localhost:${TEST_PORT}`;
export const TEST_DB_NAME = 'qqe_test';

const API_DIR = resolve(__dirname, '..');

interface ServerState {
  child?: ChildProcess;
  ready: boolean;
}

function state(): ServerState {
  const g = globalThis as unknown as { __qqeE2e?: ServerState };
  if (!g.__qqeE2e) g.__qqeE2e = { ready: false };
  return g.__qqeE2e;
}

function testDbUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ??
    (process.env.DATABASE_URL ? deriveTestUrl(process.env.DATABASE_URL) : undefined);
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set — copy .env.example to .env and fill in the real credentials',
    );
  }
  const dbName = new URL(url).pathname.split('/')[1];
  if (dbName !== TEST_DB_NAME) {
    throw new Error(
      `Refusing to run tests: TEST_DATABASE_URL must point at database "${TEST_DB_NAME}", got "${dbName}"`,
    );
  }
  return url;
}

function deriveTestUrl(base: string): string {
  const u = new URL(base);
  const parts = u.pathname.split('/');
  parts[parts.length - 1] = TEST_DB_NAME;
  u.pathname = parts.join('/');
  return u.toString();
}

async function probeUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'probe@fincart.test', password: 'probe' }),
    });
    return res.status === 401;
  } catch {
    return false;
  }
}

export async function ensureServerReady(): Promise<void> {
  const s = state();
  if (s.ready) return;
  if (await probeUp()) {
    s.ready = true;
    return;
  }

  const distMain = resolve(API_DIR, 'dist/apps/api/src/main.js');
  if (!existsSync(distMain)) {
    execSync('npm run build', { cwd: API_DIR, stdio: 'inherit' });
  }

  const dbUrl = testDbUrl();

  // Destructive only against the dedicated qqe_test database (guarded above):
  // drops tables, recreates the schema from the Prisma schema, then seeds.
  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
  execSync('npx tsx prisma/seed.ts', {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });

  s.child = spawn(process.execPath, ['dist/apps/api/src/main.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATABASE_URL: dbUrl,
      PROVIDER_SEED: '42',
      JWT_SECRET: 'test-secret',
      CARRIER_TIMEOUT_MS: '3000',
      REQUEST_DEADLINE_MS: '3400',
    },
    stdio: 'inherit',
  });

  process.on('exit', () => {
    s.child?.kill();
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await probeUp()) {
      s.ready = true;
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('e2e server failed to start');
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}