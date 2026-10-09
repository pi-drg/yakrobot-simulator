import type { InputSource, RawAxes } from './types';

const KEYS: Record<string, [keyof RawAxes, number]> = {
  KeyW: ['ly', 1], ArrowUp: ['ly', 1],
  KeyS: ['ly', -1], ArrowDown: ['ly', -1],
  KeyD: ['rx', 1], ArrowRight: ['rx', 1],
  KeyA: ['rx', -1], ArrowLeft: ['rx', -1],
  KeyE: ['lx', 1],
  KeyQ: ['lx', -1],
};

/** WASD / arrows drive, Q/E strafe. Opposite keys cancel. */
export class KeyboardSource implements InputSource {
  readonly name = 'keyboard' as const;
  private readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.code in KEYS) {
        this.down.add(e.code);
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  read(): RawAxes {
    const a: RawAxes = { lx: 0, ly: 0, rx: 0 };
    for (const code of this.down) {
      const [axis, sign] = KEYS[code];
      a[axis] += sign;
    }
    a.lx = Math.sign(a.lx);
    a.ly = Math.sign(a.ly);
    a.rx = Math.sign(a.rx);
    return a;
  }
}
