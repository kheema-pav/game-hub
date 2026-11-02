'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine');
const clone = x => JSON.parse(JSON.stringify(x));
const players = n => Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}`, color: ['red', 'blue', 'green', 'gold'][i], bot: true }));
const make = (n = 2, seed = 17) => E.create({ seed, players: players(n), options: {} });
function move(s, a, p = s.current) { const r = E.apply(s, p, a); assert.equal(r.ok, true, r.error); return r.state; }
function tiles(s) {
  return s.bag.length + s.discard.length + s.center.length + s.factories.reduce((n, a) => n + a.length, 0)
    + (s.pending ? s.pending.count : 0) + s.players.reduce((n, p) => n + p.lines.reduce((v, l) => v + l.count, 0)
      + p.floor.filter(c => c >= 0).length + p.wall.reduce((v, row) => v + row.filter(Boolean).length, 0), 0);
}
function colorCounts(s) {
  const counts = [0, 0, 0, 0, 0], add = a => a.forEach(c => { if (c >= 0) counts[c]++; });
  add(s.bag); add(s.discard); add(s.center); s.factories.forEach(add);
  if (s.pending) counts[s.pending.color] += s.pending.count;
  s.players.forEach(p => { add(p.floor); p.lines.forEach(l => { if (l.count) counts[l.color] += l.count; }); p.wall.forEach((row, r) => row.forEach((filled, c) => { if (filled) counts[E.colorAt(r, c)]++; })); });
  return counts;
}
function endFixture() {
  const s = make(); s.factories = s.factories.map(() => []); s.center = []; s.marker = false;
  s.current = 0; s.phase = 'place'; s.pending = { color: 4, count: 1, source: 0 };
  return s;
}
test('2/3/4 players receive 5/7/9 factories and exactly 100 coloured tiles', () => {
  for (const n of [2, 3, 4]) { const s = make(n); assert.equal(s.factories.length, 2 * n + 1); assert.ok(s.factories.every(a => a.length === 4)); assert.equal(tiles(s), 100); }
  for (const n of [0, 1, 5]) assert.throws(() => E.create({ players: players(n), seed: 1 }));
});
test('create preserves input; seed controls all randomness without Math.random', () => {
  const input = { seed: 123, players: players(4), options: {} }, before = clone(input), original = Math.random;
  Math.random = () => { throw new Error('Unseeded random'); };
  try { const a = E.create(input), b = E.create(input); assert.deepEqual(a, b); assert.deepEqual(input, before); assert.notDeepEqual(a.factories, make(4, 124).factories); }
  finally { Math.random = original; }
});
test('a factory draft takes all of the selected colour and sends every other colour to centre', () => {
  let s = make(); s.factories[0] = [0, 1, 0, 3]; s.center = [4];
  const before = clone(s); s = move(s, { type: 'draft', source: 0, color: 0 });
  assert.deepEqual(s.factories[0], []); assert.deepEqual(s.center, [4, 1, 3]); assert.equal(s.pending.count, 2);
  assert.equal(s.phase, 'place'); assert.equal(s.current, before.current); assert.equal(s.marker, true); assert.deepEqual(before.factories[0], [0, 1, 0, 3]);
});
test('first centre draft takes marker, changes next starter and incurs a floor space only once', () => {
  let s = make(); s.center = [0, 0, 1]; const who = s.current;
  s = move(s, { type: 'draft', source: -1, color: 0 });
  assert.equal(s.starter, who); assert.equal(s.marker, false); assert.deepEqual(s.players[who].floor, [-1]);
  s = move(s, { type: 'place', row: 1 }); const second = s.current;
  s = move(s, { type: 'draft', source: -1, color: 1 });
  assert.deepEqual(s.players[second].floor, []); assert.equal(s.starter, who);
});
test('pattern rules reject mixing colours, completed lines and colours already present on that wall row', () => {
  const s = make(), p = s.players[s.current]; s.phase = 'place'; s.pending = { color: 0, count: 2, source: 0 };
  p.lines[1] = { color: 1, count: 1 }; p.lines[2] = { color: 0, count: 3 }; p.wall[3][E.column(3, 0)] = true;
  assert.deepEqual(E.legal(s, s.current).map(a => a.row), [0, 4, -1]);
  for (const row of [1, 2, 3]) { const before = clone(s); assert.equal(E.apply(s, s.current, { type: 'place', row }).ok, false); assert.deepEqual(s, before); }
});
test('a draft fills one line only and overflow goes to floor; floor can be chosen voluntarily', () => {
  let s = make(); s.phase = 'place'; s.pending = { color: 2, count: 4, source: 0 }; const who = s.current;
  s = move(s, { type: 'place', row: 1 }); assert.deepEqual(s.players[who].lines[1], { color: 2, count: 2 }); assert.deepEqual(s.players[who].floor, [2, 2]);
  s = make(); s.phase = 'place'; s.pending = { color: 3, count: 3, source: 0 }; const actor = s.current;
  s = move(s, { type: 'place', row: -1 }); assert.deepEqual(s.players[actor].floor, [3, 3, 3]); assert.ok(s.players[actor].lines.every(l => l.count === 0));
});
test('floor caps at seven; further coloured tiles go to discard; full floor still takes starter ownership', () => {
  let s = make(); const who = s.current; s.players[who].floor = [0, 0, 0, 0, 0, 0, 0]; s.center = [1, 1];
  s = move(s, { type: 'draft', source: -1, color: 1 }); assert.equal(s.starter, who); assert.equal(s.players[who].floor.length, 7);
  const before = s.discard.length; s = move(s, { type: 'place', row: -1 }); assert.equal(s.discard.length, before + 2); assert.equal(s.players[who].floor.length, 7);
});
test('wall scoring counts isolated tiles, contiguous horizontal and vertical groups, and both directions', () => {
  const w = Array.from({ length: 5 }, () => Array(5).fill(false)); w[2][2] = true;
  assert.equal(E.placementPoints(w, 2, 2), 1); w[2][1] = true; w[2][3] = true;
  assert.equal(E.placementPoints(w, 2, 2), 3); w[1][2] = true; w[3][2] = true;
  assert.equal(E.placementPoints(w, 2, 2), 6); w[2][1] = false; w[2][3] = false;
  assert.equal(E.placementPoints(w, 2, 2), 3);
});
test('round scoring is top-to-bottom, preserves incomplete lines, discards surplus and returns starter marker', () => {
  let s = endFixture();
  s.players[0].lines[0] = { color: 0, count: 1 }; // row 0 col 0
  s.players[0].lines[1] = { color: 4, count: 2 }; // row 1 col 0, touches previous placement
  s.players[0].lines[3] = { color: 2, count: 2 }; // partial survives
  s.players[0].floor = [-1]; s.starter = 0;
  s = move(s, { type: 'place', row: -1 });
  assert.equal(s.lastRound[0].gained, 3); assert.equal(s.lastRound[0].penalty, 2); assert.equal(s.players[0].score, 1);
  assert.equal(s.players[0].wall[0][0], true); assert.equal(s.players[0].wall[1][0], true);
  assert.deepEqual(s.players[0].lines[1], { color: null, count: 0 }); assert.deepEqual(s.players[0].lines[3], { color: 2, count: 2 });
  assert.deepEqual(s.players[0].floor, []); assert.equal(s.marker, true); assert.equal(s.current, 0); assert.equal(s.round, 2);
});
test('floor penalties are exact and never make score negative', () => {
  let s = endFixture(); s.players[0].score = 3; s.players[0].floor = [0, 0, 0, 0, 0, 0];
  s = move(s, { type: 'place', row: -1 }); assert.equal(s.lastRound[0].penalty, 14); assert.equal(s.players[0].score, 0);
});
test('refill draws from discard mid-factory and handles a partially filled final factory', () => {
  let s = endFixture(); s.bag = [0, 1]; s.discard = [2, 3, 4];
  s = move(s, { type: 'place', row: -1 });
  assert.equal(s.factories.flat().length, 6); assert.equal(s.factories[0].length, 4); assert.equal(s.factories[1].length, 2); assert.ok(s.factories.slice(2).every(f => f.length === 0));
});
test('end bonuses are 2 per row, 7 per column and 10 per completed colour', () => {
  const p = make().players[0]; p.wall = Array.from({ length: 5 }, () => Array(5).fill(true));
  assert.deepEqual(E.bonuses(p), { rows: 5, columns: 5, colors: 5, points: 95 });
});
test('game ends after round scoring, adds bonuses once, uses rows to break score ties and otherwise shares victory', () => {
  let s = endFixture(); s.players[0].wall[0].fill(true); s.players[1].wall[0].fill(true); s.players[1].wall[1].fill(true);
  s.players[0].score = 49; s.players[1].score = 46;
  s = move(s, { type: 'place', row: -1 }); assert.equal(s.over, true); assert.deepEqual(s.scores, [50, 50]); assert.equal(s.winner, 1); assert.deepEqual(s.winners, [1]);
  assert.deepEqual(E.legal(s, 1), []); assert.equal(E.apply(s, 1, { type: 'place', row: -1 }).ok, false);
  s = endFixture(); s.players[0].wall[0].fill(true); s.players[1].wall[0].fill(true); s.players[0].score = 49; s.players[1].score = 48;
  s = move(s, { type: 'place', row: -1 }); assert.deepEqual(s.winners, [0, 1]); assert.equal(s.winner, null);
});
test('wrong authors and forged source/colour/row/extra fields are rejected without mutation', () => {
  const s = make(), a = E.legal(s, s.current)[0], before = clone(s);
  for (const [p, action] of [[(s.current + 1) % 2, a], [s.current, null], [s.current, { ...a, source: 99 }], [s.current, { ...a, color: '0' }], [s.current, { ...a, count: 100 }], [s.current, { type: 'place', row: 0 }]]) {
    assert.equal(E.apply(s, p, action).ok, false); assert.deepEqual(s, before);
  }
});
test('full bot games finish for every player count and skill, preserving every tile and replaying exactly', () => {
  for (const n of [2, 3, 4]) for (const level of ['easy', 'normal', 'hard', 'expert']) for (const seed of [1, 17, 941]) {
    let s = make(n, seed), replay = make(n, seed), steps = 0;
    while (!s.over && steps < 6000) {
      assert.equal(tiles(s), 100, `${n}p ${level} seed ${seed} step ${steps}`);
      assert.deepEqual(colorCounts(s), [20, 20, 20, 20, 20]);
      const p = E.actor(s), a = E.bot(s, p, level), before = JSON.stringify(s);
      assert.ok(a, 'bot has a legal move'); const r = E.apply(s, p, a); assert.equal(r.ok, true); assert.equal(JSON.stringify(s), before);
      s = r.state; replay = move(replay, a, p); steps++;
    }
    assert.equal(s.over, true, `${n}p ${level} seed ${seed} did not finish after ${steps} actions`);
    assert.ok(s.winners.length >= 1); assert.equal(tiles(s), 100); assert.deepEqual(s, replay);
  }
});
test('expert denies a valuable public completion instead of taking an equivalent colour', () => {
  const s = make(); s.current = 0; s.factories = [[1], [0], [], [], []]; s.center = [];
  s.players[1].lines[2] = { color: 0, count: 2 };
  s.players[1].wall[2] = [false, true, false, true, false];
  assert.deepEqual(E.bot(s, 0, 'normal'), { type: 'draft', source: 0, color: 1 });
  assert.deepEqual(E.bot(s, 0, 'expert'), { type: 'draft', source: 1, color: 0 });
});
test('expert avoids ending the game behind when another useful placement is available', () => {
  const s = make(); s.current = 0; s.phase = 'place'; s.pending = { color: 4, count: 1, source: 0 };
  s.players[0].wall[0] = [true, true, true, true, false];
  s.players[0].lines[1] = { color: 4, count: 1 }; s.players[1].score = 30;
  assert.deepEqual(E.bot(s, 0, 'normal'), { type: 'place', row: 0 });
  assert.deepEqual(E.bot(s, 0, 'expert'), { type: 'place', row: 1 });
  s.players[1].wall[4].fill(true);
  assert.deepEqual(E.bot(s, 0, 'expert'), { type: 'place', row: 0 }, 'take the points when an opponent already ends the game');
});
test('expert uses public supply only and is deterministic without mutating input', () => {
  let s = make(3, 18);
  for (let step = 0; step < 24 && !s.over; step++) {
    const before = JSON.stringify(s), other = clone(s), p = E.actor(s);
    other.bag.reverse(); other.discard.reverse(); other.rng ^= 0x12345678;
    const action = E.bot(s, p, 'expert');
    assert.deepEqual(E.bot(other, p, 'expert'), action);
    assert.deepEqual(E.bot(s, p, 'expert'), action);
    assert.equal(JSON.stringify(s), before);
    s = move(s, action);
  }
});
test('renderer exposes only current legal choices and escapes names in headings, prompts and labels', () => {
  const fs = require('node:fs'), vm = require('node:vm'); let renderer;
  vm.runInNewContext(fs.readFileSync(require.resolve('./game.js'), 'utf8'), {
    window: { HubEngines: { azul: E } }, HubTabletop: { mount(config) { renderer = config; } },
  });
  let s = make(), who = s.current; s.players[who].name = '<img src=x onerror="attack()">';
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function check(state, available) {
    const html = renderer.render(state, who, available, { esc }); assert.ok(!html.includes('<img'));
    const indices = [...html.matchAll(/data-move="(\d+)"/g)].map(m => Number(m[1])).sort((a, b) => a - b);
    assert.deepEqual(indices, available.map((_, i) => i));
  }
  const actions = E.legal(s, who); check(s, actions); check(s, []);
  s = move(s, actions[0]); check(s, E.legal(s, who));
});

test('placement previews explain legal fits and overflow without changing moves or state', () => {
  const fs = require('node:fs'), vm = require('node:vm'); let renderer;
  vm.runInNewContext(fs.readFileSync(require.resolve('./game.js'), 'utf8'), {
    window: { HubEngines: { azul: E } }, HubTabletop: { mount(config) { renderer = config; } },
  });
  const s = make(), who = s.current;
  s.phase = 'place'; s.pending = { color: 0, count: 3, source: 0 };
  const p = s.players[who];
  p.lines[1] = { color: 1, count: 1 }; // Cannot mix colours.
  p.wall[3][E.column(3, 0)] = true; // Blue already present on this wall row.
  const before = JSON.stringify(s), actions = E.legal(s, who);
  const html = renderer.render(s, who, actions, { esc: String });
  assert.equal(renderer.privateInformation, false);
  assert.match(html, /az-play az-placing/);
  assert.match(html, /3 blue tiles in your hand/);
  assert.match(html, /Complete · 2 to floor/);
  assert.match(html, /Complete · no spill/);
  assert.match(html, /Different colour/);
  assert.match(html, /Already on wall/);
  assert.equal([...html.matchAll(/az-preview/g)].length, 7, 'one + three + three previews for the three legal lines');
  assert.equal([...html.matchAll(/data-move="/g)].length, actions.length, 'previews never introduce an illegal action');
  assert.equal(JSON.stringify(s), before);
});
