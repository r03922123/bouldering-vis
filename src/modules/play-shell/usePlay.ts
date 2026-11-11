import { useMemo, useState } from 'react';
import {
  canRedo,
  canUndo,
  createStanceCache,
  redo,
  targetAt,
  undo,
  type BetaStep,
  type MoveCheck,
  type MoveContext,
  type Plan,
  type Target,
} from '../beta-moves';
import { isHand, type Limb, type WallFootholds } from '../climber-stance';
import { useSfx, type ChalkPuff } from '../pixel-kit';
import {
  forgetLatest,
  forgetPlan,
  latestPlan,
  planKey,
  rememberedPlan,
  rememberLatest,
  rememberPlan,
  routeKey,
} from './memory';
import {
  attempt,
  carriedLine,
  carryPlan,
  checkLast,
  contextFor,
  routeId,
  startPlan,
  targetPoint,
  type Attempt,
  type Built,
  type PlayWall,
} from './play';
import { nextArmed } from './tray';

/**
 * What the tray shows after an attempt that changed nothing: a fall's ghost, or a rejection.
 * R0-2: it stays until the next attempt, move, Undo, Redo or Esc; arming a limb keeps it.
 */
export type Feedback = (
  { kind: 'preview'; check: MoveCheck } | { kind: 'rejected'; text: string }
) & {
  /**
   * Private PR #17 review 10: another limb has been picked since, so this is the last try, not the
   * current one: its words stay ("Last try: …"), its ghost and target go.
   */
  stale?: true;
};

interface Tray {
  /** Armed limbs, in the order picked (S6: a second limb for a 2-limb move). */
  armed: Limb[];
  /** Targets chosen so far for the armed limbs; the move is checked once each has one. */
  pending: Partial<Record<Limb, Target>>;
  feedback: Feedback | null;
  /**
   * A tap's own line ("Pick a limb first", "No foothold there for that foot"): the hint line's,
   * so a mis-tap never erases a fall's reason (R0-2). Arming a limb clears it.
   */
  hint: string | null;
  /** A target focused in the DOM list, shown as the target marker. */
  focused: { limb: Limb; target: Target } | null;
  /** R0-1: "+ limb" is on, so the next limb pressed is added rather than replacing. */
  adding: boolean;
  /**
   * Private PR #17 review 1: the bare-wall spot a foot's tap just missed, as a smear target, so "Smear
   * here" can put that foot there on purpose. Belongs to that foot while it waits.
   */
  smearSpot: { limb: Limb; target: string } | null;
}

const EMPTY_TRAY: Tray = {
  armed: [],
  pending: {},
  feedback: null,
  hint: null,
  focused: null,
  adding: false,
  smearSpot: null,
};

/** A smear target (`smear:<x>:<y>`): the target list's explicit choice, never a photo tap. */
const isSmear = (t: Target | undefined) => typeof t === 'string' && t.startsWith('smear:');

/** Chalk puffs on the photo after a grab (S11); only the newest few are ever drawn. */
const MAX_KEPT_PUFFS = 6;

/**
 * The plan for a wall (S4–S7) and the move tray's state. The plan belongs to one context: when the
 * context's key changes (a route edit, new hold types), it starts again at the setter's start or
 * defaultStart. Derived, never reset in an effect: state saved for another context simply doesn't
 * apply. Each committed plan (with its Undo history) is also kept in the session memory, so
 * leaving the wall and coming back restores it.
 */
export function usePlay(
  wallId: string,
  wall: PlayWall | null,
  footholds: WallFootholds | null,
  maxLimbs: 1 | 2,
) {
  const [cache] = useState(createStanceCache);
  // Keyed by the wall's content, not its identity: a store update that hands over an equal wall (a
  // new object, the same route) keeps the context, so defaultStart and the last check never re-run.
  const fingerprint = wall ? JSON.stringify(wall) : null;
  const parsed = useMemo(
    () => (fingerprint ? (JSON.parse(fingerprint) as PlayWall) : null),
    [fingerprint],
  );
  const built = useMemo(() => (parsed ? contextFor(parsed) : null), [parsed]);
  const ctx: MoveContext | null = built?.ok ? built.value : null;
  const setterStart = parsed?.start;
  const fresh = useMemo(
    () => (ctx ? startPlan(ctx, footholds, setterStart, cache) : null),
    [ctx, footholds, setterStart, cache],
  );
  const [saved, setSaved] = useState<{ key: string; plan: Plan; tray: Tray } | null>(null);
  const [puffs, setPuffs] = useState<ChalkPuff[]>([]);
  // Private PR #17 review 3: attempts made (committed, previewed or rejected), so a repeated attempt with
  // the same words is still a new one (the COACH answers it).
  const [tries, setTries] = useState(0);
  const sfx = useSfx();

  // A plan belongs to one route: its context key plus its hold ids (the key leaves ids out, so a
  // re-tapped hold would otherwise bring back a plan that names a hold that no longer exists).
  const id = ctx ? routeId(ctx) : null;
  const current = id && saved?.key === id ? saved : null;
  const memoryKey = id ? planKey(wallId, id) : null;
  const remembered = memoryKey ? rememberedPlan(memoryKey) : undefined;
  // Private PR #17 review 8: the same route (the same hold ids) on a new context, e.g. the wall's analysis
  // landing after Plan opened. The plan made on the old context is re-checked here rather than
  // dropped: never a silent reset. Re-review 1: from this session's state, or else from memory's
  // latest plan for this wall and route (after a return to the wall). Derived; the next save keeps
  // it under the new key, and memory keeps the old plan until then, so the carry is never lost.
  const holdsOf = (k: string) => k.slice(k.lastIndexOf('\n') + 1);
  const latestKey = id ? routeKey(wallId, holdsOf(id)) : null;
  const last0 = latestKey ? latestPlan(latestKey) : undefined;
  const from =
    !id || current || remembered
      ? null
      : saved && saved.key !== id && holdsOf(saved.key) === holdsOf(id)
        ? saved.plan
        : last0 && last0.ctxKey !== id
          ? last0.plan
          : null;
  const carried = useMemo(
    () =>
      ctx && from && from.beta.steps.length > 1
        ? carryPlan(from, ctx, cache, fresh?.ok ? fresh.value : null)
        : null,
    [ctx, from, cache, fresh],
  );
  const plan = current
    ? current.plan
    : (remembered ?? (carried ? carried.plan : fresh?.ok ? fresh.value : null));
  const tray = current?.tray ?? EMPTY_TRAY;
  const last = useMemo(
    () => (ctx && plan ? checkLast(plan, ctx, cache) : null),
    [ctx, plan, cache],
  );
  const check = last?.ok ? last.value : null;
  const failed = (b: Built<unknown> | null) => (b && !b.ok ? b.error : null);
  const error = failed(built) ?? failed(fresh) ?? failed(last);

  const save = (nextPlan: Plan, nextTray: Tray) => {
    if (!ctx || !memoryKey) return;
    rememberPlan(memoryKey, nextPlan);
    rememberLatest(latestKey!, id!, nextPlan);
    setSaved({ key: id!, plan: nextPlan, tray: nextTray });
  };
  /**
   * Tray-only changes are functional, so a late focus or blur event (its handler from an older
   * render) can never put back a plan that a move or Undo has since replaced.
   */
  const setTray = (change: (t: Tray) => Tray) => {
    if (!ctx || !plan) return;
    const key = id!;
    const base = { key, plan, tray: EMPTY_TRAY };
    setSaved((prev) => {
      const cur = prev?.key === key ? prev : base;
      return { ...cur, tray: change(cur.tray) };
    });
  };

  /** The step targetAt sees: the plan's last step with the targets chosen so far. */
  const stepNow = (): BetaStep | null =>
    plan ? { ...plan.beta.steps.at(-1)!, ...tray.pending } : null;

  /**
   * R0-1: a limb key or button. It replaces the armed limb; `add` (Shift, or "+ limb" on) adds a
   * second one, when the tier allows two (nextArmed). Targets already chosen stay with their limbs,
   * unless no limb would be left waiting for one.
   */
  const press = (limb: Limb, add = false) => {
    sfx.play('tick');
    const armed = nextArmed(tray.armed, { kind: 'press', limb, add: add || tray.adding }, maxLimbs);
    let pending = Object.fromEntries(
      Object.entries(tray.pending).filter(([l]) => armed.includes(l as Limb)),
    );
    if (armed.every((l) => l in pending)) pending = {};
    // R0-2: the last attempt's reason stays; only the tap's hint (and its smear spot) goes.
    // Review 10: with other limbs armed now, it is the last try.
    const changed = armed.join() !== tray.armed.join();
    setTray((t) => ({
      ...t,
      feedback: changed && t.feedback ? { ...t.feedback, stale: true } : t.feedback,
      armed,
      pending,
      hint: null,
      focused: null,
      adding: false,
      smearSpot: null,
    }));
  };

  /** R0-1: "+ limb", on or off. Only offered when the tier allows 2 limbs (S8). */
  const setAdding = (on: boolean) => setTray((t) => ({ ...t, adding: on && maxLimbs > 1 }));

  /** K1: Esc drops the selection, its targets and any preview. */
  const clear = () => setTray(() => EMPTY_TRAY);

  /** The armed limb still waiting for a target. */
  const waiting = tray.armed.find((l) => !(l in tray.pending)) ?? null;

  /** Sets the waiting limb's target, and checks the move once every armed limb has one. */
  const choose = (target: Target): Attempt['kind'] | 'pending' | null => {
    if (!ctx || !plan || !waiting) return null;
    const pending = { ...tray.pending, [waiting]: target };
    if (tray.armed.some((l) => !(l in pending))) {
      setTray((t) => ({ ...t, pending, hint: null, focused: null, smearSpot: null }));
      return 'pending';
    }
    const out = attempt(plan, pending, ctx, cache);
    setTries((n) => n + 1);
    if (out.kind === 'commit') {
      sfx.play(out.check.verdict === 'top' ? 'send' : 'grab');
      const born = performance.now();
      const grabs = tray.armed.flatMap((l, i) => {
        const at = isHand(l) ? targetPoint(ctx, pending[l] ?? null) : null;
        return at ? [{ seed: plan.beta.steps.length * 4 + i, at, bornMs: born }] : [];
      });
      if (grabs.length) setPuffs((p) => [...p, ...grabs].slice(-MAX_KEPT_PUFFS));
      save(out.plan, EMPTY_TRAY);
    } else {
      if (out.kind === 'preview') sfx.play('slip');
      const armed = nextArmed(tray.armed, { kind: 'attempt', outcome: out.kind }, maxLimbs);
      setTray((t) => ({
        ...t,
        armed,
        pending: {},
        feedback: out,
        hint: null,
        focused: null,
        smearSpot: null,
      }));
    }
    return out.kind;
  };

  /**
   * The target a tap at `p` (image px) would pick for the waiting limb, within `radius` image px:
   * targetAt, the one nearest rule for taps, clicks and the mouse hover (K2).
   */
  const targetFor = (p: { x: number; y: number }, radius: number): Target | undefined => {
    const step = stepNow();
    const t = ctx && step && waiting ? targetAt(ctx, step, waiting, p, radius) : undefined;
    // R0-1: a foot tap on bare wall finds nothing; a smear is picked from the target list.
    return isSmear(t) ? undefined : t;
  };

  /** A tap on the photo, in image px, within `radius` image px of a target (S6). */
  const tapAt = (p: { x: number; y: number }, radius: number) => {
    const step = stepNow();
    if (!ctx || !step) return;
    if (!waiting) {
      const text = 'Pick a limb first: LH, RH, LF or RF';
      setTray((t) => ({ ...t, hint: text }));
      return;
    }
    const t = targetFor(p, radius);
    if (t === undefined) {
      const onPhoto = p.x >= 0 && p.y >= 0 && p.x < ctx.photo.width && p.y < ctx.photo.height;
      const text = !onPhoto
        ? 'That’s off the photo'
        : isHand(waiting)
          ? 'No route hold there for that hand'
          : 'No foothold there for that foot';
      // Review 1: the spot itself stays one deliberate press away ("Smear here").
      const raw = targetAt(ctx, step, waiting, p, radius);
      const smearSpot =
        typeof raw === 'string' && isSmear(raw) ? { limb: waiting, target: raw } : null;
      setTray((t) => ({ ...t, hint: text, smearSpot }));
      return;
    }
    choose(t);
  };

  /** A list target focused (or `undefined` on blur): shown as the target marker. */
  const focus = (target: Target | undefined) =>
    setTray((t) => {
      const limb = t.armed.find((l) => !(l in t.pending));
      return { ...t, focused: limb && target !== undefined ? { limb, target } : null };
    });

  return {
    ctx,
    plan,
    check,
    error,
    cache,
    tray,
    waiting,
    puffs,
    tries,
    /** Review 8: what changed when the plan was re-checked on a new context, until the next act. */
    notice: !current && !remembered && carried ? carriedLine(carried) : null,
    press,
    setAdding,
    clear,
    choose,
    tapAt,
    targetFor,
    focus,
    canUndo: !!plan && canUndo(plan),
    canRedo: !!plan && canRedo(plan),
    undo: () => plan && save(undo(plan), EMPTY_TRAY),
    redo: () => plan && save(redo(plan), EMPTY_TRAY),
    /** S2: the plan starts again (after the player confirms a route edit). */
    reset: () => {
      if (memoryKey) forgetPlan(memoryKey);
      if (latestKey) forgetLatest(latestKey);
      setSaved(null);
    },
  };
}
