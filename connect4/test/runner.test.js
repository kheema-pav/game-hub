'use strict';
/* Runs the actual browser engine, core, runner and view in a dependency-free DOM harness.
   This verifies game wiring and events, not browser layout or real Firebase transport. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const SAVE = 'hub.connect4.save.v1';
const decode = s => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function boot({ search = '', hash = '', storage = new Map(), available = true } = {}) {
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.listeners = {}; this.parentNode = null; this._html = ''; this._text = ''; this.disabled = false; this.classList = { add: name => { this.attrs.class = ((this.attrs.class || '') + ' ' + name).trim(); } }; }
    get innerHTML() { return this._html; }
    set innerHTML(html) {
      this._html = html; this._text = ''; this.children = [];
      const stack = [this], tokens = String(html).match(/<[^>]*>|[^<]+/g) || [];
      for (const token of tokens) {
        if (token.startsWith('</')) { const name = token.slice(2, -1).trim().toUpperCase(); const index = stack.map(el => el.tagName).lastIndexOf(name); if (index > 0) stack.length = index; }
        else if (/^<[a-z]/i.test(token)) {
          const match = /^<([\w-]+)([\s\S]*?)\/?\s*>$/.exec(token); if (!match) continue;
          const el = new Element(match[1]); const attrs = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g; let attr;
          while ((attr = attrs.exec(match[2]))) el.setAttribute(attr[1], decode(attr[2] ?? attr[3] ?? attr[4] ?? ''));
          stack[stack.length - 1].appendChild(el);
          if (!['INPUT', 'BR', 'HR', 'META', 'LINK', 'IMG'].includes(el.tagName) && !token.endsWith('/>')) stack.push(el);
        } else stack[stack.length - 1]._text += decode(token);
      }
    }
    get textContent() { return this._text + this.children.map(el => el.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    appendChild(el) { el.parentNode = this; this.children.push(el); return el; }
    setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'disabled') this.disabled = true; if (name === 'value') this.value = String(value); if (name === 'id') this.id = value; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
    contains(el) { return this === el || this.children.some(c => c.contains(el)); }
    matches(selector) {
      const tag = /^([a-z]+)/i.exec(selector); if (tag && this.tagName !== tag[1].toUpperCase()) return false;
      const attrs = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
      return attrs.every(m => this.hasAttribute(m[1]) && (m[2] === undefined || this.getAttribute(m[1]) === m[2]));
    }
    closest(selector) { if (selector.split(',').some(s => this.matches(s))) return this; return this.parentNode && this.parentNode.closest(selector); }
    all(selector) { return this.children.flatMap(c => (c.matches(selector) ? [c] : []).concat(c.all(selector))); }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    dispatch(name, event = {}) { event.target ||= this; event.preventDefault ||= () => {}; (this.listeners[name] || []).forEach(fn => fn(event)); if (this.parentNode) this.parentNode.dispatch(name, event); }
    click() { if (!this.disabled) this.dispatch('click'); }
  }
  const document = { body: new Element('body'), createElement: tag => new Element(tag) };
  const app = new Element('main'); app.id = 'app'; document.body.appendChild(app);
  document.getElementById = id => id === 'app' ? app : null;
  const location = { origin: 'https://test.invalid', pathname: '/connect4/', search, hash };
  const calls = [], timers = new Map(), listeners = {}, views = []; let nextTimer = 0, watcher = null, lobbyOptions = null, enterOptions = null;
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, val) => storage.set(key, val), removeItem: key => storage.delete(key) };
  const context = { document, location, localStorage, URLSearchParams, Uint32Array, Promise, console,
    crypto: { getRandomValues: array => { array[0] = 31; return array; } },
    history: { replaceState: (_, unused, url) => { const next = new URL(url, location.origin); Object.assign(location, { pathname: next.pathname, search: next.search, hash: next.hash }); } },
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    HubKit: { init: config => calls.push(['menu', config]), sfx: name => calls.push(['sound', name]) },
    HubLobby: { openCreateJoin: options => { lobbyOptions = options; calls.push(['lobby', options.game]); return { close() {} }; }, enter: (code, options) => { enterOptions = options; calls.push(['enter', code, options.game]); return { close() {} }; }, close() {} },
    HubSession: { mount: options => { const session = { options, updates: [], closed: false, update(snapshot) { this.updates.push(snapshot); return !snapshot.room || !['ended', 'cancelled'].includes(snapshot.room.status); }, close() { this.closed = true; } }; views.push(session); return session; } },
    HubOnline: { uid: 'alice', available: () => available, rooms: { compatibility: room => ({ ok: room.v === 2 && room.gameVersion === 1, message: 'Unsupported version' }), watch: (code, callback) => { watcher = callback; calls.push(['watch', code]); return () => calls.push(['unsubscribe', code]); }, writeMine: async (code, data) => calls.push(['write', code, JSON.parse(JSON.stringify(data))]) } }
  };
  context.window = context; vm.createContext(context);
  for (const file of ['shared/versions.js', 'shared/tabletop-core.js', 'connect4/engine.js', 'shared/tabletop.js', 'connect4/game.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  function find(selector) { return app.all(selector)[0] || null; }
  function click(selector) { const el = find(selector); assert.ok(el, 'missing control: ' + selector + '\n' + app.textContent); el.click(); }
  return { app, context, calls, storage, timers, views, location, find, click,
    saved: () => JSON.parse(storage.get(SAVE) || 'null'),
    runBot: () => { const entry = [...timers].find(([, x]) => x.ms === 380); assert.ok(entry, 'a bot move should be scheduled'); timers.delete(entry[0]); entry[1].fn(); },
    onlineStart: code => { assert.ok(lobbyOptions); lobbyOptions.onRoom(code); assert.ok(enterOptions); enterOptions.onPlay({ code }); },
    enterPlay: code => { assert.ok(enterOptions); enterOptions.onPlay({ code }); },
    snapshot: snapshot => { assert.ok(watcher); watcher(snapshot); },
    emit: (name, event) => (listeners[name] || []).forEach(fn => fn(event))
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('real solo runner boots, starts, applies a human drop and completes the bot response', () => {
  const h = boot({ search: '?mode=solo' });
  assert.match(h.app.textContent, /Four in a Row/); h.click('button[data-tt="start"]');
  assert.equal(h.saved().state.moves, 0); assert.equal(h.saved().gameVersion, 1);
  h.click('button[data-move="3"]'); assert.equal(h.saved().state.moves, 1); assert.equal(h.saved().state.board[5][3], 0);
  assert.equal(h.find('button[data-move]'), null, 'human cannot click while bot owns the turn');
  h.runBot(); assert.equal(h.saved().state.moves, 2); assert.ok(h.find('button[data-move]'));
  const menu = h.calls.find(call => call[0] === 'menu')[1]; menu.items()[0].onSelect();
  assert.ok(h.find('button[data-tt="continue"]'), 'menu setup preserves the save');
});

test('same-device curtain hides each next human turn and blocks stale move controls', () => {
  const h = boot({ search: '?mode=local' }); h.click('button[data-tt="start"]');
  assert.match(h.app.textContent, /Pass the device/); assert.equal(h.find('button[data-move]'), null);
  h.click('button[data-tt="reveal"]'); h.click('button[data-move="0"]');
  assert.equal(h.saved().state.moves, 1); assert.match(h.app.textContent, /Pass the device/);
  assert.equal(h.find('button[data-move]'), null); h.click('button[data-tt="reveal"]');
  h.click('button[data-move="1"]'); assert.equal(h.saved().state.moves, 2); assert.match(h.app.textContent, /Pass the device/);
});

test('Continue restores exact board; #continue has priority over a new mode intent', () => {
  const storage = new Map(), first = boot({ storage }); first.click('button[data-tt="start"]'); first.click('button[data-move="4"]'); first.runBot();
  const expected = JSON.stringify(first.saved().state);
  const resumed = boot({ storage, search: '?mode=online', hash: '#continue' });
  assert.equal(resumed.calls.some(call => call[0] === 'lobby'), false);
  assert.equal(JSON.stringify(resumed.saved().state), expected);
  assert.ok(resumed.find('button[data-move]')); assert.equal(resumed.location.hash, '');
});

test('unavailable online mode stays usable through local setup', () => {
  const h = boot({ search: '?mode=online', available: false }); assert.match(h.app.textContent, /Online play is unavailable/);
  h.click('button[data-tt="mode"][data-value="solo"]'); h.click('button[data-tt="start"]'); assert.ok(h.find('button[data-move]'));
});

test('real online registration/replay sends authored move without changing the local save; terminal snapshots block', async () => {
  const storage = new Map(), prior = boot({ storage }); prior.click('button[data-tt="start"]'); const localSave = storage.get(SAVE);
  const h = boot({ storage, search: '?mode=online' });
  assert.ok(h.calls.some(call => call[0] === 'lobby' && call[1] === 'connect4'));
  h.onlineStart('123456');
  const room = { game: 'connect4', v: 2, gameVersion: 1, seed: 31, status: 'playing', opts: {}, seats: { alice: { name: 'Pat', color: '#f00' }, bob: { name: 'Sam', color: '#ff0' } } };
  const ids = h.context.HubTabletopCore.seats(room); h.context.HubOnline.uid = ids[0];
  h.snapshot({ room, players: {}, presence: {} }); assert.ok(h.find('button[data-move]'));
  h.click('button[data-move="3"]'); await settle();
  const write = h.calls.find(call => call[0] === 'write'); assert.ok(write); assert.equal(write[2].moves[0].k, 0); assert.equal(write[2].moves[0].action.column, 3);
  assert.equal(storage.get(SAVE), localSave, 'online play leaves local saved game unchanged');
  h.snapshot({ room, players: { [ids[1]]: { moves: [{ k: 1, action: { type: 'drop', column: 0 } }] } } });
  assert.ok(h.find('button[data-move]'), 'remote response returns turn to the local player');
  h.snapshot({ room: { ...room, status: 'ended' }, players: {} });
  const before = h.calls.filter(call => call[0] === 'write').length;
  // A previously rendered move must remain guarded even when an input event is queued.
  const oldMove = h.find('button[data-move]'); assert.ok(oldMove); oldMove.click(); await settle();
  assert.equal(h.calls.filter(call => call[0] === 'write').length, before);
  assert.equal(h.views.length, 1); assert.ok(h.views[0].updates.length >= 2);
});

test('room invitation takes priority over mode and Continue', () => {
  const h = boot({ search: '?room=123456&mode=solo', hash: '#continue' });
  assert.ok(h.calls.some(call => call[0] === 'enter' && call[1] === '123456' && call[2] === 'connect4'));
  assert.equal(h.storage.has(SAVE), false);
});

test('unsupported room versions and wrong-game snapshots cannot render or submit a Connect4 move', () => {
  for (const patch of [{ v: 99 }, { game: 'ludo' }]) {
    const h = boot({ search: '?room=123456' }); h.enterPlay('123456');
    const room = { game: 'connect4', v: 2, gameVersion: 1, seed: 31, status: 'playing', opts: {}, seats: { alice: { name: 'Pat' }, bob: { name: 'Sam' } }, ...patch };
    h.snapshot({ room, players: {} });
    assert.equal(h.find('button[data-move]'), null);
    assert.match(h.app.textContent, patch.v ? /Unsupported version/ : /different game/);
    assert.equal(h.calls.some(call => call[0] === 'write'), false);
    assert.equal(h.storage.has(SAVE), false);
  }
});

test('Continue rejects a saved version mismatch without overwriting the original save', () => {
  const storage = new Map(), h = boot({ storage }); h.click('button[data-tt="start"]');
  const old = h.saved(); old.gameVersion = 999; storage.set(SAVE, JSON.stringify(old)); const original = storage.get(SAVE);
  const resumed = boot({ storage, hash: '#continue' });
  assert.match(resumed.app.textContent, /different version/); assert.equal(resumed.find('button[data-move]'), null);
  assert.equal(storage.get(SAVE), original);
});
