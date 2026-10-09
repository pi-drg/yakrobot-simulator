import { ZERO, type Axes, type RawAxes } from './types';

export const DEADBAND = 0.15;

/** Zero inside the deadband, then rescale so the output still spans [-1, 1]. */
export function deadband(v: number, db = DEADBAND): number {
  if (!Number.isFinite(v)) return 0;
  const c = Math.max(-1, Math.min(1, v));
  const a = Math.abs(c);
  if (a <= db) return 0;
  return (Math.sign(c) * (a - db)) / (1 - db);
}

export function shape(raw: RawAxes, t: number): Axes {
  return { lx: deadband(raw.lx), ly: deadband(raw.ly), rx: deadband(raw.rx), t };
}

const mag = (a: RawAxes) => Math.max(Math.abs(a.lx), Math.abs(a.ly), Math.abs(a.rx));

/**
 * Merge shaped samples from every source: the one with the largest deflection
 * wins, so any source can take over without a mode switch. Ties keep list order.
 * A latched stop forces zero.
 */
export function merge(samples: readonly (Axes | null)[], t: number, stopped: boolean): Axes {
  if (stopped) return { ...ZERO, t };
  let best: Axes | null = null;
  for (const s of samples) {
    if (s && mag(s) > 0 && (!best || mag(s) > mag(best))) best = s;
  }
  return best ? { ...best, t } : { ...ZERO, t };
}
