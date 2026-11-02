
// ===== Splendor rules engine =====
const COLORS = ['w', 'u', 'g', 'r', 'k'];
const TOKENS = ['w', 'u', 'g', 'r', 'k', 'o'];
const GEM_NAME = { w: 'Diamond', u: 'Sapphire', g: 'Emerald', r: 'Ruby', k: 'Onyx', o: 'Gold' };
const WIN_POINTS = 15;
const TOKEN_LIMIT = 10;
const MAX_RESERVED = 3;
const ROUND_CAP = 150;

// level  bonus  prestige  cost: white blue green red black
const CARD_ROWS = `
1 k 0 1 1 1 1 0
1 k 0 1 2 1 1 0
1 k 0 2 2 0 1 0
1 k 0 0 0 1 3 1
1 k 0 0 0 2 1 0
1 k 0 2 0 2 0 0
1 k 0 0 0 3 0 0
1 k 1 0 4 0 0 0
1 u 0 1 0 1 1 1
1 u 0 1 0 1 2 1
1 u 0 1 0 2 2 0
1 u 0 0 1 3 1 0
1 u 0 1 0 0 0 2
1 u 0 0 0 2 0 2
1 u 0 0 0 0 0 3
1 u 1 0 0 0 4 0
1 w 0 0 1 1 1 1
1 w 0 0 1 2 1 1
1 w 0 0 2 2 0 1
1 w 0 3 1 0 0 1
1 w 0 0 0 0 2 1
1 w 0 0 2 0 0 2
1 w 0 0 3 0 0 0
1 w 1 0 0 4 0 0
1 g 0 1 1 0 1 1
1 g 0 1 1 0 1 2
1 g 0 0 1 0 2 2
1 g 0 1 3 1 0 0
1 g 0 2 1 0 0 0
1 g 0 0 2 0 2 0
1 g 0 0 0 0 3 0
1 g 1 0 0 0 0 4
1 r 0 1 1 1 0 1
1 r 0 2 1 1 0 1
1 r 0 2 0 1 0 2
1 r 0 1 0 0 1 3
1 r 0 0 2 1 0 0
1 r 0 2 0 0 2 0
1 r 0 3 0 0 0 0
1 r 1 4 0 0 0 0
2 k 1 3 2 2 0 0
2 k 1 3 0 3 0 2
2 k 2 0 1 4 2 0
2 k 2 0 0 5 3 0
2 k 2 5 0 0 0 0
2 k 3 0 0 0 0 6
2 u 1 0 2 2 3 0
2 u 1 0 2 3 0 3
2 u 2 5 3 0 0 0
2 u 2 2 0 0 1 4
2 u 2 0 5 0 0 0
2 u 3 0 6 0 0 0
2 w 1 0 0 3 2 2
2 w 1 2 3 0 3 0
2 w 2 0 0 1 4 2
2 w 2 0 0 0 5 3
2 w 2 0 0 0 5 0
2 w 3 6 0 0 0 0
2 g 1 3 0 2 3 0
2 g 1 2 3 0 0 2
2 g 2 4 2 0 0 1
2 g 2 0 5 3 0 0
2 g 2 0 0 5 0 0
2 g 3 0 0 6 0 0
2 r 1 2 0 0 2 3
2 r 1 0 3 0 2 3
2 r 2 1 4 2 0 0
2 r 2 3 0 0 0 5
2 r 2 0 0 0 0 5
2 r 3 0 0 0 6 0
3 k 3 3 3 5 3 0
3 k 4 0 0 0 7 0
3 k 4 0 0 3 6 3
3 k 5 0 0 0 7 3
3 u 3 3 0 3 3 5
3 u 4 7 0 0 0 0
3 u 4 6 3 0 0 3
3 u 5 7 3 0 0 0
3 w 3 0 3 3 5 3
3 w 4 0 0 0 0 7
3 w 4 3 0 0 3 6
3 w 5 3 0 0 0 7
3 g 3 5 3 0 3 3
3 g 4 0 7 0 0 0
3 g 4 3 6 3 0 0
3 g 5 0 7 3 0 0
3 r 3 3 5 3 0 3
3 r 4 0 0 7 0 0
3 r 4 0 3 6 3 0
3 r 5 0 0 7 3 0
`;

const CARDS = CARD_ROWS.trim().split('\n').map((line, id) => {
  const [lv, color, pts, w, u, g, r, k] = line.trim().split(/\s+/);
  return { id, level: +lv, color, points: +pts, cost: { w: +w, u: +u, g: +g, r: +r, k: +k } };
});

// Each noble is worth 3 prestige. Requirement: white blue green red black bonuses.
const NOBLES = [
  ['Anne of Brittany', '0 0 4 4 0'],
  ['Charles V', '0 0 0 4 4'],
  ['Francis I', '4 4 0 0 0'],
  ['Henry VIII', '4 0 0 0 4'],
  ['Isabella of Castile', '0 4 4 0 0'],
  ['Catherine de’ Medici', '3 0 0 3 3'],
  ['Elisabeth of Austria', '3 3 3 0 0'],
  ['Mary Stuart', '0 3 3 3 0'],
  ['Niccolò Machiavelli', '0 0 3 3 3'],
  ['Suleiman the Magnificent', '3 3 0 0 3'],
].map(([name, req], id) => {
  const [w, u, g, r, k] = req.split(' ').map(Number);
  return { id, name, req: { w, u, g, r, k } };
});

// `rnd` defaults to Math.random, so local play is unchanged. Online games pass the room's seeded generator.
function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Seeded generator (mulberry32), the same one Codex uses online, and a copying shuffle for the seat order.
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function sshuffle(arr, r) { return shuffle(arr.slice(), r); }
const emptyTokens = () => ({ w: 0, u: 0, g: 0, r: 0, k: 0, o: 0 });
const emptyBonus = () => ({ w: 0, u: 0, g: 0, r: 0, k: 0 });

function newGame(seats, rnd = Math.random) {
  const n = seats.length;
  const per = n === 2 ? 4 : n === 3 ? 5 : 7;
  const bank = { w: per, u: per, g: per, r: per, k: per, o: 5 };
  const decks = [1, 2, 3].map(lv => shuffle(CARDS.filter(c => c.level === lv).map(c => c.id), rnd));
  const market = decks.map(d => d.splice(0, 4));
  const nobles = shuffle(NOBLES.map(x => x.id), rnd).slice(0, n + 1);
  const players = seats.map(s => ({
    name: s.name, type: s.type, level: s.level || null,
    tokens: emptyTokens(), bonus: emptyBonus(), pts: 0, cards: [], reserved: [], nobles: [],
  }));
  return { players, bank, decks, market, nobles, cur: 0, round: 1, finalRound: false, over: false, passes: 0, log: [] };
}

function cloneState(s) {
  return {
    ...s,
    players: s.players.map(p => ({
      ...p, tokens: { ...p.tokens }, bonus: { ...p.bonus }, cards: p.cards.slice(),
      reserved: p.reserved.map(r => ({ ...r })), nobles: p.nobles.slice(),
    })),
    bank: { ...s.bank }, decks: s.decks.map(d => d.slice()), market: s.market.map(r => r.slice()),
    nobles: s.nobles.slice(), log: [],
  };
}

// cloneState empties the log (bots do not need it); the online replay keeps it.
function cloneFull(s) { const c = cloneState(s); c.log = s.log.slice(); return c; }

// The rules-relevant part of a state (no log, no UI-only fields such as seat type, uid or colour).
function engineOf(s) {
  return {
    players: s.players.map(p => ({ tokens: p.tokens, bonus: p.bonus, pts: p.pts, cards: p.cards, reserved: p.reserved, nobles: p.nobles })),
    bank: s.bank, decks: s.decks, market: s.market, nobles: s.nobles, cur: s.cur, round: s.round, finalRound: s.finalRound, over: s.over, passes: s.passes,
  };
}
const fingerprint = s => JSON.stringify(engineOf(s));

const tokenCount = p => TOKENS.reduce((n, c) => n + p.tokens[c], 0);

// Tokens a player hands over for a card: colored tokens first, gold covers the rest. null if unaffordable.
function payment(p, card) {
  const pay = emptyTokens();
  let gold = 0;
  for (const c of COLORS) {
    const need = Math.max(0, card.cost[c] - p.bonus[c]);
    const use = Math.min(need, p.tokens[c]);
    pay[c] = use;
    gold += need - use;
  }
  if (gold > p.tokens.o) return null;
  pay.o = gold;
  return pay;
}

function legalMoves(s, pi) {
  const p = s.players[pi];
  const moves = [];
  s.market.forEach((row, lv) => row.forEach((id, i) => {
    if (id != null && id >= 0 && payment(p, CARDS[id])) moves.push({ t: 'buy', lv, i });
  }));
  p.reserved.forEach((r, i) => {
    if (r.id >= 0 && payment(p, CARDS[r.id])) moves.push({ t: 'buyR', i });
  });
  const avail = COLORS.filter(c => s.bank[c] > 0);
  if (avail.length >= 3) {
    for (let a = 0; a < avail.length; a++)
      for (let b = a + 1; b < avail.length; b++)
        for (let c = b + 1; c < avail.length; c++) moves.push({ t: 'take', gems: [avail[a], avail[b], avail[c]] });
  } else if (avail.length) {
    moves.push({ t: 'take', gems: avail.slice() });
  }
  for (const c of COLORS) if (s.bank[c] >= 4) moves.push({ t: 'take2', c });
  if (p.reserved.length < MAX_RESERVED) {
    s.market.forEach((row, lv) => row.forEach((id, i) => {
      if (id != null && id >= 0) moves.push({ t: 'reserve', lv, i });
    }));
    s.decks.forEach((d, lv) => { if (d.length) moves.push({ t: 'reserveDeck', lv }); });
  }
  return moves;
}

function gainCard(p, id) {
  const c = CARDS[id];
  p.cards.push(id);
  p.bonus[c.color]++;
  p.pts += c.points;
}
function payFor(s, p, id) {
  const pay = payment(p, CARDS[id]);
  for (const c of TOKENS) { p.tokens[c] -= pay[c]; s.bank[c] += pay[c]; }
  gainCard(p, id);
  return pay;
}
const draw = (s, lv) => (s.decks[lv].length ? s.decks[lv].shift() : null);
function takeGold(s, p) {
  if (s.bank.o > 0) { s.bank.o--; p.tokens.o++; return true; }
  return false;
}

// Applies one action. Returns details the UI uses for the log.
function applyMove(s, pi, m) {
  const p = s.players[pi];
  s.passes = m.t === 'pass' ? s.passes + 1 : 0;
  switch (m.t) {
    case 'take':
      for (const c of m.gems) { s.bank[c]--; p.tokens[c]++; }
      return {};
    case 'take2':
      s.bank[m.c] -= 2; p.tokens[m.c] += 2;
      return {};
    case 'reserve': {
      const id = s.market[m.lv][m.i];
      p.reserved.push({ id, hidden: false });
      s.market[m.lv][m.i] = draw(s, m.lv);
      return { id, gold: takeGold(s, p) };
    }
    case 'reserveDeck': {
      const id = draw(s, m.lv);
      p.reserved.push({ id, hidden: true });
      return { id, gold: takeGold(s, p) };
    }
    case 'buy': {
      const id = s.market[m.lv][m.i];
      const pay = payFor(s, p, id);
      s.market[m.lv][m.i] = draw(s, m.lv);
      return { id, pay };
    }
    case 'buyR': {
      const id = p.reserved.splice(m.i, 1)[0].id;
      return { id, pay: payFor(s, p, id) };
    }
    default:
      return {};
  }
}

function eligibleNobles(s, p) {
  return s.nobles.filter(nid => COLORS.every(c => p.bonus[c] >= NOBLES[nid].req[c]));
}
function claimNoble(s, pi, nid) {
  const p = s.players[pi];
  s.nobles = s.nobles.filter(x => x !== nid);
  p.nobles.push(nid);
  p.pts += 3;
}

// Called once the active player has finished their action, discards and noble visit.
function endTurn(s) {
  const n = s.players.length;
  if (s.players[s.cur].pts >= WIN_POINTS) s.finalRound = true;
  s.cur = (s.cur + 1) % n;
  if (s.cur === 0) {
    if (s.finalRound) s.over = true;
    else s.round++;
  }
  if (s.passes >= n) s.over = true;
  if (s.round > ROUND_CAP) s.over = true;
}

// Most prestige wins; ties go to whoever bought the fewest development cards.
function standings(s) {
  const rows = s.players.map((p, i) => ({ i, pts: p.pts, cards: p.cards.length }));
  rows.sort((a, b) => b.pts - a.pts || a.cards - b.cards);
  const top = rows[0];
  rows.forEach(r => { r.winner = r.pts === top.pts && r.cards === top.cards; });
  return rows;
}

// ===== Bots =====

// What a bot is allowed to know: deck order and opponents' face-down reservations stay hidden.
function botView(s, pi) {
  const v = cloneState(s);
  v.decks = s.decks.map(d => d.map(() => -1));
  v.players.forEach((p, j) => {
    if (j !== pi) p.reserved = p.reserved.map(r => (r.hidden ? { id: -1, hidden: true } : r));
  });
  return v;
}

function knownCards(s, p) {
  const list = [];
  for (const row of s.market) for (const id of row) if (id != null && id >= 0) list.push(id);
  for (const r of p.reserved) if (r.id >= 0) list.push(r.id);
  return list;
}

// How much each color matters to this player right now (0..1).
function colorDemand(s, p) {
  const d = emptyBonus();
  for (const row of s.market) for (const id of row) {
    if (id == null || id < 0) continue;
    const card = CARDS[id];
    const w = 0.5 + card.points * 0.3;
    for (const c of COLORS) d[c] += Math.max(0, card.cost[c] - p.bonus[c]) * w;
  }
  for (const nid of s.nobles) {
    const n = NOBLES[nid];
    for (const c of COLORS) d[c] += Math.max(0, n.req[c] - p.bonus[c]) * 1.5;
  }
  const mx = Math.max(1, ...COLORS.map(c => d[c]));
  for (const c of COLORS) d[c] /= mx;
  return d;
}

// Rough number of gem-taking turns before the card can be bought.
function turnsToBuy(s, p, card) {
  const sh = {};
  for (const c of COLORS) sh[c] = Math.max(0, Math.max(0, card.cost[c] - p.bonus[c]) - p.tokens[c]);
  let gold = p.tokens.o;
  while (gold > 0) {
    let big = null;
    for (const c of COLORS) if (sh[c] > 0 && (!big || sh[c] > sh[big])) big = c;
    if (!big) break;
    sh[big]--; gold--;
  }
  let total = 0, mx = 0;
  for (const c of COLORS) { total += sh[c]; mx = Math.max(mx, sh[c]); }
  if (!total) return 0;
  let t = Math.max(Math.ceil(total / 3), Math.ceil(mx / 2));
  for (const c of COLORS) if (sh[c] > s.bank[c]) t += 2;
  if (tokenCount(p) + total > TOKEN_LIMIT) t += 1;
  return t;
}

const W = { bonus0: 0.8, bonusLate: 0.5, bonusDem: 0.3, tok: 0.06, tokDem: 0.08, gold: 0.18, decay: 0.6, pot1: 0.45, pot2: 0.2, pot3: 0.1, noble1: 0.5, noble2: 0.2, nobleDecay: 0.62, resPen: 0.25, blend: 0.55 };
function evaluate(s, pi, w = W) {
  const p = s.players[pi];
  const maxP = Math.max(...s.players.map(q => q.pts));
  const stage = Math.min(1, maxP / WIN_POINTS);
  let v = p.pts;
  if (p.pts >= WIN_POINTS) v += 30 + p.pts;
  const dem = colorDemand(s, p);
  const bonusBase = w.bonus0 - w.bonusLate * stage;
  for (const c of COLORS) v += p.bonus[c] * (bonusBase + w.bonusDem * dem[c]);
  for (const c of COLORS) v += p.tokens[c] * (w.tok + w.tokDem * dem[c]);
  v += p.tokens.o * w.gold;
  const nob = s.nobles.map(nid => {
    let d = 0;
    for (const c of COLORS) d += Math.max(0, NOBLES[nid].req[c] - p.bonus[c]);
    return 3 * Math.pow(w.nobleDecay, d);
  }).sort((a, b) => b - a);
  v += (nob[0] || 0) * w.noble1 + (nob[1] || 0) * w.noble2;
  const pot = knownCards(s, p).map(id => {
    const card = CARDS[id];
    const worth = card.points + bonusBase + w.bonusDem * dem[card.color];
    return worth * Math.pow(w.decay, turnsToBuy(s, p, card));
  }).sort((a, b) => b - a);
  v += w.pot1 * (pot[0] || 0) + w.pot2 * (pot[1] || 0) + w.pot3 * (pot[2] || 0);
  v -= w.resPen * p.reserved.length;
  return v;
}

// Tokens of each color the player's most reachable targets still call for.
function targetNeed(s, p) {
  const need = emptyBonus();
  const targets = knownCards(s, p)
    .map(id => ({ id, t: turnsToBuy(s, p, CARDS[id]) - CARDS[id].points * 0.3 }))
    .sort((a, b) => a.t - b.t).slice(0, 3);
  for (const { id } of targets)
    for (const c of COLORS) need[c] += Math.max(0, CARDS[id].cost[c] - p.bonus[c]);
  return need;
}

// Returns tokens until the player is back to the limit; keeps what their targets need.
function botDiscard(s, pi) {
  const p = s.players[pi];
  const returned = [];
  while (tokenCount(p) > TOKEN_LIMIT) {
    const need = targetNeed(s, p);
    let pick = null, best = Infinity;
    for (const c of COLORS) {
      if (!p.tokens[c]) continue;
      const score = need[c] - p.tokens[c];
      if (score < best) { best = score; pick = c; }
    }
    if (!pick) pick = 'o';
    p.tokens[pick]--; s.bank[pick]++;
    returned.push(pick);
  }
  return returned;
}

function simulate(s, pi, m) {
  const c = cloneState(s);
  applyMove(c, pi, m);
  botDiscard(c, pi);
  const el = eligibleNobles(c, c.players[pi]);
  if (el.length) claimNoble(c, pi, el[0]);
  return c;
}

// Biggest prestige jump each opponent could make on their very next turn.
function opponentThreat(s, pi) {
  let pen = 0;
  s.players.forEach((q, j) => {
    if (j === pi) return;
    let best = 0;
    for (const id of knownCards(s, q)) {
      const card = CARDS[id];
      if (!payment(q, card)) continue;
      let gain = card.points;
      q.bonus[card.color]++;
      if (eligibleNobles(s, q).length) gain += 3;
      q.bonus[card.color]--;
      best = Math.max(best, gain);
    }
    if (q.pts + best >= WIN_POINTS) pen += 8;
    else pen += 0.3 * best;
  });
  return pen;
}

function easyChoose(s, pi, moves) {
  const p = s.players[pi];
  const buys = moves.filter(m => m.t === 'buy' || m.t === 'buyR');
  if (buys.length && Math.random() < 0.75) {
    const pts = m => CARDS[m.t === 'buy' ? s.market[m.lv][m.i] : p.reserved[m.i].id].points;
    return buys.map(m => ({ m, v: pts(m) + Math.random() * 2 })).sort((a, b) => b.v - a.v)[0].m;
  }
  const takes = moves.filter(m => m.t === 'take' || m.t === 'take2');
  if (!takes.length || Math.random() < 0.08) return moves[Math.floor(Math.random() * moves.length)];
  // Chase one of the three cheapest cards on the table.
  const targets = knownCards(s, p).map(id => ({ id, t: turnsToBuy(s, p, CARDS[id]) + Math.random() }))
    .sort((a, b) => a.t - b.t).slice(0, 3);
  const target = targets.length ? CARDS[targets[Math.floor(Math.random() * targets.length)].id] : null;
  if (!target) return takes[Math.floor(Math.random() * takes.length)];
  const short = c => Math.max(0, target.cost[c] - p.bonus[c] - p.tokens[c]);
  const score = m => (m.t === 'take2' ? Math.min(2, short(m.c)) : m.gems.reduce((n, c) => n + (short(c) > 0 ? 1 : 0), 0)) + Math.random() * 0.9;
  return takes.map(m => ({ m, v: score(m) })).sort((a, b) => b.v - a.v)[0].m;
}

function botChoose(s, pi, w = W) {
  const level = s.players[pi].level;
  const view = botView(s, pi);
  const moves = legalMoves(view, pi);
  if (!moves.length) return { t: 'pass' };
  if (level === 'easy') return easyChoose(view, pi, moves);
  // Medium looks one move ahead with a little noise; Hard looks two of its own moves
  // ahead and avoids leaving an opponent a winning (or big) purchase.
  let best = moves[0], bestV = -Infinity;
  for (const m of moves) {
    const s1 = simulate(view, pi, m);
    let v = evaluate(s1, pi, w);
    if (level === 'hard') {
      if (s1.players[pi].pts < WIN_POINTS) {
        let b2 = -Infinity;
        for (const m2 of legalMoves(s1, pi)) b2 = Math.max(b2, evaluate(simulate(s1, pi, m2), pi, w));
        if (b2 > -Infinity) v = (1 - w.blend) * v + w.blend * b2;
      }
      v -= opponentThreat(s1, pi);
    } else {
      v += Math.random() * 0.35;
    }
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}
