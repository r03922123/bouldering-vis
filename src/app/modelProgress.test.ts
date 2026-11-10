import { downloading, MODEL_NAMES } from './modelProgress';

describe('downloading', () => {
  it('sums the files of each model and lists only unfinished downloads, with friendly names', () => {
    const progress = {
      sam: { 'encoder.onnx': { loaded: 6, total: 12 }, 'decoder.onnx': { loaded: 3, total: 9 } },
      depth: { 'model.onnx': { loaded: 50, total: 50 } },
    };
    expect(downloading(progress)).toEqual([
      { model: 'sam', name: MODEL_NAMES.sam, loaded: 9, total: 21 },
    ]);
  });

  it('names the models for people', () => {
    expect(MODEL_NAMES).toEqual({
      sam: 'hold detector',
      depth: 'depth model',
      clip: 'hold-type model',
    });
  });
});
