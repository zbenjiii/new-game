import { BOT_NAMES, WEAPONS, WEAPON_IDS, type Settings, type Vec3, type WeaponId } from './catalog';
import { SPAWNS, blocked, distance, findPath, move, raySphere, visible, wallDistance } from './arena';
export interface InputCommand { sequence: number; forward: number; right: number; yaw: number; pitch: number; jump: boolean; crouch: boolean; walk: boolean; aim: boolean; fire: boolean; reload: boolean; weapon?: WeaponId; }
export const neutralInput = (): InputCommand => ({ sequence: 0, forward: 0, right: 0, yaw: 0, pitch: 0, jump: false, crouch: false, walk: false, aim: false, fire: false, reload: false });
export interface Bot { id: number; name: string; pos: Vec3; yaw: number; hp: number; alive: boolean; respawn: number; fireCooldown: number; reaction: number; pathCooldown: number; path: Vec3[]; strafe: number; moving: boolean; }
export type GameEvent =
  | { type: 'shot'; source: 'player' | 'bot'; from: Vec3; to: Vec3; weapon: WeaponId }
  | { type: 'hit'; head: boolean; killed: boolean; pos: Vec3; name: string }
  | { type: 'damage'; amount: number; yaw: number }
  | { type: 'reload' | 'reloadDone' | 'switch' | 'death' | 'respawn' | 'end' };
export interface Stats { kills: number; deaths: number; shots: number; hits: number; headshots: number; streak: number; bestStreak: number; }
export class Simulation {
  tick = 0; elapsed = 0; duration = 300; ended = false;
  player = { pos: { ...SPAWNS[0] }, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, alive: true, grounded: true, crouch: false, aim: false, respawn: 0, protection: 2, weapon: 'vandal' as WeaponId, cooldown: 0, reloadLeft: 0, recoil: 0 };
  ammo = Object.fromEntries(WEAPON_IDS.map(id => [id, { clip: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve }])) as Record<WeaponId, { clip: number; reserve: number }>;
  bots: Bot[] = [];
  events: GameEvent[] = [];
  stats: Stats = { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, streak: 0, bestStreak: 0 };
  private seed: number; private lastFire = false; private lastJump = false;
  constructor(public settings: Settings, weapon: WeaponId = 'vandal', seed = 42) {
    this.seed = seed; this.player.weapon = weapon;
    for (let i = 0; i < settings.botCount; i++) this.bots.push({ id: i, name: BOT_NAMES[i], pos: { ...SPAWNS[i + 1] }, yaw: 0, hp: 100, alive: true, respawn: 0, fireCooldown: .5, reaction: 0, pathCooldown: 0, path: [], strafe: i % 2 ? 1 : -1, moving: false });
  }
  random(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  get eye(): Vec3 { return { ...this.player.pos, y: this.player.pos.y + (this.player.crouch ? 1.12 : 1.68) }; }
  get speed(): number { return Math.hypot(this.player.vx, this.player.vz); }
  get spread(): number { const w = WEAPONS[this.player.weapon]; return w.spread * (this.player.aim ? .35 : 1) + w.movingSpread * Math.min(this.speed / 5.5, 1) + (this.player.grounded ? 0 : .08) + this.player.recoil * .3; }
  drainEvents(): GameEvent[] { const result = this.events; this.events = []; return result; }
  step(input: InputCommand, dt = 1 / 60): void {
    if (this.ended) return;
    dt = Math.min(.05, Math.max(0, dt)); this.tick++; this.elapsed += dt;
    if (this.elapsed >= this.duration) { this.ended = true; this.events.push({ type: 'end' }); return; }
    const p = this.player;
    p.protection = Math.max(0, p.protection - dt);
    p.cooldown = Math.max(0, p.cooldown - dt); p.recoil *= Math.exp(-dt * 4.8);
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) this.respawnPlayer();
    } else {
      p.yaw = input.yaw; p.pitch = Math.max(-1.48, Math.min(1.48, input.pitch)); p.crouch = input.crouch; p.aim = input.aim;
      const speed = input.crouch ? 2.1 : input.walk ? 2.8 : input.aim ? 3.4 : 5.5;
      const len = Math.max(1, Math.hypot(input.forward, input.right));
      const dx = (input.right * Math.cos(p.yaw) - input.forward * Math.sin(p.yaw)) / len * speed;
      const dz = (-input.forward * Math.cos(p.yaw) - input.right * Math.sin(p.yaw)) / len * speed;
      const acceleration = p.grounded ? (len === 1 && !input.forward && !input.right ? 16 : 12) : 2.8;
      p.vx += (dx - p.vx) * Math.min(1, dt * acceleration); p.vz += (dz - p.vz) * Math.min(1, dt * acceleration);
      if (input.jump && !this.lastJump && p.grounded) { p.vy = 6; p.grounded = false; }
      this.lastJump = input.jump;
      p.vy -= 18 * dt; p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
      // Keep jump collision conservative: no clipping through low cover or landing inside it.
      const feet = p.pos.y; p.pos.y = 0; move(p.pos, p.vx * dt, p.vz * dt); p.pos.y = feet;
      if (input.weapon && input.weapon !== p.weapon) { p.weapon = input.weapon; p.reloadLeft = 0; p.cooldown = .35; p.recoil = 0; this.events.push({ type: 'switch' }); }
      if (p.reloadLeft > 0) {
        p.reloadLeft -= dt;
        if (p.reloadLeft <= 0) { const a = this.ammo[p.weapon], w = WEAPONS[p.weapon]; const n = Math.min(w.magazine - a.clip, a.reserve); a.clip += n; a.reserve -= n; this.events.push({ type: 'reloadDone' }); }
      }
      if (input.reload) this.reload();
      const w = WEAPONS[p.weapon];
      if (input.fire && (w.automatic || !this.lastFire) && p.cooldown <= 0 && p.reloadLeft <= 0) {
        if (this.ammo[p.weapon].clip > 0) this.shoot(); else this.reload();
      }
    }
    this.lastFire = input.fire;
    for (const bot of this.bots) this.updateBot(bot, dt);
  }
  reload(): void {
    const p = this.player, a = this.ammo[p.weapon], w = WEAPONS[p.weapon];
    if (p.reloadLeft > 0 || a.clip === w.magazine || a.reserve <= 0) return;
    p.reloadLeft = w.reload; this.events.push({ type: 'reload' });
  }
  private shoot(): void {
    const p = this.player, w = WEAPONS[p.weapon]; this.ammo[p.weapon].clip--; this.stats.shots++; p.cooldown = w.interval;
    const spread = this.spread;
    const yaw = p.yaw + (this.random() - .5) * spread * 2;
    const pitch = p.pitch + p.recoil + (this.random() - .5) * spread * 2;
    p.recoil = Math.min(.12, p.recoil + w.recoil);
    const dir = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    const from = this.eye;
    let closest = Math.min(w.range, wallDistance(from, dir));
    // Ground is also a solid hit surface.
    if (dir.y < 0) closest = Math.min(closest, -from.y / dir.y);
    let target: Bot | undefined, head = false;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const ht = raySphere(from, dir, { ...b.pos, y: 1.65 }, .25);
      const bt = Math.min(raySphere(from, dir, { ...b.pos, y: 1.12 }, .38), raySphere(from, dir, { ...b.pos, y: .65 }, .32));
      const t = Math.min(ht, bt);
      if (t < closest) { closest = t; target = b; head = ht <= bt; }
    }
    const to = { x: from.x + dir.x * closest, y: from.y + dir.y * closest, z: from.z + dir.z * closest };
    this.events.push({ type: 'shot', source: 'player', from, to, weapon: w.id });
    if (target) {
      this.stats.hits++; if (head) this.stats.headshots++;
      target.hp -= w.damage * (head ? w.headMultiplier : 1);
      const killed = target.hp <= 0;
      if (killed) { target.alive = false; target.respawn = 3; this.stats.kills++; this.stats.streak++; this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak); this.ammo[p.weapon].reserve = Math.min(w.reserve, this.ammo[p.weapon].reserve + 10); }
      this.events.push({ type: 'hit', head, killed, pos: to, name: target.name });
    }
  }
  private updateBot(b: Bot, dt: number): void {
    if (!b.alive) {
      b.respawn -= dt;
      if (b.respawn <= 0) { b.pos = this.safeSpawn(this.player.pos, b.id); b.alive = true; b.hp = 100; b.reaction = 0; b.pathCooldown = 0; b.fireCooldown = 1; }
      return;
    }
    const p = this.player, gap = distance(b.pos, p.pos);
    const eye = { ...b.pos, y: 1.65 }, seen = p.alive && gap < 36 && visible(eye, this.eye);
    b.fireCooldown -= dt; b.pathCooldown -= dt; b.moving = false;
    const difficulty = this.settings.difficulty;
    if (seen) {
      b.yaw = Math.atan2(-(p.pos.x - b.pos.x), -(p.pos.z - b.pos.z)); b.reaction += dt;
      if (Math.sin(this.elapsed * 1.4 + b.id * 2) > .97) b.strafe *= -1;
      const speed = difficulty === 'veteran' ? 2.3 : 1.5;
      const approach = gap > 19 ? 1 : gap < 6 ? -1 : 0;
      const dx = (Math.cos(b.yaw) * b.strafe - Math.sin(b.yaw) * approach) * dt * speed;
      const dz = (-Math.sin(b.yaw) * b.strafe - Math.cos(b.yaw) * approach) * dt * speed;
      move(b.pos, dx, dz); b.moving = true;
      const reaction = difficulty === 'recruit' ? 1.1 : difficulty === 'regular' ? .7 : .4;
      if (b.reaction > reaction && b.fireCooldown <= 0) {
        b.fireCooldown = difficulty === 'recruit' ? .85 : difficulty === 'regular' ? .55 : .35;
        const chance = (difficulty === 'recruit' ? .22 : difficulty === 'regular' ? .42 : .65) * (this.speed > 3 ? .7 : 1) * Math.max(.3, 1 - gap / 70);
        const hit = this.random() < chance;
        const to = hit ? this.eye : { x: p.pos.x + (this.random() - .5) * 4, y: 1 + this.random(), z: p.pos.z + (this.random() - .5) * 4 };
        this.events.push({ type: 'shot', source: 'bot', from: eye, to, weapon: 'vandal' });
        if (hit && p.protection <= 0 && !this.settings.invincible) {
          const amount = difficulty === 'veteran' ? 18 : 12; p.hp = Math.max(0, p.hp - amount);
          this.events.push({ type: 'damage', amount, yaw: b.yaw });
          if (p.hp <= 0) { p.alive = false; p.respawn = 3; this.stats.deaths++; this.stats.streak = 0; p.reloadLeft = 0; this.events.push({ type: 'death' }); }
        }
      }
    } else {
      b.reaction = 0;
      if (b.pathCooldown <= 0) {
        b.path = findPath(b.pos, p.alive ? p.pos : SPAWNS[(b.id + Math.floor(this.elapsed / 12)) % SPAWNS.length]);
        b.pathCooldown = 1 + this.random() * .5;
      }
      const dest = b.path[0];
      if (dest) {
        const d = distance(b.pos, dest);
        if (d < .3) b.path.shift();
        else { const speed = 2.6; const dx = (dest.x - b.pos.x) / d * speed * dt, dz = (dest.z - b.pos.z) / d * speed * dt; move(b.pos, dx, dz); b.yaw = Math.atan2(-dx, -dz); b.moving = true; }
      }
    }
    // Separate overlapping bot capsules without teleporting through cover.
    for (const other of this.bots) {
      if (other.id === b.id || !other.alive) continue;
      const d = distance(b.pos, other.pos);
      if (d > .001 && d < .8) move(b.pos, (b.pos.x - other.pos.x) / d * dt, (b.pos.z - other.pos.z) / d * dt);
    }
    if (gap < .9 && gap > .001) move(b.pos, (b.pos.x - p.pos.x) / gap * dt * 2, (b.pos.z - p.pos.z) / gap * dt * 2);
  }
  private safeSpawn(avoid: Vec3, offset: number): Vec3 {
    const candidates = [...SPAWNS].sort((a, b) => distance(b, avoid) - distance(a, avoid));
    const point = candidates[offset % 3];
    return { ...point };
  }
  private respawnPlayer(): void {
    const danger = this.bots.filter(b => b.alive);
    const spawn = [...SPAWNS].sort((a, b) => Math.min(...danger.map(e => distance(b, e.pos))) - Math.min(...danger.map(e => distance(a, e.pos))))[0];
    const p = this.player; p.pos = { ...spawn }; p.hp = 100; p.alive = true; p.protection = 2; p.vx = 0; p.vz = 0; p.vy = 0; p.recoil = 0; p.cooldown = .3; p.grounded = true;
    for (const id of WEAPON_IDS) this.ammo[id] = { clip: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve };
    this.events.push({ type: 'respawn' });
  }
}
