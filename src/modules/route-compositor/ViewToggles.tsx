import { useAppStore, type View } from '../../store/app';
import { routeStatus } from '../hold-segmentation';

const VIEWS: { value: View; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'route', label: 'Route' },
  { value: 'depth', label: 'Depth' },
  { value: '3d', label: '3D' },
];

function Switch({ label, on, set }: { label: string; on: boolean; set: (on: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
}

/** View mode and display switches. The app never changes the view by itself. */
export function ViewToggles() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const complete = useAppStore((s) => routeStatus(s.holds).complete);
  const showOtherHolds = useAppStore((s) => s.showOtherHolds);
  const showOutlines = useAppStore((s) => s.showOutlines);
  const setShowOtherHolds = useAppStore((s) => s.setShowOtherHolds);
  const setShowOutlines = useAppStore((s) => s.setShowOutlines);
  const showChalk = useAppStore((s) => s.showChalk);
  const setShowChalk = useAppStore((s) => s.setShowChalk);
  const showArrows = useAppStore((s) => s.showArrows);
  const setShowArrows = useAppStore((s) => s.setShowArrows);
  const showClimber = useAppStore((s) => s.showClimber);
  const setShowClimber = useAppStore((s) => s.setShowClimber);

  return (
    <div className="view-toggles">
      <div role="radiogroup" aria-label="View" className="segmented">
        {VIEWS.map((v) => (
          <label key={v.value} className={view === v.value ? 'active' : ''}>
            <input
              type="radio"
              name="view"
              checked={view === v.value}
              onChange={() => setView(v.value)}
            />
            {v.label}
          </label>
        ))}
      </div>
      <button type="button" className={complete ? 'primary' : ''} onClick={() => setView('route')}>
        Show route
      </button>
      <details className="layers">
        <summary>Layers</summary>
        <div className="layers-menu">
          <Switch label="Show other holds" on={showOtherHolds} set={setShowOtherHolds} />
          <Switch label="Outlines" on={showOutlines} set={setShowOutlines} />
          <Switch label="Show chalk" on={showChalk} set={setShowChalk} />
          <Switch label="Arrows" on={showArrows} set={setShowArrows} />
          <Switch label="Climber" on={showClimber} set={setShowClimber} />
        </div>
      </details>
    </div>
  );
}
