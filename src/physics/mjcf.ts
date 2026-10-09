import type { RobotProfile } from '../robots';
import { clawGeometry, type ClawBox } from '../world/claw';
import { walls, type Item, type Room } from '../world/room';

/** Wheel order shared with the renderer: FL, FR, RL, RR. Robot left is +y. */
export const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const;


const n = (v: number) => +v.toFixed(6);
const v3 = (a: readonly number[]) => a.map(n).join(' ');

function itemGeom(it: Item, extra = ''): string {
  const s = it.shape;
  const yaw = it.yaw ? ` euler="0 0 ${n(it.yaw)}"` : '';
  const size =
    s.kind === 'box' ? `type="box" size="${v3(s.size.map((x) => x / 2))}"`
    : s.kind === 'cylinder' ? `type="cylinder" size="${n(s.radius)} ${n(s.height / 2)}"`
    : `type="sphere" size="${n(s.radius)}"`;
  return `<geom name="${it.name}" ${size}${yaw}${extra}/>`;
}

/**
 * Build the MuJoCo model: room (static geoms), loose objects (free bodies) and
 * the rover (free chassis + 4 hinged wheels with DC-motor actuators). Every
 * rover number comes from robot.json / assembly.json.
 */
export function buildMjcf(profile: RobotProfile, room: Room): string {
  const { robot, assembly } = profile;
  const g = robot.geometry;
  const P = robot.physics;
  const R = g.wheelDiameter_m / 2;
  const clearance = R - assembly.axle.z_mm / 1000;
  const chassisMass = P.mass_kg - 4 * P.wheelMass_kg;
  // DC motor: torque = stall * (ctrl - speed / noLoadSpeed), ctrl in [-1, 1]
  const stall = robot.motor.stallTorque_Nm;
  const noLoad = robot.limits.topSpeed_mps / R;
  const mu = P.tyreFriction;
  const [fw, fd] = room.size;
  const sp = room.spawn;

  // boxes with a fixed mass_kg keep it; the rest of the chassis mass is shared by volume
  const vol = (c: { size_mm: number[] }) => c.size_mm[0] * c.size_mm[1] * c.size_mm[2];
  const fixedMass = assembly.collision.reduce((t, c) => t + (c.mass_kg ?? 0), 0);
  const freeVol = assembly.collision.reduce((t, c) => t + (c.mass_kg === undefined ? vol(c) : 0), 0);
  const chassisGeoms = assembly.collision
    .map((c) => {
      const pos = [c.pos_mm[0] / 1000, c.pos_mm[1] / 1000, clearance + c.pos_mm[2] / 1000];
      const mass = c.mass_kg ?? ((chassisMass - fixedMass) * vol(c)) / freeVol;
      return `      <geom name="${c.name}" type="box" size="${v3(c.size_mm.map((x) => x / 2000))}" pos="${v3(pos)}" mass="${n(mass)}"/>`;
    })
    .join('\n');

  const claw = clawGeometry(assembly.claw);
  const clawPieceMass = assembly.claw.mass_kg / 5;
  const box = (b: ClawBox) =>
    `<geom name="${b.name}" type="box" size="${v3(b.size.map((x) => x / 2))}" pos="${v3(b.pos)}" euler="0 0 ${n(b.yaw)}" mass="${n(clawPieceMass)}" friction="0.3 0.005 0.0001" rgba="0.23 0.25 0.27 1"/>`;
  const clawXml = claw
    ? [
        `      ${box(claw.backplate)}`,
        ...claw.arms.map(
          (a) => `      <body name="claw_${a.side}" pos="${v3(a.pivot)}">
        <joint name="claw_${a.side}" type="hinge" axis="0 0 ${a.openSign}" range="-0.05 ${n(claw.openAngle + 0.05)}" damping="${assembly.claw.servoDamping}" armature="0.0001"/>
        ${a.boxes.map(box).join('\n        ')}
      </body>`,
        ),
      ].join('\n')
    : '';
  const clawActuators = claw
    ? claw.arms.map((a) => `    <position name="servo_claw_${a.side}" joint="claw_${a.side}" kp="${assembly.claw.servoKp_Nm_per_rad}" ctrlrange="0 ${n(claw.openAngle)}"/>`).join('\n')
    : '';

  const wheelBodies = WHEELS.map((w) => {
    const x = (w[0] === 'f' ? 1 : -1) * (g.wheelbase_m / 2);
    const y = (w[1] === 'l' ? 1 : -1) * (g.track_m / 2);
    return `      <body name="wheel_${w}" pos="${v3([x, y, R])}">
        <joint name="wheel_${w}" type="hinge" axis="0 1 0" armature="${P.armature_kgm2}" damping="0.00001"/>
        <geom name="tyre_${w}" type="cylinder" size="${n(R)} ${n(g.wheelWidth_m / 2)}" euler="1.5707963 0 0" mass="${P.wheelMass_kg}" friction="${mu} 0.01 0.0001" rgba="0.1 0.1 0.1 1"/>
      </body>`;
  }).join('\n');

  const loose = room.items.filter((it) => it.dynamic).map((it) => {
    const d = it.dynamic!;
    const fr = `${d.friction ?? 0.6} 0.005 ${d.rolling ?? 0.0001}`;
    const condim = it.shape.kind === 'sphere' ? 6 : 4;
    // yaw lives on the body so its quaternion is the full pose the renderer needs
    const placed = { ...it, yaw: undefined };
    const yaw = it.yaw ? ` euler="0 0 ${n(it.yaw)}"` : '';
    return `    <body name="${it.name}" pos="${v3(it.pos)}"${yaw}>
      <freejoint name="${it.name}"/>
      ${itemGeom(placed, ` mass="${d.mass}" friction="${fr}" condim="${condim}"`)}
    </body>`;
  }).join('\n');

  const fixed = room.items
    .filter((it) => !it.dynamic)
    .map((it) => `    ${itemGeom(it, ` pos="${v3(it.pos)}"`)}`)
    .join('\n');

  const wallGeoms = walls(room)
    .map((w) => `    <geom name="${w.name}" type="box" size="${v3(w.size.map((x) => x / 2))}" pos="${v3(w.pos)}"/>`)
    .join('\n');

  return `<mujoco model="${profile.id}-room">
  <compiler angle="radian" autolimits="true"/>
  <option timestep="0.002" integrator="implicitfast" cone="elliptic" impratio="10"/>
  <default>
    <geom condim="3" friction="0.8 0.005 0.0001"/>
  </default>
  <worldbody>
    <geom name="floor" type="plane" size="${n(fw / 2)} ${n(fd / 2)} 0.1" friction="0.3 0.005 0.0001"/>
${wallGeoms}
${fixed}
${loose}
    <body name="rover" pos="${v3([sp.x, sp.y, 0.002])}" euler="0 0 ${n(sp.theta)}">
      <freejoint name="rover"/>
${chassisGeoms}
${clawXml}
${wheelBodies}
    </body>
  </worldbody>
  <actuator>
${WHEELS.map((w) => `    <general name="motor_${w}" joint="wheel_${w}" ctrlrange="-1 1" gainprm="${n(stall)}" biastype="affine" biasprm="0 0 ${n(-stall / noLoad)}"/>`).join('\n')}
${clawActuators}
  </actuator>
</mujoco>
`;
}

