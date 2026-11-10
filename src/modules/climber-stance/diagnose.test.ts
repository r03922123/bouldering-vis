import { diagnose, playReachText, playSlipText, playSteepText } from './diagnose';
import { resolveContacts, solveStance, type Candidate, type ContactInput } from './stance';
import { unit, type Vec3 } from './vec';

const H = 1000;
const hold = (x: number, y: number, type: string | null, dir: Vec3 | null = [0, 1, 0]) =>
  ({ holdId: `${x},${y}`, point: [x, y], type, dir }) satisfies ContactInput;

describe('diagnosis', () => {
  it('calls a failing one-sided stance a barn door, and names the side', () => {
    const s = solveStance(
      { lh: hold(-100, 0, 'sloper', [0, 0.6, -1]), lf: hold(-100, 750, 'smear', null) },
      { height: H, wallAngleDeg: 35 },
    );
    expect(s.feasible).toBe(false);
    expect(s.diagnosis?.kind).toBe('barn-door');
    expect(s.diagnosis?.text).toMatch(/^Barn door: you'd swing off to the (left|right)/);
  });

  // Smearing feet: a foot on a sloper-typed hold stands on it since amendment 2026-11-01 (c), so the
  // fixture smears (the same smear cone the sloper feet had).
  it('names a slipping foot', () => {
    const s = solveStance(
      {
        lh: hold(-100, 0, 'crimp'),
        rh: hold(100, 0, 'crimp'),
        lf: hold(-120, 750, 'smear', null),
        rf: hold(120, 750, 'smear', null),
      },
      { height: H, wallAngleDeg: 45 },
    );
    expect(s.diagnosis?.kind).toBe('slip');
    expect(['lf', 'rf']).toContain(s.diagnosis?.limb);
    expect(s.diagnosis?.text).toMatch(/foot would slip — bring your hips in over it$/);
  });

  // Amendment 2026-10-31 (b), rule 13: "sloper too steep", worded by where the surface came from.
  describe('a sloper too steep to hold', () => {
    const ASSUMED = unit([0, -0.6, 1]);
    const steep = (
      type: string,
      surface: ContactInput['surface'],
      dir: Vec3 = [0, 0.6, -1],
    ): ReturnType<typeof solveStance>['diagnosis'] =>
      solveStance(
        {
          lh: { ...hold(400, 200, type, dir), surface },
          rh: { ...hold(600, 200, type, dir), surface },
          lf: hold(290, 780, null, null),
          rf: hold(710, 780, null, null),
        },
        { height: H, wallAngleDeg: 0 },
      ).diagnosis;

    it('tells you to get a foot under a measured or user-set surface', () => {
      for (const source of ['measured', 'user'] as const) {
        const d = steep('sloper', { normal: ASSUMED, source });
        expect(d?.kind).toBe('sloper-steep');
        expect(d?.text).toMatch(
          /^(Left|Right) hand: this sloper is too steep to hold here — get a foot on a hold under it$/,
        );
      }
    });

    it('says an assumed surface may be too steep, and to set its pull to Down', () => {
      const d = steep('sloper', { normal: ASSUMED, source: 'assumed' });
      expect(d?.kind).toBe('sloper-steep');
      expect(d?.text).toMatch(
        /^(Left|Right) hand: this sloper may be too steep — if its top faces up, set its pull to Down$/,
      );
    });

    it('calls a volume a volume', () => {
      expect(steep('volume', { normal: ASSUMED, source: 'measured' })?.text).toMatch(
        /^(Left|Right) hand: this volume is too steep to hold here/,
      );
      expect(steep('volume', { normal: ASSUMED, source: 'assumed' })?.text).toMatch(
        /^(Left|Right) hand: this volume may be too steep/,
      );
    });

    it('shows no degree numbers', () => {
      expect(steep('sloper', { normal: ASSUMED, source: 'assumed' })?.text).not.toMatch(/\d|°/);
    });

    it('keeps the slip text for a sloper with no surface', () => {
      const d = steep('sloper', null);
      expect(d?.kind).toBe('slip');
      expect(d?.text).toMatch(/a sloper can't take this pull — get your hips lower and under it$/);
    });
  });

  // SPEC-play-shell › Amendment 2026-11-03 R0-3: Play's words, where Play can't carry out the
  // Studio's advice. The table owns both; `text` stays the Studio's, `playText` is Play's.
  describe('Play’s words (R0-3)', () => {
    const ASSUMED = unit([0, -0.6, 1]);
    const onSlopers = (surface: ContactInput['surface'], dir: Vec3 = [0, 0.6, -1]) =>
      solveStance(
        {
          lh: { ...hold(400, 200, 'sloper', dir), surface },
          rh: { ...hold(600, 200, 'sloper', dir), surface },
          lf: hold(290, 780, null, null),
          rf: hold(710, 780, null, null),
        },
        { height: H, wallAngleDeg: 0 },
      ).diagnosis;

    it('out of reach: drops the size clause for Play, keeps it for the Studio', () => {
      const s = solveStance(
        { lh: hold(-100, 0, 'crimp'), rh: hold(100, 0, 'crimp'), lf: hold(-120, 1200, 'edge') },
        { height: H, wallAngleDeg: 0 },
      );
      expect(s.diagnosis?.kind).toBe('reach');
      expect(s.diagnosis?.text).toBe(
        'Out of reach: left foot — make the climber bigger or pick a closer hold',
      );
      // Review 7: a foot picks a closer foothold.
      expect(s.diagnosis?.playText).toBe('Out of reach: left foot — pick a closer foothold');
    });

    // Worded as Play's button (review 6): Play's by-hold text (playSteepText) replaces it when the
    // hold is known.
    it('an assumed sloper surface: press Down for it in Edit directions', () => {
      const d = onSlopers({ normal: ASSUMED, source: 'assumed' });
      expect(d?.kind).toBe('sloper-steep');
      expect(d?.playText).toMatch(
        /^(Left|Right) hand: this sloper may be too steep — if its top faces up, press Down for it in Edit directions$/,
      );
    });

    it('once the player set the pull (user): the slip text, never "set its pull to Down"', () => {
      const d = onSlopers({ normal: ASSUMED, source: 'user' });
      expect(d?.kind).toBe('sloper-steep');
      expect(d?.playText).toMatch(
        /^(Left|Right) hand: a sloper can't take this pull — get your hips lower and under it$/,
      );
      expect(d?.playText).not.toMatch(/set its pull to Down/);
    });

    it('a measured surface: the Studio’s words already name an action Play has', () => {
      const d = onSlopers({ normal: ASSUMED, source: 'measured' });
      expect(d?.kind).toBe('sloper-steep');
      expect(d?.playText).toBeUndefined();
    });
  });

  // PR #17 review 6 (game designer): Play's Down advice names the hold and says why, in this
  // table's words; Play fills in the hold's label and its pull.
  describe('Play’s steep-sloper words, by hold (R0 review 6)', () => {
    it('names the hold, its pull, why, and the button', () => {
      expect(
        playSteepText('rh', 'sloper', { label: '4', pull: 'pulls mostly into the wall' }),
      ).toBe(
        "Right hand: hold 4 pulls mostly into the wall, which a sloper can't take — if its top faces up, press Down for it in Edit directions",
      );
      expect(playSteepText('lh', 'volume', { label: '2', pull: 'pulls down-left' })).toBe(
        "Left hand: hold 2 pulls down-left, which a volume can't take — if its top faces up, press Down for it in Edit directions",
      );
    });

    it('the slip words, for a pull Down wouldn’t change', () => {
      expect(playSlipText('rh', 'sloper')).toBe(
        "Right hand: a sloper can't take this pull — get your hips lower and under it",
      );
    });
  });

  // PR #17 review 7 (game designer): out of reach in Play's words, feet "foothold", hands "hold",
  // and with the move that made it so when the limb out of reach isn't the one that moved.
  describe('Play’s out-of-reach words (R0 review 7)', () => {
    it('feet say foothold, hands say hold', () => {
      expect(playReachText('lf')).toBe('Out of reach: left foot — pick a closer foothold');
      expect(playReachText('rh')).toBe('Out of reach: right hand — pick a closer hold');
    });

    it('with the move that left the limb out of reach', () => {
      expect(playReachText('lf', 'right hand on 6')).toBe(
        "With your right hand on 6, your left foot can't reach — pick a closer foothold",
      );
      expect(playReachText('lh', 'right foot on Wall foothold 3')).toBe(
        "With your right foot on Wall foothold 3, your left hand can't reach — pick a closer hold",
      );
    });
  });

  it('asks for a contact when no limb is on a hold', () => {
    const s = solveStance({}, { height: H, wallAngleDeg: 0 });
    expect(s.diagnosis).toEqual({ kind: 'unbalanced', text: 'Put a hand or foot on a hold' });
  });
});

// Amendment 2026-11-04, M2 rule 3: out of reach because of a joint's range, not the limb's length.
describe('diagnosis › cramped (M2)', () => {
  const input = { lh: hold(0, 0, 'jug'), lf: hold(-100, 300, null, null) };
  const contacts = resolveContacts(input);
  const at = (missing: number, cramped: number, high = 0): Candidate => ({
    pelvis: [0, 400, 100],
    missing,
    cramped,
    high,
    com: null,
    sol: null,
    cost: 1e4,
    posture: Infinity,
  });
  const LF = 1 << 2;
  const LH = 1 << 0;
  const run = (grid: Candidate[]) =>
    diagnose({ contacts, input, best: null, grid, gravity: [0, 1, 0], height: H });

  it('says "Too cramped" when some position fails on that limb alone, by its joint range', () => {
    const d = run([at(LF, 0), at(LF, LF), at(LF | LH, 0)]);
    expect(d).toEqual({
      kind: 'reach',
      limb: 'lf',
      text: 'Too cramped: left foot — pick a hold further from your body',
      cramped: true,
    });
  });

  // PR #18 review 2: only the hip's range stops it, so the foot is too high, not too close.
  it('says "Too high" when the hip’s range alone stops that limb', () => {
    const d = run([at(LF, LF, LF), at(LF, LF, LF), at(LF, 0)]);
    expect(d.text).toBe('Too high: left foot — pick a lower foothold');
    expect(d.cramped).toBe(true);
    // One position stopped by the knee's fold: too close after all.
    expect(run([at(LF, LF, LF), at(LF, LF, 0)]).text).toBe(
      'Too cramped: left foot — pick a hold further from your body',
    );
  });

  it('stays "Out of reach" when the joint range only fails where another limb fails too', () => {
    const d = run([at(LF, 0), at(LF, 0), at(LF | LH, LF)]);
    expect(d.text).toBe('Out of reach: left foot — make the climber bigger or pick a closer hold');
    expect(d.cramped).toBeUndefined();
  });
});
