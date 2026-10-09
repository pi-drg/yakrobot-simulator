import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { WheelCommand } from '../control/controller';
import type { RobotProfile } from '../robots';
import { motorResponse } from '../sim/vehicle';
import type { Pose } from '../sim/types';
import { clawGeomNames, clawGeometry } from '../world/claw';
import type { Room } from '../world/room';
import { quatYaw, yawQuat, type Aux, type BodyPose, type PhysicsBackend, type SimState } from './backend';
import { buildMjcf, WHEELS } from './mjcf';

/** Lazy-load the WASM module (~2.5 MB gzipped) so the page starts without it. */
export async function loadMujoco(): Promise<MainModule> {
  const { default: load } = await import('@mujoco/mujoco');
  return load();
}

/**
 * Rigid-body backend. The controller's duty goes through the motor dead zone
 * into DC-motor actuators; speed, turning, slip and pushing all come out of
 * MuJoCo's contact solver.
 */
export function createMujocoBackend(mj: MainModule, profile: RobotProfile, room: Room): PhysicsBackend {
  const { robot, assembly } = profile;
  const model: MjModel = mj.MjModel.from_xml_string(buildMjcf(profile, room));
  const data: MjData = new mj.MjData(model);
  const JOINT = mj.mjtObj.mjOBJ_JOINT.value;
  const ACT = mj.mjtObj.mjOBJ_ACTUATOR.value;
  const GEOM = mj.mjtObj.mjOBJ_GEOM.value;
  const id = (type: number, name: string) => {
    const i = mj.mj_name2id(model, type, name);
    if (i < 0) throw new Error(`MuJoCo model has no ${name}`);
    return i;
  };
  const qposOf = (joint: string) => model.jnt_qposadr[id(JOINT, joint)] as number;
  const roverQ = qposOf('rover');
  const roverV = model.jnt_dofadr[id(JOINT, 'rover')] as number;
  const wheelQ = WHEELS.map((w) => qposOf(`wheel_${w}`));
  const motor = WHEELS.map((w) => id(ACT, `motor_${w}`));
  const loose = room.items.filter((it) => it.dynamic).map((it) => ({ name: it.name, q: qposOf(it.name) }));
  const claw = clawGeometry(assembly.claw);
  const chassisGeoms = new Set([...assembly.collision.map((c) => id(GEOM, c.name)), ...clawGeomNames(claw).map((g) => id(GEOM, g))]);
  const clawQ = claw ? claw.arms.map((a) => qposOf(`claw_${a.side}`)) : [];
  const clawServo = claw ? claw.arms.map((a) => id(ACT, `servo_claw_${a.side}`)) : [];
  let clawOpen = true;
  const geomName = (g: number) => mj.mj_id2name(model, GEOM, g) ?? `geom ${g}`;
  const substeps = (dt: number) => Math.max(1, Math.round(dt / model.opt.timestep));
  const dz = robot.motor.deadZone;

  const read = (q: number): BodyPose => {
    const p = data.qpos;
    return { pos: [p[q], p[q + 1], p[q + 2]], quat: [p[q + 3], p[q + 4], p[q + 5], p[q + 6]] };
  };

  function chassisContact(): string | null {
    const n = data.ncon;
    if (n === 0) return null;
    const vec = data.contact;
    try {
      for (let i = 0; i < n; i++) {
        const c = vec.get(i);
        if (!c) continue;
        const a = c.geom1;
        const b = c.geom2;
        if (chassisGeoms.has(a) && !chassisGeoms.has(b)) return geomName(b);
        if (chassisGeoms.has(b) && !chassisGeoms.has(a)) return geomName(a);
      }
      return null;
    } finally {
      vec.delete();
    }
  }

  const backend: PhysicsBackend = {
    name: 'mujoco',
    step(duty: WheelCommand, dt: number, aux: Aux) {
      clawOpen = aux.clawOpen;
      const l = motorResponse(duty.left, dz);
      const r = motorResponse(duty.right, dz);
      const ctrl = data.ctrl;
      ctrl[motor[0]] = l;
      ctrl[motor[1]] = r;
      ctrl[motor[2]] = l;
      ctrl[motor[3]] = r;
      for (const s of clawServo) ctrl[s] = clawOpen && claw ? claw.openAngle : 0;
      for (let i = substeps(dt); i > 0; i--) mj.mj_step(model, data);
    },
    state(): SimState {
      const rover = read(roverQ);
      const yaw = quatYaw(rover.quat);
      const qv = data.qvel;
      const bodies: Record<string, BodyPose> = {};
      for (const b of loose) bodies[b.name] = read(b.q);
      const q = data.qpos;
      return {
        rover,
        pose: { x: rover.pos[0], y: rover.pos[1], theta: yaw },
        wheelAngles: [q[wheelQ[0]], q[wheelQ[1]], q[wheelQ[2]], q[wheelQ[3]]],
        v: qv[roverV] * Math.cos(yaw) + qv[roverV + 1] * Math.sin(yaw),
        // free-joint angular velocity is in the body frame; z is yaw rate when level
        w: qv[roverV + 5],
        contact: chassisContact(),
        bodies,
        clawAngles: clawQ.map((i) => q[i]),
      };
    },
    reset(pose: Pose) {
      mj.mj_resetData(model, data);
      const q = data.qpos;
      const quat = yawQuat(pose.theta);
      q[roverQ] = pose.x;
      q[roverQ + 1] = pose.y;
      q[roverQ + 2] = 0.002;
      for (let i = 0; i < 4; i++) q[roverQ + 3 + i] = quat[i];
      // start with the claw open
      if (claw) for (const i of clawQ) q[i] = claw.openAngle;
      mj.mj_forward(model, data);
    },
    dispose() {
      data.delete();
      model.delete();
    },
  };
  backend.reset(room.spawn);
  return backend;
}
