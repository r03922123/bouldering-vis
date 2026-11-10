import { create } from 'zustand';
import type { DepthMap, DepthStatus } from '../modules/depth-estimation';
import type { ModelProgress } from '../app/modelProgress';
import type {
  Assignment,
  FeetMode,
  Hook,
  Limb,
  WallAngle,
  WallFootholds,
} from '../modules/climber-stance';
import type { PullOverride } from '../modules/hold-geometry';
import type { Progress } from '../workers/protocol';
import type { HoldType, StoredClassification } from '../modules/hold-classification';
import type { HoldMask } from '../modules/hold-segmentation';
import type { WorkingImage } from '../modules/image-input';

// Cross-module contract from SPEC.md: holds are added only in 'original'.
export type View = 'original' | 'route' | 'depth' | '3d';
export type SamStatus = 'idle' | 'preparing' | 'ready' | 'error';
export type WallFootholdsStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface AppState {
  image: WorkingImage | null;
  holds: HoldMask[];
  view: View;
  samStatus: SamStatus;
  showOtherHolds: boolean;
  showOutlines: boolean;
  showChalk: boolean;
  showArrows: boolean;
  /** 3D view options (point-cloud-view). */
  cloudColorMode: 'route' | 'photo';
  cloudStyle: 'dots' | 'surface';
  cloudRelief: number;
  /** Hold-vs-wall mask of the current image (route-compositor), computed on first Route view. */
  wallMask: Uint8Array | null;
  /**
   * The user has finished choosing holds (first non-Original view): start depth and CLIP.
   * Reset for each new image.
   */
  analysisTriggered: boolean;
  depth: DepthMap | null;
  depthStatus: DepthStatus;
  /** Bumped by Retry to re-run a failed depth job. */
  depthAttempt: number;
  /** CLIP result per hold id (hold-classification). */
  classifications: Record<string, StoredClassification>;
  /** User-picked type per hold id; wins over CLIP and survives re-classification. */
  classOverrides: Record<string, HoldType>;
  /** User-picked pull direction per hold id; wins over the computed force. */
  pullOverrides: Record<string, PullOverride>;
  /** climber-stance: hold per limb (null = automatic start position). Reset per image. */
  stanceAssignment: Assignment | null;
  /**
   * SPEC-climber-stance Amendment 2026-11-04, M3: a foot's hook, kept with the hold it hooks (it
   * applies only while that foot is on that hold). Reset per image and with the feet mode.
   */
  stanceHooks: Partial<Record<'lf' | 'rf', { holdId: string; hook: Hook }>>;
  /** Climber size relative to the default guess (S3). Reset per image. */
  climberScale: number;
  /** The wall's steepness; kept across photos (it's usually the same gym). */
  wallAngle: WallAngle;
  /** Draw the climber on the Route view. Reset per image. */
  showClimber: boolean;
  /** Feet on any wall foothold, or only on the route's holds. Route-level; reset per image. */
  feetMode: FeetMode;
  /** The wall mask's blobs as foot candidates (climber-stance), asked for once the climber shows. */
  wallFootholds: WallFootholds | null;
  wallFootholdsStatus: WallFootholdsStatus;
  /** The hold highlighted across the wall and the list, and which side focused it. */
  focusedHold: { id: string; from: 'list' | 'wall' } | null;
  /** Model download progress, per model and file (app-wide; not reset per image). */
  modelProgress: ModelProgress;
  setView: (view: View) => void;
  /** A new image makes every mask, depth map and classification invalid. */
  setImage: (image: WorkingImage) => void;
  setSamStatus: (status: SamStatus) => void;
  addHold: (hold: HoldMask) => void;
  removeHold: (id: string) => void;
  setHolds: (holds: HoldMask[]) => void;
  setShowOtherHolds: (on: boolean) => void;
  setShowOutlines: (on: boolean) => void;
  setShowChalk: (on: boolean) => void;
  setShowArrows: (on: boolean) => void;
  setCloudColorMode: (mode: 'route' | 'photo') => void;
  setCloudStyle: (style: 'dots' | 'surface') => void;
  setCloudRelief: (relief: number) => void;
  setWallMask: (mask: Uint8Array) => void;
  setDepth: (depth: DepthMap) => void;
  setDepthStatus: (status: DepthStatus) => void;
  retryDepth: () => void;
  setClassification: (c: StoredClassification) => void;
  setClassOverride: (holdId: string, type: HoldType | null) => void;
  setPullOverride: (holdId: string, pull: PullOverride | null) => void;
  setFocusedHold: (focus: { id: string; from: 'list' | 'wall' } | null) => void;
  setStanceAssignment: (a: Assignment | null) => void;
  setStanceHook: (foot: 'lf' | 'rf', holdId: string, hook: Hook | null) => void;
  setClimberScale: (scale: number) => void;
  setWallAngle: (angle: WallAngle) => void;
  setShowClimber: (on: boolean) => void;
  /** Also clears the user's assignment, so the toggle visibly re-picks the start position. */
  setFeetMode: (mode: FeetMode) => void;
  /** Stores the footholds and marks them ready. */
  setWallFootholds: (footholds: WallFootholds) => void;
  setWallFootholdsStatus: (status: WallFootholdsStatus) => void;
  recordProgress: (p: Progress) => void;
}

/** The assignment with every limb on hold `id` taken off the wall. */
function freeLimbs(a: Assignment, id: string): Assignment {
  const out = { ...a };
  for (const limb of Object.keys(out) as Limb[]) if (out[limb] === id) out[limb] = null;
  return out;
}

export const useAppStore = create<AppState>()((set) => ({
  image: null,
  holds: [],
  view: 'original',
  samStatus: 'idle',
  showOtherHolds: true,
  showOutlines: true,
  showChalk: true,
  showArrows: true,
  cloudColorMode: 'route',
  cloudStyle: 'dots',
  cloudRelief: 0.35,
  wallMask: null,
  analysisTriggered: false,
  depth: null,
  depthStatus: { state: 'idle' },
  depthAttempt: 0,
  classifications: {},
  classOverrides: {},
  pullOverrides: {},
  focusedHold: null,
  stanceAssignment: null,
  stanceHooks: {},
  climberScale: 1,
  wallAngle: 0,
  showClimber: false,
  feetMode: 'any',
  wallFootholds: null,
  wallFootholdsStatus: 'idle',
  modelProgress: {},
  setView: (view) =>
    set((s) => ({ view, analysisTriggered: s.analysisTriggered || view !== 'original' })),
  setImage: (image) =>
    set({
      image,
      holds: [],
      view: 'original',
      samStatus: 'idle',
      wallMask: null,
      analysisTriggered: false,
      depth: null,
      depthStatus: { state: 'idle' },
      classifications: {},
      classOverrides: {},
      pullOverrides: {},
      focusedHold: null,
      stanceAssignment: null,
      stanceHooks: {},
      climberScale: 1,
      showClimber: false,
      feetMode: 'any',
      wallFootholds: null,
      wallFootholdsStatus: 'idle',
    }),
  setSamStatus: (samStatus) => set({ samStatus }),
  addHold: (hold) => set((s) => ({ holds: [...s.holds, hold] })),
  removeHold: (id) =>
    set((s) => ({
      holds: s.holds.filter((h) => h.id !== id),
      focusedHold: s.focusedHold?.id === id ? null : s.focusedHold,
      stanceAssignment: s.stanceAssignment && freeLimbs(s.stanceAssignment, id),
    })),
  setHolds: (holds) => set({ holds }),
  setShowOtherHolds: (showOtherHolds) => set({ showOtherHolds }),
  setShowOutlines: (showOutlines) => set({ showOutlines }),
  setShowChalk: (showChalk) => set({ showChalk }),
  setShowArrows: (showArrows) => set({ showArrows }),
  setCloudColorMode: (cloudColorMode) => set({ cloudColorMode }),
  setCloudStyle: (cloudStyle) => set({ cloudStyle }),
  setCloudRelief: (cloudRelief) => set({ cloudRelief }),
  setWallMask: (wallMask) => set({ wallMask }),
  setDepth: (depth) => set({ depth, depthStatus: { state: 'ready' } }),
  setDepthStatus: (depthStatus) => set({ depthStatus }),
  retryDepth: () => set((s) => ({ depthAttempt: s.depthAttempt + 1 })),
  setClassification: (c) =>
    set((s) => ({ classifications: { ...s.classifications, [c.holdId]: c } })),
  setClassOverride: (holdId, type) =>
    set((s) => {
      const next = { ...s.classOverrides };
      if (type) next[holdId] = type;
      else delete next[holdId];
      return { classOverrides: next };
    }),
  setFocusedHold: (focusedHold) => set({ focusedHold }),
  setStanceAssignment: (stanceAssignment) => set({ stanceAssignment }),
  setStanceHook: (foot, holdId, hook) =>
    set((s) => {
      const next = { ...s.stanceHooks };
      if (hook) next[foot] = { holdId, hook };
      else delete next[foot];
      return { stanceHooks: next };
    }),
  setClimberScale: (climberScale) => set({ climberScale }),
  setWallAngle: (wallAngle) => set({ wallAngle }),
  setShowClimber: (showClimber) => set({ showClimber }),
  setFeetMode: (feetMode) => set({ feetMode, stanceAssignment: null, stanceHooks: {} }),
  setWallFootholds: (wallFootholds) => set({ wallFootholds, wallFootholdsStatus: 'ready' }),
  setWallFootholdsStatus: (wallFootholdsStatus) => set({ wallFootholdsStatus }),
  recordProgress: (p) =>
    set((s) => ({
      modelProgress: {
        ...s.modelProgress,
        [p.model]: {
          ...s.modelProgress[p.model],
          [p.file ?? 'model']: { loaded: p.loaded, total: p.total },
        },
      },
    })),
  setPullOverride: (holdId, pull) =>
    set((s) => {
      const next = { ...s.pullOverrides };
      if (pull) next[holdId] = pull;
      else delete next[holdId];
      return { pullOverrides: next };
    }),
}));
