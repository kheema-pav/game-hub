/* Browser-local game-night metadata. Never stores hands, moves or online room data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { createStore: factory };
  else root.HubGameNight = factory(function () { return root.localStorage; });
})(typeof window !== 'undefined' ? window : this, function (storage, clock, makeId) {
  'use strict';
  var KEY = 'hub.results.v1', LIMIT = 50, serial = 0;
  var TITLES = { codex: 'Codex Naturalis', isles: 'Catan', gems: 'Splendor', sketch: 'Pictionary', ticket: 'Ticket to Ride', ludo: 'Ludo', connect4: 'Four in a Row', azul: 'Azul', reversi: 'Reversi', yahtzee: 'Yahtzee' };
  var LEVELS = ['easy', 'normal', 'hard', 'expert'];
  clock = clock || Date.now;
  makeId = makeId || function () { return clock().toString(36) + '-' + (++serial) + '-' + Math.random().toString(36).slice(2, 12); };
  function db() { return typeof storage === 'function' ? storage() : storage; }
  function text(value, length) { return typeof value === 'string' ? value.slice(0, length) : ''; }
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function metadata(value) { return value && typeof value.id === 'string' && value.id.length <= 100 && value.id.length > 0 && finite(value.startedAt) && finite(value.updatedAt); }
  function touch(state) {
    if (!state || typeof state !== 'object') return null;
    var now = clock();
    if (!metadata(state._night)) state._night = { id: makeId(), startedAt: now, updatedAt: now };
    state._night.updatedAt = now;
    return state._night;
  }
  function valid(entry) {
    return entry && Object.prototype.hasOwnProperty.call(TITLES, entry.game) && typeof entry.id === 'string' && entry.id.length <= 100 && finite(entry.finishedAt) &&
      Array.isArray(entry.players) && entry.players.length >= 1 && entry.players.length <= 8 && entry.players.every(function (p) { return p && typeof p.name === 'string' && p.name.length <= 40 && typeof p.bot === 'boolean' && (p.score === null || finite(p.score)); }) &&
      Array.isArray(entry.winners) && entry.winners.every(function (i) { return Number.isInteger(i) && i >= 0 && i < entry.players.length; }) && ['solo', 'local'].includes(entry.mode) && (entry.level === null || LEVELS.concat('mixed').includes(entry.level)) && typeof entry.summary === 'string' && entry.summary.length <= 100;
  }
  function list() {
    try { var data = JSON.parse(db().getItem(KEY)); return Array.isArray(data) ? data.filter(valid).sort(function (a, b) { return b.finishedAt - a.finishedAt; }).slice(0, LIMIT) : []; }
    catch (e) { return []; }
  }
  function finish(game, state, details) {
    if (!Object.prototype.hasOwnProperty.call(TITLES, game) || !state || state.online || !details || !['solo', 'local'].includes(details.mode)) return false;
    var meta = touch(state), rows = list();
    if (rows.some(function (r) { return r.game === game && r.id === meta.id; })) return true;
    var players = Array.isArray(details.players) ? details.players.map(function (p) { return { name: text(p && p.name, 40) || 'Player', bot: !!(p && p.bot), score: p && finite(p.score) ? p.score : null }; }) : [];
    var entry = { id: meta.id, game: game, startedAt: meta.startedAt, finishedAt: clock(), mode: details.mode,
      level: players.some(function (p) { return p.bot; }) && LEVELS.concat('mixed').includes(details.level) ? details.level : null, summary: text(details.summary, 100), players: players,
      winners: Array.isArray(details.winners) ? Array.from(new Set(details.winners)) : [] };
    if (!valid(entry)) return false;
    try { db().setItem(KEY, JSON.stringify([entry].concat(rows).slice(0, LIMIT))); return true; } catch (e) { return false; }
  }
  function clear() { try { db().removeItem(KEY); return true; } catch (e) { return false; } }
  function date(value) {
    if (!finite(value)) return '';
    try { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function describe(game, saved) {
    if (!saved || typeof saved !== 'object') return '';
    var s = game === 'isles' ? saved.G : saved.state || saved;
    if (!s || typeof s !== 'object' || s.online) return '';
    var people = saved.players || s.players || (Array.isArray(s.teams) ? s.teams.map(function (name) { return { name: name }; }) : []);
    if (!Array.isArray(people)) return '';
    var bots = people.filter(function (p) { return p && (p.bot || p.ai || p.type === 'bot'); }), parts = [];
    var names = people.map(function (p) { return text(p && p.name, 16); }).filter(Boolean);
    if (names.length) parts.push(names.join(' / '));
    parts.push(bots.length ? people.length - bots.length > 1 ? 'Same device + bots' : 'Solo vs bots' : 'Same device');
    var levels = Array.from(new Set(bots.map(function (p) { var l = p.level || saved.level || s.level || 'normal'; return l === 'medium' ? 'normal' : l; }).filter(function (l) { return LEVELS.includes(l); })));
    if (levels.length) parts.push(levels.map(function (l) { return l[0].toUpperCase() + l.slice(1); }).join('/') + ' bots');
    if (game === 'ticket') parts.push((s.edition || saved.options && saved.options.edition) === 'europe' ? 'Europe' : 'USA');
    if (game === 'sketch' && finite(s.turn)) parts.push('Turn ' + (s.turn + 1));
    else if (finite(s.round)) parts.push('Round ' + s.round);
    else if (finite(s.turnNo)) parts.push('Turn ' + s.turnNo);
    else if (finite(s.moves)) parts.push('Move ' + (s.moves + 1));
    else if (finite(s.turn)) parts.push('Turn ' + s.turn);
    if (metadata(s._night)) parts.push('Saved ' + date(s._night.updatedAt));
    return parts.join(' · ');
  }
  function active() {
    var keys = { codex: 'naturalists-codex-v1', isles: 'sti.save.v1', gems: 'gemguild-game-v1', sketch: 'pictionary.save.v1' };
    return Object.keys(TITLES).map(function (game) {
      try {
        var saved = JSON.parse(db().getItem(keys[game] || 'hub.' + game + '.save.v1'));
        if (!saved) return null;
        var state = game === 'isles' ? saved.G : saved.state || saved;
        if (!state || state.online) return null;
        if (game === 'codex' && (state.v !== 1 || !['setup', 'place', 'draw', 'pass', 'handoff'].includes(state.phase))) return null;
        if (game === 'isles' && (state.v !== 1 || !state.phase || state.phase === 'gameover')) return null;
        if (game === 'gems' && (!Array.isArray(state.players) || state.over !== false)) return null;
        if (game === 'sketch' && (state.v !== 1 || !['handover', 'secret', 'draw', 'verdict', 'scores'].includes(state.screen))) return null;
        if (!keys[game] && (saved.v !== 1 || saved.game !== game || saved.gameVersion !== 1 || state.over !== false || !Array.isArray(saved.players))) return null;
        return { game: game, href: game + '/' + (game === 'codex' || game === 'sketch' ? '' : '#continue'), description: describe(game, saved), updatedAt: metadata(state._night) ? state._night.updatedAt : 0 };
      } catch (e) { return null; }
    }).filter(Boolean).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }
  return { touch: touch, finish: finish, list: list, clear: clear, describe: describe, date: date, active: active, titles: TITLES };
});
