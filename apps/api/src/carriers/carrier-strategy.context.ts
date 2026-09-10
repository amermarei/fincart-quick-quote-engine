import { Inject, Injectable } from '@nestjs/common';
import type { CarrierId, Shipment } from '@qqe/shared';
import type { CarrierOutcome, CarrierStrategy, MerchantContext } from './types';

/**
 * Injection token for the registered carrier strategies (multi-provider).
 */
export const CARRIER_STRATEGIES = 'CARRIER_STRATEGIES';

export interface RunOptions {
  carrierTimeoutMs: number;
  onSettle?: (outcome: CarrierOutcome) => void;
}

/** Worst-case vendor latency (SDK sleeps 200-3000 ms) — used for budget math. */
const WORST_CASE_VENDOR_LATENCY_MS = 3000;

/**
 * Strategy context (strategy pattern): owns the set of CarrierStrategy
 * instances and executes them. Strategies can be registered, removed, or
 * queried at runtime — the orchestrator consumes whatever the context holds
 * and never hardcodes a carrier list. The per-carrier deadline and the
 * budget-aware Atlas 429 retry policy live here, one level above the
 * strategies themselves.
 */
@Injectable()
export class CarrierStrategyContext {
  constructor(
    @Inject(CARRIER_STRATEGIES) private readonly strategies: CarrierStrategy[],
  ) {}

  get all(): readonly CarrierStrategy[] {
    return this.strategies;
  }

  get size(): number {
    return this.strategies.length;
  }

  has(id: CarrierId): boolean {
    return this.strategies.some((s) => s.id === id);
  }

  add(strategy: CarrierStrategy): this {
    if (!this.has(strategy.id)) {
      this.strategies.push(strategy);
    }
    return this;
  }

  remove(id: CarrierId): boolean {
    const index = this.strategies.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.strategies.splice(index, 1);
    return true;
  }

  /**
   * Runs every registered strategy in parallel, applying the per-carrier
   * deadline and the budget-aware 429 retry. Each strategy settles exactly
   * one terminal outcome.
   */
  async runAll(
    shipment: Shipment,
    ctx: MerchantContext,
    options: RunOptions,
  ): Promise<CarrierOutcome[]> {
    const startedAt = Date.now();
    const results: CarrierOutcome[] = [];

    await Promise.all(
      this.strategies.map(async (strategy) => {
        let outcome = await this.runWithTimeout(strategy, shipment, ctx, options.carrierTimeoutMs);

        if (
          outcome.status === 'FAILED' &&
          outcome.errorCode === 'RATE_LIMITED' &&
          outcome.retryAfterMs !== undefined
        ) {
          const elapsed = Date.now() - startedAt;
          const overallBudgetMs = Number(process.env.REQUEST_DEADLINE_MS ?? 3400);
          if (elapsed + outcome.retryAfterMs + WORST_CASE_VENDOR_LATENCY_MS <= overallBudgetMs) {
            outcome = await this.runWithTimeout(strategy, shipment, ctx, options.carrierTimeoutMs);
          }
        }

        results.push(outcome);
        options.onSettle?.(outcome);
      }),
    );

    return results;
  }

  private async runWithTimeout(
    strategy: CarrierStrategy,
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
            carrier: strategy.id,
            status: 'GIVEN_UP',
            errorCode: 'CARRIER_TIMEOUT',
            errorDetail: 'Carrier exceeded its per-carrier deadline',
          });
        }
      }, ms);
      void strategy
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