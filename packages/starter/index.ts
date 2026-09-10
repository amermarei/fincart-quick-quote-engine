/**
 * Vendor SDK re-exports.
 *
 * The files in lib/ and providers/ are copied verbatim from the task's
 * starter/ directory and are READ-ONLY — do not modify them. This index
 * file only re-exports their public surface so the rest of the repo can
 * import the vendors as a workspace package.
 */

export {
  quote as swiftPostQuote,
  SwiftPostError,
} from './providers/swiftpost';

export type { SwiftPostQuoteRequest, SwiftPostQuoteResponse } from './providers/swiftpost';

export {
  getRates as atlasGetRates,
  AtlasApiError,
} from './providers/atlas';

export type { AtlasRateRequest, AtlasRateResponse } from './providers/atlas';