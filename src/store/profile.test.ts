import { DEFAULT_PROFILE, profileFor } from '../modules/gym-hub';
import { playProfile, useProfileStore } from './profile';

beforeEach(() => useProfileStore.setState(useProfileStore.getInitialState()));

describe('profile store (SPEC-gym-hub G8, Amendment 2026-11-02 W3)', () => {
  it('starts as the default profile (a gym climber), so nothing asks the level (W3)', () => {
    expect(useProfileStore.getState().profile).toEqual(DEFAULT_PROFILE);
    expect(playProfile(useProfileStore.getState())).toEqual(DEFAULT_PROFILE);
  });

  // W5: the answer stays in the store, unreachable from the app, for when the level is asked again.
  it('sets the profile from the level answer', () => {
    useProfileStore.getState().answer('pro');
    expect(useProfileStore.getState().profile).toEqual(profileFor('pro'));
  });

  it('counts a dismissed question as a gym climber', () => {
    useProfileStore.getState().answer('pro');
    useProfileStore.getState().dismiss();
    expect(useProfileStore.getState().profile).toEqual(profileFor('gym'));
  });

  it('lets the lockers change the answer later', () => {
    useProfileStore.getState().answer('beginner');
    useProfileStore.getState().answer('gym');
    expect(useProfileStore.getState().profile.level).toBe('gym');
  });

  it('toggles one aid without changing the level', () => {
    useProfileStore.getState().answer('gym');
    useProfileStore.getState().setAid('numbers', true);
    expect(useProfileStore.getState().profile).toEqual({
      level: 'gym',
      hints: false,
      numbers: true,
    });
  });

  it('toggles an aid on the default profile, and Play sees it (W3: the Aids menu still works)', () => {
    useProfileStore.getState().setAid('numbers', true);
    useProfileStore.getState().setAid('hints', true);
    const want = { ...DEFAULT_PROFILE, numbers: true, hints: true };
    expect(useProfileStore.getState().profile).toEqual(want);
    expect(playProfile(useProfileStore.getState())).toEqual(want);
    useProfileStore.getState().setAid('hints', false);
    expect(playProfile(useProfileStore.getState()).hints).toBe(false);
  });

  it('keeps an aid the player toggled when a level is answered later (review suggestion)', () => {
    useProfileStore.getState().setAid('numbers', true);
    useProfileStore.getState().answer('beginner');
    // The level sets the defaults; the player's own toggle stays.
    expect(useProfileStore.getState().profile).toEqual({
      ...profileFor('beginner'),
      numbers: true,
    });
  });

  it('keeps nothing in storage before step 5', () => {
    useProfileStore.getState().answer('pro');
    expect(window.localStorage.length).toBe(0);
  });
});
