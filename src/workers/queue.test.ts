import { JobQueue } from './queue';

const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('JobQueue', () => {
  it('runs jobs one at a time in FIFO order within a priority', async () => {
    const q = new JobQueue();
    const order: string[] = [];
    const gate = deferred();
    const a = q.push({ imageId: 'img', priority: 1 }, async () => {
      order.push('a:start');
      await gate.promise;
      order.push('a:end');
    });
    const b = q.push({ imageId: 'img', priority: 1 }, async () => {
      order.push('b');
    });
    await tick();
    expect(order).toEqual(['a:start']);
    gate.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b']);
  });

  it('lets a higher-priority job jump ahead of queued jobs but not interrupt the running one', async () => {
    const q = new JobQueue();
    const order: string[] = [];
    const gate = deferred();
    const running = q.push({ imageId: 'img', priority: 1 }, async () => {
      await gate.promise;
      order.push('embed');
    });
    const depth = q.push({ imageId: 'img', priority: 1 }, async () => {
      order.push('depth');
    });
    const decode = q.push({ imageId: 'img', priority: 0 }, async () => {
      order.push('decode');
    });
    gate.resolve();
    await Promise.all([running, depth, decode]);
    expect(order).toEqual(['embed', 'decode', 'depth']);
  });

  it('returns the job result and propagates job errors', async () => {
    const q = new JobQueue();
    await expect(q.push({ imageId: 'img', priority: 1 }, async () => 42)).resolves.toBe(42);
    await expect(
      q.push({ imageId: 'img', priority: 1 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // A failed job doesn't stall the queue.
    await expect(q.push({ imageId: 'img', priority: 1 }, async () => 'next')).resolves.toBe('next');
  });

  it('drops queued jobs of other images when a new image becomes current', async () => {
    const q = new JobQueue();
    const gate = deferred();
    const ran: string[] = [];
    const running = q.push({ imageId: 'old', priority: 1 }, async () => {
      await gate.promise;
      ran.push('old-running');
    });
    const queuedOld = q.push({ imageId: 'old', priority: 1 }, async () => {
      ran.push('old-queued');
    });
    q.setCurrentImage('new');
    const queuedNew = q.push({ imageId: 'new', priority: 1 }, async () => {
      ran.push('new');
    });
    gate.resolve();
    await expect(queuedOld).rejects.toThrow(/stale/);
    await expect(running).rejects.toThrow(/stale/); // finished, but its image is no longer current
    await queuedNew;
    expect(ran).toEqual(['old-running', 'new']);
  });
});
