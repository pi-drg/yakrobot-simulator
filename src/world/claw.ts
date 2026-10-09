import type { ClawSpec } from '../robots/assembly';

/** A box in some frame (x fwd, y left, z up), metres. size = [length, thickness, height]. */
export interface ClawBox {
  name: string;
  pos: [number, number, number];
  size: [number, number, number];
  yaw: number;
}

export interface ClawArm {
  side: 'l' | 'r';
  /** Hinge position in the robot frame. */
  pivot: [number, number, number];
  /** Opening direction about +z: +1 for the left arm, -1 for the right. */
  openSign: 1 | -1;
  /** Pieces in the arm's own frame (origin at the pivot, closed pose). */
  boxes: ClawBox[];
}

export interface ClawGeometry {
  backplate: ClawBox;
  arms: ClawArm[];
  openAngle: number;
}

export type { ClawSpec };

function segment(name: string, a: [number, number], b: [number, number], z: number, t: number, h: number): ClawBox {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return {
    name,
    pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z],
    // overlap the joints by one thickness so the ball can't snag in a gap
    size: [Math.hypot(dx, dy) + t, t, h],
    yaw: Math.atan2(dy, dx),
  };
}

/**
 * Servo claw seen from above, closed:
 *
 *        hook  \_  _/  hook
 *              |    |      arms hinge at the front corners and swing
 *              |    |      outward (left CCW, right CW) to open
 *     pivot -> o====o <- pivot
 *              backplate
 */
export function clawGeometry(c: ClawSpec): ClawGeometry | null {
  if (!c.enabled) return null;
  const mm = (v: number) => v / 1000;
  const t = mm(c.thickness_mm);
  const h = mm(c.height_mm);
  const z = mm(c.groundClearance_mm) + h / 2;
  const backplate: ClawBox = {
    name: 'claw_back',
    pos: [mm(c.backplate_x_mm), 0, z],
    size: [t, mm(c.backplateWidth_mm), h],
    yaw: 0,
  };
  const arms: ClawArm[] = (['l', 'r'] as const).map((side) => {
    const s = side === 'l' ? 1 : -1;
    const L = mm(c.armLength_mm);
    const hook: [number, number] = [L + mm(c.hook_dx_mm), -s * mm(c.hook_dy_mm)];
    return {
      side,
      pivot: [mm(c.pivot_x_mm), s * mm(c.pivot_y_mm), 0],
      openSign: s as 1 | -1,
      boxes: [
        segment(`claw_arm_${side}`, [0, 0], [L, 0], z, t, h),
        segment(`claw_hook_${side}`, [L, 0], hook, z, t, h),
      ],
    };
  });
  return { backplate, arms, openAngle: (c.openAngle_deg * Math.PI) / 180 };
}

/** Every claw geom name, for contact reporting. */
export const clawGeomNames = (g: ClawGeometry | null): string[] =>
  g ? [g.backplate.name, ...g.arms.flatMap((a) => a.boxes.map((b) => b.name))] : [];
