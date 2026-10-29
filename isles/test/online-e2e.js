'use strict';
/* Catan online end-to-end tests: separate browser contexts (one per player) against the Firebase EMULATORS, driven through the real UI.
   Setup (never the real Firebase project):
     cd <repo root> && python3 -m http.server 8786 --bind 127.0.0.1 &
     cd <a scratch dir containing firebase.json + firestore.rules copied from firebase/> &&
       npx firebase-tools emulators:start --only firestore,auth --project demo-game-hub   (Firestore 8580, Auth 9599)
   Run: CATAN_SHOTS=<dir for phone screenshots> node isles/test/online-e2e.js [name filter]
   Env: ISLES_PORT (8786), HUB_EMULATOR ("127.0.0.1:8580:9599"). */
const assert = require('assert');
const { chromium } = require('playwright');
const L = require('./online-lib');
const { E, ORIGIN, sleep, mkPlayer, shot, createRoom, openLink, gameReady, waitK, assertSameHash, roomInfo, findScript, count, nodeReplay, runScript, hashJson, clickSure } = L;

const only = process.argv[2] || '';
let pass = 0, fail = 0;
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t = Date.now();
  try { await fn(); pass++; console.log(`  ok   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n       ')}`); }
}
const allErrors = [];
const collect = (ps, label) => ps.forEach(p => { if (p.errors.length) allErrors.push(`${label}/${p.name}: ${p.errors.join(' | ')}`); });

/* Host creates a room with the setup screen's own controls; the others join by link; resolves when everyone is in the game. */
async function startGame(browser, names, o = {}) {
  const players = [];
  for (let i = 0; i < names.length; i++) {
    const vp = (o.viewports && o.viewports[i]) || o.viewport;
    players.push(await mkPlayer(browser, names[i], { viewport: vp, confirm: o.confirm, color: L.PROFILE_COLORS[i], cfg: i === 0 ? o.hostCfg : undefined, save: o.saves && o.saves[i] }));
  }
  const code = await createRoom(players[0], o.seats || names.length);
  for (let i = 1; i < names.length; i++) {
    await openLink(players[i], code);
    if (o.waitShot && i === 1) {   // the waiting room, with the host and one guest in
      await players[0].page.waitForFunction(() => document.querySelectorAll('.hl-plist li:not(.hl-empty)').length >= 2);
      await shot(players[0], o.waitShot);
    }
  }
  if (o.early) {   // the host starts with fewer players than seats
    await players[0].page.waitForFunction(n => document.querySelectorAll('.hl-plist li:not(.hl-empty)').length === n, names.length);
    await players[0].page.click('[data-hl="start"]');
  }
  for (const p of players) await gameReady(p);
  for (const p of players) p.uid = await p.page.evaluate(() => ON.uid);
  return { players, code };
}
const hostCfg = (mode, target, extra) => Object.assign({ mode, target: { base: mode === 'base' ? target : 10, seafarers: mode === 'seafarers' ? target : 13 }, friendly: false, hideHands: true, speed: 'fast', level: 'normal', confirm: true,
  players: [{ name: 'Player 1', color: 'red', bot: false }, { name: 'Player 2', color: 'blue', bot: false }, { name: 'Ada', color: 'orange', bot: true }] }, extra || {});
const closeAll = ps => Promise.all(ps.map(p => p.ctx.close().catch(() => { })));
const twoDiscards = s => s.some((r, i) => r.a === 'discard' && s[i + 1] && s[i + 1].a === 'discard' && s[i + 1].uid !== r.uid);

/* The hub's "Online games" strip for this player, read in a fresh tab of the same browser context. */
async function hubStrip(p) {
  const hp = await p.ctx.newPage();
  try {
    await hp.goto(ORIGIN + '/');
    await hp.waitForFunction(() => { const s = document.querySelector('#onlineList .ostat'); return s && !/Checking/.test(s.textContent); }, null, { timeout: 15000 });
    return await hp.evaluate(() => Array.from(document.querySelectorAll('#onlineList .oroom')).map(r => ({ name: r.querySelector('.oname').textContent, stat: r.querySelector('.ostat').textContent })));
  } finally { await hp.close(); }
}
const expectedStatus = async p => p.page.evaluate(() => {
  if (G.phase === 'gameover') return 'Finished';
  if (G.phase === 'setup') return 'Setting up';
  const a = E.actor(G);
  return a === ui.seat ? 'Your turn' : 'Waiting for ' + G.players[a].name;
});
const toastLog = p => p.page.evaluate(() => {
  if (!window.__toasts) { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.textContent) window.__toasts.push(n.textContent); }))).observe(document.querySelector('#toasts'), { childList: true }); }
});

(async () => {
  const browser = await chromium.launch();
  const sentinel = JSON.stringify({ G: Object.assign(E.newGame({ mode: 'base', players: [{ name: 'Old', color: 'red', bot: false }, { name: 'Game', color: 'blue', bot: false }] }), { fx: [] }), opts: { hideHands: true, speed: 'fast' } });

  /* ------------------------------------------------------------------ setup screen, waiting room, not seated */
  await test('setup screen shows Online; waiting room; early start; not-seated screen; join by link', async () => {
    const host = await mkPlayer(browser, 'Ann', { color: L.PROFILE_COLORS[0], cfg: hostCfg('seafarers', 9, { friendly: true }) });
    await host.page.goto(L.URL);
    await host.page.waitForSelector('#online-card');
    await shot(host, '01-setup-online');
    const code = await createRoom(host, 3);
    const info0 = await host.page.evaluate(code => HubOnline.rooms.lookup(code), code);
    assert.strictEqual(info0.game, 'isles'); assert.strictEqual(info0.maxSeats, 3);
    const room = await host.page.evaluate(code => new Promise(res => { const u = HubOnline.rooms.watch(code, s => { if (s.room) { u(); res(s.room); } }); }), code);
    assert.deepStrictEqual(room.opts, { mode: 'seafarers', target: 9, friendly: true }, 'room opts come from the setup controls');
    const guest = await mkPlayer(browser, 'Bob', { color: L.PROFILE_COLORS[3] });
    await openLink(guest, code);
    await host.page.waitForFunction(() => document.querySelectorAll('.hl-plist li:not(.hl-empty)').length === 2);
    await guest.page.waitForSelector('.hl-bigcode');
    await shot(host, '02-waiting-room');
    assert.ok(await host.page.locator('[data-hl="start"]:not([disabled])').count(), 'host can start with 2 of 3');
    await host.page.click('[data-hl="start"]');
    await gameReady(host); await gameReady(guest);
    host.uid = await host.page.evaluate(() => ON.uid); guest.uid = await guest.page.evaluate(() => ON.uid);
    await assertSameHash([host, guest], 'start');
    const g = await host.page.evaluate(() => ({ mode: G.mode, target: G.target, friendly: G.friendly, n: G.players.length, colors: G.players.map(p => p.color).sort() }));
    assert.strictEqual(g.mode, 'seafarers'); assert.strictEqual(g.target, 9); assert.strictEqual(g.friendly, true); assert.strictEqual(g.n, 2);
    // profile colours #e4572e (Ann) and #3b6fa8 (Bob) map to red and blue
    assert.deepStrictEqual(g.colors, ['blue', 'red']);
    // own docs exist on first load with the hub summary
    for (const p of [host, guest]) await p.page.waitForFunction(() => ON.players[ON.uid] && ON.players[ON.uid].turn && ON.players[ON.uid].turn.phase === 'setup');
    // a fourth browser opening the link of a started game sees the not-seated screen
    const late = await mkPlayer(browser, 'Dan');
    await openLink(late, code);
    await late.page.waitForSelector('.hl-title');
    assert.ok(/started without you/i.test(await late.page.textContent('.hl-title')));
    assert.strictEqual(await late.page.evaluate(() => typeof G !== 'undefined' && !!G), false, 'no game state for a stranger');
    await shot(late, '03-not-seated');
    // opening an unknown code
    await late.page.goto(`${L.URL}?room=999999`);
    await late.page.waitForFunction(() => /No game with that code/.test(document.body.innerText));
    // invalid code in the link
    await late.page.goto(`${L.URL}?room=12`);
    await late.page.waitForFunction(() => /valid six-digit/.test(document.body.innerText));
    collect([host, guest, late], 'setup');
    await closeAll([host, guest, late]);
  });

  /* ------------------------------------------------------------------ 3 players, base, whole game through the UI */
  await test('3-player base game to a winner through the real UI; identical state on every replica; reload, hub strip, stats, injected junk', async () => {
    const { players, code } = await startGame(browser, ['Ann', 'Bob', 'Cy'], { hostCfg: hostCfg('base', 7), saves: [null, null, sentinel], waitShot: null });
    const info = await roomInfo(players[0]);
    assert.strictEqual(info.opts.mode, 'base'); assert.strictEqual(info.opts.target, 7);
    const { script, chooserSeed } = findScript(info, s => s.length <= 450 && count(s, 'respond', r => r.args[0]) >= 1 && count(s, 'respond', r => !r.args[0]) >= 1 && count(s, 'withdrawOffer') >= 1
      && count(s, 'bankTrade') >= 1 && count(s, 'moveRobber') >= 1 && twoDiscards(s) && count(s, 'buyDev') >= 1);
    console.log(`       room ${code}, chooser ${chooserSeed}, ${script.length} actions`);
    for (const p of players) await p.page.waitForFunction(() => ON.players[ON.uid] && ON.players[ON.uid].turn);   // own doc written on first load
    const firstIdx = a => script.findIndex(r => r.a === a);
    const iOffer = firstIdx('offer'), iDisc = firstIdx('discard'), iBuild = script.findIndex(r => r.a === 'build' && r.k > 12);
    const iReload = Math.floor(script.length * 0.4), iHub = Math.floor(script.length * 0.55), iJunk = Math.floor(script.length * 0.7), iSettle = 14;
    let shotOffer = false, shotDisc = false, shotMid = false;
    const by = u => players.find(p => p.uid === u);
    const hooks = {
      checkEvery: 5,
      before: async (rec, i, S) => {
        const p = by(rec.uid);
        if (!shotMid && i === iBuild) { shotMid = true; await shot(p, '04-dock-mid-game'); }
        if (rec.a === 'respond' && !shotOffer) {   // the receiver's Accept/Decline sheet and the offerer's Withdraw dock
          shotOffer = true;
          assert.ok(await p.page.locator('#modal [data-act="offer-yes"]').count(), 'receiver sees the sheet');
          await shot(p, '05-offer-sheet');
          const offerer = players.find(q => q.uid === info.seats[S.offer.from]);
          assert.ok(await offerer.page.locator('[data-act="withdraw"]').count(), 'offerer sees Withdraw');
          assert.ok(/Waiting for/.test(await offerer.page.textContent('#dock .prompt')));
          await shot(offerer, '06-offerer-waiting');
        }
        if (rec.a === 'discard' && !shotDisc) {
          shotDisc = true;
          assert.ok(await p.page.locator('#modal [data-act="do-discard"]').count(), 'discard sheet on the discarder\'s own device');
          await shot(p, '07-discard-sheet');
        }
        if (rec.a === 'discard') {   // a discard sheet shows only on the device whose turn it is to discard
          for (const q of players) { const has = await q.page.locator('#modal [data-act="do-discard"]').count(); assert.strictEqual(!!has, q === p, `discard sheet only for ${p.name}`); }
        }
        if (i === iJunk) {   // junk records injected by a "cheater": out of turn, unknown action, impossible ids, engine-refused move
          const kk = rec.k, q = by(rec.uid), other = players.find(x => x !== q);
          await other.page.evaluate(k => { const bad = [{ k, a: 'roll', args: [] }, { k, a: 'discard', args: [{ wood: 99 }] }]; ON.mine = [...mineList(), ...bad]; HubOnline.rooms.writeMine(ON.code, { moves: ON.mine, turn: turnSummary() }); }, kk);
          await q.page.evaluate(([k, ph]) => {
            const bad = ph === 'roll' ? [{ k, a: 'endTurn', args: [] }, { k, a: 'roll', args: [1, 2, 3] }, { k, a: '__proto__', args: [] }, { k, a: 'playDev', args: ['knight', { x: 1 }] }]
              : [{ k, a: 'build', args: ['road', 99999] }, { k, a: 'bankTrade', args: ['wood', 'wood'] }, { k, a: '__proto__', args: [] }, { k, a: 'roll', args: [] }];
            ON.mine = [...mineList(), ...bad]; HubOnline.rooms.writeMine(ON.code, { moves: ON.mine, turn: turnSummary() });
          }, [kk, S.phase === 'roll' ? 'roll' : S.phase]);
          await sleep(1200);
          await assertSameHash(players, 'after junk');
          assert.strictEqual(await L.getK(q), kk, 'junk records did not move the game');
        }
      },
      after: async (rec, i) => {
        if (i === iSettle) {   // chime flag, tab title and badge only for a turn handed over remotely
          for (const p of players) {
            const st = await p.page.evaluate(() => ({ t: document.title, f: ON.flagged, my: E.actor(G) === ui.seat }));
            assert.strictEqual(st.t === 'Your turn · Catan', st.f && st.my, 'title follows the flag');
          }
        }
        if (i === iReload) {   // reload mid-game: resumes at the same state, no chime/title/badge/effects on first load
          const q = players[1];
          await q.page.reload(); await gameReady(q);
          await waitK(players, rec.k + 1);
          await assertSameHash(players, 'after reload');
          const st = await q.page.evaluate(() => ({ t: document.title, f: ON.flagged, fx: G.fx.length, nk: ui.newKeys.size, save: localStorage.getItem('sti.save.v1'), url: location.search }));
          assert.strictEqual(st.t, 'Catan'); assert.strictEqual(st.f, false); assert.strictEqual(st.fx, 0); assert.strictEqual(st.nk, 0); assert.strictEqual(st.save, null);
          assert.ok(/room=\d{6}/.test(st.url));
        }
        if (i === iHub) {   // the hub's Online strip shows Catan with the right status for every player
          for (const p of players) {
            const strip = await hubStrip(p), want = await expectedStatus(p);
            const row = strip.find(r => /Catan/.test(r.name) && r.name.replace(/\s/g, '').includes(code));
            assert.ok(row, 'hub lists this game: ' + JSON.stringify(strip));
            assert.strictEqual(row.stat, want, `hub status for ${p.name}`);
          }
        }
      },
    };
    await runScript(players, script, hooks);
    await waitK(players, script.length);
    const h = await assertSameHash(players, 'final');
    assert.strictEqual(await players[0].page.evaluate(() => G.phase), 'gameover');
    // the same lists replayed in plain node give the same state
    const lists = await players[0].page.evaluate(() => { const o = {}; ON.seatUids.forEach(u => { o[u] = (u === ON.uid ? mineList() : ON.players[u].moves); }); return o; });
    const r = nodeReplay(info, lists);
    assert.strictEqual(hashJson(JSON.stringify(Object.assign({}, r.state, { fx: [] }))), h, 'plain node replay agrees with the browsers');
    // stats: played 1 for all, won only for the winner; no local save written or cleared
    const winnerUid = info.seats[r.state.winner];
    for (const p of players) {
      const st = await p.page.evaluate(() => { const pr = JSON.parse(localStorage.getItem('hub.profile')); return { s: pr.stats && pr.stats.isles, save: localStorage.getItem('sti.save.v1') }; });
      assert.strictEqual(st.s.played, 1, `${p.name} played`); assert.strictEqual(st.s.won, p.uid === winnerUid ? 1 : 0, `${p.name} won`);
      if (p === players[2]) assert.strictEqual(st.save, sentinel, 'local save untouched');
      else assert.strictEqual(st.save, null);
    }
    // final screen, hub says Finished
    await players[0].page.waitForSelector('#modal .score-table');
    await shot(players[0], '08-final');
    const strip = await hubStrip(players[1]);
    assert.ok(strip.some(x => x.stat === 'Finished'), 'hub shows Finished: ' + JSON.stringify(strip));
    // leave flow from the results sheet: back to setup, URL clean, game still in the room
    await players[2].page.click('#modal [data-act="leave"]');
    await players[2].page.waitForSelector('#online-card');
    assert.strictEqual(await players[2].page.evaluate(() => location.search + '|' + document.title + '|' + ON.active + '|' + (G === null)), '|Catan|false|true');
    collect(players, 'base3');
    await closeAll(players);
  });

  /* ------------------------------------------------------------------ 2 players, seafarers, desktop + phone */
  await test('2-player seafarers game to a winner (desktop and phone viewports), mixed real taps and the internal append path', async () => {
    const { players } = await startGame(browser, ['Eve', 'Fay'], { hostCfg: hostCfg('seafarers', 9), viewports: [{ width: 1300, height: 900 }, { width: 390, height: 844 }], confirm: false });
    const info = await roomInfo(players[0]);
    assert.strictEqual(info.opts.mode, 'seafarers');
    const { script, chooserSeed } = findScript(info, s => s.length <= 450 && count(s, 'moveShip') >= 1 && (count(s, 'build', r => r.args[0] === 'ship') + count(s, 'setupEdge', r => r.args[1] === 'ship')) >= 1, { maxSteps: 500 });
    console.log(`       chooser ${chooserSeed}, ${script.length} actions, ships ${count(script, 'moveShip')}, gold ${count(script, 'gold')}`);
    await shot(players[0], '09-desktop-start');
    await runScript(players, script, { checkEvery: 10, real: (rec, i) => i < 100 || ['moveShip', 'gold', 'playDev', 'steal', 'discard', 'respond', 'offer', 'withdrawOffer', 'endFreeRoads'].includes(rec.a) || i % 3 === 0 });
    await waitK(players, script.length);
    await assertSameHash(players, 'final');
    assert.strictEqual(await players[1].page.evaluate(() => G.phase), 'gameover');
    await shot(players[0], '10-desktop-final');
    collect(players, 'sea2');
    await closeAll(players);
  });

  /* ------------------------------------------------------------------ 7 with two players discarding */
  await test('a 7 with two players discarding, each from their own device, in queue order', async () => {
    const { players } = await startGame(browser, ['Gus', 'Hal', 'Ivy'], { confirm: false });
    const info = await roomInfo(players[0]);
    const { script, chooserSeed } = findScript(info, s => twoDiscards(s) && s.length <= 600, { maxSteps: 700 });
    const i = script.findIndex((r, j) => r.a === 'discard' && script[j + 1] && script[j + 1].a === 'discard' && script[j + 1].uid !== r.uid);
    console.log(`       chooser ${chooserSeed}; discards at ${i} (${script[i].uid === script[i + 1].uid})`);
    const by = u => players.find(p => p.uid === u);
    await runScript(players, script, { to: i, real: () => false });
    await waitK(players, script[i].k);
    const first = by(script[i].uid), second = by(script[i + 1].uid);
    for (const p of players) {   // sheet only for the first discarder; the others are told who is blocking
      const sheet = await p.page.locator('#modal [data-act="do-discard"]').count();
      assert.strictEqual(!!sheet, p === first);
      if (p !== first) assert.ok(new RegExp('Waiting for ' + first.name).test(await p.page.textContent('#dock .prompt')), 'names who is blocking');
    }
    await shot(first, '07b-discard-sheet-phone');
    await runScript(players, script, { from: i, to: i + 1 });
    await waitK(players, script[i].k + 1);
    assert.ok(await second.page.locator('#modal [data-act="do-discard"]').count(), 'second discarder gets the sheet');
    assert.strictEqual(await first.page.locator('#modal [data-act="do-discard"]').count(), 0);
    await runScript(players, script, { from: i + 1, to: i + 2 });
    await waitK(players, script[i].k + 2);
    await assertSameHash(players, 'after both discards');
    assert.ok(await players[0].page.evaluate(() => G.phase !== 'discard'));
    collect(players, 'discard'); await closeAll(players);
  });

  /* ------------------------------------------------------------------ the race */
  for (const order of ['offerer reconnects first', 'responder reconnects first']) {
    await test(`race at the same k (${order}): the responder wins, the offerer gets a "Too late" toast, all replicas agree`, async () => {
      const { players } = await startGame(browser, ['Jo', 'Kim'], { confirm: false });
      const info = await roomInfo(players[0]);
      const { script } = findScript(info, s => s.some((r, j) => r.a === 'offer' && j > 12 && s[j + 1] && s[j + 1].a === 'respond'), { maxSteps: 700 });
      const iOff = script.findIndex((r, j) => r.a === 'offer' && j > 12 && script[j + 1] && script[j + 1].a === 'respond');
      await runScript(players, script, { to: iOff + 1, real: () => false });
      await waitK(players, script[iOff].k + 1);
      const offerer = players.find(p => p.uid === script[iOff].uid), resp = players.find(p => p !== offerer);
      const cnt = pg => pg.page.evaluate(() => ({ acc: G.log.filter(l => /accepts/.test(l.t)).length, wd: G.log.filter(l => /withdraws/.test(l.t)).length }));
      const before = await cnt(offerer);
      await toastLog(offerer); await toastLog(resp);
      await offerer.ctx.setOffline(true); await resp.ctx.setOffline(true);
      await sleep(400);
      await offerer.page.click('[data-act="withdraw"]');
      await clickSure(resp.page, '[data-act="offer-yes"]');
      assert.strictEqual(await offerer.page.evaluate(() => G.phase), 'main', 'offerer sees the offer withdrawn locally');
      assert.ok(await resp.page.evaluate(() => G.log.some(l => /accepts/.test(l.t))), 'responder sees it accepted locally');
      const first = order.startsWith('offerer') ? offerer : resp, second = first === offerer ? resp : offerer;
      await first.ctx.setOffline(false);
      await first.page.waitForFunction(() => !ON.pending, null, { timeout: 15000 });
      if (first === offerer) { // the withdraw is on the server alone for a moment: the offerer still sees "withdrawn"
        assert.strictEqual(await offerer.page.evaluate(() => G.phase), 'main');
      }
      await second.ctx.setOffline(false);
      await Promise.all(players.map(p => p.page.waitForFunction(() => !ON.pending, null, { timeout: 15000 })));
      await waitK(players, script[iOff].k + 2);   // the offer (k) and then the one record that won the race (k + 1)
      await sleep(600);
      await assertSameHash(players, 'after race');
      const after = await cnt(offerer);
      assert.strictEqual(await offerer.page.evaluate(() => G.phase), 'main');
      assert.strictEqual(after.acc, before.acc + 1, 'the trade went through'); assert.strictEqual(after.wd, before.wd, 'the withdraw was dropped');
      const t1 = await offerer.page.evaluate(() => window.__toasts), t2 = await resp.page.evaluate(() => window.__toasts);
      assert.ok(t1.some(t => /Too late: .+ accepted your trade\./.test(t)), 'offerer toast: ' + JSON.stringify(t1));
      assert.ok(!t2.some(t => /Too late/.test(t)), 'responder gets no such toast');
      players.forEach(p => { p.errors = p.errors.filter(e => !/ERR_INTERNET_DISCONNECTED/.test(e)); });   // the browser logs those while the test takes it offline on purpose
      collect(players, 'race'); await closeAll(players);
    });
  }

  /* ------------------------------------------------------------------ leave, resume, strangers in the menu */
  await test('menu: Leave game confirm, back to setup with local save untouched; reopening the link resumes the same game', async () => {
    const { players, code } = await startGame(browser, ['Lee', 'Mo'], { confirm: false, saves: [sentinel, null] });
    const info = await roomInfo(players[0]);
    const { script } = findScript(info, s => s.length <= 400);
    await runScript(players, script, { to: 30, real: () => false });
    await waitK(players, script[29].k + 1);
    const p = players[0];
    await p.page.click('.hk-menu-btn');
    await p.page.waitForSelector('.hk-row[data-hk-item]');
    const labels = await p.page.$$eval('.hk-row[data-hk-item]', els => els.map(e => e.textContent.trim()));
    assert.ok(labels.includes('Leave game') && !labels.includes('Back to setup') && !labels.some(l => /Bot|Hide hands/.test(l)), 'online menu: ' + labels.join(', '));
    await p.page.click('.hk-row[data-hk-item]:has-text("Leave game")');
    await p.page.waitForSelector('#modal [data-act="leave"]');
    await p.page.click('#modal [data-act="close-modal"]');
    assert.ok(await p.page.evaluate(() => ON.active), 'Stay keeps the game');
    await p.page.click('.hk-menu-btn'); await p.page.click('.hk-row[data-hk-item]:has-text("Leave game")');
    await p.page.click('#modal [data-act="leave"]');
    await p.page.waitForSelector('#online-card');
    const st = await p.page.evaluate(() => ({ save: localStorage.getItem('sti.save.v1'), q: location.search, t: document.title }));
    assert.strictEqual(st.save, sentinel); assert.strictEqual(st.q, '');
    await sleep(500);
    // the game goes on without Lee, and Lee resumes it from the link
    await openLink(p, code); await gameReady(p);
    await waitK(players, script[29].k + 1);
    await assertSameHash(players, 'resumed');
    collect(players, 'leave'); await closeAll(players);
  });

  /* ------------------------------------------------------------------ local Catan with online.js blocked */
  await test('with online.js and lobby.js blocked: no Online card, local all-bot game still plays to a winner', async () => {
    const p = await mkPlayer(browser, 'Solo', { noEmulator: true, name: false, cfg: { mode: 'base', target: { base: 5, seafarers: 8 }, friendly: false, hideHands: false, speed: 'fast', level: 'normal', confirm: false,
      players: [{ name: 'Ada', color: 'red', bot: true }, { name: 'Bram', color: 'blue', bot: true }, { name: 'Cleo', color: 'orange', bot: true }] } });
    await p.ctx.route(/shared\/(online|lobby)\.js/, r => r.abort());
    const errs = [];
    p.page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.page.goto(L.URL);
    await p.page.waitForSelector('[data-act="start"]');
    assert.strictEqual(await p.page.locator('#online-card').count(), 0, 'no Online card without online.js');
    await p.page.click('[data-act="start"]');
    await p.page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'gameover', null, { timeout: 150000, polling: 500 });
    assert.strictEqual(await p.page.evaluate(() => typeof ON !== 'undefined' && ON.active), false);
    // ?room= without online support: a notice, local screen intact
    await p.page.goto(`${L.URL}?room=123456`);
    await p.page.waitForFunction(() => /not available/.test(document.body.innerText));
    assert.deepStrictEqual(errs, []);
    await p.ctx.close();
  });

  /* ------------------------------------------------------------------ local play while Online is available */
  await test('with Online available: local pass-and-play, bots, save and #continue work as before', async () => {
    const p = await mkPlayer(browser, 'Loc', { cfg: { mode: 'base', target: { base: 10, seafarers: 13 }, friendly: false, hideHands: true, speed: 'fast', level: 'normal', confirm: false,
      players: [{ name: 'Pat', color: 'red', bot: false }, { name: 'Sam', color: 'blue', bot: false }, { name: 'Ada', color: 'orange', bot: true }] } });
    await p.page.goto(L.URL);
    await p.page.waitForSelector('#online-card');
    await p.page.click('[data-act="start"]');
    await p.page.waitForFunction(() => G && G.phase === 'setup');
    assert.strictEqual(await p.page.evaluate(() => ON.active), false);
    for (let i = 0; i < 2; i++) {   // two human placements with the pass-the-device curtain between players
      if (await p.page.locator('#curtain:not([hidden]) [data-act="reveal"]').count()) await p.page.click('[data-act="reveal"]');
      await p.page.waitForSelector('.spot[data-v]', { state: 'attached' });
      await p.page.evaluate(() => document.querySelector('.spot[data-v]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await p.page.waitForSelector('.spot[data-e]', { state: 'attached' });
      await p.page.evaluate(() => document.querySelector('.spot[data-e]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await p.page.waitForFunction(n => G.setup.idx > n, i);
    }
    const saved = await p.page.evaluate(() => localStorage.getItem('sti.save.v1'));
    assert.ok(saved && JSON.parse(saved).G.v === 1, 'local save is written');
    assert.ok(!('rng' in JSON.parse(saved).G), 'local play stays unseeded');
    await p.page.goto('about:blank');
    await p.page.goto(L.URL + '#continue');
    await p.page.waitForFunction(() => typeof G !== 'undefined' && G && !document.querySelector('#game').hidden);
    assert.strictEqual(await p.page.evaluate(() => ON.active + '|' + location.hash), 'false|');
    collect([p], 'local'); await p.ctx.close();
  });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (allErrors.length) console.log('console errors:\n' + allErrors.join('\n'));
  else console.log('no console errors in any online page (390x844 and 1300x900)');
  process.exit(fail || allErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
