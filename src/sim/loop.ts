/** Fixed simulation step: 50 Hz. */
export const DT = 1 / 50;

/** Cap on catch-up steps per frame so a stalled tab doesn't spiral. */
const MAX_STEPS_PER_FRAME = 10;

/**
 * Fixed-step accumulator. Feed it wall-clock frame deltas; it calls `step`
 * a whole number of times at DT and drops time beyond MAX_STEPS_PER_FRAME.
 */
export class FixedStepLoop {
  private acc = 0;
  public ticks = 0;

  constructor(private readonly step: (dt: number) => void) {}

  advance(frameSeconds: number): number {
    this.acc += Math.max(0, frameSeconds);
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS_PER_FRAME) {
      this.step(DT);
      this.acc -= DT;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.ticks += n;
    return n;
  }
}
