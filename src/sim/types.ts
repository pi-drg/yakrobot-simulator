/** Planar robot pose in the world frame. x/y in metres, theta in radians (CCW from +x). */
export interface Pose {
  x: number;
  y: number;
  theta: number;
}

/** Body-frame velocity command: v forward (m/s), w yaw rate (rad/s). */
export interface BodyCommand {
  v: number;
  w: number;
}
