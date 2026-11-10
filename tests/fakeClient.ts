import { MlClient } from '../src/workers/client';
import { createFakeHandlers } from '../src/workers/fakeHandlers';
import { createWorkerHost, type Handlers } from '../src/workers/host';
import type { Endpoint, FromWorker, ToWorker } from '../src/workers/protocol';

/**
 * The real client, host and queue wired in memory to the fake models (no Worker needed). A test
 * can pass its own handlers, e.g. the fake ones with a spied wall mask cache.
 */
export function fakeMlClient(handlers: Handlers = createFakeHandlers()): MlClient {
  const toWorker: Endpoint<ToWorker> = { postMessage: (m) => queueMicrotask(() => host(m)) };
  const toClient: Endpoint<FromWorker> = {
    postMessage: (m) => queueMicrotask(() => client.receive(m)),
  };
  const host = createWorkerHost(handlers, toClient);
  const client = new MlClient(toWorker);
  return client;
}
