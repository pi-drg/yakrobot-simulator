import type { Axes } from '../input/types';
import type { RobotConfig } from './robot';

/** Per-side motor duty in [-1, 1], what the Nano would send to the DRV8833s. */
export interface WheelCommand {
  left: number;
  right: number;
}

export interface ControllerOutput {
  /** Normalised mixer output before minDuty/inversion, in [-1, 1]. */
  mix: WheelCommand;
  /** Motor duty after minDuty and inversion. */
  duty: WheelCommand;
  /** True when the input is older than drive.watchdog_ms. */
  watchdog: boolean;
}

const STOP: WheelCommand = { left: 0, right: 0 };

/** Skid-steer mixer: left = v - w, right = v + w, scaled down together if either exceeds 1. */
export function mixSkid(v: number, w: number): WheelCommand {
  const left = v - w;
  const right = v + w;
  const m = Math.max(1, Math.abs(left), Math.abs(right));
  return { left: left / m + 0, right: right / m + 0 };
}

/** Map |u| in (0, 1] onto [minDuty, 1] so any non-zero command clears the motor dead zone. */
export function applyMinDuty(u: number, minDuty: number): number {
  if (u === 0) return 0;
  return Math.sign(u) * (minDuty + (1 - minDuty) * Math.min(1, Math.abs(u)));
}

const finite = (x: number) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);

/** Pure controller tick: axes in, wheel duty out. `now` is in the same clock as axes.t (seconds). */
export function control(robot: RobotConfig, axes: Axes, now: number): ControllerOutput {
  const { axisSigns, invertLeft, invertRight, minDuty, watchdog_ms } = robot.drive;
  if (now - axes.t > watchdog_ms / 1000) return { mix: STOP, duty: STOP, watchdog: true };

  const v = finite(axes.ly) * axisSigns.ly;
  const w = finite(axes.rx) * axisSigns.rx;
  const mix = mixSkid(v, w);
  const duty = {
    left: applyMinDuty(mix.left, minDuty) * (invertLeft ? -1 : 1),
    right: applyMinDuty(mix.right, minDuty) * (invertRight ? -1 : 1),
  };
  return { mix, duty, watchdog: false };
}
