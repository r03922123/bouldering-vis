// Types for coco.mjs (plain JavaScript so the embed runner needs no build step).
export interface Tap {
  fx: number;
  fy: number;
  label: string;
}
export interface Job {
  photo: string;
  group: string;
  split: string;
  taps: Tap[];
}
export function cocoJobs(
  coco: unknown,
  prefix: string,
  split: string,
  maxPerClassPerPhoto?: number,
): Job[];
