import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';
import type { Point } from '../../workers/protocol';
import { outlineLayer } from './outline';
import { badgeLabels, badgeRadius, drawBadge, routeStatus } from './roles';
import { PULSE_MS, pulseRing } from './feedback';
import { holdAt, selectAt } from './session';
import { useSamSession } from './useSamSession';
import { badgeAnchor, fitViewport, pan, screenToImage, zoomAt, type Viewport } from './viewport';

/** Gap between the tap point and the bubble (matches .tap-toast's 14px offset). */
const TOAST_GAP = 14;

const TAP_SLOP = 6; // px a pointer may move and still count as a tap
const MISS_HINT = 'Couldn’t isolate a hold here. Try tapping its center.';

function toCanvas(pixels: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = pixels.width;
  c.height = pixels.height;
  c.getContext('2d')?.putImageData(pixels, 0, 0);
  return c;
}

interface Props {
  client: MlClient;
  /** What to draw instead of the photo (e.g. the Route view composite). */
  base?: ImageData | null;
  /** When set, taps off a selected hold show this hint instead of adding a hold. */
  addHint?: string | null;
  /** Extra layers in image pixels drawn over the outlines (e.g. the chalk hatch). */
  overlays?: readonly (ImageData | null)[];
  /** Screen-space drawing over the image, under the badges (e.g. normal arrows). */
  drawExtras?: (ctx: CanvasRenderingContext2D, toScreen: (p: Point) => Point) => void;
}

const NO_OVERLAYS: readonly (ImageData | null)[] = [];

export function SelectionCanvas({
  client,
  base: baseImage = null,
  addHint = null,
  overlays = NO_OVERLAYS,
  drawExtras,
}: Props) {
  const image = useAppStore((s) => s.image)!;
  const holds = useAppStore((s) => s.holds);
  const showOutlines = useAppStore((s) => s.showOutlines);
  const samStatus = useAppStore((s) => s.samStatus);
  const { retry } = useSamSession(client);

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // The user's zoom/pan; it applies only while the image and box size it was made for still match.
  const [zoomed, setZoomed] = useState<{ key: string; vp: Viewport } | null>(null);
  const [pending, setPending] = useState<Point[]>([]);
  // Acknowledge input first: a faint ring where the finger is, from pointer-down (well under a
  // frame) until the tap is sent or the gesture turns out to be a pan or a pinch.
  const [pressed, setPressed] = useState<Point | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Feedback: a ring pulses around a newly added hold; a miss shows a bubble at the tap point.
  const [pulse, setPulse] = useState<{ holdIds: readonly string[]; start: number } | null>(null);
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState<{ x: number; y: number; text: string } | null>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );

  const base = useMemo(() => toCanvas(baseImage ?? image.pixels), [baseImage, image]);
  const labels = useMemo(() => badgeLabels(holds), [holds]);
  const overlay = useMemo(() => {
    const { width: w, height: h } = image;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')?.putImageData(
      outlineLayer(showOutlines ? holds : [], w, h, [255, 255, 255]),
      0,
      0,
    );
    return c;
  }, [holds, image, showOutlines]);
  const extras = useMemo(
    () => overlays.filter((o): o is ImageData => o !== null).map(toCanvas),
    [overlays],
  );
  // The hold focused from the list (or hovered here) gets a cyan outline.
  const focused = useAppStore((s) => s.focusedHold);
  const setFocused = useAppStore((s) => s.setFocusedHold);
  const focusLayer = useMemo(() => {
    const h = focused && holds.find((x) => x.id === focused.id);
    if (!h) return null;
    const { width: w, height: hh } = image;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    c.getContext('2d')?.putImageData(outlineLayer([h], w, hh, [56, 189, 248]), 0, 0);
    return c;
  }, [focused, holds, image]);

  // Track the container size; refit when it or the image changes.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const key = `${image.id}:${box.w}x${box.h}`;
  const fitted = useMemo(
    () => (box.w && box.h ? fitViewport(image.width, image.height, box.w, box.h) : null),
    [image, box],
  );
  const vp = zoomed?.key === key ? zoomed.vp : fitted;
  const setVp = useCallback(
    (next: Viewport | null | ((v: Viewport | null) => Viewport | null)) =>
      setZoomed((z) => {
        const current = z?.key === key ? z.vp : fitted;
        const v = typeof next === 'function' ? next(current) : next;
        return v ? { key, vp: v } : null;
      }),
    [key, fitted],
  );

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !vp) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * vp.scale, 0, 0, dpr * vp.scale, dpr * vp.tx, dpr * vp.ty);
    ctx.imageSmoothingEnabled = vp.scale < 1;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(overlay, 0, 0);
    if (focusLayer) ctx.drawImage(focusLayer, 0, 0);
    for (const layer of extras) ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawExtras?.(ctx, (p) => ({ x: p.x * vp.scale + vp.tx, y: p.y * vp.scale + vp.ty }));
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const h of holds) {
      const label = labels.get(h.id);
      if (!label) continue;
      const { x, y } = badgeAnchor(h.bbox, h.centroid, vp, badgeRadius(label));
      drawBadge(ctx, x, y, label);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    for (const p of pending) {
      ctx.beginPath();
      ctx.arc(p.x * vp.scale + vp.tx, p.y * vp.scale + vp.ty, 9, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    if (pressed) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(pressed.x, pressed.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const ring = pulse && pulseRing(now - pulse.start, reducedMotion);
    if (pulse && ring) {
      ctx.save();
      ctx.globalAlpha = ring.alpha;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      for (const ph of holds) {
        if (!pulse.holdIds.includes(ph.id)) continue;
        const r = (Math.max(ph.bbox.w, ph.bbox.h) / 2) * vp.scale + 4 + ring.grow;
        ctx.beginPath();
        ctx.arc(
          ph.centroid.x * vp.scale + vp.tx,
          ph.centroid.y * vp.scale + vp.ty,
          r,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [
    base,
    overlay,
    focusLayer,
    extras,
    drawExtras,
    vp,
    box,
    pending,
    pressed,
    holds,
    labels,
    pulse,
    now,
    reducedMotion,
  ]);

  // The moment the route completes (1–2 starts and a finish), every hold pulses once (I3).
  const complete = routeStatus(holds).complete;
  const wasComplete = useRef(complete);
  useEffect(() => {
    if (complete && !wasComplete.current) {
      setPulse({ holdIds: holds.map((h) => h.id), start: performance.now() });
    }
    wasComplete.current = complete;
  }, [complete, holds]);

  // Drive the pulse animation, then stop.
  useEffect(() => {
    if (!pulse) return;
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (t - pulse.start <= PULSE_MS) raf = requestAnimationFrame(tick);
      else setPulse(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pulse]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3000);
    return () => clearTimeout(t);
  }, [hint]);

  const tap = useCallback(
    async (sx: number, sy: number) => {
      if (!vp) return;
      const p = screenToImage(vp, sx, sy);
      if (p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height) return;
      setPending((ps) => [...ps, p]);
      try {
        const r = await selectAt(client, image, () => useAppStore.getState().holds, p, {
          allowAdd: !addHint,
        });
        if (useAppStore.getState().image?.id !== image.id) return;
        if (r.kind === 'added') {
          useAppStore.getState().addHold(r.hold);
          setPulse({ holdIds: [r.hold.id], start: performance.now() });
        } else if (r.kind === 'removed') useAppStore.getState().removeHold(r.id);
        else {
          const text = r.kind === 'blocked' ? addHint! : MISS_HINT;
          setHint(text);
          setToast({ x: sx, y: sy, text });
        }
      } catch {
        // A stale image or a worker error: the tap is dropped; the status line shows errors.
      } finally {
        setPending((ps) => ps.filter((q) => q !== p));
      }
    },
    [client, image, vp, addHint],
  );

  // Pointer gestures: tap, one-pointer drag = pan, two pointers = pinch zoom + pan.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, multi: false, startX: 0, startY: 0 });
  const local = (e: React.PointerEvent | WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, multi: false, startX: p.x, startY: p.y };
      setPressed(p);
    } else {
      gesture.current.multi = true;
      setPressed(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev && vp && e.pointerType === 'mouse') {
      // Hover (no button down): focus the hold under the cursor, linking it to its list row.
      const l = local(e);
      const p = screenToImage(vp, l.x, l.y);
      const hit = holdAt(holds, p, image.width);
      const cur = useAppStore.getState().focusedHold;
      if (hit && cur?.id !== hit.id) setFocused({ id: hit.id, from: 'wall' });
      else if (!hit && cur?.from === 'wall') setFocused(null);
      return;
    }
    if (!prev) return;
    const p = local(e);
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    pointers.current.set(e.pointerId, p);
    // Whether this is a tap or a drag is settled from the pointer alone; the viewport only pans.
    if (others.length === 0) {
      const g = gesture.current;
      if (Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP) g.moved = true;
      if (g.moved) {
        setPressed(null);
        if (vp) setVp(pan(vp, p.x - prev.x, p.y - prev.y));
      }
    } else if (others.length === 1 && vp) {
      const o = others[0]![1];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(p.x - o.x, p.y - o.y);
      const mid = { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 };
      const prevMid = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 };
      setVp(
        pan(
          zoomAt(vp, before ? after / before : 1, mid.x, mid.y),
          mid.x - prevMid.x,
          mid.y - prevMid.y,
        ),
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    setPressed(null);
    if (p && pointers.current.size === 0 && !g.moved && !g.multi) void tap(p.x, p.y);
  };

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      setVp((v) => (v ? zoomAt(v, Math.exp(-e.deltaY * 0.002), p.x, p.y) : v));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setVp]);

  const status =
    samStatus === 'preparing'
      ? 'Preparing image…'
      : samStatus === 'error'
        ? 'Couldn’t prepare the image for hold selection.'
        : (hint ?? 'Tap a hold to add it to your route.');

  return (
    <div className="selection">
      <div
        ref={boxRef}
        className="selection-box"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Wall photo"
          data-image-width={image.width}
          data-image-height={image.height}
          data-hold-count={holds.length}
          data-focused-hold={focused?.id}
          data-badges={[...labels.values()].sort().join(',')}
          data-scale={vp?.scale}
          data-tx={vp?.tx}
          data-ty={vp?.ty}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            if (useAppStore.getState().focusedHold?.from === 'wall') setFocused(null);
          }}
          data-pulse={pulse?.holdIds.join(',')}
          data-pressed={pressed ? 'true' : undefined}
        />
        {toast && (
          <div
            className="tap-toast"
            style={{ left: toast.x, top: toast.y }}
            // Measured, not guessed: the bubble's height depends on fonts and wrapping. If it can't fit
            // above the tap inside the wall box, it goes below (CI run 40924616582).
            ref={(el) => {
              el?.classList.toggle('below', el.offsetHeight + TOAST_GAP > toast.y);
            }}
            aria-hidden="true"
          >
            {toast.text}
          </div>
        )}
      </div>
      <p role="status" className={`selection-status${hint ? ' hint' : ''}`}>
        {status}
        {samStatus === 'error' && (
          <button type="button" onClick={retry}>
            Retry
          </button>
        )}
      </p>
    </div>
  );
}
