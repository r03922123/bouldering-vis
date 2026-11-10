import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/app';
import { routeStatus, type RouteStatus } from './roles';
import type { HoldMask } from './types';

export type RouteStep = 'pick' | 'tag' | 'show' | 'done';

/** Where the player is: pick at least 2 holds → tag 1–2 starts and a finish → open a route view. */
export function routeStep(holds: readonly HoldMask[], shown: boolean): RouteStep {
  if (holds.length < 2) return 'pick';
  if (!routeStatus(holds).complete) return 'tag';
  return shown ? 'done' : 'show';
}

const STEPS: { id: Exclude<RouteStep, 'done'>; label: string }[] = [
  { id: 'pick', label: 'Pick holds' },
  { id: 'tag', label: 'Tag start & finish' },
  { id: 'show', label: 'Show route' },
];
const ORDER: RouteStep[] = ['pick', 'tag', 'show', 'done'];
/** How long the completion message stays. */
export const MOMENT_MS = 2500;

function detail(id: RouteStep, step: RouteStep, n: number, status: RouteStatus): string {
  switch (id) {
    case 'pick':
      return n === 0 ? 'Tap holds on the wall' : n === 1 ? '1 hold · tap more' : `${n} holds`;
    case 'tag':
      return status.complete
        ? 'Route ready'
        : `start ${status.startCount} of 1–2 · finish ${status.finishCount} of 1`;
    default:
      return step === 'done' ? 'Shown' : step === 'show' ? 'Press Show route' : '';
  }
}

/**
 * The three-step strip above the hold list (Cairn review I3): the current step is lit, done steps
 * get a check, and the moment the route completes a short "Route set" message is announced.
 */
export function RouteSteps() {
  const holds = useAppStore((s) => s.holds);
  const shown = useAppStore((s) => s.analysisTriggered);
  const status = routeStatus(holds);
  const step = routeStep(holds, shown);

  const [moment, setMoment] = useState<string | null>(null);
  const wasComplete = useRef(status.complete);
  useEffect(() => {
    if (status.complete && !wasComplete.current) {
      setMoment(`Route set: ${holds.length} holds`);
    }
    wasComplete.current = status.complete;
  }, [status.complete, holds.length]);
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => setMoment(null), MOMENT_MS);
    return () => clearTimeout(t);
  }, [moment]);

  const at = ORDER.indexOf(step);
  return (
    <nav aria-label="Route progress" className={`route-steps${moment ? ' celebrate' : ''}`}>
      <ol>
        {STEPS.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'todo';
          return (
            <li
              key={s.id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="step-num" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="step-label">{s.label}</span>
              <span className="step-detail">{detail(s.id, step, holds.length, status)}</span>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" aria-atomic="true" className="route-moment">
        {moment ?? ''}
      </p>
    </nav>
  );
}
