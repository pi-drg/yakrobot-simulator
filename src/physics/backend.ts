import type { WheelCommand } from '../control/controller';
import type { Pose } from '../sim/types';

/** World-frame (z up) position and quaternion [w, x, y, z]. */
export interface BodyPose {
  pos: [number, number, number];
  quat: [number, number, number, number];
}

/** What the renderer and HUD read each frame. Backends own and replace it. */
export interface SimState {
  rover: BodyPose;
  /** Planar summary of the rover pose. */
  pose: Pose;
  /** Wheel rotation (rad, about robot-left) ordered FL, FR, RL, RR. */
  wheelAngles: [number, number, number, number];
  /** Forward speed (m/s) and yaw rate (rad/s, CCW +). */
  v: number;
  w: number;
  /** Name of what the chassis is touching, if anything. */
  contact: string | null;
  /** Loose objects by item name. */
  bodies: Record<string, BodyPose>;
  /** Claw arm opening angles (rad), one per arm, 0 = closed. Empty without a claw. */
  clawAngles: number[];
}

/** Non-drive commands that ride along with the wheel duty. */
export interface Aux {
  clawOpen: boolean;
  /** COB LEDs; no effect on physics, carried so a real-robot adapter can forward it. */
  headlights?: boolean;
}

export type BackendName = 'simple' | 'mujoco';

export interface PhysicsBackend {
  readonly name: BackendName;
  /** Advance by dt with the given motor duty (after controller). */
  step(duty: WheelCommand, dt: number, aux: Aux): void;
  state(): SimState;
  /** Put the rover at `pose` and loose objects back where they started. */
  reset(pose: Pose): void;
  dispose(): void;
}

export const yawQuat = (theta: number): [number, number, number, number] => [Math.cos(theta / 2), 0, 0, Math.sin(theta / 2)];

export function quatYaw(q: readonly number[]): number {
  const [w, x, y, z] = q;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}
