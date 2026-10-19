import { describe, expect, it } from 'vitest';
import { Simulation, neutralInput, type InputCommand } from '../src/game/simulation';
import { DEFAULT_SETTINGS, WEAPONS } from '../src/game/catalog';
import { blocked, findPath, rayBox, raySphere, visible } from '../src/game/arena';
const fresh = (count = 0) => new Simulation({ ...DEFAULT_SETTINGS, botCount: count }, 'vandal', 12345);
const advance = (sim: Simulation, input: Partial<InputCommand>, ticks = 60) => { for (let i = 0; i < ticks; i++) sim.step({ ...neutralInput(), ...input, sequence: i }); };

describe('tactical movement and collision', () => {
  it('moves in the facing direction and stops quickly when released', () => {
    const sim = fresh(); advance(sim, { forward: 1 }); expect(sim.player.pos.z).toBeLessThan(12); expect(sim.speed).toBeCloseTo(5.5, 1);
    advance(sim, {}, 15); expect(sim.speed).toBeLessThan(.1);
  });
  it('normalizes diagonal movement', () => {
    const a = fresh(), b = fresh(); advance(a, { forward: 1 }); advance(b, { forward: 1, right: 1 });
    expect(a.speed).toBeCloseTo(b.speed, 5);
  });
  it('blocks movement into the central structure', () => {
    const sim = fresh(); advance(sim, { forward: 1 }, 600); expect(sim.player.pos.z).toBeGreaterThanOrEqual(2.88); expect(blocked(sim.player.pos.x, sim.player.pos.z)).toBe(false);
  });
  it('jumps and lands without automatically bunny hopping on a held key', () => {
    const sim = fresh(); advance(sim, { jump: true }, 10); expect(sim.player.pos.y).toBeGreaterThan(.5);
    advance(sim, { jump: true }, 90); expect(sim.player.pos.y).toBe(0); expect(sim.player.grounded).toBe(true);
  });
  it('reduces walk and crouch speed and increases moving/in-air spread', () => {
    const walk = fresh(), crouch = fresh(), run = fresh(); const stationarySpread = run.spread;
    advance(walk, { forward: 1, walk: true }); advance(crouch, { forward: 1, crouch: true }); advance(run, { forward: 1 });
    expect(crouch.speed).toBeLessThan(walk.speed); expect(walk.speed).toBeLessThan(run.speed); expect(run.spread).toBeGreaterThan(stationarySpread * 10);
    run.player.grounded = false; expect(run.spread).toBeGreaterThan(.08);
  });
});
describe('combat and weapon state', () => {
  it('kills on a clean rifle headshot and emits hit/kill events', () => {
    const sim = fresh(1); sim.bots[0].pos = { x: 0, y: 0, z: 8 }; advance(sim, { fire: true }, 1);
    expect(sim.bots[0].alive).toBe(false); expect(sim.stats).toMatchObject({ kills: 1, headshots: 1, shots: 1, hits: 1 });
    expect(sim.drainEvents()).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'hit', head: true, killed: true })]));
  });
  it('hits the torso for base damage without counting a headshot', () => {
    const sim = fresh(1); sim.bots[0].pos = { x: 0, y: 0, z: 8 };
    advance(sim, { fire: true, pitch: -Math.atan2(.58, 8) }, 1);
    expect(sim.bots[0].hp).toBe(65); expect(sim.stats.headshots).toBe(0); expect(sim.stats.hits).toBe(1);
  });
  it('prevents shots through cover', () => {
    const sim = fresh(1); sim.bots[0].pos = { x: 0, y: 0, z: -5 }; advance(sim, { fire: true }, 1);
    expect(sim.bots[0].hp).toBe(100); expect(sim.stats.hits).toBe(0);
  });
  it('respects fire rate and ammunition', () => {
    const sim = fresh(); advance(sim, { fire: true }, 60);
    expect(sim.stats.shots).toBeGreaterThanOrEqual(8); expect(sim.stats.shots).toBeLessThanOrEqual(10); expect(sim.ammo.vandal.clip).toBe(25 - sim.stats.shots);
  });
  it('fires a semiautomatic weapon once per trigger press', () => {
    const sim = fresh(); sim.player.weapon = 'ghost'; advance(sim, { fire: true }, 120); expect(sim.stats.shots).toBe(1);
    advance(sim, { fire: false }, 1); advance(sim, { fire: true }, 1); expect(sim.stats.shots).toBe(2);
  });
  it('reloads only after the full duration and preserves total rounds', () => {
    const sim = fresh(); sim.ammo.vandal.clip = 10; advance(sim, { reload: true }, 1); advance(sim, {}, 60);
    expect(sim.ammo.vandal.clip).toBe(10); advance(sim, {}, 80); expect(sim.ammo.vandal).toEqual({ clip: 25, reserve: 85 });
  });
  it('cancels reload on weapon switch without transferring ammunition', () => {
    const sim = fresh(); sim.ammo.vandal.clip = 5; advance(sim, { reload: true }, 1); advance(sim, { weapon: 'ghost' }, 1);
    expect(sim.player.reloadLeft).toBe(0); advance(sim, {}, 180); expect(sim.ammo.vandal.clip).toBe(5); expect(sim.ammo.ghost.clip).toBe(12);
  });
  it('does not create ammo when the reserve is empty', () => {
    const sim = fresh(); sim.ammo.vandal = { clip: 0, reserve: 0 }; advance(sim, { fire: true, reload: true }, 180);
    expect(sim.stats.shots).toBe(0); expect(sim.ammo.vandal).toEqual({ clip: 0, reserve: 0 });
  });
});
describe('bots and match lifecycle', () => {
  it('spawns all eight supported opponents at valid, distinct positions', () => {
    const sim = fresh(8); expect(sim.bots).toHaveLength(8);
    expect(new Set(sim.bots.map(b => `${b.pos.x},${b.pos.z}`)).size).toBe(8);
    for (const b of sim.bots) { expect(Number.isFinite(b.pos.x)).toBe(true); expect(blocked(b.pos.x, b.pos.z)).toBe(false); }
    advance(sim, {}, 120);
    for (const b of sim.bots) expect(Number.isFinite(b.pos.x + b.pos.z)).toBe(true);
  });
  it('navigates to the player without entering obstacles', () => {
    const sim = fresh(5); sim.settings.invincible = true; const start = sim.bots.map(b => ({ ...b.pos })); advance(sim, {}, 600);
    expect(sim.bots.some((b, i) => Math.hypot(b.pos.x - start[i].x, b.pos.z - start[i].z) > 3)).toBe(true);
    for (const bot of sim.bots) expect(blocked(bot.pos.x, bot.pos.z, .3)).toBe(false);
    expect(sim.drainEvents().some(e => e.type === 'shot' && e.source === 'bot')).toBe(true);
  });
  it('lets bots deal damage and respawns the player', () => {
    const sim = fresh(1); sim.bots[0].pos = { x: 0, y: 0, z: 9 }; sim.player.protection = 0; sim.player.hp = 1;
    sim.settings.difficulty = 'veteran'; advance(sim, {}, 600);
    const events = sim.drainEvents(); expect(events.some(e => e.type === 'death')).toBe(true); expect(events.some(e => e.type === 'respawn')).toBe(true); expect(sim.stats.deaths).toBeGreaterThan(0);
  });
  it('honors invincibility while allowing bot attacks', () => {
    const sim = fresh(1); sim.settings.invincible = true; sim.bots[0].pos = { x: 0, y: 0, z: 9 }; sim.player.protection = 0; advance(sim, {}, 600);
    expect(sim.player.hp).toBe(100); expect(sim.stats.deaths).toBe(0); expect(sim.drainEvents().some(e => e.type === 'shot')).toBe(true);
  });
  it('respawns eliminated opponents away from the player', () => {
    const sim = fresh(1); sim.bots[0].pos = { x: 0, y: 0, z: 8 }; advance(sim, { fire: true }, 1); advance(sim, {}, 185);
    expect(sim.bots[0].alive).toBe(true); expect(sim.bots[0].hp).toBe(100);
  });
  it('ends a match once and stops advancing it', () => {
    const sim = fresh(); sim.duration = 1; advance(sim, {}, 120); expect(sim.ended).toBe(true); const elapsed = sim.elapsed;
    advance(sim, { fire: true }, 60); expect(sim.elapsed).toBe(elapsed); expect(sim.drainEvents().filter(e => e.type === 'end')).toHaveLength(1);
  });
  it('is deterministic for identical seeds and commands', () => {
    const a = fresh(3), b = fresh(3); advance(a, { fire: true }, 300); advance(b, { fire: true }, 300);
    expect(a.bots).toEqual(b.bots); expect(a.stats).toEqual(b.stats); expect(a.player).toEqual(b.player);
  });
});
describe('raycasts and pathfinding', () => {
  it('handles rays parallel to box faces and rejects objects behind the ray', () => {
    const o = { x: 0, z: 0, w: 4, d: 4, h: 4, type: 'wall' as const };
    expect(rayBox({ x: 0, y: 2, z: 5 }, { x: 0, y: 0, z: -1 }, o)).toBe(3);
    expect(rayBox({ x: 5, y: 2, z: 5 }, { x: 0, y: 0, z: -1 }, o)).toBe(Infinity);
    expect(raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 5 }, 1)).toBe(Infinity);
  });
  it('finds a route around the central building', () => {
    const path = findPath({ x: 0, y: 0, z: 8 }, { x: 0, y: 0, z: -8 }); expect(path.length).toBeGreaterThan(8);
    expect(path.every(p => !blocked(p.x, p.z, .5))).toBe(true);
    expect(visible({ x: 0, y: 1.6, z: 8 }, { x: 0, y: 1.6, z: -8 })).toBe(false);
  });
});
