import { useState } from 'react';
import {
  angleOfBearing,
  bearingOf,
  downPreset,
  isStraightDown,
  pullWords,
  rotateTo,
  type Edits,
  type HoldEdit,
} from './directions';
import { EDIT_TIP } from './annotate';
import { glyphFor, type HoldArrow } from './hints';

// SPEC-play-shell › Amendment 2026-11-02 E1: the direction map. Before every plan, an arrow on
// each route hold shows the pull the referee will use; "Edit directions" lets the player turn a
// pull (drag the arrowhead) or move the grip point (drag the base dot), with a keyboard path
// through the hold list. Any change restarts the plan (the referee's input changed).

type Point = { x: number; y: number };
type View = { scale: number; tx: number; ty: number };

/**
 * In edit mode the arrowhead's 44 px handle sits this far (CSS px) from the grip point, clear of
 * the grip's own handle; the thin arrow runs to it (annotate.ts, Amendment (b) T1).
 */
export const EDIT_ARROW_CSS = EDIT_TIP;
/** Keyboard steps: a turn (degrees) and a grip move (image px); Shift for the fine step. */
export const TURN_STEP = 15;
export const FINE_TURN_STEP = 5;
export const GRIP_STEP = 5;
/** A press moves a handle only after this many CSS px (the Studio canvas's tap slop). */
export const DRAG_SLOP = 6;
export const FINE_GRIP_STEP = 1;

/** What the player is dragging, as it would be committed: shown live, applied on release. */
export type DragPreview = { id: string } & HoldEdit;

/**
 * The handles over the photo (pointer only: aria-hidden; the hold list below is the keyboard and
 * screen-reader path). A drag previews; the release commits one edit.
 */
export function DirectionHandles({
  arrows,
  handles,
  view,
  selected,
  onSelect,
  onPreview,
  onCommit,
  toImage,
}: {
  arrows: readonly HoldArrow[];
  /** Each hold's two handles, from the drawn annotations (review 3): annotate.ts handlesOf. */
  handles: ReadonlyMap<string, { base: Point; head: Point }>;
  view: View & { boxW: number; boxH: number };
  selected: string | null;
  onSelect: (id: string) => void;
  onPreview: (p: DragPreview | null) => void;
  onCommit: (id: string, edit: HoldEdit) => void;
  /** Screen (CSS px in the photo box) → the grip point the referee would get (clamped). */
  toImage: (id: string, p: Point) => Point;
}) {
  // The handle being dragged (review finding 2): where the press was, the handle's offset from
  // it, and whether it has moved past DRAG_SLOP. A press or a twitch only selects; a drag moves
  // the handle by the pointer's movement, never to where it was pressed.
  const [drag, setDrag] = useState<{
    id: string;
    kind: 'head' | 'base';
    start: Point;
    offset: Point;
    moved: boolean;
  } | null>(null);
  const ours = (id: string, kind: 'head' | 'base') => drag && drag.id === id && drag.kind === kind;
  /** Where the dragged handle is now: the pointer plus its offset at the press. */
  const target = (p: Point) => ({ x: p.x + drag!.offset.x, y: p.y + drag!.offset.y });
  const end = () => {
    setDrag(null);
    onPreview(null);
  };
  /** The pointer in the handles box (the photo box): CSS px from its top-left. */
  const local = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const editFor = (a: HoldArrow, kind: 'head' | 'base', p: Point): HoldEdit => {
    if (kind === 'base') return { grip: toImage(a.id, p) };
    const { base } = handles.get(a.id)!;
    return { custom: rotateTo(a.dir, Math.atan2(p.y - base.y, p.x - base.x)) };
  };

  return (
    <div
      className="play-dir-handles"
      style={{ width: view.boxW, height: view.boxH }}
      aria-hidden="true"
    >
      {arrows.map((a) => {
        const h = handles.get(a.id);
        if (!h) return null;
        return (['base', 'head'] as const).map((kind) => (
          <div
            key={`${a.id}:${kind}`}
            className={`play-dir-handle play-dir-${kind}`}
            data-hold={a.id}
            data-kind={kind}
            data-selected={selected === a.id || undefined}
            style={{ left: h[kind].x, top: h[kind].y }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              const p = local(e);
              const at = h[kind];
              setDrag({
                id: a.id,
                kind,
                start: p,
                offset: { x: at.x - p.x, y: at.y - p.y },
                moved: false,
              });
              onSelect(a.id);
            }}
            onPointerMove={(e) => {
              if (!ours(a.id, kind)) return;
              const p = local(e);
              const far = Math.hypot(p.x - drag!.start.x, p.y - drag!.start.y) > DRAG_SLOP;
              if (!drag!.moved && !far) return;
              if (!drag!.moved) setDrag({ ...drag!, moved: true });
              onPreview({ id: a.id, ...editFor(a, kind, target(p)) });
            }}
            onPointerUp={(e) => {
              const d = ours(a.id, kind) ? drag : null;
              end();
              if (!d) return;
              const p = local(e);
              const far = Math.hypot(p.x - d.start.x, p.y - d.start.y) > DRAG_SLOP;
              if (d.moved || far) onCommit(a.id, editFor(a, kind, target(p)));
            }}
            onPointerCancel={end}
            onLostPointerCapture={() => ours(a.id, kind) && end()}
          />
        ));
      })}
    </div>
  );
}

/** The grip's nudge buttons: a direction, its arrow, and its step. */
const NUDGES: readonly [string, string, number, number][] = [
  ['left', '←', -1, 0],
  ['up', '↑', 0, -1],
  ['right', '→', 1, 0],
  ['down', '↓', 0, 1],
];

/** A grip point in words: where it sits from the hold's centre, in image px. */
function gripWords(a: HoldArrow, centroid: Point): string {
  const dx = Math.round(a.base.x - centroid.x);
  const dy = Math.round(a.base.y - centroid.y);
  if (!dx && !dy) return 'Grip: the hold’s centre';
  const parts = [
    dx ? `${Math.abs(dx)} px ${dx > 0 ? 'right' : 'left'}` : '',
    dy ? `${Math.abs(dy)} px ${dy > 0 ? 'down' : 'up'}` : '',
  ].filter(Boolean);
  return `Grip: ${parts.join(', ')} of the centre`;
}

/**
 * Amendment (b) U4: the direction check as a banner on the photo, where the arrows are: the
 * question, the pulls the badges leave no room to draw (in words), and Edit / Start planning (or
 * Reset all / Done in edit mode).
 */
/** What the direction map's banner and hold list share. */
export interface DirectionProps {
  mode: 'check' | 'edit';
  arrows: readonly HoldArrow[];
  /** Holds whose arrow has no room on the photo (between badges): their pull, in words. */
  dropped?: readonly HoldArrow[];
  /** Each hold's centroid (the referee's default contact point), for the grip's words. */
  centroids: ReadonlyMap<string, Point>;
  edits: Edits;
  /** Moves in the plan now: a change restarts it, so say so first. */
  moves: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string, edit: HoldEdit) => void;
  onReset: (id: string) => void;
  onResetAll: () => void;
  onEditMode: () => void;
  onStart: () => void;
  clampGrip: (id: string, p: Point) => Point;
}

export function DirectionBanner({
  mode,
  dropped = [],
  edits,
  moves,
  onResetAll,
  onEditMode,
  onStart,
  compact = false,
  nudge = null,
}: DirectionProps & {
  /** A phone (review suggestion): one line and the buttons; "Pulls not drawn" behind a toggle. */
  compact?: boolean;
  /** PR #17 review 11: the answer to a limb key or a wall tap while the check is open. */
  nudge?: string | null;
}) {
  const [showDropped, setShowDropped] = useState(false);
  const edited = Object.keys(edits).length > 0;

  return (
    <section className="play-directions" aria-labelledby="play-directions-title">
      <h2 id="play-directions-title">Do these directions look right?</h2>
      <p className="play-directions-note">
        Each arrow is the way a hold pulls, as the referee will use it.
        {moves > 0 && ' Changing one starts your plan again.'}
      </p>
      {/* Re-review 1: a hold whose arrow the badges leave no room for is still checked here. */}
      {mode === 'check' && dropped.length > 0 && compact && (
        <button
          type="button"
          className="play-directions-dropped-toggle"
          aria-expanded={showDropped}
          aria-controls="play-dropped"
          onClick={() => setShowDropped(!showDropped)}
        >
          Pulls not drawn ({dropped.length})
        </button>
      )}
      {mode === 'check' && dropped.length > 0 && (!compact || showDropped) && (
        <ul
          id="play-dropped"
          className="play-directions-dropped"
          aria-label="Pulls not drawn on the photo"
        >
          {dropped.map((a) => {
            const w = pullWords(a.dir);
            return (
              <li key={a.id}>
                Hold {a.label}: {w.charAt(0).toLowerCase() + w.slice(1)}
              </li>
            );
          })}
        </ul>
      )}
      {mode === 'edit' && (
        <p className="play-directions-note">
          Drag an arrow’s head to turn it, or its dot to move the grip; or use the hold list.
        </p>
      )}
      {mode === 'check' && (
        <p className="play-directions-nudge-line" role="status">
          {nudge}
        </p>
      )}
      <div className="play-directions-actions">
        {mode === 'check' ? (
          <button type="button" onClick={onEditMode}>
            Edit directions
          </button>
        ) : (
          edited && (
            <button type="button" onClick={onResetAll}>
              Reset all
            </button>
          )
        )}
        <button type="button" className="primary" onClick={onStart}>
          {mode === 'edit' ? 'Done' : 'Start planning'}
        </button>
      </div>
    </section>
  );
}

/**
 * E1 edit mode's hold list (in the side panel, or the phone's drawer): each hold has a pull
 * slider (← → turn it), a grip control (the arrow keys move it), four nudge buttons and Reset.
 */
export function DirectionHoldList({
  arrows,
  centroids,
  edits,
  selected,
  onSelect,
  onEdit,
  onReset,
  clampGrip,
}: DirectionProps) {
  const turn = (a: HoldArrow, by: number) => {
    const b = bearingOf(a.dir) ?? 180;
    const next = (((b + by) % 360) + 360) % 360;
    onEdit(a.id, { custom: rotateTo(a.dir, angleOfBearing(next)) });
  };
  const nudge = (a: HoldArrow, dx: number, dy: number) =>
    onEdit(a.id, { grip: clampGrip(a.id, { x: a.base.x + dx, y: a.base.y + dy }) });

  return (
    <section className="play-directions-holds" aria-label="Hold directions list">
      <p className="play-directions-note">
        Pick a hold: ← → turn its pull, and the arrow keys or the four buttons move its grip (Shift
        for small steps).
      </p>
      <ul className="play-directions-list">
        {arrows.map((a) => {
          const bearing = bearingOf(a.dir);
          const words = pullWords(a.dir);
          const small = (e: React.KeyboardEvent) => e.shiftKey;
          return (
            <li key={a.id} data-hold={a.id} data-selected={selected === a.id || undefined}>
              <span className="play-directions-label">{a.label}</span>
              <div
                role="slider"
                tabIndex={0}
                className="play-directions-pull"
                aria-label={`Pull of hold ${a.label}`}
                aria-valuemin={0}
                aria-valuemax={359}
                aria-valuenow={bearing ?? undefined}
                aria-valuetext={words}
                data-user={a.user || undefined}
                onFocus={() => onSelect(a.id)}
                onKeyDown={(e) => {
                  const step = small(e) ? FINE_TURN_STEP : TURN_STEP;
                  const by =
                    e.key === 'ArrowRight' || e.key === 'ArrowUp'
                      ? step
                      : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                        ? -step
                        : e.key === 'PageUp'
                          ? 45
                          : e.key === 'PageDown'
                            ? -45
                            : 0;
                  if (!by) return;
                  e.preventDefault();
                  turn(a, by);
                }}
              >
                {words}
                {a.dir && glyphFor(a.dir) !== 'arrow' && ' (no angle to turn yet)'}
              </div>
              <button
                type="button"
                className="play-directions-grip"
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                aria-label={`Grip point of hold ${a.label}: ${gripWords(a, centroids.get(a.id)!)}`}
                onFocus={() => onSelect(a.id)}
                onKeyDown={(e) => {
                  const s = small(e) ? FINE_GRIP_STEP : GRIP_STEP;
                  const d: Record<string, [number, number]> = {
                    ArrowLeft: [-s, 0],
                    ArrowRight: [s, 0],
                    ArrowUp: [0, -s],
                    ArrowDown: [0, s],
                  };
                  const m = d[e.key];
                  if (!m) return;
                  e.preventDefault();
                  nudge(a, m[0], m[1]);
                }}
              >
                {gripWords(a, centroids.get(a.id)!)}
              </button>
              {/* The same moves as buttons, for a screen reader or a switch (review). */}
              <span
                className="play-directions-nudge"
                role="group"
                aria-label={`Grip of hold ${a.label}`}
              >
                {NUDGES.map(([dir, glyph, dx, dy]) => (
                  <button
                    key={dir}
                    type="button"
                    aria-label={`Move hold ${a.label}’s grip ${dir}`}
                    onClick={() => nudge(a, dx * GRIP_STEP, dy * GRIP_STEP)}
                  >
                    <span aria-hidden="true">{glyph}</span>
                  </button>
                ))}
              </span>
              <button
                type="button"
                disabled={!edits[a.id]}
                aria-label={`Reset hold ${a.label}`}
                onClick={() => onReset(a.id)}
              >
                Reset
              </button>
              {/* R0-3 (b): the Down preset, the advice for a sloper whose top faces up. Last in
                  the row, so the keyboard path through pull, grip, nudges and Reset is as before. */}
              <button
                type="button"
                className="play-directions-down"
                aria-label={`Set hold ${a.label}’s pull to Down`}
                // Review 5: pressed when the pull is straight down already (the editor's snap).
                aria-pressed={isStraightDown(a.dir)}
                onClick={() => onEdit(a.id, downPreset())}
              >
                Down
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
