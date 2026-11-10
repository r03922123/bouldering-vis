import { useMemo } from 'react';
import { useAppStore } from '../../store/app';
import { depthToColormap } from './postprocess';

/** The heatmap shown as the canvas base in Depth view. */
export function useDepthImage(): ImageData | null {
  const depth = useAppStore((s) => s.depth);
  const active = useAppStore((s) => s.view === 'depth');
  return useMemo(
    () => (depth && active ? depthToColormap(depth.depth, depth.width, depth.height) : null),
    [depth, active],
  );
}

export function DepthLegend() {
  return (
    <div className="depth-legend">
      <span>Near</span>
      <span className="depth-ramp" aria-hidden="true" />
      <span>Far</span>
      <small>Depth is relative, not to scale.</small>
    </div>
  );
}

export function DepthStatusLine() {
  const status = useAppStore((s) => s.depthStatus);
  const retry = useAppStore((s) => s.retryDepth);
  switch (status.state) {
    case 'running':
      return (
        <p role="status" className="depth-status">
          Estimating depth…
        </p>
      );
    case 'error':
      return (
        <p role="alert" className="depth-status error">
          Couldn’t estimate depth.{' '}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      );
    default:
      return null;
  }
}
