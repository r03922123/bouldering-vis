import {
  canHook,
  LIMBS,
  reachRatios,
  solveStance,
  type ReachResult,
  type Stance,
  type StanceContacts,
  type Vec3,
} from '../climber-stance';
import { quantiseContacts } from './contacts';
import { qPoint } from './context';
import { CACHE_CAPACITY, type StanceCache } from './types';

// SPEC-beta-moves B14: an LRU of solves and reach results, keyed by the quantised solver inputs.
// Hold ids are never part of a key, and inputs are quantised before solving, so a hit always gives
// what a fresh solve would.

class Lru implements StanceCache {
  readonly #map = new Map<string, unknown>();
  #hits = 0;
  #misses = 0;
  readonly #capacity: number;

  constructor(capacity: number) {
    if (!(capacity >= 1)) throw new RangeError('The cache needs room for at least one entry');
    this.#capacity = Math.floor(capacity);
  }

  get size() {
    return this.#map.size;
  }
  get hits() {
    return this.#hits;
  }
  get misses() {
    return this.#misses;
  }

  lookup<T>(key: string, make: () => T): T {
    if (this.#map.has(key)) {
      const v = this.#map.get(key) as T;
      // Most recently used goes last.
      this.#map.delete(key);
      this.#map.set(key, v);
      this.#hits++;
      return v;
    }
    this.#misses++;
    const v = make();
    this.#map.set(key, v);
    if (this.#map.size > this.#capacity) this.#map.delete(this.#map.keys().next().value!);
    return v;
  }
}

export function createStanceCache(capacity: number = CACHE_CAPACITY): StanceCache {
  return new Lru(capacity);
}

function lru(cache: StanceCache): Lru {
  if (!(cache instanceof Lru)) throw new TypeError('Use createStanceCache() for the cache');
  return cache;
}

/** The solver inputs, without hold ids. */
function contactsKey(contacts: StanceContacts): unknown[] {
  return LIMBS.map((l) => {
    const c = contacts[l];
    // A hook the solver honours changes the stance (SPEC-climber-stance M3; Play gets hooks in R2).
    const hook = c?.hook && canHook(l, c) ? c.hook : null;
    return c ? [c.point, c.type, c.dir, c.surface ?? null, hook] : null;
  });
}

interface SolveOptions {
  height: number;
  wallAngleDeg: number;
}

/** solveStance without the region (A4), through the cache. */
export function cachedSolve(
  cache: StanceCache,
  contacts: StanceContacts,
  opts: SolveOptions,
): Stance {
  const q = quantiseContacts(contacts);
  const height = qPoint(opts.height);
  const key = JSON.stringify(['S', height, opts.wallAngleDeg, contactsKey(q)]);
  return lru(cache).lookup(key, () =>
    solveStance(q, { height, wallAngleDeg: opts.wallAngleDeg, region: false }),
  );
}

/** climber-stance's reachRatios (A3), through the cache; the box's pelvis is quantised too. */
export function cachedReach(
  cache: StanceCache,
  stay: StanceContacts,
  moving: StanceContacts,
  opts: SolveOptions,
  around: { pelvis: Vec3; radius: number } | null,
): ReachResult {
  const qs = quantiseContacts(stay);
  const qm = quantiseContacts(moving);
  const height = qPoint(opts.height);
  const box = around && {
    pelvis: around.pelvis.map(qPoint) as Vec3,
    radius: qPoint(around.radius),
  };
  const key = JSON.stringify([
    'R',
    height,
    opts.wallAngleDeg,
    contactsKey(qs),
    contactsKey(qm),
    box && [box.pelvis, box.radius],
  ]);
  return lru(cache).lookup(key, () =>
    reachRatios(qs, qm, { height, wallAngleDeg: opts.wallAngleDeg }, box),
  );
}
