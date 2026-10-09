/**
 * assembly.json: how a robot is put together, in its chassis frame (origin at
 * the bottom centre of the chassis, x forward, y left, z up, millimetres).
 */
export interface AssemblyPart {
  name: string;
  /** STL file inside `source`. */
  file: string;
  color: string;
  translate_mm: [number, number, number];
  rotate_deg?: [number, number, number];
}

export interface CollisionBox {
  name: string;
  size_mm: [number, number, number];
  pos_mm: [number, number, number];
  /** Fixed mass for this box; boxes without one share the rest of the chassis mass by volume. */
  mass_kg?: number;
}

export interface ClawSpec {
  enabled: boolean;
  backplate_x_mm: number;
  backplateWidth_mm: number;
  pivot_x_mm: number;
  pivot_y_mm: number;
  armLength_mm: number;
  hook_dx_mm: number;
  hook_dy_mm: number;
  height_mm: number;
  groundClearance_mm: number;
  thickness_mm: number;
  openAngle_deg: number;
  servoKp_Nm_per_rad: number;
  servoDamping: number;
  mass_kg: number;
  color: string;
}

export interface Assembly {
  /** Folder holding the STLs, relative to the project root. */
  source: string;
  /** Vertex-clustering cell for the GLB build. */
  decimateCell_mm: number;
  /** Axle position: x = half the wheelbase, z = height above the chassis bottom. */
  axle: { x_mm: number; z_mm: number };
  parts: AssemblyPart[];
  /** Boxes the physics engine collides with (and the stand-in body draws). */
  collision: CollisionBox[];
  /** Half the body width where the motor shafts come out; shafts are drawn from here to the wheels. */
  bodyHalfWidth_mm: number;
  /** Draw generic TT gearboxes at the axles (off when the parts already include motors). */
  proceduralMotors: boolean;
  standInColor: string;
  /** How the simulator draws the wheels: chunky monster tyres or the stock yellow TT wheels. */
  wheelStyle: 'monster' | 'tt';
  /** Lens position; pitch_deg tilts it (negative = nose down). */
  camera: { position_mm: [number, number, number]; pitch_deg?: number };
  leds: { name: string; position_mm: [number, number, number]; facing: 1 | -1 }[];
  claw: ClawSpec;
  provenance?: Record<string, string>;
}

const vec3 = (path: string, v: unknown) => {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`assembly.json: ${path} must be [x, y, z]`);
  }
};

/** Validate an untrusted assembly.json; throws naming the bad field. */
export function parseAssembly(o: unknown): Assembly {
  const a = o as Assembly;
  if (!a || typeof a !== 'object') throw new Error('assembly.json: not an object');
  if (typeof a.source !== 'string') throw new Error('assembly.json: source must be a folder path');
  if (!(a.axle?.x_mm > 0) || !(a.axle?.z_mm >= 0)) throw new Error('assembly.json: axle needs x_mm > 0 and z_mm >= 0');
  if (!Array.isArray(a.parts) || a.parts.length === 0) throw new Error('assembly.json: parts must be a non-empty list');
  a.parts.forEach((p, i) => {
    if (!p.name || !p.file) throw new Error(`assembly.json: parts[${i}] needs name and file`);
    vec3(`parts[${i}].translate_mm`, p.translate_mm);
    if (p.rotate_deg) vec3(`parts[${i}].rotate_deg`, p.rotate_deg);
  });
  if (!Array.isArray(a.collision) || a.collision.length === 0) throw new Error('assembly.json: collision must list at least one box');
  const names = new Set<string>();
  a.collision.forEach((c, i) => {
    if (!c.name || names.has(c.name)) throw new Error(`assembly.json: collision[${i}] needs a unique name`);
    names.add(c.name);
    vec3(`collision[${i}].size_mm`, c.size_mm);
    vec3(`collision[${i}].pos_mm`, c.pos_mm);
    if (!c.size_mm.every((s) => s > 0)) throw new Error(`assembly.json: collision[${i}].size_mm must be positive`);
  });
  if (!(a.bodyHalfWidth_mm > 0)) throw new Error('assembly.json: bodyHalfWidth_mm must be positive');
  if (a.wheelStyle !== 'monster' && a.wheelStyle !== 'tt') throw new Error('assembly.json: wheelStyle must be "monster" or "tt"');
  vec3('camera.position_mm', a.camera?.position_mm);
  if (!Array.isArray(a.leds)) throw new Error('assembly.json: leds must be a list');
  if (!a.claw || typeof a.claw.enabled !== 'boolean') throw new Error('assembly.json: claw.enabled must be true or false');
  return a;
}
