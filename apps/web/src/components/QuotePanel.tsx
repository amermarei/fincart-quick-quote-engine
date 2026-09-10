import { useCallback, useRef, useState } from 'react';
import type { CarrierStatus, Rate, Shipment } from '@qqe/shared';
import { streamQuote } from '../lib/quote-stream';
import { ShipmentForm } from './ShipmentForm';
import { RatesList, type QuotePhase } from './RatesList';
import { HistoryView } from './HistoryView';

interface QuotePanelProps {
  token: string;
  merchant: { email: string; tier: string };
  onLogout: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function QuotePanel({ token, merchant, onLogout }: QuotePanelProps) {
  const [phase, setPhase] = useState<QuotePhase>('idle');
  const [rates, setRates] = useState<Rate[]>([]);
  const [statuses, setStatuses] = useState<CarrierStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastShipment = useRef<Shipment | null>(null);
  const ratesRef = useRef<Rate[]>([]);
  const statusesRef = useRef<CarrierStatus[]>([]);

  const runQuote = useCallback(
    async (shipment: Shipment) => {
      lastShipment.current = shipment;
      setPhase('loading');
      setRates([]);
      setStatuses([]);
      ratesRef.current = [];
      statusesRef.current = [];
      setError(null);
      try {
        await streamQuote(token, shipment, {
          onRate: (rate) => {
            ratesRef.current = [...ratesRef.current, rate];
            setRates(ratesRef.current);
          },
          onCarrierStatus: (status) => {
            statusesRef.current = [...statusesRef.current, status];
            setStatuses(statusesRef.current);
          },
          onDone: () => {
            const failures = statusesRef.current.filter(
              (s) => s.status === 'FAILED' || s.status === 'GIVEN_UP',
            );
            const hadRates = ratesRef.current.length > 0;
            setPhase(failures.length > 0 ? 'partial' : hadRates ? 'complete' : 'no-service');
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Quote failed');
        setPhase((current) => (current === 'loading' ? 'partial' : current));
      }
    },
    [token],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Quick Quote</h1>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <div className="font-medium text-slate-800">{merchant.email}</div>
            <div className="text-xs capitalize text-slate-500">{merchant.tier} tier</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <Section title="New quote">
        <ShipmentForm busy={phase === 'loading'} onSubmit={runQuote} />
        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </Section>

      <Section title="Rates">
        <RatesList
          phase={phase}
          rates={rates}
          statuses={statuses}
          onRetry={() => {
            if (lastShipment.current) void runQuote(lastShipment.current);
          }}
          canRetry={lastShipment.current !== null}
        />
      </Section>

      <Section title="Quote history">
        <HistoryView token={token} />
      </Section>
    </div>
  );
}