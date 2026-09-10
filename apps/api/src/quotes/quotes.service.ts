import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CarrierId, Shipment } from '@qqe/shared';
import type { AuthenticatedMerchant } from '../auth/auth.service';
import type { Carrier, CarrierOutcome, MerchantContext } from '../carriers/types';
import { atlasCarrier } from '../carriers/atlas.carrier';
import { swiftPostCarrier } from '../carriers/swiftpost.carrier';
import { meridianCarrier } from '../carriers/meridian.carrier';
import { PrismaService } from '../prisma/prisma.service';

export type QuoteStreamEvent =
  | { event: 'request'; requestId: string }
  | { event: 'done'; requestId: string }
  | (CarrierOutcome & { event: 'carrier' });

const CARRIERS: Carrier[] = [meridianCarrier, swiftPostCarrier, atlasCarrier];

/** Worst-case vendor latency (SDK sleeps 200-3000 ms) — used for budget math. */
const WORST_CASE_VENDOR_LATENCY_MS = 3000;

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs all three carriers in parallel, streaming outcomes to the client
   * the moment they settle, and NEVER lets the database block the stream:
   * persistence happens in the background and is awaited only after `done`
   * has been emitted (the latency contract is client-measured; a remote DB
   * round trip must not delay a single rate event). A partial result is a
   * good result; a hung request is not (constitution IV).
   */
  async quote(
    shipment: Shipment,
    merchant: AuthenticatedMerchant,
    onEvent: (event: QuoteStreamEvent) => void,
  ): Promise<void> {
    const quotedAtIso = shipment.quotedAt ?? new Date().toISOString();
    const requestId = randomUUID();
    onEvent({ event: 'request', requestId });

    const carrierTimeoutMs = Number(process.env.CARRIER_TIMEOUT_MS ?? 3000);
    const overallDeadlineMs = Number(process.env.REQUEST_DEADLINE_MS ?? 3400);
    const startedAt = Date.now();
    const ctx: MerchantContext = {
      tier: merchant.tier,
      carrierAccountRef: merchant.carrierAccountRef,
    };
    const fullShipment: Shipment = { ...shipment, quotedAt: quotedAtIso };

    const settled = new Set<CarrierId>();
    const outcomes: CarrierOutcome[] = [];
    const finalize = (outcome: CarrierOutcome): void => {
      if (settled.has(outcome.carrier)) return;
      settled.add(outcome.carrier);
      outcomes.push(outcome);
      onEvent({ event: 'carrier', ...outcome });
    };

    const runCarrier = async (carrier: Carrier): Promise<void> => {
      let outcome = await this.runWithTimeout(carrier, fullShipment, ctx, carrierTimeoutMs);

      if (
        outcome.status === 'FAILED' &&
        outcome.errorCode === 'RATE_LIMITED' &&
        outcome.retryAfterMs !== undefined
      ) {
        const elapsed = Date.now() - startedAt;
        if (elapsed + outcome.retryAfterMs + WORST_CASE_VENDOR_LATENCY_MS <= overallDeadlineMs) {
          outcome = await this.runWithTimeout(carrier, fullShipment, ctx, carrierTimeoutMs);
        }
      }

      finalize(outcome);
    };

    const overallTimer = setTimeout(() => {
      for (const carrier of CARRIERS) {
        if (!settled.has(carrier.id)) {
          finalize({
            carrier: carrier.id,
            status: 'GIVEN_UP',
            errorCode: 'DEADLINE',
            errorDetail: 'Overall request deadline reached',
          });
        }
      }
    }, overallDeadlineMs);

    try {
      await Promise.all(CARRIERS.map(runCarrier));
      for (const carrier of CARRIERS) {
        if (!settled.has(carrier.id)) {
          finalize({
            carrier: carrier.id,
            status: 'GIVEN_UP',
            errorCode: 'DEADLINE',
            errorDetail: 'Overall request deadline reached',
          });
        }
      }
    } finally {
      clearTimeout(overallTimer);
    }

    onEvent({ event: 'done', requestId });

    await this.persistQuote(requestId, merchant, fullShipment, outcomes);
  }

  private async persistQuote(
    requestId: string,
    merchant: AuthenticatedMerchant,
    shipment: Shipment,
    outcomes: CarrierOutcome[],
  ): Promise<void> {
    try {
      await this.prisma.quoteRequest.create({
        data: {
          id: requestId,
          merchantId: merchant.id,
          originCountry: shipment.origin.countryCode,
          originPostcode: shipment.origin.postcode,
          originTimezone: shipment.origin.timezone,
          destinationCountry: shipment.destination.countryCode,
          destinationPostcode: shipment.destination.postcode,
          weightKg: shipment.parcel.weightKg,
          lengthCm: shipment.parcel.lengthCm,
          widthCm: shipment.parcel.widthCm,
          heightCm: shipment.parcel.heightCm,
          quotedAt: new Date(shipment.quotedAt ?? new Date().toISOString()),
        },
      });
      for (const outcome of outcomes) {
        await this.persistRate(requestId, outcome);
      }
    } catch (err) {
      this.logger.error(`Failed to persist quote ${requestId}`, err);
    }
  }

  /**
   * Quote history for one merchant — scoped strictly by the JWT sub.
   * There is no endpoint that accepts a merchant id, so cross-tenant reads
   * are impossible by construction (FR-026; the tenant-isolation test
   * attacks this).
   */
  async historyForMerchant(merchantId: string) {
    return this.prisma.quoteRequest.findMany({
      where: { merchantId },
      include: { rates: { orderBy: { arrivedAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async persistRate(requestId: string, outcome: CarrierOutcome): Promise<void> {
    const common = {
      requestId,
      carrier: outcome.carrier,
      status: outcome.status,
      errorCode: outcome.status === 'QUOTED' ? null : outcome.errorCode,
      errorDetail: outcome.status === 'QUOTED' ? null : outcome.errorDetail,
    };
    if (outcome.status === 'QUOTED') {
      await this.prisma.quoteRate.create({
        data: {
          ...common,
          service: outcome.rate.service,
          baseMinor: outcome.rate.baseMinor,
          taxMinor: outcome.rate.taxMinor,
          totalMinor: outcome.rate.totalMinor,
          currency: outcome.rate.currency,
          etaFrom: outcome.rate.etaFrom ? new Date(`${outcome.rate.etaFrom}T00:00:00Z`) : null,
          etaTo: outcome.rate.etaTo ? new Date(`${outcome.rate.etaTo}T00:00:00Z`) : null,
        },
      });
    } else {
      await this.prisma.quoteRate.create({ data: common });
    }
  }

  private async runWithTimeout(
    carrier: Carrier,
    shipment: Shipment,
    ctx: MerchantContext,
    ms: number,
  ): Promise<CarrierOutcome> {
    return new Promise<CarrierOutcome>((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({
            carrier: carrier.id,
            status: 'GIVEN_UP',
            errorCode: 'CARRIER_TIMEOUT',
            errorDetail: 'Carrier exceeded its per-carrier deadline',
          });
        }
      }, ms);
      void carrier
        .run(shipment, ctx)
        .then((outcome) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(outcome);
          }
        });
    });
  }
}