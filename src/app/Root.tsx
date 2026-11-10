import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { HubScreen, type Place } from '../modules/gym-hub';
import {
  ACCEPTED_TYPES,
  errorMessage,
  ImageInputException,
  loadImage,
  SAMPLES,
  type WorkingImage,
} from '../modules/image-input';
import { useAppStore } from '../store/app';
import { playProfile, useProfileStore } from '../store/profile';
import { PlayBoundary } from './PlayBoundary';
import { MY_WALL, playRouteFor } from './playWall';
import { canonicalHash, FRONT_WALL, parseRoute, routeHash, useRoute, type Route } from './route';
import { loadSampleImage } from './sampleImage';

// The Studio loads on the first visit to the Setting Room, and Play on the first visit to a wall, so
// the gym's first paint never waits for either bundle (SPEC-gym-hub G11).
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
const PlayRoute = lazy(() => import('./PlayRoute').then((m) => ({ default: m.PlayRoute })));
const PlayAnalysis = lazy(() => import('./PlayRoute').then((m) => ({ default: m.PlayAnalysis })));

const backToGym = () => {
  window.location.hash = routeHash({ name: 'gym' });
};

function routeFor(place: Place): Route | null {
  if (place.kind === 'bay' && place.sampleId) return { name: 'wall', id: place.sampleId };
  if (place.kind === 'setting-room') return { name: 'studio' };
  return null;
}

/**
 * The New wall door (SPEC-play-shell S14): a photo picker, then the photo in the store (in memory
 * only; nothing is uploaded) and #/wall/mine in Tag. A route on another photo is only replaced
 * after a confirm, as in the Studio.
 */
function useNewWall() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<WorkingImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = (img: WorkingImage) => {
    setPending(null);
    useAppStore.getState().setImage(img);
    window.location.hash = routeHash({ name: 'wall', id: MY_WALL });
  };
  const load = async (file: File) => {
    setError(null);
    // A slow decode never pulls the player back: if they have moved on, the photo is dropped.
    const from = window.location.hash;
    try {
      const img = await loadImage(file, file.name);
      if (window.location.hash !== from) return;
      if (useAppStore.getState().holds.length) setPending(img);
      else open(img);
    } catch (err) {
      if (window.location.hash !== from) return;
      setError(
        errorMessage(err instanceof ImageInputException ? err.detail : { kind: 'decode-failed' }),
      );
    }
  };
  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPTED_TYPES.join(',')}
      aria-label="Choose a wall photo"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void load(file);
      }}
    />
  );
  return {
    picker,
    pick: () => input.current?.click(),
    pending,
    error,
    open,
    cancel: () => setPending(null),
  };
}

/**
 * #/wall/<sample> puts that sample's photo in the store for the Play screen (SPEC-play-shell C5).
 * A route on another photo is only replaced after a confirm.
 */
/** Bumped on every hash change: one navigation is one visit (set from the event, never in render). */
function useVisitCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const onHash = () => setCount((n) => n + 1);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return count;
}

interface Visit {
  /** The wall and the navigation this visit belongs to. */
  key: string;
  confirmed: boolean;
  kept: boolean;
  failed: boolean;
}

function useWallSample(route: Route) {
  const wallId = route.name === 'wall' ? route.id : null;
  const sample = SAMPLES.find((s) => s.id === wallId) ?? null;
  const imageSampleId = useAppStore((s) => s.image?.sampleId);
  const hasRoute = useAppStore((s) => s.holds.length > 0);
  // Answers to the confirm, and a failed load, belong to one visit: one navigation to one wall.
  // Leaving and coming back is a new visit, which asks again and retries. State saved for another
  // visit simply doesn't apply. (No reset during render: with useSyncExternalStore in the same
  // tree, a render-phase update made React miss the next hash change.)
  const key = `${useVisitCount()}:${wallId}`;
  const fresh = (): Visit => ({ key, confirmed: false, kept: false, failed: false });
  const [saved, setVisit] = useState<Visit>(fresh);
  const visit = saved.key === key ? saved : fresh();
  const update = (change: Partial<Visit>) => setVisit({ ...visit, ...change });

  const wanted = sample && imageSampleId !== sample.id && !visit.kept ? sample : null;
  const pending = wanted && hasRoute && !visit.confirmed ? wanted : null;
  const loadNow = wanted && !pending && !visit.failed ? wanted : null;

  useEffect(() => {
    if (!loadNow) return;
    let live = true;
    loadSampleImage(loadNow).then(
      (img) => live && useAppStore.getState().setImage(img),
      // A failure is this visit's alone, built from scratch: nothing carries over from another.
      () => live && setVisit({ key, confirmed: true, kept: false, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [loadNow, key]);

  return {
    pending,
    kept: !!sample && visit.kept && imageSampleId !== sample.id,
    error: visit.failed ? "Couldn't open that wall. Check your connection and try again." : null,
    confirm: () => update({ confirmed: true }),
    keep: () => update({ kept: true }),
  };
}

/** Which screens have been shown, so each mounts once and then stays (set from hash events). */
function useOpened(name: Route['name']) {
  const [opened, setOpened] = useState({
    gym: name === 'gym',
    studio: name === 'studio',
    wall: name === 'wall',
  });
  useEffect(() => {
    const onHash = () => {
      const key = parseRoute(window.location.hash).name;
      setOpened((o) => (o[key] ? o : { ...o, [key]: true }));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return opened;
}

/**
 * The app root (SPEC-game › Amendment (b); SPEC-launch-wall-2 R3): Wall 2's Play screen at #/,
 * the gym at #/gym, the Studio as the Setting Room at #/studio, a wall's Play screen at
 * #/wall/<id>. The gym and the Studio mount on their first visit
 * and then stay mounted, hidden while another screen shows, so the climber's spot (G13) and a
 * route built in the Setting Room both survive. Play mounts per visit: saving a plan is step 5.
 */
export function Root() {
  const route = useRoute();
  // C1: an unknown hash (or wall), and #/, show the front-door wall and are written back as its
  // hash. replaceState fires no hashchange, and the route already parsed as it, so nothing else
  // re-renders.
  useEffect(() => {
    const canon = canonicalHash(window.location.hash);
    if (canon) window.history.replaceState(null, '', canon);
  });
  const inGym = route.name === 'gym';
  const opened = useOpened(route.name);

  const profile = useProfileStore((s) => s.profile);
  const aids = useProfileStore((s) => s.aids);
  const wall = useWallSample(route);
  const newWall = useNewWall();
  const photo = useAppStore((s) => s.image);
  const routeHolds = useAppStore((s) => s.holds.length);
  const analysing = useAppStore((s) => s.analysisTriggered);
  // R3: the front-door wall has no visible way to the gym (still at #/gym), not even on a crash.
  const back = route.name === 'wall' && route.id === FRONT_WALL ? undefined : backToGym;

  return (
    <>
      {opened.gym && (
        <div hidden={!inGym}>
          <HubScreen
            profile={profile}
            samples={SAMPLES}
            // No level question for now (SPEC-gym-hub › Amendment 2026-11-02 W3, W5).
            onUse={(place) => {
              if (place.kind === 'new-wall') return newWall.pick();
              const next = routeFor(place);
              if (next) window.location.hash = routeHash(next);
            }}
          />
          {newWall.picker}
          {newWall.error && (
            <p role="alert" className="error play-kept">
              {newWall.error}
            </p>
          )}
          {newWall.pending && (
            <div role="alertdialog" aria-labelledby="new-wall-title" className="confirm">
              <p id="new-wall-title">Open this photo? This clears your route.</p>
              <button onClick={() => newWall.open(newWall.pending!)}>Open the photo</button>
              <button autoFocus onClick={newWall.cancel}>
                Keep my route
              </button>
            </div>
          )}
        </div>
      )}
      {route.name === 'studio' && (
        <nav className="room-bar" aria-label="Setting Room">
          {/* S14: the photo and its route carry across to Play, outside the Studio itself. */}
          {photo && <a href={routeHash(playRouteFor(photo, routeHolds))}>Play this wall</a>}
          <a href={routeHash({ name: 'gym' })}>
            <span aria-hidden="true">◀</span>Gym
          </a>
        </nav>
      )}
      {!inGym && wall.pending && (
        <div role="alertdialog" aria-labelledby="wall-replace-title" className="confirm">
          <p id="wall-replace-title">Open this wall? This clears your route.</p>
          <button onClick={wall.confirm}>Open the wall</button>
          {/* The safe answer has the focus. */}
          <button autoFocus onClick={wall.keep}>
            Keep my route
          </button>
        </div>
      )}
      {!inGym && wall.error && (
        <p role="alert" className="error">
          {wall.error}
        </p>
      )}
      {route.name === 'wall' && wall.kept && (
        <p role="status" className="play-kept">
          Your Setting Room route is still open. <a href={routeHash({ name: 'studio' })}>Open it</a>{' '}
          or go back to the <a href={routeHash({ name: 'gym' })}>gym</a>.
        </p>
      )}
      {route.name === 'wall' && !wall.kept && (
        <PlayBoundary key={route.id} onBack={back}>
          <Suspense fallback={<p role="status">Opening the wall…</p>}>
            <PlayRoute
              key={route.id}
              wallId={route.id}
              profile={playProfile({ profile, aids })}
              onBack={back}
            />
          </Suspense>
        </PlayBoundary>
      )}
      {/* The route analysis for walls tagged in Play, once a route is planned there, until the Setting
          Room (which runs its own) opens. Never on a baked level: nothing to analyse. */}
      {opened.wall && !opened.studio && analysing && (
        <Suspense fallback={null}>
          <PlayAnalysis />
        </Suspense>
      )}
      {opened.studio && (
        <div hidden={route.name !== 'studio'}>
          <Suspense fallback={<p role="status">Opening the Setting Room…</p>}>
            <App />
          </Suspense>
        </div>
      )}
    </>
  );
}
