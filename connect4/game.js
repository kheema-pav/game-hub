/* Original Four in a Row browser view. All move submission goes through the shared runner. */
(function () {
  'use strict';
  var engine = window.HubEngines.connect4;
  var colors = ['#f46b60', '#f6ce55'];
  var marks = ['●', '◆'];
  HubTabletop.mount({
    id: 'connect4', title: 'Four in a Row', minPlayers: 2, maxPlayers: 2, engine: engine, options: [],
    privateInformation: false,
    subtitle: 'A little foresight. A perfectly placed disc. Your next four starts here.',
    rules: ['Tap any column to drop a disc into its lowest empty space. On a keyboard, Tab to a column and press Enter or Space.', 'Connect four of your discs horizontally, vertically or diagonally. The white ring marks the last move; the winning four shine together.'],
    describe: function (action) { return 'Drop in column ' + (action.column + 1); },
    render: function (state, viewer, actions, context) {
      var esc = context.esc;
      var name = function (i) { return esc(state.players[i].name || ('Player ' + (i + 1))); };
      var controls = Array.from({ length: 7 }, function (_, col) {
        var index = actions.findIndex(function (a) { return a.type === 'drop' && a.column === col; });
        var landing = -1;
        for (var r = 5; r >= 0; r--) if (state.board[r][col] === null) { landing = r; break; }
        return '<button class="c4-drop"' + (index >= 0 ? ' data-move="' + index + '"' : ' disabled') + ' aria-label="' + (landing < 0 ? 'Column ' + (col + 1) + ' is full' : 'Drop a disc in column ' + (col + 1)) + '"><span class="c4-drop-label" aria-hidden="true"><span class="c4-arrow">' + (landing < 0 ? '×' : '↓') + '</span><span class="c4-column">' + (col + 1) + '</span></span><span class="c4-lane" aria-hidden="true">' + (index >= 0 ? '<span class="c4-preview" style="top:' + ((landing + .5) / 6 * 100) + '%">' + marks[engine.actor(state)] + '</span>' : '') + '</span></button>';
      }).join('');
      var board = state.board.map(function (row, r) {
        return '<div class="c4-row" role="row">' + row.map(function (owner, c) {
          var winning = state.winning.some(function (p) { return p[0] === r && p[1] === c; });
          var last = state.last && state.last.row === r && state.last.column === c;
          return '<span role="gridcell" class="c4-cell' + (owner !== null ? ' c4-filled' : '') + (winning ? ' c4-winning' : '') + (last ? ' c4-last' : '') + '"' + (owner !== null ? ' style="--disc:' + colors[owner] + '"' : '') + ' aria-label="Row ' + (r + 1) + ', column ' + (c + 1) + ': ' + (owner === null ? 'empty' : name(owner)) + (last ? ', last move' : '') + (winning ? ', winning disc' : '') + '"><span aria-hidden="true">' + (owner === null ? '' : marks[owner]) + '</span></span>';
        }).join('') + '</div>';
      }).join('');
      var legend = state.players.map(function (player, i) { var active = !state.over && engine.actor(state) === i; return '<div class="c4-player' + (active ? ' c4-active' : '') + '" style="--disc:' + colors[i] + '"><i aria-hidden="true">' + marks[i] + '</i><span><b>' + name(i) + '</b><small>' + (state.over ? state.winner === i ? 'Winner' : state.winner === null ? 'Draw' : 'Well played' : active ? 'Your move' : player.bot ? 'Computer' : 'Up next') + '</small></span></div>'; }).join('');
      return '<section class="c4-game" aria-label="Four in a Row board" style="--turn-disc:' + colors[Math.max(0, engine.actor(state))] + '"><div class="c4-table-heading"><p>MAKE YOUR FOUR</p><span>' + (state.over ? 'Game complete' : 'Move ' + (state.moves + 1)) + '</span></div><div class="c4-legend">' + legend + '</div><div class="c4-playfield"><div class="c4-board" role="grid" aria-label="Six rows and seven columns">' + board + '</div><div class="c4-controls" aria-label="Choose a column">' + controls + '</div></div><p class="c4-foot">' + (state.over ? esc(engine.result(state)) : actions.length ? 'Tap any column. Make four in any direction.' : 'Waiting for ' + name(engine.actor(state)) + ' to drop a disc.') + '</p></section>';
    }
  });
})();
