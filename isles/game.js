
'use strict';
/* ===== UI ===== */
const E = Engine;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLORS = [
  { id: 'red', hex: '#d8432f' }, { id: 'blue', hex: '#2f64c9' }, { id: 'orange', hex: '#ee8a1e' },
  { id: 'white', hex: '#f1ede2' }, { id: 'green', hex: '#3d9a4b' }, { id: 'purple', hex: '#8a55cf' },
];
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dmitri', 'Esme', 'Finn', 'Greta', 'Hugo'];
const FILL = { wood: '#3f8a3c', brick: '#c8623a', sheep: '#9dcf55', wheat: '#e9bf3c', ore: '#8e94a3', gold: '#f2c230', desert: '#e3cd96', sea: '#2a7ca3' };
const RES_DOT = { wood: '#2f6e2d', brick: '#b24f2a', sheep: '#8cc63f', wheat: '#e2b028', ore: '#7f8594' };
const DEV_TEXT = {
  knight: 'Move the robber and steal a card. Three or more knights can win Largest Army (+2).',
  road: 'Build two roads (or ships) for free.',
  plenty: 'Take any two resources from the bank.',
  mono: 'Name a resource. Everyone gives you all of theirs.',
  vp: 'Worth 1 point. Stays hidden until the game ends.',
};
const DEV_SHORT = { knight: 'K', road: 'RB', plenty: 'YP', mono: 'M', vp: '1' };
const SAVE_KEY = 'sti.save.v1', CFG_KEY = 'sti.cfg.v1';

/* ---------- glyphs (drawn in a ±10 box) ---------- */
const GLYPH = {
  wood: '<path d="M0,-10 L7,0 L3.5,0 L9,7 L-9,7 L-3.5,0 L-7,0 Z" fill="#1d5527"/><rect x="-1.6" y="7" width="3.2" height="3.4" fill="#5b3a1e"/>',
  brick: '<g fill="#8e3418" stroke="#f0b090" stroke-width=".9"><rect x="-10" y="3" width="6.6" height="4.6"/><rect x="-3.3" y="3" width="6.6" height="4.6"/><rect x="3.4" y="3" width="6.6" height="4.6"/><rect x="-6.6" y="-1.6" width="6.6" height="4.6"/><rect x="0" y="-1.6" width="6.6" height="4.6"/><rect x="-3.3" y="-6.2" width="6.6" height="4.6"/></g>',
  sheep: '<g stroke="#3a3a3a" stroke-width="1.4"><line x1="-4" y1="3" x2="-4" y2="8"/><line x1="3" y1="3" x2="3" y2="8"/></g><path d="M-8,1 a3,3 0 0 1 2,-6 a3.5,3.5 0 0 1 6,-1.5 a3.5,3.5 0 0 1 6,2 a3,3 0 0 1 0,6 a3.5,3.5 0 0 1 -6,1 a3.5,3.5 0 0 1 -6,0 a3,3 0 0 1 -2,-1.5 Z" fill="#fbf8ef" stroke="#cfc6b0" stroke-width=".8"/><ellipse cx="8" cy="-2" rx="2.8" ry="2.3" fill="#3a3a3a"/>',
  wheat: '<g stroke="#9a6a0c" stroke-width="1.1" fill="#fbe07e"><line x1="0" y1="10" x2="0" y2="-4"/><line x1="0" y1="10" x2="-5" y2="-2"/><line x1="0" y1="10" x2="5" y2="-2"/><ellipse cx="0" cy="-7" rx="2" ry="3.4"/><ellipse cx="-5.6" cy="-5" rx="2" ry="3.4" transform="rotate(-22 -5.6 -5)"/><ellipse cx="5.6" cy="-5" rx="2" ry="3.4" transform="rotate(22 5.6 -5)"/></g>',
  ore: '<path d="M-10,8 L-3,-7 L1,-1 L4,-5 L10,8 Z" fill="#4f5562"/><path d="M-3,-7 L-5.4,-2 L-3,-3.2 L-1,-2.2 Z" fill="#f2f4f8"/><path d="M4,-5 L2.6,-2.2 L4.2,-2.8 L5.6,-2 Z" fill="#f2f4f8"/>',
  gold: '<path d="M-8,6 L-5,-1 L1,-3 L7,1 L8,6 Z" fill="#ffd84d" stroke="#a87808" stroke-width="1"/><path d="M-5,-1 L-1,2 L1,-3 M-1,2 L2,6" stroke="#a87808" stroke-width=".8" fill="none"/><path d="M5,-9 L6,-6 L9,-5 L6,-4 L5,-1 L4,-4 L1,-5 L4,-6 Z" fill="#fff"/>',
  desert: '<path d="M-10,6 Q-5,1 0,6 T10,6" fill="none" stroke="#b89150" stroke-width="1.4"/><path d="M-1,6 L-1,-6 M-1,-1 L-4,-1 L-4,-4 M-1,1 L2,1 L2,-3" stroke="#5a8a3c" stroke-width="2" fill="none" stroke-linecap="round"/>',
};
const ICON = {
  road: '<svg viewBox="0 0 30 22"><path d="M4 18 L26 4" stroke="#1a1a1a" stroke-width="7" stroke-linecap="round"/><path d="M4 18 L26 4" stroke="var(--ic, #e9e2cf)" stroke-width="4.5" stroke-linecap="round"/></svg>',
  settlement: '<svg viewBox="0 0 30 22"><path d="M8 20 V10 L15 3 L22 10 V20 Z" fill="var(--ic, #e9e2cf)" stroke="#1a1a1a" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  city: '<svg viewBox="0 0 30 22"><path d="M3 20 V11 H13 V7 L18.5 2 L24 7 V20 Z" fill="var(--ic, #e9e2cf)" stroke="#1a1a1a" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  ship: '<svg viewBox="0 0 30 22"><path d="M15 2 V14 M15 3 L24 13 H15" fill="var(--ic, #e9e2cf)" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 15 H26 L22 20 H8 Z" fill="#7a4b26" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  dev: '<svg viewBox="0 0 30 22"><rect x="8" y="1.5" width="14" height="19" rx="2.5" fill="#6b3fa0" stroke="#1a1a1a" stroke-width="1.6"/><path d="M15 6 l1.4 3 3.1.3-2.4 2 .8 3-2.9-1.6-2.9 1.6.8-3-2.4-2 3.1-.3Z" fill="#ffc94a"/></svg>',
  trade: '<svg viewBox="0 0 30 22"><path d="M5 7 H22 M18 3 L22 7 L18 11 M25 15 H8 M12 11 L8 15 L12 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  card: '<svg viewBox="0 0 12 12"><rect x="2" y="1" width="8" height="10" rx="1.5" fill="currentColor"/></svg>',
  sword: '<svg viewBox="0 0 12 12"><path d="M9.5 1.5 L10.5 2.5 L4.5 8.5 L3.5 7.5 Z M2.5 7 L5 9.5 M2 10 L3.3 8.7" stroke="currentColor" stroke-width="1.5" fill="currentColor"/></svg>',
  roadsm: '<svg viewBox="0 0 12 12"><path d="M2 10 L10 2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};
function glyphSvg(t, size) { return `<svg viewBox="-11 -11 22 22" width="${size || 26}" height="${size || 26}">${GLYPH[t] || ''}</svg>`; }

/* ---------- state ---------- */
let G = null;
const ui = {
  mode: null, revealed: null, undo: [], view: null, base: null, timer: null,
  edgeKind: 'road', trade: { tab: 'bank', give: null, get: null, pg: {}, pw: {} },
  flashHexes: [], newKeys: new Set(), gains: {}, modal: null, modalKey: null, picks: {}, sel: [], confirm: null,
  cfg: null, homeConfirm: false, lastActor: null, seat: null, notice: '',
};

/* Online play state (see the ONLINE section below). `ON.active` is false for every local game. */
const ON = { token: 0, unsub: null, active: false };

function defaultCfg() {
  return {
    mode: 'base', target: { base: 10, seafarers: 13 }, friendly: false, hideHands: true, speed: 'normal', level: 'normal', confirm: true,
    players: [
      { name: 'Player 1', color: 'red', bot: false },
      { name: 'Player 2', color: 'blue', bot: false },
      { name: 'Ada', color: 'orange', bot: true },
    ],
  };
}
function loadCfg() {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY)); if (c && c.players) return Object.assign(defaultCfg(), c); } catch (e) { }
  return defaultCfg();
}
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(ui.cfg)); } catch (e) { } }
function saveGame() {
  if (ON.active) return;   // online games never touch the local save
  try { if (G && G.phase !== 'gameover') localStorage.setItem(SAVE_KEY, JSON.stringify({ G, opts: { hideHands: ui.cfg.hideHands, speed: ui.cfg.speed } })); else localStorage.removeItem(SAVE_KEY); } catch (e) { }
}
function loadSave() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d && d.G && d.G.v === 1) return d; } catch (e) { } return null; }
function colorHex(id) { return (COLORS.find(c => c.id === id) || COLORS[0]).hex; }
function pcol(p) { return colorHex(G.players[p].color); }
function humans() { return G.players.filter(p => !p.bot); }
function privacyOn() { return !ON.active && ui.cfg.hideHands && humans().length > 1; }

/* ================= HOME ================= */
function miniBoard(mode) {
  const cells = mode === 'base'
    ? [[0, 0, 'wheat'], [1, 0, 'wood'], [-1, 0, 'sheep'], [0.5, -1, 'ore'], [-0.5, -1, 'brick'], [0.5, 1, 'wood'], [-0.5, 1, 'wheat']]
    : [[-1.2, 0, 'wood'], [-0.2, 0, 'wheat'], [-0.7, -1, 'brick'], [-0.7, 1, 'sheep'], [1.8, -0.6, 'gold'], [2.3, 0.4, 'ore']];
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return (cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2); }).join(' ');
  let s = '';
  if (mode !== 'base') s += `<path d="M1.6 1.4 L2.4 1.5 L2.2 1.8 L1.75 1.8 Z" fill="#7a4b26"/><path d="M2 1.4 V0.9 L2.35 1.35 Z" fill="#fff"/>`;
  cells.forEach(([q, r, t]) => { const cx = q * 1.732 * 0.5 * 2 * 0.5 + q * 0.0, cy = r * 1.5 * 0.5; s += `<polygon points="${hex(q * 0.866, cy, 0.48)}" fill="${FILL[t]}" stroke="#e8d8a8" stroke-width=".08"/>`; });
  return `<svg viewBox="-2.4 -1.3 5.4 2.6">${s}</svg>`;
}

function renderHome() {
  const cfg = ui.cfg;
  const save = loadSave();
  const sv = save && save.G;
  const contHtml = sv ? `<div class="card continue">
      <div><b>Continue game</b><small>${esc(sv.mode === 'seafarers' ? 'Seafarers' : 'Classic')} · ${sv.players.map(p => esc(p.name)).join(', ')} · turn ${Math.max(1, sv.turnNo)}</small></div>
      <button class="btn primary" data-act="continue">Resume</button></div>` : '';
  const rows = cfg.players.map((p, i) => `
    <div class="prow">
      <button class="swatch" style="background:${colorHex(p.color)}" data-act="cycle-color" data-i="${i}" aria-label="Change color"></button>
      <input id="pname-${i}" value="${esc(p.name)}" maxlength="14" data-i="${i}" aria-label="Player ${i + 1} name">
      <div class="seg" role="group"><button aria-pressed="${!p.bot}" data-act="set-human" data-i="${i}">Human</button><button aria-pressed="${p.bot}" data-act="set-bot" data-i="${i}">Bot</button></div>
      <button class="icon-btn" data-act="remove-player" data-i="${i}" ${cfg.players.length <= 2 ? 'disabled' : ''} aria-label="Remove player">✕</button>
    </div>`).join('');
  const nHum = cfg.players.filter(p => !p.bot).length;
  $('#home').innerHTML = `<div class="home-inner">
    <div class="hero">
      <svg viewBox="-1.9 -1.9 3.8 3.8">${[[0, 0, 'wheat'], [1.5, -0.87, 'wood'], [1.5, 0.87, 'ore'], [0, 1.73, 'sheep'], [-1.5, 0.87, 'brick'], [-1.5, -0.87, 'gold'], [0, -1.73, 'wood']].map(([x, y, t]) => `<polygon points="${Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k; return (x * .55 + .55 * Math.cos(a)).toFixed(2) + ',' + (y * .55 + .55 * Math.sin(a)).toFixed(2); }).join(' ')}" fill="${FILL[t]}" stroke="#0a2231" stroke-width=".07"/>`).join('')}<circle r=".3" fill="#fbf0d2"/><text y=".11" text-anchor="middle" font-size=".34" font-family="Fredoka, sans-serif" font-weight="700" fill="#c0261b">8</text></svg>
      <div><h1>Catan</h1><p>Build, trade and race to ${cfg.target[cfg.mode]} points. Play together on one device or against bots.</p></div>
    </div>
    ${ui.notice ? `<div class="card"><p style="margin:0;line-height:1.4">${esc(ui.notice)}</p></div>` : ''}
    ${contHtml}
    ${onlineAvailable() ? `<div class="card" id="online-card"><div class="label">Online</div><div class="opt"><div>Play on separate phones<small>Uses the map and options below. 2 to 4 players, no bots. Share a six-digit code.</small></div><button class="btn primary" data-act="online-open">Play online</button></div></div>` : ''}
    <div class="card">
      <div class="label">Map</div>
      <div class="modes">
        <button class="mode" aria-pressed="${cfg.mode === 'base'}" data-act="mode" data-m="base">${miniBoard('base')}<b>Classic</b><span>One island, 19 tiles. Roads, settlements, cities, cards.</span></button>
        <button class="mode" aria-pressed="${cfg.mode === 'seafarers'}" data-act="mode" data-m="seafarers">${miniBoard('seafarers')}<b>Seafarers</b><span>Sail ships to small islands. +2 points per new island. Gold fields and a pirate.</span></button>
      </div>
    </div>
    <div class="card">
      <div class="label">Players</div>
      <div class="presets">
        <button class="chip" data-act="preset" data-p="couple">Two of us</button>
        <button class="chip" data-act="preset" data-p="couple-bot">Two of us + bot</button>
        <button class="chip" data-act="preset" data-p="solo2">Me vs 2 bots</button>
        <button class="chip" data-act="preset" data-p="solo3">Me vs 3 bots</button>
      </div>
      ${rows}
      ${cfg.players.length < 4 ? '<button class="addp" data-act="add-player">+ Add player</button>' : ''}
    </div>
    <div class="card">
      <div class="label">Options</div>
      <div class="opt"><div>Points to win<small>${cfg.mode === 'seafarers' ? 'Seafarers usually plays to 13' : 'Classic plays to 10'}</small></div>
        <div class="stepper"><button data-act="target" data-d="-1" ${cfg.target[cfg.mode] <= 5 ? 'disabled' : ''} aria-label="Fewer points">−</button><output>${cfg.target[cfg.mode]}</output><button data-act="target" data-d="1" ${cfg.target[cfg.mode] >= 20 ? 'disabled' : ''} aria-label="More points">+</button></div></div>
      <div class="opt"><div>Hide hands between turns<small>${nHum > 1 ? 'Shows a “pass the device” screen so nobody peeks' : 'Only matters with two or more humans'}</small></div><button class="toggle" aria-pressed="${cfg.hideHands}" data-act="opt" data-k="hideHands" aria-label="Hide hands"></button></div>
      <div class="opt"><div>Confirm moves<small>Every build, trade and turn end asks “are you sure?” first</small></div><button class="toggle" aria-pressed="${cfg.confirm !== false}" data-act="opt" data-k="confirm" aria-label="Confirm moves"></button></div>
      <div class="opt"><div>Friendly robber<small>No robbing players with 2 points or less</small></div><button class="toggle" aria-pressed="${cfg.friendly}" data-act="opt" data-k="friendly" aria-label="Friendly robber"></button></div>
      ${cfg.players.some(p => p.bot) ? `<div class="opt"><div>Bot skill<small>${{ easy: 'Relaxed play, trades freely', normal: 'Solid play, picky about trades', hard: 'Sharp play, rarely helps the leader' }[cfg.level || 'normal']}</small></div><div class="seg"><button aria-pressed="${cfg.level === 'easy'}" data-act="level" data-l="easy">Easy</button><button aria-pressed="${(cfg.level || 'normal') === 'normal'}" data-act="level" data-l="normal">Normal</button><button aria-pressed="${cfg.level === 'hard'}" data-act="level" data-l="hard">Hard</button></div></div>` : ''}
      <div class="opt"><div>Bot speed</div><div class="seg"><button aria-pressed="${cfg.speed === 'slow'}" data-act="speed" data-s="slow">Relaxed</button><button aria-pressed="${cfg.speed === 'normal'}" data-act="speed" data-s="normal">Normal</button><button aria-pressed="${cfg.speed === 'fast'}" data-act="speed" data-s="fast">Fast</button></div></div>
    </div>
    ${sv && ui.homeConfirm ? `<div class="card"><p style="margin:0">Starting a new game replaces the saved one.</p><div class="confirm-row"><button class="btn" data-act="cancel-new">Keep it</button><button class="btn primary" data-act="start-force">Start new game</button></div></div>`
      : `<button class="btn primary big" data-act="start">Start game</button>`}
    <details class="rules"><summary>How to play</summary>
      <ul>
        <li>Each player places two settlements and two roads. The second settlement gives starting resources.</li>
        <li>On your turn, roll. Every tile with that number pays its resource to each touching settlement (cities get 2).</li>
        <li>Spend cards to build: roads, settlements, cities, development cards, and ships in Seafarers.</li>
        <li>A 7 moves the robber. Anyone holding more than 7 cards discards half. The roller steals one card.</li>
        <li>Trade with the bank at 4:1, or better at a harbor. Trade with other players any way you agree.</li>
        <li>Points: settlement 1, city 2, Longest Road (5+) 2, Largest Army (3+ knights) 2, point cards 1.</li>
        <li>Seafarers: ships link along water. Move one open-ended ship per turn. Gold fields pay any resource you like.</li>
      </ul>
    </details>
  </div>`;
}

function preset(kind) {
  const c = ui.cfg;
  const me = c.players.find(p => !p.bot) || { name: 'Player 1' };
  const second = c.players.filter(p => !p.bot)[1];
  const p2 = second ? second.name : 'Player 2';
  const bot = (i, col) => ({ name: BOT_NAMES[i], color: col, bot: true });
  if (kind === 'couple') c.players = [{ name: me.name, color: 'red', bot: false }, { name: p2, color: 'blue', bot: false }];
  if (kind === 'couple-bot') c.players = [{ name: me.name, color: 'red', bot: false }, { name: p2, color: 'blue', bot: false }, bot(0, 'orange')];
  if (kind === 'solo2') c.players = [{ name: me.name, color: 'red', bot: false }, bot(0, 'blue'), bot(1, 'orange')];
  if (kind === 'solo3') c.players = [{ name: me.name, color: 'red', bot: false }, bot(0, 'blue'), bot(1, 'orange'), bot(2, 'white')];
}

function startGame() {
  const c = ui.cfg;
  c.players.forEach((p, i) => { const inp = document.getElementById('pname-' + i); if (inp) p.name = inp.value.trim() || (p.bot ? BOT_NAMES[i] : 'Player ' + (i + 1)); });
  saveCfg();
  const order = E.shuffle(c.players.map((p, i) => i));
  G = E.newGame({ mode: c.mode, target: c.target[c.mode], friendly: c.friendly, level: c.level, players: order.map(i => c.players[i]) });
  log0();
  enterGame();
}
function log0() { ui.undo = []; ui.mode = null; ui.revealed = null; ui.modal = null; ui.modalKey = null; ui.gains = {}; ui.flashHexes = []; }

function enterGame() {
  $('#home').hidden = true; $('#game').hidden = false;
  ui.lastActor = E.actor(G);   // no chime on a new game, a rematch or a resume
  closeModal();
  renderStatic();
  afterAction();
}
function goHome() {
  clearTimeout(ui.timer); ui.timer = null;
  closeModal(); $('#curtain').hidden = true;
  $('#game').hidden = true; $('#home').hidden = false;
  ui.homeConfirm = false;
  renderHome();
  syncFloat();
}
function resumeSave() {
  const sv = loadSave(); if (!sv) { renderHome(); return false; }
  G = sv.G; G.fx = []; log0(); enterGame(); return true;
}
// The kit's floating menu button shows where the game has no topbar: setup screen and the pass-the-device curtain.
function syncFloat() { try { HubKit.setFloating(!$('#home').hidden || !$('#curtain').hidden); } catch (e) { } }

/* ================= BOARD ================= */
function hexPts(x, y, r) {
  return Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return (x + r * Math.cos(a)).toFixed(3) + ',' + (y + r * Math.sin(a)).toFixed(3); }).join(' ');
}
const DECOR = [[0, -0.56], [-0.5, 0.33], [0.5, 0.33]];
function renderStatic() {
  const B = G.board;
  const land = B.hexes.filter(h => h.terrain !== 'sea');
  const xs = land.map(h => h.x), ys = land.map(h => h.y);
  const m = 1.75;
  ui.base = { x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m };
  ui.view = Object.assign({}, ui.base);
  applyView();
  let s = '<defs><linearGradient id="island-glaze" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#ffffff" stop-opacity=".18"/><stop offset="1" stop-color="#10282b" stop-opacity=".12"/></linearGradient></defs>';
  // sea
  B.hexes.forEach(h => {
    if (h.terrain !== 'sea') return;
    s += `<polygon points="${hexPts(h.x, h.y, 1)}" fill="${FILL.sea}" stroke="#3a8db5" stroke-width=".03"/>`;
    s += `<path d="M${(h.x - 0.32).toFixed(2)},${(h.y + 0.1).toFixed(2)} q.08,-.08 .16,0 t.16,0 t.16,0 t.16,0" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width=".035" stroke-linecap="round"/>`;
  });
  // Raised wooden tiles, with a warm coastal rim.
  land.forEach(h => { s += `<polygon points="${hexPts(h.x, h.y + .07, 1.025)}" fill="#102c35" fill-opacity=".36"/>`; });
  // beaches + land
  land.forEach(h => { s += `<polygon points="${hexPts(h.x, h.y, 1.02)}" fill="#e6d3a1"/>`; });
  land.forEach(h => {
    s += `<polygon points="${hexPts(h.x, h.y, 0.93)}" fill="${FILL[h.terrain]}" stroke="#00000022" stroke-width=".02"/><polygon points="${hexPts(h.x, h.y, 0.93)}" fill="url(#island-glaze)"/>`;
    const g = GLYPH[h.terrain];
    if (g) DECOR.forEach(([dx, dy]) => { s += `<g transform="translate(${(h.x + dx).toFixed(3)},${(h.y + dy).toFixed(3)}) scale(.02)" opacity=".9">${g}</g>`; });
    if (h.number) {
      const red = h.number === 6 || h.number === 8;
      const pips = E.PIPS[h.number];
      s += `<circle cx="${h.x}" cy="${h.y}" r=".3" fill="#f7ecd0" stroke="#a88b54" stroke-width=".025"/>`;
      s += `<text class="num" x="${h.x}" y="${h.y + 0.07}" text-anchor="middle" font-size="${red ? 0.3 : 0.26}" fill="${red ? '#c0261b' : '#2b2116'}">${h.number}</text>`;
      for (let i = 0; i < pips; i++) s += `<circle cx="${(h.x + (i - (pips - 1) / 2) * 0.055).toFixed(3)}" cy="${h.y + 0.17}" r=".019" fill="${red ? '#c0261b' : '#2b2116'}"/>`;
    }
  });
  // ports
  B.ports.forEach(pt => {
    const sea = B.hexes[pt.hex], ed = B.edges[pt.edge];
    const bx = ed.x + (sea.x - ed.x) * 0.55, by = ed.y + (sea.y - ed.y) * 0.55;
    pt.v.forEach(v => {
      const vx = B.vertices[v];
      s += `<line x1="${bx}" y1="${by}" x2="${vx.x + (bx - vx.x) * 0.12}" y2="${vx.y + (by - vx.y) * 0.12}" stroke="#8b5e34" stroke-width=".07" stroke-linecap="round"/>`;
    });
    const any = pt.type === 'any';
    s += `<circle cx="${bx}" cy="${by}" r=".25" fill="#fbf6ea" stroke="${any ? '#6b5a40' : FILL[pt.type]}" stroke-width=".05"/>`;
    if (any) s += `<text class="num" x="${bx}" y="${by + 0.075}" text-anchor="middle" font-size=".2" fill="#2b2116">3:1</text>`;
    else s += `<g transform="translate(${bx},${by - 0.05}) scale(.012)">${GLYPH[pt.type]}</g><text class="num" x="${bx}" y="${by + 0.19}" text-anchor="middle" font-size=".12" fill="#2b2116">2:1</text>`;
  });
  $('#static').innerHTML = s;
}

function settlementPath(x, y, k) {
  k = k || 1;
  const p = [[-0.13, 0.11], [-0.13, -0.03], [0, -0.15], [0.13, -0.03], [0.13, 0.11]];
  return 'M' + p.map(([a, b]) => (x + a * k).toFixed(3) + ',' + (y + b * k).toFixed(3)).join(' L') + ' Z';
}
function cityPath(x, y) {
  const p = [[-0.22, 0.13], [0.22, 0.13], [0.22, -0.04], [0.02, -0.04], [0.02, -0.1], [-0.1, -0.21], [-0.22, -0.1]];
  return 'M' + p.map(([a, b]) => (x + a).toFixed(3) + ',' + (y + b).toFixed(3)).join(' L') + ' Z';
}
function shipSvg(x, y, col, cls) {
  return `<g class="${cls || ''}"><g transform="translate(${x.toFixed(3)},${y.toFixed(3)})"><path d="M0,-.04 V-.25 L.15,-.06 Z" fill="${col}" stroke="#1a1a1a" stroke-width=".022" stroke-linejoin="round"/><path d="M-.19,-.03 H.19 L.13,.07 H-.13 Z" fill="#7a4b26" stroke="#1a1a1a" stroke-width=".022" stroke-linejoin="round"/></g></g>`;
}

function spotsFor(viewer) {
  // returns {v:[ids], e:[{id,kind}], h:[ids]} for the current human actor
  const out = { v: [], e: [], h: [] };
  if (!G || G.phase === 'gameover') return out;
  const a = E.actor(G);
  if (G.players[a].bot || needCurtain() || (ON.active && a !== ui.seat)) return out;
  if (G.phase === 'setup') {
    if (G.setup.step === 'settlement') out.v = E.validSettlements(G, a, true);
    else {
      const k = setupEdgeKind();
      (k === 'ship' ? E.validShips(G, a, G.setup.vertex) : E.validRoads(G, a, G.setup.vertex)).forEach(id => out.e.push({ id, kind: k }));
    }
  } else if (G.phase === 'robber') out.h = E.robberTargets(G);
  else if (G.phase === 'roadBuilding') {
    const k = freeEdgeKind();
    if (G.players[a].pieces[k] > 0) (k === 'ship' ? E.validShips(G, a) : E.validRoads(G, a)).forEach(id => out.e.push({ id, kind: k }));
  } else if (G.phase === 'main' && ui.mode) {
    const k = ui.mode.kind;
    if (k === 'settlement' || k === 'city') out.v = E.buildSpots(G, a, k);
    else if (k === 'road' || k === 'ship') E.buildSpots(G, a, k).forEach(id => out.e.push({ id, kind: k }));
    else if (k === 'moveFrom') E.movableShips(G, a).forEach(id => out.e.push({ id, kind: 'movefrom' }));
    else if (k === 'moveTo') E.shipTargets(G, a, ui.mode.from).forEach(id => out.e.push({ id, kind: 'moveto' }));
  }
  return out;
}
function setupEdgeKind() {
  if (G.mode !== 'seafarers') return 'road';
  const a = G.current, sv = G.setup.vertex;
  const r = E.validRoads(G, a, sv).length, sh = E.validShips(G, a, sv).length;
  if (ui.edgeKind === 'ship' && sh) return 'ship';
  if (!r && sh) return 'ship';
  return 'road';
}
function freeEdgeKind() {
  if (G.mode !== 'seafarers') return 'road';
  const pl = G.players[G.current];
  const r = pl.pieces.road > 0 && E.validRoads(G, G.current).length, sh = pl.pieces.ship > 0 && E.validShips(G, G.current).length;
  if (ui.edgeKind === 'ship' && sh) return 'ship';
  if (!r && sh) return 'ship';
  return 'road';
}

function renderDynamic() {
  const B = G.board;
  let s = '';
  const fl = -(Date.now() - (ui.flashAt || 0));
  ui.flashHexes.forEach(id => { const h = B.hexes[id]; s += `<polygon class="flash" style="animation-delay:${fl}ms" points="${hexPts(h.x, h.y, 0.93)}" fill="#fff6c8"/>`; });
  const popDelay = `style="animation-delay:${-(Date.now() - (ui.popAt || 0))}ms"`;
  const sp = spotsFor();
  const myCol = pcol(E.actor(G));
  sp.h.forEach(id => {
    const h = B.hexes[id];
    s += `<polygon class="hl-hex" role="button" tabindex="0" aria-label="${esc(`Move ${h.terrain === 'sea' ? 'pirate' : 'robber'} to ${terrainLabel(h)}`)}" data-h="${id}" points="${hexPts(h.x, h.y, 0.9)}" fill="#ffffff" fill-opacity=".28" stroke="#fff" stroke-width=".09" stroke-dasharray=".2 .1"/>`;
  });
  // edges
  G.eb.forEach((o, e) => {
    if (!o) return;
    const ed = B.edges[e], a = B.vertices[ed.v[0]], b = B.vertices[ed.v[1]];
    const col = pcol(o.p);
    const cls = ui.newKeys.has('e' + e) ? 'pop" ' + popDelay + ' data-x="' : '';
    const sh = 0.16;
    const x1 = a.x + (b.x - a.x) * sh, y1 = a.y + (b.y - a.y) * sh, x2 = b.x - (b.x - a.x) * sh, y2 = b.y - (b.y - a.y) * sh;
    if (o.t === 'road') {
      s += `<g class="${cls}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1a1a1a" stroke-width=".17" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width=".11" stroke-linecap="round"/></g>`;
    } else {
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width=".05" stroke-dasharray=".08 .07" stroke-linecap="round"/>`;
      s += shipSvg(ed.x, ed.y + 0.06, col, cls);
    }
  });
  // robber & pirate
  if (G.robber !== null) {
    const h = B.hexes[G.robber], x = h.x + 0.36, y = h.y - 0.02;
    s += `<g transform="translate(${x},${y})"><ellipse cx="0" cy=".2" rx=".14" ry=".04" fill="#00000055"/><path d="M-.11,.2 Q-.12,-.02 -.05,-.07 A.08,.08 0 1 1 .05,-.07 Q.12,-.02 .11,.2 Z" fill="#3b3b42" stroke="#111" stroke-width=".02"/></g>`;
  }
  if (G.pirate !== null) {
    const h = B.hexes[G.pirate];
    s += `<g transform="translate(${h.x},${h.y}) scale(1.7)"><path d="M0,-.04 V-.25 L.15,-.06 Z" fill="#1d1d22"/><path d="M0,-.04 V-.25 L-.13,-.07 Z" fill="#2c2c33"/><path d="M-.2,-.03 H.2 L.14,.08 H-.14 Z" fill="#2a1a10" stroke="#000" stroke-width=".015"/><circle cx=".05" cy="-.13" r=".025" fill="#fff"/></g>`;
  }
  // buildings
  G.vb.forEach((b, v) => {
    if (!b) return;
    const vx = B.vertices[v], col = pcol(b.p);
    const cls = ui.newKeys.has('v' + v) ? 'pop" ' + popDelay + ' data-x="' : '';
    const d = b.t === 'city' ? cityPath(vx.x, vx.y) : settlementPath(vx.x, vx.y, 1.15);
    s += `<path class="${cls}" d="${d}" fill="${col}" stroke="#151515" stroke-width=".03" stroke-linejoin="round"/>`;
  });
  // edge spots
  sp.e.forEach(({ id, kind }) => {
    const ed = B.edges[id], a = B.vertices[ed.v[0]], b = B.vertices[ed.v[1]];
    const sh = 0.2;
    const x1 = a.x + (b.x - a.x) * sh, y1 = a.y + (b.y - a.y) * sh, x2 = b.x - (b.x - a.x) * sh, y2 = b.y - (b.y - a.y) * sh;
    const stroke = kind === 'movefrom' ? '#ffc94a' : '#ffffff';
    s += `<g class="spot" role="button" tabindex="0" aria-label="${esc(`${kind === 'movefrom' ? 'Select ship' : kind === 'moveto' ? 'Move ship' : 'Build ' + kind} at edge ${id + 1}`)}" data-e="${id}" data-k="${kind}"><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width=".38"/><g class="spot-e"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#10222c" stroke-opacity=".55" stroke-width=".2" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width=".11" stroke-linecap="round" stroke-dasharray="${kind === 'ship' || kind === 'moveto' ? '.09 .06' : 'none'}"/></g>${kind === 'movefrom' ? `<circle cx="${ed.x}" cy="${ed.y}" r=".22" fill="none" stroke="#ffc94a" stroke-width=".04"/>` : ''}</g>`;
  });
  sp.v.forEach(id => {
    const vx = B.vertices[id];
    s += `<g class="spot" role="button" tabindex="0" aria-label="${esc(`Build at corner ${id + 1}: ${siteResources(id)}`)}" data-v="${id}"><circle cx="${vx.x}" cy="${vx.y}" r=".3" fill="transparent"/><circle class="spot-v" cx="${vx.x}" cy="${vx.y}" r=".13" fill="#fff" stroke="${myCol}" stroke-width=".06"/></g>`;
  });
  if (ui.pending) s += ghostSvg();
  $('#dynamic').innerHTML = s;
}
function ghostSvg() {
  const B = G.board, p = ui.pending, col = pcol(E.actor(G)), kind = pendingKind();
  let g = '';
  if (p.h !== null) {
    const h = B.hexes[p.h];
    g += `<polygon points="${hexPts(h.x, h.y, 0.9)}" fill="#fff" fill-opacity=".35" stroke="#ffc94a" stroke-width=".1"/>`;
    g += kind === 'pirate'
      ? `<g transform="translate(${h.x},${h.y}) scale(1.7)" opacity=".85"><path d="M0,-.04 V-.25 L.15,-.06 Z" fill="#1d1d22"/><path d="M-.2,-.03 H.2 L.14,.08 H-.14 Z" fill="#2a1a10"/></g>`
      : `<g transform="translate(${h.x + 0.36},${h.y - 0.02})" opacity=".85"><path d="M-.11,.2 Q-.12,-.02 -.05,-.07 A.08,.08 0 1 1 .05,-.07 Q.12,-.02 .11,.2 Z" fill="#3b3b42" stroke="#ffc94a" stroke-width=".03"/></g>`;
  } else if (p.v !== null) {
    const vx = B.vertices[p.v];
    const d = kind === 'city' ? cityPath(vx.x, vx.y) : settlementPath(vx.x, vx.y, 1.15);
    g += `<circle cx="${vx.x}" cy="${vx.y}" r=".3" fill="none" stroke="#ffc94a" stroke-width=".05"/><path d="${d}" fill="${col}" fill-opacity=".75" stroke="#ffc94a" stroke-width=".04" stroke-linejoin="round"/>`;
  } else if (p.e !== null) {
    const ed = B.edges[p.e], a = B.vertices[ed.v[0]], b = B.vertices[ed.v[1]], sh = 0.16;
    const x1 = a.x + (b.x - a.x) * sh, y1 = a.y + (b.y - a.y) * sh, x2 = b.x - (b.x - a.x) * sh, y2 = b.y - (b.y - a.y) * sh;
    g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffc94a" stroke-width=".22" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-opacity=".85" stroke-width=".12" stroke-linecap="round"/>`;
    if (kind === 'ship') g += shipSvg(ed.x, ed.y + 0.06, col, '');
  }
  return `<g class="ghost" pointer-events="none">${g}</g>`;
}

/* ---------- view (pan / zoom) ---------- */
function applyView() { const v = ui.view; $('#board').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
function clampView() {
  const b = ui.base, v = ui.view;
  v.w = Math.min(b.w, Math.max(b.w / 3.5, v.w)); v.h = v.w * b.h / b.w;
  v.x = Math.min(b.x + b.w - v.w, Math.max(b.x, v.x));
  v.y = Math.min(b.y + b.h - v.h, Math.max(b.y, v.y));
}
function zoomAt(f, ux, uy) {
  const v = ui.view;
  if (ux === undefined) { ux = v.x + v.w / 2; uy = v.y + v.h / 2; }
  const nw = v.w * f, nh = v.h * f;
  v.x = ux - (ux - v.x) * f; v.y = uy - (uy - v.y) * f; v.w = nw; v.h = nh;
  clampView(); applyView();
}
function unitsPerPx() { const r = $('#board').getBoundingClientRect(); return Math.max(ui.view.w / r.width, ui.view.h / r.height); }
function toUnits(px, py, view) {
  const r = $('#board').getBoundingClientRect();
  const k = Math.max(view.w / r.width, view.h / r.height);
  const offX = (r.width - view.w / k) / 2, offY = (r.height - view.h / k) / 2;
  return { x: view.x + (px - r.left - offX) * k, y: view.y + (py - r.top - offY) * k, k };
}
const pz = { pts: new Map(), start: null, startView: null, moved: false, justDragged: false };
function setupPanZoom() {
  const svg = $('#board');
  svg.addEventListener('pointerdown', ev => {
    pz.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    pz.start = new Map([...pz.pts].map(([k, p]) => [k, Object.assign({}, p)]));
    pz.startView = Object.assign({}, ui.view);
    if (pz.pts.size === 1) pz.moved = false;
  });
  window.addEventListener('pointermove', ev => {
    if (!pz.pts.has(ev.pointerId)) return;
    pz.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const ids = [...pz.pts.keys()];
    if (ids.length === 1) {
      const p0 = pz.start.get(ids[0]); if (!p0) return;
      const dx = ev.clientX - p0.x, dy = ev.clientY - p0.y;
      if (!pz.moved && Math.hypot(dx, dy) < 8) return;
      if (ui.view.w >= ui.base.w - 1e-6) return; // nothing to pan when fully zoomed out
      pz.moved = true;
      const k = toUnits(0, 0, pz.startView).k;
      ui.view.x = pz.startView.x - dx * k; ui.view.y = pz.startView.y - dy * k;
      clampView(); applyView();
    } else if (ids.length >= 2) {
      const a0 = pz.start.get(ids[0]), b0 = pz.start.get(ids[1]);
      if (!a0 || !b0) return;
      const a1 = pz.pts.get(ids[0]), b1 = pz.pts.get(ids[1]);
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      if (d0 < 10 || d1 < 10) return;
      pz.moved = true;
      const f = d0 / d1;
      const sv = pz.startView;
      const m0 = toUnits((a0.x + b0.x) / 2, (a0.y + b0.y) / 2, sv);
      const nv = { w: sv.w * f, h: sv.h * f };
      const r = $('#board').getBoundingClientRect();
      const k1 = m0.k * f;
      const offX = (r.width - nv.w / k1) / 2, offY = (r.height - nv.h / k1) / 2;
      nv.x = m0.x - ((a1.x + b1.x) / 2 - r.left - offX) * k1;
      nv.y = m0.y - ((a1.y + b1.y) / 2 - r.top - offY) * k1;
      ui.view = nv; clampView(); applyView();
    }
  });
  const up = ev => {
    if (!pz.pts.has(ev.pointerId)) return;
    pz.pts.delete(ev.pointerId);
    if (pz.pts.size === 0) { if (pz.moved) pz.justDragged = true; setTimeout(() => { pz.justDragged = false; }, 60); }
    else { pz.start = new Map([...pz.pts].map(([k, p]) => [k, Object.assign({}, p)])); pz.startView = Object.assign({}, ui.view); }
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const u = toUnits(ev.clientX, ev.clientY, ui.view);
    zoomAt(ev.deltaY > 0 ? 1.12 : 1 / 1.12, u.x, u.y);
  }, { passive: false });
  svg.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const spot = ev.target.closest('[data-v],[data-e],[data-h]');
    if (!spot) return;
    ev.preventDefault();
    onBoardTap(spot);
    if (ui.pending) $('#dock [data-act="pending-yes"]')?.focus();
  });
  svg.addEventListener('click', ev => {
    if (pz.justDragged) { pz.justDragged = false; return; }
    const t = ev.target.closest('[data-v],[data-e],[data-h]');
    if (t) onBoardTap(t);
  });
}

/* ================= RENDER ================= */
function needCurtain() {
  if (!G || ON.active || G.phase === 'gameover' || G.phase === 'setup') return false;
  const a = E.actor(G);
  return !G.players[a].bot && privacyOn() && ui.revealed !== a;
}
function viewer() {
  if (!G) return null;
  if (ON.active) return ui.seat;   // online: you only ever see your own cards
  const a = E.actor(G);
  if (!G.players[a].bot && !needCurtain()) return a;
  const h = humans();
  if (h.length === 1) return h[0].id;
  if (privacyOn()) return null; // pass and play: keep hands hidden while others act
  if (ui.revealed !== null && !G.players[ui.revealed].bot) return ui.revealed;
  return h[0] ? h[0].id : null;
}

function render() {
  if (!G) return;
  const a = E.actor(G);
  if (!G.players[a].bot && (G.phase === 'setup' || !privacyOn())) ui.revealed = a;
  renderPlayers();
  renderDynamic();
  renderDice();
  renderTicker();
  renderDock();
  renderBoardGuide();
  renderStatus();
  renderCurtain();
  renderPhaseModal();
  syncFloat();
}

function renderPlayers() {
  const cur = G.phase === 'gameover' ? G.winner : G.current;
  const me = viewer();
  $('#players').innerHTML = G.players.map(p => {
    const pub = E.publicVP(G, p.id);
    const showHidden = G.phase === 'gameover' || p.id === me;
    const hid = E.hiddenVP(G, p.id);
    const badges = [];
    if (ON.active && p.id === ui.seat) badges.push('<span class="badge">YOU</span>');
    if (G.longest.p === p.id) badges.push('<span class="badge">ROAD</span>');
    if (G.army.p === p.id) badges.push('<span class="badge">ARMY</span>');
    const gain = ui.gains[p.id] ? `<span class="gain">+${ui.gains[p.id]}</span>` : '';
    return `<div class="pchip ${p.id === cur ? 'turn' : ''}" style="--pc:${colorHex(p.color)}">
      <div class="badges">${badges.join('')}</div>
      <div class="nm"><i></i><span>${esc(p.name)}</span></div>
      <div class="vp">${pub + (showHidden ? hid : 0)}<small>${showHidden && hid ? `incl. ${hid} hidden` : `/ ${G.target}`}</small></div>
      <div class="meta"><span title="Resource cards">${ICON.card}${E.handCount(p.hand)}</span><span title="Development cards" style="color:#c6a8f0">${ICON.card}${p.dev.length}</span>${p.knights ? `<span title="Knights played">${ICON.sword}${p.knights}</span>` : ''}${((G.longest.lens || [])[p.id] || 0) >= 3 ? `<span title="Longest road">${ICON.roadsm}${G.longest.lens[p.id]}</span>` : ''}</div>
      ${gain}
    </div>`;
  }).join('');
}

function dieHtml(n, red) {
  const L = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n];
  let s = '';
  for (let i = 1; i <= 9; i++) s += L.includes(i) ? `<b style="grid-area:${Math.ceil(i / 3)}/${(i - 1) % 3 + 1}"></b>` : '';
  return `<div aria-hidden="true" class="die ${red ? 'red-die' : ''}">${s}</div>`;
}
function renderDice() {
  const d = G.dice;
  // redraw only when a new roll happened, so the spin plays once per roll
  const key = d ? d.join(',') + ':' + G.turnNo + ':' + G.rollCounts.reduce((x, y) => x + y, 0) : '';
  if (ui.diceKey === key) return;
  ui.diceKey = key;
  $('#dice').setAttribute('aria-label', d ? `Dice: ${d[0]} and ${d[1]}, total ${d[0] + d[1]}` : 'Dice not rolled yet');
  $('#dice').innerHTML = d ? dieHtml(d[0], false) + dieHtml(d[1], true) + `<span class="dice-sum">${d[0] + d[1]}</span>` : '';
}
function renderTicker() {
  const last = G.log.slice(-2);
  $('#ticker').innerHTML = last.map(l => `<div>${l.p !== null ? `<i style="background:${pcol(l.p)}"></i>` : ''}${esc(l.t)}</div>`).join('');
}

function terrainLabel(hex) {
  const name = E.RES_NAME[hex.terrain] || (hex.terrain === 'gold' ? 'Gold' : hex.terrain === 'sea' ? 'Sea' : 'Desert');
  return name + (hex.number ? ' ' + hex.number : '');
}
function siteResources(id) {
  return G.board.vertices[id].hexes.map(h => G.board.hexes[h]).filter(h => h.terrain !== 'sea').map(terrainLabel).join(' · ');
}
function costLabel(kind) {
  return Object.entries(E.COST[kind]).map(([r, count]) => `${count} ${E.RES_NAME[r]}`).join(', ');
}
function renderBoardGuide() {
  const a = E.actor(G);
  if (G.phase === 'gameover' || G.players[a].bot || needCurtain() || (ON.active && a !== ui.seat)) return;
  let message = '';
  if (ui.pending && ui.pending.v !== null) message = siteResources(ui.pending.v);
  else if (G.phase === 'setup' && G.setup.step === 'settlement') message = 'Choose a glowing corner. Nearby tile numbers produce resources when rolled; more dots mean better odds.';
  else if (G.phase === 'setup') message = 'Choose a glowing edge beside your new settlement.';
  else if (ui.mode && E.COST[ui.mode.kind]) message = 'Cost: ' + costLabel(ui.mode.kind) + '. Choose a glowing spot on the board.';
  if (message) $('#dock').insertAdjacentHTML('beforeend', `<p class="board-guide">${esc(message)}</p>`);
  if (G.phase === 'main' && !ui.pending && !ui.mode) $('#dock').insertAdjacentHTML('beforeend', '<button class="cost-help" data-act="show-costs">Building costs & scoring <span aria-hidden="true">↗</span></button>');
}

function costDots(kind) {
  const c = E.COST[kind]; let s = '';
  Object.keys(c).forEach(r => { for (let i = 0; i < c[r]; i++) s += `<i style="background:${RES_DOT[r]}"></i>`; });
  return `<span class="cost" aria-hidden="true">${s}</span>`;
}

function handHtml(p, opts) {
  const pl = G.players[p];
  const bump = ui.bump || {};
  const cards = E.RES.map(r => `<div class="rcard ${pl.hand[r] ? '' : 'zero'} ${bump[r] ? 'bump' : ''}" title="${E.RES_NAME[r]}"><div class="art" style="background:${FILL[r]}">${glyphSvg(r, 26)}</div><span class="res-name">${esc(E.RES_NAME[r])}</span><div class="ct">${pl.hand[r]}</div></div>`).join('');
  const playable = ['knight', 'road', 'plenty', 'mono'].some(t => E.playableDev(G, p, t));
  const dev = `<button class="devbtn ${playable ? 'glow' : ''}" data-act="dev" ${opts && opts.noDev ? 'disabled' : ''}><b>${pl.dev.length}</b>Cards</button>`;
  return `<div class="hand">${cards}${dev}</div>`;
}

function renderDock() {
  const a = E.actor(G);
  const pa = G.players[a];
  const v = viewer();
  let prompt = '', body = '';
  const col = colorHex(pa.color);
  if (G.phase === 'gameover') {
    prompt = `${esc(G.players[G.winner].name)} wins!`;
    body = (v !== null ? handHtml(v, { noDev: true }) : '') + `<div class="row2"><button class="btn primary" data-act="show-results">See results</button>${ON.active ? '<button class="btn" data-act="leave">Leave game</button>' : '<button class="btn" data-act="home">New game</button>'}</div>`;
    $('#dock').innerHTML = `<div class="prompt" style="--pc:${pcol(G.winner)}"><i></i><span>${prompt}</span></div>${body}`;
    return;
  }
  if (ON.active && a !== ui.seat) { renderWaitingDock(a); return; }
  if (pa.bot || needCurtain()) {
    const what = pa.bot ? `<span class="thinking">${esc(pa.name)} is playing</span>` : `<span>Waiting for ${esc(pa.name)}</span>`;
    $('#dock').innerHTML = `<div class="prompt" style="--pc:${col}"><i></i>${what}</div>${v !== null ? handHtml(v, { noDev: true }) : ''}`;
    return;
  }
  // a human acts and may see their hand
  const pl = pa, me = a;
  if (ui.pending) {
    const what = { settlement: 'Build a settlement here?', city: 'Upgrade to a city here?', road: 'Build a road here?', ship: ui.mode && ui.mode.kind === 'moveTo' ? 'Sail the ship here?' : 'Place a ship here?', robber: 'Move the robber here?', pirate: 'Move the pirate here?' }[pendingKind()];
    $('#dock').innerHTML = `<div class="prompt" style="--pc:${col}"><i></i><span>${what} <small style="color:var(--muted);font-weight:700">Tap another spot to change it.</small></span></div>${handHtml(me, { noDev: true })}<div class="row2"><button class="btn" data-act="pending-no">Cancel</button><button class="btn primary big" data-act="pending-yes">Confirm</button></div>`;
    return;
  }
  if (G.phase === 'setup') {
    const first = G.setup.idx < G.players.length;
    if (G.setup.step === 'settlement') prompt = `${esc(pl.name)}: place your ${first ? 'first' : 'second'} settlement`;
    else prompt = `${esc(pl.name)}: place a ${setupEdgeKind()} next to it`;
    if (!first && G.setup.step === 'settlement') prompt += ' (it pays starting resources)';
    let extra = '';
    if (G.setup.step === 'road' && G.mode === 'seafarers' && E.validShips(G, me, G.setup.vertex).length && E.validRoads(G, me, G.setup.vertex).length) {
      extra = `<div class="row2"><div class="seg" role="group" style="flex:1"><button style="flex:1" aria-pressed="${setupEdgeKind() === 'road'}" data-act="edge-kind" data-k="road">Road</button><button style="flex:1" aria-pressed="${setupEdgeKind() === 'ship'}" data-act="edge-kind" data-k="ship">Ship</button></div></div>`;
    }
    body = handHtml(me, { noDev: true }) + extra;
  } else if (G.phase === 'roll') {
    prompt = `${esc(pl.name)}, your turn`;
    const knight = E.playableDev(G, me, 'knight');
    body = handHtml(me) + `<div class="row2">${knight ? '<button class="btn" data-act="play-knight" data-confirm="Play knight?">Play knight</button>' : ''}<button class="btn primary big" data-act="roll">Roll dice</button></div>`;
  } else if (G.phase === 'robber') {
    prompt = G.mode === 'seafarers' ? 'Move the robber (land) or the pirate (sea): tap a tile' : 'Move the robber: tap a tile';
    body = handHtml(me, { noDev: true });
  } else if (G.phase === 'roadBuilding') {
    const k = freeEdgeKind();
    prompt = `Free ${k} ${3 - G.freeRoads} of 2: tap a spot`;
    const both = G.mode === 'seafarers' && pl.pieces.ship > 0 && E.validShips(G, me).length && pl.pieces.road > 0 && E.validRoads(G, me).length;
    body = handHtml(me, { noDev: true }) + `<div class="row2">${both ? `<div class="seg" role="group" style="flex:1"><button style="flex:1" aria-pressed="${k === 'road'}" data-act="edge-kind" data-k="road">Road</button><button style="flex:1" aria-pressed="${k === 'ship'}" data-act="edge-kind" data-k="ship">Ship</button></div>` : ''}<button class="btn narrow" data-act="end-free" data-confirm="Skip?">Skip</button></div>`;
  } else if (G.phase === 'main') {
    if (ui.mode) {
      const k = ui.mode.kind;
      prompt = { road: 'Tap a glowing edge to build a road', ship: 'Tap a glowing edge to launch a ship', settlement: 'Tap a glowing corner to settle', city: 'Tap a settlement to upgrade it', moveFrom: 'Pick a ship to move (only open-ended ships can sail)', moveTo: 'Pick where the ship sails to' }[k];
    } else prompt = `${esc(pl.name)}: build, trade, or end your turn`;
    const kinds = ['road', 'settlement', 'city', G.mode === 'seafarers' ? 'ship' : null].filter(Boolean);
    const btn = k => {
      const can = E.canBuildKind(G, me, k);
      const on = ui.mode && ui.mode.kind === k;
      const label = { road: 'Road', settlement: 'Settle', city: 'City', ship: 'Ship' }[k];
      return `<button class="act ${on ? 'on' : ''}" data-act="build" data-k="${k}" aria-pressed="${!!on}" title="${esc(costLabel(k))}" aria-label="${label}: ${esc(costLabel(k))}" ${can || on ? '' : 'disabled'} style="--ic:${col}"><span class="ic">${ICON[k]}</span><span class="lb">${label}</span>${costDots(k)}</button>`;
    };
    const canDev = E.canAfford(G, me, 'dev') && G.deck.length > 0;
    const actions = kinds.map(btn).join('') + `<button class="act" data-act="buy-dev" data-confirm="Buy?" title="${esc(costLabel('dev'))}" aria-label="Development card: ${esc(costLabel('dev'))}" ${canDev ? '' : 'disabled'}><span class="ic">${ICON.dev}</span><span class="lb">Card</span>${costDots('dev')}</button>`;
    const cols = kinds.length + 1;
    const movable = G.mode === 'seafarers' && E.movableShips(G, me).length > 0;
    const row2 = [];
    if (ui.mode) row2.push('<button class="btn" data-act="cancel-mode">Cancel</button>');
    else {
      if (ui.undo.length) row2.push('<button class="btn narrow" data-act="undo" aria-label="Undo">Undo</button>');
      row2.push('<button class="btn" data-act="trade">Trade</button>');
      if (movable) row2.push('<button class="btn" data-act="move-ship">Move ship</button>');
      row2.push('<button class="btn primary" data-act="end-turn" data-confirm="Tap again to end">End turn</button>');
    }
    body = handHtml(me) + `<div class="actions" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${actions}</div><div class="row2">${row2.join('')}</div>`;
  } else {
    // discard / steal / gold / offer happen in a sheet
    if (G.phase === 'discard') prompt = `${esc(pl.name)}: discard half your cards`;
    else if (G.phase === 'steal') prompt = 'Choose who to rob';
    else if (G.phase === 'gold') prompt = `${esc(pl.name)}: pick your gold`;
    else if (G.phase === 'offer' && G.offer) prompt = `${esc(G.players[G.offer.from].name)} offers a trade`;
    body = handHtml(me, { noDev: true });
  }
  $('#dock').innerHTML = `<div class="prompt" style="--pc:${col}"><i></i><span>${prompt}</span></div>${body}`;
}

function renderCurtain() {
  const c = $('#curtain');
  if (!needCurtain()) { c.hidden = true; return; }
  const a = E.actor(G), pl = G.players[a];
  const why = { roll: 'It’s your turn.', discard: 'A 7 was rolled. You need to discard.', gold: 'You have gold to collect.', offer: `${esc(G.players[G.offer ? G.offer.from : 0].name)} wants to trade with you.`, steal: 'Choose who to rob.', robber: 'Move the robber.', main: 'Your turn continues.', roadBuilding: 'Place your free roads.' }[G.phase] || '';
  c.style.setProperty('--pc', colorHex(pl.color));
  c.innerHTML = `<p>Pass the device to</p><h2>${esc(pl.name)}</h2><p>${why}</p><button class="btn primary big" data-act="reveal">I’m ${esc(pl.name)}, show my cards</button>`;
  c.hidden = false;
}

/* ================= MODALS ================= */
function openModal(kind, key) { ui.modal = kind; ui.modalKey = key || kind; ui.animModal = true; drawModal(); }
function closeModal() { ui.modal = null; ui.modalKey = null; ui.picks = {}; ui.sel = []; ui.confirm = null; const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
function sheet(title, inner, closable) {
  return `<div class="modal-back ${ui.animModal ? '' : 'still'}" data-act="${closable ? 'close-modal-bg' : ''}"><div class="sheet" role="dialog" aria-label="${esc(title)}"><header><h2>${title}</h2>${closable ? '<button class="icon-btn" data-act="close-modal" aria-label="Close">✕</button>' : ''}</header>${inner}</div></div>`;
}
function stepperGrid(prefix, values, limits, extra) {
  return `<div class="res-grid">${E.RES.map(r => `<div class="cnt"><div class="rpick" style="width:100%"><div class="art" style="background:${FILL[r]}">${glyphSvg(r, 26)}</div>${E.RES_NAME[r]}${extra ? `<small>${extra(r)}</small>` : ''}</div>
    <div class="stepper"><button data-act="${prefix}" data-r="${r}" data-d="1" ${values[r] >= limits[r] ? 'disabled' : ''} aria-label="More ${E.RES_NAME[r]}">+</button><output>${values[r] || 0}</output><button data-act="${prefix}" data-r="${r}" data-d="-1" ${!values[r] ? 'disabled' : ''} aria-label="Less ${E.RES_NAME[r]}">−</button></div></div>`).join('')}</div>`;
}
function drawModal() {
  const m = $('#modal');
  if (!ui.modal || !G && ui.modal !== 'none') { m.hidden = true; return; }
  const k = ui.modal;
  let html = '';
  const a = G ? E.actor(G) : null;
  if (k === 'discard') {
    const q = G.discardQ[0], pl = G.players[q.p];
    const picks = Object.assign(E.emptyHand(), ui.picks);
    const tot = E.RES.reduce((s, r) => s + picks[r], 0);
    html = sheet(`${esc(pl.name)}: discard ${q.n}`, `<p>A 7 was rolled and you hold ${E.handCount(pl.hand)} cards. Choose ${q.n} to return to the bank.</p>
      ${stepperGrid('pick', picks, pl.hand, r => `have ${pl.hand[r]}`)}
      <button class="btn primary big" data-act="do-discard" data-confirm="Tap again to discard" ${tot === q.n ? '' : 'disabled'}>Discard ${tot} of ${q.n}</button>`);
  } else if (k === 'gold') {
    const q = G.goldQ[0], pl = G.players[q.p];
    const need = Math.min(q.n, E.RES.reduce((s, r) => s + G.bank[r], 0));
    const picks = Object.assign(E.emptyHand(), ui.picks);
    const tot = E.RES.reduce((s, r) => s + picks[r], 0);
    const lim = {}; E.RES.forEach(r => { lim[r] = tot >= need ? picks[r] : G.bank[r]; });
    html = sheet(`${esc(pl.name)}: gold!`, `<p>Your gold field paid out. Take any ${need} resource${need > 1 ? 's' : ''}.</p>
      ${stepperGrid('pick', picks, lim, r => `bank ${G.bank[r]}`)}
      <button class="btn primary big" data-act="do-gold" data-confirm="Tap again to take" ${tot === need ? '' : 'disabled'}>Take ${tot} of ${need}</button>`);
  } else if (k === 'steal') {
    html = sheet('Rob a player', `<p>Take one random card from:</p>${G.stealFrom.map(p => `<div class="who"><i style="background:${pcol(p)}"></i><div class="n">${esc(G.players[p].name)}<small>${E.handCount(G.players[p].hand)} cards</small></div><button class="btn primary" data-act="do-steal" data-confirm="Sure?" data-p="${p}">Rob</button></div>`).join('')}`);
  } else if (k === 'offer') {
    const o = G.offer;
    html = sheet(`${esc(G.players[o.from].name)} wants to trade`, `<div class="who"><i style="background:${pcol(o.from)}"></i><div class="n">You get<small>${esc(E.describe(o.give))}</small></div></div>
      <div class="who"><i style="background:${pcol(o.to)}"></i><div class="n">You give<small>${esc(E.describe(o.get))}</small></div></div>
      <div class="label">Your cards</div>
      <div class="hand">${E.RES.map(r => { const n = G.players[o.to].hand[r], d = (o.give[r] || 0) - (o.get[r] || 0); return `<div class="rcard ${n ? '' : 'zero'}" title="${E.RES_NAME[r]}"><div class="art" style="background:${FILL[r]}">${glyphSvg(r, 26)}</div><div class="ct">${n}${d ? `<small style="font-size:.7rem;color:${d > 0 ? '#2b7a3a' : '#b0301f'}"> ${d > 0 ? '+' : ''}${d}</small>` : ''}</div></div>`; }).join('')}</div>
      ${E.RES.every(r => (o.get[r] || 0) <= G.players[o.to].hand[r]) ? '' : '<p>You don’t have those cards.</p>'}
      <div class="confirm-row"><button class="btn" data-act="offer-no" data-confirm="Decline?">Decline</button><button class="btn primary" data-act="offer-yes" data-confirm="Accept?" ${E.RES.every(r => (o.get[r] || 0) <= G.players[o.to].hand[r]) ? '' : 'disabled'}>Accept</button></div>`);
  } else if (k === 'trade') html = tradeModal();
  else if (k === 'dev') html = devModal();
  else if (k === 'log') html = sheet('Game log', `<div class="loglist">${G.log.slice().reverse().map(l => `<div>${l.p !== null ? `<i style="background:${pcol(l.p)}"></i>` : ''}${esc(l.t)}</div>`).join('')}</div>`, true);
  else if (k === 'costs') html = sheet('Building costs', costsHtml(), true);
  else if (k === 'results') html = resultsModal();
  else if (k === 'leave') html = sheet('Leave this game?', `<p>The game goes on without you until you come back. Open it again from the game link or the Online list on the hub.</p><div class="confirm-row"><button class="btn" data-act="close-modal">Stay</button><button class="btn primary" data-act="leave">Leave game</button></div>`, true);
  const old = m.querySelector('.sheet');
  const top = old ? old.scrollTop : 0;
  m.innerHTML = html; m.hidden = false;
  if (!ui.animModal) { const sh = m.querySelector('.sheet'); if (sh) sh.scrollTop = top; }
  ui.animModal = false;
}
function costsHtml() {
  const row = (label, kind) => `<div>${label}</div><div>${esc(costLabel(kind))}</div>`;
  return `<div class="costs">${row('Road', 'road')}${row('Settlement (1 point)', 'settlement')}${row('City (2 points)', 'city')}${G && G.mode === 'seafarers' ? row('Ship', 'ship') : ''}${row('Development card', 'dev')}</div>
    <p>${E.RES.map(r => `<span style="color:${RES_DOT[r]};font-weight:800">■</span> ${E.RES_NAME[r]}`).join(' &nbsp; ')}</p>
    <p>Longest Road (5+ in a row) and Largest Army (3+ knights) are worth 2 points each.${G && G.mode === 'seafarers' ? ' Your first settlement on each new island is worth 2 extra points.' : ''}</p>
    ${G ? `<p>Bank: ${E.RES.map(r => `<span style="color:${RES_DOT[r]};font-weight:800">■</span> ${G.bank[r]}`).join(' &nbsp; ')} · Dev cards left: ${G.deck.length} · Playing to ${G.target}</p>` : ''}`;
}

function tradeModal() {
  const me = ON.active ? ui.seat : G.current, pl = G.players[me], t = ui.trade;
  const tabs = `<div class="tabs"><button aria-pressed="${t.tab === 'bank'}" data-act="trade-tab" data-t="bank">Bank & harbors</button><button aria-pressed="${t.tab === 'players'}" data-act="trade-tab" data-t="players">Players</button></div>`;
  let inner = '';
  if (t.tab === 'bank') {
    const give = E.RES.map(r => { const ratio = E.tradeRatio(G, me, r); const ok = pl.hand[r] >= ratio; return `<button class="rpick" aria-pressed="${t.give === r}" data-act="bank-give" data-r="${r}" ${ok ? '' : 'disabled'}><div class="art" style="background:${FILL[r]}">${glyphSvg(r, 24)}</div>${ratio}:1<small>have ${pl.hand[r]}</small></button>`; }).join('');
    const get = E.RES.map(r => `<button class="rpick" aria-pressed="${t.get === r}" data-act="bank-get" data-r="${r}" ${G.bank[r] > 0 && r !== t.give ? '' : 'disabled'}><div class="art" style="background:${FILL[r]}">${glyphSvg(r, 24)}</div>${E.RES_NAME[r]}<small>bank ${G.bank[r]}</small></button>`).join('');
    const ok = t.give && t.get && t.give !== t.get && pl.hand[t.give] >= E.tradeRatio(G, me, t.give) && G.bank[t.get] > 0;
    inner = `<div class="label">You give</div><div class="res-grid">${give}</div><div class="label">You get 1</div><div class="res-grid">${get}</div>
      <button class="btn primary big" data-act="do-bank" data-confirm="Tap again to trade" ${ok ? '' : 'disabled'}>${ok ? `Trade ${E.tradeRatio(G, me, t.give)} ${E.RES_NAME[t.give]} for 1 ${E.RES_NAME[t.get]}` : 'Pick what to give and get'}</button>`;
  } else {
    const pg = Object.assign(E.emptyHand(), t.pg), pw = Object.assign(E.emptyHand(), t.pw);
    const lim = {}; E.RES.forEach(r => { lim[r] = 9; });
    const giveLim = {}; E.RES.forEach(r => { giveLim[r] = pl.hand[r]; });
    const ready = E.handCount(pg) > 0 && E.handCount(pw) > 0;
    const mine = ready && E.RES.every(r => pg[r] <= pl.hand[r]);
    const L = Bot.LEVELS[G.level] || Bot.LEVELS.normal;
    const others = G.players.filter(o => o.id !== me).map(o => {
      let status = `${E.handCount(o.hand)} cards`;
      if (o.bot && G.talk && ((G.talk.accepts[o.id] || 0) >= L.maxAccepts || (G.talk.declines[o.id] || 0) >= L.maxDeclines)) status = 'Done trading this turn';
      else if (!o.bot && !ON.active) status += ' · agree out loud first';
      const label = o.bot || ON.active ? 'Offer' : 'Trade';
      return `<div class="who"><i style="background:${colorHex(o.color)}"></i><div class="n">${esc(o.name)}<small>${status}</small></div><button class="btn primary" data-act="do-ptrade" data-confirm="Sure?" data-p="${o.id}" ${mine && !(ON.active && G.offerMade >= E.MAX_OFFERS) ? '' : 'disabled'}>${label}</button></div>`;
    }).join('');
    inner = `<div class="label">You give</div>${stepperGrid('pg', pg, giveLim)}<div class="label">You want</div>${stepperGrid('pw', pw, lim)}<p>${ready ? (ON.active ? `Send this offer to one player. They can accept or decline. ${Math.max(0, E.MAX_OFFERS - G.offerMade)} offers left this turn.` : 'Send this offer to:') : 'Pick what you give and what you want.'}</p>${others}`;
  }
  return sheet('Trade', tabs + inner, true);
}

function devModal() {
  const me = viewer();
  if (me === null) return sheet('Development cards', '<p>No cards to show.</p>', true);
  const pl = G.players[me];
  const groups = {};
  pl.dev.forEach(d => { (groups[d.type] = groups[d.type] || []).push(d); });
  const isTurn = G.current === me && E.actor(G) === me;
  let list = Object.keys(groups).map(t => {
    const n = groups[t].length;
    const can = isTurn && E.playableDev(G, me, t);
    const fresh = groups[t].every(d => d.turn >= G.turnNo);
    let why = '';
    if (t !== 'vp' && !can) why = G.devPlayed && isTurn ? 'One card per turn' : (fresh && isTurn ? 'New this turn' : (isTurn ? '' : 'Play on your turn'));
    let ctl = t === 'vp' ? '' : `<button class="btn ${can ? 'primary' : ''}" data-act="play-dev" data-t="${t}" ${t === 'knight' || t === 'road' ? 'data-confirm="Sure?"' : ''} ${can ? '' : 'disabled'}>Play</button>`;
    return `<div class="devcard"><div class="pic">${DEV_SHORT[t]}</div><div><b>${E.DEV_NAME[t]}${n > 1 ? ' ×' + n : ''}</b><small>${DEV_TEXT[t]}${why ? ' · ' + why : ''}</small></div>${ctl}</div>`;
  }).join('');
  if (!list) list = '<p>You have no development cards. Buy one for 1 Wool, 1 Grain, 1 Ore.</p>';
  let picker = '';
  if (ui.confirm === 'plenty' || ui.confirm === 'mono') {
    const n = ui.confirm === 'plenty' ? 2 : 1;
    picker = `<div class="label">${ui.confirm === 'plenty' ? 'Pick two resources (tap twice for two of one)' : 'Pick a resource to collect'}</div>
      <div class="res-grid">${E.RES.map(r => { const c = ui.sel.filter(x => x === r).length; return `<button class="rpick" aria-pressed="${c > 0}" data-act="dev-sel" data-r="${r}" ${ui.confirm === 'plenty' && G.bank[r] <= c ? 'disabled' : ''}><div class="art" style="background:${FILL[r]}">${glyphSvg(r, 24)}</div>${E.RES_NAME[r]}${c ? `<small>×${c}</small>` : ''}</button>`; }).join('')}</div>
      <div class="confirm-row"><button class="btn" data-act="dev-sel-clear">Clear</button><button class="btn primary" data-act="dev-confirm" data-confirm="Tap again to play" ${ui.sel.length === n ? '' : 'disabled'}>Play ${E.DEV_NAME[ui.confirm]}</button></div>`;
  }
  return sheet('Development cards', `<div class="devlist">${list}</div>${picker}<p>${G.deck.length} cards left in the deck.</p>`, true);
}

function resultsModal() {
  const rows = G.players.map(p => {
    let set = 0, cit = 0;
    G.vb.forEach(b => { if (b && b.p === p.id) b.t === 'city' ? cit++ : set++; });
    return { p, set, cit, lr: G.longest.p === p.id ? 2 : 0, la: G.army.p === p.id ? 2 : 0, vp: E.hiddenVP(G, p.id), isl: p.bonusVP, tot: E.totalVP(G, p.id) };
  }).sort((a, b) => b.tot - a.tot);
  const sea = G.mode === 'seafarers';
  const hist = G.rollCounts.slice(2).map((c, i) => `${i + 2}:${c}`).join(' · ');
  return sheet(`${esc(G.players[G.winner].name)} wins!`, `<div style="overflow-x:auto"><table class="score-table"><tr><th></th><th>Builds</th><th>Road</th><th>Army</th>${sea ? '<th>Isles</th>' : ''}<th>Cards</th><th>Total</th></tr>
    ${rows.map(r => `<tr><td><span style="color:${colorHex(r.p.color)};font-weight:800">●</span> ${esc(r.p.name)}</td><td>${r.set + r.cit * 2}</td><td>${r.lr}</td><td>${r.la}</td>${sea ? `<td>${r.isl}</td>` : ''}<td>${r.vp}</td><td><b>${r.tot}</b></td></tr>`).join('')}</table></div>
    <p>Dice rolls this game: ${hist}</p>
    ${ON.active ? '<div class="confirm-row"><button class="btn" data-act="close-modal">See the board</button><button class="btn primary" data-act="leave">Leave game</button></div>' : '<div class="confirm-row"><button class="btn" data-act="home">Change setup</button><button class="btn primary" data-act="rematch">Play again</button></div>'}`, true);
}

function renderPhaseModal() {
  const a = E.actor(G);
  const human = ON.active ? a === ui.seat : (!G.players[a].bot && !needCurtain());
  const phaseModal = { discard: 'discard', gold: 'gold', steal: 'steal', offer: 'offer' }[G.phase];
  if (human && phaseModal) {
    const key = phaseModal + ':' + a + ':' + (G.discardQ.length) + ':' + (G.goldQ.length);
    if (ui.modalKey !== key) { ui.picks = {}; openModal(phaseModal, key); }
    else drawModal();
    return;
  }
  if (['discard', 'gold', 'steal', 'offer'].includes(ui.modal)) closeModal();
  if (ui.modal === 'trade' && G.phase !== 'main') closeModal();
  if (ui.modal === 'dev' && G.players[a].bot) closeModal();
  if (ui.modal) drawModal();
}

/* ================= ACTIONS ================= */
function sfx(name, quiet) { try { HubKit.sfx(name, quiet ? { volume: 0.6 } : undefined); } catch (e) { } }
function toast(msg, color, isErr) {
  if (isErr) sfx('error');
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  if (color) el.style.setProperty('--tc', color);
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), isErr ? 2200 : 2800);
}

/* Runs one player action: through the engine on this device in a local game, as a record in an online game. */
function perform(name, args, localFn, opts) { return ON.active ? sendOnline(name, args) : act(localFn, opts); }

function act(fn, opts) {
  if (!G) return;
  const snap = opts && opts.undo ? JSON.stringify(G) : null;
  const r = fn();
  if (!r || !r.ok) { toast(r ? r.err : 'Not possible', null, true); return false; }
  if (snap) ui.undo.push(snap); else ui.undo = [];
  afterAction();
  return true;
}

/* A bot, or in an online game any seat but yours, plays quieter. */
function quiet(p) { return ON.active ? p !== ui.seat : !!G.players[p].bot; }

function processFx() {
  const v = viewer();
  const fxs = G.fx.splice(0);
  let flash = null;
  fxs.forEach(f => {
    const q = f.p !== undefined && quiet(f.p);   // bot and remote-player actions play quieter
    if (f.type === 'build') {
      if (!ui.newKeys.size) ui.popAt = Date.now(); ui.newKeys.add((f.kind === 'settlement' || f.kind === 'city' ? 'v' : 'e') + f.id);
      sfx('build', q); if (f.kind === 'city') sfx('score', q);
    }
    if (f.type === 'roll') {
      sfx('dice', q);
      const d = $('#dice'); d.classList.remove('rolling'); void d.offsetWidth; d.classList.add('rolling');
      clearTimeout(ui.rollTimer); ui.rollTimer = setTimeout(() => d.classList.remove('rolling'), 600);
      if (f.dice[0] + f.dice[1] === 7) toast(`${G.players[f.p].name} rolled 7: robber time`, pcol(f.p));
    }
    if (f.type === 'produce') {
      flash = f.hexes;
      ui.gains = {};
      const bump = {};
      Object.keys(f.gains).forEach(p => {
        ui.gains[p] = E.RES.reduce((s, r) => s + (f.gains[p][r] || 0), 0);
        if (+p === v) Object.keys(f.gains[p]).forEach(r => { bump[r] = 1; });
      });
      Object.keys(f.gold || {}).forEach(p => { ui.gains[p] = (ui.gains[p] || 0) + f.gold[p]; });
      ui.bump = bump;
      if (Object.keys(ui.gains).some(p => ui.gains[p] > 0 && !G.players[p].bot)) { const bq = quiet(E.actor(G)); setTimeout(() => sfx('draw', bq), 380); }
      setTimeout(() => { ui.gains = {}; ui.bump = {}; if (G) renderPlayers(); }, 1900);
    }
    if (f.type === 'robber') sfx('thud', q);
    if (f.type === 'discard') sfx('swish', q);
    if (f.type === 'bank') sfx('coin', q);
    if (f.type === 'dev') sfx('flip', q);
    if (f.type === 'play') sfx('flip', q);
    if (f.type === 'steal') {
      sfx('swish', quiet(f.to));
      const what = E.RES_NAME[f.res];
      if (f.from === v) toast(`${G.players[f.to].name} stole your ${what}`, pcol(f.to));
      else if (f.to === v) toast(`You stole ${what} from ${G.players[f.from].name}`, pcol(f.to));
      else toast(`${G.players[f.to].name} robbed ${G.players[f.from].name}`, pcol(f.to));
    }
    if (f.type === 'award') toast(`${G.players[f.p].name}: ${f.what}`, pcol(f.p));
    if (f.type === 'dev' && f.p === v && !G.players[f.p].bot) toast(`You drew: ${E.DEV_NAME[f.card]}`, '#8a55cf');
    if (f.type === 'play' && quiet(f.p)) toast(`${G.players[f.p].name} played ${E.DEV_NAME[f.card]}`, pcol(f.p));
    if (f.type === 'mono') toast(`${G.players[f.p].name} took ${f.n} ${E.RES_NAME[f.res]} with Monopoly`, pcol(f.p));
    if (f.type === 'trade') sfx('coin', quiet(f.a) && quiet(f.b));
    if (f.type === 'trade' && !f.offer && (G.players[f.a].bot || G.players[f.b].bot)) toast(`${G.players[f.a].name} traded with ${G.players[f.b].name}`, pcol(f.a));
    if (f.type === 'win') setTimeout(() => { sfx(G && !quiet(f.p) ? 'win' : 'end'); openModal('results'); }, 900);
  });
  if (flash && flash.length) {
    ui.flashHexes = flash; ui.flashAt = Date.now();
    setTimeout(() => { ui.flashHexes = []; }, 1700);
  }
  if (ui.newKeys.size) setTimeout(() => { ui.newKeys.clear(); }, 600);
}

function afterAction() {
  if (!G) return;
  ui.pending = null;
  processFx();
  // chime when control passes from someone else to a human (also the pass-the-device screen in pass and play)
  const actor = E.actor(G);
  if (!ON.active && ui.lastActor !== null && ui.lastActor !== actor && G.phase !== 'gameover' && !G.players[actor].bot) sfx('chime');
  ui.lastActor = actor;
  if (G.phase !== 'main' || (ON.active && G.current !== ui.seat)) ui.mode = null;
  if (ui.mode && ui.mode.kind !== 'moveTo' && ui.mode.kind !== 'moveFrom' && !E.canBuildKind(G, G.current, ui.mode.kind)) ui.mode = null;
  saveGame();
  render();
  scheduleBot();
  if (ON.active) signals();
}

function botDelay() {
  const base = { slow: 1100, normal: 650, fast: 220 }[ui.cfg.speed] || 650;
  if (G.phase === 'roll') return base + 250;
  if (G.phase === 'setup') return base;
  return base;
}
function scheduleBot() {
  clearTimeout(ui.timer); ui.timer = null;
  if (ON.active) return;   // no bots online
  if (!G || G.phase === 'gameover') return;
  const a = E.actor(G);
  if (!G.players[a].bot) return;
  ui.timer = setTimeout(() => {
    ui.timer = null;
    if (!G || G.phase === 'gameover' || !G.players[E.actor(G)].bot) return;
    const r = Bot.step(G);
    if (!r || !r.ok) {
      // safety valve: never let a bot stall the game
      if (G.phase === 'main') E.doEndTurn(G);
      else if (G.phase === 'roadBuilding') E.doEndFreeRoads(G);
    }
    ui.undo = [];
    afterAction();
  }, botDelay());
}

function onBoardTap(t) {
  if (!G || G.phase === 'gameover') return;
  const a = E.actor(G);
  if (G.players[a].bot || needCurtain() || (ON.active && a !== ui.seat)) return;
  const tap = {
    v: t.dataset.v !== undefined ? +t.dataset.v : null,
    e: t.dataset.e !== undefined ? +t.dataset.e : null,
    h: t.dataset.h !== undefined ? +t.dataset.h : null,
    k: t.dataset.k,
  };
  // picking which ship to move is only a selection, no confirm needed
  const selectOnly = G.phase === 'main' && ui.mode && ui.mode.kind === 'moveFrom';
  if (ui.cfg.confirm && !selectOnly) { ui.pending = tap; render(); return; }
  runTap(tap);
}
function pendingKind() {
  const p = ui.pending; if (!p) return null;
  if (p.h !== null) return G.board.hexes[p.h].terrain === 'sea' ? 'pirate' : 'robber';
  if (p.v !== null) return G.phase === 'setup' ? 'settlement' : (ui.mode ? ui.mode.kind : 'settlement');
  if (p.k === 'moveto') return 'ship';
  return p.k || 'road';
}
function runTap(tap) {
  ui.pending = null;
  const { v, e, h, k } = tap;
  if (G.phase === 'setup') {
    if (v !== null) perform('setupSettlement', [v], () => E.doSetupSettlement(G, v));
    else if (e !== null) perform('setupEdge', [e, k], () => E.doSetupEdge(G, e, k));
  } else if (G.phase === 'robber' && h !== null) perform('moveRobber', [h], () => E.doMoveRobber(G, h));
  else if (G.phase === 'roadBuilding' && e !== null) perform('build', [k, e], () => E.doBuild(G, k, e));
  else if (G.phase === 'main' && ui.mode) {
    const m = ui.mode.kind;
    if ((m === 'settlement' || m === 'city') && v !== null) { ui.mode = null; perform('build', [m, v], () => E.doBuild(G, m, v), { undo: true }); }
    else if ((m === 'road' || m === 'ship') && e !== null) {
      const keep = m;
      if (perform('build', [keep, e], () => E.doBuild(G, keep, e), { undo: true }) && E.canBuildKind(G, G.current, keep)) { ui.mode = { kind: keep }; render(); }
    }
    else if (m === 'moveFrom' && e !== null) { ui.mode = { kind: 'moveTo', from: e }; render(); }
    else if (m === 'moveTo' && e !== null) { const from = ui.mode.from; ui.mode = null; perform('moveShip', [from, e], () => E.doMoveShip(G, from, e), { undo: true }); }
  }
}

function onAct(name, el) {
  const d = el.dataset;
  const c = ui.cfg;
  switch (name) {
    /* home */
    case 'show-costs': openModal('costs'); break;
    case 'mode': c.mode = d.m; saveCfg(); renderHome(); break;
    case 'preset': syncNames(); preset(d.p); saveCfg(); renderHome(); break;
    case 'cycle-color': {
      syncNames();
      const used = c.players.map(p => p.color);
      const i = +d.i; let idx = COLORS.findIndex(x => x.id === c.players[i].color);
      for (let n = 0; n < COLORS.length; n++) { idx = (idx + 1) % COLORS.length; if (!used.includes(COLORS[idx].id)) break; }
      c.players[i].color = COLORS[idx].id; saveCfg(); renderHome(); break;
    }
    case 'set-human': syncNames(); c.players[+d.i].bot = false; if (BOT_NAMES.includes(c.players[+d.i].name)) c.players[+d.i].name = 'Player ' + (+d.i + 1); saveCfg(); renderHome(); break;
    case 'set-bot': syncNames(); c.players[+d.i].bot = true; c.players[+d.i].name = BOT_NAMES.find(n => !c.players.some(p => p.name === n)) || 'Bot'; saveCfg(); renderHome(); break;
    case 'remove-player': syncNames(); if (c.players.length > 2) c.players.splice(+d.i, 1); saveCfg(); renderHome(); break;
    case 'add-player': {
      syncNames();
      const col = COLORS.find(x => !c.players.some(p => p.color === x.id)).id;
      c.players.push({ name: BOT_NAMES.find(n => !c.players.some(p => p.name === n)), color: col, bot: true });
      saveCfg(); renderHome(); break;
    }
    case 'target': syncNames(); c.target[c.mode] = Math.max(5, Math.min(20, c.target[c.mode] + +d.d)); saveCfg(); renderHome(); break;
    case 'opt': syncNames(); c[d.k] = !c[d.k]; saveCfg(); renderHome(); break;
    case 'speed': syncNames(); c.speed = d.s; saveCfg(); renderHome(); break;
    case 'level': syncNames(); c.level = d.l; saveCfg(); renderHome(); break;
    case 'start': ui.notice = ''; syncNames(); if (loadSave()) { ui.homeConfirm = true; renderHome(); } else startGame(); break;
    case 'start-force': startGame(); break;
    case 'cancel-new': ui.homeConfirm = false; renderHome(); break;
    case 'continue': resumeSave(); break;
    /* game */
    case 'reveal': ui.revealed = E.actor(G); render(); break;
    case 'roll': perform('roll', [], () => E.doRoll(G)); break;
    case 'play-knight': perform('playDev', ['knight'], () => E.doPlayDev(G, 'knight')); break;
    case 'build': {
      const k = d.k;
      ui.pending = null;
      if (ui.mode && ui.mode.kind === k) ui.mode = null; else ui.mode = { kind: k };
      render(); break;
    }
    case 'cancel-mode': ui.mode = null; ui.pending = null; render(); break;
    case 'pending-yes': if (ui.pending) { runTap(ui.pending); if (G) render(); } break;
    case 'pending-no': ui.pending = null; render(); break;
    case 'buy-dev': perform('buyDev', [], () => E.doBuyDev(G)); break;
    case 'end-turn': ui.mode = null; perform('endTurn', [], () => E.doEndTurn(G)); break;
    case 'undo': if (ON.active) break; { const snap = ui.undo.pop(); if (snap) { G = JSON.parse(snap); G.fx = []; ui.mode = null; saveGame(); render(); } break; }
    case 'move-ship': ui.mode = { kind: 'moveFrom' }; render(); break;
    case 'edge-kind': ui.edgeKind = d.k; render(); break;
    case 'end-free': perform('endFreeRoads', [], () => E.doEndFreeRoads(G)); break;
    case 'trade': ui.trade = { tab: ui.trade.tab, give: null, get: null, pg: {}, pw: {} }; openModal('trade'); break;
    case 'trade-tab': ui.trade.tab = d.t; drawModal(); break;
    case 'bank-give': ui.trade.give = d.r; if (ui.trade.get === d.r) ui.trade.get = null; drawModal(); break;
    case 'bank-get': ui.trade.get = d.r; drawModal(); break;
    case 'do-bank': { const t = ui.trade; if (perform('bankTrade', [t.give, t.get], () => E.doBankTrade(G, t.give, t.get), { undo: true })) { if (G.players[G.current].hand[t.give] < E.tradeRatio(G, G.current, t.give)) t.give = null; drawModal(); } break; }
    case 'pg': case 'pw': { const o = ui.trade[name]; o[d.r] = Math.max(0, (o[d.r] || 0) + +d.d); if (o[d.r] && name === 'pg') ui.trade.pw[d.r] = 0; if (o[d.r] && name === 'pw') ui.trade.pg[d.r] = 0; drawModal(); break; }
    case 'do-ptrade': {
      const t = ui.trade, g = Object.assign(E.emptyHand(), t.pg), w = Object.assign(E.emptyHand(), t.pw);
      const other = +d.p, on = G.players[other];
      if (ON.active) {   // online, trades between people are always an offer the other player answers
        if (sendOnline('offer', [other, nonzero(g), nonzero(w)])) { t.pg = {}; t.pw = {}; toast(`Offer sent to ${on.name}`, pcol(other)); }
      } else if (on.bot) {
        // the bot receives g and pays w
        const j = Bot.respond(G, other, G.current, g, w);
        if (!j.ok) {
          const msg = j.why === 'leader' ? `${on.name} won’t trade with someone that close to winning` : j.why === 'done' ? `${on.name} is done trading this turn` : `${on.name}: no thanks`;
          toast(msg, pcol(other)); saveGame(); drawModal(); break;
        }
        if (act(() => E.doTrade(G, other, g, w))) { toast(`${on.name} accepts`, pcol(other)); t.pg = {}; t.pw = {}; drawModal(); }
      } else {
        if (!E.validTrade(G, G.current, other, g, w)) { toast(`${on.name} doesn’t have those cards`, pcol(other), true); break; }
        if (act(() => E.doTrade(G, other, g, w), { undo: true })) { toast(`Traded with ${on.name}`, pcol(other)); t.pg = {}; t.pw = {}; drawModal(); }
      }
      break;
    }
    case 'dev': if (viewer() !== null) { ui.confirm = null; ui.sel = []; openModal('dev'); } break;
    case 'play-dev': {
      const t = d.t;
      if (t === 'plenty' || t === 'mono') { ui.confirm = t; ui.sel = []; drawModal(); break; }
      closeModal(); perform('playDev', [t], () => E.doPlayDev(G, t)); break;
    }
    case 'dev-sel': {
      const n = ui.confirm === 'plenty' ? 2 : 1;
      if (n === 1) ui.sel = [d.r]; else if (ui.sel.length < 2) ui.sel.push(d.r); else ui.sel = [d.r];
      drawModal(); break;
    }
    case 'dev-sel-clear': ui.sel = []; drawModal(); break;
    case 'dev-confirm': {
      const t = ui.confirm, sel = ui.sel.slice();
      closeModal();
      perform('playDev', [t, { res: t === 'plenty' ? sel : sel[0] }], () => E.doPlayDev(G, t, { res: t === 'plenty' ? sel : sel[0] }));
      break;
    }
    case 'pick': {
      const r = d.r; ui.picks[r] = Math.max(0, (ui.picks[r] || 0) + +d.d); drawModal(); break;
    }
    case 'do-discard': { const p = G.discardQ[0].p, picks = Object.assign(E.emptyHand(), ui.picks); ui.picks = {}; perform('discard', [nonzero(picks)], () => E.doDiscard(G, p, picks)); break; }
    case 'do-gold': { const p = G.goldQ[0].p, picks = Object.assign(E.emptyHand(), ui.picks); ui.picks = {}; perform('gold', [nonzero(picks)], () => E.doGold(G, p, picks)); break; }
    case 'do-steal': closeModal(); perform('steal', [+d.p], () => E.doSteal(G, +d.p)); break;
    case 'offer-yes': closeModal(); perform('respond', [true], () => E.doRespond(G, true)); break;
    case 'offer-no': closeModal(); perform('respond', [false], () => E.doRespond(G, false)); break;
    case 'show-results': openModal('results'); break;
    case 'rematch': {
      if (ON.active) break;
      const opts = { mode: G.mode, target: G.target, friendly: G.friendly, level: G.level, players: E.shuffle(G.players.map(p => ({ name: p.name, color: p.color, bot: p.bot }))) };
      closeModal(); G = E.newGame(opts); log0(); enterGame(); break;
    }
    case 'home': if (ON.active) { leaveOnline(); break; } closeModal(); saveGame(); goHome(); break;
    case 'online-open': ui.notice = ''; openOnlineLobby(); break;
    case 'online-retry': retryOnline(); break;
    case 'leave': leaveOnline(); break;
    case 'withdraw': sendOnline('withdrawOffer', []); break;
    case 'close-modal': closeModal(); if (G) render(); break;
    case 'close-modal-bg': break;
    case 'zoom-in': zoomAt(1 / 1.3); break;
    case 'zoom-out': zoomAt(1.3); break;
    case 'zoom-fit': ui.view = Object.assign({}, ui.base); applyView(); break;
  }
}
function syncNames() {
  ui.cfg.players.forEach((p, i) => { const inp = document.getElementById('pname-' + i); if (inp) p.name = inp.value.slice(0, 14); });
}

document.addEventListener('click', ev => {
  const back = ev.target.classList && ev.target.classList.contains('modal-back');
  if (back) {
    // tapping outside a closable sheet closes it
    if (ev.target.dataset.act === 'close-modal-bg') { closeModal(); if (G) render(); if (ON.active) flushDeferred(); }
    return;
  }
  const el = ev.target.closest('[data-act]');
  if (ui.armed && ui.armed.el !== el) disarm();
  if (!el || el.disabled) return;
  if (el.dataset.confirm && ui.cfg.confirm && G && !ui.armed) { arm(el); return; }
  if (ui.armed) { clearTimeout(ui.armed.timer); ui.armed = null; }
  onAct(el.dataset.act, el);
  if (ON.active) flushDeferred();   // a draft just ended? apply the newest room snapshot held back meanwhile
});
// first tap arms a button ("Sure?"), second tap runs it
function arm(el) {
  const lb = el.querySelector('.lb');
  const target = lb || el;
  ui.armed = { el, target, html: target.innerHTML, timer: setTimeout(disarm, 4000) };
  target.textContent = el.dataset.confirm;
  el.classList.add('armed');
}
function disarm() {
  const a = ui.armed; if (!a) return;
  clearTimeout(a.timer); ui.armed = null;
  if (a.el.isConnected) { a.target.innerHTML = a.html; a.el.classList.remove('armed'); }
}
document.addEventListener('input', ev => {
  if (ev.target.id && ev.target.id.startsWith('pname-')) { syncNames(); saveCfg(); }
});

/* ================= ONLINE =================
   Spec: docs/online-phase2.md section B with the review amendments (R1, R3, R4), plus the patterns of docs/online-splendor.md.
   The room (seed, seats, opts) and every player's own append-only list of records {k, a, args} come from HubOnline.rooms.watch.
   Every update replays the whole game from scratch with Engine.replayCatan; the local seat is the viewer (ui.seat).
   The UI never changes G directly online: it sanitizes, appends a record to my list (the overlay `ON.mine`), replays and writes.
   Online games never touch local storage for the game itself: no save, no continue, no undo, no rematch, no bots, no curtain.
   Accepted limits: the seed lets anyone with devtools predict dice and cards; hands of other players are technically derivable
   from the seed; an unsent record is lost if the tab closes while offline; a withdraw that loses a race with an accept is
   rewritten (the responder always wins) and its author is told with a toast. */
const OL = { game: 'isles', name: 'Catan', accent: { light: '#ffc94a', dark: '#ffc94a' } };
const onlineAvailable = () => { try { return !!(window.HubOnline && window.HubLobby && HubOnline.available()); } catch (e) { return false; } };
const fmtCode = c => (c && c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : (c || ''));
const roomLink = code => `${location.origin}${location.pathname}?room=${code}`;
const nonzero = c => { const o = {}; E.RES.forEach(r => { if (c && c[r] > 0) o[r] = c[r]; }); return o; };
const fingerprint = s => JSON.stringify(s, (k, v) => (k === 'board' || k === 'fx') ? undefined : v);

function resetOn() {
  Object.assign(ON, {
    active: false, code: null, uid: null, room: null, players: {}, pending: false, err: null, mine: [], built: false,
    seen: new Set(), warned: new Set(), deferred: null, k: 0, seatUids: [], applied: 0, fp: '', flagged: false, badge: false,
    wrote: false, rec: false, fatal: '', shownPending: false, msg: '',
  });
  ui.seat = null;
}
resetOn();

/* ---------- seats, names, colours ---------- */
// Profile colour (hex) -> the nearest Catan colour id; replayCatan hands a clashing later seat the first unused colour.
function nearestColorId(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255];
  let best = null, bd = Infinity;
  COLORS.forEach(col => {
    const q = parseInt(col.hex.slice(1), 16);
    const d = (c[0] - (q >> 16 & 255)) ** 2 + (c[1] - (q >> 8 & 255)) ** 2 + (c[2] - (q & 255)) ** 2;
    if (d < bd) { bd = d; best = col.id; }
  });
  return best;
}
function seatInfo() {
  const seats = (ON.room && ON.room.seats) || {};
  const uids = Object.keys(seats).sort();
  const base = uids.map((u, i) => String((seats[u] && seats[u].name) || '').replace(/\s+/g, ' ').trim().slice(0, 16) || `Player ${i + 1}`);
  const players = {};
  uids.forEach((u, i) => {   // duplicate names get a number, in sorted-uid order, so every device agrees
    const k = base.slice(0, i).filter(x => x.toLowerCase() === base[i].toLowerCase()).length;
    players[u] = { name: k ? `${base[i]} ${k + 1}` : base[i], color: nearestColorId(seats[u] && seats[u].color) };
  });
  return { uids, players };
}

/* ---------- my own record list ---------- */
// The longer of the server's copy and what this device has composed, so a move shows at once before the server confirms it.
function mineList() {
  const d = ON.players[ON.uid], sm = d && Array.isArray(d.moves) ? d.moves : [];
  return ON.mine.length > sm.length ? ON.mine : sm;
}
function buildReplay() {
  const { uids, players } = seatInfo();
  const o = (ON.room && ON.room.opts) || {};
  const lists = {};
  uids.forEach(u => { lists[u] = u === ON.uid ? mineList() : ((ON.players[u] || {}).moves || []); });
  const res = E.replayCatan({ seed: ON.room.seed, uids, opts: { mode: o.mode, target: o.target, friendly: o.friendly, players }, lists });
  return { res, lists };
}
function turnSummary() {
  const over = G.phase === 'gameover';
  return { phase: over ? 'over' : G.phase === 'setup' ? 'setup' : 'play', next: over ? null : (ON.seatUids[E.actor(G)] || null) };
}
function flush() {
  if(ON.blocked)return;
  const code = ON.code, tok = ON.token;
  HubOnline.rooms.writeMine(code, { moves: mineList(), turn: turnSummary() }).then(() => { }, e => {
    if (tok !== ON.token || !ON.active) return;
    if (e && e.code === 'denied') {   // the server refused: forget what only this device knew and rebuild from the server
      ON.mine = []; toast('That move could not be saved. Please try again.', null, true);
      if (drafting()) ON.deferred = ON.deferred || { room: ON.room, players: ON.players, pending: false }; else refresh(true);
    }
  });
}

/* ---------- sending one action ---------- */
function sendOnline(a, args) {
  if(ON.blocked)return;
  if (!ON.active || !G || ui.seat === null) return false;
  const seat = ui.seat;
  if (!E.allowedAt(G).some(x => x.p === seat && x.acts.includes(a))) { toast('Not your move right now', null, true); return false; }
  const rec = { k: ON.k, a, args };
  if (!E.sanitizeAction(G, seat, rec)) { toast('That move is not possible', null, true); return false; }
  // dry run on a copy so a refused move costs nothing and tells the player why (the generator is never consumed by a failure)
  const copy = JSON.parse(JSON.stringify(G)); copy.fx = [];
  const r = E.applyAction(copy, seat, E.sanitizeAction(copy, seat, rec));
  if (!r.ok) { toast(r.err || 'Not possible', null, true); return false; }
  ON.mine = [...mineList(), rec];
  ui.pending = null;
  refresh();
  flush();
  return true;
}

/* ---------- watching the room ---------- */
// A draft is anything half-composed on this device. Room updates wait (only the newest is kept) until it is committed or cancelled.
const hasKeys = o => !!o && Object.keys(o).some(k => o[k]);
function drafting() {
  if (!ON.active || !G) return false;
  if (ui.pending || ui.mode) return true;
  if (ui.modal === 'trade') return ui.trade.tab === 'players' ? (hasKeys(ui.trade.pg) || hasKeys(ui.trade.pw)) : !!(ui.trade.give || ui.trade.get);
  if (ui.modal === 'discard' || ui.modal === 'gold') return hasKeys(ui.picks);
  if (ui.modal === 'dev') return !!ui.confirm;
  return false;
}
function flushDeferred() {
  if (!ON.active || !ON.deferred || drafting()) return;
  const snap = ON.deferred;
  ON.deferred = null;
  consume(snap);
}
// Every room snapshot is checked before replay, including deferred local drafts.
function roomSnapshotAllowed(snap) {
  const compatibility = snap.room && HubOnline.rooms.compatibility ? HubOnline.rooms.compatibility(snap.room) : {ok:true};
  const terminal = snap.room && ['cancelled','ended'].includes(snap.room.status);
  const sessionOK = !ON.session || ON.session.update(snap);
  ON.blocked = !!terminal || !compatibility.ok || !sessionOK;
  if(ON.blocked) {
    ON.deferred=null;
    clearInterval(ON.tick);ON.tick=null;
    if(!ON.session) {
      const message=compatibility.ok ? 'This room has ended. Return to the hub to start another game.' : compatibility.message;
      ON.fatal=message;renderConnecting();
    }
    return false;
  }
  return true;
}
function onSnap(snap) {
  if(!roomSnapshotAllowed(snap)) return;
  if (snap.error) {
    ON.err = snap.error;
    if (!G) { ON.fatal = snap.error.code === 'offline' ? "You're offline. Reconnect and try again." : "Couldn't reach the game server."; renderConnecting(); }
    else if (!drafting()) render();
    return;
  }
  const hadErr = !!ON.err;
  ON.err = null;
  if (!snap.room) { if (!G) { ON.fatal = 'No game with that code.'; renderConnecting(); } return; }
  if (drafting()) { ON.deferred = snap; return; }
  consume(snap, hadErr);
}
function consume(snap, hadErr) {
  if(!roomSnapshotAllowed(snap)) return;
  ON.room = snap.room; ON.players = snap.players || {}; ON.pending = !!snap.pending;
  const code = ON.code;
  if (!(ON.room.seats && ON.room.seats[ON.uid])) { leaveOnline(); HubLobby.notSeated(code, { gameName: OL.name, accent: OL.accent, onClose: exitLobby, closeLabel: 'Back to setup' }); return; }
  if (ON.room.status !== 'playing') { leaveOnline(); enterRoom(code); return; }
  const sm = (ON.players[ON.uid] || {}).moves;
  if (Array.isArray(sm) && sm.length >= ON.mine.length) ON.mine = [];   // the server has caught up with this device
  refresh(hadErr);
}
function fatal(msg) { ON.fatal = msg; G = null; ON.built = false; renderConnecting(); }

function refresh(forceRender) {
  let b;
  try { b = buildReplay(); } catch (e) { try { console.warn('Catan online: cannot replay', e); } catch (_) { } fatal("This game can't be shown."); return; }
  const res = b.res, seat = res.seats.indexOf(ON.uid);
  if (seat < 0) { fatal("This game can't be shown."); return; }
  const first = !ON.built, old = G;
  const wasAct = !first && !!old && old.phase !== 'gameover' && E.actor(old) === ui.seat;
  ui.seat = seat; ON.seatUids = res.seats; ON.k = res.k;
  // fx are deduped by record identity (seat, index in that seat's list): only records not seen on this device play their effects
  const fresh = res.applied.filter(x => !ON.seen.has(x.p + ':' + x.idx));
  res.applied.forEach(x => ON.seen.add(x.p + ':' + x.idx));
  notifyOwn(res, b.lists, first);
  const fp = fingerprint(res.state);
  let changed = false;
  if (first) {
    changed = true;
    G = res.state; G.fx = [];
    ON.built = true; ON.applied = res.applied.length; ON.fp = fp;
    enterOnlineGame();
  } else if (res.applied.length === ON.applied && fp === ON.fp) {
    // nothing new: keep the state on screen so the sounds and effects of my own move are not cut off
  } else {
    changed = true;
    G = res.state;
    G.fx = [].concat(...fresh.slice(-8).map(x => x.fx));
    ON.applied = res.applied.length; ON.fp = fp;
    afterAction();
  }
  const actNow = G.phase !== 'gameover' && E.actor(G) === seat;
  // chime, tab title and menu badge only when the turn passes to me after a remote update, never on first load
  if (changed && !first && !wasAct && actNow && fresh.some(x => x.p !== seat)) { setTimeout(() => sfx('chime'), 450); ON.flagged = true; }
  if (!actNow) ON.flagged = false;
  recordIfOver();
  if (!ON.wrote) {   // the hub reads the turn summary from my own document, so make sure it exists
    ON.wrote = true;
    if (!ON.players[ON.uid] && !mineList().length) flush();
  }
  if (!changed && (forceRender || ON.pending !== ON.shownPending)) render();
  ON.shownPending = ON.pending;
  signals();
}

// Toasts for my own records that lost a race or were refused. History from before this page load stays silent.
function notifyOwn(res, lists, first) {
  const seat = res.seats.indexOf(ON.uid), mine = lists[ON.uid] || [], nm = p => res.state.players[p].name;
  const say = (key, text) => { if (ON.warned.has(key)) return; ON.warned.add(key); if (!first) toast(text, null, true); };
  res.stale.forEach(e => {
    if (e.p !== seat) return;
    const rec = mine[e.idx] || {};
    const win = res.applied.find(x => x.k === rec.k && x.p !== seat);
    let text = 'That move came too late and was skipped.';
    if (win && win.a === 'respond') {
      const r = (lists[res.seats[win.p]] || [])[win.idx];
      text = `Too late: ${nm(win.p)} ${r && r.args && r.args[0] === true ? 'accepted' : 'declined'} your trade.`;
    } else if (win) text = `Too late: ${nm(win.p)} moved first.`;
    say('s' + e.idx, text);
  });
  res.invalid.forEach(e => { if (e.p === seat) say('i' + e.idx, `That move was not allowed${e.err ? ': ' + e.err : ''}.`); });
}

function recordIfOver() {
  if (!ON.active || !G || G.phase !== 'gameover' || ON.rec || ui.seat === null) return;
  ON.rec = true;
  try { if (HubKit.recordResult) HubKit.recordResult(OL.game, `${ON.uid}:${ON.code}`, { won: G.winner === ui.seat, score: E.totalVP(G, ui.seat) }); } catch (e) { /* stats are optional */ }
}
function signals() {
  const on = !!(ON.active && ON.flagged && G && G.phase !== 'gameover' && E.actor(G) === ui.seat);
  const t = on ? 'Your turn · Catan' : 'Catan';
  if (document.title !== t) document.title = t;
  if (on !== ON.badge) { ON.badge = on; try { if (HubKit.setBadge) HubKit.setBadge(on); } catch (e) { /* optional */ } }
}

/* ---------- screens ---------- */
function waitVerb() {
  switch (G.phase) {
    case 'setup': return G.setup.step === 'settlement' ? 'place a settlement' : (G.mode === 'seafarers' ? 'place a road or ship' : 'place a road');
    case 'roll': return 'roll';
    case 'robber': return G.mode === 'seafarers' ? 'move the robber or pirate' : 'move the robber';
    case 'steal': return 'choose who to rob';
    case 'discard': return 'discard';
    case 'gold': return 'pick gold';
    case 'roadBuilding': return 'place free roads';
    case 'offer': return 'answer the offer';
    default: return 'finish their turn';
  }
}
function renderWaitingDock(a) {
  const pa = G.players[a], me = ui.seat;
  let text, extra = '';
  if (G.phase === 'offer' && G.offer) {
    const o = G.offer;
    if (o.from === me) {
      text = `Waiting for ${esc(pa.name)} to answer: your ${esc(E.describe(o.give))} for their ${esc(E.describe(o.get))}`;
      extra = '<div class="row2"><button class="btn" data-act="withdraw">Withdraw offer</button></div>';
    } else text = `${esc(G.players[o.from].name)} offers ${esc(pa.name)} a trade. Waiting for ${esc(pa.name)}`;
  } else text = `Waiting for ${esc(pa.name)} to ${waitVerb()}`;
  $('#dock').innerHTML = `<div class="prompt" style="--pc:${colorHex(pa.color)}"><i></i><span class="thinking">${text}</span></div>${handHtml(me)}${extra}`;
}
function renderStatus() {   // "Sending…" while my writes are unconfirmed, "Offline" while the room cannot be reached
  if (!ON.active) return;
  const tag = ON.err ? 'Offline' : ON.pending ? 'Sending…' : '';
  const pr = document.querySelector('#dock .prompt span');
  if (tag && pr) pr.insertAdjacentHTML('beforeend', ` <small style="color:var(--muted);font-weight:700">· ${tag}</small>`);
}
function renderConnecting() {
  $('#home').hidden = false; $('#game').hidden = true;
  $('#home').innerHTML = `<div class="home-inner"><div class="hero"><div><h1>Catan</h1></div></div>
    <div class="card"><div class="label">Online game ${esc(fmtCode(ON.code))}</div>
      <p style="margin:0" role="status">${esc(ON.fatal || 'Connecting to the game server…')}</p>
      <div class="confirm-row">${ON.fatal ? '<button class="btn primary" data-act="online-retry">Try again</button>' : ''}<button class="btn" data-act="leave">Leave</button></div></div></div>`;
  syncFloat();
}
function enterOnlineGame() {
  ui.mode = null; ui.pending = null; ui.undo = []; ui.revealed = null; ui.gains = {}; ui.flashHexes = []; ui.diceKey = null;
  $('#home').hidden = true; $('#game').hidden = false;
  ui.lastActor = E.actor(G);
  closeModal();
  renderStatic();
  afterAction();
  if (G.phase === 'gameover') openModal('results');
}

/* ---------- entering and leaving ---------- */
function stopWatch() {
  if(ON.session){ON.session.close();ON.session=null;}
  ON.blocked=false;
  ON.token++;
  clearInterval(ON.tick); ON.tick = null;
  if (ON.unsub) { try { ON.unsub(); } catch (e) { /* already stopped */ } ON.unsub = null; }
}
function openOnlineLobby() {
  const c = ui.cfg;
  HubLobby.openCreateJoin({
    game: OL.game, gameName: OL.name, seatOptions: [2, 3, 4], accent: OL.accent, onRoom: enterRoom,
    opts: () => ({ mode: c.mode, target: c.target[c.mode], friendly: !!c.friendly }),   // the setup screen's own controls
  });
}
// HubLobby looks the room up, joins, shows the waiting room and calls back when the game is on.
function enterRoom(code) {
  try { history.replaceState(null, '', `${location.pathname}?room=${code}`); } catch (e) { /* ignore */ }
  HubLobby.enter(code, { game: OL.game, gameName: OL.name, minToStart: 2, accent: OL.accent, onPlay: c => beginOnline(c.code, c.uid), onExit: exitLobby });
}
function exitLobby() {
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  if (!ON.active) { $('#game').hidden = true; $('#home').hidden = false; renderHome(); syncFloat(); }
}
function beginOnline(code, uid) {
  stopWatch();
  clearTimeout(ui.timer); ui.timer = null;
  resetOn();
  Object.assign(ON, { active: true, code, uid });
  G = null;
  ui.mode = null; ui.pending = null; ui.undo = []; ui.notice = '';
  try { history.replaceState(null, '', `${location.pathname}?room=${code}`); } catch (e) { /* ignore */ }
  renderConnecting();
  const tok = ON.token;
  if(ON.session){ON.session.close();ON.session=null;}
  if(window.HubSession) ON.session=HubSession.mount({code:ON.code,onExit:leaveOnline,onRestart:code=>{leaveOnline();enterRoom(code);}});
  ON.unsub = HubOnline.rooms.watch(code, snap => { if (tok === ON.token) onSnap(snap); });
  ON.tick = setInterval(flushDeferred, 1500);   // safety net: a held-back room update is applied soon after any draft ends
}
function retryOnline() { if (ON.active) beginOnline(ON.code, ON.uid); }
function leaveClick() { if (G && G.phase !== 'gameover') openModal('leave'); else leaveOnline(); }
function leaveOnline() {
  stopWatch();
  const was = ON.active;
  resetOn();
  try { document.title = 'Catan'; if (HubKit.setBadge) HubKit.setBadge(false); } catch (e) { /* optional */ }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  try { HubLobby.close(); } catch (e) { /* optional */ }
  clearTimeout(ui.timer); ui.timer = null;
  G = null;
  ui.mode = null; ui.pending = null; ui.undo = [];
  closeModal(); $('#curtain').hidden = true;
  if (was) { $('#game').hidden = true; $('#home').hidden = false; renderHome(); syncFloat(); }
}

/* ================= MENU (HubKit) ================= */
function menuItems() {
  if ($('#game').hidden || !G) return [];   // setup screen: the page itself explains how to play
  const c = ui.cfg;
  const items = [
    { label: 'Building costs', onSelect: () => openModal('costs') },
    { label: 'Game log', onSelect: () => openModal('log') },
    { label: 'Confirm moves', toggle: true, checked: !!c.confirm, onSelect: on => { c.confirm = on; saveCfg(); ui.pending = null; render(); } },
  ];
  if (ON.active) { items.push({ label: 'Leave game', onSelect: () => leaveClick() }); return items; }
  items.push({ label: 'Hide hands between turns', toggle: true, checked: !!c.hideHands, onSelect: on => { c.hideHands = on; saveCfg(); render(); } });
  if (G.players.some(p => p.bot)) {
    items.push({ label: 'Bot skill', value: { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[G.level || 'normal'],
      onSelect: () => { G.level = { easy: 'normal', normal: 'hard', hard: 'easy' }[G.level || 'normal']; c.level = G.level; saveCfg(); saveGame(); } });
  }
  items.push({ label: 'Bot speed', value: { slow: 'Relaxed', normal: 'Normal', fast: 'Fast' }[c.speed],
    onSelect: () => { c.speed = { slow: 'normal', normal: 'fast', fast: 'slow' }[c.speed]; saveCfg(); saveGame(); } });
  items.push({ label: 'Back to setup', onSelect: () => { closeModal(); saveGame(); goHome(); } });
  return items;
}
function initKit() {
  try {
    HubKit.init({ id: 'isles', name: 'Catan', accent: '#ffc94a', scheme: 'dark', floating: false, items: menuItems });
    const slot = $('#menuSlot'), html = HubKit.buttonHTML('isl-menu');
    if (slot && html) slot.outerHTML = html;
  } catch (e) { }
}

/* ================= BOOT ================= */
function boot(data) {
  ui.cfg = loadCfg();
  initKit();
  setupPanZoom();
  // ?room=CODE opens that online game before any local save, #continue or hot-reload state is looked at
  const rc = new URLSearchParams(location.search).get('room');
  if (rc !== null && rc !== '') {
    const code = rc.replace(/\D/g, '');
    const valid = /^[1-9][0-9]{5}$/.test(code);
    renderHome(); syncFloat();
    if (valid && onlineAvailable()) { enterRoom(code); return; }
    ui.notice = valid ? 'Online play is not available right now. You can still play on this device.' : 'That link does not hold a valid six-digit game code.';
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    renderHome();
    return;
  }
  const mode=new URLSearchParams(location.search).get('mode');
  if(location.hash!=='#continue'&&['solo','local','online'].includes(mode)) {
    if(mode==='solo')preset('solo2');else if(mode==='local')preset('couple');
    renderHome();syncFloat();
    if(mode==='online') {
      if(onlineAvailable())openOnlineLobby();
      else {ui.notice='Online play is unavailable right now. You can still play on this device.';renderHome();}
    }
    return;
  }
  if (data && data.G) { G = data.G; G.fx = []; if (data.ui) Object.assign(ui, { revealed: data.ui.revealed }); $('#home').hidden = true; $('#game').hidden = false; renderStatic(); afterAction(); return; }
  renderHome();
  syncFloat();
  if (location.hash === '#continue') {
    resumeSave();
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
  }
}
if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
  try { window.claude.hot.snapshot(() => ({ G: G && !$('#game').hidden && !ON.active ? G : null, ui: { revealed: ui.revealed } })); } catch (e) { }
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
