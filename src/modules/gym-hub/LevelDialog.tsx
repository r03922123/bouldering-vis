import { useEffect, useId, useRef } from 'react';
import type { Level } from './profile';

const ANSWERS: readonly { level: Level; text: string }[] = [
  { level: 'beginner', text: "I'm new to climbing" },
  { level: 'gym', text: 'I climb in gyms' },
  { level: 'pro', text: 'I climb hard, set or coach' },
];

interface Props {
  /** The saved answer when reopened at the lockers; null on the first visit. */
  current: Level | null;
  onAnswer: (level: Level) => void;
  /** "Not now" or Escape; the caller counts it as a gym climber (G8). */
  onDismiss: () => void;
}

/** The front desk's one question (SPEC-gym-hub G8). System-font DOM text, so it reads and zooms. */
export function LevelDialog({ current, onAnswer, onDismiss }: Props) {
  const titleId = useId();
  const focusRef = useRef<HTMLButtonElement>(null);
  useEffect(() => focusRef.current?.focus(), []);
  const focused = current ?? ANSWERS[0]!.level;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="level-dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDismiss();
      }}
    >
      <p className="level-speaker">Mags</p>
      <h2 id={titleId}>How long have you been climbing?</h2>
      <div className="level-answers">
        {ANSWERS.map((a) => (
          <button
            key={a.level}
            ref={a.level === focused ? focusRef : undefined}
            aria-pressed={current === null ? undefined : current === a.level}
            onClick={() => onAnswer(a.level)}
          >
            {a.text}
          </button>
        ))}
      </div>
      <button className="level-later" onClick={onDismiss}>
        Not now
      </button>
    </div>
  );
}
