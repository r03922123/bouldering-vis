export interface Sample {
  id: string;
  name: string;
  /** Served from public/samples/ (public on the deployed site). */
  url: string;
  /**
   * Photo pixels per cm on the wall at `refWidth`, measured from climbers' videos
   * (SPEC-climber-stance › Amendment: Default Climber Size).
   */
  scale?: { pxPerCm: number; refWidth: number };
}

/**
 * Built-in wall photos the user can try without their own photo (SPEC-image-input › Amendments).
 * One ships: Wall 2, the owner's photo (ADR-0002; SPEC-launch-wall-2 R1 removed Wall 1). `name`
 * is also its bay's name in the gym and Play's title. Its scale is the owner's estimate (ADR-0002
 * (f) as amended 2026-11-06): its grey section, about 1.7 m, is about 365 px tall at 816 px wide.
 * The width-based default made a 212 px climber that couldn't move.
 */
export const SAMPLES: readonly Sample[] = [
  {
    id: 'wall-b',
    name: 'Wall 2',
    url: '/samples/wall-b.jpg',
    scale: { pxPerCm: 2.15, refWidth: 816 },
  },
];

export const DEFAULT_SAMPLE_ID = 'wall-b';
