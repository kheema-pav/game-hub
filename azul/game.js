(function () {
  'use strict';
  var E = window.HubEngines.azul;
  var SYMBOLS = ['◆', '●', '✚', '✦', '◇'];
  function tile(color, filled, extra) {
    return '<span class="az-tile az-c' + color + (filled ? ' az-filled' : ' az-empty') + (extra ? ' ' + extra : '')
      + '" aria-label="' + E.COLORS[color] + (filled ? ' tile' : ' empty space') + '">' + SYMBOLS[color] + '</span>';
  }
  function countColor(pile, color) { return pile.filter(function (c) { return c === color; }).length; }
  function actionIndex(actions, test) { return actions.findIndex(test); }
  function pileHTML(pile, source, actions, center, marker) {
    var html = '';
    for (var color = 0; color < 5; color++) {
      var count = countColor(pile, color);
      if (!count) continue;
      var index = actionIndex(actions, function (a) { return a.type === 'draft' && a.source === source && a.color === color; });
      var label = 'Take ' + count + ' ' + E.COLORS[color].toLowerCase() + ' tile' + (count === 1 ? '' : 's') + ' from ' + (center ? 'the centre' : 'factory ' + (source + 1));
      html += '<' + (index >= 0 ? 'button type="button" data-move="' + index + '" aria-label="' + label + '"' : 'span')
        + ' class="az-group">' + tile(color, true) + '<b>×' + count + '</b></' + (index >= 0 ? 'button' : 'span') + '>';
    }
    if (center && marker) html += '<span class="az-marker" title="First to draft from the centre takes this marker and starts the next round. It takes a floor space.">1st</span>';
    return html || '<span class="az-none">Empty</span>';
  }
  function boardHTML(s, player, actions, esc, active) {
    var p = s.players[player], mine = player === s.current && s.phase === 'place' && actions.length;
    var html = '<section class="az-board' + (active ? ' az-board-main' : '') + (player === s.current && !s.over ? ' az-current' : '') + '" aria-label="' + esc(p.name) + ' tile board">'
      + '<header class="az-board-head"><h3>' + esc(p.name) + (player === s.current && !s.over ? ' <span class="az-badge">Playing</span>' : '')
      + '</h3><strong>' + p.score + ' <small>points</small></strong></header>'
      + '<div class="az-grid-labels"><span>Pattern lines</span><span>Wall</span></div><div class="az-rows">';
    for (var row = 0; row < 5; row++) {
      var line = p.lines[row];
      var index = mine ? actionIndex(actions, function (a) { return a.type === 'place' && a.row === row; }) : -1;
      var placed = s.pending && index >= 0 ? Math.min(s.pending.count, row + 1 - line.count) : 0;
      var spill = s.pending && index >= 0 ? s.pending.count - placed : 0;
      var label = 'Line ' + (row + 1) + ', ' + line.count + ' of ' + (row + 1) + ' filled';
      if (index >= 0) label += '. Place ' + placed + ' ' + E.COLORS[s.pending.color] + ' tile' + (placed === 1 ? '' : 's') + (spill ? ', ' + spill + ' to floor' : '');
      html += '<div class="az-row"><' + (index >= 0 ? 'button type="button" data-move="' + index + '"' : 'div')
        + ' class="az-pattern' + (index >= 0 ? ' az-available' : '') + '" aria-label="' + label + '"><span class="az-row-number">' + (row + 1) + '</span><span class="az-slots">';
      for (var space = 0; space < row + 1; space++) {
        var filled = space >= row + 1 - line.count;
        html += filled ? tile(line.color, true) : '<span class="az-tile az-slot" aria-hidden="true"></span>';
      }
      html += '</span>' + (index >= 0 ? '<span class="az-place-label">+' + placed + (spill ? ' / floor ' + spill : '') + '</span>' : '')
        + '</' + (index >= 0 ? 'button' : 'div') + '><div class="az-wall-row">';
      for (var col = 0; col < 5; col++) {
        var color = E.colorAt(row, col);
        html += tile(color, p.wall[row][col], index >= 0 && color === s.pending.color ? 'az-target' : '');
      }
      html += '</div></div>';
    }
    html += '</div><div class="az-floor"><span class="az-floor-label">Floor</span><div class="az-floor-slots">';
    for (var space = 0; space < 7; space++) {
      var floorColor = p.floor[space];
      html += '<span class="az-floor-space"><small>−' + E.FLOOR[space] + '</small>'
        + (floorColor === -1 ? '<span class="az-marker">1st</span>' : floorColor === undefined ? '<span class="az-tile az-slot"></span>' : tile(floorColor, true)) + '</span>';
    }
    var floorIndex = mine ? actionIndex(actions, function (a) { return a.type === 'place' && a.row === -1; }) : -1;
    html += '</div></div>' + (floorIndex >= 0 ? '<button class="az-to-floor" type="button" data-move="' + floorIndex + '">Send all ' + s.pending.count + ' to floor</button>' : '');
    var last = s.lastRound[player];
    if (last) html += '<p class="az-round-result">Last round: +' + last.gained + ' wall points, −' + last.penalty + ' floor'
      + (last.bonus ? '. End bonuses: +' + last.bonus.points + ' (' + last.bonus.rows + ' rows, ' + last.bonus.columns + ' columns, ' + last.bonus.colors + ' colours)' : '') + '.</p>';
    return html + '</section>';
  }
  function render(s, viewer, actions, context) {
    var esc = context.esc;
    var viewing = Number.isInteger(viewer) && viewer >= 0 && viewer < s.players.length ? viewer : s.current;
    var canAct = actions.length > 0;
    var prompt = s.over ? E.result(s) : s.phase === 'place'
      ? (canAct ? 'Choose one pattern line for your ' : s.players[s.current].name + ' is placing ') + s.pending.count + ' ' + E.COLORS[s.pending.color].toLowerCase() + ' tiles.'
      : canAct ? 'Take every tile of one colour from a factory or the centre.' : 'Waiting for ' + s.players[s.current].name + ' to draft tiles.';
    var html = '<div class="az-play"><div class="az-status"><div><span class="az-eyebrow">Round ' + s.round + '</span><h2>' + esc(prompt) + '</h2></div>'
      + '<p>' + s.bag.length + ' tiles in bag · ' + s.discard.length + ' in discard</p></div>';
    if (!s.over) {
      html += '<section class="az-supply" aria-label="Shared tile supply"><div class="az-factories">';
      s.factories.forEach(function (pile, i) {
        html += '<div class="az-factory"><h3>Factory ' + (i + 1) + '</h3><div class="az-pile">' + pileHTML(pile, i, actions, false, false) + '</div></div>';
      });
      html += '</div><div class="az-center"><div><h3>Centre</h3><p>First to take here starts next round and takes a floor penalty.</p></div><div class="az-pile">'
        + pileHTML(s.center, -1, actions, true, s.marker) + '</div></div></section>';
      if (s.pending) html += '<p class="az-picked">Drafted: ' + tile(s.pending.color, true) + '<b>×' + s.pending.count + '</b>. Fill a matching line or use the floor. Any excess goes to the floor.</p>';
    }
    html += '<div class="az-boards">' + boardHTML(s, viewing, actions, esc, true);
    s.players.forEach(function (_, i) { if (i !== viewing) html += boardHTML(s, i, [], esc, false); });
    html += '</div><details class="az-help"><summary>How to play and scoring</summary><p>Draft one colour, then place the whole group on one pattern line. A line holds only one colour, and its wall row must not already contain that colour. Excess tiles fall to the floor. You may send the whole draft to the floor.</p>'
      + '<p>After the supply empties, each completed line sends one tile to the wall. Adjacent tiles score together horizontally and vertically. Incomplete lines stay for next round. Floor penalties apply after wall points, with a minimum score of zero.</p>'
      + '<p>A completed wall row ends the game after that round. Bonuses: 2 per full row, 7 per full column, 10 per complete colour. Highest score wins; tied scores compare full rows, then share victory.</p>'
      + '<p><a href="https://cdn.svc.asmodee.net/production-nextmove/uploads/sites/4/2024/06/EN-Azul-Rules-Next-Move-web.pdf" target="_blank" rel="noopener">Official base-game rules</a>. Original fan-made interface, normal coloured wall. Game design by Michael Kiesling. Not affiliated with its publishers.</p></details></div>';
    return html;
  }
  HubTabletop.mount({ id: 'azul', title: 'Azul', subtitle: 'Draft colourful tiles and build a connected mosaic. 2 to 4 players.', minPlayers: 2, maxPlayers: 4, engine: E, options: [],
    rules: ['Take every tile of one colour from one factory or the centre, then place the group on one pattern line. The rest of a factory moves to the centre.',
      'Complete pattern lines send one tile each to the wall at round end. Neighbouring tiles score together. Excess tiles and the first-player marker take floor spaces and lose points.',
      'A full wall row ends the game after that round. Bonuses: 2 per row, 7 per column, 10 per complete colour. Highest score wins; tied scores compare complete rows, then share victory.'],
    accent: '#167a9e', render: render,
    describe: function (a, s) { return a.type === 'draft' ? 'Take ' + E.COLORS[a.color] + ' from ' + (a.source === -1 ? 'centre' : 'factory ' + (a.source + 1))
      : a.row < 0 ? 'Place on floor' : 'Place on line ' + (a.row + 1); },
    score: function (s, i) { return s.players[i].score; } });
})();
