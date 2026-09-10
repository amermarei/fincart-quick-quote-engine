import type { CarrierId, MerchantTier, Rate, Shipment } from '@qqe/shared';

export interface MerchantContext {
  tier: MerchantTier;
  carrierAccountRef: string;
}

export type CarrierOutcome =
  | {
      carrier: CarrierId;
      status: 'QUOTED';
      rate: Rate;
    }
  | {
      carrier: CarrierId;
      status: 'NO_SERVICE' | 'FAILED' | 'GIVEN_UP';
      errorCode: string;
      errorDetail: string;
      retryAfterMs?: number;
    };

export interface Carrier {
  id: CarrierId;
  run(shipment: Shipment, ctx: MerchantContext): Promise<CarrierOutcome>;
}

export function isQuoted(o: CarrierOutcome): o is Extract<CarrierOutcome, { status: 'QUOTED' }> {
  return o.status === 'QUOTED';
}