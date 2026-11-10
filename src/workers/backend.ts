export interface Backend {
  device: 'webgpu' | 'wasm';
  dtype: 'fp16' | 'q8';
}

/**
 * The ML worker's name on an iPhone or iPad (SPEC.md › Amendment 2026-11-04 M1). The page tells
 * the worker this way because a worker's navigator has no maxTouchPoints, and iPadOS Safari sends a
 * Mac user agent.
 */
export const APPLE_MOBILE_WORKER = 'ml-apple-mobile';

/** An iPhone or iPad, in any browser (they are all WebKit there). */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

const WASM: Backend = { device: 'wasm', dtype: 'q8' };

/**
 * fp16 on WebGPU only when the adapter supports `shader-f16`; otherwise WASM q8.
 * (T2 spike: some adapters, e.g. SwiftShader, expose WebGPU without fp16.)
 *
 * Never WebGPU on an iPhone or iPad (Amendment 2026-11-04 M1). There, GPU buffers are wired kernel
 * memory that iOS can't reclaim by killing apps: the Setting Room's models took an iPhone 12 down to
 * ~143 MB free, and twice panicked it ("all vm-pageshortage victims exhausted"). WASM memory is the
 * page's own, so the worst case is Safari reloading the tab.
 */
export async function backendFor(env: {
  appleMobile: boolean;
  gpu: GPU | undefined;
}): Promise<Backend> {
  if (env.appleMobile) return WASM;
  try {
    const adapter = await env.gpu?.requestAdapter();
    if (adapter?.features.has('shader-f16')) return { device: 'webgpu', dtype: 'fp16' };
  } catch {
    // No usable GPU: fall through to WASM.
  }
  return WASM;
}

let cached: Promise<Backend> | null = null;

/**
 * Too little memory for SAM's encoder, which peaks at ~2.4 GB on WASM (the iPhone 12 twin,
 * SPEC-hold-segmentation › Amendment 2026-11-04): an iPhone or iPad, or a device that reports
 * 4 GB or less (`navigator.deviceMemory`, Chromium only; a 4 GB Android phone).
 */
export function isLowMemory(env: { appleMobile: boolean; deviceMemory?: number }): boolean {
  return env.appleMobile || (env.deviceMemory !== undefined && env.deviceMemory <= 4);
}

/** In the worker: the page names it on an iPhone or iPad; its own user agent is a second check. */
const workerIsAppleMobile = () =>
  self.name === APPLE_MOBILE_WORKER || isAppleMobile(navigator.userAgent, 0);

export function workerIsLowMemory(): boolean {
  return isLowMemory({
    appleMobile: workerIsAppleMobile(),
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  });
}

/** The worker's backend, picked once. */
export function pickBackend(): Promise<Backend> {
  cached ??= backendFor({ appleMobile: workerIsAppleMobile(), gpu: navigator.gpu });
  return cached;
}
