import type { CarrierStatus, Rate } from '@qqe/shared';

export type QuotePhase = 'idle' | 'loading' | 'partial' | 'complete' | 'no-service';

interface RatesListProps {
  phase: QuotePhase;
  rates: Rate[];
  statuses: CarrierStatus[];
  onRetry: () => void;
  canRetry: boolean;
}

const CARRIER_NAMES: Record<string, string> = {
  SWIFTPOST: 'SwiftPost',
  ATLAS: 'Atlas Logistics',
  MERIDIAN: 'Meridian Freight',
};

function cents(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}

function RateRow({ rate }: { rate: Rate }) {
  return (
    <li className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <div className="font-medium text-slate-900">
          {CARRIER_NAMES[rate.carrier] ?? rate.carrier}
        </div>
        <div className="text-sm text-slate-500">
          {rate.service}
          <span className="mx-2 text-slate-300">·</span>
          {rate.etaFrom}
          {rate.etaTo !== rate.etaFrom ? ` – ${rate.etaTo}` : ''}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold text-slate-900">{cents(rate.totalMinor)}</div>
        <div className="text-xs text-slate-500">
          {cents(rate.baseMinor)} base + {cents(rate.taxMinor)} tax
        </div>
      </div>
    </li>
  );
}

function Banner({ tone, children }: { tone: 'error' | 'info' | 'warn'; children: React.ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-slate-200 bg-slate-50 text-slate-600',
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function RatesList({ phase, rates, statuses, onRetry, canRetry }: RatesListProps) {
  if (phase === 'idle') {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
        Fill in the shipment and press “Get quotes” to compare carriers.
      </div>
    );
  }

  const failures = statuses.filter((s) => s.status === 'FAILED' || s.status === 'GIVEN_UP');

  return (
    <section aria-live="polite" className="space-y-3">
      {phase === 'loading' ? (
        <Banner tone="info">Quoting carriers…</Banner>
      ) : null}

      {phase === 'no-service' ? (
        <Banner tone="info">
          <span className="font-medium">No carrier serves this lane.</span> Try a different
          origin or destination.
        </Banner>
      ) : null}

      {phase === 'partial' && failures.length > 0 ? (
        <Banner tone="warn">
          <span className="font-medium">Some carriers failed:</span>{' '}
          {failures
            .map((s) => `${CARRIER_NAMES[s.carrier] ?? s.carrier} (${s.errorDetail})`)
            .join('; ')}
        </Banner>
      ) : null}

      {rates.length > 0 ? (
        <ul className="space-y-2">
          {rates.map((rate, index) => (
            <RateRow key={`${rate.carrier}-${index}`} rate={rate} />
          ))}
        </ul>
      ) : null}

      {phase === 'complete' || phase === 'partial' ? (
        <p role="status" className="text-xs uppercase tracking-wide text-slate-400">
          Quote complete
        </p>
      ) : null}

      {canRetry && (phase === 'partial' || phase === 'complete') ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Retry quote
        </button>
      ) : null}
    </section>
  );
}