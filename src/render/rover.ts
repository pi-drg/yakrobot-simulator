import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { modelPath, type RobotProfile } from '../robots';
import { clawGeometry, type ClawBox } from '../world/claw';

/**
 * Rover visual built in the robot frame mapped to three.js: nose +x, up +y,
 * robot-left = -z. Wheels and motors are procedural from robot.json; the
 * chassis is the STL-derived GLB, with a box stand-in until it loads.
 */
export interface RoverMesh {
  root: THREE.Group;
  /** Wheel groups ordered FL, FR, RL, RR; spin about local z. */
  wheels: THREE.Object3D[];
  leds: THREE.Mesh[];
  /** COB LED spotlights, off (intensity 0) until switched on. */
  headlights: THREE.SpotLight[];
  /** Claw arm pivots; rotate about local y by openSign x angle. */
  clawArms: { pivot: THREE.Group; openSign: number }[];
  /** Height of the chassis frame bottom above the ground (m). */
  clearance: number;
}

const mm = (v: number) => v / 1000;
/** Chassis-frame mm (x fwd, y left, z up) -> three.js metres. */
export const chassisToThree = (p: readonly number[]) => new THREE.Vector3(mm(p[0]), mm(p[2]), -mm(p[1]));

export function roverLayout({ robot, assembly }: RobotProfile) {
  const r = robot.geometry.wheelDiameter_m / 2;
  return {
    wheelRadius: r,
    clearance: r - mm(assembly.axle.z_mm),
    wheelX: robot.geometry.wheelbase_m / 2,
    wheelZ: robot.geometry.track_m / 2,
  };
}

/** Stock TT wheel: yellow six-spoke rim with a black rubber tyre and fine tread. */
function buildTTWheel(r: number, w: number): THREE.Group {
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
  const wheel = new THREE.Group();
  const tyre = new THREE.CylinderGeometry(r, r, w, 40, 1, true);
  tyre.rotateX(Math.PI / 2);
  const t = new THREE.Mesh(tyre, rubber);
  t.castShadow = true;
  wheel.add(t);
  // tyre sidewalls
  const side = new THREE.RingGeometry(r * 0.72, r, 40);
  for (const z of [-w / 2, w / 2]) {
    const m = new THREE.Mesh(side, rubber);
    m.position.z = z;
    if (z < 0) m.rotation.y = Math.PI;
    wheel.add(m);
  }
  // fine tread ribs
  const rib = new THREE.BoxGeometry(r * 0.025, r * 0.06, w * 0.86);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const m = new THREE.Mesh(rib, rubber);
    m.position.set(Math.cos(a) * r * 0.995, Math.sin(a) * r * 0.995, 0);
    m.rotation.z = a;
    wheel.add(m);
  }
  // yellow rim: disc set into the tyre, hub, six spokes (spokes also show rotation)
  const disc = new THREE.CylinderGeometry(r * 0.72, r * 0.72, w * 0.5, 32);
  disc.rotateX(Math.PI / 2);
  wheel.add(new THREE.Mesh(disc, rim));
  const hub = new THREE.CylinderGeometry(r * 0.22, r * 0.22, w * 1.02, 16);
  hub.rotateX(Math.PI / 2);
  wheel.add(new THREE.Mesh(hub, rim));
  const spoke = new THREE.BoxGeometry(r * 0.66, r * 0.12, w * 0.8);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(spoke, rim);
    m.rotation.z = (i / 3) * Math.PI;
    wheel.add(m);
  }
  return wheel;
}

function buildWheel(r: number, w: number): THREE.Group {
  const tyre = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
  const wheel = new THREE.Group();
  const core = new THREE.CylinderGeometry(r * 0.9, r * 0.9, w, 32);
  core.rotateX(Math.PI / 2);
  const c = new THREE.Mesh(core, tyre);
  c.castShadow = true;
  wheel.add(c);
  // chevron lugs, two staggered rows like the monster tyres in the photos
  const lug = new THREE.BoxGeometry(r * 0.22, r * 0.16, w * 0.52);
  const n = 18;
  for (let i = 0; i < n; i++) {
    for (const side of [-1, 1]) {
      const a = ((i + (side > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
      const m = new THREE.Mesh(lug, tyre);
      m.position.set(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, side * w * 0.24);
      m.rotation.set(side * 0.35, 0, a);
      m.castShadow = true;
      wheel.add(m);
    }
  }
  const hub = new THREE.CylinderGeometry(r * 0.45, r * 0.45, w * 1.02, 6);
  hub.rotateX(Math.PI / 2);
  wheel.add(new THREE.Mesh(hub, hubMat));
  // a bright spoke so rotation is visible
  const mark = new THREE.Mesh(new THREE.BoxGeometry(r * 0.8, r * 0.08, w * 1.04), new THREE.MeshStandardMaterial({ color: 0xbbbbbb }));
  wheel.add(mark);
  return wheel;
}

export function buildRover(profile: RobotProfile): RoverMesh {
  const { robot, assembly } = profile;
  const root = new THREE.Group();
  const L = roverLayout(profile);
  const w = robot.geometry.wheelWidth_m;

  const chassis = new THREE.Group();
  chassis.position.y = L.clearance;
  root.add(chassis);

  // Stand-in body from the collision boxes, shown until the GLB arrives or if it is missing
  const standIn = new THREE.Group();
  const standInMat = new THREE.MeshStandardMaterial({ color: assembly.standInColor, roughness: 0.6 });
  for (const c of assembly.collision) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(mm(c.size_mm[0]), mm(c.size_mm[2]), mm(c.size_mm[1])), standInMat);
    m.position.copy(chassisToThree(c.pos_mm));
    m.castShadow = true;
    standIn.add(m);
  }
  chassis.add(standIn);

  loadChassis(profile.id)
    .then((model) => {
      chassis.remove(standIn);
      chassis.add(model);
    })
    .catch((e) => console.warn(`${modelPath(profile.id)} not loaded (${e}); using the stand-in body. Run "npm run model".`));

  // Motor shafts from the body side to each wheel, plus generic TT gearboxes
  // when the model doesn't include its own motors
  const motorMat = new THREE.MeshStandardMaterial({ color: 0xf2d33c, roughness: 0.5 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 });
  const bodyHalf = mm(assembly.bodyHalfWidth_mm);
  const shaftLen = Math.max(0.001, L.wheelZ - w / 2 - bodyHalf + 0.002);
  for (const x of [L.wheelX, -L.wheelX]) {
    for (const s of [-1, 1]) {
      if (assembly.proceduralMotors) {
        const gear = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.019, 0.037), motorMat);
        gear.position.set(x, L.wheelRadius, s * 0.025);
        root.add(gear);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0027, 0.0027, shaftLen, 10), shaftMat);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(x, L.wheelRadius, s * (bodyHalf + shaftLen / 2));
      root.add(shaft);
    }
  }

  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[L.wheelX, -L.wheelZ], [L.wheelX, L.wheelZ], [-L.wheelX, -L.wheelZ], [-L.wheelX, L.wheelZ]]) {
    const wheel = assembly.wheelStyle === 'tt' ? buildTTWheel(L.wheelRadius, w) : buildWheel(L.wheelRadius, w);
    wheel.position.set(x, L.wheelRadius, z);
    root.add(wheel);
    wheels.push(wheel);
  }

  // Front COB LEDs: a glowing disc plus a spotlight each. The rear pair is left
  // undrawn so the front reads clearly at a glance.
  const leds: THREE.Mesh[] = [];
  const headlights: THREE.SpotLight[] = [];
  for (const led of assembly.leds.filter((l) => l.facing > 0)) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.002, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 0.15 }),
    );
    disc.rotation.z = Math.PI / 2;
    const at = chassisToThree(led.position_mm);
    disc.position.copy(at).add(new THREE.Vector3(0.001, 0, 0));
    chassis.add(disc);
    leds.push(disc);

    // COB LED: wide, soft beam. The source sits 6 cm behind the LED (lights cast no
    // shadows here, so the body doesn't block it) to tame the inverse-square hotspot
    // on the floor right in front of the camera.
    const spot = new THREE.SpotLight(0xfff3dd, 0, 5, Math.PI / 3.4, 0.6, 1.2);
    spot.position.copy(at).add(new THREE.Vector3(-0.06, 0, 0));
    spot.target.position.copy(at).add(new THREE.Vector3(1, -0.03, 0));
    chassis.add(spot, spot.target);
    headlights.push(spot);
  }

  // Servo claw: a fixed backplate plus two arms that pivot at the front corners
  const clawArms: { pivot: THREE.Group; openSign: number }[] = [];
  const claw = clawGeometry(assembly.claw);
  if (claw) {
    const clawMat = new THREE.MeshStandardMaterial({ color: assembly.claw.color, roughness: 0.6 });
    const piece = (b: ClawBox) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], b.size[2], b.size[1]), clawMat);
      m.position.set(b.pos[0], b.pos[2], -b.pos[1]);
      m.rotation.y = b.yaw;
      m.castShadow = true;
      return m;
    };
    root.add(piece(claw.backplate));
    for (const a of claw.arms) {
      const pivot = new THREE.Group();
      pivot.position.set(a.pivot[0], a.pivot[2], -a.pivot[1]);
      for (const b of a.boxes) pivot.add(piece(b));
      root.add(pivot);
      clawArms.push({ pivot, openSign: a.openSign });
    }
  }

  return { root, wheels, leds, headlights, clawArms, clearance: L.clearance };
}

async function loadChassis(id: string): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${modelPath(id)}`);
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return gltf.scene;
}

/** Switch the COB LEDs: spotlights on/off and the discs glow. */
export function setHeadlights(r: RoverMesh, on: boolean): void {
  for (const s of r.headlights) s.intensity = on ? 0.9 : 0;
  for (const d of r.leds) (d.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0.15;
}
