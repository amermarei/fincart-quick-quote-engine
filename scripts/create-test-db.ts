/**
 * One-time setup: creates the dedicated test database (qqe_test) on the
 * configured PostgreSQL instance if it does not exist. Reads the real
 * credentials from DATABASE_URL in the root .env.
 *
 * Usage: npx tsx scripts/create-test-db.ts
 */

import 'dotenv/config';
import { Client } from 'pg';

const TEST_DB_NAME = 'qqe_test';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');

  const client = new Client({
    connectionString: parsed.toString(),
    // Aiven serves a self-signed CA; this admin script only creates a
    // database, so we skip certificate verification (Prisma's own driver
    // treats sslmode=require as encrypt-without-verify as well).
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const exists = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DB_NAME],
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    console.log(`Created database ${TEST_DB_NAME}`);
  } else {
    console.log(`Database ${TEST_DB_NAME} already exists`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});