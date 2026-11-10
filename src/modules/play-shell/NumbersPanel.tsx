import type { MoveCheck } from '../beta-moves';
import { numbersFor } from './numbers';

/** Numbers mode (S10): the rows of numbersFor for the check on screen, and nothing else (AC 8). */
export function NumbersPanel({ check }: { check: MoveCheck }) {
  return (
    <section className="play-numbers" aria-label="Numbers">
      <dl>
        {numbersFor(check).map((r) => (
          <div key={r.label} data-limb={r.limb ?? undefined}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
