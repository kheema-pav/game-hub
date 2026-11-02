/* Original Four in a Row engine for Game Hub. No external code or artwork. */
(function (root) {
  'use strict';
  var ROWS = 6, COLS = 7, ORDER = [3, 2, 4, 1, 5, 0, 6];
  var DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function create(config) {
    config = config || {};
    if (!Array.isArray(config.players) || config.players.length !== 2) throw new Error('Four in a Row needs exactly two players.');
    return { v: 1, game: 'connect4', seed: (config.seed >>> 0) || 1, players: clone(config.players), options: {},
      board: Array.from({ length: ROWS }, function () { return Array(COLS).fill(null); }), current: 0, moves: 0,
      last: null, winning: [], over: false, winner: null, winners: [], scores: [0, 0] };
  }
  function actor(state) { return state && !state.over ? state.current : -1; }
  function legal(state, player) {
    if (!state || state.over || player !== state.current || !Number.isInteger(player) || player < 0 || player > 1) return [];
    var actions = [];
    for (var c = 0; c < COLS; c++) if (state.board[0][c] === null) actions.push({ type: 'drop', column: c });
    return actions;
  }
  function rowFor(board, c) { for (var r = ROWS - 1; r >= 0; r--) if (board[r][c] === null) return r; return -1; }
  function lineAt(board, r, c, player) {
    for (var d = 0; d < DIRECTIONS.length; d++) {
      var dr = DIRECTIONS[d][0], dc = DIRECTIONS[d][1], line = [[r, c]];
      for (var sign = -1; sign <= 1; sign += 2) {
        var y = r + dr * sign, x = c + dc * sign;
        while (y >= 0 && y < ROWS && x >= 0 && x < COLS && board[y][x] === player) {
          line.push([y, x]); y += dr * sign; x += dc * sign;
        }
      }
      if (line.length >= 4) return line;
    }
    return [];
  }
  function reject(state, error) { return { ok: false, state: state, error: error }; }
  function apply(state, player, action) {
    if (!state || state.over) return reject(state, 'The game is over.');
    if (!Number.isInteger(player) || player !== state.current || player < 0 || player > 1) return reject(state, 'Wait for your turn.');
    if (!action || Array.isArray(action) || action.type !== 'drop' || !Number.isInteger(action.column) || action.column < 0 || action.column >= COLS) return reject(state, 'Choose a valid column.');
    var r = rowFor(state.board, action.column);
    if (r < 0) return reject(state, 'That column is full.');
    var next = clone(state), c = action.column;
    next.board[r][c] = player; next.moves++; next.last = { row: r, column: c, player: player };
    next.winning = lineAt(next.board, r, c, player);
    if (next.winning.length) { next.over = true; next.winner = player; next.winners = [player]; next.scores[player] = 1; }
    else if (next.moves >= ROWS * COLS) { next.over = true; next.winner = null; next.winners = []; }
    else next.current = 1 - player;
    return { ok: true, state: next };
  }
  function available(board) { return ORDER.filter(function (c) { return board[0][c] === null; }); }
  function winningDrop(board, c, player) {
    var r = rowFor(board, c); if (r < 0) return false;
    board[r][c] = player; var win = lineAt(board, r, c, player).length > 0; board[r][c] = null; return win;
  }
  function evaluate(board, me) {
    var value = 0, other = 1 - me;
    for (var r = 0; r < ROWS; r++) if (board[r][3] !== null) value += board[r][3] === me ? 5 : -5;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) for (var d = 0; d < DIRECTIONS.length; d++) {
      var dr = DIRECTIONS[d][0], dc = DIRECTIONS[d][1];
      if (y + 3 * dr < 0 || y + 3 * dr >= ROWS || x + 3 * dc < 0 || x + 3 * dc >= COLS) continue;
      var mine = 0, theirs = 0;
      for (var i = 0; i < 4; i++) { var cell = board[y + i * dr][x + i * dc]; if (cell === me) mine++; if (cell === other) theirs++; }
      if (mine && theirs) continue;
      if (mine) value += [0, 1, 9, 65, 100000][mine];
      if (theirs) value -= [0, 1, 10, 75, 100000][theirs];
    }
    return value;
  }
  function minimax(board, turn, me, depth, alpha, beta) {
    var columns = available(board);
    if (!columns.length) return 0;
    if (depth <= 0) return evaluate(board, me);
    var maximize = turn === me, best = maximize ? -Infinity : Infinity;
    for (var i = 0; i < columns.length; i++) {
      var c = columns[i], r = rowFor(board, c); board[r][c] = turn;
      var won = lineAt(board, r, c, turn).length > 0;
      var value = won ? (maximize ? 100000 + depth : -100000 - depth) : minimax(board, 1 - turn, me, depth - 1, alpha, beta);
      board[r][c] = null;
      if (maximize) { best = Math.max(best, value); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, value); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }
  // Expert keeps a completed Hard result as its fallback. A deterministic node budget,
  // rather than a timer, makes identical saved positions produce identical decisions.
  function expertChoice(board, player, fallback, hardDepth, empty) {
    var nodes = 0, budget = 40000, table = new Map(), interrupted = {};
    function search(turn, depth, alpha, beta, ply) {
      if (++nodes > budget) throw interrupted;
      var columns = available(board);
      if (!columns.length) return 0;
      var key = turn + ':' + board.map(function (row) { return row.map(function (n) { return n === null ? '.' : n; }).join(''); }).join('');
      var cached = table.get(key), originalAlpha = alpha, originalBeta = beta;
      if (cached && cached.depth >= depth) {
        if (cached.flag === 'exact') return cached.value;
        if (cached.flag === 'lower') alpha = Math.max(alpha, cached.value);
        if (cached.flag === 'upper') beta = Math.min(beta, cached.value);
        if (alpha >= beta) return cached.value;
      }
      // Resolve immediate wins even at the horizon, avoiding a tempting but lost leaf.
      for (var w = 0; w < columns.length; w++) if (winningDrop(board, columns[w], turn)) return turn === player ? 100000 - ply : -100000 + ply;
      if (depth <= 0) return evaluate(board, player);
      if (cached && columns.includes(cached.column)) columns = [cached.column].concat(columns.filter(function (c) { return c !== cached.column; }));
      var maximize = turn === player, best = maximize ? -Infinity : Infinity, choice = columns[0];
      for (var i = 0; i < columns.length; i++) {
        var c = columns[i], r = rowFor(board, c), value;
        board[r][c] = turn;
        try { value = search(1 - turn, depth - 1, alpha, beta, ply + 1); }
        finally { board[r][c] = null; }
        if (maximize ? value > best : value < best) { best = value; choice = c; }
        if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      table.set(key, { depth: depth, value: best, column: choice, flag: best <= originalAlpha ? 'upper' : best >= originalBeta ? 'lower' : 'exact' });
      return best;
    }
    var chosen = fallback;
    for (var depth = hardDepth + 1; depth <= Math.min(10, empty); depth++) {
      var columns = [chosen].concat(available(board).filter(function (c) { return c !== chosen; }));
      var best = -Infinity, candidate = chosen;
      try {
        for (var i = 0; i < columns.length; i++) {
          var c = columns[i], r = rowFor(board, c), value;
          board[r][c] = player;
          try { value = search(1 - player, depth - 1, best, Infinity, 1); }
          finally { board[r][c] = null; }
          if (value > best) { best = value; candidate = c; }
        }
      } catch (error) { if (error !== interrupted) throw error; break; }
      chosen = candidate;
      if (Math.abs(best) > 90000) break;
    }
    return chosen;
  }
  function bot(state, player, level) {
    var actions = legal(state, player); if (!actions.length) return null;
    var board = clone(state.board), columns = available(board);
    if (level === 'easy') return actions[(state.seed + state.moves * 17) % actions.length];
    var win = columns.find(function (c) { return winningDrop(board, c, player); });
    if (win !== undefined) return { type: 'drop', column: win };
    var block = columns.find(function (c) { return winningDrop(board, c, 1 - player); });
    if (block !== undefined) return { type: 'drop', column: block };
    if (level !== 'hard' && level !== 'expert') {
      var safe = columns.filter(function (c) {
        var r = rowFor(board, c); board[r][c] = player;
        var danger = available(board).some(function (n) { return winningDrop(board, n, 1 - player); }); board[r][c] = null; return !danger;
      });
      return { type: 'drop', column: (safe.length ? safe : columns)[0] };
    }
    var best = -Infinity, choice = columns[0], depth = state.moves > 16 ? 6 : 5;
    for (var i = 0; i < columns.length; i++) {
      var c = columns[i], r = rowFor(board, c); board[r][c] = player;
      var value = minimax(board, 1 - player, player, depth - 1, best, Infinity); board[r][c] = null;
      if (value > best) { best = value; choice = c; }
    }
    if (level === 'expert') choice = expertChoice(board, player, choice, depth, ROWS * COLS - state.moves);
    return { type: 'drop', column: choice };
  }
  function result(state) { return state.over ? state.winner === null ? 'A draw. The board is full.' : state.players[state.winner].name + ' connected four!' : 'Connect four discs in a row.'; }
  var engine = { create: create, actor: actor, legal: legal, apply: apply, bot: bot, result: result };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  if (root) { root.HubEngines = root.HubEngines || {}; root.HubEngines.connect4 = engine; }
})(typeof window !== 'undefined' ? window : null);
