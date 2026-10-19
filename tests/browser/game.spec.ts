import { Buffer } from 'node:buffer';
import { test, expect, type Page } from '@playwright/test';
const state = (page: Page) => page.evaluate(() => (window as any).__deadSignal);

test('armory, custom finishes, and settings persist across reloads', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: /MAKE EVERY SHOT MATTER/ })).toBeVisible();
  await page.locator('[data-action="armory"]').first().click();
  await page.locator('[data-weapon="marshal"]').click(); await page.locator('[data-skin="jade"]').click();
  await expect(page.locator('.finish-name h3')).toHaveText('Jade Protocol');
  await expect(page.locator('#weapon-stage canvas')).toBeVisible();
  await page.locator('[data-skin="custom"]').click();
  await page.locator('[data-custom="color"]').fill('#f08040');
  await page.reload(); await page.locator('[data-action="armory"]').first().click();
  await expect(page.locator('.finish-name h3')).toHaveText('Your Signature');
  await expect(page.locator('[data-custom="color"]')).toHaveValue('#f08040');
  await page.locator('#custom-artwork').setInputFiles({ name: 'skin.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.locator('[data-action="remove-artwork"]')).toBeVisible();
  await page.reload(); await page.locator('[data-action="armory"]').first().click();
  await expect(page.locator('[data-action="remove-artwork"]')).toBeVisible();
  await page.locator('[data-action="remove-artwork"]').click();
  await expect(page.locator('[data-action="remove-artwork"]')).toHaveCount(0);
  await expect.poll(async () => (await state(page)).weapon).toBe('marshal');
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('#difficulty').selectOption('veteran');
  await page.locator('#invincible').check();
  await page.locator('#setting-sensitivity').fill('1.5');
  await expect.poll(async () => (await state(page)).settings.sensitivity).toBe(1.5);
  await page.reload(); await page.locator('[data-action="settings"]').first().click();
  await expect(page.locator('#difficulty')).toHaveValue('veteran'); await expect(page.locator('#invincible')).toBeChecked();
  await page.locator('[data-action="reset-settings"]').click(); await expect(page.locator('#difficulty')).toHaveValue('regular');
  await expect(page.locator('#invincible')).not.toBeChecked(); expect(errors).toEqual([]);
});

test('plays, captures quick inputs, reloads, switches, scopes, pauses, resumes, and ends a session', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('[data-action="settings"]').first().click(); await page.locator('#invincible').check();
  await page.locator('[data-action="home"]').first().click(); await page.locator('.deploy').click();
  await expect.poll(async () => (await state(page)).pointerLocked).toBe(true);
  await expect(page.locator('#ammo')).toHaveText('25');
  const initial = await state(page);
  await page.keyboard.down('w'); await expect.poll(async () => (await state(page)).player.pos.z).toBeLessThan(initial.player.pos.z - 2); await page.keyboard.up('w');
  // Short taps must survive a frame boundary on low frame-rate devices.
  await page.mouse.click(600, 400); await expect.poll(async () => (await state(page)).stats.shots).toBeGreaterThan(0);
  await page.keyboard.press('r');
  await expect.poll(async () => (await state(page)).player.reloadLeft).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).ammo.vandal.clip).toBe(25);
  expect((await state(page)).ammo.vandal.reserve).toBeLessThan(100);
  await page.keyboard.press('Space'); await expect.poll(async () => (await state(page)).player.pos.y).toBeGreaterThan(0);
  await page.keyboard.press('Digit3'); await expect.poll(async () => (await state(page)).player.weapon).toBe('marshal');
  await page.mouse.down({ button: 'right' }); await expect(page.locator('#scope-overlay')).toBeVisible();
  await page.mouse.up({ button: 'right' }); await expect(page.locator('#scope-overlay')).not.toBeVisible();
  await page.keyboard.press('f');
  await page.keyboard.down('Tab'); await expect(page.locator('#scoreboard')).toBeVisible(); await page.keyboard.up('Tab');
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: /TAKE A BREATHER/ })).toBeVisible();
  const paused = await state(page); await page.waitForTimeout(500); expect((await state(page)).elapsed).toBe(paused.elapsed);
  await page.locator('[data-action="armory"]').first().click(); await page.locator('[data-weapon="spectre"]').click(); await page.locator('[data-skin="sakura"]').click();
  await page.locator('[data-action="back-pause"]').click(); await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await state(page)).player.weapon).toBe('spectre'); await expect(page.locator('#hud-skin')).toHaveText('CHERRY STATIC');
  await page.keyboard.press('Escape'); await page.locator('[data-action="finish"]').click();
  await expect(page.getByRole('heading', { name: /LEAVE A MARK/ })).toBeVisible();
  // A completed session must never be resumed through the armory.
  await page.locator('[data-action="armory"]').first().click(); await expect(page.locator('[data-action="deploy"]')).toBeVisible();
  await page.locator('[data-action="home"]').first().click(); await expect(page.locator('.deploy')).toBeVisible();
  expect(errors).toEqual([]);
});


test('aimed mouse fire eliminates an actual rendered opponent', async ({ page }) => {
  await page.goto('/'); await page.locator('.deploy').click();
  await expect.poll(async () => (await state(page)).pointerLocked).toBe(true);
  for (let attempt = 0; attempt < 12; attempt++) {
    if ((await state(page)).stats.kills > 0) break;
    await page.evaluate(() => {
      const game = (window as any).__deadSignal, p = game.player;
      const bot = game.bots[3];
      const dx = bot.pos.x - p.pos.x, dz = bot.pos.z - p.pos.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(1.65 - (p.pos.y + 1.68), Math.hypot(dx, dz)) - p.recoil;
      const scale = .0018 * game.settings.sensitivity;
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: (p.yaw - yaw) / scale, movementY: (p.pitch - pitch) / scale }));
    });
    await page.mouse.down(); await page.waitForTimeout(130); await page.mouse.up(); await page.waitForTimeout(200);
  }
  await expect.poll(async () => (await state(page)).stats.kills).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).stats.headshots).toBeGreaterThan(0);
  await expect(page.locator('#hud-kills')).not.toHaveText('0 ELIMINATIONS');
});
