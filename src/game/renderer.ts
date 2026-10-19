import * as THREE from 'three';
import { OBSTACLES } from './arena';
import { WEAPONS, type Settings, type Skin, type WeaponId, type Vec3 } from './catalog';
import type { Bot, GameEvent, Simulation } from './simulation';
const v3 = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);
const material = (color: THREE.ColorRepresentation, roughness = .75, metalness = .1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, mat: THREE.Material, horizontal = false): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat); mesh.position.set(x, y, z); if (horizontal) mesh.rotation.x = Math.PI / 2; mesh.castShadow = true; parent.add(mesh); return mesh;
}
function textTexture(text: string, bg = '#23383c', fg = '#ece9db', width = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 256;
  const c = canvas.getContext('2d')!; c.fillStyle = bg; c.fillRect(0, 0, width, 256); c.fillStyle = fg;
  c.font = `900 ${text.length > 8 ? 52 : 112}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, width / 2, 125);
  c.fillRect(20, 222, width - 40, 4); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function sign(parent: THREE.Object3D, text: string, x: number, y: number, z: number, w = 4, h = 2, rotation = 0, bg?: string): void {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: textTexture(text, bg), roughness: .9 }));
  mesh.position.set(x, y, z); mesh.rotation.y = rotation; parent.add(mesh);
}
function concreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const c = canvas.getContext('2d')!;
  c.fillStyle = '#b4b3a6'; c.fillRect(0, 0, 256, 256);
  let seed = 8; for (let i = 0; i < 11000; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; const x = (seed >>> 16) % 256; seed = (seed * 1664525 + 1013904223) >>> 0; const y = (seed >>> 16) % 256; c.fillStyle = i % 2 ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.08)'; c.fillRect(x, y, 2, 2); }
  c.strokeStyle = '#9e9e93'; c.lineWidth = 1; c.strokeRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(16, 16); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
export interface WeaponModel { group: THREE.Group; magazine: THREE.Mesh; glow: THREE.MeshStandardMaterial; map: THREE.CanvasTexture; }
export function makeWeapon(id: WeaponId, skin: Skin): WeaponModel {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = skin.color; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = skin.secondary; ctx.lineWidth = skin.pattern === 'stripe' ? 22 : 7;
  if (skin.pattern !== 'solid') for (let i = -256; i < 512; i += skin.pattern === 'circuit' ? 42 : 70) {
    ctx.beginPath(); ctx.moveTo(i, 0);
    if (skin.pattern === 'circuit') { ctx.lineTo(i, 100); ctx.lineTo(i + 45, 145); ctx.lineTo(i + 45, 256); }
    else if (skin.pattern === 'wave') ctx.bezierCurveTo(i + 180, 75, i - 100, 180, i + 90, 256);
    else ctx.lineTo(i + 180, 256);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.font = 'bold 22px monospace'; ctx.fillText('DS // 01', 20, 70);
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  if (skin.texture) { const artwork = new Image(); artwork.onload = () => { ctx.drawImage(artwork, 0, 0, 256, 256); map.needsUpdate = true; }; artwork.src = skin.texture; }
  const shell = new THREE.MeshStandardMaterial({ map, roughness: .35, metalness: .6 });
  const dark = material(skin.secondary, .5, .65), steel = material('#86969b', .25, .85);
  const glow = new THREE.MeshStandardMaterial({ color: skin.glow, emissive: skin.glow, emissiveIntensity: 1.4, roughness: .25 });
  const isPistol = id === 'ghost', isSniper = id === 'marshal', isSmg = id === 'spectre';
  const length = isPistol ? .36 : isSniper ? .9 : isSmg ? .54 : .72;
  box(group, .13, .17, length, 0, 0, -length / 2, shell);
  box(group, .105, .055, length * .9, 0, .105, -length / 2, dark);
  box(group, .145, .018, length * .65, 0, .025, -length * .55, glow);
  box(group, .12, .11, length * .4, 0, -.095, -length * .5, dark);
  const grip = box(group, .095, .28, .13, 0, -.19, -.025, dark); grip.rotation.x = -.22;
  for (let i = 0; i < 5; i++) box(group, .098, .009, .12, 0, -.12 - i * .035, -.02 + i * .006, steel);
  const magazine = box(group, isPistol ? .075 : .10, isPistol ? .13 : .29, isPistol ? .08 : .16, 0, isPistol ? -.32 : -.24, isPistol ? .015 : -length * .43, shell); magazine.rotation.x = isSmg ? 0 : -.12;
  const barrelLength = isPistol ? .14 : isSniper ? .55 : .28;
  cylinder(group, isSniper ? .028 : .024, barrelLength, 0, .025, -length - barrelLength / 2, steel, true);
  cylinder(group, isPistol ? .038 : .043, .12, 0, .025, -length - barrelLength, dark, true);
  if (!isPistol) {
    const stock = box(group, .10, .12, .34, 0, -.03, .16, dark); stock.rotation.x = -.12;
    box(group, .13, .24, .06, 0, -.08, .33, shell);
    for (let i = 0; i < 7; i++) box(group, .145, .012, .025, 0, .14, -.13 - i * .06, steel);
    for (let i = 0; i < 5; i++) box(group, .137, .022, .035, 0, .005, -length + .07 + i * .06, dark);
    box(group, .08, .14, .1, 0, -.15, -length * .82, dark);
    if (isSniper) {
      cylinder(group, .065, .4, 0, .24, -.38, dark, true);
      cylinder(group, .072, .02, 0, .24, -.59, glow, true);
      box(group, .06, .1, .16, 0, .17, -.38, steel);
    } else {
      box(group, .07, .07, .025, 0, .18, -.14, dark);
      box(group, .018, .055, .018, 0, .18, -length + .04, glow);
    }
  } else {
    box(group, .02, .035, .025, 0, .11, -.32, glow);
    box(group, .10, .02, .02, 0, .13, -.01, steel);
  }
  // Trigger guard and charging handle.
  box(group, .025, .1, .02, .065, -.15, -.19, steel);
  box(group, .025, .025, .14, .065, -.2, -.12, dark);
  box(group, .08, .025, .04, .09, .05, -.12, steel);
  return { group, magazine, glow, map };
}
interface BotModel { group: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; head: THREE.Mesh; }
function makeBot(): BotModel {
  const group = new THREE.Group(), armor = material('#bc604b', .65, .35), dark = material('#25383f'), light = material('#d0b08a'), glow = new THREE.MeshStandardMaterial({ color: '#ffae6c', emissive: '#ff794b', emissiveIntensity: 1.2 });
  box(group, .48, .52, .3, 0, 1.15, 0, armor); box(group, .38, .22, .33, 0, .83, 0, dark);
  box(group, .35, .27, .07, 0, 1.23, -.18, dark);
  box(group, .28, .035, .015, 0, 1.32, -.22, glow);
  const head = box(group, .32, .34, .31, 0, 1.66, 0, light);
  box(group, .34, .1, .03, 0, 1.69, -.17, glow); box(group, .35, .08, .33, 0, 1.83, 0, dark);
  const limbs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const leg = i < 2, side = i % 2 === 0 ? -1 : 1, limb = new THREE.Group();
    limb.position.set(side * (leg ? .14 : .33), leg ? .79 : 1.35, 0);
    box(limb, leg ? .2 : .17, leg ? .65 : .48, .22, 0, leg ? -.32 : -.22, 0, dark);
    box(limb, leg ? .22 : .21, leg ? .23 : .19, .24, 0, -.16, 0, armor);
    if (leg) box(limb, .22, .14, .33, 0, -.7, -.04, dark);
    else box(limb, .14, .12, .15, 0, -.49, 0, light);
    group.add(limb); limbs.push(limb);
  }
  box(group, .1, .13, .65, .25, 1.07, -.36, dark);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.48, 20), new THREE.MeshBasicMaterial({ color: '#172b2b', transparent: true, opacity: .18, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .018; group.add(shadow);
  return { group, leftLeg: limbs[0], rightLeg: limbs[1], leftArm: limbs[2], rightArm: limbs[3], head };
}
export class GameRenderer {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(85, 1, .06, 220);
  private gunScene = new THREE.Scene(); private gunCamera = new THREE.PerspectiveCamera(55, 1, .01, 10);
  private previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private armoryScene = new THREE.Scene(); private armoryCamera = new THREE.PerspectiveCamera(35, 1, .01, 20);
  private weapon!: WeaponModel; private displayWeapon!: WeaponModel; private muzzle: THREE.Mesh;
  private hands = new THREE.Group(); private botModels: BotModel[] = []; private particles: { mesh: THREE.Object3D; life: number; max: number }[] = [];
  private time = 0; private recoil = 0; private equip = 0; private flash = 0; private inspectTime = 0; private inspectDuration = 2.5;
  private currentSkin: Skin; private currentWeapon: WeaponId; private eyeHeight = 1.68;
  readonly ready = true;
  constructor(canvas: HTMLCanvasElement, weapon: WeaponId, skin: Skin) {
    this.currentSkin = skin; this.currentWeapon = weapon;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18; this.renderer.autoClear = false;
    const sky = document.createElement('canvas'); sky.width = 16; sky.height = 256; const skyContext = sky.getContext('2d')!; const gradient = skyContext.createLinearGradient(0, 0, 0, 256); gradient.addColorStop(0, '#6e97ab'); gradient.addColorStop(.6, '#b8cbd0'); gradient.addColorStop(1, '#d6d7c5'); skyContext.fillStyle = gradient; skyContext.fillRect(0, 0, 16, 256); const skyTexture = new THREE.CanvasTexture(sky); skyTexture.colorSpace = THREE.SRGBColorSpace; this.scene.background = skyTexture; this.scene.fog = new THREE.Fog('#aabcc2', 42, 125);
    this.scene.add(new THREE.HemisphereLight('#dae9f1', '#7c7864', 2.6));
    const sun = new THREE.DirectionalLight('#ffe2b9', 3.4); sun.position.set(-22, 36, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 100 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; this.scene.add(sun);
    this.buildArena();
    for (const scene of [this.gunScene, this.armoryScene]) {
      scene.add(new THREE.HemisphereLight('#eaf4ff', '#738188', 3.5));
      const key = new THREE.DirectionalLight('#fff2de', 4); key.position.set(-2, 4, 3); scene.add(key);
      const rim = new THREE.DirectionalLight('#70c8e2', 2); rim.position.set(3, 0, -2); scene.add(rim);
    }
    const glove = material('#1e2d32', .9), sleeve = material('#697b76', .9);
    const right = box(this.hands, .12, .14, .2, .035, -.27, .06, glove); right.rotation.x = -.25;
    const left = box(this.hands, .12, .12, .20, -.06, -.15, -.48, glove); left.rotation.z = .4;
    const arm = box(this.hands, .13, .13, .42, .055, -.35, .24, sleeve); arm.rotation.x = -.4;
    box(this.hands, .14, .13, .35, -.16, -.25, -.2, sleeve).rotation.y = -.5;
    this.muzzle = new THREE.Mesh(new THREE.OctahedronGeometry(.09), new THREE.MeshBasicMaterial({ color: '#ffe8a9', transparent: true })); this.muzzle.visible = false;
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6)); this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping; this.previewRenderer.toneMappingExposure = 1.35;
    this.setWeapon(weapon, skin); this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  private buildArena(): void {
    const concrete = material('#c6c0ac'), wall = material('#c8c4b4'), teal = material('#466665'), steel = material('#394d52'), trim = material('#758a89'), orange = material('#db7150'), dark = material('#253b40');
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: .94 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    for (const o of OBSTACLES) {
      const mat = o.type === 'crate' ? teal : o.type === 'core' ? dark : o.type === 'building' ? concrete : wall;
      box(this.scene, o.w, o.h, o.d, o.x, o.h / 2, o.z, mat);
      box(this.scene, o.w + .12, .16, o.d + .12, o.x, o.h + .06, o.z, trim);
      if (o.type === 'crate') {
        for (const s of [-1, 1]) {
          box(this.scene, .12, o.h, o.d + .07, o.x + s * (o.w / 2 - .25), o.h / 2, o.z, steel);
          box(this.scene, o.w + .06, .10, o.d + .06, o.x, .25 + (s === 1 ? o.h - .5 : 0), o.z, steel);
        }
        sign(this.scene, 'CARGO', o.x, o.h / 2, o.z + o.d / 2 + .012, Math.min(o.w - .7, 2), .65, 0, '#466665');
      }
      if (o.type === 'building') {
        box(this.scene, o.w + .3, .25, o.d + .3, o.x, o.h + .2, o.z, dark);
        box(this.scene, o.w, 1.2, o.d + .03, o.x, .6, o.z, teal);
        for (let i = -1; i <= 1; i++) {
          box(this.scene, 1.3, 1.5, .05, o.x + i * 2, 4.3, o.z + o.d / 2 + .03, steel);
          box(this.scene, 1.16, .04, .06, o.x + i * 2, 4.3, o.z + o.d / 2 + .07, orange);
        }
        sign(this.scene, o.x < 0 ? 'SECTOR 04' : 'RELAY / B', o.x, 2.6, o.z + o.d / 2 + .04, 4.5, 1.3);
        box(this.scene, 2.4, 1, 2, o.x - 1, o.h + .75, o.z, steel);
        for (let i = 0; i < 7; i++) box(this.scene, 2.2, .035, .08, o.x - 1, o.h + .9, o.z - .8 + i * .25, trim);
      }
      if (o.type === 'core') {
        for (const side of [-1, 1]) box(this.scene, .12, 3, .09, o.x + side * 1.7, 2, o.z + 2.53, orange);
        sign(this.scene, '04', 0, 2.25, 2.52, 2.3, 1.5, 0, '#253b40');
        sign(this.scene, '04', 0, 2.25, -2.52, 2.3, 1.5, Math.PI, '#253b40');
        cylinder(this.scene, .7, 2.5, 0, 5.1, 0, steel);
        cylinder(this.scene, .14, 5.5, 0, 7.8, 0, trim);
        const glow = new THREE.MeshStandardMaterial({ color: '#ff9c6a', emissive: '#ff643e', emissiveIntensity: 2 });
        cylinder(this.scene, .22, .45, 0, 10.6, 0, glow);
        for (let i = 0; i < 3; i++) box(this.scene, 1.6, .1, .65, 0, 6.5 + i * 1.2, 0, steel);
      }
    }
    // Painted site boundaries and lane markings.
    const paint = new THREE.MeshStandardMaterial({ color: '#d2aa66', roughness: 1 });
    for (let i = -22; i <= 22; i += 4) {
      box(this.scene, .10, .012, 1.8, -8, .01, i, paint); box(this.scene, .10, .012, 1.8, 8, .01, i, paint);
    }
    for (const z of [-6, 6]) box(this.scene, 12, .016, .12, 0, .015, z, paint);
    for (const x of [-6, 6]) box(this.scene, .12, .016, 12, x, .015, 0, paint);
    const site = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshStandardMaterial({ map: textTexture('RELAY 04', '#b4b3a6', '#e1d6b6'), roughness: 1 })); site.rotation.x = -Math.PI / 2; site.position.set(0, .025, 8); this.scene.add(site);
    sign(this.scene, 'DEAD SIGNAL', -11, 4.5, -24.96, 12, 3);
    sign(this.scene, 'NO SIGNAL / 04', 14, 4.5, 24.96, 10, 2.5, Math.PI);
    sign(this.scene, 'A', -24.96, 3.8, 8, 3, 3, Math.PI / 2, '#b86a4d');
    sign(this.scene, 'B', 24.96, 3.8, -8, 3, 3, -Math.PI / 2, '#b86a4d');
    for (const x of [-23, 23]) for (const z of [-22, 0, 22]) {
      cylinder(this.scene, .10, 7.5, x, 3.75, z, steel);
      box(this.scene, .5, .18, .8, x, 7.5, z, dark);
      box(this.scene, .4, .03, .6, x, 7.39, z, new THREE.MeshBasicMaterial({ color: '#fff3cb' }));
    }
    // Industrial silhouette beyond the playable perimeter.
    for (let i = 0; i < 22; i++) {
      const x = Math.sin(i * 2.4) * 58, z = Math.cos(i * 2.4) * 58, h = 9 + (i * 7 % 19);
      box(this.scene, 8 + i % 5, h, 9, x, h / 2 - 1, z, material(i % 2 ? '#82999d' : '#8f9fa0'));
      if (i % 3 === 0) cylinder(this.scene, .4, 12, x, h + 4, z, steel);
    }
    for (const x of [-24.6, 24.6]) {
      cylinder(this.scene, .16, 48, x, 5.5, 0, steel, true);
      cylinder(this.scene, .09, 48, x, 5.1, 0, trim, true);
    }
  }
  setWeapon(id: WeaponId, skin: Skin): void {
    this.currentWeapon = id; this.currentSkin = skin;
    if (this.weapon) { this.weapon.group.remove(this.hands, this.muzzle); this.gunScene.remove(this.weapon.group); this.disposeGroup(this.weapon.group); }
    if (this.displayWeapon) { this.armoryScene.remove(this.displayWeapon.group); this.disposeGroup(this.displayWeapon.group); }
    this.weapon = makeWeapon(id, skin); this.displayWeapon = makeWeapon(id, skin);
    this.weapon.group.scale.setScalar(.85); this.displayWeapon.group.scale.setScalar(1.25);
    this.weapon.group.add(this.hands, this.muzzle); this.gunScene.add(this.weapon.group); this.armoryScene.add(this.displayWeapon.group);
    const length = id === 'ghost' ? .52 : id === 'marshal' ? 1.5 : id === 'spectre' ? .85 : 1.05;
    this.muzzle.position.set(0, .03, -length); this.equip = 1;
  }
  inspect(): void { this.inspectTime = this.inspectDuration; }
  syncBots(bots: Bot[]): void {
    while (this.botModels.length < bots.length) { const model = makeBot(); model.group.traverse(obj => { if (obj instanceof THREE.Mesh) obj.castShadow = false; }); this.botModels.push(model); this.scene.add(model.group); }
    for (let i = 0; i < this.botModels.length; i++) {
      const model = this.botModels[i], b = bots[i]; model.group.visible = !!b && (b.alive || b.respawn > 2.2); if (!b) continue;
      const fall = b.alive ? 0 : Math.min(1, (3 - b.respawn) / .65);
      model.group.position.set(b.pos.x, b.pos.y - fall * .1, b.pos.z); model.group.rotation.set(fall * -Math.PI / 2, b.yaw, fall * .15);
      const stride = b.moving ? Math.sin(this.time * 10 + b.id) * .5 : 0;
      model.leftLeg.rotation.x = stride; model.rightLeg.rotation.x = -stride;
      model.leftArm.rotation.x = -.9 - stride * .15; model.rightArm.rotation.x = -1.1 + stride * .1;
    }
  }
  event(event: GameEvent): void {
    if (event.type === 'shot') {
      const from = event.source === 'player' ? v3(event.from).add(new THREE.Vector3(.12, -.18, -.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camera.rotation.y)) : v3(event.from);
      const geometry = new THREE.BufferGeometry().setFromPoints([from, v3(event.to)]);
      const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: event.source === 'player' ? '#ffde95' : '#ff795c', transparent: true, opacity: .8 }));
      this.scene.add(mesh); this.particles.push({ mesh, life: .065, max: .065 });
      if (event.source === 'player') { this.recoil = 1; this.flash = .045; }
      for (let i = 0; i < 3; i++) {
        const spark = new THREE.Mesh(new THREE.BoxGeometry(.025, .025, .025), new THREE.MeshBasicMaterial({ color: '#ffcf81', transparent: true })); spark.position.copy(v3(event.to)).add(new THREE.Vector3((Math.random() - .5) * .15, Math.random() * .1, (Math.random() - .5) * .15)); this.scene.add(spark); this.particles.push({ mesh: spark, life: .18, max: .18 });
      }
    }
    if (event.type === 'switch' || event.type === 'respawn') this.equip = 1;
  }
  render(sim: Simulation | undefined, mode: 'menu' | 'play' | 'armory' | 'pause', dt: number, settings: Settings): void {
    this.time += dt; this.recoil *= Math.exp(-dt * 15); this.equip *= Math.exp(-dt * 8); this.flash = Math.max(0, this.flash - dt); this.inspectTime = Math.max(0, this.inspectTime - dt);
    this.muzzle.visible = this.flash > 0; this.muzzle.rotation.z = this.time * 70;
    const pulse = this.currentSkin.animated ? 1 + Math.sin(this.time * 2.4) * .6 : .5;
    this.weapon.glow.emissiveIntensity = pulse; this.displayWeapon.glow.emissiveIntensity = pulse;
    if (this.currentSkin.animated) { this.weapon.map.offset.x = this.time * .025; this.displayWeapon.map.offset.x = this.time * .025; }
    if (sim && (mode === 'play' || mode === 'pause')) {
      const p = sim.player; this.syncBots(sim.bots);
      this.eyeHeight += ((p.crouch ? 1.12 : 1.68) - this.eyeHeight) * Math.min(1, dt * 15);
      const bob = sim.speed > .3 && p.grounded ? Math.sin(this.time * (p.crouch ? 8 : 12)) * .025 * sim.speed / 5.5 : 0;
      this.camera.position.set(p.pos.x, p.pos.y + (p.alive ? this.eyeHeight : .65) + bob, p.pos.z);
      this.camera.rotation.order = 'YXZ'; this.camera.rotation.set(p.pitch + p.recoil, p.yaw, p.alive ? 0 : -.22);
      const targetFov = p.aim ? settings.fov / WEAPONS[p.weapon].zoom : settings.fov;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14); this.camera.updateProjectionMatrix();
      const reload = p.reloadLeft > 0 ? Math.sin((1 - p.reloadLeft / WEAPONS[p.weapon].reload) * Math.PI) : 0;
      const inspect = this.inspectTime > 0 ? Math.sin((1 - this.inspectTime / this.inspectDuration) * Math.PI) : 0;
      const aim = p.aim ? 1 : 0;
      this.weapon.group.position.lerp(new THREE.Vector3(.28 * (1 - aim), -.27 + aim * .11 - reload * .18 - this.equip * .5, -.68 + this.recoil * .065), Math.min(1, dt * 18));
      this.weapon.group.position.x += bob * .15;
      this.weapon.group.rotation.set(this.recoil * .075 - reload * .4 + inspect * .25, -inspect * .6, reload * -.55 + inspect * .85);
      this.weapon.magazine.position.y = (p.weapon === 'ghost' ? -.32 : -.24) - reload * .22;
      this.weapon.group.visible = p.alive && !(p.weapon === 'marshal' && p.aim);
    } else {
      for (const bot of this.botModels) bot.group.visible = false;
      const angle = this.time * .018;
      this.camera.position.set(18 + Math.sin(angle) * 3, 12, 21 + Math.cos(angle) * 2);
      this.camera.lookAt(-1, 1.8, -3); this.camera.fov = 59; this.camera.updateProjectionMatrix();
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i]; part.life -= dt;
      if (part.life <= 0) { this.scene.remove(part.mesh); this.disposeGroup(part.mesh); this.particles.splice(i, 1); }
      else { const mat = (part.mesh as THREE.Mesh).material as THREE.Material & { opacity: number }; mat.opacity = part.life / part.max; }
    }
    this.renderer.setViewport(0, 0, innerWidth, innerHeight); this.renderer.clear(); this.renderer.render(this.scene, this.camera);
    if (mode === 'play' || mode === 'pause') { this.renderer.clearDepth(); this.renderer.render(this.gunScene, this.gunCamera); }
    if (mode === 'armory') {
      const panel = document.querySelector('#weapon-stage');
      if (panel) {
        const rect = panel.getBoundingClientRect();
        if (this.previewRenderer.domElement.parentElement !== panel) panel.append(this.previewRenderer.domElement);
        if (this.previewRenderer.domElement.clientWidth !== Math.round(rect.width) || this.previewRenderer.domElement.clientHeight !== Math.round(rect.height)) this.previewRenderer.setSize(rect.width, rect.height);
        else if (this.previewRenderer.domElement.width <= 300) this.previewRenderer.setSize(rect.width, rect.height);
        this.armoryCamera.aspect = rect.width / rect.height; this.armoryCamera.position.set(1.25, .6, 1.05); this.armoryCamera.lookAt(0, -.02, -.4); this.armoryCamera.updateProjectionMatrix();
        this.displayWeapon.group.rotation.set(0, -.35 + Math.sin(this.time * .3) * .12, -.12);
        this.previewRenderer.render(this.armoryScene, this.armoryCamera);
      }
    }
  }
  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.gunCamera.aspect = innerWidth / innerHeight; this.gunCamera.updateProjectionMatrix();
  }
  private disposeGroup(group: THREE.Object3D): void {
    const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
    group.traverse(obj => { if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) { obj.geometry.dispose(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach((mat: THREE.Material) => materials.add(mat)); } });
    for (const mat of materials) { const map = (mat as THREE.MeshStandardMaterial).map; if (map) textures.add(map); mat.dispose(); }
    for (const map of textures) map.dispose();
  }
}
