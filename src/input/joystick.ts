import type { InputSource, RawAxes } from './types';

/**
 * On-screen pointer joystick (mouse, touch, pen). Up = forward (ly),
 * right = turn right (rx). Knob is clamped to the base circle.
 */
export class JoystickSource implements InputSource {
  readonly name = 'joystick' as const;
  private x = 0;
  private y = 0;
  private pointer: number | null = null;
  private readonly knob: HTMLElement;

  constructor(private readonly base: HTMLElement) {
    this.knob = base.querySelector('.knob') as HTMLElement;
    base.addEventListener('pointerdown', (e) => {
      if (this.pointer !== null) return;
      this.pointer = e.pointerId;
      try {
        base.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic or already-released pointer; moves still arrive while over the base.
      }
      this.move(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.move(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.set(0, 0);
    };
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
    base.addEventListener('lostpointercapture', release);
  }

  private move(e: PointerEvent): void {
    const r = this.base.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      dx /= d;
      dy /= d;
    }
    this.set(dx, dy);
  }

  private set(dx: number, dy: number): void {
    this.x = dx;
    this.y = dy;
    const travel = this.base.clientWidth / 2;
    this.knob.style.transform = `translate(${dx * travel}px, ${dy * travel}px)`;
  }

  read(): RawAxes {
    return { lx: 0, ly: -this.y, rx: this.x };
  }
}
