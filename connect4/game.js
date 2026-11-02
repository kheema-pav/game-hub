/* Original Four in a Row browser view. All move submission goes through the shared runner. */
(function () {
  'use strict';
  var engine = window.HubEngines.connect4;
  var colors = ['#ef685f', '#f3cf53'];
  HubTabletop.mount({
    id: 'connect4', title: 'Four in a Row', minPlayers: 2, maxPlayers: 2, engine: engine, options: [],
    describe: function (action) { return 'Drop in column ' + (action.column + 1); },
    render: function (state, viewer, actions, context) {
      var esc = context.esc;
      var name = function (i) { return esc(state.players[i].name || ('Player ' + (i + 1))); };
      var controls = Array.from({ length: 7 }, function (_, col) {
        var index = actions.findIndex(function (a) { return a.type === 'drop' && a.column === col; });
        return '<button class="c4-drop"' + (index >= 0 ? ' data-move="' + index + '"' : ' disabled') + ' aria-label="Drop a disc in column ' + (col + 1) + '"><span aria-hidden="true">↓</span><span class="c4-column">' + (col + 1) + '</span></button>';
      }).join('');
      var board = state.board.map(function (row, r) {
        return '<div class="c4-row" role="row">' + row.map(function (owner, c) {
          var winning = state.winning.some(function (p) { return p[0] === r && p[1] === c; });
          var last = state.last && state.last.row === r && state.last.column === c;
          return '<span role="gridcell" class="c4-cell' + (winning ? ' c4-winning' : '') + (last ? ' c4-last' : '') + '"' + (owner !== null ? ' style="--disc:' + colors[owner] + '"' : '') + ' aria-label="Row ' + (r + 1) + ', column ' + (c + 1) + ': ' + (owner === null ? 'empty' : name(owner)) + '"></span>';
        }).join('') + '</div>';
      }).join('');
      var legend = state.players.map(function (_, i) { return '<span class="c4-player' + (!state.over && engine.actor(state) === i ? ' c4-active' : '') + '"><i style="background:' + colors[i] + '"></i>' + name(i) + '</span>'; }).join('');
      return '<section class="c4-game" aria-label="Four in a Row board"><p class="c4-help">Connect four horizontally, vertically or diagonally. A disc falls to the lowest empty space.</p><div class="c4-legend">' + legend + '</div><div class="c4-controls" aria-label="Choose a column">' + controls + '</div><div class="c4-board" role="grid" aria-label="Six rows and seven columns">' + board + '</div><p class="c4-foot">' + (state.over ? esc(engine.result(state)) : actions.length ? 'Choose a column above to drop your disc.' : 'Waiting for ' + name(engine.actor(state)) + ' to choose a column.') + '</p></section>';
    }
  });
})();
