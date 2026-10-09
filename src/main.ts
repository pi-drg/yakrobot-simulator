import './style.css';
import { FixedStepLoop } from './sim/loop';
import { SceneView } from './render/scene';
import { InputHub, type InputSnapshot } from './input/hub';
import { KeyboardSource } from './input/keyboard';
import { JoystickSource } from './input/joystick';
import { GamepadSource } from './input/gamepad';
import type { Axes } from './input/types';
import { ACTION_BUTTONS, ACTION_KEYS, Actions } from './input/actions';
import { getProfile, PROFILES, type RobotProfile } from './robots';
import { control, type ControllerOutput } from './control/controller';
import type { BackendName, PhysicsBackend } from './physics/backend';
import { createSimpleBackend } from './physics/simple';
import { ROOM } from './world/room';
import { parseOptions } from './embed/options';
import { MESSAGE_TYPE, parseCommand, resolve, type Command, type SimUiState } from './embed/api';

const opts = parseOptions(location.search);
// Host-page API state. Declared first: UI setters notify the host from start-up on.
const framed = window.parent !== window;
let started = false;
let lastSent = '';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stopBtn = $<HTMLButtonElement>('stop');
const physicsSel = $<HTMLSelectElement>('physics');
const robotSel = $<HTMLSelectElement>('robot');
const resetBtn = $<HTMLButtonElement>('reset');
const viewBtn = $<HTMLButtonElement>('view-toggle');
const swapBtn = $<HTMLButtonElement>('swap');
const camToggle = $<HTMLButtonElement>('cam-toggle');
const nightBtn = $<HTMLButtonElement>('night');
const fullBtn = $<HTMLButtonElement>('fullscreen');
const clawBtn = $<HTMLButtonElement>('claw');
const lightsBtn = $<HTMLButtonElement>('lights');
const inset = $<HTMLDivElement>('cam-inset');
const hint = $<HTMLDivElement>('hint');
const hud = $<HTMLDivElement>('hud');

// --- page options: embed layout and host theme ---------------------------
document.body.classList.toggle('embed', opts.embed);
hud.hidden = !opts.hud;
for (const [cssVar, color] of Object.entries(opts.theme)) document.documentElement.style.setProperty(cssVar, color);

// --- input ----------------------------------------------------------------
const actions = new Actions();
const gamepad = new GamepadSource(
  () => setStopped(!hub.stopped),
  (i) => {
    const a = ACTION_BUTTONS[i];
    if (a) actions.toggle(a);
  },
);
const hub = new InputHub([new KeyboardSource(), new JoystickSource($('joystick')), gamepad]);

// --- robot profile: ?robot=<id>, the dropdown, or the host page ------------
let profile: RobotProfile = getProfile(opts.robot);
for (const p of PROFILES) robotSel.add(new Option(p.name, p.id));
robotSel.value = profile.id;

// --- physics: the simple model is always available; MuJoCo loads lazily ---
let backend: PhysicsBackend = createSimpleBackend(profile, ROOM);
let physicsStatus = 'simple';
let mujocoModule: Promise<typeof import('./physics/mujoco')> | null = null;
let mujocoEngine: Promise<unknown> | null = null;
/** One MuJoCo model per robot, built on first use. */
const mujocoBackends = new Map<string, Promise<PhysicsBackend>>();

function getMujoco(p: RobotProfile): Promise<PhysicsBackend> {
  let b = mujocoBackends.get(p.id);
  if (!b) {
    mujocoModule ??= import('./physics/mujoco');
    b = mujocoModule.then(async (m) => {
      mujocoEngine ??= m.loadMujoco();
      const mj = (await mujocoEngine) as Awaited<ReturnType<typeof m.loadMujoco>>;
      return m.createMujocoBackend(mj, p, ROOM);
    });
    mujocoBackends.set(p.id, b);
  }
  return b;
}

async function selectPhysics(name: BackendName, force = false): Promise<void> {
  physicsSel.value = name;
  if (name === backend.name && !force) return;
  const pose = force ? ROOM.spawn : backend.state().pose;
  const forRobot = profile.id;
  if (name === 'simple') {
    backend = createSimpleBackend(profile, ROOM);
    backend.reset(pose);
    physicsStatus = 'simple';
    notify();
    return;
  }
  physicsStatus = 'mujoco (loading…)';
  notify();
  try {
    const mj = await getMujoco(profile);
    // switched physics or robot while loading
    if (physicsSel.value !== 'mujoco' || profile.id !== forRobot) return;
    mj.reset(pose);
    backend = mj;
    physicsStatus = 'mujoco';
  } catch (e) {
    console.error(e);
    physicsStatus = 'mujoco failed, using simple';
    physicsSel.value = 'simple';
  }
  notify();
}

let snap: InputSnapshot = hub.poll(0);
let ctrl: ControllerOutput = control(profile.robot, snap.out, 0);
const loop = new FixedStepLoop((dt) => {
  const now = performance.now() / 1000;
  snap = hub.poll(now);
  ctrl = control(profile.robot, snap.out, now);
  backend.step(ctrl.duty, dt, { clawOpen: actions.state.clawOpen, headlights: actions.state.headlights });
});

const view = new SceneView($<HTMLCanvasElement>('view'), profile, ROOM);
view.insetEl = inset;

// --- UI state setters, shared by buttons, keys, gamepad and the host API ---
function setStopped(on: boolean): void {
  hub.stopped = on;
  stopBtn.classList.toggle('latched', on);
  stopBtn.textContent = on ? 'RESUME' : 'STOP';
  notify();
}

function setCamera(show: boolean): void {
  inset.classList.toggle('hidden', !show);
  camToggle.textContent = show ? 'Hide camera' : 'Show camera';
  notify();
}

function setFpv(on: boolean): void {
  view.setFpv(on);
  inset.querySelector('span')!.textContent = on ? 'World' : 'ESP32-CAM';
  swapBtn.textContent = on ? 'World view' : 'FPV view';
  setCamera(true);
}

function setFollow(on: boolean): void {
  if (on) view.follow = true;
  else view.overview(ROOM);
  viewBtn.textContent = on ? 'Room view' : 'Follow rover';
  notify();
}

/** Swap robots: new 3D model, new physics model, back to the start point. */
function setRobot(id: string): void {
  const next = getProfile(id);
  robotSel.value = next.id;
  if (next.id === profile.id) return;
  profile = next;
  view.setRobot(profile);
  actions.set({ clawOpen: true });
  void selectPhysics(physicsSel.value as BackendName, true);
  notify();
}

function reset(): void {
  backend.reset(ROOM.spawn);
  actions.set({ clawOpen: true });
  setStopped(false);
}

actions.onChange((a) => {
  clawBtn.classList.toggle('closed', !a.clawOpen);
  clawBtn.textContent = a.clawOpen ? 'GRAB' : 'RELEASE';
  lightsBtn.classList.toggle('on', a.headlights);
  nightBtn.textContent = a.night ? 'Day' : 'Night';
  view.setHeadlights(a.headlights);
  view.setNight(a.night);
  notify();
});

stopBtn.addEventListener('click', () => setStopped(!hub.stopped));
clawBtn.addEventListener('click', () => actions.toggle('clawOpen'));
lightsBtn.addEventListener('click', () => actions.toggle('headlights'));
nightBtn.addEventListener('click', () => actions.toggle('night'));
camToggle.addEventListener('click', () => setCamera(inset.classList.contains('hidden')));
swapBtn.addEventListener('click', () => setFpv(!view.fpv));
inset.addEventListener('click', () => setFpv(!view.fpv));
viewBtn.addEventListener('click', () => setFollow(!view.follow));
resetBtn.addEventListener('click', reset);
physicsSel.addEventListener('change', () => void selectPhysics(physicsSel.value as BackendName));
robotSel.addEventListener('change', () => setRobot(robotSel.value));

fullBtn.hidden = !document.fullscreenEnabled;
fullBtn.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    setStopped(!hub.stopped);
  } else if (e.code === 'KeyV') {
    setCamera(inset.classList.contains('hidden'));
  } else if (e.code === 'KeyF') {
    setFpv(!view.fpv);
  } else if (e.code in ACTION_KEYS) {
    actions.toggle(ACTION_KEYS[e.code]);
  }
});

// --- embed: "click to drive" hint while the frame doesn't have focus --------
if (opts.embed) {
  const show = (on: boolean) => hint.classList.toggle('visible', on);
  show(!document.hasFocus());
  window.addEventListener('blur', () => show(true));
  window.addEventListener('focus', () => show(false));
  window.addEventListener('pointerdown', () => show(false));
}

// --- host page API (postMessage) --------------------------------------------
function uiState(): SimUiState {
  return {
    clawClosed: !actions.state.clawOpen,
    lights: actions.state.headlights,
    night: actions.state.night,
    fpv: view.fpv,
    stopped: hub.stopped,
    follow: view.follow,
    camera: !inset.classList.contains('hidden'),
    physics: physicsStatus,
    robot: profile.id,
  };
}

function post(event: 'ready' | 'state', force = false): void {
  if (!framed) return;
  const state = uiState();
  const key = JSON.stringify(state);
  if (!force && key === lastSent) return;
  lastSent = key;
  window.parent.postMessage({ type: MESSAGE_TYPE, event, state }, opts.parentOrigin ?? '*');
}
function notify(): void {
  // setters also run during start-up; only report once the page is up
  if (started) post('state');
}

function apply(c: Command): void {
  switch (c.cmd) {
    case 'claw':
      actions.set({ clawOpen: !resolve(c.value, !actions.state.clawOpen) });
      break;
    case 'lights':
      actions.set({ headlights: resolve(c.value, actions.state.headlights) });
      break;
    case 'night':
      actions.set({ night: resolve(c.value, actions.state.night) });
      break;
    case 'fpv':
      setFpv(resolve(c.value, view.fpv));
      break;
    case 'stop':
      setStopped(resolve(c.value, hub.stopped));
      break;
    case 'follow':
      setFollow(resolve(c.value, view.follow));
      break;
    case 'camera':
      setCamera(resolve(c.value, !inset.classList.contains('hidden')));
      break;
    case 'physics':
      void selectPhysics(c.value);
      break;
    case 'robot':
      setRobot(c.value);
      break;
    case 'reset':
      reset();
      break;
    case 'getState':
      post('state', true);
      break;
  }
}

window.addEventListener('message', (e) => {
  // only the page that embeds us, and only from the allowed origin if one was given
  if (!framed || e.source !== window.parent) return;
  if (opts.parentOrigin && e.origin !== opts.parentOrigin) return;
  const c = parseCommand(e.data);
  if (c) apply(c);
});

// --- start -----------------------------------------------------------------
if (opts.embed) setFollow(false);
started = true;
post('ready', true);
void selectPhysics('mujoco');

const f = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(2);
const row = (name: string, a: Axes | null) =>
  `${name.padEnd(9)}${a ? `${f(a.lx)}  ${f(a.ly)}  ${f(a.rx)}` : '   --     --     --'}`;

let last = performance.now();
// smoothed per-frame cost of physics and rendering (ms), and frame rate
let physMs = 0;
let drawMs = 0;
let fps = 60;
const ema = (avg: number, x: number) => avg + (x - avg) * 0.1;
function frame(now: number): void {
  const dt = (now - last) / 1000;
  const t0 = performance.now();
  loop.advance(dt);
  const t1 = performance.now();
  last = now;
  const s = backend.state();
  view.render(s);
  const t2 = performance.now();
  physMs = ema(physMs, t1 - t0);
  drawMs = ema(drawMs, t2 - t1);
  if (dt > 0) fps = ema(fps, 1 / dt);
  if (opts.hud) {
    const flags = [!actions.state.clawOpen && 'CLAW CLOSED', actions.state.headlights && 'LIGHTS', snap.stopped && 'STOPPED', ctrl.watchdog && 'WATCHDOG', s.contact && `bump: ${s.contact}`].filter(Boolean);
    hud.textContent =
      `physics ${physicsStatus}  ${fps.toFixed(0)} fps\n` +
      `frame  physics ${physMs.toFixed(1)} ms  render ${drawMs.toFixed(1)} ms\n` +
      `source      lx     ly     rx\n` +
      `${row('keyboard', snap.sources.keyboard)}\n` +
      `${row('joystick', snap.sources.joystick)}\n` +
      `${row('gamepad', snap.sources.gamepad)}\n` +
      `${row('→ out', snap.out)}\n` +
      `duty   L ${f(ctrl.duty.left)}   R ${f(ctrl.duty.right)}\n` +
      `speed  ${f(s.v)} m/s   yaw ${f(s.w)} rad/s\n` +
      `pose   ${f(s.pose.x)} ${f(s.pose.y)}  θ ${f(s.pose.theta)}\n` +
      (flags.length ? flags.join('  ') : `pad: ${gamepad.padId ?? 'none'}`);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
