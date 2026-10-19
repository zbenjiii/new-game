# DEAD SIGNAL

An original, desktop-browser tactical FPS built with TypeScript and Three.js. Fight navigating, strafing bots in **Relay 04**, equip any of four weapons, and customize every finish without unlocks or purchases.

This is a playable solo foundation. It uses original procedural assets, weapons, audio, and skins; it does not include Riot/Valorant assets or replicate their exact movement/recoil tuning. Multiplayer is a future extension, not an implemented feature.

## Run

Requires Node.js 22.12+ (tested with Node 24), npm, a desktop browser with WebGL 2, and a keyboard/mouse.

```sh
npm ci
npm run dev
```

In this cloud workspace, use a writable npm cache if needed:

```sh
cd /workspace/new-game
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm run dev -- --port 5173
```

Open the Vite development server in your browser, then click **Enter the Arena**. Clicking captures the mouse. **Escape** releases it and pauses the entire simulation. A secure origin or localhost is needed for pointer lock in supported browsers; an embedded host must allow pointer lock.

```sh
npm run build      # TypeScript validation and optimized production assets in dist/
npm run preview    # Serve the production build
npm test           # 22 deterministic simulation tests
npm run test:browser
```

Browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to another installed Chromium executable when needed. They start/reuse Vite on port 5173 and use software WebGL in the headless test runner. The game itself uses the browser's normal graphics backend. No external runtime services, credentials, fonts, asset hosts, or databases are needed.

## Play

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse / left click | Aim / fire |
| Right mouse | Aim down sights; scope on Longshot |
| Shift | Walk |
| Ctrl or C | Crouch |
| Space | Jump |
| R | Reload |
| 1–4 / mouse wheel | Switch weapon |
| F | Inspect finish |
| Tab | Hold scoreboard |
| Escape | Pause / release mouse |

Each skirmish lasts five minutes. Bots navigate around cover, approach, strafe, react, shoot, and respawn. Players respawn with a short protection window and replenished ammunition. Kills restore a small amount of reserve ammunition. Session settings offer 1–8 opponents, three difficulties, invincibility, sensitivity, field of view, volume, and crosshair color. Bot-count changes apply to the next match; other settings apply when play resumes.

Accuracy improves when stationary. Movement, jumping, sustained fire, and recoil increase shot deviation. Crouching and walking reduce movement speed. Stopping and counter-strafing settle accuracy quickly. Body and head hits have distinct damage and feedback. Solid cover blocks hits.

## Armory

- **Revenant:** automatic assault rifle, 25 rounds.
- **Vector–9:** rapid automatic SMG, 30 rounds.
- **Longshot:** scoped, semiautomatic precision rifle, 5 rounds.
- **Phantom .45:** semiautomatic sidearm, 12 rounds.

Every weapon supports eight original finishes and **Your Signature**, a custom finish with body, detail, and glow colors. Several finishes animate. Custom artwork uploads accept PNG/JPG/WEBP files up to 8 MB and resize them locally to a 512×512 texture. Artwork stays in the browser; nothing is uploaded to a server. Custom artwork replaces the procedural body pattern; detail and glow colors still apply. Remove the artwork to return to the procedural pattern.

Loadouts, settings, and custom artwork persist in localStorage on the current browser/origin. Private browsing or cleared site data can remove them. They are not synchronized across devices.

## Project structure

- `src/game/simulation.ts`: fixed-step combat, player motion, bot decisions, match lifecycle, stats, and gameplay events. No DOM or Three.js dependency.
- `src/game/arena.ts`: shared collision geometry, raycasts, line of sight, spawn points, and grid navigation.
- `src/game/catalog.ts`: weapon balance, skins, and settings.
- `src/game/renderer.ts`: procedural arena, humanoid bot models, first-person weapons, animations, materials, and visual effects.
- `src/game/audio.ts`: synthesized weapon audio and feedback using Web Audio.
- `src/main.ts`: application screens, input capture, fixed-step loop, HUD, settings, and persistence.
- `tests/simulation.test.ts`: movement, collision, raycasts, damage, ammunition, bots, respawns, match timing, and deterministic replay.
- `tests/browser/game.spec.ts`: loadout/settings/artwork persistence and actual browser combat/input/lifecycle checks.

## Multiplayer extension

The simulation consumes serializable `InputCommand`s with sequence numbers and advances at 60 Hz. Rendering reads simulation state and consumes discrete `GameEvent`s. Randomness is seeded, so identical commands and initial state produce identical outcomes. This boundary is intended to keep future server authority separate from graphics and local presentation.

Before shipping multiplayer, add a server that owns **all** player entities, validates and rate-limits input, advances the shared simulation, and sends versioned snapshots/events. The current simulation still has one local player and AI opponents; it needs a generalized player collection. Add client prediction/reconciliation, remote-player interpolation, authoritative hit checks/lag compensation, event deduplication, room lifecycle, and abuse protection. Never trust client hit reports or cosmetic data as executable content. No transport, lobby, authentication, matchmaking, or server has been implemented or tested yet.

## Current scope

The arena and weapon assets are deliberately stylized procedural geometry. The game supports keyboard and mouse, not touch/gamepad controls. Jumping is supported; mantling and climbing cover are not. Bot tactics are local AI rather than human-like learning. Hardware/browser performance varies, so test on target devices before release. Automated tests cover the implemented flows, not a guarantee of bug-free play or production multiplayer readiness.
