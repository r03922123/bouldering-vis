import { profileFor, type Level } from '../gym-hub';
import type { Limb } from '../climber-stance';
import { movingLine, nextArmed, trayFor } from './tray';

// SPEC-play-shell S8 and AC 6 (amendment (b) SC 6): one referee for every level.

const LEVELS: Level[] = ['beginner', 'gym', 'pro'];

describe('trayFor (S8)', () => {
  it('gives a beginner 1 limb per move, gym climbers and pros 2', () => {
    expect(trayFor(profileFor('beginner')).maxLimbs).toBe(1);
    expect(trayFor(profileFor('gym')).maxLimbs).toBe(2);
    expect(trayFor(profileFor('pro')).maxLimbs).toBe(2);
  });

  it('shows Numbers by the profile’s own aid, at any level', () => {
    expect(trayFor(profileFor('pro')).numbers).toBe(true);
    expect(trayFor(profileFor('gym')).numbers).toBe(false);
    expect(trayFor({ ...profileFor('beginner'), numbers: true }).numbers).toBe(true);
    expect(trayFor({ ...profileFor('pro'), numbers: false }).numbers).toBe(false);
  });

  it('keeps the plumb line off until the pillars are approved', () => {
    for (const l of LEVELS) expect(trayFor(profileFor(l)).plumb).toBe(false);
  });

  it('never returns MoveRules: only the tray’s own three settings', () => {
    for (const l of LEVELS) {
      const t = trayFor(profileFor(l));
      expect(Object.keys(t).sort()).toEqual(['maxLimbs', 'numbers', 'plumb']);
      expect(t).not.toHaveProperty('rules');
      expect(t).not.toHaveProperty('feet');
      expect(t).not.toHaveProperty('dynamic');
    }
  });
});

// AC 6 (the same referee for every level) is a component test: sameReferee.test.tsx plays one
// beta through the screen under all three profiles.

// SPEC-play-shell › Amendment 2026-11-03 R0-1: one armed limb by default. A press replaces the
// armed limb; a second limb is added only on purpose (Shift, or "+ limb"), when the tier allows 2.
describe('nextArmed (R0-1)', () => {
  const press = (limb: Limb, add = false) => ({ kind: 'press', limb, add }) as const;

  it('replaces: Q then W arms only the right hand', () => {
    expect(nextArmed(nextArmed([], press('lh'), 2), press('rh'), 2)).toEqual(['rh']);
  });

  it('adds on purpose: Shift (or "+ limb") then W after Q arms both, in the order picked', () => {
    expect(nextArmed(['lh'], press('rh', true), 2)).toEqual(['lh', 'rh']);
  });

  it('keeps the tier’s limit: a third added limb drops the oldest; a beginner never adds', () => {
    expect(nextArmed(['lh', 'rh'], press('lf', true), 2)).toEqual(['rh', 'lf']);
    expect(nextArmed(['lh'], press('rh', true), 1)).toEqual(['rh']);
  });

  it('keeps the armed limb armed when it is pressed again, with or without Shift', () => {
    expect(nextArmed(['rh'], press('rh'), 2)).toEqual(['rh']);
    expect(nextArmed(['rh'], press('rh', true), 2)).toEqual(['rh']);
    expect(nextArmed(['lh', 'rh'], press('rh', true), 2)).toEqual(['lh', 'rh']);
  });

  it('a plain press on one of two armed limbs leaves only that one', () => {
    expect(nextArmed(['lh', 'rh'], press('rh'), 2)).toEqual(['rh']);
  });

  it('keeps the limb armed after a fall preview or a rejection, and drops it after a commit', () => {
    expect(nextArmed(['rh'], { kind: 'attempt', outcome: 'preview' }, 2)).toEqual(['rh']);
    expect(nextArmed(['rh'], { kind: 'attempt', outcome: 'rejected' }, 2)).toEqual(['rh']);
    expect(nextArmed(['rh'], { kind: 'attempt', outcome: 'commit' }, 2)).toEqual([]);
    // After the preview, another limb replaces it.
    expect(nextArmed(['rh'], press('lf'), 2)).toEqual(['lf']);
  });

  it('Esc clears (K1)', () => {
    expect(nextArmed(['lh', 'rh'], { kind: 'clear' }, 2)).toEqual([]);
  });
});

describe('movingLine (R0-1: the hint line names the armed limb)', () => {
  it('names the limb and what to do', () => {
    expect(movingLine(['rh'], 'rh')).toBe('Moving: right hand — tap a hold');
    expect(movingLine(['lf'], 'lf')).toBe('Moving: left foot — tap a hold');
  });

  it('names both limbs of a 2-limb move and the one still waiting', () => {
    expect(movingLine(['lh', 'rf'], 'lh')).toBe(
      'Moving: left hand and right foot — tap a hold for the left hand',
    );
    expect(movingLine(['lh', 'rf'], 'rf')).toBe(
      'Moving: left hand and right foot — tap a hold for the right foot',
    );
  });

  it('says nothing with no limb armed', () => {
    expect(movingLine([], null)).toBeNull();
  });
});
