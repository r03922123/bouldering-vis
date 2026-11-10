import type { ReactNode } from 'react';
import type { Profile } from '../gym-hub';

export type Aid = 'hints' | 'numbers';

/** Each aid's icon (decoration only: the label is its name). */
const ICON: Readonly<Record<string, string>> = {
  hints: '?',
  numbers: '#',
  directions: '↗',
  plausible: '◎',
};

const AIDS: readonly { aid: Aid; label: string }[] = [
  { aid: 'numbers', label: 'Numbers' },
  { aid: 'hints', label: 'Hints' },
];

/**
 * S8 and Amendment (b) U2: every aid has a toggle, at every level ("no grade gate"), now a row of
 * labelled icon toggles beside the controls instead of a menu. Each is a native switch, so the
 * keyboard and screen-reader paths are the browser's own.
 */
export function AidsMenu({
  profile,
  onSetAid,
  views = [],
  children,
}: {
  profile: Profile;
  onSetAid: (aid: Aid, on: boolean) => void;
  /** Play's view aids (H1, H3): they change only what is drawn, never the plan. */
  views?: readonly { id: string; label: string; on: boolean; onChange: (on: boolean) => void }[];
  /** More hint controls in the row (the 3D panel's toggle). */
  children?: ReactNode;
}) {
  const chip = (id: string, label: string, on: boolean, onChange: (on: boolean) => void) => (
    <label key={id} className="play-aid" data-on={on || undefined}>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="play-aid-icon" aria-hidden="true">
        {ICON[id]}
      </span>
      {label}
    </label>
  );
  return (
    <div className="play-aids" role="group" aria-label="Hints">
      {views.map((v) => chip(v.id, v.label, v.on, v.onChange))}
      {children}
      {AIDS.map(({ aid, label }) => chip(aid, label, profile[aid], (on) => onSetAid(aid, on)))}
    </div>
  );
}
