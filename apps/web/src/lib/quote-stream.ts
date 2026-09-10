import type { CarrierStatus, Rate, Shipment } from '@qqe/shared';

export interface StreamHandlers {
  onRequest?: (requestId: string) => void;
  onRate?: (rate: Rate) => void;
  onCarrierStatus?: (status: CarrierStatus) => void;
  onDone?: (requestId: string) => void;
}

function parseFrame(frame: string, handlers: StreamHandlers): void {
  let eventName = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }
  if (!data) return;
  const payload = JSON.parse(data) as Record<string, unknown>;
  if (eventName === 'request' && typeof payload.requestId === 'string') {
    handlers.onRequest?.(payload.requestId);
  } else if (eventName === 'rate') {
    handlers.onRate?.(payload as unknown as Rate);
  } else if (eventName === 'carrier-status') {
    handlers.onCarrierStatus?.(payload as unknown as CarrierStatus);
  } else if (eventName === 'done' && typeof payload.requestId === 'string') {
    handlers.onDone?.(payload.requestId);
  }
}

/**
 * Consumes the POST /quotes SSE stream incrementally — the body is parsed
 * frame by frame as it arrives (first-rate latency is the contract, so we
 * never buffer the whole response).
 */
export async function streamQuote(
  token: string,
  shipment: Shipment,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch('/api/quotes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(shipment),
  });
  if (!res.ok) {
    throw new Error(`Quote request failed with status ${res.status}`);
  }
  if (!res.body) {
    throw new Error('Quote response has no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.trim()) parseFrame(frame, handlers);
      idx = buffer.indexOf('\n\n');
    }
  }
}