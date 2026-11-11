import { PLACE_GAP, placeAt, placesFor, stripFor } from './places';

const SAMPLES = [
  { id: 'wall-a', name: 'Wall 1' },
  { id: 'wall-b', name: 'Wall 2' },
];

describe('placesFor (SPEC-gym-hub G1, G9, AC 3)', () => {
  it('lays out the gym left to right, 56 art px apart', () => {
    const places = placesFor('gym', SAMPLES);
    expect(places.map((p) => p.id)).toEqual([
      'desk',
      'lockers',
      'bay:wall-a',
      'bay:wall-b',
      'new-wall',
      'setting-room',
    ]);
    expect(PLACE_GAP).toBe(56);
    places.slice(1).forEach((p, i) => expect(p.x - places[i]!.x).toBe(56));
  });

  it('signs the bays "Wall 1", "Wall 2" in sample order and links them to their sample', () => {
    const bays = placesFor('gym', SAMPLES).filter((p) => p.kind === 'bay');
    expect(bays.map((b) => [b.label, b.sampleId])).toEqual([
      ['Wall 1', 'wall-a'],
      ['Wall 2', 'wall-b'],
    ]);
  });

  it('adds one bay per sample', () => {
    const three = [...SAMPLES, { id: 'third', name: 'Wall 3' }];
    expect(placesFor('gym', three).filter((p) => p.kind === 'bay')).toHaveLength(3);
  });

  it('leaves the Setting Room out for a beginner', () => {
    expect(placesFor('beginner', SAMPLES).map((p) => p.kind)).not.toContain('setting-room');
  });

  it('keeps the Setting Room for gym climbers and pros', () => {
    expect(placesFor('gym', SAMPLES).map((p) => p.kind)).toContain('setting-room');
    expect(placesFor('pro', SAMPLES).map((p) => p.kind)).toContain('setting-room');
  });
});

describe('stripFor (G7, G9)', () => {
  it('follows the floor order for beginners and gym climbers', () => {
    const places = placesFor('gym', SAMPLES);
    expect(stripFor('gym', places)).toEqual(places);
  });

  it('puts the Setting Room and New wall first for a pro, then the floor order', () => {
    const ids = stripFor('pro', placesFor('pro', SAMPLES)).map((p) => p.id);
    expect(ids).toEqual([
      'setting-room',
      'new-wall',
      'desk',
      'lockers',
      'bay:wall-a',
      'bay:wall-b',
    ]);
  });
});

describe('placeAt', () => {
  const places = placesFor('gym', SAMPLES);
  const lockers = places[1]!;

  it('finds a place within 8 art px either side', () => {
    expect(placeAt(places, lockers.x)).toBe(lockers);
    expect(placeAt(places, lockers.x - 8)).toBe(lockers);
    expect(placeAt(places, lockers.x + 8)).toBe(lockers);
  });

  it('finds nothing between places', () => {
    expect(placeAt(places, lockers.x + 9)).toBeNull();
    expect(placeAt(places, lockers.x + PLACE_GAP / 2)).toBeNull();
  });
});
