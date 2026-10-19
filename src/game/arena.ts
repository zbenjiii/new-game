import type { Vec3 } from './catalog';
export interface Obstacle { x: number; z: number; w: number; d: number; h: number; type: 'wall' | 'crate' | 'building' | 'core'; }
export const ARENA_HALF = 25;
export const OBSTACLES: Obstacle[] = [
  { x: -25.5, z: 0, w: 1, d: 52, h: 7, type: 'wall' },
  { x: 25.5, z: 0, w: 1, d: 52, h: 7, type: 'wall' },
  { x: 0, z: -25.5, w: 52, d: 1, h: 7, type: 'wall' },
  { x: 0, z: 25.5, w: 52, d: 1, h: 7, type: 'wall' },
  { x: 0, z: 0, w: 5, d: 5, h: 3.8, type: 'core' },
  { x: -13, z: -11, w: 7, d: 9, h: 6, type: 'building' },
  { x: 14, z: 10, w: 7, d: 9, h: 6, type: 'building' },
  { x: -14, z: 12, w: 6, d: 3, h: 2.4, type: 'crate' },
  { x: 12, z: -12, w: 5, d: 3, h: 2.4, type: 'crate' },
  { x: -5, z: 12, w: 3, d: 3, h: 2, type: 'crate' },
  { x: 5, z: -12, w: 3, d: 3, h: 2, type: 'crate' },
  { x: -13, z: 2, w: 4, d: 2, h: 1.2, type: 'crate' },
  { x: 13, z: -2, w: 4, d: 2, h: 1.2, type: 'crate' },
  { x: -3, z: -20, w: 5, d: 1, h: 2.6, type: 'wall' },
  { x: 3, z: 20, w: 5, d: 1, h: 2.6, type: 'wall' },
];
export const SPAWNS: Vec3[] = [
  { x: 0, y: 0, z: 16 }, { x: 19, y: 0, z: -19 }, { x: -20, y: 0, z: -20 },
  { x: 20, y: 0, z: 20 }, { x: -20, y: 0, z: 20 }, { x: 0, y: 0, z: -17 },
  { x: -20, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, { x: -8, y: 0, z: 18 },
];
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function blocked(x: number, z: number, radius = .38, feet = 0): boolean {
  return OBSTACLES.some(o => feet < o.h && x > o.x - o.w / 2 - radius && x < o.x + o.w / 2 + radius && z > o.z - o.d / 2 - radius && z < o.z + o.d / 2 + radius);
}
export function move(pos: Vec3, dx: number, dz: number, radius = .38): void {
  if (!blocked(pos.x + dx, pos.z, radius, pos.y)) pos.x += dx;
  if (!blocked(pos.x, pos.z + dz, radius, pos.y)) pos.z += dz;
}
export function rayBox(origin: Vec3, dir: Vec3, o: Obstacle): number {
  let near = 0, far = Infinity;
  const mins = [o.x - o.w / 2, 0, o.z - o.d / 2];
  const maxs = [o.x + o.w / 2, o.h, o.z + o.d / 2];
  const os = [origin.x, origin.y, origin.z], ds = [dir.x, dir.y, dir.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-8) { if (os[i] < mins[i] || os[i] > maxs[i]) return Infinity; }
    else {
      let a = (mins[i] - os[i]) / ds[i], b = (maxs[i] - os[i]) / ds[i];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return far < 0 ? Infinity : near;
}
export function wallDistance(origin: Vec3, dir: Vec3): number { return Math.min(...OBSTACLES.map(o => rayBox(origin, dir, o))); }
export function visible(a: Vec3, b: Vec3): boolean {
  const d = distance(a, b);
  return wallDistance(a, { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d }) > d - .2;
}
export function raySphere(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number {
  const x = origin.x - center.x, y = origin.y - center.y, z = origin.z - center.z;
  const b = x * dir.x + y * dir.y + z * dir.z;
  const c = x * x + y * y + z * z - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}
// Grid paths are independent of graphics and can run in an authoritative server.
const GRID = 25, CELL = 2;
const toGrid = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor((v + 25) / CELL)));
const fromGrid = (v: number) => v * CELL - 24;
export function findPath(from: Vec3, to: Vec3): Vec3[] {
  const sx = toGrid(from.x), sz = toGrid(from.z), tx = toGrid(to.x), tz = toGrid(to.z);
  const start = sz * GRID + sx, goal = tz * GRID + tx;
  const queue = [start], previous = new Map<number, number>([[start, -1]]);
  let found = start, best = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i], x = node % GRID, z = Math.floor(node / GRID);
    const dist = Math.abs(tx - x) + Math.abs(tz - z);
    if (dist < best) { best = dist; found = node; }
    if (node === goal) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, next = nz * GRID + nx;
      if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID || previous.has(next) || blocked(fromGrid(nx), fromGrid(nz), .5)) continue;
      previous.set(next, node); queue.push(next);
    }
  }
  const path: Vec3[] = [];
  while (found !== start && found !== -1) {
    path.push({ x: fromGrid(found % GRID), y: 0, z: fromGrid(Math.floor(found / GRID)) });
    found = previous.get(found) ?? -1;
  }
  return path.reverse();
}
