// Dev only (SPEC-beta-moves Task 8; ADR-0003 (h)): the Studio, with real models, plus hooks that
// record a level on the photo loaded in it. Serve with `npx vite`, open /scripts/level-recorder.html.
// - window.betaSetter(fixes): a setter's type and pull corrections, by badge label;
// - window.betaLevel(): the route the user tapped as a level file (RouteHold[] with ids
//   `<sample>-N`, wall feet, height, wall angle, photo, rules), built from the store the way
//   App.tsx builds the solver's inputs (effective type, force with the user's pull, wall normal);
// - window.betaRun(level, betas): checkBeta on each beta in the page, with the real wall mask's
//   footholds for defaultStart, so the session can compare it with the Node test;
// - window.betaFrames(level, text): each step's stance drawn on the photo, for the review.
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/app/App';
import '../src/app/app.css';
import {
  checkBeta,
  decodeBeta,
  defaultStart,
  encodeBeta,
  makeContext,
  toWallFeet,
  type RouteHold,
  type WallFoot,
} from '../src/modules/beta-moves';
import {
  defaultClimberHeight,
  drawStance,
  flatProjection,
  layoutStance,
  type Vec3,
  type WallAngle,
  type WallFoothold,
} from '../src/modules/climber-stance';
import { effectiveClassification, type HoldType } from '../src/modules/hold-classification';
import {
  forceWithOverride,
  holdGeometry,
  type Force,
  type PullOverride,
} from '../src/modules/hold-geometry';
import { badgeLabels } from '../src/modules/hold-segmentation';
import { useAppStore } from '../src/store/app';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(createElement(StrictMode, null, createElement(App)));

/** A blob a picked hold covers by this much of the smaller area is that hold's (climber-stance rule 6). */
const OVERLAP = 0.3;
const q1 = (v: number) => Math.round(v * 10) / 10 + 0;
const q4 = (v: Vec3 | null): Vec3 | null =>
  v ? ([0, 1, 2].map((i) => Math.round(v[i]! * 1e4) / 1e4 + 0) as unknown as Vec3) : null;

interface Level {
  sample: string;
  recorded: string;
  photo: { width: number; height: number };
  height: number;
  wallAngleDeg: WallAngle;
  rules: { feet: 'any'; dynamic: true };
  holds: RouteHold[];
  wallFeet: WallFoot[];
  /** Blobs left out of wallFeet because a picked hold covers them, by label. */
  claimedBlobs: number[];
  /** Every wall-mask blob (shape only), so tests can check the foothold gates on the real mask. */
  blobs?: { label: number; area: number; bbox: WallFoothold['bbox']; toe: WallFoothold['toe'] }[];
}

/** A route setter's correction, made with the Studio's own type and pull controls. */
interface SetterFix {
  type?: HoldType;
  pull?: PullOverride;
  note: string;
}

function betaLevel(wallAngleDeg: WallAngle = 0): Level {
  const s = useAppStore.getState();
  const image = s.image;
  if (!image || !s.depth || !s.wallFootholds)
    throw new Error('betaLevel: photo, depth or footholds missing');
  const holds = [...s.holds].sort((a, b) => a.order - b.order);
  const labels = badgeLabels(holds);
  const bodyX = holds.reduce((sum, h) => sum + h.centroid.x, 0) / holds.length;
  const sample = image.sampleId ?? image.sourceName;
  const routeHolds: RouteHold[] = holds.map((h, i) => {
    const c = s.classifications[h.id];
    const override = s.classOverrides[h.id] ?? null;
    const type = c ? effectiveClassification(c, override).effectiveType : override;
    const g = holdGeometry(h, s.holds, s.depth!);
    const f: Force = forceWithOverride(g, type, s.pullOverrides[h.id] ?? null, bodyX);
    return {
      id: `${sample}-${i + 1}`,
      order: i,
      label: labels.get(h.id)!,
      role: h.role,
      centroid: { x: q1(h.centroid.x), y: q1(h.centroid.y) },
      type,
      dir: q4(f.dir),
      wallNormal: q4(g.wallNormal),
      forceSource: f.source,
    };
  });
  // Rule 6's claim, by mask overlap or by the centroid: those blobs are route holds already.
  const fh = s.wallFootholds;
  const area = new Map(fh.blobs.map((b) => [b.label, b.area]));
  const claimed = new Set<number>();
  for (const h of holds) {
    const at = fh.labels[Math.round(h.centroid.y) * fh.width + Math.round(h.centroid.x)];
    if (at) claimed.add(at);
    const shared = new Map<number, number>();
    let own = 0;
    for (let i = 0; i < h.mask.length; i++) {
      if (!h.mask[i]) continue;
      own++;
      const l = fh.labels[i]!;
      if (l) shared.set(l, (shared.get(l) ?? 0) + 1);
    }
    for (const [l, n] of shared)
      if (n / Math.min(own, area.get(l) ?? Infinity) >= OVERLAP) claimed.add(l);
  }
  const height = q1(defaultClimberHeight(image) * s.climberScale);
  const free = { blobs: fh.blobs.filter((b) => !claimed.has(b.label)) };
  return {
    sample,
    recorded: new Date().toISOString().slice(0, 10),
    photo: { width: image.width, height: image.height },
    height,
    wallAngleDeg,
    rules: { feet: 'any', dynamic: true },
    holds: routeHolds,
    wallFeet: toWallFeet(free, height),
    claimedBlobs: [...claimed].sort((a, b) => a - b),
    blobs: fh.blobs.map(({ label, area, bbox, toe }) => ({ label, area, bbox, toe })),
  };
}

const contextOf = (level: Level) =>
  makeContext({
    holds: level.holds,
    wallFeet: level.wallFeet,
    height: level.height,
    wallAngleDeg: level.wallAngleDeg,
    photo: level.photo,
    rules: level.rules,
  });

/** checkBeta on each beta (by label), plus defaultStart with and without the real footholds. */
function betaRun(level: Level, betas: { name: string; text: string }[]) {
  const ctx = contextOf(level);
  const real = defaultStart(ctx, useAppStore.getState().wallFootholds);
  const standIn = defaultStart(ctx);
  const start = checkBeta({ steps: [standIn] }, ctx).steps[0]!;
  return {
    defaultStart: {
      realFootholds: encodeBeta({ steps: [real] }, ctx),
      standIns: encodeBeta({ steps: [standIn] }, ctx),
      verdict: start.verdict,
      loads: start.loads,
      reason: start.reason,
    },
    betas: betas.map(({ name, text }) => {
      const beta = decodeBeta(text, ctx);
      if (!beta) return { name, decoded: false };
      const runs = [0, 1, 2].map(() => JSON.stringify(checkBeta(beta, ctx)));
      const r = checkBeta(beta, ctx);
      return {
        name,
        decoded: true,
        identical: runs.every((x) => x === runs[0]),
        fallAt: r.fallAt,
        toppedAt: r.toppedAt,
        rejectedAt: r.rejectedAt,
        rejection: r.rejection,
        steps: r.steps.map((c) => ({
          verdict: c.verdict,
          kind: c.move?.kind ?? null,
          style: c.style,
          reach: c.reach,
          loads: c.loads,
          effort: c.effort,
          fail: c.fail && { kind: c.fail.kind, limb: c.fail.limb, text: c.fail.text },
          pelvis: c.stance.joints?.pelvis.map(Math.round) ?? null,
        })),
      };
    }),
  };
}

/** Each checked step's stance drawn on a crop of the photo around the route, as PNG data URLs. */
function betaFrames(level: Level, text: string): string[] {
  const image = useAppStore.getState().image;
  const ctx = contextOf(level);
  const beta = decodeBeta(text, ctx);
  if (!image || !beta) return [];
  const xs = level.holds.map((h) => h.centroid.x);
  const ys = level.holds.map((h) => h.centroid.y);
  const pad = 0.6 * level.height;
  const x0 = Math.max(0, Math.min(...xs) - pad);
  const y0 = Math.max(0, Math.min(...ys) - pad / 2);
  const x1 = Math.min(image.width, Math.max(...xs) + pad);
  const y1 = Math.min(image.height, Math.max(...ys) + pad * 1.5);
  const photo = new OffscreenCanvas(image.width, image.height);
  photo.getContext('2d')!.putImageData(image.pixels, 0, 0);
  const r = checkBeta(beta, ctx);
  const frames: string[] = [];
  for (const c of r.steps) {
    const canvas = document.createElement('canvas');
    canvas.width = x1 - x0;
    canvas.height = y1 - y0;
    const g = canvas.getContext('2d')!;
    g.drawImage(photo, -x0, -y0);
    g.font = 'bold 18px sans-serif';
    for (const h of level.holds) {
      g.fillStyle = h.role === 'start' ? '#16a34a' : h.role === 'finish' ? '#dc2626' : '#334155';
      g.fillText(h.label, h.centroid.x - x0 + 8, h.centroid.y - y0 - 8);
    }
    const toScreen = (p: { x: number; y: number }) => ({ x: p.x - x0, y: p.y - y0 });
    const layout = layoutStance(c.stance, c.contacts, level.height, flatProjection(toScreen));
    if (layout) drawStance(g, layout);
    g.fillStyle = '#000a';
    g.fillRect(0, 0, canvas.width, 28);
    g.fillStyle = '#fff';
    g.fillText(
      `${frames.length}: ${c.move?.kind ?? 'start'} ${c.verdict}${c.style ? ' ' + c.style : ''}${c.reason ? ' — ' + c.reason : ''}`,
      6,
      20,
    );
    frames.push(canvas.toDataURL('image/png'));
  }
  return frames;
}

/**
 * Applies a setter's corrections by badge label through the store's own override actions (the
 * Studio's type select and pull control), and remembers the note for betaLevel's `setter` field.
 */
const setterNotes = new Map<string, SetterFix>();
function betaSetter(fixes: Record<string, SetterFix>) {
  const s = useAppStore.getState();
  const labels = badgeLabels(s.holds);
  for (const h of s.holds) {
    const fix = fixes[labels.get(h.id)!];
    if (!fix) continue;
    if (fix.type) s.setClassOverride(h.id, fix.type);
    if (fix.pull) s.setPullOverride(h.id, fix.pull);
    setterNotes.set(labels.get(h.id)!, fix);
  }
}

/** betaLevel, with each corrected hold's `setter` note ({ source: 'setter', type, pull, note }). */
function betaLevelWithSetter(wallAngleDeg: WallAngle = 0) {
  const level = betaLevel(wallAngleDeg);
  return {
    ...level,
    holds: level.holds.map((h) => {
      const fix = setterNotes.get(h.label);
      return fix ? { ...h, setter: { source: 'setter' as const, ...fix } } : h;
    }),
  };
}

Object.assign(window, { betaLevel: betaLevelWithSetter, betaRun, betaFrames, betaSetter });
