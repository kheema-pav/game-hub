'use strict';
/* Helpers for the Catan online end-to-end tests (isles/test/online-e2e.js).
   Needs: a static server on http://127.0.0.1:8786 (python3 -m http.server 8786 --bind 127.0.0.1 from the repo root) and the
   Firebase emulators (Firestore 8580, Auth 9599) started with project demo-game-hub. Never touches the real Firebase project:
   every context sets localStorage 'hub.emulator' so HubOnline talks to the emulators only. */
const { playGame, E } = require('./driver');
const { loadEngine } = require('./load');

const PORT = process.env.ISLES_PORT || '8786';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const URL = `${ORIGIN}/isles/index.html`;
const EMU = process.env.HUB_EMULATOR || '127.0.0.1:8580:9599';
const SHOTS = process.env.CATAN_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROFILE_COLORS = ['#e4572e', '#f2b632', '#4f9d69', '#3b6fa8', '#7c4d9b', '#e86fa0', '#2bb3b1', '#8d6e4a'];

/* A player = one browser context (own storage, own anonymous identity) with one page. */
async function mkPlayer(browser, name, o = {}) {
  const vp = o.viewport || { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', deviceScaleFactor: o.scale || 1 });
  const cfg = Object.assign({ mode: 'base', target: { base: 10, seafarers: 13 }, friendly: false, hideHands: true, speed: 'fast', level: 'normal', confirm: o.confirm !== false,
    players: [{ name: 'Player 1', color: 'red', bot: false }, { name: 'Player 2', color: 'blue', bot: false }, { name: 'Ada', color: 'orange', bot: true }] }, o.cfg || {});
  await ctx.addInitScript(([emu, prof, cfgJson, cfgOn, noEmu, save]) => {
    try { if (!noEmu) localStorage.setItem('hub.emulator', emu); } catch (e) { }
    try { if (save && !localStorage.getItem('sti.save.v1')) localStorage.setItem('sti.save.v1', save); } catch (e) { }
    try { if (prof && !localStorage.getItem('hub.profile')) localStorage.setItem('hub.profile', prof); } catch (e) { }
    try { if (cfgOn && !sessionStorage.getItem('cfgSeeded')) { localStorage.setItem('sti.cfg.v1', cfgJson); sessionStorage.setItem('cfgSeeded', '1'); } } catch (e) { }
  }, [EMU, o.name === false ? '' : JSON.stringify({ name, color: o.color || PROFILE_COLORS[0] }), JSON.stringify(cfg), o.cfg !== undefined || o.confirm !== undefined, !!o.noEmulator, o.save || '']);
  const page = await ctx.newPage();
  const errors = [];
  const p = { name, ctx, page, errors, uid: null };
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  if (process.env.DEBUG_NET) page.on('response', r => { if (r.status() >= 400) console.log(`   [net] ${name} ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)} ${(r.request().postData() || '').slice(0, 120)}`); });
  return p;
}

async function shot(p, file) {
  if (!SHOTS) return;
  await sleep(450);   // let sheets and toasts finish their entrance
  await p.page.screenshot({ path: `${SHOTS}/${file}.png` });
}

/* Host: open the setup screen, tap Play online, pick the seats, create. Returns the six-digit code. */
async function createRoom(p, seats) {
  await p.page.goto(URL);
  await p.page.waitForSelector('[data-act="online-open"]');
  await p.page.click('[data-act="online-open"]');
  await p.page.waitForSelector('.hl-panel [data-hl="create"]');
  if (seats) await p.page.click(`.hl-panel [data-hl="seats"][data-n="${seats}"]`);
  await p.page.click('.hl-panel [data-hl="create"]');
  await p.page.waitForSelector('.hl-bigcode');
  return (await p.page.textContent('.hl-bigcode')).replace(/\D/g, '');
}
/* Guest: open the invitation link. Lands in the waiting room, or straight in the game when this join fills the room. */
async function openLink(p, code) { await p.page.goto(`${URL}?room=${code}`); }

const gameReady = (p, timeout = 20000) => p.page.waitForFunction(() => typeof G !== 'undefined' && G && !document.querySelector('#game').hidden && ui.seat !== null, null, { timeout });
const evalIn = (p, fn, arg) => p.page.evaluate(fn, arg);

/* A hash of the whole game state (fx excluded), the same function everywhere. */
function hashJson(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (Math.imul(h2 ^ c, 2246822519) + i) >>> 0; }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + ':' + str.length;
}
const stateJson = p => p.page.evaluate(() => JSON.stringify(Object.assign({}, G, { fx: [] })));
const stateHash = async p => hashJson(await stateJson(p));
const getK = p => p.page.evaluate(() => (typeof ON !== 'undefined' && ON.built) ? ON.k : -1);

async function waitK(ps, k, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const ks = await Promise.all(ps.map(getK));
    if (ks.every(x => x === k)) return;
    if (Date.now() - t0 > timeout) throw new Error(`waitK: wanted k=${k}, got ${ks.join(',')}`);
    await sleep(40);
  }
}
async function assertSameHash(ps, label) {
  const hs = await Promise.all(ps.map(stateHash));
  if (!hs.every(h => h === hs[0])) throw new Error(`state hashes differ (${label}): ${hs.join(' | ')}`);
  return hs[0];
}

/* Everything a node-side replay needs, read from a page that has loaded the game. */
async function roomInfo(p) {
  return p.page.evaluate(() => {
    const { uids, players } = seatInfo();
    return { seed: ON.room.seed, uids, opts: { mode: (ON.room.opts || {}).mode, target: (ON.room.opts || {}).target, friendly: (ON.room.opts || {}).friendly, players }, uid: ON.uid, seats: ON.seatUids };
  });
}

/* ---------- scripted games: a legal action list for every seat, computed in node by the engine's own driver ---------- */
const flatten = lists => {
  const out = [];
  Object.keys(lists).forEach(uid => lists[uid].forEach((r, i) => out.push({ k: r.k, uid, a: r.a, args: r.args, idx: i })));
  return out.sort((x, y) => x.k - y.k);
};
const count = (script, a, f) => script.filter(r => r.a === a && (!f || f(r))).length;
/* Finds a chooser seed whose game ends in a winner and satisfies `want(script, result)`. */
function findScript(info, want, o = {}) {
  for (let cs = o.from || 1; cs < (o.to || 4000); cs++) {
    const r = playGame({ seed: info.seed, uids: info.uids, opts: info.opts, chooserSeed: cs, maxSteps: o.maxSteps || 500, withdrawRate: o.withdrawRate === undefined ? 0.2 : o.withdrawRate });
    if (r.state.phase !== 'gameover') continue;
    const script = flatten(r.lists);
    if (!want || want(script, r)) return { script, chooserSeed: cs, result: r };
  }
  throw new Error('no script found for ' + JSON.stringify({ seed: info.seed, mode: info.opts.mode }));
}
const nodeReplay = (info, lists) => loadEngine().replayCatan({ seed: info.seed, uids: info.uids, opts: info.opts, lists });

/* ---------- performing one action ---------- */
async function clickSure(page, sel) {   // buttons that ask "tap again": click until the second tap has gone through
  for (let i = 0; i < 3; i++) {
    await page.click(sel);
    const armed = await page.evaluate(s => { const e = document.querySelector(s); return !!(e && e.classList.contains('armed')); }, sel).catch(() => false);
    if (!armed) return;
  }
}
async function tapSpot(page, sel) {   // board spots are animated SVG groups: dispatch the click the way the existing regression test does
  await page.waitForSelector(sel, { state: 'attached', timeout: 8000 });
  await page.locator(sel).first().dispatchEvent('click');
  if (await page.locator('[data-act="pending-yes"]').count()) await page.click('[data-act="pending-yes"]');
}
async function modeIs(page, kind) { return page.evaluate(k => !!(ui.mode && ui.mode.kind === k), kind); }

/* The same actions a person would make with taps. `S` = the game before the action (parsed JSON), used for decisions only. */
async function doByUi(page, rec, S) {
  const a = rec.a, args = rec.args || [];
  // a build mode stays on after a road or ship; the trade, move and end-turn buttons come back once the player cancels it
  if (a !== 'build' && await page.locator('[data-act="cancel-mode"]').count()) await page.click('[data-act="cancel-mode"]');
  switch (a) {
    case 'setupSettlement': await tapSpot(page, `.spot[data-v="${args[0]}"]`); break;
    case 'setupEdge': {
      if (S.mode === 'seafarers' && await page.locator(`[data-act="edge-kind"][data-k="${args[1]}"]`).count()) await page.click(`[data-act="edge-kind"][data-k="${args[1]}"]`);
      await tapSpot(page, `.spot[data-e="${args[0]}"]`); break;
    }
    case 'roll': await page.click('[data-act="roll"]'); break;
    case 'moveRobber': await tapSpot(page, `.hl-hex[data-h="${args[0]}"]`); break;
    case 'steal': await clickSure(page, `[data-act="do-steal"][data-p="${args[0]}"]`); break;
    case 'discard': case 'gold': {
      for (const r of E.RES) for (let i = 0; i < (args[0][r] || 0); i++) await page.click(`[data-act="pick"][data-r="${r}"][data-d="1"]`);
      await clickSure(page, a === 'discard' ? '[data-act="do-discard"]' : '[data-act="do-gold"]'); break;
    }
    case 'build': {
      const [kind, id] = args;
      if (S.phase === 'roadBuilding') {
        if (S.mode === 'seafarers' && await page.locator(`[data-act="edge-kind"][data-k="${kind}"]`).count()) await page.click(`[data-act="edge-kind"][data-k="${kind}"]`);
      } else if (!(await modeIs(page, kind))) await page.click(`[data-act="build"][data-k="${kind}"]`);
      await tapSpot(page, kind === 'settlement' || kind === 'city' ? `.spot[data-v="${id}"]` : `.spot[data-e="${id}"]`); break;
    }
    case 'endFreeRoads': await page.click('[data-act="end-free"]'); break;
    case 'buyDev': await clickSure(page, '[data-act="buy-dev"]'); break;
    case 'bankTrade': {
      await page.click('[data-act="trade"]');
      await page.click('[data-act="trade-tab"][data-t="bank"]');
      await page.click(`[data-act="bank-give"][data-r="${args[0]}"]`);
      await page.click(`[data-act="bank-get"][data-r="${args[1]}"]`);
      await clickSure(page, '[data-act="do-bank"]');
      await page.click('[data-act="close-modal"]'); break;
    }
    case 'offer': {
      await page.click('[data-act="trade"]');
      await page.click('[data-act="trade-tab"][data-t="players"]');
      for (const r of E.RES) for (let i = 0; i < (args[1][r] || 0); i++) await page.click(`[data-act="pg"][data-r="${r}"][data-d="1"]`);
      for (const r of E.RES) for (let i = 0; i < (args[2][r] || 0); i++) await page.click(`[data-act="pw"][data-r="${r}"][data-d="1"]`);
      await clickSure(page, `[data-act="do-ptrade"][data-p="${args[0]}"]`); break;
    }
    case 'respond': await clickSure(page, args[0] ? '[data-act="offer-yes"]' : '[data-act="offer-no"]'); break;
    case 'withdrawOffer': await page.click('[data-act="withdraw"]'); break;
    case 'endTurn': await clickSure(page, '[data-act="end-turn"]'); break;
    case 'moveShip': {
      await page.click('[data-act="move-ship"]');
      await page.waitForSelector(`.spot[data-e="${args[0]}"][data-k="movefrom"]`, { state: 'attached' });
      await page.locator(`.spot[data-e="${args[0]}"][data-k="movefrom"]`).first().dispatchEvent('click');
      await tapSpot(page, `.spot[data-e="${args[1]}"][data-k="moveto"]`); break;
    }
    case 'playDev': {
      const [type, o] = args;
      if (type === 'knight' && S.phase === 'roll') { await clickSure(page, '[data-act="play-knight"]'); break; }
      await page.click('[data-act="dev"]');
      if (type === 'plenty' || type === 'mono') {
        await page.click(`[data-act="play-dev"][data-t="${type}"]`);
        for (const r of (type === 'plenty' ? o.res : [o.res])) await page.click(`[data-act="dev-sel"][data-r="${r}"]`);
        await clickSure(page, '[data-act="dev-confirm"]');
      } else await clickSure(page, `[data-act="play-dev"][data-t="${type}"]`);
      break;
    }
    default: throw new Error('no UI translator for ' + a);
  }
}
/* The internal append path the UI itself ends in (sanitize, append to my list, replay, write). */
const doInternal = (page, rec) => page.evaluate(([a, args]) => sendOnline(a, args), [rec.a, rec.args || []]);

/* Plays script[from..to) from the players' own pages. `real(rec, i)` decides UI taps (true) or the internal path. */
async function runScript(players, script, o = {}) {
  const by = {}; players.forEach(p => { by[p.uid] = p; });
  const from = o.from || 0, to = Math.min(o.to === undefined ? script.length : o.to, script.length);
  const checkEvery = o.checkEvery || 10;
  for (let i = from; i < to; i++) {
    const rec = script[i], p = by[rec.uid];
    await waitK(players, rec.k);
    const S = JSON.parse(await stateJson(p));
    if (o.before) await o.before(rec, i, S, by);
    let ok = true;
    try {
      if (!o.real || o.real(rec, i)) await doByUi(p.page, rec, S);
      else ok = await doInternal(p.page, rec);
    } catch (e) {
      await p.page.screenshot({ path: `${SHOTS || '/tmp'}/fail-step-${i}.png` }).catch(() => { });
      throw new Error(`step ${i} (${rec.a} ${JSON.stringify(rec.args)}, ${p.name}, phase ${S.phase}): ${String(e.message).split('\n')[0]}`);
    }
    if (ok === false) throw new Error(`step ${i}: ${rec.a} was refused (${p.name})`);
    await waitK(players, rec.k + 1).catch(async e => {
      await p.page.screenshot({ path: `${SHOTS || '/tmp'}/fail-step-${i}.png` }).catch(() => { });
      throw new Error(`step ${i} (${rec.a} ${JSON.stringify(rec.args)}, ${p.name}, phase ${S.phase}) did not apply: ${e.message}`);
    });
    if (o.after) await o.after(rec, i, S, by);
    if ((i + 1) % checkEvery === 0) await assertSameHash(players, `after step ${i}`);
  }
}

module.exports = { E, URL, ORIGIN, sleep, mkPlayer, shot, createRoom, openLink, gameReady, evalIn, hashJson, stateJson, stateHash, getK, waitK, assertSameHash, roomInfo,
  flatten, count, findScript, nodeReplay, doByUi, doInternal, runScript, clickSure, tapSpot, PROFILE_COLORS };
