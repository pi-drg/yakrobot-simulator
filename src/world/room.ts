import type { Pose } from '../sim/types';

/**
 * Scene description shared by the MuJoCo model, the simple model's obstacle
 * list and the renderer. World frame: x east, y north, z up, metres.
 */
export type Shape =
  | { kind: 'box'; size: [number, number, number] }
  | { kind: 'cylinder'; radius: number; height: number }
  | { kind: 'sphere'; radius: number };

export type Look = 'plain' | 'football' | 'rug' | 'bowl' | 'can' | 'cushion';

export interface Item {
  name: string;
  shape: Shape;
  /** Centre of the shape. */
  pos: [number, number, number];
  yaw?: number;
  color: string;
  look?: Look;
  /** Present for loose objects the rover can push; absent for fixed furniture. */
  dynamic?: { mass: number; friction?: number; rolling?: number };
}

export interface Room {
  /** Floor size along x and y. */
  size: [number, number];
  wallHeight: number;
  wallThickness: number;
  floorColor: string;
  wallColor: string;
  items: Item[];
  spawn: Pose;
}

const box = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z0: number, color: string, extra: Partial<Item> = {}): Item => ({
  name, shape: { kind: 'box', size: [sx, sy, sz] }, pos: [x, y, z0 + sz / 2], color, ...extra,
});

/** A small bedroom, roughly 4 x 3.4 m, laid out like the Jumper demo room. */
export const ROOM: Room = {
  size: [4, 3.4],
  wallHeight: 1.1,
  wallThickness: 0.1,
  floorColor: '#e6e0d6',
  wallColor: '#dcd6cc',
  spawn: { x: -0.35, y: -0.65, theta: 0.6 },
  items: [
    // bed against the north wall
    box('bed-frame', 1.1, 2.0, 0.3, -1.25, 0.7, 0, '#b07a4a'),
    box('bed-mattress', 1.04, 1.94, 0.16, -1.25, 0.7, 0.3, '#f2efe8', { look: 'cushion' }),
    box('bed-blanket', 1.08, 1.3, 0.04, -1.25, 0.39, 0.44, '#98aa90', { look: 'cushion' }),
    box('bed-pillow', 0.7, 0.32, 0.1, -1.25, 1.42, 0.46, '#fbfaf6', { look: 'cushion' }),
    box('bed-headboard', 1.1, 0.06, 0.85, -1.25, 1.67, 0, '#9c6a3e'),
    box('bedside', 0.42, 0.36, 0.48, -0.4, 1.47, 0, '#c49a6c'),
    // sofa against the east wall
    box('sofa-base', 0.9, 1.9, 0.42, 1.5, 0.35, 0, '#8fa57f', { look: 'cushion' }),
    box('sofa-back', 0.22, 1.9, 0.42, 1.84, 0.35, 0.42, '#86a076', { look: 'cushion' }),
    box('sofa-arm-n', 0.9, 0.2, 0.2, 1.5, 1.2, 0.42, '#86a076', { look: 'cushion' }),
    box('sofa-arm-s', 0.9, 0.2, 0.2, 1.5, -0.5, 0.42, '#86a076', { look: 'cushion' }),
    // rug the rover can drive over
    box('rug', 1.8, 1.3, 0.006, 0.05, -0.35, 0, '#d8c39a', { yaw: 0.12, look: 'rug' }),
    // loose things to push around
    {
      name: 'football', shape: { kind: 'sphere', radius: 0.07 }, pos: [0.45, -0.1, 0.07 + 0.006], color: '#ffffff', look: 'football',
      dynamic: { mass: 0.12, friction: 0.7, rolling: 0.002 },
    },
    box('book-1', 0.24, 0.17, 0.035, 0.95, -1.1, 0, '#c4553c', { yaw: 0.3, dynamic: { mass: 0.35 } }),
    box('book-2', 0.22, 0.16, 0.03, 0.96, -1.09, 0.035, '#3f6f8f', { yaw: 0.15, dynamic: { mass: 0.3 } }),
    box('book-3', 0.2, 0.14, 0.03, 0.95, -1.1, 0.065, '#e0b24a', { yaw: 0.4, dynamic: { mass: 0.25 } }),
    {
      name: 'can', shape: { kind: 'cylinder', radius: 0.033, height: 0.115 }, pos: [1.55, -1.25, 0.0575], color: '#5b7f95', look: 'can',
      dynamic: { mass: 0.03 },
    },
    {
      name: 'bowl', shape: { kind: 'cylinder', radius: 0.11, height: 0.05 }, pos: [-1.5, -1.15, 0.025], color: '#9fc0b8', look: 'bowl',
      dynamic: { mass: 0.4 },
    },
  ],
};

export interface WallSpec {
  name: string;
  size: [number, number, number];
  pos: [number, number, number];
}

/** Four walls just outside the floor edge. */
export function walls(room: Room): WallSpec[] {
  const [w, d] = room.size;
  const t = room.wallThickness;
  const h = room.wallHeight;
  return [
    { name: 'wall-n', size: [w + 2 * t, t, h], pos: [0, d / 2 + t / 2, h / 2] },
    { name: 'wall-s', size: [w + 2 * t, t, h], pos: [0, -d / 2 - t / 2, h / 2] },
    { name: 'wall-e', size: [t, d, h], pos: [w / 2 + t / 2, 0, h / 2] },
    { name: 'wall-w', size: [t, d, h], pos: [-w / 2 - t / 2, 0, h / 2] },
  ];
}
