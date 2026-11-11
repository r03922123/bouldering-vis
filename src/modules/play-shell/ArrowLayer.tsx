import { useId } from 'react';
import type { MarkKind } from './hints';
import { BADGE_MASK, LINE_W, MARK_FILL, MARK_R, RING_R, STROKE, type Annotation } from './annotate';

type Point = { x: number; y: number };

// SPEC-play-shell › Amendment 2026-11-02 (b) T1: the hold annotations as thin SVG in CSS px, over
// the photo and the climber. White (bloom for a pull the player set) with a dark outline, so they
// read on any wall. Badges stay clear: a mask cuts every badge circle (and its stroke) out, a
// last guard behind the geometry's own avoidance. aria-hidden: the words are in the DOM lists.

const INK = '#1b1325';
const CHALK = '#f7f3e8';
const BLOOM = '#ffa3d6';
const poly = (...pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/** One annotation: outline first (dark, wider), then the white line on top. */
function Shape({ a }: { a: Annotation }) {
  const color = a.user ? BLOOM : CHALK;
  const dot = a.dot && (
    <circle cx={a.dot.x} cy={a.dot.y} r={2} fill={color} stroke={INK} strokeWidth={1} />
  );
  if (a.kind === 'arrow') {
    const head = poly(a.tip, a.left, a.right);
    return (
      <g data-hold={a.id} data-kind="arrow">
        <line
          x1={a.from.x}
          y1={a.from.y}
          x2={a.neck.x}
          y2={a.neck.y}
          stroke={INK}
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />
        <polygon points={head} fill={INK} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
        <line
          x1={a.from.x}
          y1={a.from.y}
          x2={a.neck.x}
          y2={a.neck.y}
          stroke={color}
          strokeWidth={LINE_W}
          strokeLinecap="butt"
        />
        <polygon points={head} fill={color} />
        {dot}
      </g>
    );
  }
  if (a.kind === 'out' || a.kind === 'into') {
    const { x, y } = a.at;
    const d = RING_R * 0.55;
    return (
      <g data-hold={a.id} data-kind={a.kind}>
        <circle cx={x} cy={y} r={RING_R} fill="none" stroke={INK} strokeWidth={STROKE} />
        <circle cx={x} cy={y} r={RING_R} fill="none" stroke={color} strokeWidth={LINE_W} />
        {a.kind === 'out' ? (
          <circle cx={x} cy={y} r={1.5} fill={color} stroke={INK} strokeWidth={0.75} />
        ) : (
          // A diagonal ×, never an upright cross.
          <path
            d={`M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}`}
            stroke={color}
            strokeWidth={LINE_W}
          />
        )}
        {dot}
      </g>
    );
  }
  return dot ? (
    <g data-hold={a.id} data-kind="none">
      {dot}
    </g>
  ) : null;
}

/**
 * H3's marks: a dot (holds), a ring (deadpoint), a diagonal × (falls), each with an outline, in
 * the arrows' own thin strokes (≤ 3 CSS px, private PR #15 review).
 */
function Mark({ at, kind }: { at: Point; kind: MarkKind }) {
  const { x, y } = at;
  const fill = MARK_FILL[kind];
  if (kind === 'holds')
    return <circle cx={x} cy={y} r={MARK_R} fill={fill} stroke={INK} strokeWidth={1} />;
  if (kind === 'deadpoint')
    return (
      <g>
        <circle cx={x} cy={y} r={MARK_R - 1} fill="none" stroke={INK} strokeWidth={STROKE} />
        <circle cx={x} cy={y} r={MARK_R - 1} fill="none" stroke={fill} strokeWidth={LINE_W} />
      </g>
    );
  const d = MARK_R * 0.75;
  const path = `M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}`;
  return (
    <g>
      <path d={path} stroke={INK} strokeWidth={STROKE} strokeLinecap="round" />
      <path d={path} stroke={fill} strokeWidth={LINE_W} strokeLinecap="round" />
    </g>
  );
}

export function ArrowLayer({
  width,
  height,
  annotations,
  marks,
  badges,
  data,
}: {
  width: number;
  height: number;
  annotations: readonly Annotation[];
  marks: readonly { at: Point; kind: MarkKind }[];
  /** The step badges' circles (CSS px): nothing is drawn inside one or its stroke. */
  badges: readonly { x: number; y: number; r: number }[];
  /** For tests and E2E: what is drawn (the SVG itself is aria-hidden). */
  data?: Record<string, string | undefined>;
}) {
  const mask = `play-arrows-mask-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]));
  return (
    <svg
      className="play-arrows"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      {...attrs}
    >
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill="#fff" />
          {badges.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={b.r + BADGE_MASK} fill="#000" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        {annotations.map((a) => (
          <Shape key={a.id} a={a} />
        ))}
        {marks.map((m, i) => (
          <Mark key={i} at={m.at} kind={m.kind} />
        ))}
      </g>
    </svg>
  );
}
