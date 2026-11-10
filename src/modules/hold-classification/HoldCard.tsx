import type { ReactNode } from 'react';
import { useAppStore } from '../../store/app';
import { effectiveClassification } from './classification';
import { HOLD_TYPES, type HoldType } from './classify';
import { LearnButton } from './LearnCard';
import { ENTRY, nameOf, withArticle } from './names';

interface Props {
  holdId: string;
  /** Extra text from other modules, e.g. the chalk level. */
  details?: ReactNode;
  /** The hold's direction with its own correction control (hold-geometry). */
  direction?: ReactNode;
}

/** Five pips, filled by confidence: calm, readable at a glance, not an error color. */
function ConfidenceMeter({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const filled = Math.max(1, Math.round(prob * 5));
  return (
    <span
      role="meter"
      aria-label="Confidence"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      title={`${pct}% sure`}
      className="confidence"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < filled ? 'pip on' : 'pip'} />
      ))}
    </span>
  );
}

/** Hold type with confidence and override, the explanation, and the direction. */
export function HoldCard({ holdId, details, direction }: Props) {
  const triggered = useAppStore((s) => s.analysisTriggered);
  const stored = useAppStore((s) => s.classifications[holdId]);
  const override = useAppStore((s) => s.classOverrides[holdId] ?? null);
  const setOverride = useAppStore((s) => s.setClassOverride);

  const extras = (
    <>
      {direction}
      {details && <p className="hold-details">{details}</p>}
    </>
  );
  if (!stored) {
    return (
      <div className="hold-card">
        {triggered && <p className="hold-type pending">Identifying hold type…</p>}
        {extras}
      </div>
    );
  }

  const c = effectiveClassification(stored, override);
  const entry = ENTRY.get(c.effectiveType);
  const best = c.top[0]!;
  return (
    <div className="hold-card">
      <div className="hold-type-row">
        <strong className="hold-type">
          {nameOf(c.effectiveType)}
          {c.unsure ? '?' : ''}
        </strong>
        {!c.userType && <ConfidenceMeter prob={best.prob} />}
        <LearnButton type={c.effectiveType} />
        <label className="hold-override">
          <span className="visually-hidden">Hold type</span>
          <select
            aria-label="Hold type"
            value={override ?? ''}
            onChange={(e) => setOverride(holdId, (e.target.value || null) as HoldType | null)}
          >
            <option value="">Auto ({nameOf(best.type)})</option>
            {HOLD_TYPES.map((t) => (
              <option key={t} value={t}>
                {nameOf(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {c.unsure && (
        <p role="note" className="hold-warning">
          Not sure this is {withArticle(nameOf(best.type))}. Pick the right type if it’s wrong.
        </p>
      )}
      {entry && <p className="hold-explain">{entry.grip}</p>}
      {extras}
    </div>
  );
}

export function Credits() {
  return (
    <details className="credits">
      <summary>Credits</summary>
      <p>
        Models: SlimSAM, Depth Anything V2 Small and CLIP ViT-B/32, run in your browser with
        transformers.js. Your photo never leaves this device.
      </p>
      <p>
        Hold types were trained on{' '}
        <a href="https://universe.roboflow.com/mikeys-workspace-wzfte/beta-guide">Beta Guide</a> by
        Mikeys Workspace (Roboflow Universe), CC BY 4.0.
      </p>
      <p>Sample wall photos: taken by this project’s author.</p>
    </details>
  );
}
