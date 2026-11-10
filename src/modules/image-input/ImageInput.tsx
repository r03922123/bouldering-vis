import { useCallback, useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { loadImage } from './load';
import { DEFAULT_SAMPLE_ID, SAMPLES, type Sample } from './samples';
import { ImageInputException, type ImageInputError, type WorkingImage } from './types';

interface Props {
  onLoad: (img: WorkingImage) => void;
  onError: (err: ImageInputError) => void;
  /** Compact = a slim bar once a photo is loaded. */
  compact?: boolean;
}

/** A loaded sample keeps its id and, if measured, its scale in working-image pixels. */
function withSample(img: WorkingImage, sample: Sample): WorkingImage {
  const out: WorkingImage = { ...img, sampleId: sample.id };
  if (sample.scale) out.pxPerCm = (sample.scale.pxPerCm * img.width) / sample.scale.refWidth;
  return out;
}

export function ImageInput({ onLoad, onError, compact = false }: Props) {
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sampleId, setSampleId] = useState(DEFAULT_SAMPLE_ID);

  const load = useCallback(
    async (blob: Blob, name?: string, sample?: Sample) => {
      try {
        const img = await loadImage(blob, name);
        onLoad(sample ? withSample(img, sample) : img);
        setExpanded(false); // a new photo is in: back to the compact Change photo button
      } catch (err) {
        onError(err instanceof ImageInputException ? err.detail : { kind: 'decode-failed' });
      }
    },
    [onLoad, onError],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find(
        (i) => i.kind === 'file' && i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) void load(file, 'pasted-image');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [load]);

  const loadSample = async () => {
    const sample = SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    try {
      const res = await fetch(sample.url);
      if (!res.ok) throw new Error(`${res.status}`);
      await load(await res.blob(), sample.name, sample);
    } catch {
      onError({ kind: 'decode-failed' });
    }
  };

  const takeFirst = (files: ArrayLike<File> | null | undefined) => {
    const file = files?.[0];
    if (file) void load(file, file.name);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    takeFirst(e.dataTransfer?.files);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    takeFirst(e.target.files);
    e.target.value = ''; // picking the same file again still fires change
  };

  // With a photo loaded the input collapses to one button (paste and drop still work).
  const collapsed = compact && !expanded;
  if (collapsed) {
    return (
      <div
        data-testid="drop-zone"
        className={`drop-zone compact collapsed${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <button type="button" aria-expanded="false" onClick={() => setExpanded(true)}>
          Change photo
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="drop-zone"
      className={`drop-zone${dragging ? ' dragging' : ''}${compact ? ' compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {!compact && <p>Paste, drop, or choose a photo of the wall, or try a sample wall.</p>}
      {compact && (
        <button
          type="button"
          aria-expanded="true"
          className="link"
          onClick={() => setExpanded(false)}
        >
          Change photo
        </button>
      )}
      <div className="drop-actions">
        <label className="button">
          Choose file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose file"
            onChange={onPick}
          />
        </label>
        <label className="button">
          Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take photo"
            onChange={onPick}
          />
        </label>
        <span className="sample-picker">
          <select
            aria-label="Sample wall"
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
          >
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadSample()}>
            Load sample
          </button>
        </span>
      </div>
    </div>
  );
}
