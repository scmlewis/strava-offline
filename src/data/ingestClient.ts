import { ingestFiles, type IngestSummary, type IngestionIssue } from './zip';

export interface IngestProgress {
  done: number;
  total: number;
  phase: string;
}

/**
 * Run ingest off the main thread when Workers are available; fall back to a
 * synchronous (async) call on the main thread otherwise. Either way the caller
 * gets an IngestSummary and incremental progress callbacks so the UI can show a
 * bar without freezing on large (44MB) zips.
 */
export function runIngest(
  files: File[] | FileList,
  onProgress?: (p: IngestProgress) => void,
): Promise<IngestSummary> {
  const list = Array.from(files);

  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./ingest.worker.ts', import.meta.url), { type: 'module' });
      return new Promise<IngestSummary>((resolve, reject) => {
        worker.onmessage = (ev: MessageEvent) => {
          const msg = ev.data;
          if (msg.type === 'progress') onProgress?.(msg);
          else if (msg.type === 'done') {
            worker.terminate();
            resolve(msg.summary);
          } else if (msg.type === 'error') {
            worker.terminate();
            reject(new Error(msg.message));
          }
        };
        worker.onerror = () => {
          worker.terminate();
          // fall back to main thread on worker failure
          ingestFiles(list, (d, t, phase) => onProgress?.({ done: d, total: t, phase }))
            .then(resolve)
            .catch(reject);
        };
        worker.postMessage({ type: 'ingest', files: list });
      });
    } catch {
      // Worker construction failed (e.g. unsupported env) — fall through.
    }
  }

  return ingestFiles(list, (done, total, phase) => onProgress?.({ done, total, phase }));
}

export type { IngestionIssue, IngestSummary };
