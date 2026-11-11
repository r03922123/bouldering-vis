import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Target } from '../beta-moves';
import type { Limb, WallFootholds } from '../climber-stance';
import type { Profile } from '../gym-hub';
import { drawBadge, HoldList, RouteSteps, SelectionCanvas } from '../hold-segmentation';
import {
  PixelLayer,
  type HoldMarker,
  type PixelScene,
  type PixelView,
  type ReachGap,
} from '../pixel-kit';
import type { DepthStatus } from '../depth-estimation';
import type { WorkingImage } from '../image-input';
import type { MlClient } from '../../workers/client';
import { sameView, viewFrom } from './adapt';
import { AidsMenu, type Aid } from './AidsMenu';
import { breakdownLine, coachPages } from './coach';
import {
  DirectionBanner,
  DirectionHandles,
  DirectionHoldList,
  type DragPreview,
  type DirectionProps,
} from './DirectionMap';
import { useWide } from './layout';
import {
  applyEdits,
  clampGrip,
  sameEdits,
  withEdit,
  withoutEdit,
  type Edits,
  type HoldEdit,
  type HoldShape,
} from './directions';
import { CoachWindow } from './CoachWindow';
import { useViewAids, viewAidsFor } from './aids';
import { holdArrows } from './hints';
import { annotateHolds, handlesOf, markSpot } from './annotate';
import { ArrowLayer } from './ArrowLayer';
import { MARK_WORDS, summaryLine, usePlausible, type PlausibleJob } from './plausible';
import { useLimbKeys } from './keys';
import { MoveTray } from './MoveTray';
import { NumbersPanel } from './NumbersPanel';
import { PlanPhoto } from './PlanPhoto';
import {
  badgeSpots,
  boxAt,
  climberFor,
  goalText,
  listTargets,
  moodOf,
  reachGap,
  routeId,
  startBannerText,
  targetLabel,
  targetPoint,
  verdictLine,
  type PlayWall,
} from './play';
import { TargetList } from './TargetList';
import { movingLine, trayFor } from './tray';
import { editsKey, rememberedEdits, rememberEdits, takeDepthNotice } from './memory';
import { usePlay } from './usePlay';

export interface PlayScreenProps {
  wallId: string;
  /** The bay's name in the gym ("Wall 2"). */
  title: string;
  profile: Profile;
  /** "◀ Gym" in the header. Absent on the front-door wall, which has no way to the gym (R3). */
  onBack?: () => void;
  /** The ML worker, for tagging; null on a baked level, so the worker never starts there. */
  client: MlClient | null;
  /** This wall's photo, once it is in the store. Until then the screen says the wall is opening. */
  photo: WorkingImage | null;
  /** A baked level (S9): the wall opens straight into Plan. */
  level: PlayWall | null;
  /** The route tagged on this photo, once it is complete and its analysis is in (S2). */
  tagged: PlayWall | null;
  /** Tag: the route has 1–2 starts and a finish, so it can be planned. */
  tagReady: boolean;
  /** climber-stance's wall footholds for this photo (defaultStart's claim rules), if any. */
  footholds: WallFootholds | null;
  /** Tag → Plan: the app starts the route's analysis (hold types, depth, footholds). */
  onPlan: () => void;
  /** The Aids menu (S8): turns an aid on or off in the profile, at any level. */
  onSetAid: (aid: Aid, on: boolean) => void;
  /** H2: the ML worker, asked for only when the 3D view first asks for depth (its model). */
  ml?: () => MlClient;
  /** H2: this photo's depth: in or not, and the app's depth status. */
  depth3d?: { ready: boolean; status: DepthStatus };
  /**
   * H2: asks the app for this photo's depth. Only on a baked level, whose referee input is the
   * level file: on a tagged route depth feeds the forces, so the 3D hint must never ask for it.
   */
  onRequestDepth?: () => void;
  /** E1: each tagged hold's box and mask, so a moved grip point stays on the hold. */
  holdShapes?: ReadonlyMap<string, HoldShape>;
  /** S14: "Open in Setting Room" takes this photo and route to the Studio (walls without a level). */
  onOpenStudio?: () => void;
}

type Scene = Omit<PixelScene, 'timeMs' | 'reducedMotion'>;

/** H2: the 3D view, with three.js, loads only when it is first opened. */
const Wall3D = lazy(() => import('./Wall3D'));
type Point = { x: number; y: number };

/** Shown on the canvas status line in Plan (taps there never add holds). */
const PLAN_HINT = 'Pick a limb, then tap where it goes.';
/** A tap picks the nearest target within 24 CSS px: a 48 px touch target (Material's minimum). */
const TAP_RADIUS_CSS = 24;
/** px a pointer may move and still count as a tap (as on the Studio's canvas). */
const TAP_SLOP = 6;
const EMPTY: readonly never[] = [];
const NO_EDITS: Edits = {};

/**
 * The Play screen (SPEC-play-shell): the wall photo, untouched, with the pixel climber in the
 * referee's pose on top, the move tray underneath, and the referee's verdict in words.
 */
export function PlayScreen(props: PlayScreenProps) {
  const { wallId, title, profile, onBack, client, photo, level, tagged, tagReady, footholds } =
    props;
  const { onPlan, onSetAid, onOpenStudio } = props;
  const openStudio = onOpenStudio && !level && (
    <button type="button" onClick={onOpenStudio}>
      Open in Setting Room
    </button>
  );
  // The phase starts from the level (S9: a baked level opens in Plan), until the player moves.
  const [chosen, setPhase] = useState<'tag' | 'plan' | null>(null);
  const phase = chosen ?? (level ? 'plan' : 'tag');
  const [confirmEdit, setConfirmEdit] = useState(false);
  // Amendment (b): the layout (U2 wide, U3 phone), the phone's hints drawer and the target list
  // behind "List targets" (U5). Plain UI state, set only from handlers.
  const wide = useWide();
  const [drawerOpen, setDrawer] = useState(false);
  // The phone's COACH strip, expanded or not: Play's state, so it survives the window's remount
  // when the layout crosses the breakpoint (a review suggestion).
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachFoldedAt, setCoachFoldedAt] = useState<number | null>(null);
  // The phone's bottom bar, measured into --play-bar-h on the page (a review suggestion), so the
  // page's padding and scroll padding keep everything clear of it (WCAG 2.4.11), however tall the
  // hint line or edit mode makes it. Written from the observer, never from render.
  const barObserver = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((bar: HTMLDivElement | null) => {
    barObserver.current?.disconnect();
    barObserver.current = null;
    const root = document.documentElement;
    if (!bar) {
      root.style.removeProperty('--play-bar-h');
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() =>
      root.style.setProperty('--play-bar-h', `${bar.offsetHeight}px`),
    );
    ro.observe(bar);
    barObserver.current = ro;
  }, []);
  const [listOpen, setList] = useState(false);
  const wall = level ?? (phase === 'plan' ? tagged : null);
  // S8: the profile sets only the tray and what is shown, never the referee's rules.
  const settings = trayFor(profile);
  // E1: the direction map's edits, on Play's own copy of the holds (a level file never changes).
  // Kept for the session per wall and route; state saved for another route doesn't apply.
  const eKey = wall
    ? editsKey(
        wallId,
        wall.holds.map((h) => h.id),
      )
    : null;
  const [savedEdits, setSavedEdits] = useState<{ key: string; edits: Edits } | null>(null);
  const edits: Edits =
    (eKey && (savedEdits?.key === eKey ? savedEdits.edits : rememberedEdits(eKey))) || NO_EDITS;
  const edited = useMemo(() => (wall ? applyEdits(wall, edits) : null), [wall, edits]);
  const play = usePlay(wallId, edited, level ? null : footholds, settings.maxLimbs);
  const { ctx, check, plan, tray } = play;
  const moves = plan ? plan.beta.steps.length - 1 : 0;
  const inPlan = !!photo && phase === 'plan';
  const ready = inPlan && !!ctx && !play.error;
  // E1: the direction map opens before every plan of a tagged route: on a plan with no moves,
  // until "Start planning". A plan in progress (back from the gym) resumes; its directions were
  // checked. A baked level skips it (SPEC-launch-wall-2 R7): the setter set each pull, and
  // "Check directions" still opens it.
  const [mapChoice, setMap] = useState<{ key: string; mode: 'check' | 'edit' | 'closed' } | null>(
    null,
  );
  const mapMode = !ready
    ? null
    : mapChoice && mapChoice.key === eKey
      ? mapChoice.mode
      : moves === 0 && !level
        ? 'check'
        : 'closed';
  const inMap = mapMode === 'check' || mapMode === 'edit';
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  // Private PR #17 review 11: a limb key or a wall tap on the direction check, answered in its banner.
  // Belongs to one check of one route (derived: shown only while that check is open).
  const [mapNudged, setMapNudged] = useState<string | null>(null);
  const nudgeMap = () => setMapNudged(eKey);
  const mapNudge =
    mapMode === 'check' && mapNudged === eKey ? 'Press Start planning to climb' : null;
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  // H2: the 3D panel and the worker it asks for depth; the notice shows on the session's first.
  // Depth is asked for only on a baked level (review finding 1), from this click, never an effect.
  const [threeD, setThreeD] = useState<{ client: MlClient | null; notice: boolean } | null>(null);
  const depth3d = props.depth3d ?? { ready: false, status: { state: 'idle' } as const };
  const toggle3D = () => {
    if (threeD) return setThreeD(null);
    const ask = !!props.onRequestDepth && !depth3d.ready && depth3d.status.state !== 'running';
    const c = ask ? (props.ml?.() ?? null) : null;
    if (ask && c) props.onRequestDepth!();
    setThreeD({ client: c, notice: ask && !!c && takeDepthNotice() });
  };
  // Review 10: a stale try (another limb picked since) keeps its words, not its ghost.
  const preview =
    tray.feedback?.kind === 'preview' && !tray.feedback.stale ? tray.feedback.check : null;

  // S1: the pixel layer's view comes from the canvas's own toScreen, into state only on a change.
  // drawExtras runs inside the canvas's effect, so it only notes the view; the next animation
  // frame commits it (hard rule 4: no synchronous setState in an effect body).
  const [view, setView] = useState<PixelView | null>(null);
  const noted = useRef<PixelView | null>(null);
  const commitFrame = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (commitFrame.current !== undefined) cancelAnimationFrame(commitFrame.current);
    },
    [],
  );
  const drawExtras = useCallback(
    (g: CanvasRenderingContext2D, toScreen: (p: Point) => Point) => {
      const next = viewFrom(
        toScreen,
        g.canvas.clientWidth,
        g.canvas.clientHeight,
        window.devicePixelRatio || 1,
      );
      if (!sameView(noted.current, next)) {
        noted.current = next;
        commitFrame.current ??= requestAnimationFrame(() => {
          commitFrame.current = undefined;
          const v = noted.current;
          setView((cur) => (v && !sameView(cur, v) ? v : cur));
        });
      }
      // A baked level has no hold masks, so the Studio's badges are drawn here, above each hold
      // (badgeSpots, the same circles the hint layer keeps out of).
      if (!level || !ctx) return;
      for (const b of badgeSpots(ctx, next, (h) => boxAt(ctx, h.centroid))) {
        drawBadge(g, b.x, b.y, b.label);
      }
    },
    [level, ctx],
  );

  const badgeLabels = useMemo(
    () => (level && ctx ? ctx.holds.map((h) => h.label).join(',') : ''),
    [level, ctx],
  );

  const marker = useCallback(
    (limb: Limb, target: Target): HoldMarker[] => {
      const p = ctx && targetPoint(ctx, target);
      return p && ctx ? [{ holdId: target!, role: 'target', bbox: boxAt(ctx, p), limb }] : [];
    },
    [ctx],
  );

  // K2: the mouse's hover target, for the limb that was waiting when it was found. Set only when
  // the target under the pointer changes; shown only while that limb still waits.
  // It belongs to one step too (review suggestion): after a move or a 2-limb pick, the old hover
  // (another stance) doesn't come back until the mouse moves again. Derived, never reset.
  // Keyed by the stance itself (the last step's targets), not the plan's length: after Undo and
  // a different move the plan is as long again but the stance is another (re-review 2).
  const hoverStep = plan
    ? `${JSON.stringify(plan.beta.steps.at(-1))}:${JSON.stringify(tray.pending)}`
    : '';
  const [hovered, setHover] = useState<{ limb: Limb; target: Target; step: string } | null>(null);
  const hover =
    hovered && play.waiting === hovered.limb && hovered.step === hoverStep ? hovered : null;

  const scene = useMemo<Scene>(() => {
    const markers = [
      ...Object.entries(tray.pending).flatMap(([l, t]) => marker(l as Limb, t ?? null)),
      ...(tray.focused ? marker(tray.focused.limb, tray.focused.target) : []),
      ...(hover ? marker(hover.limb, hover.target) : []),
    ];
    const selected = play.waiting ?? tray.armed[0] ?? null;
    return {
      climber: check && ctx ? climberFor(check, ctx, moodOf(check), selected) : null,
      markers,
      gaps: EMPTY,
      puffs: play.puffs,
    };
  }, [check, ctx, tray, play.waiting, play.puffs, marker, hover]);

  // H1: the referee's own pull per route hold, drawn as arrows when "Hold directions" is on.
  const viewAids = viewAidsFor(profile, useViewAids());
  const setViewAid = useViewAids((s) => s.set);
  const arrows = useMemo(() => {
    const all = ctx ? holdArrows(ctx) : [];
    // A drag's preview shows only in edit mode, so it can't outlive it (review suggestion).
    const p = mapMode === 'edit' ? dragPreview : null;
    if (!p) return all;
    // A drag in progress (E1) is drawn as it would be committed.
    return all.map((a) =>
      a.id === p.id ? { ...a, dir: p.custom ?? a.dir, base: p.grip ?? a.base, user: true } : a,
    );
  }, [ctx, dragPreview, mapMode]);
  const showArrows = viewAids.directions || inMap;
  const arrowData = useMemo(
    () => JSON.stringify(arrows.map((a) => ({ id: a.id, dir: a.dir }))),
    [arrows],
  );

  // S6: a fall is a ghost of the move, with its target and (out of reach) the gap.
  const ghost = useMemo<Scene | null>(() => {
    if (!preview || !ctx || !preview.move) return null;
    const gap = reachGap(ctx, preview);
    return {
      climber: climberFor(preview, ctx, 'fail', null),
      markers: Object.entries(preview.move.to).flatMap(([l, t]) => marker(l as Limb, t ?? null)),
      gaps: gap ? [gap] : (EMPTY as readonly ReachGap[]),
      puffs: EMPTY,
    };
  }, [preview, ctx, marker]);

  // Taps on the photo go to the move tray, never to the Studio's hold picker (S6).
  const down = useRef<Point | null>(null);
  /** The photo point (image px) under a pointer event on the tap layer. */
  const imagePoint = (e: React.PointerEvent<HTMLDivElement>, v: PixelView) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left - v.tx) / v.scale, y: (e.clientY - r.top - v.ty) / v.scale };
  };
  /** K2: a mouse over the photo outlines what a click would pick. Touch never previews. */
  const onHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !view || view.scale <= 0 || !play.waiting) return;
    const t = play.targetFor(imagePoint(e, view), TAP_RADIUS_CSS / view.scale);
    const next = t === undefined ? null : { limb: play.waiting, target: t, step: hoverStep };
    if (next?.target !== hover?.target || next?.limb !== hover?.limb) setHover(next);
  };
  const onTapUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = down.current;
    down.current = null;
    if (!start || !view || view.scale <= 0) return;
    // Review 11: on the direction check, a tap says what to do first.
    if (inMap) return nudgeMap();
    const r = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (Math.hypot(sx - start.x, sy - start.y) > TAP_SLOP) return;
    play.tapAt(
      { x: (sx - view.tx) / view.scale, y: (sy - view.ty) / view.scale },
      TAP_RADIUS_CSS / view.scale,
    );
  };

  const hoverAt = hover && ctx && view && targetPoint(ctx, hover.target);
  const hoverLabel = hover && ctx && hoverAt && view && (
    <span
      className="play-hover-label"
      aria-hidden="true"
      style={{ left: hoverAt.x * view.scale + view.tx, top: hoverAt.y * view.scale + view.ty }}
    >
      {targetLabel(ctx, hover.target)}
    </span>
  );

  // The last attempt's words (R0-2), as the last try once another limb is picked (review 10).
  const fb = tray.feedback;
  const tryVerdict =
    ctx && fb ? (fb.kind === 'preview' ? verdictLine(ctx, fb.check) : fb.text) : null;
  // Re-review 2: "Last try:" is the box's own mark; the live region keeps the referee's exact
  // verdict (S12).
  const tryLine = tryVerdict && fb?.stale ? `Last try: ${tryVerdict}` : tryVerdict;
  const verdict = !ctx ? null : (tryVerdict ?? (check ? verdictLine(ctx, check) : null));
  // The hints aid: a coach's line on how to move, until the player has a limb picked. R0-1: with a
  // limb armed, at every level, the line names it ("Moving: right hand — tap a hold").
  const coachTip = profile.hints && !tray.armed.length ? PLAN_HINT : null;
  const hint = tray.hint ?? play.notice ?? movingLine(tray.armed, play.waiting) ?? coachTip;
  const shown = preview ?? check;
  // D1: the coach's pages, the referee's words as the live region has them, plus (Numbers on) a
  // one-line breakdown of the shown check's Numbers rows.
  const coachLines = useMemo(() => {
    if (!photo) return ['Opening the wall…'];
    if (play.error) return [];
    if (!ctx) return ['Reading the wall…'];
    // R0-4: on the start (no move yet), the goal comes first, then the start verdict.
    const words = tryLine
      ? [tryLine]
      : check && !check.move
        ? [`Goal: ${goalText(ctx)}`, ...coachPages(ctx, check)]
        : check
          ? coachPages(ctx, check)
          : [];
    return settings.numbers && shown ? [...words, breakdownLine(shown)] : words;
  }, [photo, play.error, ctx, tryLine, check, settings.numbers, shown]);

  const smearAt = useMemo(() => {
    const limb = play.waiting;
    if (!limb || !check) return null;
    const c = check.contacts[limb];
    if (c) return { x: c.point[0], y: c.point[1] };
    const j = check.stance.joints?.[limb === 'lf' ? 'lFoot' : 'rFoot'];
    return j ? { x: j[0], y: j[1] } : null;
  }, [play.waiting, check]);
  // Review 1: the spot a foot's tap just missed, as "Smear here", while that foot waits.
  const smearHere =
    tray.smearSpot && tray.smearSpot.limb === play.waiting ? tray.smearSpot.target : null;
  const targets = useMemo(() => {
    if (!ctx || !play.waiting) return [];
    const all = listTargets(ctx, play.waiting, smearAt);
    if (!smearHere) return all;
    // Before "Let go", after the current point's "Smear".
    return [...all.slice(0, -1), { target: smearHere, label: 'Smear here' }, ...all.slice(-1)];
  }, [ctx, play.waiting, smearAt, smearHere]);

  // H3: the referee's verdict on every candidate for the waiting limb, while "Plausible holds" is
  // on. Only from a stance that holds (a fallen start or a top has no next move).
  const job = useMemo<PlausibleJob | null>(() => {
    const limb = play.waiting;
    if (!viewAids.plausible || !ctx || !plan || !limb || check?.verdict !== 'hold') return null;
    const prev = plan.beta.steps.at(-1)!;
    const candidates = targets
      .filter((t) => t.target !== null)
      .map((t) => ({ ...t, next: { ...prev, ...tray.pending, [limb]: t.target } }));
    const key = [routeId(ctx), JSON.stringify(prev), limb, JSON.stringify(tray.pending)].join('\n');
    return { key, prev, ctx, candidates };
  }, [viewAids.plausible, ctx, plan, play.waiting, check, targets, tray.pending]);
  const plausible = usePlausible(job, play.cache);
  /** A limb picked (button or key): a stopped plausible-holds question asked again goes on. */
  const pickLimb = (l: Limb, add = false) => {
    plausible.resume();
    play.press(l, add);
  };
  const marks = job ? plausible.marks : EMPTY;

  // T1: the hold annotations, thin and in CSS px (annotate.ts), beside each hold's box. The
  // boxes and the step badges: tagged holds by their mask's box, a baked level's by boxAt.
  const boxImage = useCallback(
    (id: string) => {
      const h = ctx?.holds.find((x) => x.id === id);
      if (!ctx || !h) return { x: 0, y: 0, w: 0, h: 0 };
      return props.holdShapes?.get(id)?.bbox ?? boxAt(ctx, h.centroid);
    },
    [ctx, props.holdShapes],
  );
  const badges = useMemo(
    () =>
      view && ctx ? badgeSpots(ctx, view, (h) => boxImage(h.id)) : (EMPTY as readonly never[]),
    [view, ctx, boxImage],
  );
  const annotated = useMemo(() => {
    if (!view || !ctx || !showArrows) return { annotations: [], dropped: [] };
    const toCss = (b: { x: number; y: number; w: number; h: number }) => ({
      x: b.x * view.scale + view.tx,
      y: b.y * view.scale + view.ty,
      w: b.w * view.scale,
      h: b.h * view.scale,
    });
    return annotateHolds(arrows, view, {
      boxes: (id) => toCss(boxImage(id)),
      badges,
      edit: mapMode === 'edit',
    });
  }, [view, ctx, showArrows, arrows, boxImage, badges, mapMode]);
  // Review 3: E1's handles, from the annotations drawn (the head handle on the drawn tip).
  const editHandles = useMemo(
    () =>
      view && mapMode === 'edit'
        ? new Map(
            arrows.map((h) => [
              h.id,
              handlesOf(
                annotated.annotations.find((a) => a.id === h.id),
                h,
                view,
              ),
            ]),
          )
        : new Map<string, { base: Point; head: Point }>(),
    [view, mapMode, arrows, annotated],
  );
  // Re-review 1: the arrows the badges leave no room for, so the direction map can say their pull
  // in words instead of showing nothing.
  const droppedIds = annotated.dropped;
  const markSpots = useMemo(
    () =>
      view && ctx
        ? marks.flatMap((m) => {
            const p = targetPoint(ctx, m.target);
            if (!p) return [];
            const at = { x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty };
            return [{ at: markSpot(at, annotated.annotations, badges), kind: m.kind }];
          })
        : [],
    [view, ctx, marks, annotated, badges],
  );

  /** A move from the target list: once it is committed the list goes, so the focus goes back to
   * the limb button it started from. */
  const chooseFromList = (t: Target) => {
    const limb = play.waiting;
    if (play.choose(t) === 'commit' && limb) {
      document.querySelector<HTMLButtonElement>(`.play-limb[data-limb="${limb}"]`)?.focus();
    }
  };

  // K1: the limb keys, while the tray is on screen and no dialog is open (keysIgnored).
  // Review 11: on the direction check a limb key isn't swallowed; it says what to do first.
  useLimbKeys(ready && mapMode !== 'edit', (k, add) => {
    if (inMap) return k !== 'clear' && nudgeMap();
    return k === 'clear' ? play.clear() : pickLimb(k, add);
  });

  const editRoute = () => {
    if (moves > 0) setConfirmEdit(true);
    else setPhase('tag');
  };

  const centroids = useMemo(
    () => new Map((wall?.holds ?? []).map((h) => [h.id, { x: h.centroid.x, y: h.centroid.y }])),
    [wall],
  );
  // E1: a changed direction or grip changes the referee's input, so the plan starts again.
  const changeEdits = (next: Edits) => {
    // An edit that changes nothing is no change: the plan stays (review finding 3).
    if (!eKey || sameEdits(next, edits)) return;
    play.reset();
    rememberEdits(eKey, next);
    setSavedEdits({ key: eKey, edits: next });
  };
  const editHold = (id: string, e: HoldEdit) =>
    changeEdits(withEdit(edits, id, e, centroids.get(id) ?? { x: NaN, y: NaN }));
  /** E1 translate: a grip point kept on its hold (its mask, else its box) and on the photo. */
  const clampFor = (id: string, p: Point): Point => {
    const c = centroids.get(id);
    if (!ctx || !c) return p;
    const shape = props.holdShapes?.get(id) ?? { bbox: boxAt(ctx, c) };
    const g = clampGrip(p, shape);
    return {
      x: Math.min(Math.max(g.x, 0), ctx.photo.width - 1),
      y: Math.min(Math.max(g.y, 0), ctx.photo.height - 1),
    };
  };
  const setMapMode = (mode: 'check' | 'edit' | 'closed') => {
    setDragPreview(null);
    setMapNudged(null);
    if (eKey) setMap({ key: eKey, mode });
  };
  /** After the panel goes, the focus moves to what replaces it, if it was lost with the panel
   * (never taken from wherever the player has put it since). */
  const focusSoon = (...selectors: string[]) =>
    requestAnimationFrame(() => {
      const at = document.activeElement;
      if (at && at !== document.body) return;
      // The first of `selectors` that is on the page now, in that order.
      for (const sel of selectors) {
        const el = sel ? document.querySelector<HTMLElement>(sel) : null;
        if (el) return el.focus();
      }
    });

  const header = (
    <header className="play-header">
      {onBack && (
        <a
          className="play-back"
          href="#/gym"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <span aria-hidden="true">◀</span>Gym
        </a>
      )}
      <h1>{title}</h1>
      {/* R0-4: the goal at every width, first in the reading order after the wall's name. */}
      {inPlan && ctx && (
        <p className="play-goal">
          Goal<span aria-hidden="true"> ·</span>
          <span className="visually-hidden">:</span> {goalText(ctx)}
        </p>
      )}
    </header>
  );

  const confirm = inPlan && confirmEdit && (
    <div role="alertdialog" aria-labelledby="edit-route-title" className="confirm">
      <p id="edit-route-title">Edit the route? This clears your plan.</p>
      <button
        type="button"
        onClick={() => {
          setConfirmEdit(false);
          play.reset();
          setPhase('tag');
        }}
      >
        Clear the plan
      </button>
      <button type="button" autoFocus onClick={() => setConfirmEdit(false)}>
        Keep my plan
      </button>
    </div>
  );

  // Tag (S2). U7: on a wide screen, Plan's layout: the photo left, the route steps, Plan this
  // route, Open in Setting Room and the hold list in the side panel. Narrow: stacked, as before,
  // the photo sticky above the steps.
  if (phase === 'tag') {
    const tagControls = (
      <>
        <RouteSteps />
        <button
          type="button"
          className="primary"
          disabled={!tagReady}
          onClick={() => {
            onPlan();
            setMap(null);
            setPhase('plan');
          }}
        >
          Plan this route
        </button>
        {openStudio}
        <HoldList />
      </>
    );
    const tagStage = photo && (
      <section className="play-stage" aria-label="Wall">
        {client && <SelectionCanvas client={client} />}
      </section>
    );
    const opening = !photo && (
      <CoachWindow live="Opening the wall…" ok={undefined} pages={coachLines} />
    );
    if (wide && photo) {
      return (
        <div className="play play-hud play-wide">
          {header}
          <main className="play-main play-tag">{tagStage}</main>
          <aside className="play-panel play-tag" aria-label="Route">
            {tagControls}
          </aside>
        </div>
      );
    }
    return (
      <div className="play">
        {header}
        <main className="play-main play-tag">
          {tagStage}
          {photo && (
            <section className="play-tag" aria-label="Route">
              {tagControls}
            </section>
          )}
          {opening}
        </main>
      </div>
    );
  }

  // ── Plan: the one-screen HUD (Amendment (b) U1–U5) ────────────────────────────────────────────

  /** E1 edit mode, from the direction check or the start banner (R0-3 c). */
  const editDirections = () => {
    setMapMode('edit');
    // Review 7: no guess at keyboard or pointer (a touch screen reader can look like a pointer).
    // The drawer stays shut so the photo's handles stay in view; the focus goes to the hold list
    // when it is on screen, else to the bar's edit actions, else ☰.
    focusSoon(
      drawerOpen || wide ? '.play-directions-pull' : '',
      '.play-bar-edit button',
      '.play-drawer-toggle',
    );
  };

  const directionProps: DirectionProps | null =
    ready && inMap
      ? {
          mode: mapMode === 'edit' ? 'edit' : 'check',
          arrows,
          dropped: arrows.filter((a) => droppedIds.includes(a.id)),
          centroids,
          edits,
          moves,
          selected: selectedHold,
          onSelect: setSelectedHold,
          onEdit: editHold,
          onReset: (id: string) => changeEdits(withoutEdit(edits, id, 'all')),
          onResetAll: () => changeEdits(NO_EDITS),
          onEditMode: editDirections,
          onStart: () => {
            setMapMode('closed');
            setDrawer(false);
            focusSoon('.play-limb');
          },
          clampGrip: clampFor,
        }
      : null;

  const startFell = ready && !inMap && !!check && !check.move && check.verdict === 'fall';
  const stage = inPlan && (
    <section
      className="play-stage"
      aria-label="Wall"
      data-climber={scene.climber ? 'shown' : undefined}
      data-verdict={check?.verdict}
      data-moves={plan ? moves : undefined}
      data-assignment={check ? JSON.stringify(check.assignment) : undefined}
      data-loads={check ? JSON.stringify(check.loads) : undefined}
      data-preview={preview ? preview.verdict : undefined}
      data-armed={tray.armed.join(',') || undefined}
      data-hover={hover ? (hover.target ?? 'off') : undefined}
      data-map={mapMode ?? undefined}
      data-edits={Object.keys(edits).length ? JSON.stringify(edits) : undefined}
    >
      <div className="play-photo">
        {level ? (
          <PlanPhoto image={photo} badges={badgeLabels} drawExtras={drawExtras} />
        ) : (
          client && <SelectionCanvas client={client} addHint={PLAN_HINT} drawExtras={drawExtras} />
        )}
        {view && ctx && <PixelLayer view={view} climberHeightPx={ctx.height} scene={scene} />}
        {/* Hints read on top of the climber: the arrows a climber reads first (H1, E1). */}
        {view && ctx && (showArrows || markSpots.length > 0) && (
          <ArrowLayer
            width={view.boxW}
            height={view.boxH}
            annotations={annotated.annotations}
            marks={markSpots}
            badges={badges}
            data={{
              arrows: showArrows ? arrowData : undefined,
              // Re-review 1: the holds whose arrow the badges leave no room to draw.
              'dropped-arrows': droppedIds.join(',') || undefined,
            }}
          />
        )}
        {view && ctx && ghost && (
          <div className="play-ghost" data-mood="fail">
            <PixelLayer view={view} climberHeightPx={ctx.height} scene={ghost} />
          </div>
        )}
        {view && ctx && mapMode === 'edit' && (
          <DirectionHandles
            arrows={arrows}
            handles={editHandles}
            view={view}
            selected={selectedHold}
            onSelect={setSelectedHold}
            onPreview={setDragPreview}
            onCommit={editHold}
            toImage={(id, p) =>
              clampFor(id, { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale })
            }
          />
        )}
        {view && ctx && mapMode !== 'edit' && (
          <div
            className="play-taps"
            style={{ width: view.boxW, height: view.boxH }}
            data-scale={view.scale}
            data-tx={view.tx}
            data-ty={view.ty}
            aria-hidden="true"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              down.current = { x: e.clientX - r.left, y: e.clientY - r.top };
            }}
            onPointerUp={onTapUp}
            onPointerMove={onHover}
            onPointerLeave={() => hover && setHover(null)}
            onPointerCancel={() => {
              down.current = null;
            }}
          />
        )}
        {hoverLabel}
      </div>
      {/* U4: the direction check, on the photo where the arrows are. */}
      {directionProps?.mode === 'check' && (
        <div className="play-banner">
          <DirectionBanner {...directionProps} compact={!wide} nudge={mapNudge} />
        </div>
      )}
      {/* R0-3 (c): a start that can't be held says why, and offers what this screen can do. */}
      {startFell && check && (
        <div className="play-banner">
          <section className="play-start-fall" aria-label="This start can’t be held">
            <p className="play-start-fall-text">
              {startBannerText(check, !level, ctx ?? undefined)}
            </p>
            <div className="play-directions-actions">
              {!level && (
                <button type="button" onClick={editRoute}>
                  Edit route
                </button>
              )}
              <button type="button" className="primary" onClick={editDirections}>
                Edit directions
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );

  // R0-2: on a phone the strip opens by itself for a fall preview, a rejection or a tip, and keeps
  // the player's choice otherwise. Review 3: folding it is that choice for that attempt
  // (`coachFoldedAt`, the attempt counter), not for those words, so a repeated fall (the same
  // blocked hold again, the same words) opens it again.
  const coachCalls = !!(preview || (fb?.kind === 'rejected' && !fb.stale) || (!fb && check?.tip));
  const coachExpanded = coachOpen || (coachCalls && coachFoldedAt !== play.tries);
  const setCoachExpanded = (on: boolean) => {
    setCoachOpen(on);
    setCoachFoldedAt(on ? null : play.tries);
  };
  const coach = (
    <CoachWindow
      live={
        !photo
          ? 'Opening the wall…'
          : play.error
            ? ''
            : !ctx
              ? 'Reading the wall…'
              : (verdict ?? '')
      }
      ok={!ready ? undefined : tray.feedback ? false : check?.legal}
      pages={coachLines}
      replay={play.tries}
      strip={!wide}
      expanded={coachExpanded}
      onExpanded={setCoachExpanded}
    />
  );

  const error = inPlan && play.error && (
    <p role="alert" className="error">
      {play.error}
    </p>
  );

  const planning = ready && !inMap;
  const threeDToggle = planning && (props.ml || props.depth3d) && (
    <button
      type="button"
      className="play-aid play-3d-toggle"
      aria-expanded={!!threeD}
      aria-controls="play-3d"
      onClick={toggle3D}
    >
      <span className="play-aid-icon" aria-hidden="true">
        ⬚
      </span>
      3D
    </button>
  );
  const aids = planning && (
    <AidsMenu
      profile={profile}
      onSetAid={onSetAid}
      views={[
        {
          id: 'directions',
          label: 'Hold directions',
          on: viewAids.directions,
          onChange: (on) => setViewAid('directions', on),
        },
        {
          id: 'plausible',
          label: 'Plausible holds',
          on: viewAids.plausible,
          onChange: (on) => setViewAid('plausible', on),
        },
      ]}
    >
      {threeDToggle}
    </AidsMenu>
  );
  /** Review 1: the tapped spot, on purpose. Re-review 4: then the focus goes to that foot's limb
   * button, never lost to the page when this button goes. */
  const smearHereNow = (t: string) => {
    const limb = play.waiting;
    play.choose(t);
    if (limb) document.querySelector<HTMLButtonElement>(`.play-limb[data-limb="${limb}"]`)?.focus();
  };
  // Re-review 4: "Smear here" sits beside the live hint line, not in it, so the line announces only
  // its words.
  const hintLine = planning && (
    <div className="play-hint-row">
      <p className="play-hint" aria-live="polite">
        {hint}
      </p>
      {smearHere && tray.hint && (
        <button type="button" className="play-smear-here" onClick={() => smearHereNow(smearHere)}>
          Smear here
        </button>
      )}
    </div>
  );
  const plausibleLine = planning && job && (
    <p
      className="play-plausible"
      role="status"
      // Announced once, with the summary: busy while the checks run (review).
      aria-busy={!plausible.done && !plausible.cancelled}
      data-marks={JSON.stringify(marks)}
      data-done={plausible.done || undefined}
    >
      {plausible.done
        ? summaryLine(marks)
        : plausible.cancelled
          ? `Stopped after ${plausible.checked} of ${plausible.total}: ${summaryLine(marks)}`
          : `Checking ${plausible.checked} of ${plausible.total} targets…`}
      {!plausible.done && !plausible.cancelled && (
        <button type="button" onClick={plausible.cancel}>
          Stop
        </button>
      )}
    </p>
  );
  // U5: the target list behind "List targets": still the whole keyboard and screen-reader path.
  const targetsBlock = planning && (
    <div className="play-list">
      <button
        type="button"
        className="play-list-toggle"
        aria-expanded={listOpen}
        aria-controls="play-targets"
        onClick={() => setList(!listOpen)}
      >
        List targets
      </button>
      {listOpen &&
        (play.waiting ? (
          <TargetList
            id="play-targets"
            limb={play.waiting}
            targets={targets}
            onChoose={chooseFromList}
            onFocus={play.focus}
            marks={job ? new Map(marks.map((m) => [m.target, MARK_WORDS[m.kind]])) : null}
          />
        ) : (
          <p id="play-targets" className="play-targets-empty">
            Pick a limb (LH, RH, LF or RF) to list where it can go.
          </p>
        ))}
    </div>
  );
  const numbers = ready && settings.numbers && shown && <NumbersPanel check={shown} />;
  const threeDPanel = ready && threeD && photo && ctx && shown && (
    <section id="play-3d" className="play-3d" aria-labelledby="play-3d-title">
      <div className="play-3d-head">
        <h2 id="play-3d-title">3D view</h2>
        <button type="button" onClick={() => setThreeD(null)}>
          Close
        </button>
      </div>
      <Suspense fallback={<p role="status">Loading 3D view…</p>}>
        <Wall3D
          client={threeD.client}
          depthReady={depth3d.ready}
          depthStatus={depth3d.status}
          onRetry={props.onRequestDepth}
          check={shown}
          ctx={ctx}
          notice={threeD.notice}
        />
      </Suspense>
    </section>
  );
  const holdList = directionProps?.mode === 'edit' && <DirectionHoldList {...directionProps} />;
  const routeActions = inPlan && (ready || !level) && (
    <div className="play-route-actions">
      {planning && (
        <button
          type="button"
          onClick={() => {
            // Back to the banner on the photo: the drawer closes, the focus goes to the banner.
            setMapMode('check');
            setDrawer(false);
            focusSoon('.play-banner button');
          }}
        >
          Check directions
        </button>
      )}
      {!level && (
        <>
          <button type="button" onClick={editRoute}>
            Edit route
          </button>
          {openStudio}
        </>
      )}
    </div>
  );
  const moveTray = planning && (
    <MoveTray
      armed={tray.armed}
      onToggle={pickLimb}
      maxLimbs={settings.maxLimbs}
      adding={tray.adding}
      onAdding={play.setAdding}
      canUndo={play.canUndo}
      canRedo={play.canRedo}
      onUndo={play.undo}
      onRedo={play.redo}
    ></MoveTray>
  );
  // U3: on a phone the hint row, the target list, the tools and (E1 edit) the hold list are in a
  // drawer over the bottom bar; ☰ opens it, in the map as well as while planning.
  // Hidden when the drawer would be empty (the check on a baked level: nothing but the banner).
  const drawerHasContent = !!(
    aids ||
    targetsBlock ||
    threeDPanel ||
    holdList ||
    (!level && inPlan)
  );
  const drawerToggle = !wide && (ready || !level) && drawerHasContent && (
    <button
      type="button"
      className="play-drawer-toggle"
      aria-expanded={drawerOpen}
      aria-controls="play-drawer"
      aria-label="Hints and tools"
      onClick={() => setDrawer(!drawerOpen)}
    >
      <span aria-hidden="true">☰</span>
    </button>
  );

  if (wide) {
    // U2: photo left, as large as the viewport height allows; everything else in the side panel.
    return (
      <div className="play play-hud play-wide">
        {header}
        <main className={`play-main play-${phase}`}>
          {stage}
          {error}
          {confirm}
        </main>
        <aside className="play-panel" aria-label="Play controls">
          {coach}
          {hintLine}
          {moveTray}
          {aids}
          {plausibleLine}
          {targetsBlock}
          {numbers}
          {threeDPanel}
          {/* Wide edit mode: Reset all / Done by the hold list, not over the photo's handles. */}
          {directionProps?.mode === 'edit' && <DirectionBanner {...directionProps} />}
          {holdList}
          {routeActions}
        </aside>
      </div>
    );
  }
  // U3: the photo full width at the top, the COACH as a strip under it, a sticky bottom bar.
  return (
    <div className="play play-hud play-narrow">
      {header}
      <main className={`play-main play-${phase}`}>
        {stage}
        {coach}
        {error}
        {numbers}
        {confirm}
      </main>
      <aside className="play-panel" aria-label="Play controls">
        {drawerToggle && (
          <div className="play-bar" ref={barRef}>
            {/* Edit mode on a phone: Reset all / Done here, so the photo's handles stay clear. */}
            {directionProps?.mode === 'edit' && (
              <div className="play-bar-edit">
                <DirectionBanner {...directionProps} />
              </div>
            )}
            {hintLine}
            {/* Review 6: the plausible-holds count and Stop, seen and announced with the drawer
                closed. */}
            {plausibleLine}
            <div className="play-bar-row">
              {moveTray}
              {drawerToggle}
            </div>
          </div>
        )}
        {/* After the bar in the DOM, so Tab goes from ☰ into the drawer (review 5); CSS
            (column-reverse) shows it above the bar. */}
        <div id="play-drawer" className="play-drawer" hidden={!drawerOpen}>
          {aids}
          {targetsBlock}
          {threeDPanel}
          {holdList}
          {routeActions}
        </div>
      </aside>
    </div>
  );
}
