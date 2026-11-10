import { APPLE_MOBILE_WORKER, isAppleMobile } from './backend';
import type { Endpoint, FromWorker, MlRequest, Progress, ResponseMap, ToWorker } from './protocol';

interface Pending {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
}

/** Main-thread side: one promise per request, matched to its response by id. */
export class MlClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(p: Progress) => void>();

  constructor(private readonly worker: Endpoint<ToWorker>) {}

  request<R extends MlRequest>(
    req: R,
    transfer: Transferable[] = [],
  ): Promise<ResponseMap[R['type']]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: never) => void, reject });
      this.worker.postMessage({ id, req }, transfer);
    });
  }

  receive(msg: FromWorker): void {
    if (msg.kind === 'progress') {
      for (const fn of this.listeners) fn(msg.progress);
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.ok) pending.resolve(msg.res as never);
    else pending.reject(new Error(msg.error));
  }

  onProgress(fn: (p: Progress) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/**
 * `VITE_FAKE_ML=1` swaps in the fake worker (E2E and CI never run real models). On an iPhone or
 * iPad the worker's name tells it to stay off WebGPU (SPEC.md › Amendment 2026-11-04 M1).
 */
export function createMlClient(): MlClient {
  const name = isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)
    ? APPLE_MOBILE_WORKER
    : 'ml';
  const worker =
    import.meta.env.VITE_FAKE_ML === '1'
      ? new Worker(new URL('./fake.worker.ts', import.meta.url), { type: 'module', name })
      : new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module', name });
  const client = new MlClient(worker);
  worker.onmessage = (e: MessageEvent<FromWorker>) => client.receive(e.data);
  return client;
}
