'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const origin = 'https://example.test/game-hub/';
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function serviceWorker({ offline = false, missing } = {}) {
  const handlers = {}, stores = new Map(), requests = [];
  const key = value => typeof value === 'string' ? new URL(value, origin).href : value.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async addAll(list) {
          const entries = list.map(request => {
            const relative = new URL(request.url).pathname.slice('/game-hub/'.length);
            const local = relative === '' || relative.endsWith('/') ? relative + 'index.html' : relative;
            if (local === missing) throw new Error('Unavailable asset ' + local);
            return [request.url, fs.readFileSync(path.join(root, local), 'utf8')];
          });
          entries.forEach(([url, body]) => data.set(url, body));
        },
        async match(request) { const body = data.get(key(request)); return body === undefined ? undefined : new Response(body); },
        async put(request, response) { data.set(key(request), await response.text()); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  class LocalRequest { constructor(url, options = {}) { this.url = new URL(url, origin).href; Object.assign(this, options); } }
  const context = vm.createContext({ URL, Request: LocalRequest, caches, Response,
    fetch: async request => { requests.push(key(request)); if (offline) throw new Error('Offline'); return new Response('new network release'); },
    self: { location: { href: origin + 'sw.js', origin: new URL(origin).origin }, clients: { claim: async () => {} },
      addEventListener(name, handler) { handlers[name] = handler; } }
  });
  vm.runInContext(source, context);
  async function event(name) { let pending; handlers[name]({ waitUntil(promise) { pending = promise; } }); await pending; }
  async function request(relative, mode = 'navigate') {
    let response;
    handlers.fetch({ request: { url: new URL(relative, origin).href, method: 'GET', mode }, respondWith(promise) { response = promise; } });
    return response;
  }
  return { handlers, stores, requests, event, request };
}

test('all shipped classic scripts parse and every local HTML dependency exists', () => {
  function walk(folder) { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.name.startsWith('.') || entry.name === 'node_modules' ? [] : entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]); }
  const files = walk(root);
  for (const file of files.filter(file => file.endsWith('.js') && !file.includes(path.sep + 'test' + path.sep))) {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(root, file) });
  }
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)) {
      const resource = match[1];
      if (/^(?:https?:|data:|#)/.test(resource)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), resource.split('?')[0])), `${path.relative(root, file)} references missing ${resource}`);
    }
  }
});

test('a complete release can launch all games and mode/room links offline', async () => {
  const worker = serviceWorker({ offline: true });
  await worker.event('install');
  for (const game of ['codex', 'isles', 'gems', 'sketch', 'ticket', 'ludo', 'connect4', 'azul', 'reversi', 'yahtzee']) {
    for (const suffix of ['?room=123456', '?mode=online', 'index.html?mode=solo']) {
      const response = await worker.request(game + '/' + suffix);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<html/i);
    }
    for (const asset of ['style.css', 'engine.js', 'game.js']) {
      assert.equal((await worker.request(game + '/' + asset, 'cors')).status, 200);
    }
  }
  assert.deepEqual(worker.requests, [], 'no executable asset falls back to network');
});

test('missing core asset rejects the next install without deleting the previous release', async () => {
  const worker = serviceWorker({ missing: 'shared/session.js' });
  worker.stores.set('gh-v4', new Map([['old', 'still available']]));
  await assert.rejects(worker.event('install'), /Unavailable asset/);
  assert.equal(worker.stores.get('gh-v4').get('old'), 'still available');
  assert.equal(worker.stores.get('gh-v9').size, 0, 'partial install was not populated');
});

test('cached assets stay in their release and query-versioned scripts never alias', async () => {
  const worker = serviceWorker();
  await worker.event('install');
  const original = await (await worker.request('shared/versions.js', 'cors')).text();
  assert.notEqual(original, 'new network release');
  assert.equal(await (await worker.request('shared/versions.js?release=future', 'cors')).text(), 'new network release');
  assert.equal(await (await worker.request('shared/versions.js', 'cors')).text(), original);
  assert.equal(worker.requests.length, 1);
});

test('activation removes only obsolete Game Hub caches', async () => {
  const worker = serviceWorker();
  for (const name of ['gh-v4', 'gh-v9', 'gh-fonts-v1', 'other-application']) worker.stores.set(name, new Map());
  await worker.event('activate');
  assert.deepEqual([...worker.stores.keys()].sort(), ['gh-fonts-v1', 'gh-v9', 'other-application']);
});
