import { workerIsLowMemory } from './backend';
import { createWorkerHost, type Handlers } from './host';
import type { Endpoint, FromWorker, ToWorker } from './protocol';
import { clipHandlers, loadClipModel } from './clip';
import { depthHandlers, loadDepthModel } from './depth';
import { createMlHandlers } from './mlHandlers';
import { samHandlers } from './sam';

const handlers: Handlers = createMlHandlers({
  lowMemory: workerIsLowMemory(),
  load: { depth: loadDepthModel, clip: loadClipModel },
  models: { ...samHandlers, ...depthHandlers, ...clipHandlers },
});

// Models load outside the one-at-a-time queue; only inference queues (taps stay fast during downloads).
const host = createWorkerHost(handlers, self as unknown as Endpoint<FromWorker>, {
  'depth:run': (_req, ctx) => loadDepthModel(ctx),
  'clip:embed': (_req, ctx) => loadClipModel(ctx),
});
self.onmessage = (e: MessageEvent<ToWorker>) => host(e.data);
