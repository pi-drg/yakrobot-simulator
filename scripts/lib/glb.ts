import { bounds, type IndexedMesh } from './stl.ts';

export interface GlbPart {
  name: string;
  color: [number, number, number];
  mesh: IndexedMesh;
}

const pad4 = (n: number) => (n + 3) & ~3;

/** Minimal glTF 2.0 binary writer: one node + mesh + PBR material per part. */
export function writeGLB(parts: GlbPart[], generator = 'yakrobot-simulator'): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const push = (data: ArrayBufferView, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const len = pad4(bytes.byteLength);
    const padded = new Uint8Array(len);
    padded.set(bytes);
    chunks.push(padded);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    offset += len;
    return bufferViews.length - 1;
  };

  const meshes: object[] = [];
  const materials: object[] = [];
  const nodes: object[] = [];
  for (const p of parts) {
    const { positions, normals, indices } = p.mesh;
    const b = bounds(positions);
    accessors.push({ bufferView: push(positions, 34962), componentType: 5126, count: positions.length / 3, type: 'VEC3', min: b.min, max: b.max });
    const posA = accessors.length - 1;
    const attributes: Record<string, number> = { POSITION: posA };
    if (normals) {
      accessors.push({ bufferView: push(normals, 34962), componentType: 5126, count: normals.length / 3, type: 'VEC3' });
      attributes.NORMAL = accessors.length - 1;
    }
    const small = positions.length / 3 <= 0xffff;
    const idx = small ? Uint16Array.from(indices) : indices;
    accessors.push({ bufferView: push(idx, 34963), componentType: small ? 5123 : 5125, count: indices.length, type: 'SCALAR' });
    const idxA = accessors.length - 1;
    materials.push({ name: p.name, pbrMetallicRoughness: { baseColorFactor: [...p.color, 1], metallicFactor: 0, roughnessFactor: 0.65 } });
    meshes.push({ name: p.name, primitives: [{ attributes, indices: idxA, material: materials.length - 1 }] });
    nodes.push({ name: p.name, mesh: meshes.length - 1 });
  }

  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLen + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.fill(0x20, 20, 20 + jsonLen);
  out.set(jsonBytes, 20);
  let o = 20 + jsonLen;
  dv.setUint32(o, offset, true);
  dv.setUint32(o + 4, 0x004e4942, true); // 'BIN\0'
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export function hexColor(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  // glTF base colours are linear; convert from sRGB
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}
