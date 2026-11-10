import { DEFAULT_PROFILE, profileFor } from './profile';

// SPEC-game › Amendment (b) › What "beginner to pro" means here.
describe('profileFor', () => {
  it('gives a beginner hints and hides the numbers', () => {
    expect(profileFor('beginner')).toEqual({ level: 'beginner', hints: true, numbers: false });
  });

  it('gives a gym climber reasons only: no hints, no numbers', () => {
    expect(profileFor('gym')).toEqual({ level: 'gym', hints: false, numbers: false });
  });

  it('gives a pro Numbers mode and no hints', () => {
    expect(profileFor('pro')).toEqual({ level: 'pro', hints: false, numbers: true });
  });

  it('defaults to the gym climber (a dismissed level question)', () => {
    expect(DEFAULT_PROFILE).toEqual(profileFor('gym'));
  });
});
