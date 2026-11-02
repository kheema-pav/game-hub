/* Reversi view. Legal moves and every submitted action come from the engine. */
(function () {
  'use strict';
  var E = window.HubEngines.reversi;
  var rules = '<p>Black plays first. Place a disc on a highlighted empty square to trap one or more opposing discs between your new disc and another of your discs. Every trapped line flips, horizontally, vertically or diagonally.</p><p>You must play if you can. If you have no legal move, your turn is passed automatically. The game ends when neither player can move, even if some squares are empty. The player with more discs wins; equal counts are a draw.</p><p>A faint disc marks a legal move; its number is how many discs it flips. Hover or focus a move to outline those discs. A gold ring marks the last disc placed. Corners cannot be flipped once taken.</p>';
  function render(s, viewer, actions, context) {
    var esc = context.esc, turn = E.actor(s), name = function (i) { return esc(s.players[i].name); };
    var scores = s.players.map(function (p, i) {
      return '<div class="rv-player' + (i === turn ? ' rv-active' : '') + '"><i class="rv-disc rv-' + (i ? 'white' : 'black') + '" aria-hidden="true"></i><div><b>' + name(i) + '</b><small>' + (i ? 'White' : 'Black') + (i === turn ? ' · Playing' : '') + '</small></div><strong>' + s.scores[i] + '<span>discs</span></strong></div>';
    }).join('');
    var squares = s.board.map(function (owner, square) {
      var index = actions.findIndex(function (a) { return a.square === square; }), available = index >= 0;
      var flips = available ? E.flips(s.board, turn, square) : [], last = s.last && s.last.square === square;
      var label = E.coordinate(square) + ': ' + (owner === null ? available ? 'place ' + (turn ? 'white' : 'black') + ', flips ' + flips.length + ' disc' + (flips.length === 1 ? '' : 's') : 'empty' : (owner ? 'white' : 'black') + ', ' + s.players[owner].name) + (last ? ', last move' : '');
      var content = owner === null ? available ? '<span class="rv-ghost rv-' + (turn ? 'white' : 'black') + '" aria-hidden="true">' + flips.length + '</span>' : '' : '<span class="rv-disc rv-' + (owner ? 'white' : 'black') + (last ? ' rv-last' : '') + '" aria-hidden="true"></span>';
      return available ? '<button class="rv-square rv-legal" data-move="' + index + '" data-rv-square="' + square + '" data-rv-flips="' + flips.join(',') + '" aria-label="' + esc(label) + '">' + content + '</button>' : '<span class="rv-square" data-rv-square="' + square + '" role="img" aria-label="' + esc(label) + '">' + content + '</span>';
    }).join('');
    var message = s.over ? esc(E.result(s)) : s.passed !== null ? name(s.passed) + ' has no legal move. ' + name(turn) + ' plays again.' : actions.length ? 'Choose a faint disc. The number shows how many you flip.' : 'Waiting for ' + name(turn) + ' to place a disc.';
    return '<section class="rv-game" aria-label="Reversi table"><div class="rv-heading"><b>THE TURNING TABLE</b><span>' + (s.over ? 'Final count' : 'Move ' + (s.moves + 1)) + '</span></div><div class="rv-scoreboard">' + scores + '</div><div class="rv-board-wrap"><div class="rv-files" aria-hidden="true">' + 'ABCDEFGH'.split('').map(function (file) { return '<span>' + file + '</span>'; }).join('') + '</div><div class="rv-ranks" aria-hidden="true">' + Array.from({ length: 8 }, function (_, i) { return '<span>' + (i + 1) + '</span>'; }).join('') + '</div><div class="rv-board" aria-label="Eight by eight Reversi board">' + squares + '</div></div><p class="rv-caption" role="status">' + message + '</p><div class="rv-tip"><span aria-hidden="true">◈</span> A corner is yours for the rest of the game.</div></section><details class="rv-rules"><summary>How to play Reversi</summary>' + rules + '</details>';
  }
  HubTabletop.mount({ id: 'reversi', title: 'Reversi', minPlayers: 2, maxPlayers: 2, engine: E, options: [], privateInformation: false, inlineRules: true,
    subtitle: 'A simple move can turn the whole board. Claim the corners. Keep your options open.', rules: rules,
    describe: function (action, state) { var count = E.flips(state.board, state.current, action.square).length; return 'Place at ' + E.coordinate(action.square) + ', flip ' + count + ' disc' + (count === 1 ? '' : 's'); }, render: render });
  var root = document.getElementById('app');
  function clearPreview() { root.querySelectorAll('.rv-will-flip').forEach(function (node) { node.classList.remove('rv-will-flip'); }); }
  function preview(event) {
    if (event.type === 'pointerover' && event.pointerType !== 'mouse') return;
    clearPreview();
    var target = event.target.closest('[data-rv-flips]'); if (!target || !root.contains(target)) return;
    target.getAttribute('data-rv-flips').split(',').forEach(function (square) {
      if (!/^\d{1,2}$/.test(square)) return;
      var node = root.querySelector('[data-rv-square="' + square + '"]'); if (node) node.classList.add('rv-will-flip');
    });
  }
  root.addEventListener('pointerover', preview);
  root.addEventListener('focusin', preview);
  root.addEventListener('pointerleave', clearPreview);
  root.addEventListener('focusout', clearPreview);
})();
