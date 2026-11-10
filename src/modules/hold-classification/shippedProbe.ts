import probe from '../../data/clip-probe.json';
import type { Probe } from './probe';

/**
 * The trained probe the app uses (SPEC-hold-classification › Amendment 2026-10-30, D7). Trained on
 * Beta Guide v11 (CC BY 4.0); shipped after the gate passed on unseen gyms. Set to null for zero-shot.
 */
export const SHIPPED_PROBE: Probe | null = probe;
