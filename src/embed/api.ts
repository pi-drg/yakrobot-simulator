/**
 * postMessage API so a host page can drive the sim from its own buttons.
 *
 * Host -> sim:  { type: 'yakrobot-sim', cmd: <Command>, value?: <boolean | string> }
 * Sim -> host:  { type: 'yakrobot-sim', event: 'ready' | 'state', state: SimUiState }
 *
 * Boolean commands toggle when `value` is omitted.
 */
export const MESSAGE_TYPE = 'yakrobot-sim';

export type Command =
  | { cmd: 'claw'; value?: boolean } // true = closed (grab)
  | { cmd: 'lights'; value?: boolean }
  | { cmd: 'night'; value?: boolean }
  | { cmd: 'fpv'; value?: boolean }
  | { cmd: 'stop'; value?: boolean } // true = latched stop
  | { cmd: 'follow'; value?: boolean } // false = room overview
  | { cmd: 'camera'; value?: boolean } // show the camera inset
  | { cmd: 'physics'; value: 'mujoco' | 'simple' }
  | { cmd: 'robot'; value: string } // robot profile id, e.g. 'yakrobot-4wd'
  | { cmd: 'reset' }
  | { cmd: 'getState' };

export interface SimUiState {
  clawClosed: boolean;
  lights: boolean;
  night: boolean;
  fpv: boolean;
  stopped: boolean;
  follow: boolean;
  camera: boolean;
  physics: string;
  robot: string;
}

const BOOL_CMDS = new Set(['claw', 'lights', 'night', 'fpv', 'stop', 'follow', 'camera']);

/** Validate an incoming message; anything malformed or foreign returns null. */
export function parseCommand(data: unknown): Command | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as { type?: unknown; cmd?: unknown; value?: unknown };
  if (m.type !== MESSAGE_TYPE || typeof m.cmd !== 'string') return null;
  if (BOOL_CMDS.has(m.cmd)) {
    if (m.value !== undefined && typeof m.value !== 'boolean') return null;
    return { cmd: m.cmd, value: m.value } as Command;
  }
  if (m.cmd === 'physics') return m.value === 'mujoco' || m.value === 'simple' ? { cmd: 'physics', value: m.value } : null;
  if (m.cmd === 'robot') return typeof m.value === 'string' && /^[a-z0-9-]{1,40}$/.test(m.value) ? { cmd: 'robot', value: m.value } : null;
  if (m.cmd === 'reset' || m.cmd === 'getState') return { cmd: m.cmd };
  return null;
}

/** Resolve a boolean command against the current value (omitted value = toggle). */
export const resolve = (value: boolean | undefined, current: boolean): boolean => value ?? !current;
