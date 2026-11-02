'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../game-night');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  const data = new Map(); let now = 1000, serial = 0;
  const storage = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  return { data, storage, night: createStore(storage, () => ++now, () => 'table-' + ++serial) };
}
const details = { players: [{ name: 'Cy', bot: false, score: 30 }, { name: 'Bot', bot: true, score: 24 }], winners: [0], mode: 'solo', level: 'expert' };
test('one completed table has one result across repeat saves and browser reloads; rematches are separate', () => {
  const { night, storage } = fixture(), state = { over: true, hand: ['PRIVATE'] };
  night.touch(state); const saved = JSON.parse(JSON.stringify(state));
  assert.equal(night.finish('azul', state, details), true);
  assert.equal(createStore(storage).finish('azul', saved, details), true);
  assert.equal(night.list().length, 1);
  night.finish('azul', { over: true }, details); assert.equal(night.list().length, 2);
  assert.doesNotMatch(storage.getItem('hub.results.v1'), /PRIVATE|hand/);
});
test('history is bounded, newest first, and clearing it preserves active game saves', () => {
  const { night, storage } = fixture(); storage.setItem('hub.azul.save.v1', 'keep');
  for (let i = 0; i < 55; i++) night.finish('azul', {}, { ...details, summary: 'Round ' + i });
  assert.equal(night.list().length, 50); assert.equal(night.list()[0].summary, 'Round 54');
  assert.equal(night.list().at(-1).summary, 'Round 5');
  assert.equal(night.clear(), true); assert.equal(night.list().length, 0);
  assert.equal(storage.getItem('hub.azul.save.v1'), 'keep');
});
test('corrupt, unavailable or full browser storage does not crash play or claim a result was saved', () => {
  const { night, storage } = fixture(); storage.setItem('hub.results.v1', '{broken'); assert.deepEqual(night.list(), []);
  night.finish('azul', {}, details); const record = night.list()[0];
  storage.setItem('hub.results.v1', JSON.stringify([{ ...record, level: 3 }, { ...record, winners: [99] }, record]));
  assert.equal(night.list().length, 1);
  const blocked = createStore(() => { throw new Error('Storage denied'); });
  assert.deepEqual(blocked.list(), []); assert.deepEqual(blocked.active(), []);
  assert.equal(blocked.finish('azul', {}, details), false); assert.equal(blocked.clear(), false);
});
test('local history accepts ties, excludes online data and hides unused difficulty for human-only tables', () => {
  const { night } = fixture();
  assert.equal(night.finish('azul', { online: true }, details), false);
  assert.equal(night.finish('azul', {}, { ...details, mode: 'online' }), false);
  night.finish('connect4', {}, { ...details, winners: [], mode: 'local', players: details.players.map(p => ({ ...p, bot: false })) });
  assert.deepEqual(night.list()[0].winners, []); assert.equal(night.list()[0].level, null);
});
test('resume descriptions handle legacy saves, per-seat levels, mixed tables and map editions', () => {
  const { night } = fixture();
  assert.match(night.describe('gems', { players: [{ name: 'Cy', type: 'human' }, { name: 'Z', type: 'human' }, { name: 'Ada', type: 'bot', level: 'medium' }], round: 4 }), /Same device \+ bots · Normal bots · Round 4/);
  assert.match(night.describe('ticket', { players: details.players, level: 'expert', state: { edition: 'europe', turn: 8 } }), /Expert bots · Europe · Turn 8/);
  assert.doesNotThrow(() => night.describe('isles', { G: {} }));
  assert.equal(night.describe('codex', { online: true }), '');
});
test('saved tables include both new games and all Pictionary phases, but not completed or incompatible games', () => {
  const { night, storage } = fixture();
  for (const game of ['reversi', 'yahtzee']) storage.setItem('hub.' + game + '.save.v1', JSON.stringify({ v: 1, game, gameVersion: 1, players: details.players, state: { over: false } }));
  storage.setItem('hub.azul.save.v1', JSON.stringify({ v: 1, game: 'azul', gameVersion: 99, players: details.players, state: { over: false } }));
  for (const screen of ['handover', 'secret', 'draw', 'verdict', 'scores']) {
    storage.setItem('pictionary.save.v1', JSON.stringify({ v: 1, screen, teams: ['Red', 'Blue'], turn: 2 }));
    assert.deepEqual(night.active().map(x => x.game), ['sketch', 'reversi', 'yahtzee']);
  }
  storage.setItem('pictionary.save.v1', JSON.stringify({ v: 1, screen: 'final' }));
  assert.equal(night.active().length, 2);
});

test('hub panels render saved names as text and clearing results requires a second click without deleting saves', () => {
  const { night, storage } = fixture(), unsafeName = '<img src=x onerror=alert(1)>';
  night.finish('azul', {}, { ...details, players: [{ name: unsafeName, bot: false, score: 50 }, details.players[1]] });
  storage.setItem('hub.reversi.save.v1', JSON.stringify({ v: 1, game: 'reversi', gameVersion: 1, players: details.players, state: { over: false } }));
  function node(tag = 'section') {
    return { tag, children: [], events: {}, hidden: false, textContent: '', open: true,
      appendChild(n) { this.children.push(n); }, replaceChildren() { this.children = []; },
      addEventListener(event, fn) { this.events[event] = fn; }, setAttribute() {},
      set innerHTML(value) { throw new Error('Saved strings must not be inserted as HTML'); }
    };
  }
  const savedTables = node(), recentResults = node('details'), context = { window: { HubGameNight: night, addEventListener() {} }, document: { getElementById: id => ({ savedTables, recentResults })[id], createElement: node } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game-night-hub.js'), 'utf8'), context);
  assert.equal(savedTables.hidden, false);
  assert.equal(savedTables.children[1].children[0].href, 'reversi/#continue');
  const resultRow = recentResults.children.find(n => n.tag === 'ol').children[0];
  assert.ok(resultRow.children[0].textContent.includes(unsafeName));
  const controls = recentResults.children.at(-1), [clear, cancel] = controls.children;
  clear.events.click(); assert.equal(night.list().length, 1); assert.equal(cancel.hidden, false);
  cancel.events.click(); assert.equal(cancel.hidden, true); assert.equal(night.list().length, 1);
  clear.events.click(); clear.events.click(); assert.equal(night.list().length, 0);
  assert.ok(storage.getItem('hub.reversi.save.v1')); assert.equal(recentResults.open, true);
});
