'use strict';
/* A simple legal-action chooser used to script full games, recording per-player {k, a, args} lists. */
const E = require('./load').loadEngine();

function makeRand(seed) { const h = { rng: seed >>> 0 }; return { f: () => E.mulberryNext(h), pick(a) { return a[Math.floor(this.f() * a.length)]; } }; }

function chooseOptions(s, p, R) {
  const pl = s.players[p], RES = E.RES;
  const opts = []; // [weight, {a,args}]
  const add = (w, a, args) => opts.push([w, { a, args }]);
  if (E.canBuildKind(s, p, 'city')) add(8, 'build', ['city', R.pick(E.buildSpots(s, p, 'city'))]);
  if (E.canBuildKind(s, p, 'settlement')) add(8, 'build', ['settlement', R.pick(E.buildSpots(s, p, 'settlement'))]);
  if (E.canBuildKind(s, p, 'road')) add(2, 'build', ['road', R.pick(E.buildSpots(s, p, 'road'))]);
  if (E.canBuildKind(s, p, 'ship')) add(3, 'build', ['ship', R.pick(E.buildSpots(s, p, 'ship'))]);
  if (s.deck.length && E.canAfford(s, p, 'dev')) add(3, 'buyDev', []);
  for (const type of ['knight', 'road', 'plenty', 'mono']) {
    if (!E.playableDev(s, p, type)) continue;
    if (type === 'plenty') { const av = RES.filter(r => s.bank[r] >= 2); if (av.length) add(2, 'playDev', ['plenty', { res: [R.pick(av), R.pick(av)] }]); }
    else if (type === 'mono') add(2, 'playDev', ['mono', { res: R.pick(RES) }]);
    else add(2, 'playDev', [type, {}]);
  }
  for (const r of RES) {
    if (pl.hand[r] >= E.tradeRatio(s, p, r)) { const want = RES.filter(x => x !== r && s.bank[x] > 0); if (want.length) add(2, 'bankTrade', [r, R.pick(want)]); }
  }
  if (s.offerMade < E.MAX_OFFERS && E.handCount(pl.hand) > 0 && s.players.length > 1) {
    const to = R.pick(s.players.filter(o => o.id !== p)).id;
    const gr = RES.filter(r => pl.hand[r] > 0), tr = RES.filter(r => s.players[to].hand[r] > 0);
    const give = R.pick(gr), gets = tr.filter(r => r !== give);
    if (gets.length) add(2, 'offer', [to, { [give]: 1 }, { [R.pick(gets)]: 1 }]);
  }
  const ships = E.movableShips(s, p);
  for (const from of ships) { const t = E.shipTargets(s, p, from); if (t.length) { add(1, 'moveShip', [from, R.pick(t)]); break; } }
  add(opts.length ? 2 : 10, 'endTurn', []);
  return opts;
}

function chooseAction(s, p, R) {
  const RES = E.RES;
  switch (s.phase) {
    case 'setup':
      if (s.setup.step === 'settlement') return { a: 'setupSettlement', args: [R.pick(E.validSettlements(s, p, true))] };
      { const sv = s.setup.vertex, roads = E.validRoads(s, p, sv), ships = s.mode === 'seafarers' ? E.validShips(s, p, sv) : [];
        if (ships.length && (!roads.length || R.f() < 0.25)) return { a: 'setupEdge', args: [R.pick(ships), 'ship'] };
        return { a: 'setupEdge', args: [R.pick(roads), 'road'] }; }
    case 'roll':
      if (E.playableDev(s, p, 'knight') && R.f() < 0.2) return { a: 'playDev', args: ['knight', {}] };
      return { a: 'roll', args: [] };
    case 'discard': {
      const need = s.discardQ[0].n, pool = []; RES.forEach(r => { for (let i = 0; i < s.players[p].hand[r]; i++) pool.push(r); });
      const c = {}; for (let i = 0; i < need; i++) { const x = pool.splice(Math.floor(R.f() * pool.length), 1)[0]; c[x] = (c[x] || 0) + 1; }
      return { a: 'discard', args: [c] };
    }
    case 'robber': return { a: 'moveRobber', args: [R.pick(E.robberTargets(s))] };
    case 'steal': return { a: 'steal', args: [R.pick(s.stealFrom)] };
    case 'gold': {
      const avail = RES.reduce((a, r) => a + s.bank[r], 0), need = Math.min(s.goldQ[0].n, avail), c = {};
      for (let i = 0; i < need; i++) { const av = RES.filter(r => s.bank[r] - (c[r] || 0) > 0); const r = R.pick(av); c[r] = (c[r] || 0) + 1; }
      return { a: 'gold', args: [c] };
    }
    case 'roadBuilding': {
      if (R.f() < 0.1) return { a: 'endFreeRoads', args: [] };
      const kinds = ['road', 'ship'].filter(k => E.canBuildKind(s, p, k));
      const k = R.pick(kinds); return { a: 'build', args: [k, R.pick(E.buildSpots(s, p, k))] };
    }
    case 'main': {
      const opts = chooseOptions(s, p, R), tot = opts.reduce((a, o) => a + o[0], 0);
      let x = R.f() * tot; for (const o of opts) { x -= o[0]; if (x < 0) return o[1]; }
      return opts[opts.length - 1][1];
    }
    case 'offer': return { a: 'respond', args: [R.f() < 0.6] };
  }
  throw new Error('no chooser for phase ' + s.phase);
}

/* Plays a whole game on a live state, driving it through the same sanitize+apply path as the replay.
   Returns {seed, uids, opts, lists, seats, state, steps, hook points}. onStep(s, k, lists) lets callers snapshot. */
function playGame({ seed, uids, opts, chooserSeed, maxSteps = 8000, onStep, withdrawRate = 0.15 }) {
  const lists = {}; uids.forEach(u => { lists[u] = []; });
  const r0 = E.replayCatan({ seed, uids, opts, lists });
  const s = r0.state, seats = r0.seats, R = makeRand(chooserSeed === undefined ? seed * 31 + 7 : chooserSeed);
  let k = 0;
  while (s.phase !== 'gameover' && k < maxSteps) {
    if (onStep) onStep(s, k, lists, seats);
    const allowed = E.allowedAt(s);
    let al = allowed[0];
    if (allowed.length > 1 && R.f() < withdrawRate) al = allowed[1];
    const act = chooseAction(s, al.p, R);
    if (!al.acts.includes(act.a) && !(al.acts[0] === 'withdrawOffer')) throw new Error('chooser produced ' + act.a + ' for ' + al.acts);
    const rec = al.acts[0] === 'withdrawOffer' ? { a: 'withdrawOffer', args: [] } : act;
    const clean = E.sanitizeAction(s, al.p, rec);
    if (!clean) throw new Error('sanitizer rejected a legal action ' + JSON.stringify(rec));
    const res = E.applyAction(s, al.p, clean);
    if (!res.ok) throw new Error('engine rejected chosen action ' + JSON.stringify(rec) + ' (' + res.err + ') phase ' + s.phase);
    s.fx.length = 0;
    lists[seats[al.p]].push({ k, a: rec.a, args: rec.args });
    k++;
  }
  return { seed, uids, opts, lists, seats, state: s, steps: k };
}

module.exports = { E, makeRand, chooseAction, playGame };
