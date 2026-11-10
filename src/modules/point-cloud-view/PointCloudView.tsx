import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useAppStore } from '../../store/app';
import { drawStance, layoutStance, type StanceState, type Vec3 } from '../climber-stance';
import {
  forceEmphasis,
  pullDir,
  snapPull,
  type Emphasis,
  type Force,
  type HoldGeometry,
  type PullOverride,
} from '../hold-geometry';
import { aimOnViewPlane, handleAt, hitHandle, imageToThree, threeToImage } from './aim';
import { annotations, type Annotation } from './annotations';
import { hasSeenAimCoach, markAimCoachSeen } from './coach';
import {
  drawCoachMark,
  drawHandles,
  drawOverlay,
  layoutOverlay,
  type OverlayItem,
} from './overlay';
import {
  buildPointCloud,
  intrinsics,
  pickStride,
  recolor,
  reposition,
  SELECTED_SIZE,
} from './build';
import { buildSurface, shade, surfacePositions } from './surface';
import { wallToWorld } from './stance';
import { fitCamera, pointBudget, pointSize, routeTarget, verticalFovDeg } from './camera';

interface Three {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  render: () => void;
}

const hasWebGL2 = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};

/** A soft round dot (instead of square sprites, which alias into moiré on the grid). */
function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  return new CanvasTexture(c);
}

/** Points split into two objects so selected holds can be drawn larger. */
function subset(indices: Int32Array, sizes: Float32Array, selected: boolean): Int32Array {
  return indices.filter((_, p) => sizes[p]! >= SELECTED_SIZE - 1e-3 === selected);
}

/** The orbitable 3D dot map (requirement 6b). Loaded lazily with three.js. */
interface Overlay {
  list: Annotation[];
  emphasis: Map<string, Emphasis>;
  showArrows: boolean;
  focusedId: string | null;
  /** The climber (SPEC-climber-stance T54), with its wall-frame → world mapping. */
  climber: { state: StanceState; toWorld: (p: Vec3) => Vec3 } | null;
}

interface Props {
  composite: ImageData | null;
  /** Hold normals from hold-geometry, for the 3D arrows. */
  geometry: ReadonlyMap<string, HoldGeometry>;
  /** The force per hold id, computed once by the app (same map as the 2D arrows and cards). */
  forces?: ReadonlyMap<string, Force>;
  /** The climber stance, drawn in front of the wall when it's shown. */
  stance?: StanceState | null;
}

const NO_FORCES: ReadonlyMap<string, Force> = new Map();
/** World length of the live arrow while aiming (only its direction is used for drawing). */
const AIM_LENGTH = 0.16;
/** How long a snap's ring pulse lasts. */
const PULSE_MS = 300;
const COACH_TEXT = 'Drag to set the pull';
/** Surface mesh resolution (vertices); ~400k triangles. */
const SURFACE_VERTICES = 200_000;

export default function PointCloudView({
  composite,
  geometry,
  forces = NO_FORCES,
  stance = null,
}: Props) {
  const image = useAppStore((s) => s.image)!;
  const depth = useAppStore((s) => s.depth);
  const holds = useAppStore((s) => s.holds);
  const colorMode = useAppStore((s) => s.cloudColorMode);
  const relief = useAppStore((s) => s.cloudRelief);
  const setColorMode = useAppStore((s) => s.setCloudColorMode);
  const setRelief = useAppStore((s) => s.setCloudRelief);
  const cloudStyle = useAppStore((s) => s.cloudStyle);
  const setCloudStyle = useAppStore((s) => s.setCloudStyle);
  const showArrows = useAppStore((s) => s.showArrows);
  const [marks, setMarks] = useState({ forces: 0, badges: '' });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Aiming state lives in refs: a drag redraws the overlay per pointer move, with no React render.
  const aimRef = useRef<{
    holdId: string;
    pull: PullOverride | null;
    preset: string | null;
    pulseAt: number;
  } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const laidOut = useRef<OverlayItem[]>([]);
  // The one-time coach mark on the first handle, until the first drag (remembered per device).
  const [coachAtMount] = useState(() => !hasSeenAimCoach()); // read storage once, not per render
  const coachRef = useRef(coachAtMount);
  const overlay = useRef<Overlay>({
    list: [],
    emphasis: new Map(),
    showArrows: true,
    focusedId: null,
    climber: null,
  });
  const focusedId = useAppStore((s) => s.focusedHold?.id ?? null);
  const boxRef = useRef<HTMLDivElement>(null);
  const three = useRef<Three | null>(null);
  const objects = useRef<{ wall: Points; route: Points; target: [number, number, number] } | null>(
    null,
  );
  const [camera, setCamera] = useState('0,0,0');
  const [cameraAspect, setCameraAspect] = useState(image.width / image.height);
  const [webgl2] = useState(hasWebGL2);

  const ready = depth && depth.imageId === image.id ? depth : null;
  const budget = useMemo(
    () => pointBudget(window.matchMedia?.('(pointer: coarse)').matches ?? false),
    [],
  );
  const cloud = useMemo(
    () =>
      ready
        ? buildPointCloud({
            depth: ready,
            source: image.pixels,
            composite: composite ?? image.pixels,
            holds,
            colorMode: 'route',
            relief: useAppStore.getState().cloudRelief,
            budget,
          })
        : null,
    // Colors and relief update in place below; rebuild only for new depth or holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, holds, image, budget],
  );
  const groups = useMemo(() => {
    if (!cloud) return null;
    return {
      wall: subset(cloud.indices, cloud.sizes, false),
      route: subset(cloud.indices, cloud.sizes, true),
    };
  }, [cloud]);

  // Surface mesh: triangles and colors (no relief) and positions (relief) are separate memos, so
  // dragging Relief only recomputes positions (~100 ms → a few ms per tick).
  const surfaceStride = Math.max(
    2,
    Math.ceil(Math.sqrt((image.width * image.height) / SURFACE_VERTICES)),
  );
  const surface = useMemo(() => {
    if (cloudStyle !== 'surface' || !ready) return null;
    const src = colorMode === 'route' && composite ? composite : image.pixels;
    return buildSurface(ready, src, surfaceStride);
  }, [cloudStyle, ready, colorMode, composite, image, surfaceStride]);
  const surfacePos = useMemo(
    () => (surface && ready ? surfacePositions(ready, relief, surfaceStride) : null),
    [surface, ready, relief, surfaceStride],
  );
  const surfaceMesh = useRef<Mesh | null>(null);

  // Renderer, camera and orbit controls: once per mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webgl2) return;
    const renderer = new WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    // Point colors are already sRGB pixel values: pass them through unchanged (three.js would
    // otherwise treat them as linear and brighten them on output).
    renderer.outputColorSpace = LinearSRGBColorSpace;
    const scene = new Scene();
    const camera = new PerspectiveCamera(
      verticalFovDeg(image.width, image.height),
      image.width / image.height,
      0.01,
      20,
    );
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    // Arrows and badges: a 2D overlay at projected positions (crisp, constant size, no funnels).
    const drawFrame = () => {
      const o = overlayRef.current;
      const ctx = o?.getContext('2d');
      if (!o || !ctx) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (o.width !== Math.round(w * dpr)) o.width = Math.round(w * dpr);
      if (o.height !== Math.round(h * dpr)) o.height = Math.round(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, o.width, o.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.updateMatrixWorld();
      const project = (p: [number, number, number]) => {
        const v = new Vector3(...p).project(camera);
        return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
      };
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const { list, emphasis, showArrows, focusedId, climber } = overlay.current;
      // The climber first, so badges and handles stay on top of it.
      const body =
        climber?.state.stance &&
        layoutStance(climber.state.stance, climber.state.contacts, climber.state.height, (p) =>
          project(climber.toWorld(p)),
        );
      if (body) drawStance(ctx, body);
      canvas.dataset.climber = body ? 'shown' : '';
      // While aiming, the aimed hold shows the live (snapped) direction, drawn bold.
      const aim = aimRef.current;
      let shown = list;
      let shownEmphasis = emphasis;
      if (aim?.pull) {
        const d = imageToThree(pullDir(aim.pull));
        shown = list.map((a) =>
          a.holdId === aim.holdId
            ? { ...a, force: { tail: a.origin, dir: d, length: AIM_LENGTH } }
            : a,
        );
        shownEmphasis = new Map(emphasis).set(aim.holdId, 'notable');
      }
      const items = layoutOverlay(shown, project, [right.x, right.y, right.z], shownEmphasis);
      laidOut.current = items;
      drawOverlay(ctx, items, showArrows, focusedId);
      if (showArrows) {
        const pulse = aim ? Math.max(0, 1 - (performance.now() - aim.pulseAt) / PULSE_MS) : 0;
        drawHandles(ctx, items, { hover: hoverRef.current, active: aim?.holdId ?? null, pulse });
        if (pulse > 0) requestAnimationFrame(drawFrame);
      }
      const coach = showArrows && coachRef.current && items[0];
      if (coach) drawCoachMark(ctx, coach, COACH_TEXT, { w, h });
      canvas.dataset.coach = coach ? 'aim' : '';
      // For tests and tools: where each handle is, and what is being aimed.
      canvas.dataset.handles = showArrows
        ? items
            .map((it) => {
              const h = handleAt(it);
              return `${it.holdId}:${Math.round(h.x)},${Math.round(h.y)}`;
            })
            .join(';')
        : '';
      canvas.dataset.aiming = aim?.holdId ?? '';
    };
    const render = () => {
      renderer.render(scene, camera);
      drawFrame();
      const p = camera.position;
      // Clamp tiny float noise so 0 never prints as -0.000.
      const fmt = (v: number) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
      setCamera(`${fmt(p.x)},${fmt(p.y)},${fmt(p.z)}`);
    };
    controls.addEventListener('change', render);

    // Aiming a hold's direction: press its handle and drag; pressing anywhere else orbits.
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    const onDown = (e: PointerEvent) => {
      if (!overlay.current.showArrows || e.button !== 0) return;
      const p = local(e);
      const id = hitHandle(laidOut.current, p.x, p.y);
      if (!id) return;
      e.stopImmediatePropagation(); // OrbitControls must not start an orbit
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      aimRef.current = { holdId: id, pull: null, preset: null, pulseAt: 0 };
      if (coachRef.current) {
        coachRef.current = false; // the player found the handle: the mark has done its job
        markAimCoachSeen();
      }
      canvas.style.cursor = 'grabbing';
      drawFrame(); // overlay only: the scene and camera didn't change
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const aim = aimRef.current;
      if (!aim) {
        if (e.buttons || !overlay.current.showArrows) return;
        const id = hitHandle(laidOut.current, p.x, p.y);
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          canvas.style.cursor = id ? 'grab' : '';
          drawFrame();
        }
        return;
      }
      e.stopImmediatePropagation();
      const hold = overlay.current.list.find((a) => a.holdId === aim.holdId);
      if (!hold) return;
      const ray = new Vector3((p.x / p.w) * 2 - 1, 1 - (p.y / p.h) * 2, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const fwd = camera.getWorldDirection(new Vector3());
      const d = aimOnViewPlane(
        [camera.position.x, camera.position.y, camera.position.z],
        [fwd.x, fwd.y, fwd.z],
        [ray.x, ray.y, ray.z],
        hold.origin,
      );
      if (!d) return;
      const pull = snapPull(threeToImage(d), e.shiftKey);
      const preset = typeof pull === 'string' ? pull : null;
      if (preset && preset !== aim.preset) {
        aim.pulseAt = performance.now(); // snapped: pulse the ring, and a tick on phones
        navigator.vibrate?.(10);
      }
      aim.preset = preset;
      aim.pull = pull;
      // Only the overlay changes per move; re-rendering 300k points per pointer move would stutter.
      drawFrame();
    };
    const finish = (commit: boolean) => {
      const aim = aimRef.current;
      if (!aim) return;
      aimRef.current = null;
      controls.enabled = true;
      canvas.style.cursor = hoverRef.current ? 'grab' : '';
      if (commit && aim.pull) useAppStore.getState().setPullOverride(aim.holdId, aim.pull);
      drawFrame(); // a committed pull re-renders through the forces effect
    };
    const onUp = (e: PointerEvent) => {
      if (!aimRef.current) return;
      e.stopImmediatePropagation();
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      finish(true);
    };
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aimRef.current) finish(false);
    };
    canvas.addEventListener('pointerdown', onDown, { capture: true });
    canvas.addEventListener('pointermove', onMove, { capture: true });
    canvas.addEventListener('pointerup', onUp, { capture: true });
    canvas.addEventListener('pointercancel', onCancel, { capture: true });
    window.addEventListener('keydown', onKey);
    const ro = new ResizeObserver(([e]) => {
      if (!e || !e.contentRect.width || !e.contentRect.height) return;
      const { width: bw, height: bh } = e.contentRect;
      renderer.setSize(bw, bh, false);
      // Follow the box shape so the cloud is never stretched (it was fixed to the photo aspect).
      const fit = fitCamera(image.width, image.height, bw, bh);
      camera.aspect = fit.aspect;
      camera.fov = fit.vfovDeg;
      camera.updateProjectionMatrix();
      setCameraAspect(fit.aspect);
      render();
    });
    if (boxRef.current) ro.observe(boxRef.current);
    three.current = { renderer, scene, camera, controls, render };
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true });
      canvas.removeEventListener('pointermove', onMove, { capture: true });
      canvas.removeEventListener('pointerup', onUp, { capture: true });
      canvas.removeEventListener('pointercancel', onCancel, { capture: true });
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      controls.dispose();
      // The canvas and its GL context outlive this renderer (a new photo, StrictMode). Put back the
      // unpack flags the textures left set, or the next renderer's start-up 3D textures trip WebKit
      // ("texImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't allowed").
      const gl = renderer.getContext();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      renderer.dispose();
      three.current = null;
    };
  }, [webgl2, image]);

  // Geometry: rebuilt when the cloud changes.
  useEffect(() => {
    const t = three.current;
    if (!t || !cloud || !groups || !ready) return;
    const f = intrinsics(image.width, image.height).f;
    const stride = pickStride(image.width, image.height, budget, groups.route.length);
    const dot = dotTexture();
    const make = (idx: Int32Array, size: number) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(reposition(idx, ready, relief), 3));
      g.setAttribute(
        'color',
        new BufferAttribute(shade(recolor(idx, image.pixels), idx, ready.normals), 3),
      );
      return new Points(
        g,
        new PointsMaterial({
          size,
          vertexColors: true,
          sizeAttenuation: true,
          map: dot,
          alphaTest: 0.5,
        }),
      );
    };
    // Round dots overlap a little more than squares did, so the surface reads as closed.
    const wall = make(groups.wall, pointSize(stride, f) * 1.35);
    const route = make(groups.route, pointSize(1, f) * 2.5);
    const dots = cloudStyle === 'dots';
    wall.visible = dots;
    route.visible = dots;
    t.scene.add(wall, route);
    const target = routeTarget(cloud.positions, cloud.sizes);
    objects.current = { wall, route, target };
    t.camera.position.set(0, 0, 0);
    t.controls.target.set(...target);
    t.controls.update();
    t.render();
    return () => {
      t.scene.remove(wall, route);
      for (const p of [wall, route]) {
        p.geometry.dispose();
        (p.material as PointsMaterial).dispose();
      }
      dot.dispose();
      objects.current = null;
    };
    // Relief is applied by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, groups, ready, image, budget]);

  // Colors: Route (composite) or Photo; only the color attribute changes.
  useEffect(() => {
    const t = three.current;
    const o = objects.current;
    if (!t || !o || !groups) return;
    const src = colorMode === 'route' && composite ? composite : image.pixels;
    const normals = ready?.normals;
    const paint = (idx: Int32Array) => {
      const c = recolor(idx, src);
      return normals ? shade(c, idx, normals) : c;
    };
    o.wall.geometry.setAttribute('color', new BufferAttribute(paint(groups.wall), 3));
    o.route.geometry.setAttribute('color', new BufferAttribute(paint(groups.route), 3));
    t.render();
  }, [colorMode, composite, groups, image, ready]);

  // Surface style: show the mesh (built in the memo above) and hide the dots.
  useEffect(() => {
    const t = three.current;
    const o = objects.current;
    if (!t || !o) return;
    o.wall.visible = !surface;
    o.route.visible = !surface;
    if (!surface) {
      t.render();
      return;
    }
    const g = new BufferGeometry();
    g.setAttribute('color', new BufferAttribute(surface.colors, 3));
    g.setIndex(new BufferAttribute(surface.index, 1));
    const mesh = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    surfaceMesh.current = mesh;
    t.scene.add(mesh);
    return () => {
      surfaceMesh.current = null;
      t.scene.remove(mesh);
      g.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    };
  }, [surface, groups]);

  // Surface relief: only the position buffer changes. Declared after the mesh effect so a new mesh
  // gets its positions in the same commit.
  useEffect(() => {
    const t = three.current;
    const mesh = surfaceMesh.current;
    if (!t || !mesh || !surfacePos) return;
    mesh.geometry.setAttribute('position', new BufferAttribute(surfacePos, 3));
    mesh.geometry.computeBoundingSphere();
    t.render();
  }, [surface, surfacePos]);

  // Relief: only positions change.
  useEffect(() => {
    const t = three.current;
    const o = objects.current;
    if (!t || !o || !groups || !ready) return;
    o.wall.geometry.setAttribute(
      'position',
      new BufferAttribute(reposition(groups.wall, ready, relief), 3),
    );
    o.route.geometry.setAttribute(
      'position',
      new BufferAttribute(reposition(groups.route, ready, relief), 3),
    );
    t.render();
  }, [relief, groups, ready]);

  // Force arrows and numbered badges (drawn by the overlay on every render).
  useEffect(() => {
    const t = three.current;
    if (!t || !ready || !cloud) return;
    const list = annotations(holds, geometry, ready, relief, forces);
    const emphasis = new Map<string, Emphasis>();
    for (const [id, f] of forces) {
      const e = forceEmphasis(f);
      if (e) emphasis.set(id, e);
    }
    const climber = stance?.stance
      ? { state: stance, toWorld: wallToWorld(ready, relief, stance.contacts) }
      : null;
    overlay.current = { list, emphasis, showArrows, focusedId, climber };
    setMarks({
      forces: showArrows ? list.filter((a) => a.force).length : 0,
      badges: list
        .flatMap((a) => (a.label ? [a.label] : []))
        .sort()
        .join(','),
    });
    t.render();
  }, [holds, geometry, forces, ready, relief, showArrows, cloud, focusedId, stance]);

  const resetView = () => {
    const t = three.current;
    const o = objects.current;
    if (!t) return;
    t.camera.position.set(0, 0, 0);
    t.controls.target.set(...(o?.target ?? [0, 0, -1]));
    t.controls.update();
    t.render();
  };

  if (!webgl2) {
    return (
      <p role="alert" className="error">
        3D view needs WebGL2, which this browser doesn’t support.
      </p>
    );
  }

  return (
    <div className="cloud">
      <div
        ref={boxRef}
        className="cloud-box"
        style={{
          aspectRatio: `${image.width} / ${image.height}`,
          // Keep the photo's shape when the stage height cap applies.
          width: `min(100%, calc(var(--stage-max-h) * ${image.width / image.height}))`,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label="3D point cloud of the wall"
          role="img"
          data-point-count={cloud?.count ?? 0}
          data-camera={camera}
          data-style={cloudStyle}
          data-triangles={surface ? surface.index.length / 3 : 0}
          data-camera-aspect={cameraAspect.toFixed(4)}
          data-force-arrows={marks.forces}
          data-badges={marks.badges}
        />
        <canvas ref={overlayRef} className="cloud-overlay" aria-hidden="true" />
        {!ready && <p className="cloud-wait">Waiting for depth…</p>}
      </div>
      <div className="cloud-controls">
        <div role="radiogroup" aria-label="3D style" className="segmented">
          {(['dots', 'surface'] as const).map((m) => (
            <label key={m} className={cloudStyle === m ? 'active' : ''}>
              <input
                type="radio"
                name="cloud-style"
                checked={cloudStyle === m}
                onChange={() => setCloudStyle(m)}
              />
              {m === 'dots' ? 'Dots' : 'Surface'}
            </label>
          ))}
        </div>
        <div role="radiogroup" aria-label="Point colors" className="segmented">
          {(['route', 'photo'] as const).map((m) => (
            <label key={m} className={colorMode === m ? 'active' : ''}>
              <input
                type="radio"
                name="cloud-colors"
                checked={colorMode === m}
                onChange={() => setColorMode(m)}
              />
              {m === 'route' ? 'Route colors' : 'Photo colors'}
            </label>
          ))}
        </div>
        <label className="relief">
          Relief
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={relief}
            onChange={(e) => setRelief(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={resetView}>
          Reset view
        </button>
      </div>
      <p className="cloud-hint">
        Drag a ring to aim a hold’s pull (turn the view to aim into the wall) · drag elsewhere to
        orbit · pinch or scroll to zoom · two fingers or right-drag to pan
      </p>
    </div>
  );
}
