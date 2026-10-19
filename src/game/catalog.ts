export type Vec3 = { x: number; y: number; z: number };
export type WeaponId = 'vandal' | 'spectre' | 'marshal' | 'ghost';
export type Difficulty = 'recruit' | 'regular' | 'veteran';
export interface WeaponDef {
  id: WeaponId; name: string; category: string; description: string;
  damage: number; headMultiplier: number; magazine: number; reserve: number;
  interval: number; reload: number; spread: number; movingSpread: number;
  recoil: number; automatic: boolean; range: number; zoom: number;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  vandal: { id: 'vandal', name: 'REVENANT', category: 'ASSAULT RIFLE', description: 'Decisive at every distance. Stop, settle, strike.', damage: 35, headMultiplier: 4.3, magazine: 25, reserve: 100, interval: .105, reload: 2.25, spread: .0014, movingSpread: .065, recoil: .014, automatic: true, range: 90, zoom: 1.4 },
  spectre: { id: 'spectre', name: 'VECTOR–9', category: 'SUBMACHINE GUN', description: 'Fast hands. Faster follow-up. Own the close angles.', damage: 23, headMultiplier: 3.6, magazine: 30, reserve: 120, interval: .071, reload: 1.8, spread: .004, movingSpread: .035, recoil: .010, automatic: true, range: 55, zoom: 1.25 },
  marshal: { id: 'marshal', name: 'LONGSHOT', category: 'PRECISION RIFLE', description: 'One angle. One opportunity. Make it count.', damage: 101, headMultiplier: 2, magazine: 5, reserve: 25, interval: 1.15, reload: 2.8, spread: .003, movingSpread: .10, recoil: .048, automatic: false, range: 140, zoom: 3 },
  ghost: { id: 'ghost', name: 'PHANTOM .45', category: 'SIDEARM', description: 'Quiet confidence. A reliable answer to any encounter.', damage: 32, headMultiplier: 3.4, magazine: 12, reserve: 60, interval: .22, reload: 1.5, spread: .002, movingSpread: .04, recoil: .021, automatic: false, range: 65, zoom: 1.2 },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export interface Skin { id: string; name: string; series: string; color: string; secondary: string; glow: string; animated: boolean; pattern: 'solid' | 'stripe' | 'circuit' | 'wave'; texture?: string; }
export const SKINS: Skin[] = [
  { id: 'carbon', name: 'Carbon', series: 'STANDARD ISSUE', color: '#323e43', secondary: '#131b20', glow: '#b0c5c9', animated: false, pattern: 'solid' },
  { id: 'afterburn', name: 'Afterburn', series: 'REACTOR COLLECTION', color: '#e75b35', secondary: '#252b31', glow: '#ffb66b', animated: true, pattern: 'stripe' },
  { id: 'ion', name: 'Ion Drift', series: 'REACTOR COLLECTION', color: '#e3edf0', secondary: '#364c62', glow: '#72eeff', animated: true, pattern: 'circuit' },
  { id: 'void', name: 'Event Horizon', series: 'AFTER DARK COLLECTION', color: '#482c6e', secondary: '#171522', glow: '#c987ff', animated: true, pattern: 'wave' },
  { id: 'jade', name: 'Jade Protocol', series: 'REACTOR COLLECTION', color: '#1e6556', secondary: '#153831', glow: '#8affc5', animated: true, pattern: 'circuit' },
  { id: 'gold', name: 'Sovereign', series: 'PRECIOUS METALS', color: '#c29a50', secondary: '#f0e5cf', glow: '#ffe5a4', animated: false, pattern: 'stripe' },
  { id: 'sakura', name: 'Cherry Static', series: 'AFTER DARK COLLECTION', color: '#e698ae', secondary: '#4a2c42', glow: '#ffd1eb', animated: true, pattern: 'wave' },
  { id: 'arctic', name: 'Whiteout', series: 'FIELD COLLECTION', color: '#ced9d7', secondary: '#607d86', glow: '#d4f6ff', animated: false, pattern: 'stripe' },
];
export interface Settings { sensitivity: number; volume: number; fov: number; crosshair: string; difficulty: Difficulty; botCount: number; invincible: boolean; }
export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, volume: .45, fov: 85, crosshair: '#b4ffd8', difficulty: 'regular', botCount: 5, invincible: false };
export const BOT_NAMES = ['Kestrel', 'Echo', 'Vesper', 'Rook', 'Mako', 'Cipher', 'Nomad', 'Wraith'];
