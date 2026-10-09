import { describe, expect, it } from 'vitest';
import reference from '../config/reference.json';
import { applyMinDuty, control } from '../src/control/controller';
import { ROBOT, parseRobot, type RobotConfig } from '../src/control/robot';

const clone = (): RobotConfig => JSON.parse(JSON.stringify(ROBOT));
const at = (a: { lx: number; ly: number; rx: number }, t = 0) => ({ ...a, t });

describe('skid mixer against reference.json', () => {
  for (const v of reference.skid) {
    it(v.name, () => {
      const out = control(ROBOT, at(v.in), 0);
      expect(out.mix.left).toBeCloseTo(v.out.left, 12);
      expect(out.mix.right).toBeCloseTo(v.out.right, 12);
      expect(Math.abs(out.mix.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.mix.right)).toBeLessThanOrEqual(1);
    });
  }
});

describe('watchdog against reference.json', () => {
  for (const v of reference.watchdog) {
    it(v.name, () => {
      const out = control(ROBOT, at({ lx: 0, ly: 1, rx: 0 }, 10), 10 + v.age_s);
      expect(out.watchdog).toBe(v.stopped);
      if (v.stopped) expect(out.duty).toEqual({ left: 0, right: 0 });
      else expect(out.duty.left).toBe(1);
    });
  }
});

describe('duty stage', () => {
  it('lifts small commands past minDuty and keeps 0 and 1 fixed', () => {
    expect(applyMinDuty(0, 0.2)).toBe(0);
    expect(applyMinDuty(1, 0.2)).toBe(1);
    expect(applyMinDuty(-1, 0.2)).toBe(-1);
    expect(applyMinDuty(0.01, 0.2)).toBeCloseTo(0.208, 9);
    expect(applyMinDuty(-0.5, 0.2)).toBeCloseTo(-0.6, 9);
  });
  it('honours per-side inversion and axis signs from robot.json', () => {
    const r = clone();
    r.drive.invertRight = true;
    r.drive.axisSigns.rx = 1;
    const out = control(r, at({ lx: 0, ly: 0, rx: 1 }), 0);
    expect(out.mix).toEqual({ left: -1, right: 1 });
    expect(out.duty).toEqual({ left: -1, right: -1 });
  });
  it('treats NaN axes as zero', () => {
    expect(control(ROBOT, at({ lx: 0, ly: NaN, rx: 0 }), 0).duty).toEqual({ left: 0, right: 0 });
  });
});

describe('robot.json contract', () => {
  it('loads the shipped file', () => {
    expect(ROBOT.wheelType).toBe('monster');
  });
  it('rejects bad values with the field name', () => {
    const r = clone();
    (r.geometry as Record<string, number>).track_m = -1;
    expect(() => parseRobot(r)).toThrow(/geometry.track_m/);
    const s = clone();
    (s.drive.axisSigns as Record<string, number>).rx = 2;
    expect(() => parseRobot(s)).toThrow(/axisSigns.rx/);
  });
  it('rejects a turn rate the wheels cannot produce', () => {
    const r = clone();
    r.limits.turnRate_radps = 50;
    expect(() => parseRobot(r)).toThrow(/no-slip spin rate/);
  });
});
