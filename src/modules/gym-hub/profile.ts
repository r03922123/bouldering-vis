// SPEC-game › Amendment (b) › What "beginner to pro" means here. The level only sets the starting
// aids; it never gates a wall or changes the referee's rules. `progression` saves it in step 5.

export type Level = 'beginner' | 'gym' | 'pro';

export interface Profile {
  level: Level;
  /** Coach hints (beginners), otherwise reasons only. */
  hints: boolean;
  /** Numbers mode: the referee's shares, reach ratios and effort (pros). */
  numbers: boolean;
}

export function profileFor(level: Level): Profile {
  return { level, hints: level === 'beginner', numbers: level === 'pro' };
}

/** A dismissed level question counts as a gym climber (SPEC-gym-hub G8). */
export const DEFAULT_PROFILE: Profile = profileFor('gym');
