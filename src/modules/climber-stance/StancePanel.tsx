import { useMemo } from 'react';
import { useAppStore } from '../../store/app';
import { badgeLabels } from '../hold-segmentation';
import { SMEAR } from './assign';
import type { Hook } from './cones';
import { roundShares } from './shares';
import { LIMB_NAME, LIMBS, WALL_ANGLES, type FeetMode, type Limb, type WallAngle } from './types';
import { canHook } from './stance';
import type { StanceState } from './useStance';
import { isWallFoothold } from './wallFootholds';

// SPEC-climber-stance › Display: the inspector section.

const SCALE_MIN = 50;
const SCALE_MAX = 200;

/**
 * Amendment 2026-10-31 (b), Open Question 1 (user decision 2026-11-01): on a feasible stance whose
 * hands carry at most this share of the weight each, either way (an undercling's share is negative:
 * it pulls the body down, so it carries weight too)…
 */
const HANDS_IDLE_SHARE = 2;
/** …while one of them still pulls with at least this force (% of the weight), say so. */
const HANDS_PULL_PERCENT = 1;

/** True when the hands only pull the body in to the wall and the feet carry the weight. */
function handsPullIn(stance: StanceState['stance']): boolean {
  if (!stance?.feasible) return false;
  const hands = [stance.load.lh, stance.load.rh].filter((l) => l !== undefined);
  return (
    hands.length > 0 &&
    hands.every((l) => Math.abs(l.share) <= HANDS_IDLE_SHARE) &&
    hands.some((l) => l.percent >= HANDS_PULL_PERCENT)
  );
}

/** Amendment 2026-10-31 (b), rule 15: where the feet may stand. */
const FEET_MODES: readonly { value: FeetMode; label: string }[] = [
  { value: 'any', label: 'Any feet' },
  { value: 'follow', label: 'Follow hands' },
];

export function StancePanel({ state }: { state: StanceState }) {
  const holds = useAppStore((s) => s.holds);
  const show = useAppStore((s) => s.showClimber);
  const wallAngle = useAppStore((s) => s.wallAngle);
  const scale = useAppStore((s) => s.climberScale);
  const feetMode = useAppStore((s) => s.feetMode);
  const setFeetMode = useAppStore((s) => s.setFeetMode);
  const setShow = useAppStore((s) => s.setShowClimber);
  const setAssignment = useAppStore((s) => s.setStanceAssignment);
  const hooks = useAppStore((s) => s.stanceHooks);
  const setHook = useAppStore((s) => s.setStanceHook);
  const setWallAngle = useAppStore((s) => s.setWallAngle);
  const setScale = useAppStore((s) => s.setClimberScale);
  const setView = useAppStore((s) => s.setView);
  const labels = useMemo(() => badgeLabels(holds), [holds]);
  const ordered = useMemo(() => [...holds].sort((a, b) => a.order - b.order), [holds]);
  const hasStart = holds.some((h) => h.role === 'start');
  const { stance, assignment, candidates, footholdsStatus, contacts } = state;
  const finding = feetMode === 'any' && footholdsStatus === 'pending';

  const shares = useMemo(() => {
    // Numbers for a position that can't be held would mislead: show none.
    if (!stance?.feasible) return {};
    const raw: Partial<Record<Limb | 'body', number>> = {};
    for (const l of LIMBS) if (stance.load[l]) raw[l] = stance.load[l]!.share;
    // Amendment 2026-11-04, M1: the hips on the wall carry a share too.
    if (stance.body) raw.body = stance.body.share;
    return roundShares(raw);
  }, [stance]);

  return (
    <section className="stance" aria-labelledby="stance-title">
      <h2 id="stance-title" className="stance-title">
        Climber
      </h2>
      {!show ? (
        <>
          <p className="stance-intro">See how a body could hang on your holds.</p>
          <button
            type="button"
            disabled={!hasStart}
            onClick={() => {
              setAssignment(null);
              setShow(true);
              setView('route');
            }}
          >
            Try the start position
          </button>
          {!hasStart && <p className="stance-hint">Tag a start hold first.</p>}
        </>
      ) : (
        <>
          <p className="stance-status" data-ok={stance?.feasible ?? undefined} aria-live="polite">
            {/* Keeps "Working" while unsolved: the E2E waits for it to go (rule 14). */}
            {!stance
              ? finding
                ? 'Working out the position: finding footholds…'
                : 'Working out the position…'
              : stance.feasible
                ? 'Balanced: this position can be held'
                : stance.diagnosis?.text}
          </p>
          <table className="stance-limbs">
            <tbody>
              {LIMBS.map((limb) => {
                const share = shares[limb];
                const foot = limb === 'lf' || limb === 'rf' ? limb : null;
                // That foot's ranked blobs; none for hands, nor while following hands.
                const wall =
                  foot && feetMode === 'any'
                    ? candidates[foot].filter((c) => c.kind === 'blob').map((c) => c.id)
                    : [];
                const id = assignment[limb];
                const stray = isWallFoothold(id) && !wall.includes(id!);
                // Amendment 2026-11-04, M3: a foot on a picked route hold may hook it.
                const contact = contacts[limb];
                const hookable = foot && contact && canHook(foot, contact) ? foot : null;
                return (
                  <tr key={limb} data-limb={limb}>
                    <th scope="row">{LIMB_NAME[limb]}</th>
                    <td>
                      <select
                        aria-label={`${LIMB_NAME[limb]} hold`}
                        value={assignment[limb] ?? ''}
                        onChange={(e) =>
                          setAssignment({ ...assignment, [limb]: e.target.value || null })
                        }
                      >
                        <option value="">Off</option>
                        {foot && <option value={SMEAR}>Smear on the wall</option>}
                        {stray && <option value={id!}>Wall foothold</option>}
                        {wall.map((b, i) => (
                          <option key={b} value={b}>
                            Wall foothold {i + 1}
                          </option>
                        ))}
                        {ordered.map((h) => (
                          <option key={h.id} value={h.id}>
                            Hold {labels.get(h.id)}
                          </option>
                        ))}
                      </select>
                      {hookable && (
                        <select
                          aria-label={`${LIMB_NAME[limb]} hook`}
                          value={
                            hooks[hookable]?.holdId === contact!.holdId ? hooks[hookable]!.hook : ''
                          }
                          onChange={(e) =>
                            setHook(
                              hookable,
                              contact!.holdId,
                              (e.target.value || null) as Hook | null,
                            )
                          }
                        >
                          <option value="">Stand</option>
                          <option value="heel">Heel hook</option>
                          <option value="toe">Toe hook</option>
                        </select>
                      )}
                    </td>
                    <td className="stance-share">
                      {share === undefined ? (
                        '—'
                      ) : (
                        <>
                          <span
                            className="stance-bar"
                            style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                          />
                          <span className="stance-pct">{share}%</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shares.body !== undefined && (
                <tr data-limb="body">
                  <th scope="row">Body on the wall</th>
                  <td />
                  <td className="stance-share">
                    <span
                      className="stance-bar"
                      style={{ width: `${Math.min(100, Math.max(0, shares.body))}%` }}
                    />
                    <span className="stance-pct">{shares.body}%</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {handsPullIn(stance) && (
            <p className="stance-hint">
              Your hands pull you in to the wall; your feet hold your weight.
            </p>
          )}
          {footholdsStatus === 'error' && feetMode === 'any' && (
            <p className="stance-hint">Couldn't find footholds on this photo</p>
          )}
          <div className="stance-feet">
            <span id="stance-feet-label">Feet</span>
            <div role="radiogroup" aria-labelledby="stance-feet-label" className="segmented">
              {FEET_MODES.map((m) => (
                <label key={m.value} className={feetMode === m.value ? 'active' : ''}>
                  <input
                    type="radio"
                    name="stance-feet"
                    checked={feetMode === m.value}
                    onChange={() => setFeetMode(m.value)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div className="stance-controls">
            <label>
              Wall
              <select
                value={wallAngle}
                onChange={(e) => setWallAngle(Number(e.target.value) as WallAngle)}
              >
                {WALL_ANGLES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Climber size
              <input
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={5}
                value={Math.round(scale * 100)}
                onChange={(e) => setScale(Number(e.target.value) / 100)}
              />
              <output>{Math.round(scale * 100)}%</output>
            </label>
          </div>
          <div className="stance-actions">
            <button type="button" onClick={() => setAssignment(null)}>
              Start position
            </button>
            <button type="button" onClick={() => setShow(false)}>
              Hide climber
            </button>
          </div>
          <p className="stance-note">
            Shares of your weight. A simple balance model: real grip strength and friction vary.
          </p>
        </>
      )}
    </section>
  );
}
