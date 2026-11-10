// Worker-safe API of `hold-segmentation`: pure functions and data, no React or store.
import type { DecodedHold, Point } from '../../workers/protocol';
import { cleanMask, maskStats, pickMask } from './mask';

/**
 * Hold sequence numbers rise across every ledger in the worker, so a `seen` value can never refer
 * to a number a newer ledger hands out again.
 */
let lastSeq = 0;

/**
 * The holds the worker has returned for one image, so a later tap never overlaps them, even
 * when it was sent before the earlier hold reached the main thread (SPEC-hold-segmentation ›
 * Amendment 2026-10-30). Holds are numbered by `seq`; the main thread tells us the highest
 * `seq` it has processed and which holds it still has, and we forget the rest.
 */
export class HoldLedger {
  private readonly holds = new Map<
    string,
    { mask: Uint8Array; bbox: DecodedHold['bbox']; seq: number }
  >();
  /** The latest sequence this ledger handed out (what a miss reports). */
  private seq = lastSeq;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  /** Forgets holds the main thread has seen (seq ≤ `seen`) and no longer selects. */
  prune(selected: readonly string[], seen: number): void {
    const keep = new Set(selected);
    for (const [id, h] of this.holds) if (h.seq <= seen && !keep.has(id)) this.holds.delete(id);
  }

  /** Picks, cleans and measures one tap's candidates; null when no hold can be isolated. */
  finish(
    candidates: readonly Uint8Array[],
    scores: readonly number[],
    tap: Point,
  ): { seq: number; hold: DecodedHold | null } {
    const { width: w, height: h } = this;
    const p = { x: Math.round(tap.x), y: Math.round(tap.y) };
    const picked = pickMask(candidates, scores, p, w, h);
    if (!picked) return { seq: this.seq, hold: null };

    const taken = new Uint8Array(w * h);
    for (const { mask, bbox } of this.holds.values()) {
      for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
        for (let i = y * w + bbox.x, end = i + bbox.w; i < end; i++) taken[i]! |= mask[i]!;
      }
    }
    const mask = cleanMask(picked, p, w, h, taken);
    const stats = maskStats(mask, w, h);
    if (!stats.area) return { seq: this.seq, hold: null };

    const id = crypto.randomUUID();
    this.seq = ++lastSeq;
    // Our own copy: the response's mask buffer is transferred to the main thread (detached here).
    this.holds.set(id, { mask: mask.slice(), bbox: stats.bbox, seq: this.seq });
    return { seq: this.seq, hold: { id, mask, ...stats, tapPoint: p } };
  }
}
