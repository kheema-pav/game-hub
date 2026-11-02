
'use strict';
/* ===== Bots: heuristic players ===== */
const Bot = (() => {
  const E = (typeof Engine !== 'undefined') ? Engine : require('./engine.js');
  const { RES, COST, PIPS } = E;
  const RW = { wood: 1.1, brick: 1.1, sheep: 0.9, wheat: 1.05, ore: 1.0 };
  /* Difficulty profiles.
     noise: randomness in placement choices · margin: how much better a trade must be for the bot
     leaderGap: won't trade with someone this close to winning · maxAccepts/maxDeclines: per turn, per bot
     mood: chance the bot just isn't trading this turn · bankSkip: chance to skip a useful bank trade */
  const LEVELS = {
    easy: { plan: false, noise: 6, margin: 0.2, leaderGap: 2, maxAccepts: 3, maxDeclines: 6, mood: 0.1, bankSkip: 0.45, knight: 0.1, leaderW: 1, robNoise: 5, rarity: false, offerRate: 0.5, needHelp: false },
    normal: { plan: false, noise: 0.7, margin: 0.7, leaderGap: 3, maxAccepts: 2, maxDeclines: 3, mood: 0.2, bankSkip: 0, knight: 0.25, leaderW: 1.5, robNoise: 0.5, rarity: false, offerRate: 0.6, needHelp: true },
    hard: { plan: true, noise: 0.1, margin: 1.1, leaderGap: 4, maxAccepts: 1, maxDeclines: 2, mood: 0.15, bankSkip: 0, knight: 0.35, leaderW: 2.5, robNoise: 0.2, rarity: true, offerRate: 0.7, needHelp: true },
  };
  function lv(s) { return LEVELS[s.level] || LEVELS.normal; }
  const rarityCache = new WeakMap();
  function rarity(s) {
    let r = rarityCache.get(s.board);
    if (r) return r;
    const tot = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    s.board.hexes.forEach(h => { if (h.number && h.terrain in tot) tot[h.terrain] += PIPS[h.number]; });
    const avg = RES.reduce((a, k) => a + tot[k], 0) / 5;
    r = {}; RES.forEach(k => { r[k] = Math.max(0.75, Math.min(1.4, Math.sqrt(avg / Math.max(1, tot[k])))); });
    rarityCache.set(s.board, r);
    return r;
  }

  function production(s, p) {
    const out = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, gold: 0 };
    s.vb.forEach((b, v) => {
      if (!b || b.p !== p) return;
      s.board.vertices[v].hexes.forEach(h => {
        const hx = s.board.hexes[h];
        if (!hx.number) return;
        const k = PIPS[hx.number] * (b.t === 'city' ? 2 : 1);
        if (hx.terrain in out) out[hx.terrain] += k;
      });
    });
    return out;
  }

  function vertexValue(s, p, v, prod) {
    prod = prod || production(s, p);
    const vx = s.board.vertices[v];
    let val = 0; const kinds = new Set();
    vx.hexes.forEach(h => {
      const hx = s.board.hexes[h];
      if (!hx.number) return;
      let pip = PIPS[hx.number];
      if (h === s.robber) pip *= 0.6;
      if (hx.terrain === 'gold') { val += pip * 1.35; kinds.add('gold'); return; }
      const have = prod[hx.terrain] || 0;
      val += pip * RW[hx.terrain] * (lv(s).rarity ? rarity(s)[hx.terrain] : 1) / (1 + have / 9);
      kinds.add(hx.terrain);
    });
    val += kinds.size * (lv(s).plan ? 1.0 : 0.7);
    if (lv(s).plan && s.phase === 'setup') {
      // early game: brick + wood to expand, wheat + ore for cities
      const have = new Set(Object.keys(prod).filter(k => prod[k] > 0));
      vx.hexes.forEach(h => { const t = s.board.hexes[h].terrain; if (s.board.hexes[h].number && !have.has(t) && RES.includes(t)) val += 0.9; });
    }
    if (vx.port) {
      if (vx.port === 'any') val += 1.2;
      else val += (prod[vx.port] || 0) >= 5 ? 2.2 : 0.6;
    }
    if (s.mode === 'seafarers') {
      const isl = E.islandOfVertex(s, v);
      if (isl !== null && isl !== s.board.home && !s.players[p].islands.includes(isl)) val += 7;
    }
    return val;
  }

  /* BFS from my network to the best open settlement spot. Returns {target, first:{e,kind}, dist, score} */
  function expansion(s, p, maxDist) {
    maxDist = maxDist || 4;
    const B = s.board;
    const kinds = s.mode === 'seafarers' ? ['road', 'ship'] : ['road'];
    const pl = s.players[p];
    const seen = new Map(); // key v|kind -> {dist, first}
    const q = [];
    const push = (v, kind, dist, first) => {
      const k = v + '|' + kind;
      if (seen.has(k)) return;
      seen.set(k, { dist, first }); q.push({ v, kind, dist, first });
    };
    // starting points
    s.vb.forEach((b, v) => { if (b && b.p === p) kinds.forEach(k => push(v, k, 0, null)); });
    s.eb.forEach((o, e) => {
      if (!o || o.p !== p) return;
      B.edges[e].v.forEach(v => { if (!s.vb[v] || s.vb[v].p === p) push(v, o.t, 0, null); });
    });
    let best = null;
    const prod = production(s, p);
    while (q.length) {
      const cur = q.shift();
      if (cur.dist > 0 && E.canSettle(s, p, cur.v, false) === false && !s.vb[cur.v] &&
        B.vertices[cur.v].land && !B.vertices[cur.v].adj.some(a => s.vb[a])) {
        // reachable but not yet connected: a candidate
        const val = vertexValue(s, p, cur.v, prod);
        const score = val / (0.8 + cur.dist * 0.55);
        if (!best || score > best.score) best = { target: cur.v, first: cur.first, dist: cur.dist, score, val };
      }
      if (cur.dist >= maxDist) continue;
      if (cur.dist > 0 && s.vb[cur.v] && s.vb[cur.v].p !== p) continue;
      for (const e of B.vertices[cur.v].e) {
        if (s.eb[e]) continue;
        const ed = B.edges[e];
        if (cur.kind === 'road' && !ed.land) continue;
        if (cur.kind === 'ship' && (!ed.sea || (s.pirate !== null && ed.hexes.includes(s.pirate)))) continue;
        if (cur.kind === 'road' && pl.pieces.road <= 0) continue;
        if (cur.kind === 'ship' && pl.pieces.ship <= 0) continue;
        const w = ed.v[0] === cur.v ? ed.v[1] : ed.v[0];
        push(w, cur.kind, cur.dist + 1, cur.first || { e, kind: cur.kind });
      }
    }
    return best;
  }

  function bestSettlement(s, p, setup) {
    const spots = E.validSettlements(s, p, setup);
    if (!spots.length) return null;
    const prod = production(s, p);
    let best = null, bv = -1e9;
    spots.forEach(v => { const val = vertexValue(s, p, v, prod) + Math.random() * lv(s).noise; if (val > bv) { bv = val; best = v; } });
    return best;
  }

  function goals(s, p) {
    const pl = s.players[p];
    const out = [];
    if (pl.pieces.city > 0 && E.validCities(s, p).length) out.push({ kind: 'city', w: lv(s).plan ? -0.6 : 0 });
    if (pl.pieces.settlement > 0 && E.validSettlements(s, p, false).length) out.push({ kind: 'settlement', w: 0 });
    else if (pl.pieces.settlement > 0) {
      const ex = expansion(s, p);
      if (ex) out.push({ kind: ex.first.kind, w: 0.5, ex });
    }
    if (s.deck.length) out.push({ kind: 'dev', w: lv(s).plan ? 1.7 : 1.2 });
    return out;
  }
  function missing(hand, cost) { return Object.keys(cost).reduce((a, r) => a + Math.max(0, cost[r] - hand[r]), 0); }
  function pickGoal(s, p) {
    const h = s.players[p].hand;
    const gs = goals(s, p);
    let best = null, bs = 1e9;
    gs.forEach(g => { const sc = missing(h, COST[g.kind]) + g.w; if (sc < bs) { bs = sc; best = g; } });
    return best;
  }
  function need(s, p, goal) {
    const h = s.players[p].hand, c = goal ? COST[goal.kind] : {};
    const out = {};
    RES.forEach(r => { out[r] = Math.max(0, (c[r] || 0) - h[r]); });
    return out;
  }

  // Value of a resource card to p right now
  function resValue(s, p, r, goal) {
    const h = s.players[p].hand;
    const c = goal ? COST[goal.kind] : {};
    let v = 1;
    if ((c[r] || 0) > h[r]) v += 1.2;
    if (h[r] === 0) v += 0.3;
    if (h[r] >= 4) v -= 0.4;
    const prod = production(s, p);
    v -= Math.min(0.5, (prod[r] || 0) / 20);
    return v;
  }

  function leader(s, exclude) {
    let best = null, bv = -1;
    s.players.forEach(pl => { if (pl.id === exclude) return; const v = E.publicVP(s, pl.id) + E.handCount(pl.hand) * 0.05; if (v > bv) { bv = v; best = pl.id; } });
    return best;
  }

  /* ---------- decisions ---------- */
  function setupStep(s, p) {
    if (s.setup.step === 'settlement') return E.doSetupSettlement(s, bestSettlement(s, p, true));
    const sv = s.setup.vertex;
    const opts = [];
    E.validRoads(s, p, sv).forEach(e => opts.push({ e, kind: 'road' }));
    if (s.mode === 'seafarers') E.validShips(s, p, sv).forEach(e => opts.push({ e, kind: 'ship' }));
    let best = opts[0], bv = -1e9;
    opts.forEach(o => {
      const ed = s.board.edges[o.e];
      const w = ed.v[0] === sv ? ed.v[1] : ed.v[0];
      let val = 0;
      s.board.vertices[w].adj.forEach(x => {
        if (x === sv || s.vb[x] || !s.board.vertices[x].land || s.board.vertices[x].adj.some(a => s.vb[a])) return;
        val = Math.max(val, vertexValue(s, p, x));
      });
      if (o.kind === 'ship') val *= 0.8;
      val += Math.random() * lv(s).noise;
      if (val > bv) { bv = val; best = o; }
    });
    return E.doSetupEdge(s, best.e, best.kind);
  }

  function discard(s, p) {
    const n = s.discardQ[0].n;
    const h = Object.assign({}, s.players[p].hand);
    const goal = pickGoal(s, p);
    const out = E.emptyHand();
    for (let i = 0; i < n; i++) {
      let best = null, bv = 1e9;
      RES.forEach(r => {
        if (h[r] - out[r] <= 0) return;
        const keep = goal ? (COST[goal.kind][r] || 0) : 0;
        const v = (h[r] - out[r] <= keep ? 3 : 0) - (h[r] - out[r]) * 0.3 + Math.random() * 0.1;
        if (v < bv) { bv = v; best = r; }
      });
      out[best]++;
    }
    return E.doDiscard(s, p, out);
  }

  function gold(s, p) {
    let n = Math.min(s.goldQ[0].n, RES.reduce((a, r) => a + s.bank[r], 0));
    const goal = pickGoal(s, p);
    const nd = need(s, p, goal);
    const picks = E.emptyHand();
    const prod = production(s, p);
    while (n > 0) {
      let r = RES.find(x => nd[x] > picks[x] && s.bank[x] > picks[x]);
      if (!r) r = RES.filter(x => s.bank[x] > picks[x]).sort((a, b) => (prod[a] - prod[b]) || (Math.random() - 0.5))[0];
      picks[r]++; n--;
    }
    return E.doGold(s, p, picks);
  }

  function robber(s, p) {
    const lead = leader(s, p);
    let best = null, bv = -1e9;
    E.robberTargets(s).forEach(id => {
      const h = s.board.hexes[id];
      let v = 0;
      if (h.terrain === 'sea') {
        h.e.forEach(e => { const o = s.eb[e]; if (o && o.t === 'ship') v += o.p === p ? -2 : 0.6; });
        v -= 0.5;
      } else {
        const pip = h.number ? PIPS[h.number] : 0;
        h.v.forEach(x => {
          const b = s.vb[x]; if (!b) return;
          const k = b.t === 'city' ? 2 : 1;
          if (b.p === p) v -= pip * k * 2.5;
          else v += pip * k * (b.p === lead ? lv(s).leaderW : 1) + (E.handCount(s.players[b.p].hand) > 0 ? 1 : 0);
        });
      }
      v += Math.random() * lv(s).robNoise;
      if (v > bv) { bv = v; best = id; }
    });
    return E.doMoveRobber(s, best);
  }
  function steal(s, p) {
    const c = s.stealFrom.slice().sort((a, b) => (E.publicVP(s, b) - E.publicVP(s, a)) || (E.handCount(s.players[b].hand) - E.handCount(s.players[a].hand)));
    return E.doSteal(s, c[0]);
  }

  function robberOnMe(s, p) {
    if (s.robber === null) return false;
    return s.board.hexes[s.robber].v.some(v => s.vb[v] && s.vb[v].p === p);
  }

  function tryDev(s, p, before) {
    if (s.devPlayed) return null;
    const pl = s.players[p];
    if (E.playableDev(s, p, 'knight')) {
      const armyChase = pl.knights + 1 >= 3 && s.army.p !== p && (s.army.p === null || pl.knights + 1 > s.army.size);
      if (robberOnMe(s, p) || armyChase || (!before && Math.random() < lv(s).knight)) return E.doPlayDev(s, 'knight');
    }
    if (before) return null;
    if (E.playableDev(s, p, 'mono')) {
      let best = null, bv = 0;
      RES.forEach(r => {
        const t = s.players.reduce((a, o) => {
          if (o.id === p) return a;
          const pr = production(s, o.id), tot = RES.reduce((x, k) => x + pr[k], 0) || 1;
          return a + E.handCount(o.hand) * pr[r] / tot;
        }, 0);
        if (t > bv) { bv = t; best = r; }
      });
      if (bv >= 3) return E.doPlayDev(s, 'mono', { res: best });
    }
    if (E.playableDev(s, p, 'plenty')) {
      const goal = pickGoal(s, p);
      if (goal) {
        const nd = need(s, p, goal);
        const tot = RES.reduce((a, r) => a + nd[r], 0);
        if (tot >= 1 && tot <= 2) {
          const picks = [];
          RES.forEach(r => { for (let i = 0; i < nd[r]; i++) picks.push(r); });
          while (picks.length < 2) picks.push(RES.slice().sort((a, b) => pl.hand[a] - pl.hand[b])[0]);
          if (picks.every(r => s.bank[r] >= picks.filter(x => x === r).length)) return E.doPlayDev(s, 'plenty', { res: picks });
        }
      }
    }
    if (E.playableDev(s, p, 'road') && pl.pieces.settlement > 0 && expansion(s, p)) return E.doPlayDev(s, 'road');
    return null;
  }

  function freeRoad(s, p) {
    const ex = expansion(s, p);
    if (ex && ex.first && E.buildSpots(s, p, ex.first.kind).includes(ex.first.e)) return E.doBuild(s, ex.first.kind, ex.first.e);
    const roads = E.validRoads(s, p);
    if (roads.length && s.players[p].pieces.road > 0) return E.doBuild(s, 'road', roads[Math.floor(Math.random() * roads.length)]);
    const ships = E.validShips(s, p);
    if (ships.length && s.players[p].pieces.ship > 0) return E.doBuild(s, 'ship', ships[Math.floor(Math.random() * ships.length)]);
    return E.doEndFreeRoads(s);
  }

  function bestCity(s, p) {
    const prod = production(s, p);
    let best = null, bv = -1;
    E.validCities(s, p).forEach(v => { const val = vertexValue(s, p, v, prod); if (val > bv) { bv = val; best = v; } });
    return best;
  }

  /* Would bot p accept: p receives `give`, pays `get`, from player `from`? Pure check, no side effects.
     Uses only public info about the other player (points), never their hand. */
  function judgeOffer(s, p, from, give, get) {
    const L = lv(s), me = s.players[p];
    if (!RES.every(r => (get[r] || 0) <= me.hand[r])) return { ok: false, why: 'no' };
    if (E.handCount(give) === 0 || E.handCount(get) === 0) return { ok: false, why: 'no' };
    if (E.publicVP(s, from) >= s.target - L.leaderGap) return { ok: false, why: 'leader' };
    const t = s.talk || { accepts: {}, declines: {} };
    if ((t.accepts[p] || 0) >= L.maxAccepts || (t.declines[p] || 0) >= L.maxDeclines) return { ok: false, why: 'done' };
    if (((s.turnNo * 37 + p * 11 + from * 5) % 100) / 100 < L.mood) return { ok: false, why: 'mood' };
    const goal = pickGoal(s, p);
    const c = goal ? COST[goal.kind] : {};
    const nd = need(s, p, goal);
    // must receive something it actually needs
    if (L.needHelp && !RES.some(r => (give[r] || 0) > 0 && nd[r] > 0)) return { ok: false, why: 'no' };
    // never gives away cards its current plan needs
    if (RES.some(r => (get[r] || 0) > 0 && me.hand[r] - get[r] < (c[r] || 0))) return { ok: false, why: 'no' };
    let gain = 0, loss = 0;
    RES.forEach(r => { gain += (give[r] || 0) * resValue(s, p, r, goal); loss += (get[r] || 0) * resValue(s, p, r, goal); });
    let margin = L.margin;
    // tougher with whoever is ahead of the bot
    if (E.publicVP(s, from) > E.publicVP(s, p)) margin += s.level === 'hard' ? 0.8 : 0.3;
    return { ok: gain > loss + margin, why: 'no' };
  }
  function considerOffer(s, p, from, give, get) { return judgeOffer(s, p, from, give, get).ok; }
  /* A real proposal: records the answer so bots tire of haggling. */
  function respond(s, p, from, give, get) {
    const j = judgeOffer(s, p, from, give, get);
    s.talk = s.talk || { accepts: {}, declines: {} };
    if (j.ok) s.talk.accepts[p] = (s.talk.accepts[p] || 0) + 1;
    else s.talk.declines[p] = (s.talk.declines[p] || 0) + 1;
    return j;
  }

  function mainStep(s, p) {
    const pl = s.players[p];
    s._botActions = (s._botActions || 0) + 1;
    if (s._botActions > 40) return E.doEndTurn(s);
    const d = tryDev(s, p, false); if (d) return d;
    // build what we can, best first
    if (E.canBuildKind(s, p, 'city')) return E.doBuild(s, 'city', bestCity(s, p));
    if (E.canBuildKind(s, p, 'settlement')) return E.doBuild(s, 'settlement', bestSettlement(s, p, false));
    const goal = pickGoal(s, p);
    const spotsOpen = E.validSettlements(s, p, false).length > 0;
    if (!spotsOpen && pl.pieces.settlement > 0) {
      const ex = expansion(s, p);
      if (ex && E.canAfford(s, p, ex.first.kind) && pl.pieces[ex.first.kind] > 0 && E.buildSpots(s, p, ex.first.kind).includes(ex.first.e)) {
        return E.doBuild(s, ex.first.kind, ex.first.e);
      }
    }
    if (goal && goal.kind === 'dev' && E.canAfford(s, p, 'dev') && s.deck.length) return E.doBuyDev(s);
    // bank trades toward the goal
    if (goal) {
      const c = COST[goal.kind];
      const nd = need(s, p, goal);
      const want = RES.filter(r => nd[r] > 0 && s.bank[r] > 0);
      if (want.length) {
        for (const r of RES) {
          const ratio = E.tradeRatio(s, p, r);
          const spare = pl.hand[r] - (c[r] || 0);
          if (spare >= ratio && !(lv(s).bankSkip && Math.random() < lv(s).bankSkip)) return E.doBankTrade(s, r, want[0]);
        }
        // propose a 1:1 to a human (once per turn)
        if (s.offerMade < 1) {
          const spare = RES.filter(r => pl.hand[r] - (c[r] || 0) >= 1).sort((a, b) => pl.hand[b] - pl.hand[a]);
          if (spare.length) {
            const humans = s.players.filter(o => !o.bot && o.id !== p && E.publicVP(s, o.id) < s.target - lv(s).leaderGap);
            if (humans.length) {
              const to = humans[Math.floor(Math.random() * humans.length)].id;
              const give = {}; give[spare[0]] = 1; const get = {}; get[want[0]] = 1;
              if (Math.random() < lv(s).offerRate) return E.doOffer(s, to, give, get);
              s.offerMade++;
            }
            // trade with another bot
            const g = {}; g[spare[0]] = 1; const w = {}; w[want[0]] = 1;
            s.offerMade++;
            const bots = s.players.filter(o => o.bot && o.id !== p);
            for (const o of bots) { if (respond(s, o.id, p, g, w).ok) return E.doTrade(s, o.id, g, w); }
          }
        }
      }
    }
    if (lv(s).plan) {
      // keep a road heading toward the next spot so settlements don't stall
      if (pl.pieces.settlement > 0 && E.validSettlements(s, p, false).length <= 1) {
        const ex = expansion(s, p);
        if (ex && ex.first && E.canAfford(s, p, ex.first.kind) && pl.pieces[ex.first.kind] > 0 && E.buildSpots(s, p, ex.first.kind).includes(ex.first.e)) {
          const h = pl.hand, c = COST[ex.first.kind];
          const spare = RES.every(r => h[r] - (c[r] || 0) >= 0) && (E.handCount(h) >= 6 || !E.validSettlements(s, p, false).length);
          if (spare) return E.doBuild(s, ex.first.kind, ex.first.e);
        }
      }
      // don't sit on more than 7 cards: dump surplus into the bank toward anything useful
      if (E.handCount(pl.hand) > 7) {
        const g2 = pickGoal(s, p), c2 = g2 ? COST[g2.kind] : {};
        const want2 = RES.filter(r => s.bank[r] > 0).sort((a, b) => ((c2[b] || 0) - pl.hand[b]) - ((c2[a] || 0) - pl.hand[a]));
        for (const r of RES) {
          const ratio = E.tradeRatio(s, p, r);
          if (pl.hand[r] - (c2[r] || 0) >= ratio && want2[0] && want2[0] !== r) return E.doBankTrade(s, r, want2[0]);
        }
      }
    }
    // Spend surplus on dev cards if rich
    if (E.handCount(pl.hand) >= 7 && E.canAfford(s, p, 'dev') && s.deck.length) return E.doBuyDev(s);
    if (E.handCount(pl.hand) >= 8 && spotsOpen === false) {
      const ex = expansion(s, p);
      if (ex && E.canAfford(s, p, ex.first.kind) && E.buildSpots(s, p, ex.first.kind).includes(ex.first.e)) return E.doBuild(s, ex.first.kind, ex.first.e);
    }
    s._botActions = 0;
    return E.doEndTurn(s);
  }

  function step(s) {
    const p = E.actor(s);
    switch (s.phase) {
      case 'setup': return setupStep(s, p);
      case 'discard': return discard(s, p);
      case 'gold': return gold(s, p);
      case 'robber': return robber(s, p);
      case 'steal': return steal(s, p);
      case 'roll': { const d = tryDev(s, p, true); if (d) return d; s._botActions = 0; return E.doRoll(s); }
      case 'main': return mainStep(s, p);
      case 'roadBuilding': return freeRoad(s, p);
      case 'offer': return E.doRespond(s, considerOffer(s, p, s.offer.from, s.offer.give, s.offer.get));
    }
    return { ok: false, err: 'idle' };
  }

  return { step, considerOffer, respond, vertexValue, expansion, production, LEVELS };
})();
