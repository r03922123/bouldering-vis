import { useCallback, useEffect, useMemo, useState } from 'react';
import { toWallFeet } from '../modules/beta-moves';
import { defaultClimberHeight, useWallFootholds } from '../modules/climber-stance';
import { useDepth } from '../modules/depth-estimation';
import { placesFor, type Profile } from '../modules/gym-hub';
import { useClassification } from '../modules/hold-classification';
import { routeStatus } from '../modules/hold-segmentation';
import { SAMPLES } from '../modules/image-input';
import { PlayScreen, type PlayWall } from '../modules/play-shell';
import { useAppStore } from '../store/app';
import { useProfileStore } from '../store/profile';
import { getMl } from './ml';
import { LEVELS, loadLevel, MY_WALL, routeHoldsFrom } from './playWall';
import { routeHash } from './route';
import { useRouteHolds } from './useRouteHolds';

type LevelState = { url: string; wall: PlayWall | null; done: boolean };

/** The wall's baked level, fetched once per URL. `done` with no wall: none, or it failed (→ Tag). */
function useLevel(url: string | null): { wall: PlayWall | null; done: boolean } {
  const [saved, setSaved] = useState<LevelState | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadLevel(url).then(
      (wall) => live && setSaved({ url, wall, done: true }),
      () => live && setSaved({ url, wall: null, done: true }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  if (!url) return { wall: null, done: true };
  return saved?.url === url ? saved : { wall: null, done: false };
}

/**
 * The analysis the Studio runs once a route is chosen (hold types first, then depth), plus the wall
 * footholds, for a route tagged in Play. Mounted by Root while the Setting Room isn't, so the two
 * never post the same jobs twice.
 */
export function PlayAnalysis() {
  useClassification(getMl());
  useDepth(getMl());
  useWallFootholds(getMl());
  return null;
}

/**
 * App-level wiring for #/wall/<id> (SPEC-play-shell S2–S4, S9): the level or the tagged route, the
 * photo in the store and the climber's size, passed into play-shell as data.
 */
export function PlayRoute({
  wallId,
  profile,
  onBack,
}: {
  wallId: string;
  profile: Profile;
  onBack?: () => void;
}) {
  const levelUrl = LEVELS[wallId] ?? null;
  const level = useLevel(levelUrl);
  // Load on demand: a baked level needs no model, so its wall never starts the ML worker. Only a
  // wall that has no level, or whose level failed to load, opens in Tag and needs it.
  const needsMl = !levelUrl || (level.done && !level.wall);
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  const scale = useAppStore((s) => s.climberScale);
  const wallAngle = useAppStore((s) => s.wallAngle);
  const footholds = useAppStore((s) => s.wallFootholds);
  const footholdsStatus = useAppStore((s) => s.wallFootholdsStatus);
  const depthState = useAppStore((s) => s.depthStatus.state);
  const { types, forces, wallNormals } = useRouteHolds();
  const depth = useAppStore((s) => s.depth);
  const depthStatus = useAppStore((s) => s.depthStatus);

  // "My wall" is whatever photo is in the store (S14); a sample wall needs its own photo.
  const mine = wallId === MY_WALL;
  const photoReady = !!image && (mine || image.sampleId === wallId);
  const tagReady = routeStatus(holds).complete;
  // Plan waits for depth (forces, wall normals) and the footholds, done or failed.
  const settled =
    (depthState === 'ready' || depthState === 'error') &&
    (footholdsStatus === 'ready' || footholdsStatus === 'error');
  const tagged = useMemo<PlayWall | null>(() => {
    if (!image || !photoReady || !tagReady || !settled) return null;
    const height = defaultClimberHeight(image) * scale;
    return {
      holds: routeHoldsFrom(holds, types, forces, wallNormals),
      wallFeet: toWallFeet(footholds, height),
      height,
      wallAngleDeg: wallAngle,
      photo: { width: image.width, height: image.height },
    };
  }, [
    image,
    photoReady,
    tagReady,
    settled,
    scale,
    holds,
    types,
    forces,
    wallNormals,
    footholds,
    wallAngle,
  ]);

  // H2: the photo's depth for the 3D view on a baked level, once, and never twice at a time.
  const requestDepth = useCallback(() => {
    const st = useAppStore.getState();
    const img = st.image;
    if (!img || st.depth?.imageId === img.id || st.depthStatus.state === 'running') return;
    st.setDepthStatus({ state: 'running' });
    const isCurrent = () => useAppStore.getState().image?.id === img.id;
    getMl()
      .request({ type: 'depth:run', imageId: img.id, pixels: img.pixels })
      .then(
        (r) => isCurrent() && useAppStore.getState().setDepth({ ...r, imageId: r.imageId }),
        (err: unknown) =>
          isCurrent() &&
          useAppStore.getState().setDepthStatus({
            state: 'error',
            message: err instanceof Error ? err.message : String(err),
          }),
      );
  }, []);

  // E1: a tagged hold's mask keeps a moved grip point on the hold (a baked level uses its box).
  const holdShapes = useMemo(
    () =>
      new Map(
        holds.map((h) => [h.id, { bbox: h.bbox, mask: h.mask, width: image?.width }] as const),
      ),
    [holds, image],
  );

  const title = mine
    ? 'My wall'
    : (placesFor(profile.level, SAMPLES).find((p) => p.sampleId === wallId)?.label ?? 'Wall');

  if (mine && !image) {
    return (
      <p role="status" className="play-kept">
        No photo yet. Choose one at the <a href={routeHash({ name: 'gym' })}>gym</a>’s New wall
        door.
      </p>
    );
  }

  return (
    <PlayScreen
      key={wallId}
      wallId={wallId}
      title={title}
      profile={profile}
      onBack={onBack}
      client={needsMl ? getMl() : null}
      photo={photoReady && level.done ? image : null}
      level={level.wall}
      tagged={tagged}
      tagReady={tagReady}
      footholds={footholdsStatus === 'ready' ? footholds : null}
      holdShapes={level.wall ? undefined : holdShapes}
      // H2: the worker only when the 3D view first asks for depth (its model).
      ml={getMl}
      depth3d={{ ready: !!image && depth?.imageId === image.id, status: depthStatus }}
      // Review finding 1: only a baked level may ask, since its referee input is the level file.
      onRequestDepth={level.wall ? requestDepth : undefined}
      onSetAid={useProfileStore.getState().setAid}
      // The same photo and route, in the Setting Room (S14).
      onOpenStudio={() => {
        window.location.hash = routeHash({ name: 'studio' });
      }}
      onPlan={() => {
        // The Studio starts its analysis on leaving Original, and its footholds with the climber.
        useAppStore.setState({ analysisTriggered: true });
        useAppStore.getState().setShowClimber(true);
      }}
    />
  );
}
