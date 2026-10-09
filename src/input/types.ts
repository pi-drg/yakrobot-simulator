/**
 * Normalised driver input. Axes in [-1, 1] after deadband; t is the sample
 * time in seconds (performance clock) used by the controller watchdog.
 *  ly: forward (+) / back (-)
 *  rx: turn right (+) / left (-)
 *  lx: strafe right (+) / left (-); unused by the skid-steer rover
 */
export interface Axes {
  lx: number;
  ly: number;
  rx: number;
  t: number;
}

export type SourceName = 'keyboard' | 'joystick' | 'gamepad';

/** Raw sample from one source, before deadband. */
export type RawAxes = Omit<Axes, 't'>;

export interface InputSource {
  readonly name: SourceName;
  /** Current raw axes, or null when the source isn't present (e.g. no gamepad). */
  read(): RawAxes | null;
}

export const ZERO: RawAxes = { lx: 0, ly: 0, rx: 0 };
