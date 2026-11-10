import { LIMB_NAME, LIMBS, type Limb } from '../climber-stance';
import { PixelButton } from '../pixel-kit';
import { LIMB_KEYS } from './keys';

const SHORT: Record<Limb, string> = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' };

/**
 * The move tray (S6, S7, S13): limb buttons LH · RH · LF · RF (keys K1), then Undo and Redo.
 * R0-1: a press replaces the armed limb; Shift + click, or "+ limb" first, adds a second one.
 * "+ limb" is shown only at a tier that allows 2-limb moves (S8).
 */
export function MoveTray({
  armed,
  onToggle,
  maxLimbs = 1,
  adding = false,
  onAdding,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  children,
}: {
  armed: readonly Limb[];
  /** A limb pressed; `add` for Shift + click. */
  onToggle: (limb: Limb, add: boolean) => void;
  /** S8: the tier's limbs per move; "+ limb" only when it is 2. */
  maxLimbs?: 1 | 2;
  /** "+ limb" is on: the next limb pressed is added. */
  adding?: boolean;
  onAdding?: (on: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** More tray controls (the Aids menu). */
  children?: React.ReactNode;
}) {
  return (
    <div className="play-tray" role="group" aria-label="Moves">
      <div className="play-limbs">
        {LIMBS.map((l) => (
          <button
            key={l}
            type="button"
            className="play-limb"
            aria-pressed={armed.includes(l)}
            data-limb={l}
            aria-keyshortcuts={`${LIMB_KEYS[l].letter} ${LIMB_KEYS[l].digit}`}
            onClick={(e) => onToggle(l, e.shiftKey)}
          >
            {SHORT[l]}
            <span className="visually-hidden"> ({LIMB_NAME[l].toLowerCase()})</span>
            {/* K1: the key is shown; aria-keyshortcuts names it, so it isn't read twice. */}
            <kbd className="play-key" aria-hidden="true">
              {LIMB_KEYS[l].letter}
            </kbd>
          </button>
        ))}
      </div>
      <div className="play-history">
        {/* Beside the pad, first in the history group, which wraps on a phone (U1). */}
        {maxLimbs > 1 && onAdding && (
          <button
            type="button"
            className="play-limb-add"
            aria-pressed={adding}
            aria-describedby="play-limb-add-desc"
            onClick={() => onAdding(!adding)}
          >
            + limb
          </button>
        )}
        {maxLimbs > 1 && onAdding && (
          // Review 5: what "+ limb" does, for a screen reader (its visible label is short).
          <span id="play-limb-add-desc" className="visually-hidden">
            The next limb you press is added
          </span>
        )}
        <PixelButton label="Undo" icon="undo" disabled={!canUndo} onClick={onUndo} />
        <PixelButton label="Redo" disabled={!canRedo} onClick={onRedo} />
        {children}
      </div>
    </div>
  );
}
