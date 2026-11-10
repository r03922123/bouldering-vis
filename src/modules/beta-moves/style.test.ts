import { styleFor } from './style';

describe('styleFor (AC 14)', () => {
  it('hands: static to 1.000, deadpoint to 1.100, then out of reach', () => {
    expect(styleFor('rh', 1, true)).toBe('static');
    expect(styleFor('rh', 1.001, true)).toBe('deadpoint');
    expect(styleFor('lh', 1.1, true)).toBe('deadpoint');
    expect(styleFor('lh', 1.101, true)).toBe('fall');
    expect(styleFor('lh', Infinity, true)).toBe('fall');
  });

  it('feet: static to 1.000 only', () => {
    expect(styleFor('lf', 1, true)).toBe('static');
    expect(styleFor('rf', 1.001, true)).toBe('fall');
  });

  it('with dynamic moves off, hands are static only', () => {
    expect(styleFor('rh', 1, false)).toBe('static');
    expect(styleFor('rh', 1.001, false)).toBe('fall');
  });
});
