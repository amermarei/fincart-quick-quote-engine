import type { Request } from 'express';
import type { AuthenticatedMerchant } from '../auth/auth.types';
import type { CarrierOutcome } from '../carriers/types';

/** Events streamed to the client on POST /quotes (contracts/http-api.md). */
export type QuoteStreamEvent =
  | { event: 'request'; requestId: string }
  | { event: 'done'; requestId: string }
  | (CarrierOutcome & { event: 'carrier' });

/** An authenticated HTTP request with the resolved merchant attached. */
export type AuthedRequest = Request & { user: AuthenticatedMerchant };