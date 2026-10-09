import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BodyPose } from '../physics/backend';
import { walls, type Item, type Room } from '../world/room';

/** World (x east, y north, z up) -> three.js (y up). */
export const toThree = (p: readonly number[]) => new THREE.Vector3(p[0], p[2], -p[1]);
/** World quaternion [w, x, y, z] -> three.js quaternion, same axis mapping. */
export const quatToThree = (q: readonly number[]) => new THREE.Quaternion(q[1], q[3], -q[2], q[0]);

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floorTexture(color: string, room: Room): THREE.Texture {
  const t = canvasTexture(256, (g, s) => {
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(room.size[0] / 0.5, room.size[1] / 0.5); // 50 cm tiles
  return t;
}

function rugTexture(color: string): THREE.Texture {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,90,50,0.45)';
    g.lineWidth = 14;
    g.strokeRect(34, 34, s - 68, s - 68);
    g.lineWidth = 4;
    g.strokeRect(62, 62, s - 124, s - 124);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < s; i += 6) g.fillRect(i, 0, 2, s);
  });
}

/** Sphere with black patches centred on the 12 icosahedron vertices: reads as a football. */
function footballGeometry(r: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, 48, 32).toNonIndexed();
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const centres: THREE.Vector3[] = [];
  const ip = ico.getAttribute('position');
  for (let i = 0; i < ip.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize();
    if (!centres.some((c) => c.distanceTo(v) < 1e-3)) centres.push(v);
  }
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    // colour per face (flat patches)
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, i + k));
    v.normalize();
    const black = centres.some((c) => c.angleTo(v) < 0.33);
    for (let k = 0; k < 3; k++) colors.set(black ? [0.05, 0.05, 0.05] : [0.95, 0.95, 0.95], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function bowlGeometry(r: number, h: number): THREE.BufferGeometry {
  const pts = [
    [r * 0.55, -h / 2], [r * 0.95, -h / 2], [r, h / 2], [r * 0.82, h / 2], [r * 0.7, -h / 2 + 0.008], [0, -h / 2 + 0.008],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 40);
}

function itemMesh(it: Item): THREE.Mesh {
  const s = it.shape;
  const color = new THREE.Color(it.color);
  let geo: THREE.BufferGeometry;
  let mat: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  if (it.look === 'football' && s.kind === 'sphere') {
    geo = footballGeometry(s.radius);
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  } else if (it.look === 'bowl' && s.kind === 'cylinder') {
    geo = bowlGeometry(s.radius, s.height);
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, side: THREE.DoubleSide });
  } else if (s.kind === 'sphere') {
    geo = new THREE.SphereGeometry(s.radius, 32, 20);
  } else if (s.kind === 'cylinder') {
    geo = new THREE.CylinderGeometry(s.radius, s.radius, s.height, 32);
    if (it.look === 'can') mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
  } else if (it.look === 'rug') {
    geo = new THREE.BoxGeometry(s.size[0], s.size[2], s.size[1]);
    mat = new THREE.MeshStandardMaterial({ map: rugTexture(it.color), roughness: 1 });
  } else if (it.look === 'cushion') {
    const r = Math.min(0.03, s.size[2] / 3, s.size[0] / 3, s.size[1] / 3);
    geo = new RoundedBoxGeometry(s.size[0], s.size[2], s.size[1], 3, r);
  } else {
    geo = new THREE.BoxGeometry(s.size[0], s.size[2], s.size[1]);
  }
  const m = new THREE.Mesh(geo, mat);
  m.name = it.name;
  m.castShadow = it.look !== 'rug';
  m.receiveShadow = true;
  m.position.copy(toThree(it.pos));
  m.rotation.y = it.yaw ?? 0;
  return m;
}

export interface RoomView {
  group: THREE.Group;
  /** Meshes for loose objects, updated from SimState.bodies. */
  dynamic: Map<string, THREE.Object3D>;
}

export function buildRoom(room: Room): RoomView {
  const group = new THREE.Group();
  const [w, d] = room.size;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: floorTexture(room.floorColor, room), roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Walls: inward-facing planes only, so the orbit camera can see in from outside
  const wallMat = new THREE.MeshStandardMaterial({ color: room.wallColor, roughness: 0.95 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 });
  for (const wall of walls(room)) {
    const alongX = wall.size[0] > wall.size[1];
    const len = alongX ? w : d;
    const inner = toThree(wall.pos);
    const normal = new THREE.Vector3(alongX ? 0 : -Math.sign(wall.pos[0]), 0, alongX ? Math.sign(wall.pos[1]) : 0);
    inner.addScaledVector(normal, room.wallThickness / 2);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, room.wallHeight), wallMat);
    plane.position.copy(inner);
    plane.lookAt(inner.clone().add(normal));
    plane.receiveShadow = true;
    group.add(plane);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), skirtMat);
    skirt.position.copy(inner).addScaledVector(normal, 0.002);
    skirt.position.y = 0.04;
    skirt.lookAt(skirt.position.clone().add(normal));
    group.add(skirt);
  }

  const dynamic = new Map<string, THREE.Object3D>();
  for (const it of room.items) {
    const m = itemMesh(it);
    group.add(m);
    if (it.dynamic) dynamic.set(it.name, m);
  }
  return { group, dynamic };
}

export function placeBody(o: THREE.Object3D, b: BodyPose): void {
  o.position.copy(toThree(b.pos));
  o.quaternion.copy(quatToThree(b.quat));
}
