import { COLOR, type PaletteIndex } from './palette';

// SPEC-pixel-kit › The Climber › Outfit slots, Launch outfits and Look. `progression` decides when
// outfits unlock and saves the player's look; this module only holds the data.

export type OutfitId = 'starter' | 'sunset' | 'moss' | 'chalkdust';

export interface Outfit {
  id: OutfitId;
  name: string;
  hat: PaletteIndex;
  band: PaletteIndex;
  top: PaletteIndex;
  bottoms: PaletteIndex;
  shoes: PaletteIndex;
  bag: PaletteIndex;
  sleeves: 'tank' | 'tee' | 'long';
  legs: 'shorts' | 'pants';
}

export interface Look {
  skin: PaletteIndex;
  hair: PaletteIndex;
}

export const OUTFITS: Readonly<Record<OutfitId, Outfit>> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    hat: COLOR.brick,
    band: COLOR.chalk,
    top: COLOR.tide,
    bottoms: COLOR.slate,
    shoes: COLOR.ember,
    bag: COLOR.sun,
    sleeves: 'tee',
    legs: 'pants',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    hat: COLOR.ember,
    band: COLOR.brick,
    top: COLOR.bloom,
    bottoms: COLOR.brick,
    shoes: COLOR.navy,
    bag: COLOR.tide,
    sleeves: 'tee',
    legs: 'shorts',
  },
  moss: {
    id: 'moss',
    name: 'Moss',
    hat: COLOR.leaf,
    band: COLOR.lime,
    top: COLOR.sun,
    bottoms: COLOR.leaf,
    shoes: COLOR.slate,
    bag: COLOR.bloom,
    sleeves: 'tank',
    legs: 'pants',
  },
  chalkdust: {
    id: 'chalkdust',
    name: 'Chalkdust',
    hat: COLOR.chalk,
    band: COLOR.slate,
    top: COLOR.chalk,
    bottoms: COLOR.slate,
    shoes: COLOR.brick,
    bag: COLOR.lime,
    sleeves: 'long',
    legs: 'pants',
  },
};

export const SKIN_TONES: readonly PaletteIndex[] = [COLOR.skinLight, COLOR.skinMid, COLOR.skinDeep];

export const HAIR_COLORS: readonly PaletteIndex[] = [
  COLOR.ink,
  COLOR.dusk,
  COLOR.brick,
  COLOR.sun,
  COLOR.skinDeep,
];

export const DEFAULT_LOOK: Look = { skin: COLOR.skinMid, hair: COLOR.dusk };
