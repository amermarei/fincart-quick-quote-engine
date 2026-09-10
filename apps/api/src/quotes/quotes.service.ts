import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CarrierId, Shipment } from '@qqe/shared';
import type { AuthenticatedMerchant } from '../auth/auth.service';
import type { CarrierOutcome, MerchantContext } from '../carriers/types';
import { CarrierStrategyContext } from '../carriers/carrier-strategy.context';
import { PrismaService } from '../prisma/prisma.service';

export type QuoteStreamEvent =
  | { event: 'request'; requestId: string }
  | { event: 'done'; requestId: string }
  | (CarrierOutcome & { event: 'carrier' });

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carriers: CarrierStrategyContext,
  ) {}

  /**
   * Runs every registered carrier strategy in parallel, streaming outcomes
   * to the client the moment they settle, and NEVER lets the database block
   * the stream: persistence happens in the background and is awaited only
   * after `done` has been emitted (the latency contract is client-measured;
   * a remote DB round trip must not delay a single rate event). A partial
   * result is a good result; a hung request is not (constitution IV).
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

    const giveUpUnsettled = (): void => {
      for (const strategy of this.carriers.all) {
        if (!settled.has(strategy.id)) {
          finalize({
            carrier: strategy.id,
            status: 'GIVEN_UP',
            errorCode: 'DEADLINE',
            errorDetail: 'Overall request deadline reached',
          });
        }
      }
    };

    const overallTimer = setTimeout(giveUpUnsettled, overallDeadlineMs);

    try {
      await this.carriers.runAll(fullShipment, ctx, {
        carrierTimeoutMs,
        onSettle: finalize,
      });
      giveUpUnsettled();
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
}