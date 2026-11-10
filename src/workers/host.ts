import type {
  Endpoint,
  FromWorker,
  Progress,
  RequestOf,
  RequestType,
  ResponseMap,
  ToWorker,
} from './protocol';
import { JobQueue } from './queue';

export interface HandlerContext {
  progress: (p: Progress) => void;
}

export type Handlers = {
  [K in RequestType]?: (req: RequestOf<K>, ctx: HandlerContext) => Promise<ResponseMap[K]>;
};

type AnyHandler = (req: ToWorker['req'], ctx: HandlerContext) => Promise<ResponseMap[RequestType]>;

/**
 * Per request type, work to finish before the job joins the queue: loading (downloading) its model.
 * The queue can't interrupt a running job, so a download inside a job would block every tap.
 */
export type Preparers = {
  [K in RequestType]?: (req: RequestOf<K>, ctx: HandlerContext) => Promise<unknown>;
};
type AnyPreparer = (req: ToWorker['req'], ctx: HandlerContext) => Promise<unknown>;

/**
 * Buffers in a response are transferred, not copied (masks and depth maps are large): top-level
 * typed arrays, arrays of them, and those inside a nested object such as a decoded hold.
 */
function transferables(res: object): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (item: unknown) => {
    if (ArrayBuffer.isView(item) && item.buffer instanceof ArrayBuffer) buffers.add(item.buffer);
  };
  for (const value of Object.values(res)) {
    if (Array.isArray(value)) value.forEach(add);
    else if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
      Object.values(value).forEach(add);
    } else add(value);
  }
  return [...buffers];
}

/**
 * Lower runs first. A tap is waited on; Route view needs the wall mask at once, and the climber's
 * footholds come from the same mask; the hold cards are read long before the depth map, so hold
 * types go ahead of depth (Cairn review I1).
 */
const PRIORITY: Record<RequestType, number> = {
  'sam:decode': 0,
  'sam:candidates': 0,
  'sam:embed': 1,
  'wall:segment': 1,
  'wall:footholds': 1,
  'clip:embed': 1,
  'depth:run': 2,
  'models:prefetch': 3, // runs beside the queue; listed so every request type has a rank
};

/** Worker side: queues requests and answers each one by id. Shared by the real and the fake worker. */
export function createWorkerHost(
  handlers: Handlers,
  out: Endpoint<FromWorker>,
  prepare: Preparers = {},
) {
  const queue = new JobQueue();
  const ctx: HandlerContext = {
    progress: (progress) => out.postMessage({ kind: 'progress', progress }),
  };

  return (msg: ToWorker): void => {
    const { id, req } = msg;
    const handler = handlers[req.type] as AnyHandler | undefined;
    if (!handler) {
      out.postMessage({ kind: 'response', id, ok: false, error: `no handler for ${req.type}` });
      return;
    }
    // A new embed means a new image: everything queued for the old one is stale.
    if (req.type === 'sam:embed') queue.setCurrentImage(req.imageId);
    const priority = PRIORITY[req.type];
    // The background download runs beside the queue, not in it: the queue can't interrupt a running
    // job, so a minute-long download would block every tap. Later jobs await the same (cached) load.
    const ready = (prepare[req.type] as AnyPreparer | undefined)?.(req, ctx);
    const enqueue = () => queue.push({ imageId: req.imageId, priority }, () => handler(req, ctx));
    const job =
      req.type === 'models:prefetch' ? handler(req, ctx) : ready ? ready.then(enqueue) : enqueue();

    job
      .then((res) => out.postMessage({ kind: 'response', id, ok: true, res }, transferables(res)))
      .catch((err: unknown) =>
        out.postMessage({
          kind: 'response',
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  };
}
