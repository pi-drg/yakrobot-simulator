import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ACTION_BUTTONS, ACTION_KEYS, Actions, DEFAULT_ACTIONS } from '../src/input/actions';
import { attachOnboardCamera, lensPosition, OV2640, verticalFov } from '../src/render/onboard';
import { quatToThree, toThree } from '../src/render/room';
import { yawQuat } from '../src/physics/backend';
import { getProfile } from '../src/robots';
const YAK = getProfile('yakrobot-4wd');
const assembly = YAK.assembly;
/** Lens tilt (rad, negative = nose down). */
const pitch = ((assembly.camera.pitch_deg ?? 0) * Math.PI) / 180;

describe('onboard ESP32-CAM', () => {
  it('uses the OV2640 field of view at 4:3', () => {
    const vfov = verticalFov(OV2640.hfovDeg, OV2640.aspect);
    expect(vfov).toBeCloseTo(51.9, 1);
    expect(verticalFov(90, 1)).toBeCloseTo(90, 9);
  });

  it('sits at the flipped lens, ~56 mm up, above the claw', () => {
    const [x, y, z] = lensPosition(YAK);
    const [cx, , cz] = assembly.camera.position_mm.map((v) => v / 1000);
    const clearance = YAK.robot.geometry.wheelDiameter_m / 2 - assembly.axle.z_mm / 1000;
    expect(x).toBeCloseTo(cx, 6);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(clearance + cz, 6); // frame clearance + lens height on the chassis
    expect(z).toBeCloseTo(0.056, 2);
    expect(z).toBeGreaterThan((assembly.claw.groundClearance_mm + assembly.claw.height_mm) / 1000);
  });

  it('follows the rover pose and looks where the rover points', () => {
    const root = new THREE.Group();
    const cam = attachOnboardCamera(root, YAK);
    // rover at (1, 2) facing north (+y)
    root.position.copy(toThree([1, 2, 0]));
    root.quaternion.copy(quatToThree(yawQuat(Math.PI / 2)));
    root.updateMatrixWorld(true);
    const p = cam.getWorldPosition(new THREE.Vector3());
    const [lx, , lz] = lensPosition(YAK);
    // forward offset lands on world +y, i.e. three.js -z
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(lz, 6);
    expect(p.z).toBeCloseTo(-(2 + lx + 0.004), 6);
    // looks north (three.js -z), tilted down by the camera's pitch
    const dir = cam.getWorldDirection(new THREE.Vector3());
    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.y).toBeCloseTo(Math.sin(pitch), 6);
    expect(dir.z).toBeCloseTo(-Math.cos(pitch), 6);
  });

  it('pitches with the rover', () => {
    const root = new THREE.Group();
    const cam = attachOnboardCamera(root, YAK);
    // nose down 10 degrees: rotation about robot-left (+y world -> three -z)
    const a = (10 * Math.PI) / 180;
    root.quaternion.copy(quatToThree([Math.cos(a / 2), 0, Math.sin(a / 2), 0]));
    root.updateMatrixWorld(true);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    expect(dir.y).toBeCloseTo(Math.sin(pitch - a), 6);
  });
});

describe('actions', () => {
  it('starts with the claw open, lights off, daytime', () => {
    expect(new Actions().state).toEqual(DEFAULT_ACTIONS);
    expect(DEFAULT_ACTIONS).toEqual({ clawOpen: true, headlights: false, night: false });
  });

  it('toggles and notifies listeners', () => {
    const a = new Actions();
    const seen: boolean[] = [];
    a.onChange((s) => seen.push(s.headlights));
    a.toggle('headlights');
    a.toggle('headlights');
    expect(seen).toEqual([false, true, false]);
    a.set({ night: true });
    expect(a.state.night).toBe(true);
  });

  it('maps keys and gamepad buttons without clashing with stop', () => {
    expect(ACTION_KEYS).toEqual({ KeyC: 'clawOpen', KeyL: 'headlights', KeyN: 'night' });
    expect(ACTION_BUTTONS[1]).toBeUndefined(); // B / Circle stays STOP
    expect(Object.values(ACTION_BUTTONS)).toEqual(expect.arrayContaining(['clawOpen', 'headlights']));
  });
});
