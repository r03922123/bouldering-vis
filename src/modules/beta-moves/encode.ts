import { LIMBS } from '../climber-stance';
import { indexOf, onPhoto, parseSmear, SMEAR_PREFIX, WALL_FOOT } from './context';
import { SHAPE_TEXT } from './shape';
import type { Beta, BetaStep, MoveContext, Target } from './types';

// SPEC-beta-moves › Label codec: fixtures and in-session replay, not persistence. Hold ids are
// session UUIDs, so a beta is written by hold labels (B16).

const OFF = '-';
const FIELD = ',';
const STEP = ';';

/**
 * One field back to its target, or undefined: '-' is off, wf: must be a listed wall foothold, a
 * smear must be well-formed and on the photo, anything else is a hold label.
 */
function reader(ctx: MoveContext): (field: string) => Target | undefined {
  const ix = indexOf(ctx);
  const byLabel = new Map(ctx.holds.map((h) => [h.label, h.id]));
  return (f) => {
    if (f === OFF) return null;
    if (f.startsWith(WALL_FOOT)) return ix.wallFeet.has(f) ? f : undefined;
    if (f.startsWith(SMEAR_PREFIX)) {
      const p = parseSmear(f);
      return p && onPhoto(ctx, p[0], p[1]) ? f : undefined;
    }
    return byLabel.get(f);
  };
}

/**
 * 'lh,rh,lf,rf;…' using hold labels, wf:<x>:<y>, smear:<x>:<y>, '-' (off). Throws RangeError for
 * anything decodeBeta couldn't read back to the same beta: no steps, a target the route doesn't
 * have, an off-photo smear, or a hold label that is '-', starts with wf:/smear: or holds a ',' or
 * ';'. So decodeBeta(encodeBeta(b)) deep-equals b whenever encodeBeta returns (AC 34).
 */
export function encodeBeta(beta: Beta, ctx: MoveContext): string {
  if (!beta.steps.length) throw new RangeError('A beta starts with its start');
  const ix = indexOf(ctx);
  const read = reader(ctx);
  const field = (t: Target): string => {
    const f = t === null ? OFF : (ix.holds.get(t)?.label ?? t);
    if (f.includes(FIELD) || f.includes(STEP) || read(f) !== t) {
      throw new RangeError(SHAPE_TEXT['unknown-target']);
    }
    return f;
  };
  return beta.steps.map((s) => LIMBS.map((l) => field(s[l])).join(FIELD)).join(STEP);
}

/** null on an unknown label, an unknown wf id, an off-photo smear, or a step with ≠ 4 fields. */
export function decodeBeta(text: string, ctx: MoveContext): Beta | null {
  const read = reader(ctx);
  const steps: BetaStep[] = [];
  for (const part of text.split(STEP)) {
    const fields = part.split(FIELD);
    if (fields.length !== LIMBS.length) return null;
    const ts = fields.map(read);
    if (ts.some((t) => t === undefined)) return null;
    const [lh = null, rh = null, lf = null, rf = null] = ts as Target[];
    steps.push({ lh, rh, lf, rf });
  }
  return { steps };
}
