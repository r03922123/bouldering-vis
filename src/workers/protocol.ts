// Typed messages between the main thread and the ML worker (SPEC.md › Tech Stack).
import type { WallFootholds } from '../modules/climber-stance/worker';

export interface Point {
  x: number;
  y: number;
}

/** A hold the worker isolated from one tap; the main thread adds image, role and order. */
export interface DecodedHold {
  id: string;
  /** 0/1, row-major, width*height of the working image. */
  mask: Uint8Array;
  bbox: { x: number; y: number; w: number; h: number };
  centroid: { x: number; y: number };
  /** Pixel count. */
  area: number;
  tapPoint: Point;
}

export type MlRequest =
  | { type: 'sam:embed'; imageId: string; pixels: ImageData }
  | {
      type: 'sam:decode';
      imageId: string;
      point: Point;
      /** Ids of the holds currently selected, so the new mask never overlaps them. */
      selected: string[];
      /** The highest `seq` the main thread has received: holds up to it that are not in `selected` were deselected. */
      seen: number;
    }
  /** The raw SAM candidates for a tap (dev harnesses only; the app uses sam:decode). */
  | { type: 'sam:candidates'; imageId: string; point: Point }
  | { type: 'depth:run'; imageId: string; pixels: ImageData }
  | { type: 'clip:embed'; imageId: string; holdId: string; crop: ImageData }
  | { type: 'wall:segment'; imageId: string; pixels: ImageData }
  /** The wall mask's blobs as foot candidates (SPEC-climber-stance, Amendment 2026-10-31 (b)). */
  | { type: 'wall:footholds'; imageId: string; pixels: ImageData }
  /** Download (load) the depth and hold-type models in the background, without running them. */
  | { type: 'models:prefetch'; imageId: string };

export type RequestType = MlRequest['type'];

export interface ResponseMap {
  'sam:embed': { type: 'sam:ready'; imageId: string };
  /** The finished hold (picked, cleaned, measured in the worker), or null for a miss. */
  'sam:decode': { type: 'sam:hold'; imageId: string; seq: number; hold: DecodedHold | null };
  'sam:candidates': { type: 'sam:masks'; imageId: string; masks: Uint8Array[]; scores: number[] };
  'depth:run': {
    type: 'depth:result';
    imageId: string;
    /** w·h, normalized 0–1, 1 = nearest (relative). */
    depth: Float32Array;
    /** 3·w·h unit normals, +x right, +y down, +z toward the viewer. */
    normals: Float32Array;
    /** 1 where depth jumps to a neighbour; lets the point cloud drop streaks cheaply. */
    discontinuities: Uint8Array;
    width: number;
    height: number;
  };
  'clip:embed': { type: 'clip:embedding'; holdId: string; embedding: Float32Array };
  'wall:segment': { type: 'wall:mask'; imageId: string; mask: Uint8Array };
  'wall:footholds': { type: 'wall:blobs'; imageId: string; footholds: WallFootholds };
  'models:prefetch': { type: 'models:ready' };
}

export type RequestOf<K extends RequestType> = Extract<MlRequest, { type: K }>;

export type ModelId = 'sam' | 'depth' | 'clip';

export interface Progress {
  model: ModelId;
  /** The file being downloaded (a model has several). */
  file?: string;
  loaded: number;
  total: number;
}

export interface ToWorker {
  id: number;
  req: MlRequest;
}

export type FromWorker =
  | { kind: 'response'; id: number; ok: true; res: ResponseMap[RequestType] }
  | { kind: 'response'; id: number; ok: false; error: string }
  | { kind: 'progress'; progress: Progress };

/** Anything with a Worker-style postMessage: a Worker, a worker's `self`, or a test channel. */
export interface Endpoint<T> {
  postMessage(message: T, transfer?: Transferable[]): void;
}
