import { useEffect, useId, useRef, useState } from 'react';
import { ENTRY, LEARN_PHOTOS, nameOf, withArticle, type LearnExample } from './names';

// SPEC-hold-classification › Amendment: Learn cards. On demand, so hold cards stay clean: real
// example photos, how to hold, one common mistake, and how it works as a foothold.

interface Props {
  type: string;
  /** Defaults to the catalog's examples while LEARN_PHOTOS is on (a prop for tests). */
  examples?: LearnExample[];
}

/** One credit per source, so three photos from one wall don't repeat it three times. */
function uniqueCredits(shots: LearnExample[]): LearnExample[] {
  const seen = new Set<string>();
  return shots.filter((x) => !seen.has(x.sourceUrl) && seen.add(x.sourceUrl));
}

export function LearnButton({ type, examples }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const entry = ENTRY.get(type);
  const name = nameOf(type);
  const shots = examples ?? (LEARN_PHOTOS ? entry?.learn?.examples : undefined) ?? [];

  useEffect(() => {
    if (open) close.current?.focus();
  }, [open]);
  const hide = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="learn-button"
        aria-label={`Learn about ${name}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? hide() : setOpen(true))}
      >
        ⓘ Learn
      </button>
      {open && entry && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="learn-card"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              hide();
            }
          }}
        >
          <div className="learn-head">
            <h3 id={titleId}>{name}</h3>
            <button ref={close} type="button" className="link" onClick={hide}>
              Close
            </button>
          </div>
          {shots.length > 0 && (
            <>
              <ul className="learn-examples">
                {shots.map((x, i) => (
                  <li key={x.src}>
                    <img
                      src={x.src}
                      alt={`Example of ${withArticle(name.toLowerCase())}, ${i + 1} of ${shots.length}`}
                      width={96}
                      height={96}
                      loading="lazy"
                    />
                  </li>
                ))}
              </ul>
              <small className="learn-credit">
                Photos:{' '}
                {uniqueCredits(shots).map((x, i) => (
                  <span key={x.sourceUrl}>
                    {i > 0 && '; '}
                    <a href={x.sourceUrl} target="_blank" rel="noreferrer">
                      {x.credit}
                    </a>
                    , {x.license}
                  </span>
                ))}
              </small>
            </>
          )}
          <dl className="learn-text">
            <dt>How to hold</dt>
            <dd>{entry.grip}</dd>
            {entry.learn && (
              <>
                <dt>Common mistake</dt>
                <dd>{entry.learn.mistake}</dd>
                <dt>As a foothold</dt>
                <dd>{entry.learn.footUse}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </>
  );
}
