import { useAppStore } from '../../store/app';
import type { Force } from './force';
import { isCustomPull, PULL_OPTIONS, type PullPreset } from './pull';

/** The hold's direction in words, with a Pull selector so the user can correct it. */
export function DirectionControl({ holdId, force }: { holdId: string; force: Force }) {
  const pull = useAppStore((s) => s.pullOverrides[holdId] ?? null);
  const setPull = useAppStore((s) => s.setPullOverride);
  const text = force.cue ?? 'No single pull direction. Set one if you know it.';
  const drawn = isCustomPull(pull);
  return (
    <div className="direction">
      <span className="direction-text">{text}</span>
      <select
        aria-label="Pull direction"
        value={drawn ? 'drawn' : (pull ?? '')}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'drawn') return; // only shown while a drawn direction is set
          setPull(holdId, (v || null) as PullPreset | null);
        }}
      >
        <option value="">Pull: auto</option>
        {drawn && <option value="drawn">Pull: drawn</option>}
        {PULL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Pull: {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
