/* Original, deterministic Reversi engine. Public board only; no external bot service. */
(function (root) {
  'use strict';
  var DIRECTIONS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  var CORNERS = [0,7,56,63];
  var WEIGHTS = [100,-22,12,6,6,12,-22,100,-22,-40,-3,-3,-3,-3,-40,-22,12,-3,6,2,2,6,-3,12,6,-3,2,1,1,2,-3,6,6,-3,2,1,1,2,-3,6,12,-3,6,2,2,6,-3,12,-22,-40,-3,-3,-3,-3,-40,-22,100,-22,12,6,6,12,-22,100];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function create(config) {
    config = config || {};
    if (!Array.isArray(config.players) || config.players.length !== 2) throw new Error('Reversi needs exactly two players.');
    var board = Array(64).fill(null);
    board[27] = board[36] = 1; board[28] = board[35] = 0;
    return { v: 1, game: 'reversi', seed: (config.seed >>> 0) || 1, players: config.players.map(function (p, i) {
      return { name: String(p.name || 'Player ' + (i + 1)).slice(0, 40), bot: !!p.bot, color: i ? '#f4f0e7' : '#202c30' };
    }), options: {}, board: board, current: 0, moves: 0, last: null, passed: null, over: false, winner: null, winners: [], scores: [2,2] };
  }
  function actor(state) { return state && !state.over ? state.current : -1; }
  function flips(board, player, square) {
    if (!Array.isArray(board) || board.length !== 64 || (player !== 0 && player !== 1) || !Number.isInteger(square) || square < 0 || square > 63 || board[square] !== null) return [];
    var row = square >> 3, col = square % 8, found = [];
    for (var d = 0; d < 8; d++) {
      var dy = DIRECTIONS[d][0], dx = DIRECTIONS[d][1], r = row + dy, c = col + dx, line = [];
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 1 - player) { line.push(r * 8 + c); r += dy; c += dx; }
      if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === player) found = found.concat(line);
    }
    return found;
  }
  function moves(board, player) {
    var result = [];
    for (var square = 0; square < 64; square++) if (board[square] === null) {
      var captured = flips(board, player, square);
      if (captured.length) result.push({ square: square, flips: captured });
    }
    return result;
  }
  function legal(state, player) {
    if (!state || state.over || (player !== 0 && player !== 1) || player !== state.current) return [];
    return moves(state.board, player).map(function (move) { return { type: 'place', square: move.square }; });
  }
  function counts(board) { var out = [0,0]; board.forEach(function (p) { if (p === 0 || p === 1) out[p]++; }); return out; }
  function put(board, player, move) { board[move.square] = player; move.flips.forEach(function (i) { board[i] = player; }); }
  function undo(board, player, move) { board[move.square] = null; move.flips.forEach(function (i) { board[i] = 1 - player; }); }
  function reject(state, error) { return { ok: false, state: state, error: error }; }
  function apply(state, player, action) {
    if (!state || state.over) return reject(state, 'This game has finished.');
    if ((player !== 0 && player !== 1) || player !== state.current) return reject(state, 'Wait for your turn.');
    if (!action || Array.isArray(action) || Object.keys(action).sort().join(',') !== 'square,type' || action.type !== 'place') return reject(state, 'Choose a highlighted square.');
    var captured = flips(state.board, player, action.square);
    if (!captured.length) return reject(state, 'A move must trap at least one opposing disc.');
    var next = clone(state);
    put(next.board, player, { square: action.square, flips: captured });
    next.moves++; next.last = { square: action.square, player: player, flipped: captured }; next.passed = null;
    next.scores = counts(next.board);
    if (moves(next.board, 1 - player).length) next.current = 1 - player;
    else if (moves(next.board, player).length) { next.current = player; next.passed = 1 - player; }
    else {
      next.over = true;
      next.winner = next.scores[0] === next.scores[1] ? null : next.scores[0] > next.scores[1] ? 0 : 1;
      next.winners = next.winner === null ? [] : [next.winner];
    }
    return { ok: true, state: next };
  }
  function evaluate(board, me) {
    var other = 1 - me, score = 0, material = 0, frontier = 0, empty = 0;
    for (var i = 0; i < 64; i++) {
      if (board[i] === null) { empty++; continue; }
      var sign = board[i] === me ? 1 : -1, r = i >> 3, c = i % 8;
      material += sign; score += sign * WEIGHTS[i];
      for (var d = 0; d < 8; d++) {
        var y = r + DIRECTIONS[d][0], x = c + DIRECTIONS[d][1];
        if (y >= 0 && y < 8 && x >= 0 && x < 8 && board[y * 8 + x] === null) { frontier += sign; break; }
      }
    }
    // Adjacent edge discs become useful once their corner is secured; before that
    // their position weights discourage handing over an unflippable corner.
    CORNERS.forEach(function (corner) {
      var owner = board[corner]; if (owner === null) return;
      var sign = owner === me ? 1 : -1, horizontal = corner % 8 === 0 ? 1 : -1, vertical = corner < 8 ? 8 : -8;
      score += sign * 450;
      [horizontal, vertical].forEach(function (step) {
        for (var n = 1; n < 8 && board[corner + n * step] === owner; n++) score += sign * 20;
      });
    });
    score += (moves(board, me).length - moves(board, other).length) * (empty > 16 ? 13 : 7);
    score -= frontier * (empty > 16 ? 6 : 2);
    score += material * (empty <= 12 ? 14 : empty <= 24 ? 3 : -1);
    return score;
  }
  function ordered(board, player) {
    return moves(board, player).sort(function (a, b) { return WEIGHTS[b.square] - WEIGHTS[a.square] || a.square - b.square; });
  }
  function bot(state, player, level) {
    var actions = legal(state, player); if (!actions.length) return null;
    if (actions.length === 1) return actions[0];
    if (level === 'easy') return actions[((state.seed >>> 0) + state.moves * 17) % actions.length];
    var board = state.board.slice(), candidates = ordered(board, player), choice = candidates[0].square, best = -Infinity;
    candidates.forEach(function (move) {
      put(board, player, move); var value = evaluate(board, player); undo(board, player, move);
      if (value > best) { best = value; choice = move.square; }
    });
    if (level !== 'hard' && level !== 'expert') return { type: 'place', square: choice };
    var nodes = 0, budget = level === 'expert' ? 16000 : 5000, interrupted = {};
    var empty = board.filter(function (p) { return p === null; }).length;
    function search(turn, depth, alpha, beta) {
      if (++nodes > budget) throw interrupted;
      var options = ordered(board, turn);
      if (!options.length) {
        if (!moves(board, 1 - turn).length) { var score = counts(board), margin = score[player] - score[1 - player]; return margin === 0 ? 0 : Math.sign(margin) * 100000 + margin; }
        return search(1 - turn, depth, alpha, beta);
      }
      if (depth <= 0) return evaluate(board, player);
      var maximize = turn === player, value = maximize ? -Infinity : Infinity;
      for (var i = 0; i < options.length; i++) {
        put(board, turn, options[i]); var child;
        try { child = search(1 - turn, depth - 1, alpha, beta); }
        finally { undo(board, turn, options[i]); }
        if (maximize) { value = Math.max(value, child); alpha = Math.max(alpha, value); }
        else { value = Math.min(value, child); beta = Math.min(beta, value); }
        if (alpha >= beta) break;
      }
      return value;
    }
    var maxDepth = level === 'expert' ? empty <= 10 ? empty : 6 : 3;
    for (var depth = 2; depth <= maxDepth; depth++) {
      var iterationBest = -Infinity, iterationChoice = choice;
      candidates.sort(function (a, b) { return (b.square === choice ? 1 : 0) - (a.square === choice ? 1 : 0); });
      try {
        for (var i = 0; i < candidates.length; i++) {
          var move = candidates[i], value;
          put(board, player, move);
          try { value = search(1 - player, depth - 1, iterationBest, Infinity); }
          finally { undo(board, player, move); }
          if (value > iterationBest) { iterationBest = value; iterationChoice = move.square; }
        }
      } catch (error) { if (error !== interrupted) throw error; break; }
      choice = iterationChoice;
      if (Math.abs(iterationBest) >= 100000) break;
    }
    return { type: 'place', square: choice };
  }
  function coordinate(square) { return 'ABCDEFGH'[square % 8] + ((square >> 3) + 1); }
  function result(state) {
    if (!state.over) return 'Trap a line of opposing discs. Finish with the most discs.';
    return state.winner === null ? 'A draw: ' + state.scores[0] + ' discs each.' : state.players[state.winner].name + ' wins, ' + state.scores[state.winner] + ' discs to ' + state.scores[1 - state.winner] + '.';
  }
  var engine = { create: create, actor: actor, legal: legal, apply: apply, bot: bot, result: result, flips: flips, coordinate: coordinate };
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) { root.HubEngines = root.HubEngines || {}; root.HubEngines.reversi = engine; }
})(typeof window !== 'undefined' ? window : null);
