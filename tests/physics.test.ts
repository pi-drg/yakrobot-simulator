import { beforeAll, describe, expect, it } from 'vitest';
import type { MainModule } from '@mujoco/mujoco';
import { control } from '../src/control/controller';
import { ROBOT } from '../src/control/robot';
import { DT } from '../src/sim/loop';
import type { PhysicsBackend } from '../src/physics/backend';
import { buildMjcf } from '../src/physics/mjcf';
import { createMujocoBackend, loadMujoco } from '../src/physics/mujoco';
import { createSimpleBackend, roomWorld } from '../src/physics/simple';
import { ROOM, type Item, type Room } from '../src/world/room';
import { getProfile } from '../src/robots';
const YAK = getProfile('yakrobot-4wd');
const assembly = YAK.assembly;

let mj: MainModule;
beforeAll(async () => {
  mj = await loadMujoco();
});

const empty = (items: Item[] = []): Room => ({ ...ROOM, size: [8, 8], items, spawn: { x: 0, y: 0, theta: 0 } });

function drive(b: PhysicsBackend, ly: number, rx: number, seconds: number, clawOpen = true) {
  for (let i = 0; i < Math.round(seconds / DT); i++) b.step(control(ROBOT, { lx: 0, ly, rx, t: 0 }, 0).duty, DT, { clawOpen });
  return b.state();
}

/** Ball position in the rover's frame (x ahead, y left). */
function ballInRoverFrame(s: ReturnType<PhysicsBackend['state']>, name = 'ball'): [number, number] {
  const p = s.bodies[name].pos;
  const dx = p[0] - s.pose.x;
  const dy = p[1] - s.pose.y;
  const c = Math.cos(s.pose.theta);
  const sn = Math.sin(s.pose.theta);
  return [dx * c + dy * sn, -dx * sn + dy * c];
}

describe('MuJoCo model', () => {
  it('compiles the full room with every item', () => {
    const b = createMujocoBackend(mj, YAK, ROOM);
    const s = b.state();
    for (const it of ROOM.items.filter((i) => i.dynamic)) expect(s.bodies[it.name]).toBeDefined();
    b.dispose();
    expect(buildMjcf(YAK, ROOM)).toContain('<freejoint name="football"/>');
  });

  it('rover rests level on its wheels, loose items stay put', () => {
    const b = createMujocoBackend(mj, YAK, ROOM);
    const s = drive(b, 0, 0, 1);
    // spawn is on the 6 mm rug
    expect(s.rover.pos[2]).toBeGreaterThan(-0.003);
    expect(s.rover.pos[2]).toBeLessThan(0.009);
    expect(Math.abs(s.rover.quat[1])).toBeLessThan(0.01); // no roll
    expect(Math.abs(s.rover.quat[2])).toBeLessThan(0.01); // no pitch
    for (const it of ROOM.items.filter((i) => i.dynamic)) {
      const p = s.bodies[it.name].pos;
      expect(Math.hypot(p[0] - it.pos[0], p[1] - it.pos[1], p[2] - it.pos[2])).toBeLessThan(0.01);
    }
    b.dispose();
  });
});

describe('MuJoCo driving', () => {
  it('full stick reaches top speed within 5%, straight', () => {
    const b = createMujocoBackend(mj, YAK, empty());
    const s = drive(b, 1, 0, 2);
    expect(Math.abs(s.v - ROBOT.limits.topSpeed_mps) / ROBOT.limits.topSpeed_mps).toBeLessThan(0.05);
    expect(Math.abs(s.pose.y)).toBeLessThan(0.01);
    b.dispose();
  });

  it('full-stick spin is clockwise, in place, within 25% of turnRate', () => {
    const b = createMujocoBackend(mj, YAK, empty());
    const s = drive(b, 0, 1, 2);
    expect(s.w).toBeLessThan(0);
    expect(Math.abs(Math.abs(s.w) - ROBOT.limits.turnRate_radps) / ROBOT.limits.turnRate_radps).toBeLessThan(0.25);
    // the open claw puts its mass well forward of the axles, so the spin centre wanders a little
    expect(Math.hypot(s.pose.x, s.pose.y)).toBeLessThan(0.08);
    b.dispose();
  });

  it('stick left while driving turns CCW', () => {
    const b = createMujocoBackend(mj, YAK, empty());
    const s = drive(b, 1, -1, 1);
    expect(s.w).toBeGreaterThan(0.5);
    b.dispose();
  });

  it('coasts to a stop when the stick is released', () => {
    const b = createMujocoBackend(mj, YAK, empty());
    drive(b, 1, 0, 1);
    const s = drive(b, 0, 0, 1);
    expect(Math.abs(s.v)).toBeLessThan(0.01);
    b.dispose();
  });

  it('is deterministic', () => {
    const run = () => {
      const b = createMujocoBackend(mj, YAK, ROOM);
      drive(b, 1, 0.4, 1);
      const s = drive(b, 0.6, -0.8, 1);
      b.dispose();
      return s.pose;
    };
    expect(run()).toEqual(run());
  });
});

describe('MuJoCo interactions', () => {
  const ball: Item = {
    name: 'ball', shape: { kind: 'sphere', radius: 0.07 }, pos: [0.4, 0, 0.07], color: '#fff', dynamic: { mass: 0.12, rolling: 0.002 },
  };

  it('pushes the football', () => {
    const b = createMujocoBackend(mj, YAK, empty([ball]));
    const s = drive(b, 0.6, 0, 1.5);
    expect(s.bodies.ball.pos[0]).toBeGreaterThan(0.7);
    b.dispose();
  });

  it('walls stop the rover and report the contact', () => {
    const room = { ...ROOM, items: [], spawn: { x: 1.4, y: 0, theta: 0 } };
    const b = createMujocoBackend(mj, YAK, room);
    const seen = new Set<string>();
    let maxX = -Infinity;
    for (let i = 0; i < 100; i++) {
      const s = drive(b, 1, 0, DT, false);
      if (s.contact) seen.add(s.contact);
      maxX = Math.max(maxX, s.pose.x);
    }
    // front of the ESP32 enclosure is 0.108 m ahead of the rover origin
    expect(maxX).toBeLessThan(room.size[0] / 2 - 0.1);
    expect(seen).toContain('wall-e');
    b.dispose();
  });

  it('drives over the rug', () => {
    const rug = ROOM.items.find((i) => i.name === 'rug')!;
    const room = empty([{ ...rug, pos: [0.4, 0, rug.pos[2]], yaw: 0 }]);
    const b = createMujocoBackend(mj, YAK, room);
    const s = drive(b, 1, 0, 3);
    expect(s.pose.x).toBeGreaterThan(1.4); // past the far edge at 1.3
    b.dispose();
  });

  it('reset puts the rover and loose objects back', () => {
    const b = createMujocoBackend(mj, YAK, empty([ball]));
    drive(b, 0.6, 0, 1.5);
    b.reset({ x: 1, y: 2, theta: 0.5 });
    const s = b.state();
    expect(s.pose.x).toBeCloseTo(1, 6);
    expect(s.pose.theta).toBeCloseTo(0.5, 6);
    expect(s.bodies.ball.pos[0]).toBeCloseTo(0.4, 6);
    b.dispose();
  });
});

describe('claw dribbling', () => {
  const ball: Item = {
    name: 'ball', shape: { kind: 'sphere', radius: 0.07 }, pos: [0.45, 0, 0.07], color: '#fff', dynamic: { mass: 0.12, friction: 0.7, rolling: 0.002 },
  };
  const grab = (b: PhysicsBackend) => {
    drive(b, 0.5, 0, 1.2); // scoop with the claw open
    return drive(b, 0, 0, 0.6, false); // close
  };

  it('scoops the ball into the cradle and closes around it', () => {
    const b = createMujocoBackend(mj, YAK, empty([ball]));
    const s = grab(b);
    const [x, y] = ballInRoverFrame(s);
    expect(x).toBeGreaterThan(0.15);
    expect(x).toBeLessThan(0.26);
    expect(Math.abs(y)).toBeLessThan(0.03);
    expect(Math.max(...s.clawAngles)).toBeLessThan(0.15);
    b.dispose();
  });

  it('keeps the ball through left and right turns', () => {
    const b = createMujocoBackend(mj, YAK, empty([ball]));
    grab(b);
    for (const [ly, rx] of [[0.5, 0.6], [0.5, -0.6], [0.6, 0], [0, 0.7]]) {
      const s = drive(b, ly, rx, 1.5, false);
      const [x, y] = ballInRoverFrame(s);
      expect(x).toBeGreaterThan(0.12);
      expect(x).toBeLessThan(0.3);
      expect(Math.abs(y)).toBeLessThan(0.08);
      expect(s.bodies.ball.pos[2]).toBeLessThan(0.08); // still on the floor, not riding the claw
    }
    b.dispose();
  });

  it('lets go when opened and backed away', () => {
    const b = createMujocoBackend(mj, YAK, empty([ball]));
    grab(b);
    drive(b, 0, 0, 0.5, true);
    const s = drive(b, -0.6, 0, 1, true);
    expect(ballInRoverFrame(s)[0]).toBeGreaterThan(0.35);
    b.dispose();
  });

  it('crosses the rug edge both ways carrying the ball without the claw catching', () => {
    const rug = ROOM.items.find((i) => i.name === 'rug')!;
    const room = empty([ball, { ...rug, pos: [1.6, 0, rug.pos[2]], yaw: 0 }]);
    const b = createMujocoBackend(mj, YAK, room);
    grab(b);
    const touched = new Set<string>();
    let minX = Infinity;
    let maxX = -Infinity;
    for (const ly of [0.6, -0.6]) {
      for (let i = 0; i < 400; i++) {
        const s = drive(b, ly, 0, DT, false);
        if (s.contact) touched.add(s.contact);
        maxX = Math.max(maxX, s.pose.x);
        minX = Math.min(minX, s.pose.x);
        expect(ballInRoverFrame(s)[0]).toBeGreaterThan(0.12); // ball stays in the claw
      }
    }
    // rug centred at x 1.6, 1.8 m long: edges at 0.7 and 2.5. The rover's origin passing
    // an edge means both axles have crossed it.
    expect(maxX).toBeGreaterThan(2.5);
    expect(minX).toBeLessThan(0.7);
    expect([...touched].filter((c) => c === 'rug' || c === 'floor')).toEqual([]);
    b.dispose();
  });

  it('stays below the ESP32-CAM lens so the camera view ahead is clear', () => {
    const lensZ = (ROBOT.geometry.wheelDiameter_m / 2 - assembly.axle.z_mm / 1000) + assembly.camera.position_mm[2] / 1000;
    const top = (assembly.claw.groundClearance_mm + assembly.claw.height_mm) / 1000;
    expect(top).toBeLessThan(lensZ - 0.003);
  });
});

describe('simple backend in the room', () => {
  it('drives over the rug but not through furniture or walls', () => {
    const names = roomWorld(ROOM).obstacles.map((o) => o.name);
    expect(names).not.toContain('rug');
    expect(names).toEqual(expect.arrayContaining(['wall-n', 'bed-frame', 'sofa-base', 'football']));
  });
  it('matches the backend interface', () => {
    const b = createSimpleBackend(YAK, ROOM);
    const s = drive(b, 1, 0, 1);
    expect(s.v).toBeGreaterThan(0.9 * ROBOT.limits.topSpeed_mps);
    expect(s.bodies.football).toBeDefined();
  });
});
