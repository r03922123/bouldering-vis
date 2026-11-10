import {
  contactsFor,
  LIMBS,
  type ContactInput,
  type StanceContacts,
  type Vec3,
} from '../climber-stance';
import { indexOf, parseSmear, qPoint, qVec } from './context';
import type { BetaStep, MoveContext } from './types';

// SPEC-beta-moves › How It Works: contactsOf. Pure.

interface Maps {
  types: Map<string, string | null>;
  forces: Map<string, { dir: Vec3 | null; source?: 'surface' | 'type' | 'user' | 'none' }>;
  wallNormals: Map<string, Vec3>;
}
const maps = new WeakMap<MoveContext, Maps>();

/** contactsFor's per-hold maps, built from the context's RouteHolds once per context. */
function mapsOf(ctx: MoveContext): Maps {
  let m = maps.get(ctx);
  if (!m) {
    m = {
      types: new Map(ctx.holds.map((h) => [h.id, h.type])),
      forces: new Map(
        ctx.holds.map((h) => [
          h.id,
          { dir: h.dir, ...(h.forceSource && { source: h.forceSource }) },
        ]),
      ),
      wallNormals: new Map(
        ctx.holds.flatMap((h) => (h.wallNormal ? [[h.id, h.wallNormal] as const] : [])),
      ),
    };
    maps.set(ctx, m);
  }
  return m;
}

/** B16: points to 0.1 px, directions and normals to 4 decimals. */
export function quantiseContact(c: ContactInput): ContactInput {
  return {
    holdId: c.holdId,
    point: [qPoint(c.point[0]), qPoint(c.point[1])],
    type: c.type,
    dir: qVec(c.dir),
    ...(c.surface !== undefined && {
      surface: c.surface && { normal: qVec(c.surface.normal)!, source: c.surface.source },
    }),
  };
}

export function quantiseContacts(contacts: StanceContacts): StanceContacts {
  const out: StanceContacts = {};
  for (const l of LIMBS) {
    const c = contacts[l];
    if (c) out[l] = quantiseContact(c);
  }
  return out;
}

/**
 * The solver's contacts for a step: route holds through climber-stance's contactsFor (grip point or
 * centroid, match gap, wall-frame force, sloper surface), wall feet and smears at their own points
 * (B11), quantised (B16). A limb that is off, or on a target the context doesn't know, has no
 * contact.
 */
export function contactsOf(step: BetaStep, ctx: MoveContext): StanceContacts {
  const ix = indexOf(ctx);
  const m = mapsOf(ctx);
  const onHolds = { lh: null, rh: null, lf: null, rf: null } as Record<
    (typeof LIMBS)[number],
    string | null
  >;
  for (const l of LIMBS) {
    const t = step[l];
    if (t && ix.holds.has(t)) onHolds[l] = t;
  }
  const routed = contactsFor(
    onHolds,
    ctx.holds,
    m.types,
    m.forces,
    ctx.height,
    ctx.photo,
    m.wallNormals,
  );
  const out: StanceContacts = {};
  for (const l of LIMBS) {
    const t = step[l];
    if (!t) continue;
    let c: ContactInput | null | undefined = routed[l];
    const foot = ix.wallFeet.get(t);
    if (foot) c = { holdId: t, point: [foot.point[0], foot.point[1]], type: null, dir: null };
    const smear = parseSmear(t);
    if (smear) c = { holdId: t, point: smear, type: 'smear', dir: null };
    if (c) out[l] = quantiseContact(c);
  }
  return out;
}
