import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/app';
import { setRole } from './roles';
import type { HoldMask, HoldRole } from './types';

const ROLES: { value: HoldRole; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'route', label: 'Route' },
  { value: 'finish', label: 'Finish' },
];
const THUMB = 48;

function Thumb({ source, hold }: { source: HTMLCanvasElement | null; hold: HoldMask }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !source) return;
    const { x, y, w, h } = hold.bbox;
    const side = Math.max(w, h);
    ctx.clearRect(0, 0, THUMB, THUMB);
    ctx.drawImage(
      source,
      x + w / 2 - side / 2,
      y + h / 2 - side / 2,
      side,
      side,
      0,
      0,
      THUMB,
      THUMB,
    );
  }, [source, hold]);
  return (
    <canvas ref={ref} width={THUMB} height={THUMB} className="hold-thumb" aria-hidden="true" />
  );
}

interface Props {
  /** Extra per-row content from other modules (e.g. chalk level, hold type). */
  rowExtra?: (hold: HoldMask) => ReactNode;
}

export function HoldList({ rowExtra }: Props) {
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  const setHolds = useAppStore((s) => s.setHolds);
  const removeHold = useAppStore((s) => s.removeHold);
  const focused = useAppStore((s) => s.focusedHold);
  const setFocused = useAppStore((s) => s.setFocusedHold);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // A hold hovered on the wall scrolls its row into view inside the inspector panel. Only the
  // panel scrolls (when it scrolls on its own, as on desktop), never the page: moving the page
  // under the cursor would shift the wall.
  useEffect(() => {
    if (focused?.from !== 'wall') return;
    const row = rowRefs.current.get(focused.id);
    const panel = row?.closest<HTMLElement>('.inspector');
    if (!row || !panel || panel.scrollHeight <= panel.clientHeight) return;
    const r = row.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    if (r.top < p.top) panel.scrollTop -= p.top - r.top;
    else if (r.bottom > p.bottom) panel.scrollTop += r.bottom - p.bottom;
  }, [focused]);
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(() => {
    if (!image?.pixels.data) return null;
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(image.pixels, 0, 0);
    return c;
  }, [image]);

  if (!holds.length) return null;
  const sorted = [...holds].sort((a, b) => a.order - b.order);

  const choose = (id: string, role: HoldRole) => {
    const next = setRole(holds, id, role);
    if ('error' in next) {
      setError('Max 2 start holds');
      return;
    }
    setError(null);
    setHolds(next);
  };

  return (
    <section className="hold-list" aria-label="Selected holds">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ol>
        {sorted.map((h, i) => (
          <li
            key={h.id}
            ref={(el) => {
              if (el) rowRefs.current.set(h.id, el);
              else rowRefs.current.delete(h.id);
            }}
            data-focused={focused?.id === h.id ? 'true' : undefined}
            onMouseEnter={() => setFocused({ id: h.id, from: 'list' })}
            onMouseLeave={() => setFocused(null)}
            onFocus={() => setFocused({ id: h.id, from: 'list' })}
            onBlur={() => setFocused(null)}
          >
            <fieldset aria-label={`Hold ${i + 1}`}>
              <span className="hold-index">{i + 1}</span>
              <Thumb source={source} hold={h} />
              <span className="role-picker">
                {ROLES.map((r) => (
                  <label key={r.value}>
                    <input
                      type="radio"
                      name={`role-${h.id}`}
                      checked={h.role === r.value}
                      onChange={() => choose(h.id, r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </span>
              {rowExtra && <span className="hold-extra">{rowExtra(h)}</span>}
              <button
                type="button"
                aria-label={`Remove hold ${i + 1}`}
                onClick={() => removeHold(h.id)}
              >
                ✕
              </button>
            </fieldset>
          </li>
        ))}
      </ol>
    </section>
  );
}
