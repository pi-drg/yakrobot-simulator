import { merge, shape } from './shape';
import type { Axes, InputSource, SourceName } from './types';

export interface InputSnapshot {
  out: Axes;
  sources: Record<SourceName, Axes | null>;
  stopped: boolean;
}

/** Polls every source once per tick and merges them into one Axes stream. */
export class InputHub {
  stopped = false;

  constructor(private readonly sources: readonly InputSource[]) {}

  toggleStop(): void {
    this.stopped = !this.stopped;
  }

  poll(t: number): InputSnapshot {
    const sources = { keyboard: null, joystick: null, gamepad: null } as Record<SourceName, Axes | null>;
    const shaped = this.sources.map((s) => {
      const raw = s.read();
      const a = raw ? shape(raw, t) : null;
      sources[s.name] = a;
      return a;
    });
    return { out: merge(shaped, t, this.stopped), sources, stopped: this.stopped };
  }
}
