import { useAppStore } from '../store/app';
import { downloading } from './modelProgress';

const mb = (bytes: number) => Math.round(bytes / 2 ** 20);

/** Says what is downloading, by name and size, instead of an unexplained wait. */
export function LoadingStatus() {
  const items = downloading(useAppStore((s) => s.modelProgress));
  if (!items.length) return null;
  return (
    <div className="loading-status">
      {items.map((d) => (
        <p key={d.model}>
          <span>
            Downloading {d.name} · {mb(d.loaded)} / {mb(d.total)} MB
          </span>
          <progress aria-label={`Downloading ${d.name}`} max={d.total} value={d.loaded} />
        </p>
      ))}
    </div>
  );
}
