/**
 * Export STLs from a robot's OpenSCAD source with the OpenSCAD CLI.
 * robots/<id>/cad.json lists { scad, out, parts: [part names] }; each part is
 * rendered with -D part="<name>" into <out>/<name>.stl.
 * Run: npm run cad -- yakrobot-4wd
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const id = process.argv[2];
if (!id) {
  console.error('usage: npm run cad -- <robot-id>');
  process.exit(1);
}
const cadFile = join(root, 'robots', id, 'cad.json');
if (!existsSync(cadFile)) {
  console.error(`robots/${id}/cad.json not found (this robot has no OpenSCAD source)`);
  process.exit(1);
}
const cad = JSON.parse(readFileSync(cadFile, 'utf8')) as { scad: string; out: string; parts: string[] };
const outDir = join(root, cad.out);
mkdirSync(outDir, { recursive: true });
for (const part of cad.parts) {
  const out = join(outDir, `${part}.stl`);
  const t0 = Date.now();
  execFileSync('openscad', ['-D', `part="${part}"`, '-o', out, join(root, cad.scad)], { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`${part.padEnd(14)} -> ${cad.out}/${part}.stl (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
