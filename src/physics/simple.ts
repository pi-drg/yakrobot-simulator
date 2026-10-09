import type { WheelCommand } from '../control/controller';
import type { RobotProfile } from '../robots';
import { initialVehicle, stepVehicle, vehicleParams, type VehicleState } from '../sim/vehicle';
import type { Pose } from '../sim/types';
import type { Obstacle, World } from '../sim/world';
import { walls, type Item, type Room } from '../world/room';
import { clawGeometry } from '../world/claw';
import { yawQuat, type Aux, type BodyPose, type PhysicsBackend, type SimState } from './backend';

/** Anything taller than this blocks the rover in the simple model; lower items (the rug) are driven over. */
const MIN_OBSTACLE_HEIGHT = 0.03;

function itemObstacle(it: Item): Obstacle | null {
  const s = it.shape;
  const [hx, hy, h] =
    s.kind === 'box' ? [s.size[0] / 2, s.size[1] / 2, s.size[2]]
    : s.kind === 'cylinder' ? [s.radius, s.radius, s.height]
    : [s.radius, s.radius, s.radius * 2];
  if (h < MIN_OBSTACLE_HEIGHT && it.pos[2] < MIN_OBSTACLE_HEIGHT) return null;
  return { name: it.name, cx: it.pos[0], cy: it.pos[1], hx, hy, rot: it.yaw ?? 0, h };
}

/** Room -> 2D obstacle list. Loose objects count as fixed here. */
export function roomWorld(room: Room): World {
  const obstacles: Obstacle[] = walls(room).map((w) => ({
    name: w.name, cx: w.pos[0], cy: w.pos[1], hx: w.size[0] / 2, hy: w.size[1] / 2, rot: 0, h: w.size[2],
  }));
  for (const it of room.items) {
    const o = itemObstacle(it);
    if (o) obstacles.push(o);
  }
  return { obstacles };
}

const itemPose = (it: Item): BodyPose => ({ pos: [...it.pos], quat: yawQuat(it.yaw ?? 0) });

/** The phase-4 kinematic model behind the backend interface. */
export function createSimpleBackend(profile: RobotProfile, room: Room): PhysicsBackend {
  const params = vehicleParams(profile.robot);
  const world = roomWorld(room);
  const bodies: Record<string, BodyPose> = {};
  for (const it of room.items) if (it.dynamic) bodies[it.name] = itemPose(it);
  let s: VehicleState = initialVehicle(room.spawn);
  const claw = clawGeometry(profile.assembly.claw);
  let clawOpen = true;

  return {
    name: 'simple',
    step(duty: WheelCommand, dt: number, aux: Aux) {
      s = stepVehicle(params, s, duty, dt, world);
      clawOpen = aux.clawOpen;
    },
    state(): SimState {
      const { pose } = s;
      return {
        rover: { pos: [pose.x, pose.y, 0], quat: yawQuat(pose.theta) },
        pose,
        wheelAngles: [s.angL, s.angR, s.angL, s.angR],
        v: s.v,
        w: s.w,
        contact: s.contact,
        bodies,
        // no servo dynamics here: the claw snaps to the commanded pose
        clawAngles: claw ? claw.arms.map(() => (clawOpen ? claw.openAngle : 0)) : [],
      };
    },
    reset(pose: Pose) {
      s = initialVehicle(pose);
    },
    dispose() {},
  };
}
