import { useEffect, useState } from 'react';

export interface HistoryQuote {
  id: string;
  quotedAt: string;
  originCountry: string;
  destinationCountry: string;
  weightKg: string;
  createdAt: string;
  rates: Array<{
    carrier: string;
    status: string;
    service: string | null;
    baseMinor: number | null;
    taxMinor: number | null;
    totalMinor: number | null;
    currency: string;
    etaFrom: string | null;
    etaTo: string | null;
    errorCode: string | null;
    errorDetail: string | null;
  }>;
}

const CARRIER_NAMES: Record<string, string> = {
  SWIFTPOST: 'SwiftPost',
  ATLAS: 'Atlas Logistics',
  MERIDIAN: 'Meridian Freight',
};

const STATUS_STYLES: Record<string, string> = {
  QUOTED: 'bg-green-50 text-green-700 border-green-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  NO_SERVICE: 'bg-slate-50 text-slate-500 border-slate-200',
  GIVEN_UP: 'bg-amber-50 text-amber-700 border-amber-200',
};

function cents(amount: number | null): string {
  return amount === null ? '' : `$${(amount / 100).toFixed(2)}`;
}

export function HistoryView({ token }: { token: string }) {
  const [quotes, setQuotes] = useState<HistoryQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/quotes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`history failed: ${res.status}`);
        const body = (await res.json()) as { quotes: HistoryQuote[] };
        if (!cancelled) setQuotes(body.quotes);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'History unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (quotes === null) {
    return <p className="text-sm text-slate-500">Loading history…</p>;
  }

  if (quotes.length === 0) {
    return <p className="text-sm text-slate-400">No quotes yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {quotes.map((quote) => (
        <li key={quote.id} className="rounded-lg border border-slate-200 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-medium text-slate-800">
              {quote.originCountry} → {quote.destinationCountry}
            </div>
            <div className="text-xs text-slate-400">
              {new Date(quote.createdAt).toLocaleString()} · {quote.weightKg} kg
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {quote.rates.map((rate) => (
              <li key={`${quote.id}-${rate.carrier}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-slate-700">{CARRIER_NAMES[rate.carrier] ?? rate.carrier}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLES[rate.status] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}
                  >
                    {rate.status === 'NO_SERVICE'
                      ? 'no service'
                      : rate.status.toLowerCase().replace('_', ' ')}
                  </span>
                </span>
                <span className="text-slate-600">
                  {rate.status === 'QUOTED'
                    ? `${rate.service} — ${cents(rate.totalMinor)}`
                    : (rate.errorDetail ?? '')}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}