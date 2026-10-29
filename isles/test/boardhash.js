'use strict';
/* Board hash equality: 1,000 seeds x both modes, Node vs Playwright chromium vs webkit.
   Run: node isles/test/boardhash.js   (needs `playwright` resolvable; no browser download is attempted) */
const { loadEngine, engineSource } = require('./load');
const { boardHash } = require('./hashfn');
let playwright;
try { playwright = require('playwright'); } catch (e) { console.log('playwright not available: ' + e.message); process.exit(2); }

const SEEDS = 1000;
const seedOf = i => (Math.imul(i + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
const MODES = ['base', 'seafarers'];

function hashesNode() {
  const E = loadEngine(), out = {};
  const pl = [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }];
  for (const mode of MODES) { out[mode] = []; for (let i = 0; i < SEEDS; i++) out[mode].push(boardHash(E.newGame({ mode, seed: seedOf(i), players: pl }).board)); }
  return out;
}

async function hashesBrowser(type) {
  let browser;
  try { browser = await type.launch(); } catch (e) { return { unavailable: String(e.message).split('\n')[0] }; }
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>t</title>');
    const out = await page.evaluate(([engineSrc, hashSrc, seeds, modes]) => {
      const Engine = new Function(engineSrc + '\nreturn Engine;')();
      const boardHash = new Function('return ' + hashSrc)();
      const res = {}, pl = [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }];
      for (const mode of modes) { res[mode] = seeds.map(seed => boardHash(Engine.newGame({ mode, seed, players: pl }).board)); }
      return { res, ua: navigator.userAgent };
    }, [engineSource(), boardHash.toString(), Array.from({ length: SEEDS }, (_, i) => seedOf(i)), MODES]);
    return { hashes: out.res, ua: out.ua, version: browser.version() };
  } finally { await browser.close(); }
}

(async () => {
  const node = hashesNode();
  const distinct = MODES.map(m => m + ' ' + new Set(node[m]).size + '/' + SEEDS + ' distinct boards').join(', ');
  console.log('node: ' + distinct);
  let bad = 0, compared = 0;
  for (const name of ['chromium', 'webkit']) {
    const r = await hashesBrowser(playwright[name]);
    if (r.unavailable) { console.log(`${name}: UNAVAILABLE (${r.unavailable})`); continue; }
    let diff = 0;
    for (const m of MODES) for (let i = 0; i < SEEDS; i++) if (r.hashes[m][i] !== node[m][i]) diff++;
    console.log(`${name} ${r.version}: ${diff === 0 ? 'all ' + (SEEDS * MODES.length) + ' board hashes equal Node' : diff + ' MISMATCHES vs Node'}  (${r.ua.slice(0, 80)})`);
    if (diff) bad++; compared++;
    if (name === 'chromium') globalThis.__chromium = r.hashes; else globalThis.__webkit = r.hashes;
  }
  if (globalThis.__chromium && globalThis.__webkit) {
    let diff = 0; for (const m of MODES) for (let i = 0; i < SEEDS; i++) if (globalThis.__chromium[m][i] !== globalThis.__webkit[m][i]) diff++;
    console.log(`chromium vs webkit: ${diff === 0 ? 'identical for ' + SEEDS * MODES.length + ' boards' : diff + ' MISMATCHES'}`);
    if (diff) bad++;
  }
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
