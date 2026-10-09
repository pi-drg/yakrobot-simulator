/** Oriented box obstacle on the floor. cx/cy centre (m), hx/hy half extents (m), rot (rad), h height (m). */
export interface Obstacle {
  name: string;
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  rot: number;
  h: number;
}

export interface World {
  obstacles: Obstacle[];
}

const box = (name: string, cx: number, cy: number, sx: number, sy: number, h: number, rot = 0): Obstacle => ({
  name, cx, cy, hx: sx / 2, hy: sy / 2, rot, h,
});

/** 4 x 4 m arena with walls and a few household-sized obstacles. */
export const DEFAULT_WORLD: World = {
  obstacles: [
    box('wall-n', 0, 2.05, 4.2, 0.1, 0.3),
    box('wall-s', 0, -2.05, 4.2, 0.1, 0.3),
    box('wall-e', 2.05, 0, 0.1, 4.0, 0.3),
    box('wall-w', -2.05, 0, 0.1, 4.0, 0.3),
    box('books', 0.9, 0.35, 0.3, 0.22, 0.08, 0.3),
    box('crate', -0.8, 0.9, 0.4, 0.4, 0.3),
    box('shoebox', 0.2, -1.0, 0.33, 0.2, 0.12, -0.6),
    box('bin', -1.2, -0.9, 0.25, 0.25, 0.35),
  ],
};

export interface Contact {
  /** Push-out vector applied to the circle centre (m). */
  nx: number;
  ny: number;
  depth: number;
  obstacle: string;
}

/**
 * Circle-vs-oriented-box: returns the push-out needed to separate a circle of
 * radius r at (px, py) from the box, or null when they don't overlap.
 */
export function circleBox(px: number, py: number, r: number, b: Obstacle): Contact | null {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  // circle centre in box frame
  const dx = px - b.cx;
  const dy = py - b.cy;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const qx = Math.max(-b.hx, Math.min(b.hx, lx));
  const qy = Math.max(-b.hy, Math.min(b.hy, ly));
  let nx: number;
  let ny: number;
  let depth: number;
  if (qx === lx && qy === ly) {
    // centre inside the box: leave through the nearest face
    const ex = b.hx - Math.abs(lx);
    const ey = b.hy - Math.abs(ly);
    if (ex < ey) {
      nx = Math.sign(lx) || 1;
      ny = 0;
      depth = ex + r;
    } else {
      nx = 0;
      ny = Math.sign(ly) || 1;
      depth = ey + r;
    }
  } else {
    const ox = lx - qx;
    const oy = ly - qy;
    const d = Math.hypot(ox, oy);
    if (d >= r) return null;
    nx = ox / d;
    ny = oy / d;
    depth = r - d;
  }
  // back to world frame
  return { nx: (nx * c - ny * s) * depth, ny: (nx * s + ny * c) * depth, depth, obstacle: b.name };
}
