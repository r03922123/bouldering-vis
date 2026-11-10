import catalog from './hold-catalog.json';
import probe from './clip-probe.json';

// SPEC-hold-classification › Amendment 2026-10-30, A10.
describe('clip-probe.json', () => {
  const ids = new Set(catalog.map((e) => e.id));

  it('predicts catalog types only, never edge (D6)', () => {
    expect(probe.classes.length).toBeGreaterThanOrEqual(6);
    for (const c of probe.classes) expect(ids.has(c)).toBe(true);
    expect(probe.classes).not.toContain('edge');
  });

  it('has 512-wide finite weights and mean, one bias per class', () => {
    expect(probe.weights).toHaveLength(probe.classes.length);
    expect(probe.bias).toHaveLength(probe.classes.length);
    expect(probe.mean).toHaveLength(512);
    for (const row of probe.weights) {
      expect(row).toHaveLength(512);
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('records what it was trained on', () => {
    expect(probe.trainedOn.join(' ')).toContain('Beta Guide');
    expect(probe.trainedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
