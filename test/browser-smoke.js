'use strict';
// Real browser checks run in CI. No real Firebase requests are made.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'artifacts', 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/shared/firebase-config.js') { response.writeHead(200, { 'Content-Type': 'application/javascript' }); response.end('window.HUB_FIREBASE_CONFIG=null;'); return; }
  const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  fs.readFile(file, (error, content) => { response.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' }); response.end(error ? 'Missing file' : content); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, serviceWorkers: 'block' });
      await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      assert.equal(await page.locator('article.game').count(), 8);
      await page.screenshot({ path: path.join(shots, 'hub-' + width + '.png'), fullPage: true });
      for (const id of ['connect4', 'ludo', 'azul', 'ticket']) {
        await page.goto(url + '/' + id + '/?mode=local');
        await page.getByRole('button', { name: 'Start new game', exact: true }).click();
        if (await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).count()) await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).click();
        await page.locator('button[data-move]').first().waitFor({ state: 'visible' });
        assert.ok(await page.locator('#hubkit-root .hk-float').isVisible(), id + ' has a shared menu');
        await page.screenshot({ path: path.join(shots, id + '-' + width + '.png'), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), id + ' fits width ' + width);
        const saveKey = 'hub.' + id + '.save.v1';
        const initial = await page.evaluate(key => localStorage.getItem(key), saveKey);
        assert.ok(initial, id + ' saves the new game');
        await page.locator('button[data-move]').first().click();
        const after = await page.evaluate(key => localStorage.getItem(key), saveKey);
        assert.notEqual(after, initial, id + ' accepts and saves a real browser move');
        await page.goto(url + '/' + id + '/#continue');
        if (await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).count()) await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).click();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), after, id + ' resumes without overwriting state');
      }
      // Original games must still initialize after the extraction.
      for (const id of ['codex', 'gems', 'isles', 'sketch']) {
        await page.goto(url + '/' + id + '/');
        assert.ok((await page.locator('body').innerText()).length > 80, id + ' renders a setup screen');
      }
      assert.deepEqual(errors, [], 'no JavaScript runtime errors at width ' + width);
      await context.close();
    }
    console.log('Browser smoke passed: eight games boot; new games play/save/resume at phone and laptop widths.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
