'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('./engine');
const C = require('../shared/tabletop-core');
const copy = x => JSON.parse(JSON.stringify(x));
const shellSource = fs.readFileSync(path.join(__dirname, '../shared/tabletop.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
function shell({ search = '?mode=local', hash = '', save } = {}) {
  const storage = new Map(), listeners = {}, timers = new Map(), calls = [], writes = [];
  if (save) storage.set('hub.azul.save.v1', JSON.stringify(save));
  const root = { innerHTML: '', classList: { add() {} }, addEventListener(k, fn) { listeners[k] = fn; }, contains() { return true; } };
  const location = { pathname: '/azul/', search, hash };
  let config, watcher, onPlay;
  const room = { game: 'azul', v: 2, gameVersion: 1, status: 'playing', seed: 123, opts: {}, maxSeats: 2, seats: { a: { name: 'Alice', color: '#123456' }, b: { name: 'Bob', color: '#234567' } } };
  const ids = C.seats(room), initial = E.create({ seed: room.seed, players: ids.map(id => ({ ...room.seats[id], bot: false })), options: {} });
  const context = {
    console, document: { getElementById: () => root }, location, URLSearchParams, Promise, Uint32Array,
    history: { replaceState(a, b, url) { location.search = url.includes('?') ? '?' + url.split('?')[1] : ''; location.hash = ''; } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    crypto: { getRandomValues(array) { array[0] = 123; return array; } },
    setTimeout(fn, ms) { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, addEventListener() {},
    HubTabletopCore: C, HubEngines: { azul: E }, HubGameVersions: { platform: 2, games: { azul: 1 } },
    HubKit: { init() {}, sfx() {} },
    HubOnline: { uid: ids[initial.current], available: () => true, rooms: {
      compatibility: () => ({ ok: true }), watch(code, cb) { watcher = cb; return () => {}; },
      writeMine(code, data) { writes.push(copy(data)); return Promise.resolve(); }, replacement: async () => ({ code: '654321' }),
    } },
    HubLobby: { close() {}, openCreateJoin(options) { calls.push(['open', options]); return { close() {} }; },
      enter(code, options) { onPlay = options.onPlay; calls.push(['enter', code]); return { close() {} }; } },
    HubSession: { mount() { return { update: snap => !snap.room || !['ended', 'cancelled'].includes(snap.room.status), close() {} }; } },
  };
  context.window = context; vm.createContext(context); vm.runInContext(shellSource, context);
  const mount = context.HubTabletop.mount;
  context.HubTabletop.mount = value => { config = value; return mount(value); };
  vm.runInContext(gameSource, context);
  function click(attrs) {
    const target = { disabled: false, closest() { return this; }, hasAttribute: k => k in attrs, getAttribute: k => attrs[k] === undefined ? null : attrs[k] };
    listeners.click({ target });
  }
  return { root, storage, timers, calls, writes, click, config, room, context,
    save: () => JSON.parse(storage.get('hub.azul.save.v1')),
    begin() { onPlay({ code: '123456' }); }, emit(snapshot) { watcher(snapshot); },
  };
}
test('actual Azul shell holds the same actor across draft/place, then hands over; saved state resumes mid-draft', () => {
  const h = shell(); assert.match(h.root.innerHTML, /Draft colourful tiles/); h.click({ 'data-tt': 'start' });
  assert.match(h.root.innerHTML, /Pass the device/); h.click({ 'data-tt': 'reveal' });
  const starter = h.save().state.current; assert.match(h.root.innerHTML, /Factory 1/);
  h.click({ 'data-move': '0' }); const saved = h.save();
  assert.equal(saved.gameVersion, 1); assert.equal(saved.state.phase, 'place'); assert.equal(saved.state.current, starter);
  assert.doesNotMatch(h.root.innerHTML, /Pass the device/); assert.match(h.root.innerHTML, /Send all/);
  assert.equal(C.validSave(saved, h.config), true);
  const resumed = shell({ search: '?mode=online', hash: '#continue', save: saved });
  assert.ok(!resumed.calls.some(c => c[0] === 'open')); assert.match(resumed.root.innerHTML, /Pass the device/);
  resumed.click({ 'data-tt': 'reveal' }); assert.match(resumed.root.innerHTML, /Send all/);
  assert.equal(resumed.save().state.phase, 'place'); resumed.click({ 'data-move': '0' });
  assert.equal(resumed.save().state.phase, 'draft'); assert.notEqual(resumed.save().state.current, starter); assert.match(resumed.root.innerHTML, /Pass the device/);
});
test('actual Azul online shell can author consecutive staged moves and leaves a local save unchanged', async () => {
  const local = shell(); local.click({ 'data-tt': 'start' }); const save = local.save();
  const h = shell({ search: '?room=123456&mode=solo', save }); assert.equal(h.calls[0][0], 'enter'); h.begin();
  const snapshot = { room: h.room, players: {}, pending: false, error: null }; h.emit(snapshot);
  assert.match(h.root.innerHTML, /Factory 1/); h.click({ 'data-move': '0' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].moves[0].k, 0); assert.match(h.root.innerHTML, /Send all/);
  snapshot.players[h.context.HubOnline.uid] = { moves: h.writes[0].moves }; h.emit(snapshot);
  h.click({ 'data-move': '0' }); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.writes.length, 2); assert.deepEqual(h.writes[1].moves.map(r => r.k), [0, 1]);
  assert.equal(h.writes[1].moves[0].action.type, 'draft'); assert.equal(h.writes[1].moves[1].action.type, 'place');
  assert.deepEqual(h.save(), save);
  snapshot.room = { ...h.room, status: 'ended' }; h.emit(snapshot);
  const before = h.writes.length; h.click({ 'data-move': '0' }); assert.equal(h.writes.length, before);
});
test('shared replay reconstructs a complete four-player Azul game with consecutive actions by one author', () => {
  const config = { id: 'azul', minPlayers: 2, maxPlayers: 4, options: [], engine: E };
  const room = { game: 'azul', seed: 771, seats: { u0: { name: 'Ada' }, u1: { name: 'Bram' }, u2: { name: 'Cleo' }, u3: { name: 'Daria' } }, opts: {} };
  const ids = C.seats(room), people = ids.map(id => ({ name: room.seats[id].name, color: '', bot: false }));
  let state = E.create({ seed: room.seed, players: people, options: {} }), k = 0;
  const docs = Object.fromEntries(ids.map(id => [id, { moves: [] }]));
  while (!state.over && k < 6000) {
    const p = E.actor(state), action = E.bot(state, p, 'hard'); docs[ids[p]].moves.push({ k, action });
    state = E.apply(state, p, action).state; k++;
  }
  assert.equal(state.over, true); const replay = C.replay(config, room, docs);
  assert.equal(replay.k, k); assert.deepEqual(replay.state, state);
});
