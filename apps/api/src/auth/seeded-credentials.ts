export type MerchantTier = 'STANDARD' | 'PLUS' | 'ENTERPRISE';

export interface SeededMerchant {
  email: string;
  password: string;
  tier: MerchantTier;
  carrierAccountRef: string;
}

/**
 * Single source of truth for the seeded merchants. The README quotes these
 * credentials verbatim; the seed writes them; login validates against them.
 */
export const SEEDED_MERCHANTS: SeededMerchant[] = [
  {
    email: 'standard@fincart.test',
    password: 'standard-pass',
    tier: 'STANDARD',
    carrierAccountRef: 'ACCT-STD-001',
  },
  {
    email: 'enterprise@fincart.test',
    password: 'enterprise-pass',
    tier: 'ENTERPRISE',
    carrierAccountRef: 'ACCT-ENT-001',
  },
  {
    email: 'plus@fincart.test',
    password: 'plus-pass',
    tier: 'PLUS',
    carrierAccountRef: 'ACCT-PLU-001',
  },
];