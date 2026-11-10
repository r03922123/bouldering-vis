import { useEffect, useMemo, useState } from 'react';
import { useAppStore, type WallFootholdsStatus } from '../../store/app';
import { footCandidates, type FootCandidates } from './anyFeet';
import { autoAssign, contactsFor, defaultClimberHeight, type Assignment } from './assign';
import { solveStance, type Stance, type StanceContacts } from './stance';
import type { Vec3 } from './vec';

/** S12: solve after the inputs settle (a dragged slider sends many changes). */
export const STANCE_DEBOUNCE_MS = 100;

export interface StanceState {
  /** Null while the climber is hidden, before the first solve, or for another photo. */
  stance: Stance | null;
  /** What the solver uses: the user's choice, or the automatic start position. */
  assignment: Assignment;
  /** The solver's input (hold points per limb), also used to draw. */
  contacts: StanceContacts;
  /** Climber height in image pixels. */
  height: number;
  /** Each foot's ranked footholds from the current hands, for the panel's menus (rule 15). */
  candidates: FootCandidates;
  /** The wall footholds' progress (Amendment 2026-10-31 (b), rule 14). */
  footholdsStatus: WallFootholdsStatus;
}

/**
 * The stance for the current photo. `types` and `forces` are the app's effective hold type and
 * force per hold id (the user's corrections win), passed in so this module doesn't depend on
 * hold-classification.
 */
export function useStance(
  types: ReadonlyMap<string, string | null>,
  forces: ReadonlyMap<string, { dir: Vec3 | null; source?: 'surface' | 'type' | 'user' | 'none' }>,
  /** Per-hold wall normal (hold-geometry), to express forces in the wall frame. */
  wallNormals?: ReadonlyMap<string, Vec3>,
): StanceState {
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  const chosen = useAppStore((s) => s.stanceAssignment);
  const hooks = useAppStore((s) => s.stanceHooks);
  const scale = useAppStore((s) => s.climberScale);
  const wallAngle = useAppStore((s) => s.wallAngle);
  const show = useAppStore((s) => s.showClimber);
  const feetMode = useAppStore((s) => s.feetMode);
  const loaded = useAppStore((s) => s.wallFootholds);
  const footholdsStatus = useAppStore((s) => s.wallFootholdsStatus);

  // Amendment 2026-10-31 (b), rule 14: blobs only once ready. Until then (in 'any' mode) nothing
  // is solved, so a smear stance never flashes before the real feet; an error solves without them.
  const footholds = footholdsStatus === 'ready' ? loaded : null;
  const waiting = feetMode === 'any' && footholdsStatus === 'pending';

  const height = useMemo(() => (image ? defaultClimberHeight(image) * scale : 0), [image, scale]);
  const assignment = useMemo(
    () => chosen ?? autoAssign(holds, height, { wallAngleDeg: wallAngle, footholds, feetMode }),
    [chosen, holds, height, wallAngle, footholds, feetMode],
  );
  const contacts = useMemo(() => {
    const out = contactsFor(
      assignment,
      holds,
      types,
      forces,
      height,
      image ?? undefined,
      wallNormals,
      {
        footholds,
      },
    );
    // Amendment 2026-11-04, M3: a foot's hook, while it is on the hold it was set for.
    for (const foot of ['lf', 'rf'] as const) {
      const c = out[foot];
      const h = hooks[foot];
      if (c && h && h.holdId === c.holdId) out[foot] = { ...c, hook: h.hook };
    }
    return out;
  }, [assignment, holds, types, forces, height, image, wallNormals, footholds, hooks]);
  // From the current assignment's hands, auto or the user's, so the menus follow a moved hand.
  const candidates = useMemo(() => {
    const hand = (id: string | null) => holds.find((h) => h.id === id) ?? null;
    return footCandidates({
      holds,
      hands: { lh: hand(assignment.lh), rh: hand(assignment.rh) },
      height,
      footholds,
      mode: feetMode,
    });
  }, [holds, assignment.lh, assignment.rh, height, footholds, feetMode]);

  /** The inputs a stance was solved for, so a stance is only shown while they still hold. */
  const [solved, setSolved] = useState<{
    imageId: string;
    contacts: StanceContacts;
    height: number;
    wallAngle: number;
    stance: Stance;
  } | null>(null);
  useEffect(() => {
    if (!show || !image || waiting) return;
    const t = setTimeout(
      () =>
        setSolved({
          imageId: image.id,
          contacts,
          height,
          wallAngle,
          stance: solveStance(contacts, { height, wallAngleDeg: wallAngle }),
        }),
      STANCE_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [show, image, waiting, contacts, height, wallAngle]);

  // Until the new solve lands, show nothing rather than old joints against new holds.
  const current =
    show &&
    !waiting &&
    solved &&
    solved.imageId === image?.id &&
    solved.contacts === contacts &&
    solved.height === height &&
    solved.wallAngle === wallAngle;
  const stance = current ? solved.stance : null;
  // One object per change, so a canvas that draws it redraws only when something moved.
  return useMemo(
    () => ({ stance, assignment, contacts, height, candidates, footholdsStatus }),
    [stance, assignment, contacts, height, candidates, footholdsStatus],
  );
}
