/** Flat triangle soup: 9 floats per triangle (three xyz vertices). */
export type Triangles = Float32Array;

/** Parse binary or ASCII STL. */
export function parseSTL(buf: Uint8Array): Triangles {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(buf);
  const nums: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) nums.push(+m[1], +m[2], +m[3]);
  if (nums.length === 0 || nums.length % 9 !== 0) throw new Error('not a valid STL');
  return new Float32Array(nums);
}

export interface IndexedMesh {
  positions: Float32Array;
  /** Omitted for flat-shaded output; three.js then shades per face. */
  normals?: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

/** Rotation matrix for XYZ Euler angles in degrees (applied x, then y, then z). */
function eulerMatrix(deg: readonly number[]): number[] {
  const [a, b, c] = deg.map((d) => (d * Math.PI) / 180);
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  // Rz * Ry * Rx, row-major
  return [
    cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
    sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca,
  ];
}

/**
 * Map chassis-frame millimetres (x fwd, y left, z up) to glTF metres (y up):
 * rotate about the part's own origin by `rotDeg` (XYZ Euler), translate by `t`,
 * then (x, y, z) -> (x, z, -y) / 1000. Rotations that mirror are not allowed,
 * so triangle winding is preserved.
 */
export function toGltfFrame(tris: Triangles, t: readonly number[], rotDeg: readonly number[] = [0, 0, 0]): Triangles {
  const m = eulerMatrix(rotDeg);
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const px = tris[i];
    const py = tris[i + 1];
    const pz = tris[i + 2];
    const x = m[0] * px + m[1] * py + m[2] * pz + t[0];
    const y = m[3] * px + m[4] * py + m[5] * pz + t[1];
    const z = m[6] * px + m[7] * py + m[8] * pz + t[2];
    out[i] = x / 1000;
    out[i + 1] = z / 1000;
    out[i + 2] = -y / 1000;
  }
  return out;
}

/**
 * Vertex-clustering decimation plus indexing. Vertices snap to a grid of
 * `cell` (same units as the input); triangles that collapse are dropped.
 * With `withNormals`, vertices are shared only between triangles with the
 * same flat normal; without, they are shared by position and the mesh has no
 * normals (smaller, rendered flat-shaded).
 */
export function decimateAndIndex(tris: Triangles, cell: number, withNormals = true): IndexedMesh {
  const key = new Map<string, number>();
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const q = (v: number) => (cell > 0 ? Math.round(v / cell) : v);
  for (let i = 0; i < tris.length; i += 9) {
    const v = [0, 1, 2].map((k) => [q(tris[i + k * 3]), q(tris[i + k * 3 + 1]), q(tris[i + k * 3 + 2])]);
    const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    if (same(v[0], v[1]) || same(v[1], v[2]) || same(v[0], v[2])) continue;
    const p = v.map((c) => c.map((x) => (cell > 0 ? x * cell : x)));
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
    const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    nx /= len; ny /= len; nz /= len;
    const nk = withNormals ? `${Math.round(nx * 64)},${Math.round(ny * 64)},${Math.round(nz * 64)}` : '';
    for (let k = 0; k < 3; k++) {
      const kk = `${v[k][0]},${v[k][1]},${v[k][2]}|${nk}`;
      let id = key.get(kk);
      if (id === undefined) {
        id = pos.length / 3;
        key.set(kk, id);
        pos.push(p[k][0], p[k][1], p[k][2]);
        nrm.push(nx, ny, nz);
      }
      idx.push(id);
    }
  }
  return {
    positions: new Float32Array(pos),
    normals: withNormals ? new Float32Array(nrm) : undefined,
    indices: new Uint32Array(idx),
    triangles: idx.length / 3,
  };
}

export function bounds(positions: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max };
}
