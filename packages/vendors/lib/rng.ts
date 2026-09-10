/**
 * Deterministic PRNG (mulberry32). Used by the mock provider transports so
 * their latency and failure behaviour is reproducible across runs.
 *
 * Seed comes from PROVIDER_SEED. If unset, a time-based seed is used.
 */

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromEnv(salt: string): number {
  const raw = process.env.PROVIDER_SEED;
  const base = raw === undefined ? Date.now() : Number.parseInt(raw, 10);
  let h = Number.isNaN(base) ? Date.now() : base;
  for (let i = 0; i < salt.length; i += 1) {
    h = (Math.imul(h, 31) + salt.charCodeAt(i)) | 0;
  }
  return h;
}

/** One RNG stream per provider, so providers don't interfere with each other. */
export function rngFor(providerId: string): Rng {
  return makeRng(seedFromEnv(providerId));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
