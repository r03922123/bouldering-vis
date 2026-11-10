import { fitViewport, MAX_ZOOM, pan, screenToImage, zoomAt } from './viewport';

describe('viewport', () => {
  it('fits a landscape image to the box width and centers it vertically', () => {
    const vp = fitViewport(1536, 1152, 375, 600);
    expect(vp.scale).toBeCloseTo(375 / 1536, 6);
    expect(vp.tx).toBeCloseTo(0, 6);
    expect(vp.ty).toBeCloseTo((600 - 1152 * vp.scale) / 2, 6);
  });

  it('maps screen points back to image pixels at the fitted scale', () => {
    const vp = fitViewport(1536, 1152, 768, 576); // scale 0.5, no offset
    expect(screenToImage(vp, 100, 50)).toEqual({ x: 200, y: 100 });
  });

  it('keeps the image point under the cursor fixed while zooming', () => {
    const vp = fitViewport(1536, 1152, 768, 576);
    const before = screenToImage(vp, 300, 200);
    const zoomed = zoomAt(vp, 3, 300, 200);
    const after = screenToImage(zoomed, 300, 200);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(zoomed.scale).toBeCloseTo(1.5, 6);
  });

  it('clamps zoom between the fitted scale and 8× of it', () => {
    const vp = fitViewport(1536, 1152, 768, 576);
    expect(MAX_ZOOM).toBe(8);
    expect(zoomAt(vp, 0.1, 0, 0).scale).toBeCloseTo(vp.scale, 6);
    expect(zoomAt(vp, 100, 0, 0).scale).toBeCloseTo(vp.scale * 8, 6);
  });

  it('pans a zoomed image but never past its edges', () => {
    const vp = zoomAt(fitViewport(1536, 1152, 768, 576), 2, 0, 0); // image is 1536×1152 on screen
    const moved = pan(vp, -100, -50);
    expect(screenToImage(moved, 0, 0)).toEqual({ x: 100, y: 50 });
    const far = pan(vp, -5000, -5000);
    expect(screenToImage(far, 768, 576)).toEqual({ x: 1536, y: 1152 });
    const back = pan(vp, 5000, 5000);
    expect(screenToImage(back, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('maps correctly after zoom then pan (±1px)', () => {
    let vp = fitViewport(1536, 1152, 375, 600);
    vp = zoomAt(vp, 4, 187, 300);
    vp = pan(vp, 37, -21);
    const p = screenToImage(vp, 200, 310);
    // Recompute by hand from the transform.
    expect(Math.abs(p.x - (200 - vp.tx) / vp.scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y - (310 - vp.ty) / vp.scale)).toBeLessThanOrEqual(1);
  });
});

describe('badgeAnchor', () => {
  const vp = fitViewport(1000, 800, 500, 400); // scale 0.5, no offset

  it('sits centered just above the hold, so the badge never hides it', async () => {
    const { badgeAnchor } = await import('./viewport');
    const p = badgeAnchor({ x: 100, y: 200, w: 40, h: 20 }, { x: 120, y: 210 }, vp, 12);
    expect(p.x).toBe(60); // centroid x × 0.5
    expect(p.y).toBe(100 - 12 - 3); // bbox top (200 × 0.5) − radius − gap
  });

  it('flips below the hold when there is no room above', async () => {
    const { badgeAnchor } = await import('./viewport');
    const p = badgeAnchor({ x: 100, y: 10, w: 40, h: 20 }, { x: 120, y: 20 }, vp, 12);
    expect(p.y).toBe((10 + 20) * 0.5 + 12 + 3);
  });
});
