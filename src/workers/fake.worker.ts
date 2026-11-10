import { createFakeHandlers } from './fakeHandlers';
import { createWorkerHost } from './host';
import type { Endpoint, FromWorker, ToWorker } from './protocol';

const host = createWorkerHost(createFakeHandlers(), self as unknown as Endpoint<FromWorker>);
self.onmessage = (e: MessageEvent<ToWorker>) => host(e.data);
