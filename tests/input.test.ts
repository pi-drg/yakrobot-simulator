import { describe, expect, it } from 'vitest';
import { DEADBAND, deadband, merge, shape } from '../src/input/shape';
import { InputHub } from '../src/input/hub';
import type { InputSource, RawAxes, SourceName } from '../src/input/types';

describe('deadband', () => {
  it('zeros inside the band', () => {
    expect(deadband(0)).toBe(0);
    expect(deadband(DEADBAND)).toBe(0);
    expect(deadband(-0.1)).toBe(0);
  });
  it('rescales so full deflection stays 1 and output is continuous', () => {
    expect(deadband(1)).toBe(1);
    expect(deadband(-1)).toBe(-1);
    expect(deadband(DEADBAND + 1e-9)).toBeCloseTo(0, 6);
    expect(deadband(0.575)).toBeCloseTo(0.5, 9);
    expect(deadband(-0.575)).toBeCloseTo(-0.5, 9);
  });
  it('clamps and rejects junk', () => {
    expect(deadband(3)).toBe(1);
    expect(deadband(NaN)).toBe(0);
  });
});

describe('merge', () => {
  const a = (lx: number, ly: number, rx: number) => shape({ lx, ly, rx }, 0);
  it('picks the largest deflection and stamps t', () => {
    expect(merge([a(0, 0.5, 0), a(0, 0, -1), null], 7, false)).toEqual({ lx: 0, ly: 0, rx: -1, t: 7 });
  });
  it('is zero when nothing is pushed or when stopped', () => {
    expect(merge([a(0, 0, 0), null], 1, false)).toEqual({ lx: 0, ly: 0, rx: 0, t: 1 });
    expect(merge([a(0, 1, 0)], 2, true)).toEqual({ lx: 0, ly: 0, rx: 0, t: 2 });
  });
});

class Fixed implements InputSource {
  constructor(readonly name: SourceName, public v: RawAxes | null) {}
  read() {
    return this.v;
  }
}

describe('InputHub', () => {
  it('gives identical shaped axes for full forward from every source', () => {
    const fwd = { lx: 0, ly: 1, rx: 0 };
    const hub = new InputHub([new Fixed('keyboard', fwd), new Fixed('joystick', fwd), new Fixed('gamepad', fwd)]);
    const s = hub.poll(3);
    expect(s.sources.keyboard).toEqual(s.sources.joystick);
    expect(s.sources.joystick).toEqual(s.sources.gamepad);
    expect(s.out).toEqual({ lx: 0, ly: 1, rx: 0, t: 3 });
  });
  it('reports a missing gamepad as null and latches stop', () => {
    const hub = new InputHub([new Fixed('keyboard', { lx: 0, ly: 1, rx: 0 }), new Fixed('gamepad', null)]);
    expect(hub.poll(0).sources.gamepad).toBeNull();
    hub.toggleStop();
    expect(hub.poll(0).out.ly).toBe(0);
    hub.toggleStop();
    expect(hub.poll(0).out.ly).toBe(1);
  });
});
