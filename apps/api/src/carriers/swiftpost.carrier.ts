import { Injectable } from '@nestjs/common';
import { SwiftPostError, swiftPostQuote } from '@qqe/starter';
import { DateTime } from 'luxon';
import type { Rate, Shipment } from '@qqe/shared';
import type { CarrierOutcome, CarrierStrategy, MerchantContext } from './types';

/**
 * SwiftPost strategy.
 *
 * The vendor returns tax-INCLUSIVE USD minor units: amount already contains
 * tax, and tax_amount is the tax portion. So base = amount - tax_amount,
 * total = amount — no conversion, no re-derivation.
 *
 * ETA: transit.days is CALENDAR days from the quote date.
 */
@Injectable()
export class SwiftPostCarrierStrategy implements CarrierStrategy {
  readonly id = 'SWIFTPOST' as const;

  async run(shipment: Shipment, _ctx: MerchantContext): Promise<CarrierOutcome> {
    const quotedAt = shipment.quotedAt ?? new Date().toISOString();
    try {
      const res = await swiftPostQuote({
        origin_cc: shipment.origin.countryCode,
        destination_cc: shipment.destination.countryCode,
        weight: shipment.parcel.weightKg,
        dims: {
          length: shipment.parcel.lengthCm,
          width: shipment.parcel.widthCm,
          height: shipment.parcel.heightCm,
        },
      });

      const q = res.quote;
      const taxMinor = q.tax_amount;
      const totalMinor = q.amount;
      const baseMinor = totalMinor - taxMinor;

      const eta = DateTime.fromISO(quotedAt).plus({ days: q.transit.days }).toISODate();

      const rate: Rate = {
        carrier: 'SWIFTPOST',
        service: q.service,
        baseMinor,
        taxMinor,
        totalMinor,
        currency: 'USD',
        etaFrom: eta ?? '',
        etaTo: eta ?? '',
      };

      return { carrier: 'SWIFTPOST', status: 'QUOTED', rate };
    } catch (err) {
      if (err instanceof SwiftPostError) {
        if (err.status === 422 && err.code === 'LANE_UNSERVED') {
          return {
            carrier: 'SWIFTPOST',
            status: 'NO_SERVICE',
            errorCode: 'LANE_UNSERVED',
            errorDetail: err.message,
          };
        }
        return {
          carrier: 'SWIFTPOST',
          status: 'FAILED',
          errorCode: err.code === 'UPSTREAM_DOWN' ? 'UPSTREAM_DOWN' : 'UPSTREAM_ERROR',
          errorDetail: err.message,
        };
      }
      return {
        carrier: 'SWIFTPOST',
        status: 'FAILED',
        errorCode: 'UNKNOWN',
        errorDetail: err instanceof Error ? err.message : 'Unknown SwiftPost error',
      };
    }
  }
}