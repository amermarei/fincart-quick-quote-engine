import 'dotenv/config';
import 'reflect-metadata';
import { ensureServerReady } from './test-server';

process.env.PROVIDER_SEED = '42';

await ensureServerReady();