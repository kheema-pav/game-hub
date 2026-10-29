'use strict';
/* Node tests for the Catan engine + replayCatan.  Run: node isles/test/engine.test.js */
const assert = require('assert');
const crypto = require('crypto');
const { E, playGame, makeRand } = require('./driver');

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n       ')); }
}
const hash = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex');
const clone = o => JSON.parse(JSON.stringify(o));
const keyOf = a => a.p + ':' + a.idx;
const UIDS = ['uidD', 'uidA', 'uidC', 'uidB'];
const OPTS = { base: { mode: 'base', target: 7 }, seafarers: { mode: 'seafarers', target: 9 } };

/* ---------- generator ---------- */
console.log('generator');
test('mulberryNext matches codex rng(seed)', () => {
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  for (const seed of [0, 1, 42, 0xdeadbeef, 4294967295, 123456789]) {
    const ref = rng(seed), h = { rng: seed >>> 0 };
    for (let i = 0; i < 2000; i++) assert.strictEqual(E.mulberryNext(h), ref());
  }
});
test('same seed = same game; different seed differs; unseeded has no s.rng', () => {
  const pl = [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }];
  for (const mode of ['base', 'seafarers']) {
    const a = E.newGame({ mode, seed: 99, players: pl }), b = E.newGame({ mode, seed: 99, players: pl }), c = E.newGame({ mode, seed: 100, players: pl });
    assert.strictEqual(hash(a), hash(b)); assert.notStrictEqual(hash(a), hash(c));
    assert.strictEqual(typeof a.rng, 'number');
    const u = E.newGame({ mode, players: pl });
    assert.ok(!('rng' in u));
  }
});
test('dice and steals draw from s.rng; JSON round trip (undo/save) continues the same sequence', () => {
  const pl = [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }];
  const s = E.newGame({ mode: 'base', seed: 5, players: pl });
  s.phase = 'roll'; s.setup.step = 'done';
  const snap = JSON.stringify(s), before = s.rng;
  assert.ok(E.doRoll(s).ok); assert.notStrictEqual(s.rng, before);
  const dice1 = s.dice.slice();
  const s2 = JSON.parse(snap); assert.strictEqual(s2.rng, before);
  assert.ok(E.doRoll(s2).ok); assert.deepStrictEqual(s2.dice, dice1);
});
test('unseeded dice still use Math.random', () => {
  const pl = [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }];
  const real = Math.random; let calls = 0; Math.random = () => { calls++; return real(); };
  try { const s = E.newGame({ mode: 'base', players: pl }); const c0 = calls; assert.ok(c0 > 0); s.phase = 'roll'; E.doRoll(s); assert.ok(calls >= c0 + 2); }
  finally { Math.random = real; }
});
test('seeded games never touch Math.random (board, replay, steals)', () => {
  const real = Math.random; Math.random = () => { throw new Error('Math.random used'); };
  try { for (const mode of ['base', 'seafarers']) playGame({ seed: 17, uids: UIDS.slice(0, 3), opts: OPTS[mode] }); }
  finally { Math.random = real; }
});
test('failure paths do not consume the generator', () => {
  const g = playGame({ seed: 3, uids: UIDS.slice(0, 3), opts: OPTS.base, maxSteps: 60 });
  const s = g.state, r = s.rng;
  const bad = [() => E.doRoll(s), () => E.doSteal(s, 0), () => E.doMoveRobber(s, 0), () => E.doOffer(s, 99, {}, {}), () => E.doOffer(s, s.current, { wood: 1 }, { ore: 1 }), () => E.withdrawOffer(s), () => E.doRespond(s, true), () => E.doEndTurn(Object.assign(clone(s), { phase: 'roll' }))];
  bad.forEach(f => { const x = f(); assert.ok(!x.ok); });
  assert.strictEqual(s.rng, r);
});

test('boards are stable under last-digit differences in Math.sin/cos/atan2 (stand-in for another JS engine)', () => {
  const { boardHash } = require('./hashfn');
  const pl = [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }];
  const ref = {}; for (const mode of ['base', 'seafarers']) { ref[mode] = []; for (let seed = 1; seed <= 60; seed++) ref[mode].push(boardHash(E.newGame({ mode, seed, players: pl }).board)); }
  const sin = Math.sin, cos = Math.cos, atan2 = Math.atan2;
  let n = 0; const wob = v => v + (((n++ * 7919) % 13) - 6) * 3e-14;
  Math.sin = x => wob(sin(x)); Math.cos = x => wob(cos(x)); Math.atan2 = (y, x) => wob(atan2(y, x));
  try { for (const mode of ['base', 'seafarers']) for (let seed = 1; seed <= 60; seed++) assert.strictEqual(boardHash(E.newGame({ mode, seed, players: pl }).board), ref[mode][seed - 1], mode + ' ' + seed); }
  finally { Math.sin = sin; Math.cos = cos; Math.atan2 = atan2; }
});

/* ---------- engine additions ---------- */
console.log('engine');
function mainPhaseState(seed = 8, mode = 'base') {
  let found = null;
  playGame({ seed, uids: UIDS.slice(0, 3), opts: OPTS[mode], onStep: (s, k, lists, seats) => { if (!found && s.phase === 'main' && E.handCount(s.players[s.current].hand) > 0 && Object.keys(s.players[0].hand).some(() => true)) found = { s: clone(s) }; } });
  return found.s;
}
test('doOffer validates `to` (non-integer, out of range, self, negative, string)', () => {
  const s0 = mainPhaseState(); const r = RES0(s0);
  const give = { [r]: 1 }, other = ['wood', 'brick', 'sheep', 'wheat', 'ore'].find(x => x !== r);
  for (const to of ['1', -1, 1.5, 99, NaN, s0.current, null, undefined, {}, [1]]) { const s = clone(s0); assert.ok(!E.doOffer(s, to, give, { [other]: 1 }).ok, 'to=' + String(to)); assert.strictEqual(s.phase, 'main'); assert.strictEqual(s.offer, null); }
  const s = clone(s0), to = (s.current + 1) % 3;
  assert.ok(E.doOffer(s, to, give, { [other]: 1 }).ok); assert.strictEqual(s.phase, 'offer');
  function RES0(st) { return E.RES.find(x => st.players[st.current].hand[x] > 0); }
});
test('withdrawOffer: only in phase offer, clears offer, back to main, logs, does not refund offerMade', () => {
  const s0 = mainPhaseState(); const me = s0.current, r = E.RES.find(x => s0.players[me].hand[x] > 0), o = E.RES.find(x => x !== r);
  assert.ok(!E.withdrawOffer(clone(s0)).ok);
  const s = clone(s0); assert.ok(E.doOffer(s, (me + 1) % 3, { [r]: 1 }, { [o]: 1 }).ok);
  const made = s.offerMade, rng = s.rng, logN = s.log.length;
  assert.ok(E.withdrawOffer(s).ok);
  assert.strictEqual(s.phase, 'main'); assert.strictEqual(s.offer, null); assert.strictEqual(s.offerMade, made); assert.strictEqual(s.rng, rng); assert.strictEqual(s.log.length, logN + 1);
  assert.ok(!E.withdrawOffer(s).ok);
});
test('offers are capped at 5 per turn (state-counted, reset by endTurn)', () => {
  const s = mainPhaseState(); const me = s.current, r = E.RES.find(x => s.players[me].hand[x] > 0), o = E.RES.find(x => x !== r);
  for (let i = 0; i < 5; i++) { assert.ok(E.doOffer(s, (me + 1) % 3, { [r]: 1 }, { [o]: 1 }).ok, 'offer ' + i); assert.ok(E.doRespond(s, false).ok); }
  assert.strictEqual(s.offerMade, 5);
  assert.ok(!E.doOffer(s, (me + 1) % 3, { [r]: 1 }, { [o]: 1 }).ok);
  assert.ok(E.doEndTurn(s).ok); assert.strictEqual(s.offerMade, 0);
});
test('placePorts order is tie-safe (shuffled input ids / equal angles)', () => {
  // same board regardless of Array.prototype.sort stability: candidates are totally ordered by (angle, id)
  for (const mode of ['base', 'seafarers']) for (let seed = 1; seed <= 20; seed++) {
    const a = E.newGame({ mode, seed, players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }] });
    const orig = Array.prototype.sort; let flip = false;
    Array.prototype.sort = function (cmp) { if (flip && cmp) this.reverse(); return orig.call(this, cmp); };
    flip = true; let b; try { b = E.newGame({ mode, seed, players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }] }); } finally { Array.prototype.sort = orig; }
    assert.strictEqual(JSON.stringify(a.board.ports), JSON.stringify(b.board.ports), mode + ' ' + seed);
  }
});

/* ---------- replay ---------- */
console.log('replay');
const games = {};
function game(mode, seed, n) {
  n = n || (mode === 'base' ? 3 : 2);
  const key = mode + seed + 'x' + n;
  if (!games[key]) games[key] = playGame({ seed, uids: UIDS.slice(0, n), opts: OPTS[mode] });
  return games[key];
}
const GAME_SET = [];
for (const mode of ['base', 'seafarers']) for (const seed of [1, 2, 3, 4, 5, 6]) GAME_SET.push([mode, seed, mode === 'base' ? 3 : 2]);
for (const seed of [1, 2, 3]) GAME_SET.push(['base', seed, 4], ['seafarers', seed, 3], ['seafarers', seed, 4]); // more seats: steals, gold, free roads
for (const [mode, seed, n] of GAME_SET) {
  test(`${mode} ${n}p seed ${seed}: scripted game reaches a winner; replay == live; repeats and orderings agree`, () => {
    const g = game(mode, seed, n), s = g.state;
    assert.strictEqual(s.phase, 'gameover'); assert.ok(s.winner !== null);
    const input = { seed, uids: g.uids, opts: g.opts, lists: g.lists };
    const r1 = E.replayCatan(input), r2 = E.replayCatan(input);
    assert.strictEqual(hash(r1.state), hash(s)); assert.strictEqual(hash(r1.state), hash(r2.state));
    assert.strictEqual(r1.stale.length, 0); assert.strictEqual(r1.invalid.length, 0);
    assert.strictEqual(r1.applied.length, g.steps); assert.strictEqual(r1.k, g.steps); assert.deepStrictEqual(r1.waitingFor, []);
    // different object key order, uid order and a JSON round trip (as read back from Firestore)
    const rev = {}; Object.keys(g.lists).reverse().forEach(u => { rev[u] = clone(g.lists[u]); });
    const r3 = E.replayCatan({ seed, uids: g.uids.slice().reverse(), opts: clone(g.opts), lists: rev });
    assert.strictEqual(hash(r3.state), hash(s)); assert.deepStrictEqual(r3.seats, r1.seats);
    // partial prefixes arriving in random order converge, and every stage applies a prefix of the final history
    const full = r1.applied.map(keyOf), R = makeRand(seed * 13 + 1);
    const have = {}; g.uids.forEach(u => { have[u] = 0; });
    while (g.uids.some(u => have[u] < g.lists[u].length)) {
      const u = R.pick(g.uids.filter(x => have[x] < g.lists[x].length));
      have[u] = Math.min(g.lists[u].length, have[u] + 1 + Math.floor(R.f() * 40));
      const part = {}; g.uids.forEach(x => { part[x] = g.lists[x].slice(0, have[x]); });
      const rp = E.replayCatan({ seed, uids: g.uids, opts: g.opts, lists: part });
      assert.deepStrictEqual(rp.applied.map(keyOf), full.slice(0, rp.applied.length));
      assert.strictEqual(rp.stale.length, 0); assert.strictEqual(rp.invalid.length, 0);
    }
    assert.strictEqual(have[g.uids[0]], g.lists[g.uids[0]].length);
  });
}
test('seat order is a seeded shuffle of the sorted uids (same for any input order)', () => {
  const a = E.replayCatan({ seed: 77, uids: ['c', 'a', 'b'], opts: OPTS.base, lists: {} }), b = E.replayCatan({ seed: 77, uids: ['b', 'c', 'a'], opts: OPTS.base, lists: {} });
  assert.deepStrictEqual(a.seats, b.seats); assert.deepStrictEqual(a.seats.slice().sort(), ['a', 'b', 'c']);
  const h = { rng: 77 }; const exp = E.shuffle(['a', 'b', 'c'], h);
  assert.deepStrictEqual(a.seats, exp);
  const orders = new Set(); for (let s = 0; s < 60; s++) orders.add(E.replayCatan({ seed: s, uids: ['a', 'b', 'c'], opts: OPTS.base, lists: {} }).seats.join());
  assert.ok(orders.size >= 5, 'seeds produce varied orders');
});
test('colours and names from opts.players, clash falls back to the first unused', () => {
  const r = E.replayCatan({ seed: 4, uids: ['a', 'b', 'c'], opts: { mode: 'base', players: { a: { name: 'Ann', color: 'blue' }, b: { name: ' Bo ', color: 'blue' }, c: { color: 'nope' } } }, lists: {} });
  const byUid = {}; r.seats.forEach((u, i) => { byUid[u] = r.state.players[i]; });
  assert.strictEqual(byUid.a.name, 'Ann'); assert.strictEqual(byUid.b.name, 'Bo');
  assert.strictEqual(new Set(r.state.players.map(p => p.color)).size, 3);
  r.state.players.forEach(p => assert.ok(E.COLOR_IDS.includes(p.color)));
});

/* helper: find a main-phase point of a driven game where A can offer 1 of a resource it holds exactly 4 of (no port),
   B holds some other resource - used for the race and deadlock scenarios. */
function findOfferPoint(mode) {
  for (let seed = 1; seed < 400; seed++) {
    let hit = null;
    const uids = mode === 'base' ? UIDS.slice(0, 3) : UIDS.slice(0, 2);
    playGame({ seed, uids, opts: OPTS[mode], onStep: (s, k, lists, seats) => {
      if (hit || s.phase !== 'main' || s.offerMade) return;
      const a = s.current, ports = E.portsOf(s, a);
      if (ports.has('any')) return;
      for (const r of E.RES) {
        if (s.players[a].hand[r] !== 4 || ports.has(r)) continue;
        for (const b of s.players.map(p => p.id).filter(i => i !== a)) {
          const w = E.RES.find(x => x !== r && s.players[b].hand[x] > 0 && s.bank[x] > 0);
          const other = E.RES.find(x => x !== r && x !== w && s.bank[x] > 0);
          if (w && other) { hit = { seed, k, uids, lists: clone(lists), seats: seats.slice(), a, b, r, w, other, s: clone(s) }; return; }
        }
      }
    } });
    if (hit) return hit;
  }
  throw new Error('no suitable offer point found');
}
function atPoint(pt) { // lists containing only records applied before step pt.k
  const full = {}; pt.uids.forEach(u => { full[u] = pt.lists[u].filter(r => r.k < pt.k); });
  return full;
}
for (const mode of ['base', 'seafarers']) {
  const pt = findOfferPoint(mode), uidA = pt.seats[pt.a], uidB = pt.seats[pt.b], k = pt.k;
  const common = () => atPoint(pt);
  const optsOf = OPTS[mode];
  const rep = lists => E.replayCatan({ seed: pt.seed, uids: pt.uids, opts: optsOf, lists });
  const wd = st => st.log.filter(l => /withdraws/.test(l.t)).length; // earlier scripted withdrawals may already be in the log
  test(`${mode}: sanity - offer point reproduces and offer is live at k`, () => {
    const L = common(); L[uidA].push({ k, a: 'offer', args: [pt.b, { [pt.r]: 1 }, { [pt.w]: 1 }] });
    const r = rep(L); assert.strictEqual(r.k, k + 1); assert.strictEqual(r.state.phase, 'offer'); assert.deepStrictEqual(r.waitingFor, [pt.b]);
    assert.strictEqual(r.allowed.length, 2); assert.strictEqual(r.allowed[0].p, pt.b); assert.strictEqual(r.allowed[1].p, pt.a);
  });
  test(`${mode}: withdraw vs respond at the same k resolves to the responder (any list order)`, () => {
    const base = rep(common());
    for (const accept of [true, false]) {
      const L = common();
      L[uidA].push({ k, a: 'offer', args: [pt.b, { [pt.r]: 1 }, { [pt.w]: 1 }] }, { k: k + 1, a: 'withdrawOffer', args: [] });
      L[uidB].push({ k: k + 1, a: 'respond', args: [accept] });
      const r1 = rep(L);
      const rev = {}; Object.keys(L).reverse().forEach(u => { rev[u] = L[u]; });
      const r2 = rep(rev);
      for (const r of [r1, r2]) {
        assert.strictEqual(r.state.phase, 'main'); assert.strictEqual(r.k, k + 2);
        const got = r.applied.map(x => x.a).slice(-2); assert.deepStrictEqual(got, ['offer', 'respond']);
        assert.strictEqual(r.stale.length, 1); assert.strictEqual(r.stale[0].p, pt.a);
        assert.strictEqual(r.invalid.length, 0);
        assert.ok(r.state.log.some(l => /accepts|declines/.test(l.t))); assert.strictEqual(wd(r.state), wd(base.state));
        const handA = r.state.players[pt.a].hand;
        assert.strictEqual(handA[pt.r], accept ? 3 : 4);
      }
      assert.strictEqual(hash(r1.state), hash(r2.state));
    }
  });
  test(`${mode}: withdraw alone (no response yet) applies; respond arriving later rewrites history to the responder`, () => {
    const L = common();
    L[uidA].push({ k, a: 'offer', args: [pt.b, { [pt.r]: 1 }, { [pt.w]: 1 }] }, { k: k + 1, a: 'withdrawOffer', args: [] });
    const base = rep(common());
    const r1 = rep(L); assert.strictEqual(r1.state.phase, 'main'); assert.strictEqual(wd(r1.state), wd(base.state) + 1);
    L[uidB].push({ k: k + 1, a: 'respond', args: [true] });
    const r2 = rep(L); assert.strictEqual(wd(r2.state), wd(base.state)); assert.strictEqual(r2.state.players[pt.a].hand[pt.r], 3);
  });
  test(`${mode}: R1 deadlock - stale bankTrade/endTurn after a lost withdraw race do not deadlock`, () => {
    const L = common();
    // A believes its withdraw won, so it keeps playing at k+2, k+3, ...
    L[uidA].push(
      { k, a: 'offer', args: [pt.b, { [pt.r]: 1 }, { [pt.w]: 1 }] },
      { k: k + 1, a: 'withdrawOffer', args: [] },
      { k: k + 2, a: 'bankTrade', args: [pt.r, pt.other] }, // valid only if A still has 4 of r
      { k: k + 3, a: 'endTurn', args: [] });
    L[uidB].push({ k: k + 1, a: 'respond', args: [true] });
    const r = rep(L);
    // B's accept wins: A has 3 of r, so bankTrade is rejected and k stays at k+2; endTurn@k+3 can never apply
    assert.strictEqual(r.k, k + 2); assert.strictEqual(r.state.phase, 'main'); assert.strictEqual(r.state.current, pt.a);
    assert.deepStrictEqual(r.invalid.map(x => [x.p, x.a]), [[pt.a, 'bankTrade']]);
    assert.ok(r.stale.some(x => x.p === pt.a && L[uidA][x.idx].a === 'withdrawOffer'));
    assert.deepStrictEqual(r.waitingFor, [pt.a]);
    // A's client sees the state and sends a fresh record at the current step: it is NOT blocked by the dead head record
    L[uidA].push({ k: r.k, a: 'endTurn', args: [] });
    const r2 = rep(L);
    assert.strictEqual(r2.k, k + 3); assert.strictEqual(r2.state.phase, 'roll'); assert.strictEqual(r2.state.current, (pt.a + 1) % pt.uids.length);
    assert.ok(r2.stale.length >= 2); // the old withdraw and the dead endTurn@k+3
    // had the withdraw won instead (no respond record), the same list would play out as A intended
    const L3 = common(); L3[uidA].push(...L[uidA].slice(common()[uidA].length, common()[uidA].length + 4));
    const r3 = rep(L3); assert.strictEqual(r3.invalid.length, 0); assert.strictEqual(r3.state.phase, 'roll'); assert.strictEqual(r3.k, k + 4);
  });
}

/* ---------- injected invalid records ---------- */
console.log('injection');
const BAD_CARDS = [null, 5, 'wood', [], [1], { wood: '1' }, { wood: -1 }, { wood: 20 }, { wood: 1.5 }, { wood: NaN }, { wood: null }, { gold: 1 }, { wood: 1, __proto__x: 1 }, { constructor: 1 }, { wood: Infinity }];
const BAD_IDS = ['5', '', null, undefined, -1, 1e9, 1.5, NaN, Infinity, [1], { 0: 1 }, true];
function variants(rec, nPlayers) {
  const out = [];
  const a = rec.a, args = rec.args || [];
  out.push({ k: rec.k, a, args: args.concat([1]) }); // extra argument
  if (args.length && a !== 'playDev') out.push({ k: rec.k, a, args: args.slice(0, -1) }); // missing argument (playDev's options are optional for knight/road)
  out.push({ k: rec.k, a, args: { 0: args[0] } }); // args not an array
  const idPos = { setupSettlement: [0], setupEdge: [0], moveRobber: [0], steal: [0], build: [1], moveShip: [0, 1], offer: [0] }[a];
  if (idPos) idPos.forEach(i => BAD_IDS.forEach(b => { const x = args.slice(); x[i] = b; out.push({ k: rec.k, a, args: x }); }));
  if (a === 'offer') { for (const to of [nPlayers, nPlayers + 5, -1, '1', 1.5, rec.args[0] === undefined ? 0 : null]) { const x = args.slice(); x[0] = to; out.push({ k: rec.k, a, args: x }); } }
  const cardPos = { discard: [0], gold: [0], offer: [1, 2] }[a];
  if (cardPos) cardPos.forEach(i => BAD_CARDS.forEach(b => { const x = args.slice(); x[i] = b; out.push({ k: rec.k, a, args: x }); }));
  if (a === 'setupEdge' || a === 'build') [1, 0].forEach(i => { if (a === 'setupEdge' && i === 0) return; ['bogus', 'toString', '__proto__', 'constructor', 7, null, ['road']].forEach(b => { const x = args.slice(); x[a === 'build' ? 0 : 1] = b; out.push({ k: rec.k, a, args: x }); }); });
  if (a === 'roll') out.push({ k: rec.k, a, args: [[6, 6]] }, { k: rec.k, a, args: [6, 6] });
  if (a === 'moveRobber') out.push({ k: rec.k, a: 'steal', args: [0, true] }); // wrong action for the phase -> stale, not applied
  if (a === 'steal') out.push({ k: rec.k, a, args: args.concat([true]) }, { k: rec.k, a, args: [args[0], 'auto'] });
  if (a === 'playDev') { const t = args[0]; out.push({ k: rec.k, a, args: ['vp', {}] }, { k: rec.k, a, args: ['bogus', {}] }, { k: rec.k, a, args: [t, { res: 'gold' }] }, { k: rec.k, a, args: [t, 'x'] }, { k: rec.k, a, args: [t, []] }, { k: rec.k, a, args: ['plenty', { res: ['wood'] }] }, { k: rec.k, a, args: ['plenty', { res: ['wood', 'gold'] }] }, { k: rec.k, a, args: ['mono', { res: ['wood'] }] }, { k: rec.k, a, args: ['mono', {}] }); }
  if (a === 'bankTrade') BAD_IDS.concat(['gold', 'sea', 'toString']).forEach(b => out.push({ k: rec.k, a, args: [b, args[1]] }));
  if (a === 'respond') [1, 0, 'true', 'false', null, undefined, {}, [true], NaN].forEach(b => out.push({ k: rec.k, a, args: [b] }));
  out.push({ k: rec.k, a: '__proto__', args: [] }, { k: rec.k, a: 'constructor', args: [] }, { k: rec.k, a: 'doRoll', args: [] }, { k: rec.k, a: 5, args: [] });
  return out;
}
function injectionRun(mode, seed, n, cap) {
    const g = game(mode, seed, n);
    const clean = E.replayCatan({ seed: g.seed, uids: g.uids, opts: g.opts, lists: g.lists });
    const cleanHash = hash(clean.state);
    const seen = {}; const picks = [];
    clean.applied.forEach(ap => { seen[ap.a] = (seen[ap.a] || 0) + 1; if (seen[ap.a] <= cap) picks.push(ap); });
    let injected = 0, inv = 0, stl = 0; const acts = new Set();
    for (const ap of picks) {
      const uid = g.seats[ap.p], rec = g.lists[uid][ap.idx];
      acts.add(rec.a + (rec.a === 'playDev' ? '/' + rec.args[0] : ''));
      for (const v of variants(rec, n)) {
        const lists = clone(g.lists);
        lists[uid].splice(ap.idx, 0, v); // the corrupt record sits right before the legit one, same author, same k
        const r = E.replayCatan({ seed: g.seed, uids: g.uids, opts: g.opts, lists });
        injected++;
        assert.strictEqual(hash(r.state), cleanHash, `${mode} ${rec.a} variant ${JSON.stringify(v)} changed the game`);
        assert.strictEqual(r.state.rng, clean.state.rng);
        assert.ok(!r.applied.some(x => x.p === ap.p && x.idx === ap.idx), 'bad record applied: ' + JSON.stringify(v));
        if (r.invalid.some(x => x.p === ap.p && x.idx === ap.idx)) inv++; else if (r.stale.some(x => x.p === ap.p && x.idx === ap.idx)) stl++; else assert.fail('injected record neither invalid nor stale: ' + JSON.stringify(v));
      }
    }
    return { injected, inv, stl, acts };
}
let INJ_TOTAL = 0;
for (const [mode, seed, n, cap] of [['base', 2, 3, 12], ['seafarers', 2, 2, 12], ['base', 1, 4, 3], ['seafarers', 1, 3, 3], ['seafarers', 2, 4, 3]]) {
  test(`${mode} ${n}p seed ${seed}: injected invalid records are rejected; state and generator identical to the clean replay`, () => {
    const x = injectionRun(mode, seed, n, cap); INJ_TOTAL += x.injected;
    assert.ok(x.injected > 300, 'enough injections: ' + x.injected);
    console.log(`       ${x.injected} injections (${x.inv} invalid, ${x.stl} stale) over actions: ${[...x.acts].sort().join(' ')}`);
  });
}
test('sanitizer rejects prototype-pollution shaped args and never mutates state', () => {
  const g = game('base', 2); const s = g.state;
  const before = hash(s);
  const evil = JSON.parse('{"a":"build","k":0,"args":["road",1],"__proto__":{"polluted":1}}');
  E.sanitizeAction(s, 0, evil); E.sanitizeAction(s, 0, { a: 'discard', args: [JSON.parse('{"__proto__":{"wood":1}}')] });
  assert.strictEqual(hash(s), before); assert.strictEqual({}.polluted, undefined);
});
test('applyAction turns engine exceptions into a rejection', () => {
  const g = game('base', 2); const s = clone(g.state);
  s.board = null; const r = E.applyAction(s, 0, { a: 'build', x: { kind: 'road', id: 1 } }); assert.strictEqual(r.ok, false);
});

console.log(`\n${INJ_TOTAL} injected records checked in total`);
console.log(`${pass} passed, ${fail} failed`);
if (fail) { console.log('failed:', failures.join('; ')); process.exit(1); }
