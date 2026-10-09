import type { WheelCommand } from '../control/controller';
import type { RobotConfig } from '../control/robot';
import { integratePose } from './integrate';
import type { Pose } from './types';
import { circleBox, type World } from './world';

export interface VehicleParams {
  track: number;
  wheelRadius: number;
  vMax: number;
  tau: number;
  deadZone: number;
  /** Turn-slip factor: actual yaw rate / no-slip yaw rate. Derived so full spin hits limits.turnRate. */
  k: number;
  /** Collision circle radius around the footprint (wheels included). */
  radius: number;
}

export function vehicleParams(r: RobotConfig): VehicleParams {
  const { track_m, wheelbase_m, wheelDiameter_m, wheelWidth_m } = r.geometry;
  return {
    track: track_m,
    wheelRadius: wheelDiameter_m / 2,
    vMax: r.limits.topSpeed_mps,
    tau: r.motor.timeConstant_s,
    deadZone: r.motor.deadZone,
    k: (r.limits.turnRate_radps * track_m) / (2 * r.limits.topSpeed_mps),
    radius: Math.hypot((wheelbase_m + wheelDiameter_m) / 2, (track_m + wheelWidth_m) / 2),
  };
}

export interface VehicleState {
  pose: Pose;
  /** Wheel surface speed per side (m/s). */
  vl: number;
  vr: number;
  /** Accumulated wheel rotation per side (rad), for rendering. */
  angL: number;
  angR: number;
  /** Body velocity actually achieved this step. */
  v: number;
  w: number;
  contact: string | null;
}

export const initialVehicle = (pose: Pose = { x: 0, y: 0, theta: 0 }): VehicleState => ({
  pose, vl: 0, vr: 0, angL: 0, angR: 0, v: 0, w: 0, contact: null,
});

/** Steady-state wheel speed fraction for a duty, after the motor's dead zone. */
export function motorResponse(duty: number, deadZone: number): number {
  const a = Math.min(1, Math.abs(duty));
  if (a <= deadZone) return 0;
  return (Math.sign(duty) * (a - deadZone)) / (1 - deadZone);
}

/**
 * One fixed step: duty -> dead zone -> first-order lag -> differential-drive
 * kinematics with turn slip -> pose -> circle-vs-box collision push-out.
 */
export function stepVehicle(p: VehicleParams, s: VehicleState, cmd: WheelCommand, dt: number, world?: World): VehicleState {
  const alpha = 1 - Math.exp(-dt / p.tau);
  const vl = s.vl + (motorResponse(cmd.left, p.deadZone) * p.vMax - s.vl) * alpha;
  const vr = s.vr + (motorResponse(cmd.right, p.deadZone) * p.vMax - s.vr) * alpha;
  const v = (vl + vr) / 2;
  const w = ((vr - vl) / p.track) * p.k;
  let pose = integratePose(s.pose, { v, w }, dt);

  let contact: string | null = null;
  if (world) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of world.obstacles) {
        const c = circleBox(pose.x, pose.y, p.radius, b);
        if (c) {
          pose = { ...pose, x: pose.x + c.nx, y: pose.y + c.ny };
          contact = c.obstacle;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  return {
    pose,
    vl,
    vr,
    angL: s.angL + (vl / p.wheelRadius) * dt,
    angR: s.angR + (vr / p.wheelRadius) * dt,
    v,
    w,
    contact,
  };
}
