/** Page options read from the URL query string. */
export interface PageOptions {
  /** Framed in a host page: no debug HUD, compact controls, starts in the room view. */
  embed: boolean;
  /** Show the debug HUD (default: on unless embedded). */
  hud: boolean;
  /** Only accept commands from, and only post state to, this origin. null = any. */
  parentOrigin: string | null;
  /** Robot profile id from ?robot= (unknown ids fall back to the default). */
  robot: string | null;
  /** CSS colour overrides, already validated. */
  theme: Partial<Record<ThemeVar, string>>;
}

/** Theme slots a host page may set: query param -> CSS custom property. */
export const THEME_PARAMS = {
  accent: '--accent', // joystick knob, active buttons
  stop: '--stop', // STOP button
  panel: '--panel', // control strip background
  frame: '--frame', // camera inset border
} as const;
export type ThemeVar = (typeof THEME_PARAMS)[keyof typeof THEME_PARAMS];

/** Hex colours only (#rgb, #rgba, #rrggbb, #rrggbbaa), so a URL can't inject CSS. */
export function parseColor(v: string | null): string | null {
  if (!v) return null;
  const hex = v.startsWith('#') ? v.slice(1) : v;
  return /^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex) ? `#${hex}` : null;
}

/** An http(s) origin like https://yakrobot.com, normalised; anything else is rejected. */
export function parseOrigin(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

const flag = (q: URLSearchParams, k: string): boolean | null => {
  if (!q.has(k)) return null;
  const v = q.get(k);
  return v === '' || v === '1' || v === 'true';
};

export function parseOptions(search: string): PageOptions {
  const q = new URLSearchParams(search);
  const embed = flag(q, 'embed') ?? false;
  const theme: PageOptions['theme'] = {};
  for (const [param, cssVar] of Object.entries(THEME_PARAMS)) {
    const c = parseColor(q.get(param));
    if (c) theme[cssVar] = c;
  }
  return {
    embed,
    hud: flag(q, 'hud') ?? !embed,
    parentOrigin: parseOrigin(q.get('parent')),
    robot: /^[a-z0-9-]{1,40}$/.test(q.get('robot') ?? '') ? q.get('robot') : null,
    theme,
  };
}
