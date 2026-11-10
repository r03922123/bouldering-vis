export class StaleImageError extends Error {
  constructor() {
    super('stale image: a newer image replaced this one');
  }
}

export interface JobMeta {
  imageId: string;
  /** Lower runs first. 0 = SAM decode (a user is waiting on a tap). */
  priority: number;
}

interface Job {
  meta: JobMeta;
  seq: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Runs one job at a time, so two models never compete for the GPU.
 * A running job can't be interrupted; queued jobs are ordered by priority, then FIFO.
 */
export class JobQueue {
  private jobs: Job[] = [];
  private running = false;
  private seq = 0;
  private currentImage: string | null = null;

  /** Rejects queued jobs of other images; a running one is rejected when it finishes. */
  setCurrentImage(imageId: string): void {
    this.currentImage = imageId;
    const stale = this.jobs.filter((j) => j.meta.imageId !== imageId);
    this.jobs = this.jobs.filter((j) => j.meta.imageId === imageId);
    for (const job of stale) job.reject(new StaleImageError());
  }

  push<T>(meta: JobMeta, run: () => Promise<T>): Promise<T> {
    // A job for a photo that was already replaced (e.g. it waited for a model download) never runs.
    if (this.currentImage !== null && meta.imageId !== this.currentImage) {
      return Promise.reject(new StaleImageError());
    }
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({
        meta,
        seq: this.seq++,
        run,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.pump();
    });
  }

  private isStale(job: Job): boolean {
    return this.currentImage !== null && job.meta.imageId !== this.currentImage;
  }

  private takeNext(): Job | undefined {
    let best = 0;
    this.jobs.forEach((j, i) => {
      const b = this.jobs[best]!;
      if (j.meta.priority < b.meta.priority) best = i;
    });
    return this.jobs.splice(best, 1)[0];
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    for (let job = this.takeNext(); job; job = this.takeNext()) {
      try {
        const result = await job.run();
        if (this.isStale(job)) job.reject(new StaleImageError());
        else job.resolve(result);
      } catch (err) {
        job.reject(err);
      }
    }
    this.running = false;
  }
}
