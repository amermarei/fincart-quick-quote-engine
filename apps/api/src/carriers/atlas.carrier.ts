import { AtlasApiError, atlasGetRates } from '@qqe/vendors';
import { DateTime } from 'luxon';
import type { Rate, Shipment } from '@qqe/shared';
import { cadMajorToUsdMinor, cmToIn, kgToLb } from '../common/money';
import type { Carrier, CarrierOutcome, MerchantContext } from './types';

/**
 * Atlas adapter.
 *
 * The vendor prices in CAD, MAJOR units, tax EXCLUSIVE. Each monetary
 * component (price, tax) is converted to USD cents separately at the fixed
 * rate, then rounded half away from zero — never a converted total with
 * components derived (constitution I).
 *
 * Request-side unit conversions (kg -> lb, cm -> in) are passed UNROUNDED.
 *
 * ETA: minHours/maxHours converted to a delivery date range from quotedAt.
 */
function parseFxRate(currency: string): number {
  const raw = process.env.FX_RATES ?? 'CAD:0.73,GBP:1.27,EUR:1.09';
  const pair = raw.split(',').map((p) => p.trim()).find((p) => p.startsWith(`${currency}:`));
  const rate = Number(pair?.split(':')[1]);
  if (!pair || Number.isNaN(rate)) {
    throw new Error(`FX_RATES missing rate for ${currency}`);
  }
  return rate;
}

export const atlasCarrier: Carrier = {
  id: 'ATLAS',
  async run(shipment: Shipment, ctx: MerchantContext): Promise<CarrierOutcome> {
    const quotedAt = shipment.quotedAt ?? new Date().toISOString();
    try {
      const res = await atlasGetRates({
        from: shipment.origin.countryCode,
        to: shipment.destination.countryCode,
        weightLb: kgToLb(shipment.parcel.weightKg),
        dimensionsIn: {
          l: cmToIn(shipment.parcel.lengthCm),
          w: cmToIn(shipment.parcel.widthCm),
          h: cmToIn(shipment.parcel.heightCm),
        },
        accountRef: ctx.carrierAccountRef,
      });

      const fx = parseFxRate('CAD');
      const priceUsdMinor = cadMajorToUsdMinor(res.data.price, fx);
      const taxUsdMinor = cadMajorToUsdMinor(res.data.tax, fx);

      const quoted = DateTime.fromISO(quotedAt);
      const etaFrom = quoted.plus({ hours: res.data.eta.minHours }).toISODate();
      const etaTo = quoted.plus({ hours: res.data.eta.maxHours }).toISODate();

      const rate: Rate = {
        carrier: 'ATLAS',
        service: res.data.serviceLevel,
        baseMinor: priceUsdMinor,
        taxMinor: taxUsdMinor,
        totalMinor: priceUsdMinor + taxUsdMinor,
        currency: 'USD',
        etaFrom: etaFrom ?? '',
        etaTo: etaTo ?? '',
      };

      return { carrier: 'ATLAS', status: 'QUOTED', rate };
    } catch (err) {
      if (err instanceof AtlasApiError) {
        if (err.status === 422) {
          return {
            carrier: 'ATLAS',
            status: 'NO_SERVICE',
            errorCode: 'COVERAGE',
            errorDetail: err.message,
          };
        }
        if (err.status === 429) {
          return {
            carrier: 'ATLAS',
            status: 'FAILED',
            errorCode: 'RATE_LIMITED',
            errorDetail: err.message,
            retryAfterMs: err.retryAfterMs,
          };
        }
        return {
          carrier: 'ATLAS',
          status: 'FAILED',
          errorCode: 'UPSTREAM_DOWN',
          errorDetail: err.message,
        };
      }
      return {
        carrier: 'ATLAS',
        status: 'FAILED',
        errorCode: 'UNKNOWN',
        errorDetail: err instanceof Error ? err.message : 'Unknown Atlas error',
      };
    }
  },
};