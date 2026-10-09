import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RobotProfile } from '../robots';
import type { SimState } from '../physics/backend';
import type { Room } from '../world/room';
import { buildRoom, placeBody, toThree, type RoomView } from './room';
import { attachOnboardCamera } from './onboard';
import { buildRover, setHeadlights, type RoverMesh } from './rover';

/**
 * three.js view. World frame is x east, y north, z up; three.js is y up
 * (see toThree). The renderer only reads SimState.
 */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  follow = true;
  onboard: THREE.PerspectiveCamera;
  /** Element the inset view is drawn under; null hides the inset. */
  insetEl: HTMLElement | null = null;
  /** When true the onboard (FPV) camera fills the screen and the world view goes in the inset. */
  private swapped = false;
  private rover: RoverMesh;
  private headlightsOn = false;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly size = new THREE.Vector2();
  private readonly room: RoomView;
  private readonly delta = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, profile: RobotProfile, room: Room) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x20252b);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.maxDistance = 8;
    const start = toThree([room.spawn.x, room.spawn.y, 0.05]);
    this.controls.target.copy(start);
    this.camera.position.copy(start).add(new THREE.Vector3(-0.9, 0.75, 0.9));

    this.hemi = new THREE.HemisphereLight(0xfffaf0, 0x8a8478, 1.6);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun = sun;
    sun.position.set(-1.5, 4, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    const ext = Math.max(...room.size) / 2 + 0.3;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -ext;
    sun.shadow.camera.right = sun.shadow.camera.top = ext;
    this.scene.add(sun);

    this.room = buildRoom(room);
    this.scene.add(this.room.group);

    this.rover = buildRover(profile);
    this.rover.root.traverse((o) => (o.castShadow = true));
    this.scene.add(this.rover.root);
    this.onboard = attachOnboardCamera(this.rover.root, profile);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Overview of the whole room from a high corner, like the Jumper demo. */
  overview(room: Room): void {
    this.follow = false;
    this.controls.target.set(0, 0.1, 0);
    this.camera.position.set(-room.size[0] * 0.55, 2.4, room.size[1] * 0.75);
  }

  get fpv(): boolean {
    return this.swapped;
  }

  /** Swap the world view and the onboard FPV view between screen and inset. */
  setFpv(on: boolean): void {
    this.swapped = on;
    // dragging would orbit a camera you can't see
    this.controls.enabled = !on;
  }

  /** Night dims the room so the COB headlights do the work. */
  setNight(night: boolean): void {
    this.hemi.intensity = night ? 0.06 : 1.6;
    this.sun.intensity = night ? 0.04 : 2.2;
    this.scene.background = new THREE.Color(night ? 0x07090c : 0x20252b);
  }

  setHeadlights(on: boolean): void {
    this.headlightsOn = on;
    setHeadlights(this.rover, on);
  }

  /** Swap in a different robot's 3D model; the onboard camera moves to its lens. */
  setRobot(profile: RobotProfile): void {
    this.scene.remove(this.rover.root);
    this.rover.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.rover = buildRover(profile);
    this.rover.root.traverse((o) => (o.castShadow = true));
    this.scene.add(this.rover.root);
    const aspect = this.onboard.aspect;
    this.onboard = attachOnboardCamera(this.rover.root, profile);
    this.onboard.aspect = aspect;
    this.onboard.updateProjectionMatrix();
    setHeadlights(this.rover, this.headlightsOn);
  }

  /** Render one camera into a sub-rectangle, fitting a perspective camera's aspect to it. */
  private drawInto(cam: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number): void {
    const r = this.renderer;
    const aspect = cam.aspect;
    if (cam === this.camera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    r.setScissorTest(true);
    r.setScissor(x, y, w, h);
    r.setViewport(x, y, w, h);
    r.render(this.scene, cam);
    r.setScissorTest(false);
    if (cam === this.camera) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  render(s: Readonly<SimState>): void {
    placeBody(this.rover.root, s.rover);
    this.rover.wheels.forEach((w, i) => {
      w.rotation.z = -s.wheelAngles[i];
    });
    this.rover.clawArms.forEach((a, i) => {
      a.pivot.rotation.y = a.openSign * (s.clawAngles[i] ?? 0);
    });
    for (const [name, mesh] of this.room.dynamic) {
      const b = s.bodies[name];
      if (b) placeBody(mesh, b);
    }
    if (this.follow) {
      // move camera and target together so the user's orbit angle is kept
      this.delta.copy(toThree([s.rover.pos[0], s.rover.pos[1], 0.05])).sub(this.controls.target);
      this.controls.target.add(this.delta);
      this.camera.position.add(this.delta);
    }
    this.controls.update();

    const r = this.renderer;
    r.getSize(this.size);
    const W = this.size.x;
    const H = this.size.y;
    const main = this.swapped ? this.onboard : this.camera;
    const inset = this.swapped ? this.camera : this.onboard;

    // Main view. The onboard camera keeps its true 4:3 frame, letterboxed.
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    if (this.swapped) {
      r.setClearColor(0x000000);
      r.clear();
      const a = this.onboard.aspect;
      const w = Math.min(W, H * a);
      const h = w / a;
      this.drawInto(main, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      r.render(this.scene, main);
    }

    // Inset, drawn into the inset element's rectangle
    if (this.insetEl && this.insetEl.getClientRects().length > 0) {
      const box = this.insetEl.getBoundingClientRect();
      this.drawInto(inset, box.left, H - box.bottom, box.width, box.height); // WebGL viewports start bottom-left
    }
  }
}
