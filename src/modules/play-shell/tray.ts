import { LIMB_NAME, type Limb } from '../climber-stance';
import type { Profile } from '../gym-hub';

/** The tray's settings for a level (S8). Never rules: the referee is the same for everyone. */
export interface TraySettings {
  maxLimbs: 1 | 2;
  numbers: boolean;
  plumb: boolean;
}

/**
 * Pure: what the tray offers and shows for a profile (S8). A beginner moves one limb at a time;
 * gym climbers and pros may move two. Numbers follows the profile's own aid toggle, so any level
 * can turn it on. The plumb line is a pillars item [if pillars] and stays off until they are
 * approved. Never returns MoveRules (amendment (b), SC 6).
 */
export function trayFor(profile: Profile): TraySettings {
  return { maxLimbs: profile.level === 'beginner' ? 1 : 2, numbers: profile.numbers, plumb: false };
}

/** What changes the armed limbs (R0-1). */
export type ArmEvent =
  /** A limb key or button; `add` for Shift or "+ limb", a second limb on purpose. */
  | { kind: 'press'; limb: Limb; add: boolean }
  /** Esc (K1). */
  | { kind: 'clear' }
  /** A move tried with the armed limbs, and what the referee made of it. */
  | { kind: 'attempt'; outcome: 'commit' | 'preview' | 'rejected' };

/**
 * Pure (SPEC-play-shell › Amendment 2026-11-03 R0-1): the armed limbs after an event. A press
 * replaces the armed limb, as a plain click replaces a selection; `add` extends it (Shift, as in
 * Apple's HIG and the Windows selection guidelines) up to the tier's `maxLimbs` (S8), dropping the
 * oldest. A press on an armed limb keeps it. A fall preview or a rejection keeps the limbs armed,
 * so the next tap retries with them; a committed move puts them down.
 */
export function nextArmed(armed: readonly Limb[], e: ArmEvent, maxLimbs: 1 | 2): Limb[] {
  if (e.kind === 'clear') return [];
  if (e.kind === 'attempt') return e.outcome === 'commit' ? [] : [...armed];
  if (!e.add || maxLimbs < 2) return [e.limb];
  if (armed.includes(e.limb)) return [...armed];
  return [...armed, e.limb].slice(-maxLimbs);
}

/**
 * R0-1: the hint line while limbs are armed. "Moving: right hand — tap a hold"; for a 2-limb
 * move, both limbs and the one whose hold is next. Null with nothing armed.
 */
export function movingLine(armed: readonly Limb[], waiting: Limb | null): string | null {
  if (!armed.length) return null;
  const names = armed.map((l) => LIMB_NAME[l].toLowerCase());
  const what =
    armed.length > 1 && waiting
      ? `tap a hold for the ${LIMB_NAME[waiting].toLowerCase()}`
      : 'tap a hold';
  return `Moving: ${names.join(' and ')} — ${what}`;
}
