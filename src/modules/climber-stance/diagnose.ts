import { SLOPER_HALF_ANGLE } from './cones';
import type { Contact } from './equilibrium';
import { bodyContact, solveForces } from './equilibrium';
import type { Candidate, ContactInput, StanceContacts } from './stance';
import { isHand, LIMB_NAME, LIMBS, type Limb } from './types';
import { dot, scale, unit, type Vec3 } from './vec';

// SPEC-climber-stance › Diagnosis: the first rule that applies, in climbing words.

export type DiagnosisKind = 'reach' | 'slip' | 'barn-door' | 'sloper-steep' | 'unbalanced';

export interface Diagnosis {
  kind: DiagnosisKind;
  limb?: Limb;
  /** The Studio's words (StancePanel), and the referee's reason. */
  text: string;
  /**
   * SPEC-play-shell › Amendment 2026-11-03 R0-3: the Play screen's words, set only where the
   * Studio's advice names a control Play doesn't have (the climber size, the hold inspector).
   * This table owns both texts; Play picks this one.
   */
  playText?: string;
  /**
   * Amendment 2026-11-04, M2: a reach failure caused by a joint's range of motion (too close), not
   * by the limb's length; Play keeps its words ("Too cramped"), never "can't reach".
   */
  cramped?: true;
}

/** How many of the search's best positions the slip test tries. */
const SLIP_TRIES = 40;
/** …plus every SLIP_STRIDE-th reachable position, so a far-off body position isn't missed. */
const SLIP_STRIDE = 4;
/** Contacts within this distance (× height) of one line count as one line. */
const LINE_TOLERANCE = 0.08;

const ARTICLE: Record<string, string> = {
  jug: 'a jug',
  crimp: 'a crimp',
  edge: 'an edge',
  pocket: 'a pocket',
  sloper: 'a sloper',
  volume: 'a volume',
  pinch: 'a pinch',
};

const lower = (l: Limb) => LIMB_NAME[l].toLowerCase();

function slipText(limb: Limb, type: string | null): string {
  if (!isHand(limb)) return `${LIMB_NAME[limb]} would slip — bring your hips in over it`;
  const what = ARTICLE[type ?? ''] ?? 'this hold';
  const advice =
    type === 'sloper' || type === 'volume'
      ? 'get your hips lower and under it'
      : 'move your hips under it';
  return `${LIMB_NAME[limb]}: ${what} can't take this pull — ${advice}`;
}

/**
 * Amendment 2026-10-31 (b), rules 12–13: a slipping sloper or volume hand is too steep when its
 * grip surface is tilted further from true up than its friction cone's half-angle. Steepness is
 * measured against −gravity, so the same sloper is steeper on an overhang.
 */
function tooSteep(limb: Limb, c: ContactInput | null | undefined, gravity: Vec3): boolean {
  if (!isHand(limb) || !c?.surface || (c.type !== 'sloper' && c.type !== 'volume')) return false;
  const cos = dot(unit(c.surface.normal), scale(unit(gravity), -1));
  return Math.acos(Math.min(1, Math.max(-1, cos))) > SLOPER_HALF_ANGLE;
}

/** No degree numbers (the hold-geometry rule); "Down" is the hold inspector's pull label. */
function steepText(limb: Limb, c: ContactInput): string {
  const what = `this ${c.type}`;
  return c.surface!.source === 'assumed'
    ? `${LIMB_NAME[limb]}: ${what} may be too steep — if its top faces up, set its pull to Down`
    : `${LIMB_NAME[limb]}: ${what} is too steep to hold here — get a foot on a hold under it`;
}

/**
 * R0-3 (b), Play's words for a steep sloper: on an assumed surface, the Down preset is in Play's
 * Edit directions; once the player has set the pull (`user`), the advice is the slip text, never
 * "set its pull to Down" again. A measured surface's advice (a foot under it) Play can carry out.
 */
function steepPlayText(limb: Limb, c: ContactInput): string | undefined {
  const source = c.surface!.source;
  if (source === 'assumed')
    return `${LIMB_NAME[limb]}: this ${c.type} may be too steep — ${PRESS_DOWN}`;
  if (source === 'user') return slipText(limb, c.type);
  return undefined;
}

/** The Down advice's action, as Play's Edit directions names its button (R0-3 b, review 6). */
const PRESS_DOWN = 'if its top faces up, press Down for it in Edit directions';

/**
 * PR #17 review 6 (Play): a steep sloper or volume hand on its assumed surface, by hold. Play fills
 * in the hold's label and its pull in words ("pulls mostly into the wall"), so the advice says
 * which hold, why, and the button that changes it. For a pull Down wouldn't change, Play uses
 * playSlipText instead.
 */
export function playSteepText(
  limb: Limb,
  type: string | null,
  hold: { label: string; pull: string },
): string {
  const what = ARTICLE[type ?? ''] ?? 'this hold';
  return `${LIMB_NAME[limb]}: hold ${hold.label} ${hold.pull}, which ${what} can't take — ${PRESS_DOWN}`;
}

/**
 * Play's out of reach (R0-3 a; PR #17 review 7): feet pick a closer foothold, hands a closer hold.
 * With `moved` ("right hand on 6"), the stance a move made leaves a limb that didn't move out of
 * reach, and the words say so: "With your right hand on 6, your left foot can't reach — …".
 */
export function playReachText(limb: Limb, moved?: string): string {
  const pick = `pick a closer ${isHand(limb) ? 'hold' : 'foothold'}`;
  return moved
    ? `With your ${moved}, your ${lower(limb)} can't reach — ${pick}`
    : `Out of reach: ${lower(limb)} — ${pick}`;
}

/** M2 rule 3, the stance's words for a limb past a joint's range (Studio and Play alike). */
export const crampedText = (limb: Limb) =>
  `Too cramped: ${lower(limb)} — pick a hold further from your body`;

/** M2 rule 3 (PR #18 review 2): a foot above the hip's range. A lower hold, not a further one. */
export const highText = (limb: Limb) => `Too high: ${lower(limb)} — pick a lower foothold`;

/** The slip text (the Studio's own), for Play where no Down advice applies. */
export const playSlipText = (limb: Limb, type: string | null): string => slipText(limb, type);

/** The limb that, alone, keeps the most pelvis positions from reaching every hold. */
function unreachableLimb(grid: readonly Candidate[], contacts: readonly Contact[]): Limb {
  let pick = contacts[0]!.limb;
  let bestOnly = -1;
  let bestAny = -1;
  for (const c of contacts) {
    const bit = 1 << LIMBS.indexOf(c.limb);
    const only = grid.filter((g) => g.missing === bit).length;
    const any = grid.filter((g) => g.missing & bit).length;
    if (only > bestOnly || (only === bestOnly && any > bestAny)) {
      [pick, bestOnly, bestAny] = [c.limb, only, any];
    }
  }
  return pick;
}

/** Contacts roughly on one steep line: the body can turn about it like a door on its hinges. */
function hingeSide(contacts: readonly Contact[], com: readonly number[], height: number) {
  const pts = contacts.map((c) => [c.point[0], c.point[1]] as const);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  if (sxx + syy < 1e-9) return null;
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const u = [Math.cos(angle), Math.sin(angle)] as const;
  const off = (x: number, y: number) => (x - mx) * -u[1] + (y - my) * u[0];
  if (pts.some(([x, y]) => Math.abs(off(x, y)) > LINE_TOLERANCE * height)) return null;
  if (Math.abs(u[1]) < 0.5) return null;
  // Which side of the line the body's mass is on, in image x.
  const lineX = mx + ((com[1]! - my) * u[0]) / u[1];
  return com[0]! > lineX ? 'right' : 'left';
}

export function diagnose(args: {
  contacts: readonly Contact[];
  input: StanceContacts;
  best: Candidate | null;
  grid: readonly Candidate[];
  gravity: [number, number, number];
  height: number;
}): Diagnosis {
  const { contacts, input, best, grid, gravity, height } = args;
  if (!contacts.length) return { kind: 'unbalanced', text: 'Put a hand or foot on a hold' };
  if (!best) {
    const limb = unreachableLimb(grid, contacts);
    // M2 rule 3: cramped when some body position fails on this limb alone, by a joint's range (too
    // close): without the joint limits every limb would reach there.
    const bit = 1 << LIMBS.indexOf(limb);
    const only = grid.filter((g) => g.missing === bit && g.cramped & bit);
    if (only.length) {
      // PR #18 review 2: where only the hip's range stops it, the foot is too high, not too close.
      const high = only.every((g) => g.high & bit);
      return {
        kind: 'reach',
        limb,
        text: high ? highText(limb) : crampedText(limb),
        cramped: true,
      };
    }
    return {
      kind: 'reach',
      limb,
      text: `Out of reach: ${lower(limb)} — make the climber bigger or pick a closer hold`,
      // R0-3 (a): Play has no climber size; the Setting Room's slider is where "bigger" is.
      playText: playReachText(limb),
    };
  }

  // Contacts on one steep line: the body turns about it. Checked before slips, because freeing a
  // contact's friction lets it pull too, which "explains" almost any one-sided stance.
  const side = hingeSide(contacts, best.com!, height);
  if (side) {
    return {
      kind: 'barn-door',
      text: `Barn door: you'd swing off to the ${side} — add a hand or foot on the other side`,
    };
  }

  // Free one contact's friction and see whether some nearby body position then holds. The search
  // optimized for the failing stance, so test its best few positions and a spread of the others.
  const reachable = grid.filter((g) => g.sol);
  const tries = [
    ...new Set([
      best,
      ...[...reachable].sort((a, b) => a.cost - b.cost).slice(0, SLIP_TRIES),
      ...reachable.filter((_, i) => i % SLIP_STRIDE === 0),
    ]),
  ];
  let slip: { limb: Limb; hits: number } | null = null;
  for (const c of contacts) {
    const freed = contacts.map((o) => (o === c ? { ...o, cone: { ...o.cone, free: true } } : o));
    // M1: at a position whose hips rest on the wall, they rest there for the slip test too.
    const hits = tries.filter(
      (t) =>
        solveForces(freed, t.com!, gravity, height, bodyContact(freed, t.pelvis, height)).feasible,
    ).length;
    if (hits && (!slip || hits > slip.hits)) slip = { limb: c.limb, hits };
  }
  if (slip) {
    const c = input[slip.limb];
    if (tooSteep(slip.limb, c, gravity)) {
      const playText = steepPlayText(slip.limb, c!);
      return {
        kind: 'sloper-steep',
        limb: slip.limb,
        text: steepText(slip.limb, c!),
        ...(playText && { playText }),
      };
    }
    return { kind: 'slip', limb: slip.limb, text: slipText(slip.limb, c?.type ?? null) };
  }

  return { kind: 'unbalanced', text: "Can't hold this position on this wall" };
}
