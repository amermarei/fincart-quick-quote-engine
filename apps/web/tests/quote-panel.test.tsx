import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuotePanel } from '../src/components/QuotePanel';

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const successFrames = [
  'event: request\ndata: {"requestId":"r1"}\n\n',
  'event: rate\ndata: {"carrier":"MERIDIAN","service":"MER-GROUND","baseMinor":1249,"taxMinor":0,"totalMinor":1249,"currency":"USD","etaFrom":"2026-09-14","etaTo":"2026-09-14"}\n\n',
  'event: rate\ndata: {"carrier":"SWIFTPOST","service":"SP-GROUND","baseMinor":9000,"taxMinor":667,"totalMinor":9667,"currency":"USD","etaFrom":"2026-09-15","etaTo":"2026-09-15"}\n\n',
  'event: done\ndata: {"requestId":"r1"}\n\n',
];

const partialFrames = [
  'event: request\ndata: {"requestId":"r2"}\n\n',
  'event: rate\ndata: {"carrier":"MERIDIAN","service":"MER-GROUND","baseMinor":1249,"taxMinor":0,"totalMinor":1249,"currency":"USD","etaFrom":"2026-09-14","etaTo":"2026-09-14"}\n\n',
  'event: carrier-status\ndata: {"carrier":"ATLAS","status":"FAILED","errorCode":"RATE_LIMITED","errorDetail":"Too many requests"}\n\n',
  'event: done\ndata: {"requestId":"r2"}\n\n',
];

const noServiceFrames = [
  'event: request\ndata: {"requestId":"r3"}\n\n',
  'event: carrier-status\ndata: {"carrier":"SWIFTPOST","status":"NO_SERVICE","errorCode":"LANE_UNSERVED","errorDetail":"No service for lane US-JP"}\n\n',
  'event: carrier-status\ndata: {"carrier":"ATLAS","status":"NO_SERVICE","errorCode":"COVERAGE","errorDetail":"outside Atlas network"}\n\n',
  'event: carrier-status\ndata: {"carrier":"MERIDIAN","status":"NO_SERVICE","errorCode":"LANE_UNSERVED","errorDetail":"no contract rate"}\n\n',
  'event: done\ndata: {"requestId":"r3"}\n\n',
];

function mockFetch(frames: string[], historyQuotes: unknown[] = []) {
  return vi.fn().mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/api/quotes') && (init?.method ?? 'GET') === 'POST') {
      return sseResponse(frames);
    }
    return new Response(JSON.stringify({ quotes: historyQuotes }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('QuotePanel', () => {
  it('renders a label for every shipment field', () => {
    render(<QuotePanel token="t" merchant={{ email: 'test@fincart.test', tier: 'standard' }} onLogout={() => {}} />);
    expect(screen.getByLabelText(/Origin country code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Origin postcode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Origin timezone/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination country code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination postcode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Weight \(kg\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Length \(cm\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Width \(cm\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Height \(cm\)/)).toBeInTheDocument();
  });

  it('blocks an invalid shipment and shows the associated error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ quotes: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<QuotePanel token="t" merchant={{ email: 'test@fincart.test', tier: 'standard' }} onLogout={() => {}} />);

    const weight = screen.getByLabelText(/Weight \(kg\)/);
    await user.clear(weight);
    await user.type(weight, '0');
    await user.click(screen.getByRole('button', { name: /Get quotes/ }));

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('streams rates as they arrive and reaches the complete state', async () => {
    vi.stubGlobal('fetch', mockFetch(successFrames));
    const user = userEvent.setup();
    render(<QuotePanel token="t" merchant={{ email: 'test@fincart.test', tier: 'standard' }} onLogout={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Get quotes/ }));

    await waitFor(() => {
      expect(screen.getByText(/Meridian Freight/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/SwiftPost/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Quote complete/)).toBeInTheDocument();
    });
  });

  it('names failed carriers in the partial state', async () => {
    vi.stubGlobal('fetch', mockFetch(partialFrames));
    const user = userEvent.setup();
    render(<QuotePanel token="t" merchant={{ email: 'test@fincart.test', tier: 'standard' }} onLogout={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Get quotes/ }));

    await waitFor(() => {
      expect(screen.getByText(/Atlas Logistics/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Some carriers failed/)).toBeInTheDocument();
    });
  });

  it('renders the no-service state when no carrier serves the lane', async () => {
    vi.stubGlobal('fetch', mockFetch(noServiceFrames));
    const user = userEvent.setup();
    render(<QuotePanel token="t" merchant={{ email: 'test@fincart.test', tier: 'standard' }} onLogout={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Get quotes/ }));

    await waitFor(() => {
      expect(screen.getByText(/No carrier serves this lane/)).toBeInTheDocument();
    });
  });

  it('re-runs the quote via the retry path', async () => {
    let posts = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/api/quotes') && (init?.method ?? 'GET') === 'POST') {
        posts += 1;
        return sseResponse(posts === 1 ? partialFrames : successFrames);
      }
      return new Response(JSON.stringify({ quotes: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<QuotePanel token="t" merchant={{ email: 'test@fincart.test', tier: 'standard' }} onLogout={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Get quotes/ }));
    await waitFor(() => {
      expect(screen.getByText(/Some carriers failed/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Retry quote/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3); // history GET + two quote POSTs
    });
    await waitFor(() => {
      expect(screen.getByText(/Quote complete/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Some carriers failed/)).not.toBeInTheDocument();
  });
});