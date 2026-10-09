import type { BodyCommand, Pose } from './types';

/**
 * Ideal unicycle integration of a body command over dt. Placeholder for the
 * phase-4 vehicle model (motor lag, dead zone, slip).
 */
export function integratePose(p: Pose, cmd: BodyCommand, dt: number): Pose {
  const theta = p.theta + cmd.w * dt;
  const mid = p.theta + (cmd.w * dt) / 2;
  return {
    x: p.x + cmd.v * Math.cos(mid) * dt,
    y: p.y + cmd.v * Math.sin(mid) * dt,
    theta,
  };
}
