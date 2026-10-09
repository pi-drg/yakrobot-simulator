/**
 * Build one GLB per robot from its STLs and robots/<id>/assembly.json.
 * Run: npm run model            (every robot whose STLs are present)
 *      npm run model -- yakrobot-4wd (just one)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hexColor, writeGLB, type GlbPart } from './lib/glb.ts';
import { decimateAndIndex, parseSTL, toGltfFrame } from './lib/stl.ts';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const robotsDir = join(root, 'robots');
const only = process.argv[2];
const ids = readdirSync(robotsDir).filter((id) => existsSync(join(robotsDir, id, 'assembly.json')) && (!only || id === only));
if (only && ids.length === 0) {
  console.error(`No robot "${only}" in robots/`);
  process.exit(1);
}

let failed = false;
for (const id of ids) {
  const asm = JSON.parse(readFileSync(join(robotsDir, id, 'assembly.json'), 'utf8'));
  const srcDir = join(root, asm.source);
  const missing = asm.parts.filter((p: { file: string }) => !existsSync(join(srcDir, p.file)));
  if (missing.length) {
    console.warn(`${id}: skipped, missing ${missing.map((p: { file: string }) => p.file).join(', ')} in ${asm.source}`);
    if (only) failed = true;
    continue;
  }

  const parts: GlbPart[] = [];
  let before = 0;
  let after = 0;
  for (const p of asm.parts) {
    const tris = parseSTL(readFileSync(join(srcDir, p.file)));
    const placed = toGltfFrame(tris, p.translate_mm, p.rotate_deg ?? [0, 0, 0]);
    const mesh = decimateAndIndex(placed, asm.decimateCell_mm / 1000, false);
    before += tris.length / 9;
    after += mesh.triangles;
    parts.push({ name: p.name, color: hexColor(p.color), mesh });
  }
  const glb = writeGLB(parts);
  const out = join(root, 'public', 'models', `${id}.glb`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, glb);
  console.log(`${id}: ${parts.length} parts, ${before} -> ${after} tris, ${(glb.byteLength / 1024).toFixed(0)} KiB -> public/models/${id}.glb`);
}
if (failed) process.exit(1);
