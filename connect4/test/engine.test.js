'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const E = require('../engine');
const players = [{ name: 'Pat', color: '#f00', bot: false }, { name: 'Sam', color: '#ff0', bot: false }];
const create = seed => E.create({ seed: seed || 7, players, options: {} });
function play(columns) {
  let s = create();
  for (const c of columns) { const result = E.apply(s, E.actor(s), { type: 'drop', column: c }); assert.ok(result.ok, result.error); s = result.state; }
  return s;
}

test('create is seeded, serializable and does not mutate supplied players/options', () => {
  const config = { seed: 39, players, options: { unused: true } }, original = JSON.stringify(config);
  assert.deepEqual(E.create(config), E.create(config)); assert.equal(JSON.stringify(config), original);
  const s = E.create(config); s.players[0].name = 'Changed'; assert.equal(players[0].name, 'Pat');
  assert.equal(s.board.length, 6); assert.ok(s.board.every(row => row.length === 7 && row.every(c => c === null)));
  assert.deepEqual(E.legal(s, 0), Array.from({ length: 7 }, (_, column) => ({ type: 'drop', column })));
  assert.deepEqual(E.legal(s, 1), []); assert.throws(() => E.create({ players: [players[0]] }));
});

test('gravity and turn alternation; apply succeeds immutably', () => {
  const before = create(), text = JSON.stringify(before);
  const a = E.apply(before, 0, { type: 'drop', column: 2 }); assert.ok(a.ok);
  assert.notEqual(a.state, before); assert.equal(JSON.stringify(before), text);
  assert.equal(a.state.board[5][2], 0); assert.equal(E.actor(a.state), 1);
  const b = E.apply(a.state, 1, { type: 'drop', column: 2 }); assert.equal(b.state.board[4][2], 1);
  assert.equal(b.state.board[5][2], 0); assert.equal(b.state.moves, 2);
});

test('wrong player, malformed or full-column moves are rejected without mutation', () => {
  const s = create(), original = JSON.stringify(s);
  for (const [p, a] of [[1, { type: 'drop', column: 0 }], ['0', { type: 'drop', column: 0 }], [0, null], [0, []], [0, { type: 'drop', column: '1' }], [0, { type: 'drop', column: -1 }], [0, { type: 'drop', column: 7 }], [0, { type: 'drop', column: 1.1 }], [0, { type: 'win', column: 0 }]]) {
    const result = E.apply(s, p, a); assert.equal(result.ok, false); assert.equal(result.state, s); assert.equal(JSON.stringify(s), original);
  }
  const full = play([0, 0, 0, 0, 0, 0]), text = JSON.stringify(full);
  assert.equal(E.legal(full, 0).some(a => a.column === 0), false);
  assert.equal(E.apply(full, 0, { type: 'drop', column: 0 }).ok, false); assert.equal(JSON.stringify(full), text);
});

for (const [name, columns] of [
  ['horizontal', [0, 6, 1, 6, 2, 5, 3]],
  ['vertical', [0, 1, 0, 1, 0, 2, 0]],
  ['rising diagonal', [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3]],
  ['falling diagonal', [6, 5, 5, 4, 2, 4, 4, 3, 2, 3, 1, 3, 3]]
]) test(name + ' win, winners array and terminal moves', () => {
  const s = play(columns); assert.equal(s.over, true); assert.equal(s.winner, 0); assert.deepEqual(s.winners, [0]); assert.equal(s.scores[0], 1);
  assert.ok(s.winning.length >= 4); s.winning.forEach(([r, c]) => assert.equal(s.board[r][c], 0));
  assert.equal(E.actor(s), -1); assert.deepEqual(E.legal(s, 0), []); assert.equal(E.apply(s, 1, { type: 'drop', column: 4 }).ok, false);
});

test('the second seat can also win', () => {
  const s = play([6, 0, 6, 1, 5, 2, 5, 3]);
  assert.equal(s.over, true); assert.equal(s.winner, 1); assert.deepEqual(s.winners, [1]);
});

test('full board without four is a draw, with no winning seat', () => {
  const s = create();
  s.board = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => (Math.floor(c / 2) + r) % 2));
  s.board[0][2] = null; s.current = 1; s.moves = 41;
  const result = E.apply(s, 1, { type: 'drop', column: 2 }); assert.ok(result.ok);
  assert.equal(result.state.over, true); assert.equal(result.state.winner, null); assert.deepEqual(result.state.winners, []); assert.equal(result.state.winning.length, 0);
  assert.match(E.result(result.state), /draw/);
});

test('normal and hard bots take immediate wins and block immediate losses', () => {
  const winning = play([0, 6, 1, 6, 2, 5]);
  const threat = play([6, 0, 6, 1, 5, 2]);
  for (const level of ['normal', 'hard']) {
    assert.deepEqual(E.bot(winning, 0, level), { type: 'drop', column: 3 });
    assert.deepEqual(E.bot(threat, 0, level), { type: 'drop', column: 3 });
  }
});

test('all difficulty levels finish complete legal games without mutating bot inputs', () => {
  for (const level of ['easy', 'normal', 'hard']) for (const seed of [1, 31]) {
    let s = create(seed);
    for (let i = 0; i < 42 && !s.over; i++) {
      const original = JSON.stringify(s), player = E.actor(s), action = E.bot(s, player, level);
      assert.equal(JSON.stringify(s), original); assert.ok(E.legal(s, player).some(a => JSON.stringify(a) === JSON.stringify(action)));
      const result = E.apply(s, player, action); assert.ok(result.ok); s = result.state;
    }
    assert.equal(s.over, true, level + ' seed ' + seed); assert.ok(s.moves <= 42);
    assert.equal(E.bot(s, 0, level), null);
  }
});

test('engine never depends on Math.random, Date.now or environment time', () => {
  const random = Math.random, now = Date.now;
  Math.random = () => { throw new Error('unseeded random'); }; Date.now = () => { throw new Error('clock'); };
  try { const s = create(42); assert.deepEqual(E.bot(s, 0, 'hard'), E.bot(JSON.parse(JSON.stringify(s)), 0, 'hard')); }
  finally { Math.random = random; Date.now = now; }
});

test('browser view escapes names and submits only the current legal-action indices', () => {
  let registration;
  const context = { window: { HubEngines: { connect4: E } }, HubTabletop: { mount: c => { registration = c; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), context);
  const s = create(); s.players[0].name = '<img src=x onerror="alert(1)">';
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const html = registration.render(s, 0, E.legal(s, 0), { esc });
  assert.equal(html.includes('<img'), false); assert.ok(html.includes('&lt;img'));
  assert.equal((html.match(/data-move="\d"/g) || []).length, 7); assert.equal((html.match(/role="gridcell"/g) || []).length, 42);
  const waiting = registration.render(s, 1, [], { esc }); assert.equal(waiting.includes('data-move='), false);
});
