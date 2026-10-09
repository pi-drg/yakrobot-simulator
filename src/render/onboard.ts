import * as THREE from 'three';
import type { RobotProfile } from '../robots';
import { roverLayout } from './rover';

/** OV2640 with the stock lens: ~66 deg horizontal field of view, 4:3 frames. */
export const OV2640 = { hfovDeg: 66, aspect: 4 / 3 };

export const verticalFov = (hfovDeg: number, aspect: number) =>
  (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;

/** Lens position in the robot frame (x fwd, y left, z up, metres, origin on the ground). */
export function lensPosition(p: RobotProfile): [number, number, number] {
  const [x, y, z] = p.assembly.camera.position_mm.map((v) => v / 1000);
  return [x, y, roverLayout(p).clearance + z];
}

/**
 * Camera at the ESP32-CAM lens, parented to the rover root so it follows
 * pitch and roll. Looks along the rover's +x.
 */
export function attachOnboardCamera(roverRoot: THREE.Object3D, p: RobotProfile): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(verticalFov(OV2640.hfovDeg, OV2640.aspect), OV2640.aspect, 0.01, 30);
  const [x, y, z] = lensPosition(p);
  // a hair in front of the lens face so the enclosure itself is not in shot
  cam.position.set(x + 0.004, z, -y);
  // three cameras look down -z: yaw to face +x, then pitch (negative = nose down)
  const pitch = ((p.assembly.camera.pitch_deg ?? 0) * Math.PI) / 180;
  cam.rotation.set(pitch, -Math.PI / 2, 0, 'YXZ');
  roverRoot.add(cam);
  return cam;
}
