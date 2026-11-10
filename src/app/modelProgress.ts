import type { ModelId } from '../workers/protocol';

export type ModelProgress = Partial<
  Record<ModelId, Record<string, { loaded: number; total: number }>>
>;

export const MODEL_NAMES: Record<ModelId, string> = {
  sam: 'hold detector',
  depth: 'depth model',
  clip: 'hold-type model',
};

/** Models still downloading, with their files summed. */
export function downloading(
  progress: ModelProgress,
): { model: ModelId; name: string; loaded: number; total: number }[] {
  return (Object.keys(progress) as ModelId[]).flatMap((model) => {
    const files = Object.values(progress[model] ?? {});
    const loaded = files.reduce((a, f) => a + f.loaded, 0);
    const total = files.reduce((a, f) => a + f.total, 0);
    return total > 0 && loaded < total ? [{ model, name: MODEL_NAMES[model], loaded, total }] : [];
  });
}
