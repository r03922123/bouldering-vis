import type { HoldType } from './classify';

export const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Prompt ensembles per class; their averaged text embeddings ship as clip-text-embeddings.json. */
export const PROMPTS: Record<HoldType, string[]> = {
  jug: [
    'a photo of a jug climbing hold',
    'a large deep bucket-shaped climbing hold',
    'a big positive climbing hold you can wrap your whole hand around',
  ],
  crimp: [
    'a photo of a crimp climbing hold',
    'a small thin crimp on a bouldering wall',
    'a tiny climbing hold you grip with your fingertips',
  ],
  edge: [
    'a photo of an edge climbing hold',
    'a flat rail-like edge on a climbing wall',
    'a long narrow ledge climbing hold',
  ],
  sloper: [
    'a photo of a sloper climbing hold',
    'a round smooth sloping climbing hold with no edge',
    'a dome-shaped sloper on a bouldering wall',
  ],
  pinch: [
    'a photo of a pinch climbing hold',
    'a climbing hold you squeeze between thumb and fingers',
    'a narrow protruding pinch hold',
  ],
  pocket: [
    'a photo of a pocket climbing hold',
    'a climbing hold with a hole for one or two fingers',
    'a pocket hole in a climbing hold',
  ],
  volume: [
    'a photo of a climbing volume',
    'a large geometric volume bolted to a climbing wall',
    'a big triangular fiberglass volume on a bouldering wall',
  ],
  'foot-chip': [
    'a photo of a small foot chip on a climbing wall',
    'a tiny screw-on foothold on a bouldering wall',
    'a very small climbing foothold',
  ],
};
