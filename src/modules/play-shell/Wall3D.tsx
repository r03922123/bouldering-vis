import { Suspense, useEffect, useMemo, useState } from 'react';
import type { MoveCheck, MoveContext } from '../beta-moves';
import type { StanceState } from '../climber-stance';
import type { DepthStatus } from '../depth-estimation';
import { PointCloudView } from '../point-cloud-view';
import type { MlClient } from '../../workers/client';

// SPEC-play-shell › Amendment 2026-11-02 H2: hint 2, the 3D view. The Studio's PointCloudView for
// this wall in a panel, with the current stance standing in it. This file and three.js are lazy
// chunks. It never asks for depth itself, and it reads no store: the app hands it this photo's
// depth state, and on a baked level only, a way to ask for it (review finding 1: on a tagged route
// depth feeds the holds' forces, so a hint asking for it would change the referee's input).

const NO_GEOMETRY = new Map();
const mb = (bytes: number) => Math.round(bytes / 2 ** 20);

/** The referee's stance as the Studio's StanceState, so PointCloudView draws it unchanged. */
export function stanceFor(check: MoveCheck, ctx: MoveContext): StanceState {
  return {
    stance: check.stance,
    assignment: check.assignment,
    contacts: check.contacts,
    height: ctx.height,
    candidates: { lf: [], rf: [] },
    footholdsStatus: 'ready',
  };
}

export default function Wall3D({
  client,
  depthReady,
  depthStatus,
  onRetry,
  check,
  ctx,
  notice,
}: {
  /** The ML worker, for the depth model's download progress; null when none is asked for. */
  client: MlClient | null;
  /** This photo's depth is in (PointCloudView reads it from the app's store). */
  depthReady: boolean;
  depthStatus: DepthStatus;
  /** Ask for depth again after an error (a baked level only). */
  onRetry?: () => void;
  /** The check on screen (the plan's last, or a preview's): its stance stands in the wall. */
  check: MoveCheck;
  ctx: MoveContext;
  /** The one-time notice that opening 3D downloads the depth model. */
  notice: boolean;
}) {
  const [progress, setProgress] = useState<Record<string, { loaded: number; total: number }>>({});

  // The depth model's download progress, from the worker's own events (set from its callback).
  useEffect(
    () =>
      client?.onProgress((p) => {
        if (p.model !== 'depth') return;
        setProgress((cur) => ({
          ...cur,
          [p.file ?? 'model']: { loaded: p.loaded, total: p.total },
        }));
      }),
    [client],
  );

  const files = Object.values(progress);
  const loaded = files.reduce((a, f) => a + f.loaded, 0);
  const total = files.reduce((a, f) => a + f.total, 0);
  const stance = useMemo(() => stanceFor(check, ctx), [check, ctx]);
  const state = depthReady ? 'ready' : depthStatus.state;

  return (
    <div className="play-3d-body" data-depth={state}>
      {notice && (
        <p className="play-3d-notice">
          3D needs the depth model, so it downloads now, this once. Your plan stays as it is.
        </p>
      )}
      {state === 'running' && (
        <p className="play-3d-progress" role="status">
          {total > 0 && loaded < total ? (
            <>
              Downloading depth model · {mb(loaded)} / {mb(total)} MB{' '}
              <progress aria-label="Downloading depth model" max={total} value={loaded} />
            </>
          ) : (
            'Estimating depth…'
          )}
        </p>
      )}
      {state === 'error' && onRetry && (
        <p role="alert" className="error">
          Couldn’t estimate depth.{' '}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {(state === 'idle' || state === 'error') && !onRetry && (
        <p className="play-3d-progress" role="status">
          No depth for this wall yet. The Setting Room’s route analysis makes it; Play never asks
          for it here, because it would change the holds the referee uses.
        </p>
      )}
      <Suspense fallback={<p role="status">Loading 3D view…</p>}>
        <PointCloudView composite={null} geometry={NO_GEOMETRY} stance={stance} />
      </Suspense>
    </div>
  );
}
