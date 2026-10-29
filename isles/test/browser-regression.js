'use strict';
/* Local (offline) Catan regression in Chromium: all-bot games to a winner in both modes, pass-and-play,
   undo, #continue resume, no console errors.  Needs a static server on http://127.0.0.1:8785/ (or ISLES_PORT) (see below):
     cd <repo root> && python3 -m http.server 8785 --bind 127.0.0.1
   Run: node isles/test/browser-regression.js */
const assert = require('assert');
const { chromium } = require('playwright');
const URL = `http://127.0.0.1:${process.env.ISLES_PORT || 8785}/isles/index.html`;
const CFG_KEY = 'sti.cfg.v1', SAVE_KEY = 'sti.save.v1';

let pass = 0, fail = 0;
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); pass++; console.log(`  ok   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e && e.stack || e).split('\n').slice(0, 5).join('\n       ')}`); }
}
async function newPage(browser, cfg, errors) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(([k, c]) => { try { if (c && !sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(c)); sessionStorage.setItem('seeded', '1'); } } catch (e) { } }, [CFG_KEY, cfg]);
  return { ctx, page };
}
const botCfg = (mode, n, target) => ({
  mode, target: { base: target, seafarers: target }, friendly: false, hideHands: false, speed: 'fast', level: 'normal', confirm: false,
  players: ['Ada', 'Bram', 'Cleo', 'Dmitri'].slice(0, n).map((name, i) => ({ name, color: ['red', 'blue', 'orange', 'white'][i], bot: true })),
});

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  for (const [mode, n, target] of [['base', 3, 6], ['seafarers', 3, 8]]) {
    await test(`all-bot ${mode} game (${n} bots, fast) reaches a winner, save cleared, no console errors`, async () => {
      const { ctx, page } = await newPage(browser, botCfg(mode, n, target), errors);
      await page.goto(URL);
      await page.click('[data-act="start"]');
      await page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'gameover', null, { timeout: 170000, polling: 500 });
      const r = await page.evaluate(() => ({ winner: G.winner, mode: G.mode, turn: G.turnNo, rng: 'rng' in G, save: localStorage.getItem('sti.save.v1') }));
      assert.strictEqual(r.mode, mode); assert.ok(r.winner !== null); assert.strictEqual(r.rng, false, 'local play stays unseeded'); assert.strictEqual(r.save, null);
      console.log(`       winner seat ${r.winner} after ${r.turn} turns`);
      await ctx.close();
    });
  }

  const humanCfg = mode => ({ mode, target: { base: 10, seafarers: 13 }, friendly: false, hideHands: true, speed: 'fast', level: 'normal', confirm: false,
    players: [{ name: 'Pat', color: 'red', bot: false }, { name: 'Sam', color: 'blue', bot: false }] });
  await test('pass-and-play: curtain between players, setup by tapping spots, undo restores the exact state (incl. rng-free local state)', async () => {
    const { ctx, page } = await newPage(browser, humanCfg('base'), errors);
    await page.goto(URL);
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'setup');
    // 2 humans: 4 placements of settlement+road, with the curtain whenever the seat changes
    for (let i = 0; i < 4; i++) {
      const cur = await page.evaluate(() => G.current);
      if (await page.locator('#curtain:not([hidden]) [data-act="reveal"]').count()) await page.click('[data-act="reveal"]');
      await page.waitForSelector('.spot[data-v]', { state: 'attached' });
      await page.evaluate(() => { document.querySelector('.spot[data-v]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await page.waitForSelector('.spot[data-e]', { state: 'attached' });
      await page.evaluate(() => { document.querySelector('.spot[data-e]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await page.waitForFunction(i => G.setup.idx === i + 1 || G.phase !== 'setup', i);
    }
    assert.strictEqual(await page.evaluate(() => G.phase), 'roll');
    if (await page.locator('#curtain:not([hidden]) [data-act="reveal"]').count()) await page.click('[data-act="reveal"]');
    await page.click('[data-act="roll"]');
    await page.waitForFunction(() => G.phase !== 'roll');
    // fast-forward through any 7 handling, then give the current player resources and build a road via the UI
    let ph = await page.evaluate(() => G.phase);
    if (ph !== 'main') { // robber/discard/steal: resolve through the engine so the test stays deterministic
      await page.evaluate(() => { for (let i = 0; i < 20 && G.phase !== 'main'; i++) { const E2 = Engine; const a = E2.actor(G);
        if (G.phase === 'discard') { const need = G.discardQ[0].n, h = G.players[a].hand, c = {}; let left = need; E2.RES.forEach(r => { const t = Math.min(left, h[r]); if (t) { c[r] = t; left -= t; } }); E2.doDiscard(G, a, c); }
        else if (G.phase === 'robber') E2.doMoveRobber(G, E2.robberTargets(G)[0]);
        else if (G.phase === 'steal') E2.doSteal(G, G.stealFrom[0]);
        else if (G.phase === 'gold') break; } afterAction(); });
    }
    await page.evaluate(() => { const h = G.players[G.current].hand; ['wood', 'brick', 'sheep', 'wheat', 'ore'].forEach(r => { h[r] = r === 'wood' || r === 'brick' ? 1 : 0; }); render(); });
    if (await page.locator('#curtain:not([hidden]) [data-act="reveal"]').count()) await page.click('[data-act="reveal"]');
    const before = await page.evaluate(() => JSON.stringify(G));
    await page.click('[data-act="build"][data-k="road"]');
    await page.waitForSelector('.spot[data-e]', { state: 'attached' });
    await page.evaluate(() => { document.querySelector('.spot[data-e]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await page.waitForSelector('[data-act="undo"]');
    const built = await page.evaluate(() => JSON.stringify(G));
    assert.notStrictEqual(built, before);
    await page.click('[data-act="undo"]');
    await page.waitForFunction(() => !document.querySelector('[data-act="undo"]'));
    const after = await page.evaluate(() => { const g = JSON.parse(JSON.stringify(G)); g.fx = []; return JSON.stringify(g); });
    const b0 = JSON.parse(before); b0.fx = [];
    assert.strictEqual(after, JSON.stringify(b0), 'undo restored the pre-build state');
    await ctx.close();
  });

  await test('#continue resumes the saved game (same state), then the game is still playable', async () => {
    const { ctx, page } = await newPage(browser, botCfg('base', 3, 10), errors);
    // slow bots so we can reload mid-game: start, let a few bot moves happen, then reload with #continue
    await page.goto(URL);
    await page.evaluate(() => { ui.cfg.speed = 'normal'; });
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => G && G.setup && G.setup.idx >= 3, null, { timeout: 60000 });
    await page.evaluate(() => { clearTimeout(ui.timer); }); // freeze the bots, state is saved after each action
    const saved = await page.evaluate(() => localStorage.getItem('sti.save.v1'));
    assert.ok(saved && JSON.parse(saved).G.v === 1);
    const idx = JSON.parse(saved).G.setup.idx;
    await page.goto('about:blank');
    await page.goto(URL + '#continue');
    await page.waitForFunction(() => typeof G !== 'undefined' && G && !document.querySelector('#game').hidden);
    const r = await page.evaluate(() => ({ idx: G.setup.idx, hash: location.hash, board: G.board.hexes.length, save: JSON.parse(localStorage.getItem('sti.save.v1')).G.setup.idx }));
    assert.strictEqual(r.idx, idx); assert.strictEqual(r.hash, ''); assert.ok(r.board > 0);
    await page.waitForFunction(i => G.setup.idx > i || G.phase !== 'setup', idx, { timeout: 60000 }); // bots keep playing after resume
    await ctx.close();
  });

  await test('no console or page errors across the run', async () => { assert.deepStrictEqual(errors, []); });
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
