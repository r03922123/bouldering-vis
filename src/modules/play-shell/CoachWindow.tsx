import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelText, useReducedMotion } from '../pixel-kit';
import { ADVANCE_GRID, FRAME_GRID, FRAME_SLICE, gridSvg, REVEAL_MS } from './coach';
import { keysIgnored } from './keys';

const FRAME = gridSvg(FRAME_GRID);
const ADVANCE = gridSvg(ADVANCE_GRID);

interface Shown {
  /** The pages this progress belongs to. */
  key: string;
  page: number;
  /** Letters of the page revealed. */
  n: number;
}

/**
 * D1: the coach window, an original 8-bit text box under the wall. It mirrors the verdict's live
 * region: `live` is announced once, in full, by the visually hidden role=status line (S12), and
 * the box shows the same words as `pages`, letter by letter, aria-hidden so a screen reader never
 * hears half a line. A tap on the box or Enter skips the reveal, then goes to the next page; the
 * advance arrow is a real button. Under reduced motion every page shows at once.
 */
export function CoachWindow({
  live,
  ok,
  pages,
  replay = 0,
  strip = false,
  expanded: expandedProp,
  onExpanded,
}: {
  /** The verdict line for the live region (unchanged from S5/S6). */
  live: string;
  /** data-ok on the live region: the verdict's colour. */
  ok: boolean | undefined;
  /** What the box shows, page by page: the referee's words, nothing else. */
  pages: readonly string[];
  /**
   * Private PR #17 review 3: the attempt these words answer. A new attempt with the same words (the same
   * blocked hold again) starts the reveal again, so the box visibly answers.
   */
  replay?: number;
  /**
   * Amendment (b) U3, the phone: a one-line strip under the photo until tapped; then the whole
   * box. The live region is the same either way.
   */
  strip?: boolean;
  /**
   * The strip's expanded state, when the caller keeps it (Play does, so it survives the remount
   * when the layout crosses the breakpoint). Without it the window keeps its own.
   */
  expanded?: boolean;
  onExpanded?: (expanded: boolean) => void;
}) {
  const [ownExpanded, setOwnExpanded] = useState(false);
  const expanded = expandedProp ?? ownExpanded;
  const setExpanded = (on: boolean) => (onExpanded ? onExpanded(on) : setOwnExpanded(on));
  const folded = strip && !expanded;
  const reduced = useReducedMotion();
  const key = `${replay}:${JSON.stringify(pages)}`;
  const [saved, setShown] = useState<Shown | null>(null);
  // Progress belongs to one set of pages: new words start again at page 1 (derived, no reset).
  const shown = saved && saved.key === key ? saved : { key, page: 0, n: 0 };
  const page = Math.min(shown.page, Math.max(0, pages.length - 1));
  const text = pages[page] ?? '';
  const n = reduced ? text.length : Math.min(shown.n, text.length);
  const revealing = n < text.length;
  const more = page < pages.length - 1;

  useEffect(() => {
    if (reduced || !revealing) return;
    const id = window.setInterval(() => {
      setShown((s) => {
        const cur = s && s.key === key ? s : { key, page: 0, n: 0 };
        return { ...cur, n: cur.n + 1 };
      });
    }, REVEAL_MS);
    return () => window.clearInterval(id);
  }, [key, page, reduced, revealing]);

  /** Skip the reveal; once a page is whole, go to the next. */
  const advance = () => {
    if (revealing) setShown({ key, page, n: text.length });
    else if (more) setShown({ key, page: page + 1, n: 0 });
  };

  // A free Enter skips or pages. One listener for the window's life (review suggestion); it reads
  // the latest state from a ref set after each render, never during it.
  const onEnter = useRef<() => boolean>(() => false);
  useLayoutEffect(() => {
    onEnter.current = () => {
      if (!revealing && !more) return false;
      advance();
      return true;
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat) return;
      // Enter on a control is that control's; only a free Enter (nothing focused) is the coach's.
      const t = e.target as HTMLElement | null;
      if (
        keysIgnored(t) ||
        (t &&
          t !== document.body &&
          t.closest('button, a, input, select, textarea, summary, [tabindex]'))
      )
        return;
      if (onEnter.current()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const letters = useMemo(() => [...text], [text]);
  return (
    <section
      className={folded ? 'play-coach play-coach-strip' : 'play-coach'}
      aria-label="Coach"
      style={{ borderImageSource: `url("${FRAME}")`, borderImageSlice: FRAME_SLICE }}
      data-ok={ok}
      data-page={page + 1}
      data-pages={pages.length}
      data-attempt={replay}
      data-revealed={revealing ? n : 'all'}
      data-strip={folded || undefined}
      onClick={folded ? () => setExpanded(true) : advance}
    >
      <span className="play-coach-tag" aria-hidden="true">
        <PixelText text="COACH" />
      </span>
      <p className="play-verdict visually-hidden" role="status" aria-live="polite" data-ok={ok}>
        {live}
      </p>
      {/* One span per letter keeps the box's size fixed while the words appear. */}
      <p className="play-coach-text" aria-hidden="true">
        {letters.map((ch, i) => (
          <span key={i} className={i < n ? undefined : 'play-coach-hidden'}>
            {ch}
          </span>
        ))}
      </p>
      {more && !revealing && !folded && (
        <button
          type="button"
          className="play-coach-next"
          aria-label="Next coach line"
          onClick={(e) => {
            e.stopPropagation();
            advance();
          }}
        >
          <img src={ADVANCE} alt="" width={10} height={12} />
        </button>
      )}
      {strip && (
        <button
          type="button"
          className="play-coach-fold"
          aria-expanded={expanded}
          // Review 2: honest about what it does. Expanded it folds the box to one line ("Fold"),
          // folded it shows the whole line (▾).
          aria-label={expanded ? 'Fold the coach to one line' : 'Show the whole coach line'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <span aria-hidden="true">{expanded ? 'Fold ▴' : '▾'}</span>
        </button>
      )}
    </section>
  );
}
