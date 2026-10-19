import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './style.css';
import { DEFAULT_SETTINGS, SKINS, WEAPONS, WEAPON_IDS, type Settings, type Skin, type WeaponId } from './game/catalog';
import { Simulation, neutralInput, type GameEvent, type InputCommand } from './game/simulation';
import { GameRenderer } from './game/renderer';
import { AudioEngine } from './game/audio';
import { OBSTACLES } from './game/arena';

const app = document.querySelector<HTMLDivElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const logo = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 5h17l11 10v10L23 35H6V23h7v5h8l6-6v-4l-6-6h-8v5H6z" fill="currentColor"/></svg>';
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const cross = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none"/></svg>';
const weaponSvg = (id: WeaponId, color = 'currentColor') => `<svg viewBox="0 0 200 70" class="gun-icon" aria-hidden="true"><g fill="${color}">${id === 'ghost' ? '<path d="M58 18h90v15H99l-9 29H67l8-30H58z"/><path d="M148 22h16v9h-16z"/>' : `<path d="M20 19h42l11-7h${id === 'marshal' ? '57' : '47'}v22H71l-7 25H49l6-25H20z"/><path d="M120 20h${id === 'marshal' ? '66' : '48'}v8h-${id === 'marshal' ? '66' : '48'}zM82 34h20l-4 25H80z"/>${id === 'marshal' ? '<rect x="84" y="2" width="43" height="9" rx="3"/>' : ''}`}</g></svg>`;
let settings: Settings = { ...DEFAULT_SETTINGS };
let equipped: Record<WeaponId, string> = { vandal: 'afterburn', spectre: 'ion', marshal: 'void', ghost: 'carbon' };
let customSkin: Skin = { id: 'custom', name: 'Your Signature', series: 'CUSTOM FINISH', color: '#6386a9', secondary: '#152530', glow: '#a8f4e9', animated: true, pattern: 'circuit' };
let selectedWeapon: WeaponId = 'vandal';
try {
  const saved = JSON.parse(localStorage.getItem('dead-signal-v1') || 'null');
  if (saved) {
    const s = saved.settings || {};
    const clamp = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
    settings = { sensitivity: clamp(s.sensitivity, 1, .2, 3), volume: clamp(s.volume, .45, 0, 1), fov: clamp(s.fov, 85, 65, 110), crosshair: /^#[0-9a-f]{6}$/i.test(s.crosshair) ? s.crosshair : DEFAULT_SETTINGS.crosshair, difficulty: ['recruit', 'regular', 'veteran'].includes(s.difficulty) ? s.difficulty : 'regular', botCount: Math.round(clamp(s.botCount, 5, 1, 8)), invincible: s.invincible === true };
    for (const id of WEAPON_IDS) if (SKINS.some(skin => skin.id === saved.equipped?.[id]) || saved.equipped?.[id] === 'custom') equipped[id] = saved.equipped[id];
    if (WEAPON_IDS.includes(saved.weapon)) selectedWeapon = saved.weapon;
    if (typeof saved.custom?.texture === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(saved.custom.texture) && saved.custom.texture.length < 1000000) customSkin.texture = saved.custom.texture;
    for (const key of ['color', 'secondary', 'glow'] as const) if (/^#[0-9a-f]{6}$/i.test(saved.custom?.[key])) customSkin[key] = saved.custom[key];
  }
} catch { /* A restricted browser or invalid saved profile should not prevent play. */ }
const skinFor = (id: WeaponId) => equipped[id] === 'custom' ? customSkin : SKINS.find(s => s.id === equipped[id]) || SKINS[0];
const save = () => { try { localStorage.setItem('dead-signal-v1', JSON.stringify({ settings, equipped, weapon: selectedWeapon, custom: customSkin })); } catch { /* Settings still apply for this session. */ } };
let renderer: GameRenderer;
try { renderer = new GameRenderer(canvas, selectedWeapon, skinFor(selectedWeapon)); }
catch {
  app.innerHTML = `<div class="fatal"><span class="eyebrow">GRAPHICS UNAVAILABLE</span><h1>A little more<br>hardware required.</h1><p>Dead Signal needs WebGL 2. Enable hardware acceleration in your browser, then reload.</p><button onclick="location.reload()" class="primary">TRY AGAIN ${arrow}</button></div>`;
  throw new Error('WebGL 2 is unavailable. Enable browser hardware acceleration.');
}
const audio = new AudioEngine(); audio.updateVolume(settings.volume);
type Screen = 'home' | 'armory' | 'settings' | 'play' | 'pause' | 'results';
let screen: Screen = 'home', sim: Simulation | undefined;
let input: InputCommand = neutralInput(), keys = new Set<string>(), accumulator = 0, lastTime = performance.now(), stepTime = 0;
let hitTimer = 0, killTimer = 0, damageTimer = 0, noticeTimer = 0, feed: { text: string; head: boolean; time: number }[] = [];
let matchStartPending = false;
let queuedReload = false, queuedJump = false, queuedFire = false, fireHeld = false;
const timeLabel = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
function header(active = ''): string {
  return `<header class="header"><button class="brand" data-action="home" aria-label="Dead Signal home">${logo}<span>DEAD<span class="brand-light">SIGNAL</span></span></button><nav aria-label="Main navigation">${[['home', 'PLAY'], ['armory', 'ARMORY'], ['settings', 'SETTINGS']].map(([id, label]) => `<button data-action="${id}" class="nav-button ${active === id ? 'active' : ''}">${label}${id === 'armory' ? '<span class="tiny-count">09</span>' : ''}</button>`).join('')}</nav><div class="profile"><span class="status-dot"></span><span>LOCAL SESSION</span><span class="profile-badge">DS</span></div></header>`;
}
function footer(): string { return '<footer class="footer"><span><i class="status-dot"></i> ALL SYSTEMS ONLINE <b>/</b> BUILD 0.1.0</span><span>ORIGINAL TACTICAL PLAYGROUND <b>↗</b></span></footer>'; }
function renderUI(): void {
  document.body.dataset.screen = screen;
  const hasSession = !!sim && !sim.ended;
  if (screen === 'home') {
    app.innerHTML = `${header('home')}<main class="home"><div class="hero"><div class="eyebrow"><span class="live-mark"></span> NO RANKS. NO LIMITS. JUST YOU.</div><h1>MAKE<br>EVERY SHOT<br><em>MATTER.</em></h1><p>A tactical playground built for your next level.<br>Drop in. Find your rhythm. Leave a mark.</p><div class="hero-actions"><button class="primary deploy" data-action="deploy"><span>ENTER THE ARENA<small>SOLO SKIRMISH</small></span>${arrow}</button><button class="secondary square" data-action="armory" aria-label="Open armory">${weaponSvg('vandal')}</button></div><div class="hero-footnote"><span class="key">W A S D</span> TO MOVE <span class="dot-divider">·</span> MOUSE TO AIM</div></div><div class="map-callout"><div class="map-cross">+</div><div><span class="eyebrow">YOUR NEXT DROP</span><h3>RELAY 04</h3><span>INDUSTRIAL DISTRICT <i>↗</i></span></div></div><div class="home-bottom"><button class="feature-card map-card" data-action="deploy"><div class="map-thumbnail"><span class="map-lines"></span><span class="map-point"></span><b>04</b></div><div><span class="eyebrow">THE BATTLEGROUND</span><h3>Relay 04</h3><p>Close corners. Open possibilities.</p></div><span class="card-arrow">↗</span></button><button class="feature-card collection-card" data-action="armory"><div class="skin-thumbnail">${weaponSvg(selectedWeapon, skinFor(selectedWeapon).color)}</div><div><span class="eyebrow">YOUR WEAPON. YOUR SIGNATURE.</span><h3>All finishes. Unlocked.</h3><p>8 originals + your custom creation.</p></div><span class="card-arrow">↗</span></button><div class="session-card"><span class="eyebrow">SESSION PARAMETERS</span><div><b>${String(settings.botCount).padStart(2, '0')}</b><span>OPPONENTS</span><i></i><b>05</b><span>MINUTES</span></div><button data-action="settings">CONFIGURE SESSION <span>↗</span></button></div></div></main>${footer()}`;
  } else if (screen === 'armory') {
    const w = WEAPONS[selectedWeapon], skin = skinFor(selectedWeapon);
    app.innerHTML = `${header('armory')}<main class="armory-page"><div class="page-title"><div><span class="eyebrow">THE COLLECTION / ALL ACCESS</span><h1>YOUR SIGNATURE.</h1></div><span class="unlocked">${cross} EVERYTHING UNLOCKED</span></div><div class="armory-layout"><aside class="weapon-list"><span class="eyebrow">CHOOSE YOUR PLATFORM</span>${WEAPON_IDS.map((id, i) => `<button class="weapon-choice ${id === selectedWeapon ? 'selected' : ''}" data-weapon="${id}"><span class="weapon-number">0${i + 1}</span>${weaponSvg(id)}<span><b>${WEAPONS[id].name}</b><small>${WEAPONS[id].category}</small></span>${id === selectedWeapon ? '<i>↗</i>' : ''}</button>`).join('')}<div class="weapon-note">No grind. No paywall.<br>Every finish is yours.</div></aside><section class="weapon-showcase"><div class="showcase-heading"><div><span class="eyebrow">${w.category}</span><h2>${w.name}</h2></div><span class="series-pill">${skin.series}</span></div><div id="weapon-stage" role="img" aria-label="Animated 3D preview of ${w.name} with ${skin.name} finish"><div class="stage-ring"></div><span class="stage-coordinate">MODEL / 0${WEAPON_IDS.indexOf(selectedWeapon) + 1}</span><span class="stage-rotate">LIVE 3D PREVIEW</span></div><div class="finish-name"><span class="skin-dot" style="--skin:${skin.color}"></span><div><span class="eyebrow">EQUIPPED FINISH</span><h3>${skin.name}</h3></div><span class="equipped-check">✓ EQUIPPED</span></div><div class="weapon-stats">${[['DAMAGE', w.damage], ['MAGAZINE', w.magazine], ['FIRE RATE', (1 / w.interval).toFixed(1)], ['RELOAD', `${w.reload}s`]].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')}</div></section></div><section class="skins-section"><div class="section-label"><span class="eyebrow">SELECT A FINISH <b>/ 09 AVAILABLE</b></span><span>APPLIED INSTANTLY · SAVED LOCALLY</span></div><div class="skin-grid">${[...SKINS, customSkin].map(s => `<button class="skin-card ${skin.id === s.id ? 'selected' : ''}" data-skin="${s.id}" style="--skin:${s.color};--skin-dark:${s.secondary};--skin-glow:${s.glow}"><div class="skin-art pattern-${s.pattern}">${weaponSvg(selectedWeapon, s.color)}${s.animated ? '<span class="animated-badge">✦</span>' : ''}${s.id === skin.id ? '<span class="skin-check">✓</span>' : ''}</div><span class="skin-name">${s.name}</span></button>`).join('')}</div>${skin.id === 'custom' ? `<div class="custom-forge"><span class="eyebrow">MAKE IT YOURS</span>${[['color', 'BODY'], ['secondary', 'DETAILS'], ['glow', 'GLOW']].map(([key, name]) => `<label>${name}<input type="color" data-custom="${key}" value="${customSkin[key as 'color']}" aria-label="Custom ${name.toLowerCase()} color"></label>`).join('')}<label class="upload-artwork">UPLOAD ARTWORK<input type="file" accept="image/png,image/jpeg,image/webp" id="custom-artwork" aria-label="Upload custom weapon artwork"></label>${customSkin.texture ? '<button class="remove-artwork" data-action="remove-artwork">REMOVE ARTWORK</button>' : '<span>PNG, JPG, WEBP · up to 8 MB</span>'}</div>` : ''}</section><div class="armory-bottom"><p>${w.description}</p><button class="primary compact" data-action="${hasSession ? 'back-pause' : 'deploy'}">${hasSession ? 'BACK TO SESSION' : 'TAKE IT FOR A SPIN'} ${arrow}</button></div></main>${footer()}`;
  } else if (screen === 'settings') {
    app.innerHTML = `${header('settings')}<main class="settings-page"><div class="page-title"><div><span class="eyebrow">DIAL IT IN</span><h1>YOUR GAME. YOUR RULES.</h1></div></div><div class="settings-grid"><section class="settings-panel"><h2><span>01</span> INPUT & DISPLAY</h2>${range('sensitivity', 'Mouse sensitivity', .2, 3, .05, settings.sensitivity, 'Lower for precision. Higher for faster turns.')}${range('fov', 'Field of view', 65, 110, 1, settings.fov, 'Horizontal feel changes with your display aspect ratio.')}${range('volume', 'Master volume', 0, 1, .05, settings.volume, 'Procedural weapon audio, footsteps, and hit feedback.')}<div class="setting-row"><div><label for="crosshair-color">Crosshair color</label><p>Always find your center.</p></div><input id="crosshair-color" type="color" data-setting="crosshair" value="${settings.crosshair}"></div></section><section class="settings-panel"><h2><span>02</span> SESSION SETUP</h2><div class="setting-row"><div><label for="difficulty">Opponent difficulty</label><p>Reaction time, accuracy, and movement.</p></div><select id="difficulty" data-setting="difficulty"><option value="recruit" ${settings.difficulty === 'recruit' ? 'selected' : ''}>Recruit</option><option value="regular" ${settings.difficulty === 'regular' ? 'selected' : ''}>Regular</option><option value="veteran" ${settings.difficulty === 'veteran' ? 'selected' : ''}>Veteran</option></select></div>${range('botCount', 'Opponents', 1, 8, 1, settings.botCount, 'Changes take effect in your next session.')}<div class="setting-row"><div><label for="invincible">Invincibility</label><p>Explore and practice without taking damage.</p></div><label class="toggle"><input id="invincible" type="checkbox" data-setting="invincible" ${settings.invincible ? 'checked' : ''}><span></span></label></div><div class="settings-tip">${cross}<p>Precision rewards patience. Release your movement keys before firing for the tightest shot.</p></div></section><section class="controls-panel"><div><span class="eyebrow">THE FUNDAMENTALS</span><h2>Know your controls.</h2></div><div class="controls-grid">${[['W A S D', 'Move'], ['MOUSE', 'Aim'], ['LMB', 'Fire'], ['RMB', 'Aim down sights'], ['SHIFT', 'Walk'], ['CTRL / C', 'Crouch'], ['SPACE', 'Jump'], ['R', 'Reload'], ['1 – 4', 'Switch weapon'], ['F', 'Inspect weapon'], ['TAB', 'Scoreboard'], ['ESC', 'Pause / release mouse']].map(([key, value]) => `<div><kbd>${key}</kbd><span>${value}</span></div>`).join('')}</div></section></div><div class="settings-bottom"><span class="saved-label">✓ SETTINGS SAVED AUTOMATICALLY</span><button class="secondary" data-action="reset-settings">RESET DEFAULTS</button><button class="primary compact" data-action="${hasSession ? 'back-pause' : 'home'}">${hasSession ? 'BACK TO SESSION' : 'BACK TO PLAY'} ${arrow}</button></div></main>${footer()}`;
  } else if (screen === 'play') {
    app.innerHTML = `<div class="hud"><div class="hud-top"><div class="radar-wrap"><canvas id="radar" width="180" height="180"></canvas><div>RELAY 04 <span>↗</span></div></div><div class="match-status"><span class="eyebrow">SOLO SKIRMISH</span><strong id="match-time">05:00</strong><div><span class="status-dot"></span> LIVE SESSION</div></div><div class="hud-session"><span id="hud-kills">0 ELIMINATIONS</span><span id="hud-accuracy">0% ACCURACY</span><div id="kill-feed"></div></div></div><div id="scope-overlay"><i></i><b></b></div><div id="crosshair" style="--crosshair:${settings.crosshair}"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker"><svg viewBox="0 0 32 32"><path d="m5 5 7 7m8 8 7 7M27 5l-7 7M12 20l-7 7" stroke="currentColor" stroke-width="2"/></svg></div><div id="damage-vignette"></div><div id="kill-confirm"><div><svg viewBox="0 0 44 44"><path d="M22 3 39 13v18L22 41 5 31V13z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m15 15 14 14m0-14L15 29" fill="none" stroke="currentColor" stroke-width="2"/></svg></div><b>ELIMINATED</b><span id="kill-name"></span></div><div id="reload-indicator"><span>RELOADING</span><div><i></i></div></div><div id="game-notice"></div><div class="hud-bottom"><div class="health-panel"><span class="health-icon">+</span><b id="health">100</b><div><span>HEALTH</span><div class="health-bar"><i id="health-fill"></i></div></div></div><div class="bottom-controls"><span><kbd>R</kbd> RELOAD</span><span><kbd>F</kbd> INSPECT</span><span><kbd>ESC</kbd> PAUSE</span></div><div class="ammo-panel"><span id="hud-weapon">REVENANT</span><div><b id="ammo">25</b><span>/ <span id="reserve">100</span></span></div><small id="hud-skin">AFTERBURN</small></div></div><div id="respawn-overlay"><span class="eyebrow">SIGNAL LOST</span><h2>BACK IN <b id="respawn-time">3</b></h2><p>New position. New opportunity.</p></div><div id="scoreboard" class="scoreboard"><span class="eyebrow">LIVE SESSION REPORT</span><h2>YOUR NUMBERS.</h2><div id="scoreboard-stats"></div></div><div class="weapon-slots">${WEAPON_IDS.map((id, i) => `<div data-slot="${id}"><kbd>${i + 1}</kbd>${weaponSvg(id)}</div>`).join('')}</div></div>`;
  } else if (screen === 'pause') {
    app.innerHTML = `${header()}<main class="pause-page"><div class="eyebrow">CONNECTION HELD / SESSION PAUSED</div><h1>TAKE A<br><em>BREATHER.</em></h1><p>Your session is right where you left it.</p><div class="pause-actions"><button class="primary" data-action="resume">BACK IN THE FIGHT ${arrow}</button><button class="secondary" data-action="armory">CHANGE LOADOUT ${weaponSvg(selectedWeapon)}</button><button class="secondary" data-action="settings">SETTINGS <span>↗</span></button><button class="text-button" data-action="finish">END SESSION <span>↗</span></button></div><div class="pause-stats"><div><b>${sim?.stats.kills || 0}</b><span>ELIMINATIONS</span></div><div><b>${timeLabel(sim ? sim.duration - sim.elapsed : 0)}</b><span>TIME REMAINING</span></div></div></main>${footer()}`;
  } else if (screen === 'results' && sim) {
    const stats = sim.stats;
    app.innerHTML = `${header()}<main class="results-page"><span class="eyebrow">RELAY 04 / SESSION COMPLETE</span><h1>LEAVE A<br><em>MARK.</em></h1><p>Every round is a step forward. Make the next one count.</p><div class="result-stats">${[['ELIMINATIONS', stats.kills], ['ACCURACY', `${stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0}%`], ['HEADSHOTS', stats.headshots], ['BEST STREAK', stats.bestStreak], ['DEATHS', stats.deaths]].map(([label, value]) => `<div><b>${value}</b><span>${label}</span></div>`).join('')}</div><div class="result-actions"><button class="primary" data-action="deploy">RUN IT BACK ${arrow}</button><button class="secondary" data-action="leave">RETURN TO LOBBY</button></div><span class="result-duration">${timeLabel(sim.elapsed)} PLAYED · ${settings.difficulty.toUpperCase()} OPPONENTS</span></main>${footer()}`;
  }
  app.innerHTML = app.innerHTML.replaceAll('↗', '<svg class="diagonal-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13 13 3M3 3h10v10" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>');
}
function range(id: string, label: string, min: number, max: number, step: number, value: number, help: string): string {
  return `<div class="setting-row range-row"><div><label for="setting-${id}">${label}</label><p>${help}</p></div><div class="range-control"><input id="setting-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${id}"><output id="output-${id}">${id === 'volume' ? Math.round(value * 100) + '%' : value}</output></div></div>`;
}
function route(next: Screen): void { screen = next; renderUI(); }
function resetInput(): void { queuedReload = queuedJump = queuedFire = fireHeld = false; keys.clear(); input = { ...neutralInput(), yaw: sim?.player.yaw ?? input.yaw, pitch: sim?.player.pitch ?? input.pitch }; }
async function enterGame(newMatch: boolean): Promise<void> {
  if (matchStartPending) return;
  matchStartPending = true; audio.unlock();
  if (newMatch) { sim = new Simulation({ ...settings }, selectedWeapon, Date.now() >>> 0); input = neutralInput(); feed = []; hitTimer = killTimer = damageTimer = 0; }
  if (!sim) { matchStartPending = false; return; }
  sim.settings = { ...settings, botCount: sim.bots.length };
  renderer.setWeapon(sim.player.weapon, skinFor(sim.player.weapon)); accumulator = 0; resetInput(); if (sim.player.weapon !== selectedWeapon) input.weapon = selectedWeapon; route('play');
  try { await canvas.requestPointerLock(); }
  catch { route('pause'); showToast('Click “Back in the fight” to allow mouse capture.'); }
  matchStartPending = false;
}
function finish(): void { if (!sim) return; sim.ended = true; screen = 'results'; if (document.pointerLockElement) document.exitPointerLock(); resetInput(); renderUI(); }
function showToast(message: string): void { document.querySelector('.toast')?.remove(); const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.append(el); setTimeout(() => el.remove(), 4000); }
app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  audio.unlock(); audio.click();
  const action = button.dataset.action;
  if (action === 'home') { if (screen === 'results') { sim = undefined; route('home'); } else route(sim && !sim.ended ? 'pause' : 'home'); }
  if (action === 'armory') { renderer.setWeapon(selectedWeapon, skinFor(selectedWeapon)); route('armory'); }
  if (action === 'settings') route('settings');
  if (action === 'back-pause') route('pause');
  if (action === 'deploy') void enterGame(true);
  if (action === 'resume') void enterGame(false);
  if (action === 'finish') finish();
  if (action === 'leave') { sim = undefined; route('home'); }
  if (action === 'remove-artwork') { delete customSkin.texture; save(); renderer.setWeapon(selectedWeapon, customSkin); renderUI(); }
  if (action === 'reset-settings') { settings = { ...DEFAULT_SETTINGS }; audio.updateVolume(settings.volume); save(); renderUI(); }
  if (button.dataset.weapon) { selectedWeapon = button.dataset.weapon as WeaponId; renderer.setWeapon(selectedWeapon, skinFor(selectedWeapon)); save(); renderUI(); }
  if (button.dataset.skin) { equipped[selectedWeapon] = button.dataset.skin; renderer.setWeapon(selectedWeapon, skinFor(selectedWeapon)); audio.equip(); save(); renderUI(); }
});
app.addEventListener('input', event => {
  const el = event.target as HTMLInputElement;
  if (el.dataset.setting) {
    const id = el.dataset.setting as keyof Settings;
    const value = el.type === 'checkbox' ? el.checked : ['sensitivity', 'fov', 'volume', 'botCount'].includes(id) ? Number(el.value) : el.value;
    settings = { ...settings, [id]: value }; save(); audio.updateVolume(settings.volume);
    const output = document.querySelector(`#output-${id}`); if (output) output.textContent = id === 'volume' ? `${Math.round(settings.volume * 100)}%` : String(value);
  }
  if (el.dataset.custom) {
    const key = el.dataset.custom as 'color' | 'secondary' | 'glow'; customSkin[key] = el.value;
    renderer.setWeapon(selectedWeapon, customSkin); save();
  }
});

app.addEventListener('change', async event => {
  const element = event.target as HTMLInputElement;
  if (element.id !== 'custom-artwork') return;
  const file = element.files?.[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { showToast('Choose a PNG, JPG, or WEBP image smaller than 8 MB.'); return; }
  const url = URL.createObjectURL(file);
  try {
    const artwork = new Image(); artwork.src = url; await artwork.decode();
    const texture = document.createElement('canvas'); texture.width = texture.height = 512;
    texture.getContext('2d')!.drawImage(artwork, 0, 0, 512, 512);
    customSkin.texture = texture.toDataURL('image/webp', .82); equipped[selectedWeapon] = 'custom';
    save(); renderer.setWeapon(selectedWeapon, customSkin); renderUI(); showToast('Your artwork is equipped and saved on this browser.');
  } catch { showToast('This image could not be opened. Try another PNG, JPG, or WEBP.'); }
  finally { URL.revokeObjectURL(url); }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && screen === 'play') { resetInput(); route('pause'); }
});
window.addEventListener('blur', () => { resetInput(); if (screen === 'play') { route('pause'); if (document.pointerLockElement) document.exitPointerLock(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') { resetInput(); route('pause'); if (document.pointerLockElement) document.exitPointerLock(); } });
document.addEventListener('mousemove', event => {
  if (screen !== 'play' || document.pointerLockElement !== canvas) return;
  const scale = .0018 * settings.sensitivity * (input.aim && sim ? 1 / WEAPONS[sim.player.weapon].zoom : 1);
  input.yaw -= event.movementX * scale; input.pitch = Math.max(-1.48, Math.min(1.48, input.pitch - event.movementY * scale));
});
document.addEventListener('mousedown', event => { if (screen !== 'play' || document.pointerLockElement !== canvas) return; if (event.button === 0) { fireHeld = true; queuedFire = true; } if (event.button === 2) input.aim = true; });
document.addEventListener('mouseup', event => { if (event.button === 0) fireHeld = false; if (event.button === 2) input.aim = false; });
document.addEventListener('contextmenu', event => { if (screen === 'play') event.preventDefault(); });
document.addEventListener('keydown', event => {
  if (screen !== 'play') return;
  if (['Tab', 'Space', 'ControlLeft', 'ControlRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'KeyR' && !event.repeat) queuedReload = true;
  if (event.code === 'Space' && !event.repeat) queuedJump = true;
  if (event.code === 'KeyF' && !event.repeat && sim?.player.reloadLeft === 0) renderer.inspect();
  if (/^Digit[1-4]$/.test(event.code)) input.weapon = WEAPON_IDS[Number(event.code.slice(-1)) - 1];
  if (event.code === 'Escape') { resetInput(); route('pause'); if (document.pointerLockElement) document.exitPointerLock(); }
});
document.addEventListener('keyup', event => { keys.delete(event.code); if (event.code === 'Tab') event.preventDefault(); });
document.addEventListener('wheel', event => {
  if (screen !== 'play' || !sim) return;
  const index = WEAPON_IDS.indexOf(sim.player.weapon); input.weapon = WEAPON_IDS[(index + (event.deltaY > 0 ? 1 : 3)) % 4];
}, { passive: true });
function processEvent(event: GameEvent): void {
  renderer.event(event);
  if (event.type === 'shot') audio.shot(event.weapon, event.source === 'bot');
  if (event.type === 'hit') {
    hitTimer = .16; audio.hit(event.head);
    const marker = document.querySelector<HTMLElement>('#hitmarker'); if (marker) marker.style.color = event.head ? '#ff755c' : '#fff';
    if (event.killed) {
      audio.kill(); killTimer = 1.8;
      const name = document.querySelector('#kill-name'); if (name) name.textContent = `${event.name.toUpperCase()}${event.head ? ' / HEADSHOT' : ''}`;
      feed.unshift({ text: event.name, head: event.head, time: 5 }); feed = feed.slice(0, 4);
    }
  }
  if (event.type === 'damage') { audio.damage(); damageTimer = .4; }
  if (event.type === 'reload') audio.reload();
  if (event.type === 'switch' && sim) { selectedWeapon = sim.player.weapon; renderer.setWeapon(selectedWeapon, skinFor(selectedWeapon)); audio.equip(); }
  if (event.type === 'respawn') { noticeTimer = 2; resetInput(); }
  if (event.type === 'end') finish();
}
function updateHUD(dt: number): void {
  if (!sim || screen !== 'play') return;
  const p = sim.player, a = sim.ammo[p.weapon];
  const text = (id: string, value: string | number) => { const el = document.getElementById(id); if (el && el.textContent !== String(value)) el.textContent = String(value); };
  const style = (id: string, key: string, value: string) => document.getElementById(id)?.style.setProperty(key, value);
  text('match-time', timeLabel(sim.duration - sim.elapsed)); text('health', p.hp); text('ammo', a.clip); text('reserve', a.reserve);
  text('hud-weapon', WEAPONS[p.weapon].name); text('hud-skin', skinFor(p.weapon).name.toUpperCase());
  text('hud-kills', `${sim.stats.kills} ELIMINATIONS`); text('hud-accuracy', `${sim.stats.shots ? Math.round(sim.stats.hits / sim.stats.shots * 100) : 0}% ACCURACY`);
  style('health-fill', 'width', `${p.hp}%`); style('health-fill', 'background', p.hp < 35 ? '#ff654e' : '#d7e6df');
  style('crosshair', '--gap', `${4 + sim.spread * 190}px`); style('crosshair', 'opacity', p.alive && !(p.weapon === 'marshal' && p.aim) ? '1' : '0');
  style('scope-overlay', 'display', p.alive && p.weapon === 'marshal' && p.aim ? 'block' : 'none');
  hitTimer = Math.max(0, hitTimer - dt); killTimer = Math.max(0, killTimer - dt); damageTimer = Math.max(0, damageTimer - dt); noticeTimer = Math.max(0, noticeTimer - dt);
  style('hitmarker', 'opacity', hitTimer > 0 ? '1' : '0'); style('kill-confirm', 'opacity', killTimer > 0 ? '1' : '0'); style('damage-vignette', 'opacity', String(damageTimer / .4));
  style('reload-indicator', 'display', p.reloadLeft > 0 ? 'flex' : 'none');
  document.querySelector<HTMLElement>('#reload-indicator i')?.style.setProperty('width', `${(1 - p.reloadLeft / WEAPONS[p.weapon].reload) * 100}%`);
  text('game-notice', p.protection > 0 ? 'SPAWN PROTECTION' : settings.invincible ? 'INVINCIBILITY ACTIVE' : a.clip === 0 && p.reloadLeft <= 0 ? 'PRESS R TO RELOAD' : '');
  style('respawn-overlay', 'display', p.alive ? 'none' : 'flex'); text('respawn-time', Math.ceil(p.respawn));
  for (const f of feed) f.time -= dt; feed = feed.filter(f => f.time > 0);
  const feedEl = document.querySelector('#kill-feed'); const feedHtml = feed.map(f => `<div><span>YOU</span><b>${f.head ? '⌖' : '—'}</b>${f.text}</div>`).join(''); if (feedEl && feedEl.innerHTML !== feedHtml) feedEl.innerHTML = feedHtml;
  style('scoreboard', 'display', keys.has('Tab') ? 'block' : 'none');
  if (keys.has('Tab')) { const el = document.querySelector('#scoreboard-stats'); if (el) el.innerHTML = [['KILLS', sim.stats.kills], ['DEATHS', sim.stats.deaths], ['HITS / SHOTS', `${sim.stats.hits}/${sim.stats.shots}`], ['STREAK', sim.stats.streak]].map(([label, value]) => `<div><b>${value}</b><span>${label}</span></div>`).join(''); }
  for (const el of document.querySelectorAll<HTMLElement>('[data-slot]')) el.classList.toggle('active', el.dataset.slot === p.weapon);
  drawRadar();
}
function drawRadar(): void {
  const radar = document.querySelector<HTMLCanvasElement>('#radar'); if (!radar || !sim) return; const c = radar.getContext('2d')!;
  c.clearRect(0, 0, 180, 180); c.fillStyle = 'rgba(15,25,27,.8)'; c.fillRect(0, 0, 180, 180);
  c.strokeStyle = 'rgba(180,210,210,.07)'; for (let i = 0; i < 180; i += 18) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 180); c.moveTo(0, i); c.lineTo(180, i); c.stroke(); }
  const scale = 3.1, px = (x: number) => 90 + x * scale;
  for (const o of OBSTACLES) { c.fillStyle = '#667b78'; c.fillRect(px(o.x - o.w / 2), px(o.z - o.d / 2), o.w * scale, o.d * scale); }
  for (const b of sim.bots) if (b.alive) { c.fillStyle = '#ff8064'; c.beginPath(); c.arc(px(b.pos.x), px(b.pos.z), 2.5, 0, Math.PI * 2); c.fill(); }
  const p = sim.player; c.save(); c.translate(px(p.pos.x), px(p.pos.z)); c.rotate(-p.yaw); c.fillStyle = '#c1ffe3'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 4); c.lineTo(0, 2); c.lineTo(-4, 4); c.closePath(); c.fill(); c.restore();
}
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, .1); lastTime = now;
  if (screen === 'play' && sim) {
    input.forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    input.right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    input.jump = keys.has('Space') || queuedJump; input.fire = fireHeld || queuedFire; input.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'); input.walk = keys.has('ShiftLeft') || keys.has('ShiftRight'); input.reload = keys.has('KeyR') || queuedReload;
    accumulator += dt;
    while (accumulator >= 1 / 60 && screen === 'play') { input.sequence++; sim.step(input, 1 / 60); queuedFire = queuedJump = queuedReload = false; input.fire = fireHeld; input.jump = keys.has('Space'); input.reload = keys.has('KeyR'); input.weapon = undefined; accumulator -= 1 / 60; for (const event of sim.drainEvents()) processEvent(event); }
    if (sim.speed > 1 && sim.player.grounded && sim.player.alive && !input.walk && !input.crouch) { stepTime += dt; if (stepTime > .34) { audio.footstep(); stepTime = 0; } }
    updateHUD(dt);
  }
  const mode = screen === 'play' ? 'play' : screen === 'pause' ? 'pause' : screen === 'armory' ? 'armory' : 'menu';
  renderer.render(sim, mode, dt, settings); requestAnimationFrame(frame);
}
renderUI(); requestAnimationFrame(frame);
// Read-only diagnostics for development browser tests; absent from production builds.
if (import.meta.env.DEV) Object.defineProperty(window, '__deadSignal', { get: () => ({ screen, pointerLocked: document.pointerLockElement === canvas, player: sim ? structuredClone(sim.player) : null, bots: sim ? structuredClone(sim.bots) : [], stats: sim ? { ...sim.stats } : null, ammo: sim ? structuredClone(sim.ammo) : null, elapsed: sim?.elapsed, settings: { ...settings }, weapon: selectedWeapon, skin: skinFor(selectedWeapon).id, drawCalls: renderer.renderer.info.render.calls }) });
