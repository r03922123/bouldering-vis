export interface DepthMap {
  imageId: string;
  width: number;
  height: number;
  /** w·h, normalized 0–1, 1 = nearest (relative, unitless). */
  depth: Float32Array;
  /** 3·w·h unit vectors, +x right, +y down, +z toward the viewer. */
  normals: Float32Array;
  /** 1 where depth jumps to a neighbour (hold/wall edges); computed in the worker. */
  discontinuities?: Uint8Array;
}

export type DepthStatus =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ready' }
  | { state: 'error'; message: string };
