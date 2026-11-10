import type { Target } from '../beta-moves';
import { LIMB_NAME, type Limb } from '../climber-stance';

/**
 * S12: the move without the canvas. The targets for the limb waiting for one, as buttons, so the
 * limb buttons and this list complete any move by keyboard or screen reader.
 */
export function TargetList({
  limb,
  targets,
  onChoose,
  onFocus,
  marks = null,
  children,
  id,
}: {
  limb: Limb;
  targets: readonly { target: Target; label: string }[];
  onChoose: (t: Target) => void;
  onFocus: (t: Target | undefined) => void;
  /** H3: the referee's verdict per target in words, while "Plausible holds" is on. */
  marks?: ReadonlyMap<Target, string> | null;
  /** Shown under the heading (H3's count line). */
  children?: React.ReactNode;
  /** For the "List targets" toggle's aria-controls (Amendment (b) U5). */
  id?: string;
}) {
  return (
    <section
      id={id}
      className="play-targets"
      aria-label={`Targets for the ${LIMB_NAME[limb].toLowerCase()}`}
    >
      <h2>Where does the {LIMB_NAME[limb].toLowerCase()} go?</h2>
      {children}
      <ul>
        {targets.map((t) => (
          <li key={t.target ?? 'off'}>
            <button
              type="button"
              onClick={() => onChoose(t.target)}
              onFocus={() => onFocus(t.target)}
              onBlur={() => onFocus(undefined)}
              onMouseEnter={() => onFocus(t.target)}
              onMouseLeave={() => onFocus(undefined)}
            >
              {t.label}
              {marks?.has(t.target) && (
                <span className="play-mark" data-mark={marks.get(t.target)}>
                  {' '}
                  · {marks.get(t.target)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
