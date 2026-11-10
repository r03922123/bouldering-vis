import { Suspense, useCallback, useMemo, useState } from 'react';
import {
  errorMessage,
  ImageInput,
  type ImageInputError,
  type WorkingImage,
} from '../modules/image-input';
import { DepthLegend, DepthStatusLine, useDepth, useDepthImage } from '../modules/depth-estimation';
import { Credits, HoldCard, useClassification } from '../modules/hold-classification';
import { drawForceArrows, DirectionControl } from '../modules/hold-geometry';
import {
  drawStance,
  flatProjection,
  layoutStance,
  StancePanel,
  useStance,
  useWallFootholds,
} from '../modules/climber-stance';
import { HoldList, RouteSteps, SelectionCanvas } from '../modules/hold-segmentation';
import { PointCloudView } from '../modules/point-cloud-view';
import {
  chalkLabel,
  useChalk,
  useChalkOverlay,
  useComposite,
  useWallMask,
  ViewToggles,
} from '../modules/route-compositor';
import { useAppStore } from '../store/app';
import { LoadingStatus } from './LoadingStatus';
import { getMl } from './ml';
import { useModelPreload } from './useModelPreload';
import { useRouteHolds } from './useRouteHolds';

export function App() {
  const image = useAppStore((s) => s.image);
  const hasRoute = useAppStore((s) => s.holds.length > 0);
  const setImage = useAppStore((s) => s.setImage);
  const view = useAppStore((s) => s.view);
  const composite = useComposite(useWallMask(getMl()));
  const chalk = useChalk();
  const chalkOverlay = useChalkOverlay(chalk);
  const overlays = useMemo(() => [chalkOverlay], [chalkOverlay]);
  // Order matters: effects run in declaration order, and the worker can't interrupt a running job.
  // Hold types are posted first so the cards fill in before the depth map (Cairn review I1).
  useClassification(getMl());
  useDepth(getMl());
  useModelPreload(getMl());
  // The climber's feet: the wall mask's blobs, asked for once the climber is shown.
  useWallFootholds(getMl());
  const depthImage = useDepthImage();
  const base = view === 'route' ? composite : view === 'depth' ? depthImage : null;
  const holds = useAppStore((s) => s.holds);
  const showArrows = useAppStore((s) => s.showArrows);
  const { geometry, types, forces, wallNormals } = useRouteHolds();
  const stance = useStance(types, forces, wallNormals);
  const drawExtras = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      toScreen: (p: { x: number; y: number }) => { x: number; y: number },
    ) => {
      if (showArrows) drawForceArrows(ctx, holds, forces, toScreen);
      // The climber is part of the clean Route picture (SPEC-climber-stance S13).
      const layout =
        view === 'route' && stance.stance
          ? layoutStance(stance.stance, stance.contacts, stance.height, flatProjection(toScreen))
          : null;
      if (layout) drawStance(ctx, layout);
    },
    [showArrows, holds, forces, view, stance],
  );
  const [pending, setPending] = useState<WorkingImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onLoad = useCallback(
    (img: WorkingImage) => {
      setError(null);
      if (hasRoute) setPending(img);
      else setImage(img);
    },
    [hasRoute, setImage],
  );
  const onError = useCallback((err: ImageInputError) => setError(errorMessage(err)), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Bouldering Vis</h1>
      </header>
      <main className="app-main">
        <ImageInput onLoad={onLoad} onError={onError} compact={image !== null} />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {pending && (
          <div role="alertdialog" aria-labelledby="replace-title" className="confirm">
            <p id="replace-title">Load the new photo? This clears your route.</p>
            <button
              onClick={() => {
                setImage(pending);
                setPending(null);
              }}
            >
              Replace photo
            </button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        )}
        {image && (
          <div className="workspace">
            <div className="toolbar-area">
              <ViewToggles />
            </div>
            <section
              className="stage"
              aria-label="Wall"
              data-climber={view === 'route' && stance.stance ? 'shown' : undefined}
            >
              {/* Floats over the photo so downloads starting and finishing never move it mid-tap. */}
              <div className="stage-status">
                <LoadingStatus />
                <DepthStatusLine />
              </div>
              {view === '3d' ? (
                <Suspense fallback={<p role="status">Loading 3D view…</p>}>
                  <PointCloudView
                    composite={composite}
                    geometry={geometry}
                    forces={forces}
                    stance={stance}
                  />
                </Suspense>
              ) : (
                <SelectionCanvas
                  client={getMl()}
                  base={base}
                  addHint={view === 'original' ? null : 'Switch to Original to add holds.'}
                  overlays={overlays}
                  drawExtras={drawExtras}
                />
              )}
              {view === 'depth' && <DepthLegend />}
            </section>
            <aside className="inspector" aria-label="Route">
              <RouteSteps />
              <StancePanel state={stance} />
              <HoldList
                rowExtra={(h) => {
                  const c = chalk.get(h.id);
                  const f = forces.get(h.id);
                  return (
                    <HoldCard
                      holdId={h.id}
                      details={c ? chalkLabel(c.level) : undefined}
                      direction={f && <DirectionControl holdId={h.id} force={f} />}
                    />
                  );
                }}
              />
            </aside>
          </div>
        )}
      </main>
      <footer className="app-footer">
        <Credits />
      </footer>
    </div>
  );
}
