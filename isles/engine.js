
const Engine = (() => {
'use strict';
/* ===== Game engine: board generation, rules, state transitions ===== */
const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const RES_NAME = { wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore', gold: 'Gold' };
const TERRAIN_NAME = { wood: 'Forest', brick: 'Hills', sheep: 'Pasture', wheat: 'Fields', ore: 'Mountains', gold: 'Gold field', desert: 'Desert', sea: 'Sea' };
const COST = {
  road: { wood: 1, brick: 1 },
  ship: { wood: 1, sheep: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const DEV_NAME = { knight: 'Knight', road: 'Road Building', plenty: 'Year of Plenty', mono: 'Monopoly', vp: 'Victory Point' };
const BASE_NUMS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const SQ3 = Math.sqrt(3);
const AX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/* Deterministic generator: the state holder h ({rng: uint32}) is the game state itself (s.rng) or a stand-in
   during board generation. Without a numeric h.rng everything falls back to Math.random (local play). */
function mulberryNext(h) { // same mulberry32 as codex/index.html rng(); the uint32 state lives in h.rng
  const a = (h.rng + 0x6D2B79F5) | 0;
  h.rng = a >>> 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function rand(h) { return (h && typeof h.rng === 'number') ? mulberryNext(h) : Math.random(); }
function shuffle(a, h) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(h) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function emptyHand() { return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }; }
function handCount(h) { return RES.reduce((s, r) => s + (h[r] || 0), 0); }
function hasCost(h, c) { return Object.keys(c).every(r => (h[r] || 0) >= c[r]); }
function isLandT(t) { return t !== 'sea'; }
function repeat(arr, n) { const out = []; for (let i = 0; out.length < n; i++) out.push(arr[i % arr.length]); return out; }

/* ---------- Board ---------- */
function buildBoard(defs) {
  const hexes = [], vertices = [], edges = [];
  const vmap = new Map(), emap = new Map(), hmap = new Map();
  defs.forEach((d, i) => {
    const x = SQ3 * (d.q + d.r / 2), y = 1.5 * d.r;
    const h = { id: i, q: d.q, r: d.r, x, y, terrain: d.terrain, number: null, island: null, home: false, v: [], e: [], n: [] };
    hexes.push(h); hmap.set(d.q + ',' + d.r, i);
    for (let k = 0; k < 6; k++) {
      const ang = Math.PI / 180 * (60 * k - 30);
      const vx = x + Math.cos(ang), vy = y + Math.sin(ang);
      const key = Math.round(vx * 1000) + ',' + Math.round(vy * 1000);
      let vid = vmap.get(key);
      if (vid === undefined) {
        vid = vertices.length; vmap.set(key, vid);
        vertices.push({ id: vid, x: vx, y: vy, hexes: [], adj: [], e: [], port: null, land: false });
      }
      vertices[vid].hexes.push(i); h.v.push(vid);
    }
  });
  hexes.forEach(h => {
    for (let k = 0; k < 6; k++) {
      const a = h.v[k], b = h.v[(k + 1) % 6];
      const key = a < b ? a + '-' + b : b + '-' + a;
      let eid = emap.get(key);
      if (eid === undefined) {
        eid = edges.length; emap.set(key, eid);
        edges.push({ id: eid, v: [Math.min(a, b), Math.max(a, b)], hexes: [] });
        vertices[a].adj.push(b); vertices[b].adj.push(a);
        vertices[a].e.push(eid); vertices[b].e.push(eid);
      }
      edges[eid].hexes.push(h.id); h.e.push(eid);
    }
    h.n = AX_DIRS.map(([dq, dr]) => hmap.get((h.q + dq) + ',' + (h.r + dr))).filter(x => x !== undefined);
  });
  vertices.forEach(v => { v.land = v.hexes.some(i => isLandT(hexes[i].terrain)); });
  edges.forEach(e => {
    const a = vertices[e.v[0]], b = vertices[e.v[1]];
    e.x = (a.x + b.x) / 2; e.y = (a.y + b.y) / 2;
    e.land = e.hexes.some(i => isLandT(hexes[i].terrain));
    e.sea = e.hexes.length === 2 && e.hexes.some(i => hexes[i].terrain === 'sea');
  });
  // islands by flood fill
  let isl = 0;
  hexes.forEach(h => {
    if (!isLandT(h.terrain) || h.island !== null) return;
    const stack = [h.id]; h.island = isl;
    while (stack.length) {
      const c = hexes[stack.pop()];
      c.n.forEach(j => { const o = hexes[j]; if (isLandT(o.terrain) && o.island === null) { o.island = isl; stack.push(j); } });
    }
    isl++;
  });
  return { hexes, vertices, edges, ports: [], islands: isl, home: 0 };
}

function numbersOk(board) {
  const red = n => n === 6 || n === 8;
  return board.hexes.every(h => {
    if (!h.number) return true;
    return h.n.every(j => {
      const o = board.hexes[j];
      if (!o.number) return true;
      if (red(h.number) && red(o.number)) return false;
      if (o.number === h.number) return false;
      return true;
    });
  });
}
function assignNumbers(board, pool, h) {
  const land = board.hexes.filter(h => isLandT(h.terrain) && h.terrain !== 'desert');
  for (let t = 0; t < 2000; t++) {
    const p = shuffle(pool.slice(), h);
    land.forEach((h, i) => { h.number = p[i]; });
    if (numbersOk(board)) return;
  }
}

function placePorts(board, landPred, types, h) {
  const H = board.hexes;
  const cands = board.edges.filter(e => e.hexes.length === 2 &&
    e.hexes.some(i => landPred(H[i])) && e.hexes.some(i => H[i].terrain === 'sea'));
  const L = H.filter(landPred);
  const cx = L.reduce((s, h) => s + h.x, 0) / L.length, cy = L.reduce((s, h) => s + h.y, 0) / L.length;
  // Tie-safe: angles rounded to 1e-9 with the edge id as tie-break, and near-zero offsets snapped to +0
  // (so the +/-pi branch cut cannot flip between engines), so Safari and Chrome agree on the order.
  const snap = d => (Math.abs(d) < 1e-9 ? 0 : d);
  const ang = e => Math.round(Math.atan2(snap(e.y - cy), snap(e.x - cx)) * 1e9);
  cands.sort((a, b) => (ang(a) - ang(b)) || (a.id - b.id));
  const m = cands.length, n = types.length, off = Math.floor(rand(h) * m);
  const used = new Set(), chosen = [];
  for (let i = 0; i < n; i++) {
    const base = off + Math.round(i * m / n);
    for (const d of [0, 1, -1, 2, -2]) {
      const e = cands[((base + d) % m + m) % m];
      if (chosen.includes(e) || e.v.some(v => used.has(v) || board.vertices[v].adj.some(a => used.has(a)))) continue;
      chosen.push(e); e.v.forEach(v => used.add(v)); break;
    }
  }
  const ts = shuffle(types.slice(), h);
  chosen.forEach((e, i) => {
    const sea = e.hexes.find(j => H[j].terrain === 'sea');
    board.ports.push({ edge: e.id, type: ts[i], hex: sea, v: e.v.slice() });
    e.v.forEach(v => { board.vertices[v].port = ts[i]; });
  });
}

function genBase(h) {
  const defs = [];
  for (let r = -3; r <= 3; r++) for (let q = -3; q <= 3; q++) {
    const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (d <= 3) defs.push({ q, r, terrain: d <= 2 ? 'land' : 'sea' });
  }
  const terr = shuffle([
    'wood', 'wood', 'wood', 'wood', 'sheep', 'sheep', 'sheep', 'sheep', 'wheat', 'wheat', 'wheat', 'wheat',
    'brick', 'brick', 'brick', 'ore', 'ore', 'ore', 'desert'], h);
  let k = 0; defs.forEach(d => { if (d.terrain === 'land') d.terrain = terr[k++]; });
  const b = buildBoard(defs);
  b.home = 0; b.hexes.forEach(x => { x.home = isLandT(x.terrain); });
  assignNumbers(b, BASE_NUMS, h);
  placePorts(b, x => isLandT(x.terrain), ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'], h);
  return b;
}

/* Seafarers: a home island plus small islands across the water ("new shores"). odd-r offset rows. */
const SEA_TEMPLATES = [
  [
    '.........',
    '..aa...b.',
    '..a...bb.',
    '.........',
    '..MMMM...',
    '.MMMMM.c.',
    '.MMMMM.c.',
    '..MMM..c.',
    '.........',
    '.dd...ee.',
    '.........',
  ],
  [
    '.........',
    '.aaa..bb.',
    '.......b.',
    '.c.......',
    '.c.MMMM..',
    '.c.MMMMM.',
    '...MMMMM.',
    '....MMM..',
    '.........',
    '..dd..ee.',
    '.........',
  ],
];
function genSeafarers(h) {
  const tpl = SEA_TEMPLATES[Math.floor(rand(h) * SEA_TEMPLATES.length)];
  const flip = rand(h) < 0.5;
  const defs = [];
  tpl.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      let q = c - (r - (r & 1)) / 2;
      if (flip) q = -q - r; // mirror left-right in axial coordinates
      defs.push({ q, r, terrain: ch === '.' ? 'sea' : (ch === 'M' ? 'main' : 'isle') });
    }
  });
  const main = defs.filter(d => d.terrain === 'main');
  const isle = defs.filter(d => d.terrain === 'isle');
  const mainT = shuffle(['desert'].concat(repeat(shuffle(RES.slice(), h).concat(shuffle(RES.slice(), h)).concat(shuffle(RES.slice(), h)).concat(shuffle(RES.slice(), h)), main.length - 1)), h);
  main.forEach((d, i) => { d.terrain = mainT[i]; });
  const isleT = shuffle(['gold', 'gold'].concat(repeat(shuffle(['ore', 'wheat', 'sheep', 'wood', 'brick', 'ore', 'wheat', 'brick', 'wood', 'sheep'], h), isle.length - 2)), h);
  isle.forEach((d, i) => { d.terrain = isleT[i]; });
  const b = buildBoard(defs);
  // home island = the biggest one
  const sizes = Array(b.islands).fill(0);
  b.hexes.forEach(h => { if (h.island !== null) sizes[h.island]++; });
  b.home = sizes.indexOf(Math.max(...sizes));
  b.hexes.forEach(x => { x.home = x.island === b.home; });
  assignNumbers(b, BASE_NUMS.concat(shuffle([2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 3, 4, 5, 6, 8, 9, 10, 11], h)), h);
  placePorts(b, x => x.home, ['any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'], h);
  return b;
}

/* ---------- State ---------- */
function newGame(opts) {
  const mode = opts.mode === 'seafarers' ? 'seafarers' : 'base';
  // seeded: the generator state is carried in the game state as s.rng; unseeded: Math.random as before
  const gen = { rng: (typeof opts.seed === 'number' && isFinite(opts.seed)) ? opts.seed >>> 0 : null };
  const board = mode === 'seafarers' ? genSeafarers(gen) : genBase(gen);
  const n = opts.players.length;
  const players = opts.players.map((p, i) => ({
    id: i, name: p.name, color: p.color, bot: !!p.bot, hand: emptyHand(), dev: [], knights: 0,
    pieces: { road: 15, settlement: 5, city: 4, ship: mode === 'seafarers' ? 15 : 0 }, islands: [], bonusVP: 0,
  }));
  const desert = board.hexes.find(h => h.terrain === 'desert');
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let i = n - 1; i >= 0; i--) order.push(i);
  const deck = shuffle([].concat(Array(14).fill('knight'), Array(5).fill('vp'), Array(2).fill('road'), Array(2).fill('plenty'), Array(2).fill('mono')), gen);
  const s = {
    v: 1, mode, target: opts.target || (mode === 'seafarers' ? 13 : 10), friendly: !!opts.friendly, level: ['easy', 'normal', 'hard', 'expert'].includes(opts.level) ? opts.level : 'normal',
    board, players,
    vb: Array(board.vertices.length).fill(null),
    eb: Array(board.edges.length).fill(null),
    robber: desert ? desert.id : null, pirate: null,
    bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
    deck, current: 0, turnNo: 0,
    phase: 'setup', setup: { idx: 0, order, step: 'settlement', vertex: null },
    dice: null, log: [], fx: [],
    longest: { p: null, len: 0 }, army: { p: null, size: 0 },
    devPlayed: false, shipMoved: false, offerMade: 0, talk: { accepts: {}, declines: {} },
    discardQ: [], goldQ: [], after: null, stealFrom: [], freeRoads: 0, offer: null,
    winner: null, rollCounts: Array(13).fill(0),
  };
  if (gen.rng !== null) s.rng = gen.rng;
  log(s, 'New game. Place your first settlement and road.');
  return s;
}

function log(s, text, p) { s.log.push({ t: text, p: p === undefined ? null : p }); if (s.log.length > 250) s.log.shift(); }
function fx(s, e) { s.fx.push(e); }
function P(s, i) { return s.players[i]; }
function nm(s, i) { return s.players[i].name; }

function actor(s) {
  if (s.phase === 'discard') return s.discardQ[0].p;
  if (s.phase === 'gold') return s.goldQ[0].p;
  if (s.phase === 'offer') return s.offer.to;
  return s.current;
}

function publicVP(s, p) {
  let vp = 0;
  s.vb.forEach(b => { if (b && b.p === p) vp += b.t === 'city' ? 2 : 1; });
  if (s.longest.p === p) vp += 2;
  if (s.army.p === p) vp += 2;
  return vp + s.players[p].bonusVP;
}
function hiddenVP(s, p) { return s.players[p].dev.filter(d => d.type === 'vp').length; }
function totalVP(s, p) { return publicVP(s, p) + hiddenVP(s, p); }

function portsOf(s, p) {
  const set = new Set();
  s.vb.forEach((b, v) => { if (b && b.p === p && s.board.vertices[v].port) set.add(s.board.vertices[v].port); });
  return set;
}
function tradeRatio(s, p, r) {
  const ports = portsOf(s, p);
  if (ports.has(r)) return 2;
  if (ports.has('any')) return 3;
  return 4;
}

/* ---------- Placement rules ---------- */
function islandOfVertex(s, v) {
  for (const h of s.board.vertices[v].hexes) { const hx = s.board.hexes[h]; if (hx.island !== null) return hx.island; }
  return null;
}
function canSettle(s, p, v, setup) {
  const vx = s.board.vertices[v];
  if (!vx || !vx.land || s.vb[v]) return false;
  if (vx.adj.some(a => s.vb[a])) return false;
  if (setup) return vx.hexes.some(h => s.board.hexes[h].home);
  return vx.e.some(e => s.eb[e] && s.eb[e].p === p);
}
function connects(s, p, e, kind) {
  return s.board.edges[e].v.some(v => {
    const b = s.vb[v];
    if (b) return b.p === p;
    return s.board.vertices[v].e.some(x => x !== e && s.eb[x] && s.eb[x].p === p && s.eb[x].t === kind);
  });
}
function pirateAdj(s, e) { return s.pirate !== null && s.board.edges[e].hexes.includes(s.pirate); }
function canRoad(s, p, e, setupV) {
  const ed = s.board.edges[e];
  if (!ed || !ed.land || s.eb[e]) return false;
  if (setupV !== undefined && setupV !== null) return ed.v.includes(setupV);
  return connects(s, p, e, 'road');
}
function canShip(s, p, e, setupV) {
  if (s.mode !== 'seafarers') return false;
  const ed = s.board.edges[e];
  if (!ed || !ed.sea || s.eb[e] || pirateAdj(s, e)) return false;
  if (setupV !== undefined && setupV !== null) return ed.v.includes(setupV);
  return connects(s, p, e, 'ship');
}
function validSettlements(s, p, setup) { return s.board.vertices.filter(v => canSettle(s, p, v.id, setup)).map(v => v.id); }
function validCities(s, p) { return s.vb.map((b, v) => (b && b.p === p && b.t === 'settlement') ? v : -1).filter(v => v >= 0); }
function validRoads(s, p, setupV) { return s.board.edges.filter(e => canRoad(s, p, e.id, setupV)).map(e => e.id); }
function validShips(s, p, setupV) { return s.board.edges.filter(e => canShip(s, p, e.id, setupV)).map(e => e.id); }

function isOpenShip(s, p, e) {
  const o = s.eb[e];
  if (!o || o.p !== p || o.t !== 'ship') return false;
  return s.board.edges[e].v.some(v => {
    const b = s.vb[v];
    if (b && b.p === p) return false;
    return !s.board.vertices[v].e.some(x => x !== e && s.eb[x] && s.eb[x].p === p && s.eb[x].t === 'ship');
  });
}
function movableShips(s, p) {
  if (s.mode !== 'seafarers' || s.shipMoved || s.phase !== 'main' || s.current !== p) return [];
  return s.eb.map((o, e) => (o && o.p === p && o.t === 'ship' && o.turn !== s.turnNo && !pirateAdj(s, e) && isOpenShip(s, p, e)) ? e : -1).filter(e => e >= 0);
}
function shipTargets(s, p, from) {
  const saved = s.eb[from]; s.eb[from] = null;
  const out = validShips(s, p).filter(e => e !== from);
  s.eb[from] = saved;
  return out;
}

function robberTargets(s) {
  const out = [];
  s.board.hexes.forEach(h => {
    if (h.terrain === 'sea') { if (s.mode === 'seafarers' && h.id !== s.pirate) out.push(h.id); return; }
    if (h.id === s.robber) return;
    out.push(h.id);
  });
  if (!s.friendly) return out;
  const f = out.filter(id => {
    const h = s.board.hexes[id];
    if (h.terrain === 'sea') return true;
    return !h.v.some(v => s.vb[v] && s.vb[v].p !== s.current && publicVP(s, s.vb[v].p) <= 2);
  });
  return f.length ? f : out;
}
function victimsAt(s, hexId) {
  const h = s.board.hexes[hexId], set = new Set();
  if (h.terrain === 'sea') {
    h.e.forEach(e => { const o = s.eb[e]; if (o && o.t === 'ship' && o.p !== s.current) set.add(o.p); });
  } else {
    h.v.forEach(v => { const b = s.vb[v]; if (b && b.p !== s.current) set.add(b.p); });
  }
  return [...set].filter(p => handCount(s.players[p].hand) > 0 && !(s.friendly && publicVP(s, p) <= 2));
}

/* ---------- Longest road / largest army ---------- */
function roadLength(s, p) {
  const B = s.board;
  const mine = [];
  s.eb.forEach((o, e) => { if (o && o.p === p) mine.push(e); });
  if (!mine.length) return 0;
  const used = new Set();
  let best = 0;
  const ownB = v => s.vb[v] && s.vb[v].p === p;
  const blocked = v => s.vb[v] && s.vb[v].p !== p;
  function dfs(v, len, lastT, start) {
    if (len > best) best = len;
    if (!start && blocked(v)) return;
    for (const e of B.vertices[v].e) {
      const o = s.eb[e];
      if (!o || o.p !== p || used.has(e)) continue;
      if (lastT && o.t !== lastT && !ownB(v)) continue;
      used.add(e);
      const w = B.edges[e].v[0] === v ? B.edges[e].v[1] : B.edges[e].v[0];
      dfs(w, len + 1, o.t, false);
      used.delete(e);
    }
  }
  const starts = new Set();
  mine.forEach(e => B.edges[e].v.forEach(v => starts.add(v)));
  starts.forEach(v => dfs(v, 0, null, true));
  return best;
}
function updateLongest(s) {
  const lens = s.players.map(pl => roadLength(s, pl.id));
  const max = Math.max(...lens);
  const old = s.longest.p;
  let holder = old;
  if (max < 5) holder = null;
  else if (old !== null && lens[old] === max) holder = old;
  else {
    const top = lens.map((l, i) => l === max ? i : -1).filter(i => i >= 0);
    holder = top.length === 1 ? top[0] : null;
  }
  s.longest = { p: holder, len: holder === null ? max : lens[holder], lens };
  if (holder !== old) {
    if (holder !== null) { log(s, `${nm(s, holder)} takes Longest Road (${lens[holder]}).`, holder); fx(s, { type: 'award', what: 'Longest Road', p: holder }); }
    else if (old !== null) log(s, `${nm(s, old)} loses Longest Road.`, old);
  }
}
function updateArmy(s, p) {
  const k = s.players[p].knights;
  if (k >= 3 && (s.army.p === null ? true : (s.army.p !== p && k > s.army.size))) {
    s.army = { p, size: k };
    log(s, `${nm(s, p)} takes Largest Army (${k}).`, p); fx(s, { type: 'award', what: 'Largest Army', p });
  } else if (s.army.p === p) s.army.size = k;
}

function checkWin(s) {
  if (s.phase === 'setup' || s.phase === 'gameover') return;
  const p = s.current;
  if (totalVP(s, p) >= s.target) {
    s.phase = 'gameover'; s.winner = p;
    log(s, `${nm(s, p)} wins with ${totalVP(s, p)} points!`, p);
    fx(s, { type: 'win', p });
  }
}

/* ---------- Bank helpers ---------- */
function pay(s, p, cost) { const h = s.players[p].hand; for (const r in cost) { h[r] -= cost[r]; s.bank[r] += cost[r]; } }
function giveFromBank(s, p, r, n) { const k = Math.min(n, s.bank[r]); s.bank[r] -= k; s.players[p].hand[r] += k; return k; }

/* ---------- Placement ---------- */
function placeSettlement(s, p, v) {
  s.vb[v] = { p, t: 'settlement' };
  s.players[p].pieces.settlement--;
  if (s.mode === 'seafarers') {
    const isl = islandOfVertex(s, v);
    const pl = s.players[p];
    if (isl !== null && isl !== s.board.home && !pl.islands.includes(isl)) {
      pl.islands.push(isl); pl.bonusVP += 2;
      log(s, `${pl.name} settles a new island: +2 points!`, p);
      fx(s, { type: 'award', what: 'New island +2', p });
    }
  }
}

/* ---------- Actions ---------- */
function err(m) { return { ok: false, err: m }; }
const OK = { ok: true };

function doSetupSettlement(s, v) {
  if (s.phase !== 'setup' || s.setup.step !== 'settlement') return err('Not now');
  const p = s.current;
  if (!canSettle(s, p, v, true)) return err('You can’t build there');
  placeSettlement(s, p, v);
  fx(s, { type: 'build', kind: 'settlement', id: v, p });
  s.setup.vertex = v; s.setup.step = 'road';
  const n = s.players.length;
  if (s.setup.idx >= n) {
    let gold = 0; const got = [];
    s.board.vertices[v].hexes.forEach(h => {
      const t = s.board.hexes[h].terrain;
      if (RES.includes(t)) { if (giveFromBank(s, p, t, 1)) got.push(RES_NAME[t]); }
      else if (t === 'gold') gold++;
    });
    if (got.length) log(s, `${nm(s, p)} collects ${got.join(', ')}.`, p);
    if (gold) { s.goldQ = [{ p, n: gold }]; s.after = 'setup'; s.phase = 'gold'; }
  }
  log(s, `${nm(s, p)} placed a settlement.`, p);
  return OK;
}
function doSetupEdge(s, e, kind) {
  if (s.phase !== 'setup' || s.setup.step !== 'road') return err('Not now');
  const p = s.current, sv = s.setup.vertex;
  const ok = kind === 'ship' ? canShip(s, p, e, sv) : canRoad(s, p, e, sv);
  if (!ok) return err('You can’t build there');
  s.eb[e] = { p, t: kind, turn: s.turnNo };
  s.players[p].pieces[kind]--;
  fx(s, { type: 'build', kind, id: e, p });
  s.setup.idx++;
  if (s.setup.idx >= s.setup.order.length) {
    s.phase = 'roll'; s.current = s.setup.order[0]; s.turnNo = 1;
    s.setup.step = 'done';
    log(s, `Setup done. ${nm(s, s.current)} rolls first.`);
    fx(s, { type: 'turn', p: s.current });
  } else {
    s.current = s.setup.order[s.setup.idx];
    s.setup.step = 'settlement'; s.setup.vertex = null;
    fx(s, { type: 'turn', p: s.current });
  }
  return OK;
}

function doRoll(s, forced) {
  if (s.phase !== 'roll') return err('Not now');
  const d1 = forced ? forced[0] : 1 + Math.floor(rand(s) * 6);
  const d2 = forced ? forced[1] : 1 + Math.floor(rand(s) * 6);
  const sum = d1 + d2;
  s.dice = [d1, d2]; s.rollCounts[sum]++;
  log(s, `${nm(s, s.current)} rolled ${sum}.`, s.current);
  fx(s, { type: 'roll', dice: [d1, d2], p: s.current });
  if (sum === 7) {
    s.discardQ = [];
    const n = s.players.length;
    for (let k = 0; k < n; k++) {
      const p = (s.current + k) % n, c = handCount(s.players[p].hand);
      if (c > 7) s.discardQ.push({ p, n: Math.floor(c / 2) });
    }
    s.after = 'main';
    s.phase = s.discardQ.length ? 'discard' : 'robber';
  } else {
    produce(s, sum);
    s.after = 'main';
    s.phase = s.goldQ.length ? 'gold' : 'main';
  }
  return OK;
}

function produce(s, sum) {
  const demand = {}; RES.forEach(r => { demand[r] = {}; });
  const gold = {};
  const hexes = [];
  s.board.hexes.forEach(h => {
    if (h.number !== sum || h.id === s.robber || !isLandT(h.terrain)) return;
    hexes.push(h.id);
    h.v.forEach(v => {
      const b = s.vb[v]; if (!b) return;
      const amt = b.t === 'city' ? 2 : 1;
      if (h.terrain === 'gold') gold[b.p] = (gold[b.p] || 0) + amt;
      else if (RES.includes(h.terrain)) demand[h.terrain][b.p] = (demand[h.terrain][b.p] || 0) + amt;
    });
  });
  const gains = {};
  RES.forEach(r => {
    const rec = Object.keys(demand[r]);
    if (!rec.length) return;
    const total = rec.reduce((a, p) => a + demand[r][p], 0);
    if (total <= s.bank[r]) rec.forEach(p => { giveFromBank(s, +p, r, demand[r][p]); (gains[p] = gains[p] || {})[r] = demand[r][p]; });
    else if (rec.length === 1) { const k = giveFromBank(s, +rec[0], r, total); if (k) (gains[rec[0]] = gains[rec[0]] || {})[r] = k; }
    else log(s, `The bank is short on ${RES_NAME[r]}; nobody gets any.`);
  });
  Object.keys(gains).forEach(p => {
    const parts = Object.keys(gains[p]).map(r => `${gains[p][r]} ${RES_NAME[r]}`);
    log(s, `${nm(s, +p)} gets ${parts.join(', ')}.`, +p);
  });
  s.goldQ = [];
  const n = s.players.length;
  for (let k = 0; k < n; k++) { const p = (s.current + k) % n; if (gold[p]) s.goldQ.push({ p, n: gold[p] }); }
  if (!hexes.length) log(s, 'No one produces anything.');
  fx(s, { type: 'produce', hexes, gains, gold });
}

function doDiscard(s, p, cards) {
  if (s.phase !== 'discard' || s.discardQ[0].p !== p) return err('Not now');
  const need = s.discardQ[0].n;
  const h = s.players[p].hand;
  let tot = 0;
  for (const r of RES) { const k = cards[r] || 0; if (k < 0 || k > h[r]) return err('You don’t have those'); tot += k; }
  if (tot !== need) return err(`Discard exactly ${need}`);
  RES.forEach(r => { const k = cards[r] || 0; h[r] -= k; s.bank[r] += k; });
  log(s, `${nm(s, p)} discards ${need} cards.`, p);
  fx(s, { type: 'discard', p });
  s.discardQ.shift();
  if (!s.discardQ.length) s.phase = 'robber';
  return OK;
}

function doMoveRobber(s, hexId) {
  if (s.phase !== 'robber') return err('Not now');
  if (!robberTargets(s).includes(hexId)) return err('Pick another tile');
  const h = s.board.hexes[hexId];
  if (h.terrain === 'sea') { s.pirate = hexId; log(s, `${nm(s, s.current)} moves the pirate.`, s.current); }
  else { s.robber = hexId; log(s, `${nm(s, s.current)} moves the robber to a ${TERRAIN_NAME[h.terrain]}${h.number ? ' (' + h.number + ')' : ''}.`, s.current); }
  fx(s, { type: 'robber', hex: hexId, pirate: h.terrain === 'sea' });
  const vics = victimsAt(s, hexId);
  if (!vics.length) { s.phase = s.after; return OK; }
  if (vics.length === 1) return doSteal(s, vics[0], true);
  s.stealFrom = vics; s.phase = 'steal';
  return OK;
}
function doSteal(s, target, auto) {
  if (!auto && (s.phase !== 'steal' || !s.stealFrom.includes(target))) return err('Not now');
  const h = s.players[target].hand;
  const pool = [];
  RES.forEach(r => { for (let i = 0; i < h[r]; i++) pool.push(r); });
  if (pool.length) {
    const r = pool[Math.floor(rand(s) * pool.length)];
    h[r]--; s.players[s.current].hand[r]++;
    log(s, `${nm(s, s.current)} steals a card from ${nm(s, target)}.`, s.current);
    fx(s, { type: 'steal', from: target, to: s.current, res: r });
  }
  s.stealFrom = [];
  s.phase = s.after;
  checkWin(s);
  return OK;
}

function doGold(s, p, picks) {
  if (s.phase !== 'gold' || s.goldQ[0].p !== p) return err('Not now');
  const avail = RES.reduce((a, r) => a + s.bank[r], 0);
  const need = Math.min(s.goldQ[0].n, avail);
  let tot = 0;
  for (const r of RES) { const k = picks[r] || 0; if (k < 0 || k > s.bank[r]) return err('The bank is out of that'); tot += k; }
  if (tot !== need) return err(`Pick ${need}`);
  const parts = [];
  RES.forEach(r => { const k = picks[r] || 0; if (k) { giveFromBank(s, p, r, k); parts.push(`${k} ${RES_NAME[r]}`); } });
  if (parts.length) log(s, `${nm(s, p)} takes ${parts.join(', ')} from the gold field.`, p);
  s.goldQ.shift();
  if (!s.goldQ.length) s.phase = s.after;
  return OK;
}

function buildSpots(s, p, kind) {
  if (kind === 'settlement') return validSettlements(s, p, false);
  if (kind === 'city') return validCities(s, p);
  if (kind === 'road') return validRoads(s, p);
  if (kind === 'ship') return validShips(s, p);
  return [];
}
function canAfford(s, p, kind) { return hasCost(s.players[p].hand, COST[kind]); }
function canBuildKind(s, p, kind) {
  if (s.current !== p) return false;
  const free = s.phase === 'roadBuilding' && (kind === 'road' || kind === 'ship');
  if (!free && s.phase !== 'main') return false;
  if (kind === 'ship' && s.mode !== 'seafarers') return false;
  if (s.players[p].pieces[kind] <= 0) return false;
  if (!free && !canAfford(s, p, kind)) return false;
  return buildSpots(s, p, kind).length > 0;
}
function doBuild(s, kind, id) {
  const p = s.current;
  const free = s.phase === 'roadBuilding' && (kind === 'road' || kind === 'ship');
  if (!free && s.phase !== 'main') return err('Not now');
  if (s.players[p].pieces[kind] <= 0) return err('No pieces left');
  if (!free && !canAfford(s, p, kind)) return err('Not enough resources');
  if (!buildSpots(s, p, kind).includes(id)) return err('You can’t build there');
  if (!free) pay(s, p, COST[kind]);
  if (kind === 'settlement') placeSettlement(s, p, id);
  else if (kind === 'city') { s.vb[id] = { p, t: 'city' }; s.players[p].pieces.city--; s.players[p].pieces.settlement++; }
  else { s.eb[id] = { p, t: kind, turn: s.turnNo }; s.players[p].pieces[kind]--; }
  const label = { road: 'a road', ship: 'a ship', settlement: 'a settlement', city: 'a city' }[kind];
  log(s, `${nm(s, p)} builds ${label}.`, p);
  fx(s, { type: 'build', kind, id, p });
  if (kind !== 'city') updateLongest(s);
  if (free) {
    s.freeRoads--;
    if (s.freeRoads <= 0 || !freeBuildPossible(s, p)) { s.freeRoads = 0; s.phase = s.after; }
  }
  checkWin(s);
  return OK;
}
function freeBuildPossible(s, p) {
  const pl = s.players[p];
  return (pl.pieces.road > 0 && validRoads(s, p).length > 0) || (s.mode === 'seafarers' && pl.pieces.ship > 0 && validShips(s, p).length > 0);
}
function doEndFreeRoads(s) {
  if (s.phase !== 'roadBuilding') return err('Not now');
  s.freeRoads = 0; s.phase = s.after; return OK;
}

function doBuyDev(s) {
  const p = s.current;
  if (s.phase !== 'main') return err('Not now');
  if (!s.deck.length) return err('No development cards left');
  if (!canAfford(s, p, 'dev')) return err('Not enough resources');
  pay(s, p, COST.dev);
  const type = s.deck.pop();
  s.players[p].dev.push({ type, turn: s.turnNo });
  log(s, `${nm(s, p)} buys a development card.`, p);
  fx(s, { type: 'dev', p, card: type });
  checkWin(s);
  return OK;
}
function playableDev(s, p, type) {
  if (s.current !== p || s.devPlayed || type === 'vp') return false;
  if (s.phase !== 'roll' && s.phase !== 'main') return false;
  return s.players[p].dev.some(d => d.type === type && d.turn < s.turnNo);
}
function doPlayDev(s, type, args) {
  const p = s.current;
  if (!playableDev(s, p, type)) return err('You can’t play that now');
  args = args || {};
  const pl = s.players[p];
  if (type === 'plenty') {
    const rs = args.res || [];
    if (rs.length !== 2 || !rs.every(r => RES.includes(r))) return err('Pick two resources');
    const need = {}; rs.forEach(r => { need[r] = (need[r] || 0) + 1; });
    if (!Object.keys(need).every(r => s.bank[r] >= need[r])) return err('The bank is out of that');
  }
  if (type === 'mono' && !RES.includes(args.res)) return err('Pick a resource');
  const idx = pl.dev.findIndex(d => d.type === type && d.turn < s.turnNo);
  pl.dev.splice(idx, 1);
  s.devPlayed = true;
  log(s, `${pl.name} plays ${DEV_NAME[type]}.`, p);
  fx(s, { type: 'play', p, card: type });
  if (type === 'knight') {
    pl.knights++; updateArmy(s, p);
    s.after = s.phase; s.phase = 'robber';
  } else if (type === 'road') {
    s.after = s.phase;
    s.freeRoads = Math.min(2, pl.pieces.road + pl.pieces.ship);
    if (s.freeRoads > 0 && freeBuildPossible(s, p)) s.phase = 'roadBuilding';
    else s.freeRoads = 0;
  } else if (type === 'plenty') {
    args.res.forEach(r => giveFromBank(s, p, r, 1));
    log(s, `${pl.name} takes ${args.res.map(r => RES_NAME[r]).join(' and ')}.`, p);
  } else if (type === 'mono') {
    let total = 0;
    s.players.forEach(o => { if (o.id !== p) { total += o.hand[args.res]; pl.hand[args.res] += o.hand[args.res]; o.hand[args.res] = 0; } });
    log(s, `${pl.name} collects ${total} ${RES_NAME[args.res]} from everyone.`, p);
    fx(s, { type: 'mono', p, res: args.res, n: total });
  }
  checkWin(s);
  return OK;
}

function doBankTrade(s, give, get) {
  const p = s.current;
  if (s.phase !== 'main') return err('Not now');
  if (!RES.includes(give) || !RES.includes(get) || give === get) return err('Pick two different resources');
  const ratio = tradeRatio(s, p, give);
  if (s.players[p].hand[give] < ratio) return err(`You need ${ratio} ${RES_NAME[give]}`);
  if (s.bank[get] < 1) return err('The bank is out of that');
  s.players[p].hand[give] -= ratio; s.bank[give] += ratio;
  giveFromBank(s, p, get, 1);
  log(s, `${nm(s, p)} trades ${ratio} ${RES_NAME[give]} for 1 ${RES_NAME[get]}.`, p);
  fx(s, { type: 'bank', p });
  return OK;
}
function validTrade(s, a, b, give, get) {
  const ha = s.players[a].hand, hb = s.players[b].hand;
  if (handCount(give) === 0 || handCount(get) === 0) return false;
  return RES.every(r => (give[r] || 0) <= ha[r] && (get[r] || 0) <= hb[r]) && RES.every(r => !((give[r] || 0) && (get[r] || 0)));
}
function transfer(s, a, b, give, get) {
  const ha = s.players[a].hand, hb = s.players[b].hand;
  RES.forEach(r => { const g = give[r] || 0, t = get[r] || 0; ha[r] += t - g; hb[r] += g - t; });
}
function describe(c) { return RES.filter(r => c[r]).map(r => `${c[r]} ${RES_NAME[r]}`).join(', '); }
function doTrade(s, other, give, get) {
  const p = s.current;
  if (s.phase !== 'main' || other === p) return err('Not now');
  if (!validTrade(s, p, other, give, get)) return err('That trade isn’t possible');
  transfer(s, p, other, give, get);
  log(s, `${nm(s, p)} trades ${describe(give)} to ${nm(s, other)} for ${describe(get)}.`, p);
  fx(s, { type: 'trade', a: p, b: other });
  return OK;
}
const MAX_OFFERS = 5; // offers per turn (s.offerMade, reset by doEndTurn)
function cardsOk(c) { return !!c && typeof c === 'object' && RES.every(r => c[r] === undefined || (Number.isInteger(c[r]) && c[r] >= 0)); }
function doOffer(s, to, give, get) { // current player offers to one other player
  if (s.phase !== 'main') return err('Not now');
  if (!Number.isInteger(to) || to < 0 || to >= s.players.length || to === s.current) return err('Pick another player');
  if (s.offerMade >= MAX_OFFERS) return err('Too many offers this turn');
  if (!cardsOk(give) || !cardsOk(get)) return err('That trade isn’t possible');
  // only the offerer's cards are checked; the receiver may simply decline
  const ha = s.players[s.current].hand;
  if (handCount(give) === 0 || handCount(get) === 0 || !RES.every(r => (give[r] || 0) <= ha[r])) return err('That trade isn’t possible');
  s.offer = { from: s.current, to, give, get };
  s.offerMade++;
  s.phase = 'offer';
  return OK;
}
function doRespond(s, accept) {
  if (s.phase !== 'offer') return err('Not now');
  const o = s.offer;
  if (accept && validTrade(s, o.from, o.to, o.give, o.get)) {
    transfer(s, o.from, o.to, o.give, o.get);
    log(s, `${nm(s, o.to)} accepts ${nm(s, o.from)}’s trade.`, o.to);
    fx(s, { type: 'trade', a: o.from, b: o.to, offer: true });
  } else log(s, `${nm(s, o.to)} declines ${nm(s, o.from)}’s trade.`, o.to);
  s.offer = null; s.phase = 'main';
  return OK;
}
function withdrawOffer(s) { // the offerer cancels a pending offer (the caller makes sure only offer.from asks)
  if (s.phase !== 'offer' || !s.offer) return err('Not now');
  const o = s.offer;
  log(s, `${nm(s, o.from)} withdraws the offer to ${nm(s, o.to)}.`, o.from);
  s.offer = null; s.phase = 'main';
  return OK;
}

function doMoveShip(s, from, to) {
  const p = s.current;
  if (!movableShips(s, p).includes(from)) return err('That ship can’t move');
  if (!shipTargets(s, p, from).includes(to)) return err('It can’t sail there');
  const o = s.eb[from];
  s.eb[from] = null; s.eb[to] = { p, t: 'ship', turn: o.turn };
  s.shipMoved = true;
  log(s, `${nm(s, p)} moves a ship.`, p);
  fx(s, { type: 'build', kind: 'ship', id: to, p });
  updateLongest(s);
  checkWin(s);
  return OK;
}

function doEndTurn(s) {
  if (s.phase !== 'main') return err('Not now');
  s.current = (s.current + 1) % s.players.length;
  s.turnNo++;
  s.phase = 'roll'; s.devPlayed = false; s.shipMoved = false; s.offerMade = 0; s.talk = { accepts: {}, declines: {} };
  fx(s, { type: 'turn', p: s.current });
  checkWin(s);
  return OK;
}

/* ---------- Online replay: sanitizer, action map, deterministic replay ---------- */
/* A record is {k, a, args}: k = global step it applies at, a = action name, args = positional array.
   Nothing from a record is ever spread into an engine call: every action sanitises into fresh values
   and then calls the engine with explicit arguments. Failure paths (reject/throw) never touch s.rng. */
const COLOR_IDS = ['red', 'blue', 'orange', 'white', 'green', 'purple'];
const isInt = x => Number.isInteger(x);
const inRange = (x, n) => isInt(x) && x >= 0 && x < n;
const isRes = x => typeof x === 'string' && RES.includes(x);
function cleanCards(c) { // plain object, resource keys only, integers 0..19; returns a fresh map or null
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const out = {};
  for (const key of Object.keys(c)) {
    if (!RES.includes(key) || !isInt(c[key]) || c[key] < 0 || c[key] > 19) return null;
  }
  for (const r of RES) if (Object.prototype.hasOwnProperty.call(c, r)) out[r] = c[r];
  return out;
}
const BUILD_KINDS = ['road', 'ship', 'settlement', 'city'];
const DEV_PLAYABLE = ['knight', 'road', 'plenty', 'mono'];
/* Each entry: san(s, p, args) -> clean value (or null = reject), run(s, p, x) -> engine result. */
const ACTIONS = {
  setupSettlement: { san: (s, p, a) => a.length === 1 && inRange(a[0], s.board.vertices.length) ? { v: a[0] } : null,
    run: (s, p, x) => doSetupSettlement(s, x.v) },
  setupEdge: { san: (s, p, a) => a.length === 2 && inRange(a[0], s.board.edges.length) && (a[1] === 'road' || a[1] === 'ship') ? { e: a[0], kind: a[1] } : null,
    run: (s, p, x) => doSetupEdge(s, x.e, x.kind) },
  roll: { san: (s, p, a) => a.length === 0 ? {} : null, run: (s) => doRoll(s) },
  discard: { san: (s, p, a) => { if (a.length !== 1) return null; const c = cleanCards(a[0]); return c ? { c } : null; },
    run: (s, p, x) => doDiscard(s, p, x.c) },
  moveRobber: { san: (s, p, a) => a.length === 1 && inRange(a[0], s.board.hexes.length) ? { h: a[0] } : null,
    run: (s, p, x) => doMoveRobber(s, x.h) },
  steal: { san: (s, p, a) => a.length === 1 && inRange(a[0], s.players.length) && a[0] !== p ? { t: a[0] } : null,
    run: (s, p, x) => doSteal(s, x.t) },
  gold: { san: (s, p, a) => { if (a.length !== 1) return null; const c = cleanCards(a[0]); return c ? { c } : null; },
    run: (s, p, x) => doGold(s, p, x.c) },
  build: { san: (s, p, a) => {
      if (a.length !== 2 || !BUILD_KINDS.includes(a[0])) return null;
      const n = a[0] === 'road' || a[0] === 'ship' ? s.board.edges.length : s.board.vertices.length;
      return inRange(a[1], n) ? { kind: a[0], id: a[1] } : null; },
    run: (s, p, x) => doBuild(s, x.kind, x.id) },
  endFreeRoads: { san: (s, p, a) => a.length === 0 ? {} : null, run: (s) => doEndFreeRoads(s) },
  buyDev: { san: (s, p, a) => a.length === 0 ? {} : null, run: (s) => doBuyDev(s) },
  playDev: { san: (s, p, a) => {
      if (a.length < 1 || a.length > 2 || !DEV_PLAYABLE.includes(a[0])) return null;
      const type = a[0], o = a[1];
      if (o !== undefined && o !== null && (typeof o !== 'object' || Array.isArray(o))) return null;
      const ok = o ? Object.keys(o) : [];
      if (type === 'plenty' || type === 'mono' ? (ok.length !== 1 || ok[0] !== 'res') : ok.length) return null; // no unknown keys
      if (type === 'plenty') {
        if (!o || !Array.isArray(o.res) || o.res.length !== 2 || !isRes(o.res[0]) || !isRes(o.res[1])) return null;
        return { type, args: { res: [o.res[0], o.res[1]] } };
      }
      if (type === 'mono') return o && isRes(o.res) ? { type, args: { res: o.res } } : null;
      return { type, args: {} }; },
    run: (s, p, x) => doPlayDev(s, x.type, x.args) },
  bankTrade: { san: (s, p, a) => a.length === 2 && isRes(a[0]) && isRes(a[1]) ? { give: a[0], get: a[1] } : null,
    run: (s, p, x) => doBankTrade(s, x.give, x.get) },
  offer: { san: (s, p, a) => {
      if (a.length !== 3 || !inRange(a[0], s.players.length) || a[0] === p) return null;
      const give = cleanCards(a[1]), get = cleanCards(a[2]);
      return give && get ? { to: a[0], give, get } : null; },
    run: (s, p, x) => doOffer(s, x.to, x.give, x.get) },
  respond: { san: (s, p, a) => a.length === 1 && typeof a[0] === 'boolean' ? { accept: a[0] } : null,
    run: (s, p, x) => doRespond(s, x.accept) },
  withdrawOffer: { san: (s, p, a) => a.length === 0 ? {} : null, run: (s) => withdrawOffer(s) },
  moveShip: { san: (s, p, a) => a.length === 2 && inRange(a[0], s.board.edges.length) && inRange(a[1], s.board.edges.length) ? { from: a[0], to: a[1] } : null,
    run: (s, p, x) => doMoveShip(s, x.from, x.to) },
  endTurn: { san: (s, p, a) => a.length === 0 ? {} : null, run: (s) => doEndTurn(s) },
};
const ACTION_NAMES = Object.keys(ACTIONS);
function normArgs(rec) { return rec.args === undefined || rec.args === null ? [] : rec.args; }
/* sanitizeAction(s, p, rec) -> {a, x} (clean) or null. p = the author's seat. Pure: reads s, never changes it. */
function sanitizeAction(s, p, rec) {
  if (!rec || typeof rec !== 'object' || typeof rec.a !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, rec.a)) return null;
  const args = normArgs(rec);
  if (!Array.isArray(args)) return null;
  let x = null;
  try { x = ACTIONS[rec.a].san(s, p, args); } catch (e) { return null; }
  return x ? { a: rec.a, x } : null;
}
/* applyAction(s, p, clean) -> engine result {ok, err?}; exceptions become {ok:false}. */
function applyAction(s, p, clean) {
  try { const r = ACTIONS[clean.a].run(s, p, clean.x); return r && r.ok ? r : { ok: false, err: (r && r.err) || 'Not possible' }; }
  catch (e) { return { ok: false, err: 'Error' }; }
}

const SETUP_ACTS = { settlement: ['setupSettlement'], road: ['setupEdge'] };
/* allowedAt(s) -> [{p, acts, optional?}] in priority order: who may submit what at the current step. */
function allowedAt(s) {
  switch (s.phase) {
    case 'setup': return [{ p: s.current, acts: SETUP_ACTS[s.setup.step] || [] }];
    case 'roll': return [{ p: s.current, acts: ['roll', 'playDev'] }];
    case 'main': return [{ p: s.current, acts: ['build', 'buyDev', 'playDev', 'bankTrade', 'offer', 'moveShip', 'endTurn'] }];
    case 'roadBuilding': return [{ p: s.current, acts: ['build', 'endFreeRoads'] }];
    case 'robber': return [{ p: s.current, acts: ['moveRobber'] }];
    case 'steal': return [{ p: s.current, acts: ['steal'] }];
    case 'discard': return s.discardQ.length ? [{ p: s.discardQ[0].p, acts: ['discard'] }] : [];
    case 'gold': return s.goldQ.length ? [{ p: s.goldQ[0].p, acts: ['gold'] }] : [];
    case 'offer': return s.offer ? [{ p: s.offer.to, acts: ['respond'] }, { p: s.offer.from, acts: ['withdrawOffer'], optional: true }] : [];
    default: return []; // gameover
  }
}

/* replayCatan({seed, uids, opts, lists}) -> {state, k, seats, applied, stale, invalid, waitingFor, allowed}
   seed: uint32 for the room; uids: seated uids (any order); opts: {mode, target, friendly, players?: {uid: {name, color}}};
   lists: {uid: [record, ...]} each player's own append-only list. Seats = seeded shuffle of the sorted uids, drawn
   first from the same generator that newGame then continues. Pure and deterministic: no DOM, no clock, no Math.random.
   applied/stale/invalid: [{p: seat, idx: index in that player's list, ...}]; applied entries also carry
   a, k (step applied at) and fx (the effects that record emitted; state.fx is left empty). */
function replayCatan(input) {
  const seed = input && input.seed, uids = input && input.uids, opts = (input && input.opts) || {}, lists = (input && input.lists) || {};
  if (typeof seed !== 'number' || !isFinite(seed)) throw new Error('replayCatan: seed must be a number');
  if (!Array.isArray(uids) || uids.length < 2 || uids.length > 4 || new Set(uids).size !== uids.length || !uids.every(u => typeof u === 'string' && u)) throw new Error('replayCatan: need 2-4 distinct uid strings');
  const gen = { rng: seed >>> 0 };
  const seats = shuffle(uids.slice().sort(), gen);
  const pinfo = opts.players && typeof opts.players === 'object' ? opts.players : {};
  const used = [];
  const players = seats.map((uid, i) => {
    const info = Object.prototype.hasOwnProperty.call(pinfo, uid) && pinfo[uid] && typeof pinfo[uid] === 'object' ? pinfo[uid] : {};
    let name = typeof info.name === 'string' ? info.name.trim().slice(0, 24) : '';
    if (!name) name = 'Player ' + (i + 1);
    let color = COLOR_IDS.includes(info.color) && !used.includes(info.color) ? info.color : COLOR_IDS.find(c => !used.includes(c));
    used.push(color);
    return { name, color, bot: false };
  });
  const s = newGame({ mode: opts.mode, target: isInt(opts.target) && opts.target >= 5 && opts.target <= 20 ? opts.target : undefined, friendly: !!opts.friendly, seed: gen.rng, players });
  s.fx = [];
  const ptr = {}; seats.forEach(u => { ptr[u] = 0; });
  const applied = [], stale = [], invalid = [];
  let k = 0;
  for (;;) {
    const allowed = allowedAt(s);
    let pick = null;
    for (const al of allowed) {
      const uid = seats[al.p], list = lists[uid];
      if (!Array.isArray(list)) continue;
      for (let j = ptr[uid]; j < list.length; j++) {
        const r = list[j];
        if (r && typeof r === 'object' && r.k === k && typeof r.a === 'string' && al.acts.includes(r.a)) { pick = { p: al.p, uid, j, rec: r }; break; }
      }
      if (pick) break; // allowed is in priority order: the first player with a candidate wins
    }
    if (!pick) break;
    for (let j = ptr[pick.uid]; j < pick.j; j++) stale.push({ p: pick.p, idx: j });
    ptr[pick.uid] = pick.j + 1;
    const clean = sanitizeAction(s, pick.p, pick.rec);
    let res = clean ? applyAction(s, pick.p, clean) : { ok: false, err: 'Rejected' };
    const fxs = s.fx.splice(0);
    if (res.ok) { applied.push({ p: pick.p, idx: pick.j, a: pick.rec.a, k, fx: fxs }); k++; }
    else invalid.push({ p: pick.p, idx: pick.j, a: pick.rec.a, k, err: res.err });
  }
  // records that can never apply: skipped earlier (counted above) or carrying a step that has already passed
  seats.forEach((uid, p) => {
    const list = lists[uid]; if (!Array.isArray(list)) return;
    for (let j = ptr[uid]; j < list.length; j++) {
      const r = list[j];
      if (!r || typeof r !== 'object' || !isInt(r.k) || r.k < k) stale.push({ p, idx: j });
    }
  });
  const allowed = allowedAt(s);
  return { state: s, k, seats, applied, stale, invalid, allowed, waitingFor: allowed.filter(a => !a.optional).map(a => a.p) };
}

return {
  RES, RES_NAME, TERRAIN_NAME, COST, PIPS, DEV_NAME, shuffle, emptyHand, handCount, hasCost,
  newGame, actor, publicVP, hiddenVP, totalVP, tradeRatio, portsOf,
  canSettle, canRoad, canShip, validSettlements, validCities, validRoads, validShips, movableShips, shipTargets,
  robberTargets, victimsAt, roadLength, buildSpots, canAfford, canBuildKind, playableDev, validTrade, describe,
  islandOfVertex, freeBuildPossible,
  doSetupSettlement, doSetupEdge, doRoll, doDiscard, doMoveRobber, doSteal, doGold, doBuild, doEndFreeRoads,
  doBuyDev, doPlayDev, doBankTrade, doTrade, doOffer, doRespond, doMoveShip, doEndTurn,
  withdrawOffer, doWithdrawOffer: withdrawOffer, MAX_OFFERS,
  mulberryNext, rand, COLOR_IDS, ACTION_NAMES, sanitizeAction, applyAction, allowedAt, replayCatan,
};


})();
