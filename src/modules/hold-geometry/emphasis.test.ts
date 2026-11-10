import { forceEmphasis } from './emphasis';
import type { Force } from './force';

describe('forceEmphasis', () => {
  it('treats the common "pull down" from the type rule as the default (drawn subtle)', () => {
    const f: Force = { dir: [0, 1, 0], source: 'type', cue: 'Pull down into the incut' };
    expect(forceEmphasis(f)).toBe('default');
  });

  it('highlights anything else: a sloper press, a measured surface, a sidepull', () => {
    expect(forceEmphasis({ dir: [0, 0.5, -0.86], source: 'type', cue: 'Press' })).toBe('notable');
    expect(forceEmphasis({ dir: [0, 1, 0], source: 'surface', cue: 'Pull' })).toBe('notable');
    expect(forceEmphasis({ dir: [0.9, 0.1, -0.4], source: 'surface', cue: 'Sideways' })).toBe(
      'notable',
    );
  });

  it('has nothing to emphasize without a direction', () => {
    expect(forceEmphasis({ dir: null, source: 'none', cue: null })).toBeNull();
  });
});

describe('forceEmphasis for user directions', () => {
  it('always draws a direction the user set as notable', () => {
    expect(forceEmphasis({ dir: [0, 1, 0], source: 'user', cue: 'Pull down (set by you)' })).toBe(
      'notable',
    );
  });
});
