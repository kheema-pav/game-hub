'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStore } = require('../shared/game-night.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sources = Object.fromEntries(['codex', 'gems', 'isles', 'sketch'].map(game => [game, read(game + '/game.js')]));
function section(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'lifecycle section exists');
  return source.slice(start, end);
}
function harness(extra = {}) {
  const rows = new Map(); let serial = 0, now = 1000;
  const storage = { getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
  const night = createStore(storage, () => ++now, () => 'game-' + ++serial);
  const c = vm.createContext({ window: { HubGameNight: night }, HubGameNight: night, localStorage: storage,
    ON: { active: false }, KEY: 'save', SAVE_KEY: 'save', store: (key, value) => storage.setItem(key, JSON.stringify(value)),
    forget: key => storage.removeItem(key), ...extra });
  return { c, storage, night, run: source => vm.runInContext(source, c) };
}

test('Codex records final totals and objective tie-breaks once, without touching online games', () => {
  const S = { phase: 'over', round: 12, players: [{ name: 'A', ai: false }, { name: 'B', ai: true, level: 'expert' }, { name: 'C', ai: false }],
    results: [{ i: 1, total: 30, done: 4 }, { i: 0, total: 30, done: 3 }, { i: 2, total: 27, done: 5 }] };
  const h = harness({ S });
  h.run(section(sources.codex, 'function save(){', 'function slog('));
  h.run('save();save()');
  const result = h.night.list();
  assert.equal(result.length, 1); assert.deepEqual(result[0].winners, [1]);
  assert.deepEqual(result[0].players.map(p => p.score), [30, 30, 27]);
  assert.equal(result[0].level, 'expert');
  assert.equal(JSON.parse(h.storage.getItem('save'))._night.id, S._night.id);
  h.c.S = { ...S, _night: undefined, online: true };
  const before = h.storage.getItem('save'); h.run('save()');
  assert.equal(h.c.S._night, undefined); assert.equal(h.storage.getItem('save'), before); assert.equal(h.night.list().length, 1);
});

test('Splendor records shared wins with fewer-card tie-break and removes only the finished save', () => {
  const G = { over: false, round: 20, players: [{ name: 'A', type: 'human', pts: 16, cards: [1, 2, 3] }, { name: 'B', type: 'bot', level: 'medium', pts: 16, cards: [4, 5] }, { name: 'C', type: 'human', pts: 16, cards: [6, 7] }] };
  const h = harness({ G, isHuman: p => p.type === 'human' });
  h.run(section(read('gems/engine.js'), 'function standings(', '// ===== Bots ====='));
  h.run(section(sources.gems, 'function saveGame()', 'function addLog('));
  h.run('saveGame()'); const id = JSON.parse(h.storage.getItem('save'))._night.id;
  assert.equal(h.night.list().length, 0);
  G.over = true; h.run('saveGame();saveGame()');
  assert.equal(h.storage.getItem('save'), null);
  const results = h.night.list(); assert.equal(results.length, 1); assert.equal(results[0].id, id);
  assert.deepEqual(results[0].winners, [1, 2]); assert.equal(results[0].level, 'normal');
  h.c.ON.active = true; G._night = undefined; h.run('saveGame()'); assert.equal(G._night, undefined);
});

test('Catan records the actual winner and final victory points before deleting its save', () => {
  const G = { phase: 'play', mode: 'seafarers', level: 'expert', turnNo: 65, winner: 1,
    players: [{ id: 0, name: 'A', bot: false }, { id: 1, name: 'B', bot: true }] };
  const h = harness({ G, ui: { cfg: { hideHands: true, speed: 'fast' } }, E: { totalVP: (s, id) => [11, 13][id] } });
  h.run(section(sources.isles, 'function saveGame()', 'function loadSave('));
  h.run('saveGame()'); const id = JSON.parse(h.storage.getItem('save')).G._night.id;
  G.phase = 'gameover'; h.run('saveGame();saveGame()');
  const results = h.night.list(); assert.equal(results.length, 1); assert.equal(results[0].id, id);
  assert.deepEqual(results[0].winners, [1]); assert.deepEqual(results[0].players.map(p => p.score), [11, 13]);
  assert.match(results[0].summary, /Seafarers/); assert.equal(h.storage.getItem('save'), null);
  h.c.ON.active = true; G._night = undefined; h.run('saveGame()'); assert.equal(G._night, undefined);
});

test('Codex rematch keeps names and bot levels, rotates first seat, and cannot restart an active or online game', () => {
  const calls = [], players = [{ name: 'Cy', ai: false, level: 'normal' }, { name: 'Moss', ai: true, level: 'expert' }];
  const h = harness({ S: { phase: 'over', players }, newGame: cfg => calls.push(JSON.parse(JSON.stringify(cfg))) });
  h.run(section(sources.codex, 'function rematchLocal(){', 'function setupNext(){'));
  h.run('rematchLocal()'); assert.deepEqual(calls, [[players[1], players[0]]]);
  h.c.S.phase = 'place'; h.run('rematchLocal()'); h.c.S.phase = 'over'; h.c.S.online = true; h.run('rematchLocal()');
  assert.equal(calls.length, 1); assert.deepEqual(players.map(p => p.name), ['Cy', 'Moss']);
});

test('Pictionary preserves match identity across save/resume and records only completed rounds', () => {
  const S = { screen: 'scores', teams: ['Red', 'Blue'], scores: [2, 2], turn: 3, rounds: 2, secs: 90, used: new Set(['Tree']), skipsLeft: 1 };
  const h = harness({ S, total: () => S.teams.length * S.rounds, WORDS: { Nature: ['Tree'] }, keepAwake() {} });
  h.run(section(sources.sketch, 'function save(){', 'function showRules(){'));
  h.run(section(sources.sketch, 'function recordLocalResult(){', 'function beginDraw(){'));
  h.run('save()'); const id = S._night.id; S._night = undefined;
  assert.equal(h.run('restore()'), true); assert.equal(S._night.id, id);
  S.screen = 'final'; h.run('recordLocalResult()'); assert.equal(h.night.list().length, 0, 'early End game is not a finished match');
  S.turn = 4; h.run('recordLocalResult();recordLocalResult()');
  const results = h.night.list(); assert.equal(results.length, 1); assert.equal(results[0].id, id); assert.deepEqual(results[0].winners, [0, 1]);
  h.c.ON.active = true; S._night = undefined; h.run('save();recordLocalResult()'); assert.equal(S._night, undefined);
});

test('Pictionary rematch keeps teams and timing, clears previous points, timer and match identity', () => {
  const S = { screen: 'final', teams: ['Cy', 'Z'], scores: [5, 3], turn: 10, rounds: 5, secs: 45,
    _night: { id: 'old' }, word: { w: 'Tree' }, used: new Set(['Tree']), paused: true, reveal: true, tick: 20 };
  const stopped = [], h = harness({ S, clearInterval: id => stopped.push(id), keepAwake() {}, go: screen => { S.screen = screen; } });
  h.run(section(sources.sketch, 'function startGame(){', 'function recordLocalResult(){'));
  h.run('startGame()');
  assert.deepEqual(S.teams, ['Cy', 'Z']); assert.equal(S.rounds, 5); assert.equal(S.secs, 45);
  assert.deepEqual(Array.from(S.scores), [0, 0]); assert.equal(S.turn, 0); assert.equal(S.used.size, 0);
  assert.equal(S._night, undefined); assert.equal(S.screen, 'handover'); assert.equal(S.word, null);
  assert.equal(S.paused, false); assert.equal(S.reveal, false); assert.deepEqual(stopped, [20]);
});

test('Catan resume restores saved privacy and bot speed instead of a later setup choice', () => {
  const state = { v: 1, phase: 'roll' }, opts = { hideHands: true, speed: 'fast' };
  const h = harness({ G: null, ui: { cfg: { hideHands: false, speed: 'slow' } }, loadSave: () => ({ G: state, opts }), log0() {}, enterGame() {}, renderHome() {} });
  const start = sources.isles.indexOf('function resumeSave()');
  const end = sources.isles.indexOf('\n}', start) + 2;
  h.run(sources.isles.slice(start, end));
  assert.equal(h.run('resumeSave()'), true); assert.equal(h.c.G, state);
  assert.equal(h.c.ui.cfg.hideHands, true); assert.equal(h.c.ui.cfg.speed, 'fast');
});

test('Splendor and Catan rematches carry the finished table settings into a fresh game', () => {
  const gemsPlayers = [{ name: 'Cy', type: 'human', level: null }, { name: 'Ada', type: 'bot', level: 'expert' }];
  const gems = harness({ G: { players: gemsPlayers }, startGame: players => { gems.c.started = JSON.parse(JSON.stringify(players)); } });
  const gemsCase = section(sources.gems, "    case 'rematch': {", "    case 'hide-over':");
  gems.run("(()=>{switch('rematch'){" + gemsCase + '}})()');
  assert.deepEqual(gems.c.started, [gemsPlayers[1], gemsPlayers[0]]);
  const islesPlayers = [{ name: 'Cy', color: 'red', bot: false }, { name: 'Ada', color: 'blue', bot: true }];
  const isles = harness({ G: { mode: 'seafarers', target: 13, friendly: true, level: 'expert', players: islesPlayers },
    E: { shuffle: values => values.slice().reverse(), newGame: opts => { isles.c.started = JSON.parse(JSON.stringify(opts)); return { phase: 'setup' }; } }, closeModal() {}, log0() {}, enterGame() {} });
  const islesCase = section(sources.isles, "    case 'rematch': {", "    case 'home':");
  isles.run("(()=>{switch('rematch'){" + islesCase + '}})()');
  assert.deepEqual(isles.c.started, { mode: 'seafarers', target: 13, friendly: true, level: 'expert', players: [islesPlayers[1], islesPlayers[0]] });
  assert.equal(isles.c.G.phase, 'setup'); assert.equal(isles.c.G._night, undefined);
});
