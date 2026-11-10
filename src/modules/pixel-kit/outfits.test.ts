import { DEFAULT_LOOK, HAIR_COLORS, OUTFITS, SKIN_TONES } from './outfits';
import { COLOR, PALETTE, worstCaseContrast } from './palette';

// SPEC-pixel-kit › The Climber › Launch outfits and Look, AC 4.

describe('OUTFITS', () => {
  it('has the four launch outfits from the table', () => {
    expect(Object.keys(OUTFITS)).toEqual(['starter', 'sunset', 'moss', 'chalkdust']);
    expect(OUTFITS.starter).toEqual({
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
    });
    expect(OUTFITS.sunset).toMatchObject({
      hat: COLOR.ember,
      band: COLOR.brick,
      top: COLOR.bloom,
      bottoms: COLOR.brick,
      shoes: COLOR.navy,
      bag: COLOR.tide,
      sleeves: 'tee',
      legs: 'shorts',
    });
    expect(OUTFITS.moss).toMatchObject({
      hat: COLOR.leaf,
      band: COLOR.lime,
      top: COLOR.sun, // the contrasting slot, so moss is not all green (Check Results › AC 48)
      bottoms: COLOR.leaf,
      shoes: COLOR.slate,
      bag: COLOR.bloom,
      sleeves: 'tank',
      legs: 'pants',
    });
    expect(OUTFITS.chalkdust).toMatchObject({
      hat: COLOR.chalk,
      band: COLOR.slate,
      top: COLOR.chalk,
      bottoms: COLOR.slate,
      shoes: COLOR.brick,
      bag: COLOR.lime,
      sleeves: 'long',
      legs: 'pants',
    });
    for (const [id, o] of Object.entries(OUTFITS)) expect(o.id).toBe(id);
  });

  it.each(Object.values(OUTFITS))(
    '$id uses palette colours that pass the contrast rule (AC 4)',
    (o) => {
      for (const slot of ['hat', 'band', 'top', 'bottoms', 'shoes', 'bag'] as const) {
        expect(o[slot]).toBeGreaterThanOrEqual(1);
        expect(o[slot]).toBeLessThan(PALETTE.length);
      }
      expect(worstCaseContrast(PALETTE[o.top]!)).toBeGreaterThanOrEqual(3.0);
      expect(worstCaseContrast(PALETTE[o.bottoms]!)).toBeGreaterThanOrEqual(1.8);
    },
  );
});

describe('Look', () => {
  it('defaults to mid skin and dusk hair, from the listed choices', () => {
    expect(DEFAULT_LOOK).toEqual({ skin: COLOR.skinMid, hair: COLOR.dusk });
    expect(SKIN_TONES).toEqual([COLOR.skinLight, COLOR.skinMid, COLOR.skinDeep]);
    expect(HAIR_COLORS).toEqual([COLOR.ink, COLOR.dusk, COLOR.brick, COLOR.sun, COLOR.skinDeep]);
    expect(SKIN_TONES).toContain(DEFAULT_LOOK.skin);
    expect(HAIR_COLORS).toContain(DEFAULT_LOOK.hair);
  });
});
