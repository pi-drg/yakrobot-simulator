import type { InputSource, RawAxes } from './types';

const STOP_BUTTON = 1; // B / Circle

/**
 * First connected Gamepad API pad, standard mapping: left stick Y = ly,
 * left stick X = lx (strafe), right stick X = rx. Button 1 (B / Circle)
 * reports a stop press via onStop; other buttons call onButton(index) on press.
 */
export class GamepadSource implements InputSource {
  readonly name = 'gamepad' as const;
  private wasDown: boolean[] = [];
  padId: string | null = null;

  constructor(
    private readonly onStop: () => void,
    private readonly onButton: (index: number) => void = () => {},
  ) {}

  read(): RawAxes | null {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected) ?? null;
    this.padId = pad?.id ?? null;
    if (!pad) return null;
    pad.buttons.forEach((b, i) => {
      if (b.pressed && !this.wasDown[i]) {
        if (i === STOP_BUTTON) this.onStop();
        else this.onButton(i);
      }
      this.wasDown[i] = b.pressed;
    });
    return {
      lx: pad.axes[0] ?? 0,
      ly: -(pad.axes[1] ?? 0),
      rx: pad.axes[2] ?? 0,
    };
  }
}
