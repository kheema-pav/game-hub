'use strict';
// Dependency-free DOM harness for room-control transitions and permission-visible actions.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../session.js'), 'utf8');

function harness(overrides = {}) {
  let document;
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.hidden = false; this.inert = false; this._text = ''; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children.forEach(c => { c.parentNode = null; }); this.children = []; }
    get isConnected() { return this === document.body || this === document.head || !!(this.parentNode && this.parentNode.isConnected); }
    appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
    remove() { if (this.parentNode) { const p = this.parentNode; p.children = p.children.filter(c => c !== this); this.parentNode = null; } }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter(f => f !== fn); }
    contains(el) { return this === el || this.children.some(c => c.contains(el)); }
    focus() { document.activeElement = this; document.dispatch('focusin', { target: this }); }
    click() { if (!this.disabled) this.dispatch('click', { target: this }); }
    dispatch(name, event) { event.stopPropagation ||= () => { event.stopped = true; }; event.preventDefault ||= () => { event.prevented = true; }; (this.listeners[name] || []).forEach(f => f(event)); if (!event.stopped && this.parentNode) this.parentNode.dispatch(name, event); }
    querySelectorAll(selector) {
      const match = el => selector === 'button' ? el.tagName === 'BUTTON' : selector === 'h2' ? el.tagName === 'H2' : selector.startsWith('#') ? el.id === selector.slice(1) : selector.startsWith('[data-hs-action=') ? el.getAttribute('data-hs-action') === selector.match(/"([^"]+)"/)[1] : false;
      return this.children.flatMap(c => (match(c) ? [c] : []).concat(c.querySelectorAll(selector)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  document = new Element('document'); document.createElement = tag => new Element(tag);
  document.head = new Element('head'); document.body = new Element('body'); document.activeElement = document.body;
  document.getElementById = id => document.head.querySelector('#' + id) || document.body.querySelector('#' + id);
  const game = document.createElement('main'); document.body.appendChild(game);
  const timers = new Map(); let timerId = 0, starts = 0, stops = 0;
  const calls = [];
  const online = { uid: 'host', rooms: {
    compatibility: room => ({ ok: room.v !== 99, message: 'Unsupported game version' }),
    trackPresence: (code, onError) => { starts++; online.presenceError = onError; return () => { stops++; }; },
    end: async code => { calls.push(['end', code]); return { status: 'ended' }; },
    replacement: async code => { calls.push(['replace', code]); return { code: '654321' }; },
    ...overrides.rooms
  }};
  const location = { pathname: '/gems/', reload: () => calls.push(['reload']) };
  const context = { window: { HubOnline: online }, HubOnline: online, document, navigator: { onLine: true }, location, console, Promise, Date, setInterval: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id) };
  vm.runInNewContext(source, context);
  const instance = context.window.HubSession.mount({ code: '123456', onExit: () => calls.push(['exit']), onRestart: code => calls.push(['restart', code]) });
  const room = { game: 'gems', v: 2, status: 'playing', host: 'host', seats: { host: { name: 'Pat' }, guest: { name: '<img src=x onerror=alert(1)>' } } };
  const snapshot = (extra = {}) => ({ room, presence: { host: { at: Date.now(), state: 'here' }, guest: { at: Date.now() - 200000, state: 'here' } }, ...extra });
  const action = name => document.body.querySelector('[data-hs-action="' + name + '"]');
  const root = () => document.body.children.find(el => el.className === 'hs-root');
  const open = () => root().children[0].click();
  return { instance, document, game, calls, online, room, snapshot, action, open, root, timers, starts: () => starts, stops: () => stops };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('loading is not treated as missing; presence starts only once for the current usable room', () => {
  const h = harness();
  const css = h.document.getElementById('hs-style').textContent;
  assert.ok(css.includes('\n'), 'style rules separated by actual newlines');
  assert.equal(css.includes('\\n'), false, 'literal slash-n must not invalidate stylesheet selectors');
  assert.equal(h.instance.update({ room: null, pending: true }), true);
  assert.equal(h.starts(), 0);
  assert.equal(h.game.inert, false);
  assert.equal(h.instance.update(h.snapshot()), true);
  h.instance.update(h.snapshot());
  assert.equal(h.starts(), 1);
  h.open();
  assert.match(h.root().textContent, /Here recently/);
  assert.match(h.root().textContent, /Not seen recently/);
  assert.match(h.root().textContent, /<img src=x/); // Kept as plain text, never parsed into markup.
  assert.equal(h.game.inert, true);
  h.action('hide').click(); assert.equal(h.game.inert, false);
  h.instance.close(); assert.equal(h.stops(), 1); assert.equal(h.timers.size, 0);
});

test('terminal and incompatible snapshots block the board and never restart presence', () => {
  const h = harness(); h.instance.update(h.snapshot());
  assert.equal(h.instance.update(h.snapshot({ room: { ...h.room, status: 'ended' } })), false);
  assert.equal(h.stops(), 1); assert.equal(h.game.inert, true);
  assert.equal(h.action('end'), null); assert.equal(h.action('hide'), null);
  h.instance.update(h.snapshot({ room: { ...h.room, status: 'ended' } }));
  assert.equal(h.starts(), 1);
  assert.equal(h.instance.update(h.snapshot()), false, 'a delayed playing snapshot cannot reopen an ended game');
  assert.equal(h.game.inert, true);
  h.action('exit').click(); assert.equal(h.game.inert, false); assert.deepEqual(h.calls, [['exit']]);
  const incompatible = harness();
  assert.equal(incompatible.instance.update(incompatible.snapshot({ room: { ...incompatible.room, v: 99 } })), false);
  assert.equal(incompatible.starts(), 0); assert.match(incompatible.root().textContent, /Unsupported game version/);
  assert.equal(incompatible.action('replace'), null); incompatible.instance.close();
});

test('missing room blocks once, while transient errors retain the existing game', () => {
  const h = harness(); h.instance.update(h.snapshot());
  assert.equal(h.instance.update({ room: null, error: { code: 'offline' } }), true);
  assert.equal(h.game.inert, false);
  assert.equal(h.instance.update({ room: null, pending: false }), false);
  assert.match(h.root().textContent, /no longer exists/); h.instance.close();
});

test('ending is confirmed, host-only and guarded against double clicks', async () => {
  let finish;
  const h = harness({ rooms: { end: code => { h.calls.push(['end', code]); return new Promise(resolve => { finish = resolve; }); } } });
  h.instance.update(h.snapshot()); h.open(); h.action('end').click();
  assert.equal(h.calls.length, 0);
  h.action('confirm-end').click(); h.action('confirm-end').click();
  await settle(); assert.deepEqual(h.calls, [['end', '123456']]);
  finish({ status: 'ended' }); await settle();
  assert.equal(h.action('hide'), null); assert.match(h.root().textContent, /Game ended/); assert.equal(h.stops(), 1); h.instance.close();
});

test('a guest can create a separate replacement after host loss, even for a terminal room', async () => {
  const h = harness(); h.online.uid = 'guest';
  h.instance.update(h.snapshot({ room: { ...h.room, status: 'cancelled' } }));
  assert.equal(h.action('end'), null);
  h.action('replace').click();
  assert.match(h.root().textContent, /Share its new code/);
  h.instance.update(h.snapshot({ room: { ...h.room, status: 'cancelled' } }));
  assert.ok(h.action('confirm-replace'), 'incoming snapshots preserve the confirmation');
  h.action('confirm-replace').click(); await settle();
  assert.deepEqual(h.calls, [['replace', '123456'], ['restart', '654321']]);
  assert.equal(h.root(), undefined); assert.equal(h.game.inert, false);
});

test('old-server denial is actionable and leaves the confirmation retryable', async () => {
  const h = harness({ rooms: { end: async () => { throw { code: 'permission-denied' }; } } });
  h.instance.update(h.snapshot()); h.open(); h.action('end').click(); h.action('confirm-end').click(); await settle();
  assert.match(h.root().textContent, /needs its room rules updated/);
  assert.equal(h.action('confirm-end').disabled, false);
  h.instance.close();
});

test('Escape closes ordinary controls but cannot uncover a terminal board', () => {
  const h = harness(); h.instance.update(h.snapshot()); h.open();
  h.root().children[1].dispatch('keydown', { key: 'Escape' }); assert.equal(h.game.inert, false);
  h.instance.update(h.snapshot({ room: { ...h.room, status: 'ended' } }));
  h.root().children[1].dispatch('keydown', { key: 'Escape' }); assert.equal(h.game.inert, true);
  h.instance.close();
});
