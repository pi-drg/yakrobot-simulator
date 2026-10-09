/** On/off commands that sit beside the drive axes. */
export interface ActionState {
  clawOpen: boolean;
  headlights: boolean;
  night: boolean;
}

export type ActionName = keyof ActionState;

export const DEFAULT_ACTIONS: ActionState = { clawOpen: true, headlights: false, night: false };

/** Keyboard codes that toggle an action. */
export const ACTION_KEYS: Record<string, ActionName> = {
  KeyC: 'clawOpen',
  KeyL: 'headlights',
  KeyN: 'night',
};

/** Standard-mapping gamepad buttons that toggle an action (B / Circle is stop). */
export const ACTION_BUTTONS: Record<number, ActionName> = {
  0: 'clawOpen', // A / Cross
  2: 'headlights', // X / Square
};

/** Toggle state shared by every input source; listeners update the UI. */
export class Actions {
  private s: ActionState = { ...DEFAULT_ACTIONS };
  private readonly listeners: ((s: Readonly<ActionState>) => void)[] = [];

  get state(): Readonly<ActionState> {
    return this.s;
  }

  toggle(name: ActionName): void {
    this.set({ [name]: !this.s[name] });
  }

  set(patch: Partial<ActionState>): void {
    this.s = { ...this.s, ...patch };
    for (const l of this.listeners) l(this.s);
  }

  onChange(l: (s: Readonly<ActionState>) => void): void {
    this.listeners.push(l);
    l(this.s);
  }
}
