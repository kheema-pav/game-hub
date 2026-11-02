'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const tick = () => new Promise(resolve => setImmediate(resolve));

function node() {
  return {
    hidden: false, textContent: '', className: '', value: '', disabled: false, attrs: {}, events: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(k, fn) { this.events[k] = fn; }, appendChild(n) { this.children.push(n); return n; },
    insertAdjacentHTML() {}, focus() { this.focused = true; }
  };
}
function boot({ saves = {}, configured = true, room, entries = [] } = {}) {
  const data = new Map(Object.entries(saves).map(([k, v]) => [k, JSON.stringify(v)]));
  const ids = Object.fromEntries(['menuSlot', 'createBox', 'joinBox', 'soonBox', 'joinForm', 'joinCode', 'joinBtn', 'joinErr', 'onlineStrip', 'onlineList'].map(k => [k, node()]));
  const cards = {};
  for (const game of ['codex', 'isles', 'gems', 'sketch', 'ticket', 'ludo', 'connect4', 'azul', 'reversi', 'yahtzee']) {
    const parts = Object.fromEntries(['.prog', '.pl', '.play', '.title'].map(k => [k, node()]));
    parts['.title'].textContent = game;
    cards[game] = { querySelector: k => parts[k], parts };
  }
  const onlineNodes = [node(), node()];
  const watched = [];
  const listeners = {};
  const context = {
    console, Promise, Date, Error, Object, Array, JSON, String, Number, isFinite,
    navigator: { onLine: true }, location: { href: '' },
    localStorage: { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) },
    document: {
      getElementById: k => ids[k],
      querySelector: selector => { const m = /data-game="(\w+)"/.exec(selector); return m ? cards[m[1]] : null; },
      querySelectorAll: () => onlineNodes,
      createElement: () => node(), head: { appendChild() {} }
    },
    HUB_FIREBASE_CONFIG: configured ? { projectId: 'test' } : null,
    HubKit: { init() {}, buttonHTML: () => '' },
    HubOnline: {
      uid: 'me', ready: () => Promise.resolve(), rooms: {
        lookup: () => Promise.resolve(room), mine: () => entries, forget() {},
        compatibility: r => ({ ok: r.v !== 999, message: 'Refresh to open this game' }),
        watch: (code, cb) => { watched.push(cb); return () => {}; }
      }
    },
    addEventListener: (k, fn) => { (listeners[k] ||= []).push(fn); }
  };
  context.window = context;
  vm.createContext(context);
  scripts.forEach(script => vm.runInContext(script, context));
  return { context, ids, cards, data, onlineNodes, watched, listeners };
}

async function submit(b, code = '123456') {
  b.ids.joinCode.value = code;
  b.ids.joinForm.events.submit({ preventDefault() {} });
  await tick(); await tick();
}

test('each card has distinct valid mode links with no nested anchors', () => {
  for (const game of ['codex', 'isles', 'gems', 'ticket', 'ludo', 'connect4', 'azul', 'reversi', 'yahtzee']) {
    for (const mode of ['solo', 'local', 'online']) assert.ok(html.includes(`href="${game}/?mode=${mode}"`));
  }
  assert.ok(html.includes('href="sketch/?mode=local"'));
  assert.ok(html.includes('href="sketch/?mode=online"'));
  assert.ok(!html.includes('sketch/?mode=solo'));
  let anchors = 0;
  for (const m of html.matchAll(/<\/?a(?:\s[^>]*)?>/g)) {
    if (m[0].startsWith('</')) anchors--; else { assert.equal(anchors, 0, 'anchors may not wrap other links'); anchors++; }
    assert.ok(anchors >= 0);
  }
  assert.equal(anchors, 0);
  assert.ok(html.indexOf('id="joinBox"') < html.indexOf('<main class="shelf"'));
});

test('Continue links survive the card changing from an anchor to an article', () => {
  const saves = {
    'naturalists-codex-v1': { v: 1, phase: 'play', round: 4 },
    'sti.save.v1': { G: { v: 1, phase: 'main', turnNo: 8 } },
    'gemguild-game-v1': { players: [{}, {}], over: false, round: 3 },
    'pictionary.save.v1': { v: 1, screen: 'draw', turn: 2, teams: [{}, {}], rounds: 2 }
  };
  const b = boot({ saves });
  for (const game of ['codex', 'isles', 'gems', 'sketch']) {
    assert.equal(b.cards[game].parts['.pl'].textContent, 'Continue');
    assert.equal(b.cards[game].parts['.prog'].hidden, false);
  }
  assert.equal(b.cards.isles.parts['.play'].attrs.href, 'isles/#continue');
  assert.equal(b.cards.gems.parts['.play'].attrs.href, 'gems/#continue');
  for (const [key, value] of Object.entries(saves)) assert.equal(b.data.get(key), JSON.stringify(value), 'loading the hub must not rewrite saves');
});

test('missing online configuration leaves local choices and an explicit unavailable state', () => {
  const b = boot({ configured: false });
  assert.equal(b.ids.joinBox.hidden, true);
  assert.equal(b.ids.createBox.hidden, true);
  assert.equal(b.ids.soonBox.hidden, false);
  assert.ok(b.onlineNodes.every(n => n.hidden));
  assert.equal(b.cards.codex.parts['.pl'].textContent, 'Play');
});

for (const status of ['cancelled', 'ended']) {
  test(`joining a ${status} room gives an actionable error without navigation`, async () => {
    const b = boot({ room: { exists: true, status, game: 'isles', seated: true } });
    await submit(b);
    assert.equal(b.context.location.href, '');
    assert.match(b.ids.joinErr.textContent, /new game code/);
    assert.equal(b.ids.joinBtn.disabled, false);
  });
}

test('unsupported room versions stop before navigating and valid invitations keep their room code', async () => {
  const incompatible = boot({ room: { exists: true, status: 'open', game: 'gems', v: 999 } });
  await submit(incompatible);
  assert.equal(incompatible.context.location.href, '');
  assert.match(incompatible.ids.joinErr.textContent, /Refresh/);
  const valid = boot({ room: { exists: true, status: 'playing', game: 'gems', seated: true, v: 2 } });
  await submit(valid, 'https://example.test/gems/?room=123456');
  assert.equal(valid.context.location.href, 'gems/?room=123456');
});

test('saved terminal rooms display their lifecycle status instead of Your turn', async () => {
  const b = boot({ saves: { 'hub.rooms': [{ code: '123456', game: 'isles' }] }, entries: [{ code: '123456', game: 'isles' }] });
  await tick(); await tick();
  assert.equal(b.watched.length, 1);
  b.watched[0]({ room: { status: 'ended', seats: { me: { name: 'Me' } } }, players: { me: { turn: { at: Date.now(), next: 'me', phase: 'play' } } } });
  const lastRow = b.ids.onlineList.children.at(-1);
  assert.equal(lastRow.children[1].textContent, 'Ended by the host');
});
