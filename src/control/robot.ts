import raw from '../../robots/yakrobot-4wd/robot.json';

/** The robot.json contract. Every sign, scale and limit the sim uses comes from here. */
export interface RobotConfig {
  name: string;
  wheelType: 'monster';
  geometry: {
    wheelbase_m: number;
    track_m: number;
    wheelDiameter_m: number;
    wheelWidth_m: number;
  };
  limits: {
    topSpeed_mps: number;
    turnRate_radps: number;
  };
  drive: {
    axisSigns: { lx: 1 | -1; ly: 1 | -1; rx: 1 | -1 };
    invertLeft: boolean;
    invertRight: boolean;
    /** Smallest non-zero duty sent to a motor, to get past its dead zone. */
    minDuty: number;
    watchdog_ms: number;
  };
  motor: {
    timeConstant_s: number;
    /** Duty fraction below which the motor doesn't turn. */
    deadZone: number;
    /** Wheel torque at full duty and zero speed (physics backend). */
    stallTorque_Nm: number;
  };
  /** Rigid-body values used only by the MuJoCo backend. */
  physics: {
    mass_kg: number;
    wheelMass_kg: number;
    tyreFriction: number;
    armature_kgm2: number;
  };
  provenance?: Record<string, string>;
}

const pos = (path: string, v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`robot.json: ${path} must be a positive number`);
};
const frac = (path: string, v: unknown) => {
  if (typeof v !== 'number' || !(v >= 0 && v < 1)) throw new Error(`robot.json: ${path} must be in [0, 1)`);
};
const sign = (path: string, v: unknown) => {
  if (v !== 1 && v !== -1) throw new Error(`robot.json: ${path} must be 1 or -1`);
};

/** Validate an untrusted object against the contract; throws with the offending field. */
export function parseRobot(o: unknown): RobotConfig {
  const r = o as RobotConfig;
  if (!r || typeof r !== 'object') throw new Error('robot.json: not an object');
  if (r.wheelType !== 'monster') throw new Error('robot.json: wheelType must be "monster"');
  for (const k of ['wheelbase_m', 'track_m', 'wheelDiameter_m', 'wheelWidth_m'] as const) pos(`geometry.${k}`, r.geometry?.[k]);
  pos('limits.topSpeed_mps', r.limits?.topSpeed_mps);
  pos('limits.turnRate_radps', r.limits?.turnRate_radps);
  for (const k of ['lx', 'ly', 'rx'] as const) sign(`drive.axisSigns.${k}`, r.drive?.axisSigns?.[k]);
  if (typeof r.drive.invertLeft !== 'boolean' || typeof r.drive.invertRight !== 'boolean') throw new Error('robot.json: drive.invertLeft/invertRight must be booleans');
  frac('drive.minDuty', r.drive.minDuty);
  pos('drive.watchdog_ms', r.drive.watchdog_ms);
  pos('motor.timeConstant_s', r.motor?.timeConstant_s);
  frac('motor.deadZone', r.motor.deadZone);
  pos('motor.stallTorque_Nm', r.motor.stallTorque_Nm);
  for (const k of ['mass_kg', 'wheelMass_kg', 'tyreFriction', 'armature_kgm2'] as const) pos(`physics.${k}`, r.physics?.[k]);
  if (r.physics.wheelMass_kg * 4 >= r.physics.mass_kg) throw new Error('robot.json: physics.mass_kg must exceed the four wheels');
  const spinMax = (2 * r.limits.topSpeed_mps) / r.geometry.track_m;
  if (r.limits.turnRate_radps > spinMax) {
    throw new Error(`robot.json: turnRate ${r.limits.turnRate_radps} exceeds the no-slip spin rate ${spinMax.toFixed(2)} rad/s`);
  }
  return r;
}

/** The default robot's config (yakrobot-4wd). Code that can switch robots takes a RobotProfile instead. */
export const ROBOT: RobotConfig = parseRobot(raw);
