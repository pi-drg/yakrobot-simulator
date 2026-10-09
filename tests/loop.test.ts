import { describe, expect, it } from 'vitest';
import { DT, FixedStepLoop } from '../src/sim/loop';
import { integratePose } from '../src/sim/integrate';

describe('FixedStepLoop', () => {
  it('steps at 50 Hz regardless of frame size', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++);
    for (let i = 0; i < 60; i++) loop.advance(1 / 60); // 1 s of 60 fps frames
    expect(steps).toBeGreaterThanOrEqual(49);
    expect(steps).toBeLessThanOrEqual(50);
    expect(DT).toBeCloseTo(0.02);
  });

  it('carries remainder between frames', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++);
    loop.advance(0.015);
    expect(steps).toBe(0);
    loop.advance(0.015);
    expect(steps).toBe(1);
  });

  it('caps catch-up after a stall', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++);
    expect(loop.advance(5)).toBe(10);
    expect(loop.advance(0)).toBe(0);
  });

  it('ignores negative frame time', () => {
    const loop = new FixedStepLoop(() => {});
    expect(loop.advance(-1)).toBe(0);
  });
});

describe('integratePose', () => {
  it('drives straight along heading with zero yaw rate', () => {
    let p = { x: 0, y: 0, theta: 0 };
    for (let i = 0; i < 50; i++) p = integratePose(p, { v: 0.2, w: 0 }, DT);
    expect(p.x).toBeCloseTo(0.2, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.theta).toBe(0);
  });

  it('follows heading when rotated', () => {
    const p = integratePose({ x: 0, y: 0, theta: Math.PI / 2 }, { v: 1, w: 0 }, 1);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);
  });

  it('closes a full circle', () => {
    let p = { x: 0, y: 0, theta: 0 };
    const w = 1;
    const steps = Math.round((2 * Math.PI) / w / DT);
    for (let i = 0; i < steps; i++) p = integratePose(p, { v: 0.5, w }, (2 * Math.PI) / w / steps);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });
});
