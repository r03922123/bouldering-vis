import { useEffect, useLayoutEffect, useRef } from 'react';
import { LIMBS, type Limb } from '../climber-stance';

// SPEC-play-shell › Amendment 2026-11-02 K1: keyboard limbs. Q/W over A/S mirrors the body (hands
// on top, left limbs on the left: Norman's natural mapping), and 1–4 follow the tray's order.

/** Each limb's keys, as its button shows them. */
export const LIMB_KEYS: Readonly<Record<Limb, { letter: string; digit: string }>> = {
  lh: { letter: 'Q', digit: '1' },
  rh: { letter: 'W', digit: '2' },
  lf: { letter: 'A', digit: '3' },
  rf: { letter: 'S', digit: '4' },
};

/**
 * Physical keys (`code`), so the 2×2 block keeps its shape on any layout. Builder's call: the
 * mapping's reason is where the keys sit, so AZERTY's A key (where Q is on QWERTY) is the left hand.
 */
const BY_CODE: Readonly<Record<string, Limb>> = Object.fromEntries(
  LIMBS.flatMap((l, i) => [
    [`Key${LIMB_KEYS[l].letter}`, l],
    [`Digit${i + 1}`, l],
    [`Numpad${i + 1}`, l],
  ]),
);

type KeyLike = Pick<KeyboardEvent, 'code' | 'key'> &
  Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat'>>;

/** The limb a key picks, 'clear' for Esc, or null: other keys, modifier shortcuts and repeats. */
export function limbForKey(e: KeyLike): Limb | 'clear' | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (e.key === 'Escape' || e.code === 'Escape') return 'clear';
  return BY_CODE[e.code] ?? null;
}

/** Input types that take typed text (a checkbox or a button doesn't). */
const TEXT_INPUTS = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/**
 * True when the key belongs to what has the focus: a text field, a select, an editable element, or
 * anything inside a dialog. Also true while any dialog is open (its keys are its own).
 */
export function keysIgnored(target: EventTarget | null): boolean {
  const doc = target instanceof Node ? target.ownerDocument : null;
  if (doc?.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type)) return true;
  return !!target.closest('[role="dialog"], [role="alertdialog"], dialog');
}

/**
 * K1: while `enabled`, Q/W/A/S, 1–4 and Esc on the page go to `onKey`, with `add` true when Shift
 * is held (R0-1: Shift + key adds a second limb). The listener is added once per `enabled`; the
 * latest handler is read from a ref set after each render, never during it.
 */
export function useLimbKeys(
  enabled: boolean,
  onKey: (k: Limb | 'clear', add: boolean) => void,
): void {
  const latest = useRef(onKey);
  useLayoutEffect(() => {
    latest.current = onKey;
  });
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || keysIgnored(e.target)) return;
      const k = limbForKey(e);
      if (!k) return;
      e.preventDefault();
      latest.current(k, e.shiftKey);
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [enabled]);
}
