import type { MerchantTier } from '@qqe/shared';

/**
 * The authenticated merchant as resolved from the JWT subject + the merchant
 * record on every request — tier and carrier account reference are never
 * trusted from token claims or the request body (constitution).
 */
export interface AuthenticatedMerchant {
  id: string;
  email: string;
  tier: MerchantTier;
  carrierAccountRef: string;
}