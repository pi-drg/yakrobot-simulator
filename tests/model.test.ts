import { describe, expect, it } from 'vitest';
import { ROBOT } from '../src/control/robot';
import { roverLayout } from '../src/render/rover';
import { writeGLB } from '../scripts/lib/glb';
import { decimateAndIndex, parseSTL, toGltfFrame } from '../scripts/lib/stl';
import { getProfile } from '../src/robots';
const YAK = getProfile('yakrobot-4wd');
const assembly = YAK.assembly;

/** Binary STL of an axis-aligned cube [0, s]^3 (12 triangles). */
function cubeSTL(s: number): Uint8Array {
  const v = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const buf = new Uint8Array(84 + f.length * 50);
  const dv = new DataView(buf.buffer);
  dv.setUint32(80, f.length, true);
  f.forEach((t, i) => t.forEach((vi, k) => v[vi].forEach((x, j) => dv.setFloat32(84 + i * 50 + 12 + k * 12 + j * 4, x, true))));
  return buf;
}

describe('STL -> GLB pipeline', () => {
  it('parses binary and ASCII STL', () => {
    expect(parseSTL(cubeSTL(10)).length).toBe(12 * 9);
    const ascii = new TextEncoder().encode('solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n');
    expect(Array.from(parseSTL(ascii))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it('maps chassis mm (z up, y left) to glTF metres (y up)', () => {
    const t = toGltfFrame(new Float32Array([10, 20, 30, 0, 0, 0, 0, 0, 0]), [1, 2, 3]);
    expect(Array.from(t.slice(0, 3)).map((x) => +x.toFixed(6))).toEqual([0.011, 0.033, -0.022]);
  });
  it('rotates parts about their own origin before placing them', () => {
    // 180 deg about x flips y and z: (10, 20, 30) -> (10, -20, -30), then +t, then to glTF
    const t = toGltfFrame(new Float32Array([10, 20, 30, 0, 0, 0, 0, 0, 0]), [0, 0, 100], [180, 0, 0]);
    expect(Array.from(t.slice(0, 3)).map((x) => +x.toFixed(6))).toEqual([0.01, 0.07, 0.02]);
  });
  it('indexes shared vertices per flat normal and drops collapsed triangles', () => {
    const m = decimateAndIndex(parseSTL(cubeSTL(10)), 0.5);
    expect(m.triangles).toBe(12);
    expect(m.positions.length / 3).toBe(24); // 4 per face
    const tiny = decimateAndIndex(parseSTL(cubeSTL(0.1)), 0.5);
    expect(tiny.triangles).toBe(0);
  });
  it('flat mode shares vertices by position and drops normals', () => {
    const m = decimateAndIndex(parseSTL(cubeSTL(10)), 0.5, false);
    expect(m.triangles).toBe(12);
    expect(m.positions.length / 3).toBe(8);
    expect(m.normals).toBeUndefined();
    const glb = writeGLB([{ name: 'cube', color: [1, 1, 1], mesh: m }]);
    const dv = new DataView(glb.buffer);
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + dv.getUint32(12, true))));
    expect(json.meshes[0].primitives[0].attributes.NORMAL).toBeUndefined();
    expect(json.accessors[1].componentType).toBe(5123); // uint16 indices
  });
  it('writes a well-formed GLB', () => {
    const glb = writeGLB([{ name: 'cube', color: [1, 0.5, 0], mesh: decimateAndIndex(parseSTL(cubeSTL(10)), 0) }]);
    const dv = new DataView(glb.buffer);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonLen)));
    expect(json.meshes[0].name).toBe('cube');
    expect(json.accessors[0].max).toEqual([10, 10, 10]);
    expect(glb.byteLength % 4).toBe(0);
  });
});

describe('assembly sits on the ground', () => {
  const L = roverLayout(YAK);
  it('wheel bottoms touch y = 0 and the frame clears the ground', () => {
    expect(L.wheelRadius - ROBOT.geometry.wheelDiameter_m / 2).toBe(0);
    expect(L.clearance).toBeGreaterThan(0);
    expect(L.clearance).toBeCloseTo(ROBOT.geometry.wheelDiameter_m / 2 - assembly.axle.z_mm / 1000, 9);
  });
  it('STL axle slots agree with robot.json wheelbase', () => {
    expect((assembly.axle.x_mm * 2) / 1000).toBeCloseTo(ROBOT.geometry.wheelbase_m, 6);
  });
  it('wheels sit a visible gap off the body', () => {
    const gap = L.wheelZ - ROBOT.geometry.wheelWidth_m / 2 - assembly.bodyHalfWidth_mm / 1000;
    expect(gap).toBeGreaterThanOrEqual(0.003);
  });
});
