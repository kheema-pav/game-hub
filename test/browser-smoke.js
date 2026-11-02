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
      assert.equal(await page.locator('article.game').count(), 10);
      await page.screenshot({ path: path.join(shots, 'hub-' + width + '.png'), fullPage: true });
      for (const id of ['connect4', 'ludo', 'azul', 'ticket', 'reversi', 'yahtzee']) {
        await page.goto(url + '/' + id + '/?mode=solo');
        assert.deepEqual(await page.locator('select[data-setting="level"] option').allTextContents(), ['Easy', 'Normal', 'Hard', 'Expert']);
        await page.getByLabel('Bot level').selectOption('expert');
        await page.goto(url + '/' + id + '/?mode=local');
        await page.getByRole('button', { name: 'Start new game', exact: true }).click();
        if (await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).count()) await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).click();
        await page.locator('button[data-move]').first().waitFor({ state: 'visible' });
        assert.ok(await page.locator('#hubkit-root .hk-float').isVisible(), id + ' has a shared menu');
        await page.screenshot({ path: path.join(shots, id + '-' + width + '.png'), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), id + ' fits width ' + width);
        await page.screenshot({ path: path.join(shots, id + '-viewport-' + width + '.png') });
        const saveKey = 'hub.' + id + '.save.v1';
        const initial = await page.evaluate(key => localStorage.getItem(key), saveKey);
        assert.ok(initial, id + ' saves the new game');
        if (id === 'ticket') {
          const mapTopBefore = await page.locator('.tr-map').evaluate(node => node.getBoundingClientRect().top);
          const footerOrder = await page.evaluate(() => {
            const footer = document.querySelector('.tr-keep-footer').getBoundingClientRect();
            return [...document.querySelectorAll('.tr-ticket-picker .tr-destination')].every(ticket => ticket.getBoundingClientRect().bottom <= footer.top);
          });
          assert.ok(footerOrder, 'ticket confirmation never overlays a destination card');
          const card = page.locator('.tr-ticket-preview').nth(1);
          const endpoints = await card.locator('b').allTextContents();
          await card.click();
          assert.deepEqual(await page.locator('.tr-endpoint').evaluateAll(nodes => nodes.map(node => node.dataset.city)), endpoints, 'ticket preview marks both cities');
          assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), initial, 'preview never keeps/discards a ticket');
          await page.getByRole('button', { name: 'Zoom to selection', exact: true }).click();
          assert.ok(await page.getByRole('button', { name: 'Fit whole map', exact: true }).evaluate(node => node === document.activeElement), 'zoom retains keyboard focus');
          const layout = await page.evaluate(() => {
            const map = document.querySelector('.tr-map').getBoundingClientRect(), panel = document.querySelector('.tr-sidebar').getBoundingClientRect();
            return { mapTop: map.top, mapBottom: map.bottom, mapRight: map.right, panelLeft: panel.left, height: innerHeight };
          });
          assert.ok(layout.mapTop >= 0 && layout.mapBottom <= layout.height, 'map stays on screen while selecting a ticket');
          if (width <= 760) assert.ok(Math.abs(layout.mapTop - mapTopBefore) < 2, 'scrolling ticket choices does not shift the map');
          if (width > 760) assert.ok(layout.panelLeft >= layout.mapRight, 'tickets sit alongside the map on a laptop');
          await page.screenshot({ path: path.join(shots, 'ticket-preview-' + width + '.png'), fullPage: true });
          await page.screenshot({ path: path.join(shots, 'ticket-preview-viewport-' + width + '.png') });
          await page.getByRole('button', { name: 'Clear highlight', exact: true }).click();
          assert.equal(await page.locator('.tr-endpoint').count(), 0, 'clear removes both markers');
        }
        await page.locator('button[data-move]').first().click();
        if (id === 'yahtzee') {
          const rolled = await page.evaluate(key => localStorage.getItem(key), saveKey);
          const firstDie = JSON.parse(rolled).state.dice[0];
          await page.locator('.yz-die[data-choice]').first().click();
          assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), rolled, 'keeping a die is a preview, not a turn action');
          assert.equal(await page.locator('.yz-die').first().getAttribute('aria-pressed'), 'true');
          await page.locator('.yz-roll[data-move]').click();
          const rerolled = await page.evaluate(key => localStorage.getItem(key), saveKey);
          assert.equal(JSON.parse(rerolled).state.dice[0], firstDie, 'held die survives the next roll');
          await page.locator('.yz-category[data-choice]').first().click();
          assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), rerolled, 'score preview never consumes a category');
          await page.screenshot({ path: path.join(shots, 'yahtzee-score-preview-' + width + '.png'), fullPage: true });
          await page.locator('.yz-confirm button[data-move]').click();
          const scored = JSON.parse(await page.evaluate(key => localStorage.getItem(key), saveKey));
          assert.equal(scored.state.current, 1, 'confirmed score advances to the next player');
        }
        const after = await page.evaluate(key => localStorage.getItem(key), saveKey);
        assert.notEqual(after, initial, id + ' accepts and saves a real browser move');
        if (id !== 'ticket') assert.equal(await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).count(), 0, 'public games have no handover curtain');
        await page.screenshot({ path: path.join(shots, id + '-after-move-' + width + '.png'), fullPage: true });
        await page.screenshot({ path: path.join(shots, id + '-after-move-viewport-' + width + '.png') });
        await page.goto(url + '/' + id + '/#continue');
        if (await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).count()) await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).click();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), after, id + ' resumes without overwriting state');
      }
      // The second geographic edition must also render and preview destinations.
      await page.goto(url + '/ticket/?mode=local');
      await page.getByLabel('Map and rules').selectOption('europe');
      await page.getByRole('button', { name: 'Start new game', exact: true }).click();
      await page.getByRole('button', { name: 'Replace saved game', exact: true }).click();
      await page.getByRole('button', { name: 'Ready, show my turn', exact: true }).click();
      await page.locator('.tr-ticket-preview').nth(1).click();
      assert.equal(await page.locator('.tr-endpoint').count(), 2);
      await page.screenshot({ path: path.join(shots, 'ticket-europe-viewport-' + width + '.png') });
      await page.getByRole('button', { name: 'Zoom to selection', exact: true }).click();
      await page.screenshot({ path: path.join(shots, 'ticket-europe-zoom-viewport-' + width + '.png') });
      // Original games must still initialize after the extraction.
      for (const id of ['codex', 'gems', 'isles', 'sketch']) {
        await page.goto(url + '/' + id + '/');
        assert.ok((await page.locator('body').innerText()).length > 80, id + ' renders a setup screen');
      }
      // Exercise shared online controls on Catan without a Firebase room or network calls.
      await page.goto(url + '/isles/');
      await page.getByRole('button', { name: 'Two of us', exact: true }).click();
      const privacy = page.getByRole('button', { name: 'Hide hands', exact: true });
      if (await privacy.getAttribute('aria-pressed') === 'true') await privacy.click();
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await page.locator('#menuSlot [data-hubkit="menu"]').waitFor({ state: 'visible' });
      await page.evaluate(() => { window.testRoomControls = HubSession.mount({ code: '123456' }); });
      assert.equal(await page.locator('.hs-launch').isVisible(), false, 'room launcher never covers Catan');
      await page.locator('#menuSlot [data-hubkit="menu"]').click();
      await page.getByRole('button', { name: 'Online room', exact: true }).click();
      assert.equal(await page.locator('.hs-code').innerText(), '123 456');
      assert.equal(await page.evaluate(() => HubKit.isOpen()), false, 'room controls replace the menu');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.hs-layer').isVisible(), false);
      assert.ok(await page.locator('#menuSlot [data-hubkit="menu"]').evaluate(node => node === document.activeElement), 'closing controls returns focus to the menu');
      await page.evaluate(() => window.testRoomControls.close());
      await page.locator('#menuSlot [data-hubkit="menu"]').click();
      assert.equal(await page.getByRole('button', { name: 'Online room', exact: true }).count(), 0, 'leaving removes room controls');
      await page.keyboard.press('Escape');
      // A real finished game records once; the rematch retains the table and starts fresh.
      await page.goto(url + '/connect4/?mode=local');
      await page.getByRole('button', { name: 'Start new game', exact: true }).click();
      await page.getByRole('button', { name: 'Replace saved game', exact: true }).click();
      for (const col of [1, 2, 1, 2, 1, 2, 1]) await page.getByRole('button', { name: 'Drop a disc in column ' + col, exact: true }).click();
      const finished = await page.evaluate(() => JSON.parse(localStorage.getItem('hub.connect4.save.v1')));
      assert.equal(finished.state.over, true);
      await page.goto(url + '/connect4/#continue');
      // A fragment-only navigation does not rerun startup. Reload with #continue
      // present so this actually reopens the finished save, rather than setup.
      await page.reload();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hub.results.v1')).length), 1, 'reload does not duplicate results');
      await page.getByRole('button', { name: 'Rematch, same players', exact: true }).click();
      const rematch = await page.evaluate(() => JSON.parse(localStorage.getItem('hub.connect4.save.v1')));
      assert.deepEqual(rematch.players, finished.players); assert.equal(rematch.level, 'expert');
      assert.notEqual(rematch.state._night.id, finished.state._night.id); assert.equal(rematch.state.moves, 0);
      await page.goto(url);
      assert.ok(await page.getByRole('link', { name: /Continue Four in a Row/ }).first().isVisible());
      await page.locator('#recentResults summary').click();
      assert.match(await page.locator('#recentResults').innerText(), /Four in a Row · You win\b/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'game-night panels fit the viewport');
      await page.screenshot({ path: path.join(shots, 'hub-game-night-' + width + '.png'), fullPage: true });
      await page.getByRole('button', { name: 'Clear results history', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm clear history', exact: true }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('hub.results.v1')), null);
      assert.ok(await page.evaluate(() => localStorage.getItem('hub.connect4.save.v1')), 'clearing results keeps unfinished saves');
      assert.deepEqual(errors, [], 'no JavaScript runtime errors at width ' + width);
      await context.close();
    }
    console.log('Browser smoke passed: ten games boot; six tabletop games play/save/resume; four levels, Yahtzee scoring, rematches and history work at phone and laptop widths.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
