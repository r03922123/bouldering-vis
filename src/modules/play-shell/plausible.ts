import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  checkMove,
  validateShape,
  type BetaStep,
  type MoveContext,
  type StanceCache,
  type Target,
} from '../beta-moves';
import type { MarkKind } from './hints';

// SPEC-play-shell › Amendment 2026-11-02 H3: the plausible holds view. For the limb that is
// waiting, the referee's checkMove on every candidate target, marked as it decided: "holds"
// (static), "holds as a deadpoint" or "falls". Deterministic yes/no verdicts, never a rate. It
// never commits: nothing here touches the plan.

/** One candidate move: the waiting limb to `target`, from `prev`. */
export interface Candidate {
  target: Target;
  label: string;
  next: BetaStep;
}

export interface Mark {
  target: Target;
  label: string;
  kind: MarkKind;
}

export const MARK_WORDS: Readonly<Record<MarkKind, string>> = {
  holds: 'holds',
  deadpoint: 'holds as a deadpoint',
  falls: 'falls',
};

/**
 * The referee's verdict on one candidate as a mark, or null when beta-moves rejects its shape
 * (it isn't a move, for example a foot onto the finish): checkMove itself, through `cache`.
 */
export function markOf(
  prev: BetaStep,
  next: BetaStep,
  ctx: MoveContext,
  cache: StanceCache,
): MarkKind | null {
  if (!validateShape(prev, next, ctx).ok) return null;
  const check = checkMove(prev, next, ctx, cache);
  if (check.verdict === 'fall') return 'falls';
  return check.style === 'deadpoint' ? 'deadpoint' : 'holds';
}

/** "7 targets: 3 hold · 1 deadpoint · 3 fall": counts of the marks, nothing else. */
export function summaryLine(marks: readonly Mark[]): string {
  const n = (k: MarkKind) => marks.filter((m) => m.kind === k).length;
  const total = marks.length;
  return `${total} target${total === 1 ? '' : 's'}: ${n('holds')} hold · ${n('deadpoint')} deadpoint · ${n('falls')} fall`;
}

/** Candidates checked per idle slice at most (one solve can take a few ms). */
export const CHUNK = 2;

type Idle = (cb: (d: { timeRemaining: () => number }) => void) => number;
const idle: { request: Idle; cancel: (h: number) => void } =
  typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? {
        request: (cb) => window.requestIdleCallback(cb, { timeout: 200 }),
        cancel: (h) => window.cancelIdleCallback(h),
      }
    : {
        request: (cb) => window.setTimeout(() => cb({ timeRemaining: () => 8 }), 0),
        cancel: (h) => window.clearTimeout(h),
      };

/** What to check: a key for the exact question (route, step, limb), and its candidates. */
export interface PlausibleJob {
  key: string;
  prev: BetaStep;
  ctx: MoveContext;
  candidates: readonly Candidate[];
}

interface Progress {
  marks: readonly Mark[];
  checked: number;
}

/** Questions answered (or part-answered) kept per key; the oldest goes first. */
export const KEPT_ANSWERS = 32;

/**
 * H3: checks `job`'s candidates in small idle chunks through the shared stance cache, so the
 * screen stays responsive, and can be stopped. Progress is kept per question (route, stance,
 * limb), so asking again shows the answer at once, and a question stopped part-way resumes
 * where it stopped when it is asked again (review suggestions). `resume` (from the limb picks)
 * lifts a stop. State is set only from the idle callback and from handlers, never in an effect
 * body; progress for another key simply doesn't apply.
 */
export function usePlausible(job: PlausibleJob | null, cache: StanceCache) {
  const [answers, setAnswers] = useState<ReadonlyMap<string, Progress>>(new Map());
  const [stopped, setStopped] = useState<string | null>(null);
  const handle = useRef<number | null>(null);
  const key = job?.key ?? null;
  const current = key ? answers.get(key) : undefined;
  const total = job?.candidates.length ?? 0;
  const checked = current?.checked ?? 0;
  const done = !!job && checked === total;
  const cancelled = !!key && stopped === key && !done;
  // The job and its progress are read in the effect from here (set after render, never during
  // it): the effect follows the key, so a new object for the same question doesn't restart it.
  const latest = useRef({ job, current });
  useLayoutEffect(() => {
    latest.current = { job, current };
  });

  useEffect(() => {
    const { job, current } = latest.current;
    if (!job || job.key !== key || cancelled || done) return;
    const marks: Mark[] = [...(current?.marks ?? [])];
    let i = current?.checked ?? 0;
    const step = (deadline: { timeRemaining: () => number }) => {
      handle.current = null;
      let n = 0;
      while (
        i < job.candidates.length &&
        (n === 0 || (n < CHUNK && deadline.timeRemaining() > 4))
      ) {
        const c = job.candidates[i++]!;
        const kind = markOf(job.prev, c.next, job.ctx, cache);
        if (kind) marks.push({ target: c.target, label: c.label, kind });
        n++;
      }
      const progress = { marks: [...marks], checked: i };
      setAnswers((prev) => {
        const next = new Map(prev);
        next.delete(job.key);
        next.set(job.key, progress);
        while (next.size > KEPT_ANSWERS) next.delete(next.keys().next().value!);
        return next;
      });
      if (i < job.candidates.length) handle.current = idle.request(step);
    };
    handle.current = idle.request(step);
    return () => {
      if (handle.current !== null) idle.cancel(handle.current);
      handle.current = null;
    };
  }, [key, cancelled, done, cache]);

  return {
    marks: current?.marks ?? [],
    checked,
    total,
    done,
    cancelled,
    /** Stops the checks where they are; what is checked so far stays shown. */
    cancel: () => {
      if (handle.current !== null) idle.cancel(handle.current);
      handle.current = null;
      if (key) setStopped(key);
    },
    /** A new pick (a limb button or key): a stopped question asked again goes on. */
    resume: () => setStopped(null),
  };
}
