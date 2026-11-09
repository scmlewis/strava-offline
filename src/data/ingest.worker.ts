/// <reference lib="webworker" />
// Off-main-thread ingest: parse the Strava export in a Worker so the UI never
// freezes on a 44MB zip. Progress is streamed back via postMessage.
import { ingestFiles, type IngestSummary } from './zip';

// Dedicated workers do not expose DOMParser (Chromium), so GPX tracks cannot be
// parsed here. Signal the client to retry on the main thread, where DOMParser
// exists, instead of silently importing routes as null.
const hasDomParser = typeof DOMParser !== 'undefined';

export interface IngestRequest {
  type: 'ingest';
  files: File[];
}
export type IngestResponse =
  | { type: 'progress'; done: number; total: number; phase: string }
  | { type: 'done'; summary: IngestSummary }
  | { type: 'error'; message: string };

self.onmessage = async (ev: MessageEvent<IngestRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'ingest') return;
  if (!hasDomParser) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: 'DOMParser unavailable in worker',
    } as IngestResponse);
    return;
  }
  try {
    const summary = await ingestFiles(msg.files, (done, total, phase) => {
      (self as unknown as Worker).postMessage({
        type: 'progress',
        done,
        total,
        phase,
      } as IngestResponse);
    });
    (self as unknown as Worker).postMessage({ type: 'done', summary } as IngestResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    } as IngestResponse);
  }
};
