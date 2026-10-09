import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MainModule } from '@mujoco/mujoco';
import { control } from '../src/control/controller';
import { DT } from '../src/sim/loop';
import { getProfile, PROFILES, DEFAULT_ROBOT_ID, type RobotProfile } from '../src/robots';
import { parseAssembly } from '../src/robots/assembly';
import type { PhysicsBackend } from '../src/physics/backend';
import { createMujocoBackend, loadMujoco } from '../src/physics/mujoco';
import { createSimpleBackend } from '../src/physics/simple';
import { lensPosition } from '../src/render/onboard';
import { roverLayout } from '../src/render/rover';
import { clawGeometry } from '../src/world/claw';
import { ROOM, type Item, type Room } from '../src/world/room';

let mj: MainModule;
beforeAll(async () => {
  mj = await loadMujoco();
});

const empty = (items: Item[] = []): Room => ({ ...ROOM, size: [8, 8], items, spawn: { x: 0, y: 0, theta: 0 } });
const ball: Item = {
  name: 'ball', shape: { kind: 'sphere', radius: 0.07 }, pos: [0.45, 0, 0.07], color: '#fff', dynamic: { mass: 0.12, friction: 0.7, rolling: 0.002 },
};

function drive(p: RobotProfile, b: PhysicsBackend, ly: number, rx: number, seconds: number, clawOpen = true) {
  for (let i = 0; i < Math.round(seconds / DT); i++) b.step(control(p.robot, { lx: 0, ly, rx, t: 0 }, 0).duty, DT, { clawOpen });
  return b.state();
}

describe('profile registry', () => {
  it('finds the robots, default first', () => {
    expect(PROFILES.map((p) => p.id)).toEqual(['yakrobot-4wd']);
    expect(PROFILES[0].id).toBe(DEFAULT_ROBOT_ID);
  });
  it('falls back to the default for unknown ids', () => {
    expect(getProfile('nope').id).toBe(DEFAULT_ROBOT_ID);
    expect(getProfile(null).id).toBe(DEFAULT_ROBOT_ID);
    expect(getProfile('yakrobot-4wd').name).toBe('yakrobot-4wd');
  });
  it('rejects broken assemblies with the field name', () => {
    const a = JSON.parse(JSON.stringify(getProfile('yakrobot-4wd').assembly));
    a.collision.push({ ...a.collision[0] });
    expect(() => parseAssembly(a)).toThrow(/unique name/);
    const b = JSON.parse(JSON.stringify(getProfile('yakrobot-4wd').assembly));
    b.parts[0].translate_mm = [0, 0];
    expect(() => parseAssembly(b)).toThrow(/parts\[0\].translate_mm/);
  });
});

for (const p of PROFILES) {
  describe(`${p.name} (${p.id})`, () => {
    const L = roverLayout(p);

    it('axle and wheelbase agree, frame clears the floor', () => {
      expect((p.assembly.axle.x_mm * 2) / 1000).toBeCloseTo(p.robot.geometry.wheelbase_m, 6);
      expect(L.clearance).toBeGreaterThan(0.01);
    });

    it('wheels clear the body sides', () => {
      expect(L.wheelZ - p.robot.geometry.wheelWidth_m / 2 - p.assembly.bodyHalfWidth_mm / 1000).toBeGreaterThanOrEqual(0.003);
    });

    it('claw stays below the camera lens and in front of the tyres', () => {
      const c = p.assembly.claw;
      const top = (c.groundClearance_mm + c.height_mm) / 1000;
      expect(top).toBeLessThan(lensPosition(p)[2] - 0.003);
      // tyre front edge at the claw's top height vs the back of the claw pieces
      const R = L.wheelRadius;
      const h = Math.min(top, R);
      const tyreFront = L.wheelX + Math.sqrt(R * R - (R - h) ** 2);
      const g = clawGeometry(c)!;
      expect(g.backplate.pos[0] - g.backplate.size[0] / 2).toBeGreaterThan(tyreFront); // size = [thickness, width, height]
      expect(g.arms[0].pivot[0] - c.thickness_mm / 2000).toBeGreaterThan(tyreFront);
      // a 140 mm ball fits between the closed arms
      expect(2 * (c.pivot_y_mm - c.thickness_mm / 2) / 1000).toBeGreaterThan(0.14);
    });

    it('rests level on its wheels in MuJoCo', () => {
      const b = createMujocoBackend(mj, p, empty());
      const s = drive(p, b, 0, 0, 1);
      expect(Math.abs(s.rover.pos[2])).toBeLessThan(0.003);
      expect(Math.abs(s.rover.quat[1])).toBeLessThan(0.01);
      expect(Math.abs(s.rover.quat[2])).toBeLessThan(0.01);
      b.dispose();
    });

    it('reaches top speed within 5% and drives straight', () => {
      const b = createMujocoBackend(mj, p, empty());
      const s = drive(p, b, 1, 0, 2);
      expect(Math.abs(s.v - p.robot.limits.topSpeed_mps) / p.robot.limits.topSpeed_mps).toBeLessThan(0.05);
      expect(Math.abs(s.pose.y)).toBeLessThan(0.01);
      b.dispose();
    });

    it('spins clockwise in place for full right stick', () => {
      const b = createMujocoBackend(mj, p, empty());
      const s = drive(p, b, 0, 1, 2);
      expect(s.w).toBeLessThan(-2);
      expect(Math.hypot(s.pose.x, s.pose.y)).toBeLessThan(0.1);
      b.dispose();
    });

    it('grabs the ball and keeps it through a turn', () => {
      const b = createMujocoBackend(mj, p, empty([ball]));
      drive(p, b, 0.5, 0, 1.2);
      drive(p, b, 0, 0, 0.6, false);
      const s = drive(p, b, 0.5, 0.6, 1.5, false);
      const q = s.bodies.ball.pos;
      const dx = q[0] - s.pose.x;
      const dy = q[1] - s.pose.y;
      const ahead = dx * Math.cos(s.pose.theta) + dy * Math.sin(s.pose.theta);
      expect(ahead).toBeGreaterThan(0.12);
      expect(ahead).toBeLessThan(0.32);
      b.dispose();
    });

    it('works with the simple backend', () => {
      const s = drive(p, createSimpleBackend(p, ROOM), 1, 0, 1);
      expect(s.v).toBeGreaterThan(0.8 * p.robot.limits.topSpeed_mps);
    });
  });
}

describe('yakrobot-4wd design files', () => {
  const yak = getProfile('yakrobot-4wd');
  it('OpenSCAD part list matches the assembly', () => {
    const cad = JSON.parse(readFileSync('robots/yakrobot-4wd/cad.json', 'utf8'));
    expect(cad.parts.map((n: string) => `${n}.stl`)).toEqual(yak.assembly.parts.map((p) => p.file));
    expect(existsSync(cad.scad)).toBe(true);
  });
  it('uses the stock 65 mm TT wheels, a two-part styled body and a front camera pod, no mast', () => {
    expect(yak.robot.geometry.wheelDiameter_m).toBe(0.065);
    expect(yak.assembly.wheelStyle).toBe('tt');
    const names = yak.assembly.parts.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['body_lower', 'top_cover', 'camera_shell']));
    expect(names).not.toContain('accent_band'); // single-filament: no separate colour strip
    expect(names).not.toContain('camera_mast');
  });
  it('body shell stays inside the wheels and behind the bumper', () => {
    const body = yak.assembly.collision.find((c) => c.name === 'body_shell')!;
    const L = roverLayout(yak);
    expect(body.size_mm[1] / 2000).toBeLessThan(L.wheelZ - yak.robot.geometry.wheelWidth_m / 2);
    const bumper = yak.assembly.collision.find((c) => c.name === 'bumper')!;
    expect(body.pos_mm[0] + body.size_mm[0] / 2).toBeLessThanOrEqual(bumper.pos_mm[0] - bumper.size_mm[0] / 2);
  });
  it('lens sits inside the shell, behind its front face, tilted down', () => {
    const shell = yak.assembly.collision.find((c) => c.name === 'camera_shell')!;
    const [x, , z] = yak.assembly.camera.position_mm;
    expect(x).toBeLessThanOrEqual(shell.pos_mm[0] + shell.size_mm[0] / 2);
    expect(Math.abs(z - shell.pos_mm[2])).toBeLessThan(shell.size_mm[2] / 2);
    expect(yak.assembly.camera.pitch_deg).toBeLessThan(0);
  });
});
