import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const packageRoot = process.env.TOKEN_EATER_NODE_MODULES;
const require = packageRoot ? createRequire(path.join(packageRoot, '__token_eater__.cjs')) : createRequire(import.meta.url);
const playwrightModule = await import(pathToFileURL(require.resolve('playwright')).href);
const { chromium } = playwrightModule.default ?? playwrightModule;
const targetUrl = process.env.TOKEN_EATER_TEST_URL || 'http://localhost:8221/';
const context = await chromium.launchPersistentContext(targetUrl.startsWith('https:') ? 'qa/browser-profile-public' : 'qa/browser-profile-v2', {
  headless: true, channel: 'chrome', viewport: { width: 1280, height: 800 },
});
try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(targetUrl);
  await page.getByRole('region', { name: 'Codex', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#freshness').textContent.includes('Codex checked'));
  assert.equal(await page.getByText('Waiting for first check', { exact: true }).count(), 3);
  assert.equal(await page.getByText('use me', { exact: true }).count(), 0, 'Pending Claude must not be recommended');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const input = await context.newCDPSession(page);
  const install = await input.send('Page.getInstallabilityErrors');
  assert.deepEqual(install.installabilityErrors, [], 'PWA must be installable');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  assert(await page.getByText(/Codex checked/).isVisible());
  await fs.mkdir('qa', { recursive: true });
  await page.screenshot({ path: 'qa/token-eater-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No mobile overflow');
  await page.screenshot({ path: 'qa/token-eater-phone.png' });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('region', { name: 'Codex', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#freshness').textContent.startsWith('Offline'));
  assert.equal(await page.getByText('Waiting for first check', { exact: true }).count(), 3);
  await page.screenshot({ path: 'qa/token-eater-offline.png' });
  assert.deepEqual(errors, [], 'No page errors online or offline');
  await context.setOffline(false);
  const profile = await page.request.get(new URL('profiles/account1/Default/Cookies', targetUrl).href);
  assert.equal(profile.status(), 404, 'Login profiles must not be served');
  console.log('PASS: live Codex, honest Claude pending states, refresh, installable manifest, desktop/mobile, offline reload, private files excluded.');
} finally { await context.close(); }
