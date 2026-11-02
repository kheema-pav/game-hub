'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine');
const copy = value => JSON.parse(JSON.stringify(value));
const players = n => Array.from({ length: n }, (_, i) => ({ name: 'Player ' + (i + 1), bot: i > 0 }));
const create = (seed = 12345, n = 2) => E.create({ seed, players: players(n), options: {} });
const move = (s, action) => { const r = E.apply(s, E.actor(s), action); assert.equal(r.ok, true, r.error); return r.state; };
function rolled(dice, rolls = 1) { const s = create(); s.dice = dice; s.rolls = rolls; return s; }

test('category scoring handles upper faces, sets, duplicate straights and true full houses', () => {
  for (let face = 1; face <= 6; face++) assert.equal(E.rawScore([face, face, face, face, face], E.categories[face - 1].id), face * 5);
  assert.equal(E.rawScore([2, 2, 2, 3, 6], 'three'), 15);
  assert.equal(E.rawScore([2, 2, 3, 3, 6], 'three'), 0);
  assert.equal(E.rawScore([4, 4, 4, 4, 6], 'four'), 22);
  assert.equal(E.rawScore([4, 4, 4, 5, 6], 'four'), 0);
  assert.equal(E.rawScore([2, 2, 3, 3, 3], 'full'), 25);
  assert.equal(E.rawScore([3, 3, 3, 3, 3], 'full'), 0);
  assert.equal(E.rawScore([1, 2, 2, 3, 4], 'small'), 30);
  assert.equal(E.rawScore([2, 3, 4, 5, 5], 'small'), 30);
  assert.equal(E.rawScore([3, 4, 5, 6, 6], 'small'), 30);
  assert.equal(E.rawScore([1, 2, 3, 5, 6], 'small'), 0);
  assert.equal(E.rawScore([1, 2, 3, 4, 5], 'large'), 40);
  assert.equal(E.rawScore([2, 3, 4, 5, 6], 'large'), 40);
  assert.equal(E.rawScore([1, 2, 3, 4, 4], 'large'), 0);
  assert.equal(E.rawScore([6, 6, 6, 6, 6], 'yahtzee'), 50);
  assert.equal(E.rawScore([1, 2, 3, 4, 6], 'yahtzee'), 0);
  assert.equal(E.rawScore([1, 2, 3, 4, 6], 'chance'), 16);
});

test('initial roll must roll all dice, only three rolls are allowed, and kept dice survive', () => {
  let s = create();
  assert.deepEqual(E.legal(s, 0), [{ type: 'roll', keep: 0 }]);
  s = move(s, { type: 'roll', keep: 0 });
  const before = s.dice.slice();
  s = move(s, { type: 'roll', keep: 21 });
  for (const i of [0, 2, 4]) assert.equal(s.dice[i], before[i]);
  assert.equal(s.rolls, 2); assert.equal(s.lastKeep, 21);
  s = move(s, { type: 'roll', keep: 10 }); // previously kept dice may be released
  assert.equal(s.rolls, 3); assert.ok(E.legal(s, 0).every(a => a.type === 'score'));
  const next = move(s, { type: 'score', category: 'chance' });
  assert.equal(next.current, 1); assert.equal(next.rolls, 0); assert.equal(next.turn, 2); assert.deepEqual(next.dice, [0, 0, 0, 0, 0]);
});

test('upper bonus is awarded once at 63, and totals include additional Yahtzee bonuses', () => {
  const p = create().players[0];
  E.categories.slice(0, 6).forEach((c, i) => { p.card[c.id] = 3 * (i + 1); });
  p.card.yahtzee = 50; p.bonus = 200;
  assert.deepEqual(E.totals(p), { upper: 63, upperBonus: 35, yahtzeeBonus: 200, total: 348 });
  p.card.ones = 2; assert.equal(E.totals(p).upperBonus, 0);
});

test('first Yahtzee is not a Joker and may be scored elsewhere without a bonus', () => {
  const s = rolled([4, 4, 4, 4, 4]);
  assert.equal(E.scoreOptions(s.dice, s.players[0].card).length, 13);
  assert.equal(E.scoreOptions(s.dice, s.players[0].card).find(x => x.category === 'full').points, 0);
  const n = move(s, { type: 'score', category: 'yahtzee' });
  assert.equal(n.players[0].card.yahtzee, 50); assert.equal(n.players[0].bonus, 0);
});

test('additional Yahtzee forces matching upper first with bonus only after a prior 50', () => {
  for (const prior of [0, 50]) {
    const s = rolled([4, 4, 4, 4, 4]); s.players[0].card.yahtzee = prior;
    const options = E.legal(s, 0).filter(a => a.type === 'score');
    assert.deepEqual(options, [{ type: 'score', category: 'fours' }]);
    assert.equal(E.apply(s, 0, { type: 'score', category: 'large' }).ok, false);
    const n = move(s, { type: 'score', category: 'fours' });
    assert.equal(n.players[0].card.fours, 20); assert.equal(n.players[0].bonus, prior ? 100 : 0);
  }
});

test('Joker permits fixed full-house/straight scores when matching upper is filled, even after a scratched Yahtzee', () => {
  for (const prior of [0, 50]) for (const [category, points] of [['full', 25], ['small', 30], ['large', 40], ['three', 20], ['four', 20], ['chance', 20]]) {
    const s = rolled([4, 4, 4, 4, 4]); s.players[0].card.yahtzee = prior; s.players[0].card.fours = 8;
    assert.ok(E.legal(s, 0).filter(a => a.type === 'score').every(a => E.categories.findIndex(c => c.id === a.category) >= 6));
    const n = move(s, { type: 'score', category });
    assert.equal(n.players[0].card[category], points); assert.equal(n.players[0].bonus, prior ? 100 : 0);
  }
});

test('Joker uses zero in another upper box only after all lower boxes are filled', () => {
  const s = rolled([6, 6, 6, 6, 6]);
  E.categories.slice(6).forEach(c => { s.players[0].card[c.id] = 0; }); s.players[0].card.yahtzee = 50; s.players[0].card.sixes = 18;
  assert.ok(E.scoreOptions(s.dice, s.players[0].card).every(o => o.points === 0 && o.bonus === 100));
  const n = move(s, { type: 'score', category: 'ones' });
  assert.equal(n.players[0].card.ones, 0); assert.equal(n.players[0].bonus, 100);
});

test('bonus counts once at score time, never once per roll or UI preview', () => {
  let s = rolled([5, 5, 5, 5, 5]); s.players[0].card.yahtzee = 50;
  E.scoreOptions(s.dice, s.players[0].card); E.scoreOptions(s.dice, s.players[0].card);
  assert.equal(s.players[0].bonus, 0);
  s = move(s, { type: 'roll', keep: 15 });
  assert.equal(s.players[0].bonus, 0);
});

test('invalid actors and malformed, duplicate or out-of-phase actions do not mutate state', () => {
  const s = rolled([1, 2, 3, 4, 5]), before = JSON.stringify(s);
  for (const action of [null, [], {}, { type: 'roll', keep: -1 }, { type: 'roll', keep: 31 }, { type: 'roll', keep: '0' }, { type: 'roll', keep: 0, extra: true }, { type: 'score', category: 'bogus' }, { type: 'score', category: 'chance', points: 999 }]) {
    assert.equal(E.apply(s, 0, action).ok, false); assert.equal(JSON.stringify(s), before);
  }
  assert.equal(E.apply(s, 1, { type: 'score', category: 'chance' }).ok, false);
  assert.deepEqual(E.legal(s, 1), []); assert.equal(E.bot(s, 1, 'expert'), null);
  assert.equal(E.apply(create(), 0, { type: 'score', category: 'chance' }).ok, false);
  s.players[0].card.chance = 20;
  assert.equal(E.apply(s, 0, { type: 'score', category: 'chance' }).ok, false);
});

test('completion includes every player and records exact ties', () => {
  let s = rolled([1, 2, 3, 4, 5], 3);
  s.players.forEach(p => { E.categories.forEach(c => { p.card[c.id] = 0; }); p.card.chance = null; });
  s = move(s, { type: 'score', category: 'chance' }); assert.equal(s.over, false);
  s.dice = [1, 2, 3, 4, 5]; s.rolls = 3;
  s = move(s, { type: 'score', category: 'chance' });
  assert.equal(s.over, true); assert.deepEqual(s.winners, [0, 1]); assert.equal(s.winner, null); assert.deepEqual(s.scores, [15, 15]);
  assert.deepEqual(E.legal(s, 0), []); assert.equal(E.actor(s), -1); assert.equal(E.bot(s, 0, 'expert'), null);
});

test('Hard banks a full house while Expert uses both remaining rolls to pursue a stronger turn', () => {
  const s = rolled([1, 1, 4, 1, 4]);
  assert.deepEqual(E.bot(s, 0, 'hard'), { type: 'score', category: 'full' });
  assert.deepEqual(E.bot(s, 0, 'expert'), { type: 'roll', keep: 11 });
  assert.deepEqual(E.bot(rolled([6, 6, 6, 6, 6]), 0, 'expert'), { type: 'score', category: 'yahtzee' });
});

test('bots never consult future RNG or opponent scorecards, and never mutate inputs', () => {
  const s = rolled([2, 3, 3, 5, 6]), altered = copy(s);
  altered.rng = 0xffffffff; altered.players[1].card.yahtzee = 50; altered.players[1].bonus = 800; altered.scores[1] = 999;
  for (const level of ['easy', 'normal', 'hard', 'expert']) {
    const before = JSON.stringify(s);
    assert.deepEqual(E.bot(s, 0, level), E.bot(altered, 0, level)); assert.equal(JSON.stringify(s), before);
  }
});

test('all four bot levels finish complete seeded games at each table size with legal immutable moves', () => {
  for (const n of [2, 3, 4]) for (const level of ['easy', 'normal', 'hard', 'expert']) for (const seed of [7, 941]) {
    let s = create(seed, n), replay = copy(s), actions = 0;
    while (!s.over && actions < n * 13 * 4 + 1) {
      const player = E.actor(s), action = E.bot(s, player, level), before = JSON.stringify(s);
      assert.ok(E.legal(s, player).some(a => JSON.stringify(a) === JSON.stringify(action)));
      s = move(s, action); assert.equal(JSON.stringify(replay), before);
      replay = move(replay, action); assert.deepEqual(s, replay);
      s.players.forEach((person, i) => { assert.equal(E.totals(person).total, s.scores[i]); assert.ok(person.bonus % 100 === 0); }); actions++;
    }
    assert.equal(s.over, true, n + ' players ' + level + ' seed ' + seed);
    assert.equal(s.turn, n * 13); assert.equal(s.round, 13);
    assert.ok(s.players.every(p => E.categories.every(c => p.card[c.id] !== null)));
  }
});
