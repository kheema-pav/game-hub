/* Original implementation of the normal coloured-wall Azul rules. No publisher artwork. */
(function (root, factory) {
  'use strict';
  var engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) { root.HubEngines = root.HubEngines || {}; root.HubEngines.azul = engine; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var COLORS = ['Blue', 'Gold', 'Red', 'Black', 'White'];
  var FLOOR = [1, 1, 2, 2, 2, 3, 3];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function integer(x, min, max) { return Number.isInteger(x) && x >= min && x <= max; }
  function colorAt(row, col) { return (col - row + 5) % 5; }
  function column(row, color) { return (color + row) % 5; }
  function random(s) {
    s.rng = (s.rng + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s.rng ^ s.rng >>> 15, 1 | s.rng);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function shuffle(s, array) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(random(s) * (i + 1)), t = array[i]; array[i] = array[j]; array[j] = t;
    }
    return array;
  }
  function drawTile(s) {
    if (!s.bag.length && s.discard.length) { s.bag = shuffle(s, s.discard); s.discard = []; }
    return s.bag.length ? s.bag.pop() : null;
  }
  function deal(s) {
    s.factories = [];
    for (var f = 0; f < 2 * s.players.length + 1; f++) {
      var tiles = [];
      for (var i = 0; i < 4; i++) { var c = drawTile(s); if (c !== null) tiles.push(c); }
      s.factories.push(tiles);
    }
    s.center = []; s.marker = true; s.pending = null; s.phase = 'draft'; s.current = s.starter;
  }
  function create(input) {
    input = input || {};
    if (!Array.isArray(input.players) || input.players.length < 2 || input.players.length > 4) throw new Error('Azul needs 2 to 4 players.');
    var seed = Number.isInteger(input.seed) ? input.seed >>> 0 : 1;
    var s = { game: 'azul', v: 1, seed: seed, rng: seed, players: input.players.map(function (p, i) {
      return { name: String(p.name || 'Player ' + (i + 1)), color: String(p.color || ''), bot: !!p.bot,
        wall: Array.from({ length: 5 }, function () { return Array(5).fill(false); }),
        lines: Array.from({ length: 5 }, function () { return { color: null, count: 0 }; }), floor: [], score: 0 };
    }), bag: [], discard: [], factories: [], center: [], marker: true, starter: 0, current: 0, round: 1,
    turn: 0, phase: 'draft', pending: null, over: false, winner: null, winners: [], scores: [], lastRound: [], last: '' };
    for (var c = 0; c < 5; c++) for (var n = 0; n < 20; n++) s.bag.push(c);
    shuffle(s, s.bag); s.starter = Math.floor(random(s) * s.players.length);
    deal(s); s.scores = s.players.map(function () { return 0; }); return s;
  }
  function actor(s) { return s.over ? -1 : s.current; }
  function canPlace(p, row, color) {
    var line = p.lines[row];
    return !p.wall[row][column(row, color)] && line.count < row + 1 && (line.count === 0 || line.color === color);
  }
  function legal(s, player) {
    if (!s || s.over || player !== s.current) return [];
    var actions = [];
    if (s.phase === 'draft') {
      s.factories.forEach(function (tiles, source) {
        for (var c = 0; c < 5; c++) if (tiles.includes(c)) actions.push({ type: 'draft', source: source, color: c });
      });
      for (var c = 0; c < 5; c++) if (s.center.includes(c)) actions.push({ type: 'draft', source: -1, color: c });
    } else if (s.phase === 'place' && s.pending) {
      for (var r = 0; r < 5; r++) if (canPlace(s.players[player], r, s.pending.color)) actions.push({ type: 'place', row: r });
      actions.push({ type: 'place', row: -1 });
    }
    return actions;
  }
  function actionEqual(a, b) {
    return a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).length === Object.keys(b).length
      && Object.keys(b).every(function (k) { return Object.prototype.hasOwnProperty.call(a, k) && a[k] === b[k]; });
  }
  function floorTile(s, p, color) {
    if (p.floor.length < 7) p.floor.push(color);
    else if (color !== -1) s.discard.push(color);
  }
  function placementPoints(wall, row, col) {
    var horizontal = 1, vertical = 1;
    for (var c = col - 1; c >= 0 && wall[row][c]; c--) horizontal++;
    for (var c = col + 1; c < 5 && wall[row][c]; c++) horizontal++;
    for (var r = row - 1; r >= 0 && wall[r][col]; r--) vertical++;
    for (var r = row + 1; r < 5 && wall[r][col]; r++) vertical++;
    return horizontal === 1 && vertical === 1 ? 1 : (horizontal > 1 ? horizontal : 0) + (vertical > 1 ? vertical : 0);
  }
  function rows(p) { return p.wall.filter(function (r) { return r.every(Boolean); }).length; }
  function bonuses(p) {
    var completeRows = rows(p), columns = 0, colors = 0;
    for (var c = 0; c < 5; c++) if (p.wall.every(function (r) { return r[c]; })) columns++;
    for (var c = 0; c < 5; c++) if (p.wall.every(function (r, i) { return r[column(i, c)]; })) colors++;
    return { rows: completeRows, columns: columns, colors: colors, points: completeRows * 2 + columns * 7 + colors * 10 };
  }
  function endRound(s) {
    s.lastRound = s.players.map(function (p) {
      var gained = 0, penalty = 0;
      p.lines.forEach(function (line, row) {
        if (line.count !== row + 1) return;
        var col = column(row, line.color);
        p.wall[row][col] = true;
        gained += placementPoints(p.wall, row, col);
        for (var i = 1; i < line.count; i++) s.discard.push(line.color);
        line.color = null; line.count = 0;
      });
      p.floor.forEach(function (c, i) { penalty += FLOOR[i]; if (c !== -1) s.discard.push(c); });
      p.floor = []; p.score = Math.max(0, p.score + gained - penalty);
      return { gained: gained, penalty: penalty, score: p.score, bonus: null };
    });
    if (s.players.some(function (p) { return rows(p) > 0; })) {
      s.over = true; s.phase = 'over';
      s.players.forEach(function (p, i) { var b = bonuses(p); p.score += b.points; s.lastRound[i].bonus = b; s.lastRound[i].score = p.score; });
      var high = Math.max.apply(null, s.players.map(function (p) { return p.score; }));
      var tied = s.players.map(function (p, i) { return p.score === high ? i : -1; }).filter(function (i) { return i >= 0; });
      var rowHigh = Math.max.apply(null, tied.map(function (i) { return rows(s.players[i]); }));
      s.winners = tied.filter(function (i) { return rows(s.players[i]) === rowHigh; });
      s.winner = s.winners.length === 1 ? s.winners[0] : null;
    } else { s.round++; deal(s); }
    s.scores = s.players.map(function (p) { return p.score; });
  }
  function apply(state, player, action) {
    if (!state || !integer(player, 0, state.players.length - 1) || !legal(state, player).some(function (a) { return actionEqual(action, a); })) {
      return { ok: false, state: state, error: 'That move is not available.' };
    }
    var s = clone(state), p = s.players[player];
    if (action.type === 'draft') {
      var pile = action.source === -1 ? s.center : s.factories[action.source];
      var count = pile.filter(function (c) { return c === action.color; }).length;
      var rest = pile.filter(function (c) { return c !== action.color; });
      if (action.source === -1) {
        s.center = rest;
        if (s.marker) { s.marker = false; s.starter = player; floorTile(s, p, -1); }
      } else { s.factories[action.source] = []; s.center = s.center.concat(rest); }
      s.pending = { color: action.color, count: count, source: action.source };
      s.phase = 'place'; s.last = p.name + ' took ' + count + ' ' + COLORS[action.color].toLowerCase() + ' tile' + (count === 1 ? '' : 's') + '.';
    } else {
      var pending = s.pending, used = 0;
      if (action.row >= 0) {
        var line = p.lines[action.row];
        used = Math.min(pending.count, action.row + 1 - line.count);
        line.color = pending.color; line.count += used;
      }
      for (var i = used; i < pending.count; i++) floorTile(s, p, pending.color);
      s.pending = null; s.turn++; s.phase = 'draft'; s.current = (player + 1) % s.players.length;
      s.last = p.name + ' placed ' + used + ' on ' + (action.row < 0 ? 'the floor' : 'line ' + (action.row + 1))
        + (pending.count > used ? ' and sent ' + (pending.count - used) + ' to the floor.' : '.');
      if (!s.center.length && s.factories.every(function (a) { return !a.length; })) endRound(s);
    }
    return { ok: true, state: s };
  }
  function extraFloorCost(p, count, marker) {
    var before = p.floor.length, cost = 0;
    for (var i = before; i < Math.min(7, before + count + (marker ? 1 : 0)); i++) cost += FLOOR[i];
    return cost;
  }
  function choiceValue(s, player, color, count, row, marker, level) {
    var p = s.players[player];
    if (row < 0) return -8 - extraFloorCost(p, count, marker) * 3;
    var line = p.lines[row], cap = row + 1, used = Math.min(count, cap - line.count);
    var full = line.count + used === cap, val = used * 0.8 + (line.count + used) / cap;
    val -= extraFloorCost(p, count - used, marker) * 3;
    if (full) {
      val += 3 + placementPoints(p.wall, row, column(row, color)) * 2;
      if (p.wall[row].filter(Boolean).length === 4) val += level === 'hard' ? 9 : 4;
      if (level === 'hard') {
        var col = column(row, color);
        val += p.wall.filter(function (r) { return r[col]; }).length;
        val += p.wall.filter(function (r, i) { return r[column(i, color)]; }).length;
      }
    }
    return val;
  }
  function bot(s, player, level) {
    var actions = legal(s, player);
    if (!actions.length) return null;
    level = level === 'hard' || level === 'easy' ? level : 'normal';
    if (level === 'easy') return actions[((s.rng >>> 0) + s.turn * 17 + (s.phase === 'place' ? 3 : 0)) % actions.length];
    var best = actions[0], score = -Infinity;
    actions.forEach(function (a) {
      var value;
      if (a.type === 'place') value = choiceValue(s, player, s.pending.color, s.pending.count, a.row, false, level);
      else {
        var pile = a.source === -1 ? s.center : s.factories[a.source];
        var count = pile.filter(function (c) { return c === a.color; }).length;
        var marker = a.source === -1 && s.marker;
        value = choiceValue(s, player, a.color, count, -1, marker, level);
        for (var r = 0; r < 5; r++) if (canPlace(s.players[player], r, a.color)) value = Math.max(value, choiceValue(s, player, a.color, count, r, marker, level));
      }
      if (value > score) { best = a; score = value; }
    });
    return best;
  }
  function result(s) {
    if (!s.over) return 'Round ' + s.round;
    return s.winners.map(function (i) { return s.players[i].name; }).join(' and ') + (s.winners.length > 1 ? ' share the win.' : ' wins.');
  }
  return { create: create, actor: actor, legal: legal, apply: apply, bot: bot, result: result,
    COLORS: COLORS, FLOOR: FLOOR, colorAt: colorAt, column: column, placementPoints: placementPoints, bonuses: bonuses };
});
