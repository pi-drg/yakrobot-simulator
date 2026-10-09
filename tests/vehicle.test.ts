import { describe, expect, it } from 'vitest';
import { control } from '../src/control/controller';
import { ROBOT } from '../src/control/robot';
import { DT } from '../src/sim/loop';
import { initialVehicle, motorResponse, stepVehicle, vehicleParams, type VehicleState } from '../src/sim/vehicle';
import { circleBox, type World } from '../src/sim/world';

const P = vehicleParams(ROBOT);

function drive(ly: number, rx: number, seconds: number, world?: World, s0 = initialVehicle()): VehicleState {
  let s = s0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const { duty } = control(ROBOT, { lx: 0, ly, rx, t: 0 }, 0);
    s = stepVehicle(P, s, duty, DT, world);
  }
  return s;
}

describe('full-stick response (phase 4 done criterion)', () => {
  it('reaches top speed within 5%', () => {
    const s = drive(1, 0, 2);
    expect(Math.abs(s.v - ROBOT.limits.topSpeed_mps) / ROBOT.limits.topSpeed_mps).toBeLessThan(0.05);
    expect(s.pose.y).toBeCloseTo(0, 9);
    expect(s.pose.theta).toBeCloseTo(0, 9);
  });
  it('reaches turn rate within 5% when spinning', () => {
    const s = drive(0, 1, 2);
    expect(Math.abs(Math.abs(s.w) - ROBOT.limits.turnRate_radps) / ROBOT.limits.turnRate_radps).toBeLessThan(0.05);
    expect(s.w).toBeLessThan(0); // stick right = clockwise
    expect(Math.hypot(s.pose.x, s.pose.y)).toBeLessThan(1e-9);
  });
  it('turns left (CCW) for stick left while driving forward', () => {
    const s = drive(1, -0.5, 0.5);
    expect(s.pose.theta).toBeGreaterThan(0);
    expect(s.pose.y).toBeGreaterThan(0);
  });
});

describe('motor model', () => {
  it('first-order lag: ~63% of target after one time constant', () => {
    const s = drive(1, 0, ROBOT.motor.timeConstant_s);
    expect(s.v / P.vMax).toBeGreaterThan(0.6);
    expect(s.v / P.vMax).toBeLessThan(0.67);
  });
  it('dead zone: duty below it produces no motion', () => {
    let s = initialVehicle();
    for (let i = 0; i < 50; i++) s = stepVehicle(P, s, { left: 0.15, right: 0.15 }, DT);
    expect(s.v).toBe(0);
    expect(motorResponse(ROBOT.motor.deadZone + 1e-9, ROBOT.motor.deadZone)).toBeCloseTo(0, 6);
    expect(motorResponse(1, ROBOT.motor.deadZone)).toBe(1);
  });
  it('minDuty compensation makes a gentle stick move the robot', () => {
    const s = drive(0.1, 0, 1);
    expect(s.v).toBeGreaterThan(0);
  });
  it('coasts to a stop when the command drops', () => {
    let s = drive(1, 0, 1);
    for (let i = 0; i < 100; i++) s = stepVehicle(P, s, { left: 0, right: 0 }, DT);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });
  it('wheel angle follows wheel speed', () => {
    const s = drive(1, 0, 2);
    expect(s.angL).toBeCloseTo(s.pose.x / P.wheelRadius, 6);
  });
});

describe('collision', () => {
  const wall: World = { obstacles: [{ name: 'wall', cx: 1, cy: 0, hx: 0.05, hy: 1, rot: 0, h: 0.2 }] };
  it('stops at the wall without penetrating', () => {
    const s = drive(1, 0, 4, wall);
    expect(s.pose.x).toBeCloseTo(0.95 - P.radius, 6);
    expect(s.contact).toBe('wall');
  });
  it('slides along an angled wall', () => {
    const slanted: World = { obstacles: [{ name: 'slant', cx: 1, cy: 0, hx: 0.05, hy: 2, rot: Math.PI / 4, h: 0.2 }] };
    const s = drive(1, 0, 4, slanted);
    // wall runs along (-1, 1); driving +x into it deflects the robot toward -y
    expect(s.pose.y).toBeLessThan(-0.3);
    expect(s.contact).toBe('slant');
  });
  it('circleBox handles rotated boxes and misses', () => {
    const b = { name: 'b', cx: 0, cy: 0, hx: 0.5, hy: 0.1, rot: Math.PI / 2, h: 0.1 };
    expect(circleBox(0.3, 0, 0.1, b)).toBeNull();
    const c = circleBox(0.15, 0, 0.1, b)!;
    expect(c.nx).toBeCloseTo(0.05, 9);
    expect(c.ny).toBeCloseTo(0, 9);
    const inside = circleBox(0, 0.45, 0.1, b)!;
    expect(inside.ny).toBeGreaterThan(0);
  });
});

describe('derived params', () => {
  it('turn-slip k is in (0, 1]', () => {
    expect(P.k).toBeGreaterThan(0);
    expect(P.k).toBeLessThanOrEqual(1);
  });
});
