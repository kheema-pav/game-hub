/* Yahtzee score previews and held dice are UI choices until a move is confirmed. */
(function () {
  'use strict';
  var E = window.HubEngines.yahtzee;
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function diceFace(n) { return '<span class="yz-pips" aria-hidden="true">' + Array.from({ length: 9 }, function (_, i) { return '<i' + ((PIPS[n] || []).includes(i) ? ' class="on"' : '') + '></i>'; }).join('') + (n ? '' : '<b>?</b>') + '</span>'; }
  HubTabletop.mount({
    id: 'yahtzee', title: 'Yahtzee', minPlayers: 2, maxPlayers: 4, engine: E, options: [],
    privateInformation: false, inlineRules: true,
    subtitle: 'Five dice. Thirteen chances. Know when to keep a good thing.',
    rules: ['Roll up to three times on your turn. Keep any dice and reroll the rest. You may release dice you kept earlier.', 'Choose one unused category each turn. A total of at least 63 in the upper section earns 35 extra points. Highest total after thirteen rounds wins.'],
    score: function (s, p) { return s.scores[p]; },
    describe: function (a) { return a.type === 'roll' ? a.keep ? 'Rerolled the unkept dice' : 'Rolled all five dice' : 'Scored ' + E.categories.find(function (c) { return c.id === a.category; }).label; },
    choose: function (draft, key, value, ctx) {
      if (key === 'keep' && ctx.state.rolls > 0 && ctx.state.rolls < 3) {
        var index = Number(value);
        if (Number.isInteger(index) && index >= 0 && index < 5) { draft.keep = (Number.isInteger(draft.keep) ? draft.keep : ctx.state.lastKeep) ^ (1 << index); draft.category = ''; }
      }
      if (key === 'category') draft.category = value;
      return draft;
    },
    render: function (s, viewer, actions, ctx) {
      var esc = ctx.esc, p = s.over ? Math.max(0, viewer) : s.current, person = s.players[p], totals = E.totals(person), canPlay = actions.length > 0;
      var keep = Number.isInteger(ctx.draft.keep) ? ctx.draft.keep : s.lastKeep, rollIndex = actions.findIndex(function (a) { return a.type === 'roll' && a.keep === (s.rolls ? keep : 0); });
      var selected = ctx.draft.category, choices = s.rolls ? E.scoreOptions(s.dice, person.card) : [];
      var joker = s.rolls && s.dice.every(function (d) { return d === s.dice[0]; }) && person.card.yahtzee !== null;
      var name = esc(person.name), upperOpen = E.categories.slice(0, 6).filter(function (c) { return person.card[c.id] === null; }).length;
      var players = s.players.map(function (player, i) {
        return '<div class="yz-player' + (!s.over && i === p ? ' active' : '') + '"><b>' + esc(player.name) + '</b><span>' + s.scores[i] + ' <small>pts</small></span><small>' + E.categories.filter(function (c) { return player.card[c.id] !== null; }).length + '/13 filled' + (player.bot ? ' · Bot' : '') + '</small></div>';
      }).join('');
      var dice = s.dice.map(function (n, i) {
        var held = !!(keep & (1 << i));
        return '<button class="yz-die' + (held && s.rolls ? ' kept' : '') + '" aria-pressed="' + (held && !!s.rolls) + '" aria-label="Die ' + (i + 1) + ': ' + (n || 'not rolled') + (n ? held ? ', kept. Release die' : '. Keep die' : '') + '"' + (canPlay && s.rolls > 0 && s.rolls < 3 ? ' data-choice="keep" data-value="' + i + '"' : ' disabled') + '>' + diceFace(n) + '<small>' + (s.rolls && held ? 'KEPT' : ' ') + '</small></button>';
      }).join('');
      function section(from, to, title) {
        return '<div class="yz-section"><h3>' + title + '</h3>' + E.categories.slice(from, to).map(function (category) {
          var filled = person.card[category.id] !== null, choice = choices.find(function (c) { return c.category === category.id; });
          var moveIndex = actions.findIndex(function (a) { return a.type === 'score' && a.category === category.id; });
          var chosen = selected === category.id && moveIndex >= 0;
          var row = '<button class="yz-category' + (filled ? ' filled' : '') + (chosen ? ' selected' : '') + '"' + (moveIndex >= 0 ? ' data-choice="category" data-value="' + category.id + '" aria-pressed="' + chosen + '"' : ' disabled') + '><span><b>' + category.label + '</b><small>' + category.hint + '</small></span><strong>' + (filled ? person.card[category.id] : choice ? choice.points : '·') + '</strong>' + (!filled && choice ? '<span class="yz-preview-label">preview</span>' : '') + '</button>';
          if (chosen) row += '<div class="yz-confirm" role="status"><p>' + (choice.points === 0 ? 'This uses ' + category.label + ' for zero points.' : 'Add ' + choice.points + ' points in ' + category.label + '.') + (choice.bonus ? ' Plus a 100-point Yahtzee bonus.' : '') + '</p><button class="tt-primary" data-move="' + moveIndex + '">Confirm ' + choice.points + ' points' + (choice.bonus ? ' + bonus' : '') + '</button></div>';
          return row;
        }).join('') + '</div>';
      }
      var rollLabel = !s.rolls ? 'Roll all five dice' : s.rolls === 3 ? 'Choose a score below' : keep === 31 ? 'Release a die or choose a score' : 'Roll again · ' + (3 - s.rolls) + ' left';
      var last = s.last ? '<p class="yz-last">Last turn: <b>' + esc(s.players[s.last.player].name) + '</b> scored ' + s.last.points + ' in ' + E.categories.find(function (c) { return c.id === s.last.category; }).label + (s.last.bonus ? ' + 100 bonus' : '') + '.</p>' : '';
      return '<div class="yz-table"><section class="yz-tray" aria-label="Dice tray"><div class="yz-eyebrow">THE DICE CLUB · ROUND ' + Math.min(13, s.round) + ' OF 13</div><h2>' + (s.over ? 'Every roll counted.' : person.name === 'You' ? 'Your dice' : name + '’s dice') + '</h2><p>' + (s.over ? esc(E.result(s)) : !s.rolls ? 'Roll to begin your turn.' : 'Tap dice to keep them. Choose a score any time.') + '</p><div class="yz-dice">' + dice + '</div><div class="yz-roll-track" aria-label="' + s.rolls + ' of three rolls used">' + [1, 2, 3].map(function (n) { return '<span class="' + (n <= s.rolls ? 'used' : '') + '">' + n + '</span>'; }).join('') + '<small>' + s.rolls + '/3 rolls used</small></div><button class="yz-roll tt-primary"' + (rollIndex >= 0 ? ' data-move="' + rollIndex + '"' : ' disabled') + '>' + (canPlay || s.over ? rollLabel : 'Waiting for ' + name) + '</button>' + (joker ? '<p class="yz-joker">Joker roll! ' + (person.card.yahtzee === 50 ? '+100 bonus when scored. ' : '') + (person.card[E.categories[s.dice[0] - 1].id] === null ? 'Use the matching upper category.' : choices.some(function (c) { return E.categories.findIndex(function (x) { return x.id === c.category; }) >= 6; }) ? 'Choose an open lower category.' : 'The lower section is full. Choose an upper category for zero.') + '</p>' : '') + last + '<div class="yz-players">' + players + '</div></section><section class="yz-sheet" aria-label="' + name + ' scorecard"><div class="yz-sheet-head"><div class="yz-eyebrow">' + name + ' · SCORECARD</div><b>' + totals.total + '<small> points</small></b></div><p class="yz-sheet-hint">' + (s.over ? 'Final scores, including bonuses.' : s.rolls ? 'Tap an open row to preview, then confirm your score.' : 'Roll first to see your scoring options.') + '</p>' + section(0, 6, 'Upper section') + '<div class="yz-bonus"><b>Upper bonus</b><span>' + totals.upper + '/63 · ' + (totals.upperBonus ? '+35 earned' : upperOpen ? '35 points to earn' : 'not reached') + '</span><meter min="0" max="63" value="' + Math.min(63, totals.upper) + '" aria-label="Upper section ' + totals.upper + ' of 63 points"></meter></div>' + section(6, 13, 'Lower section') + '<div class="yz-total"><span>Yahtzee bonuses</span><b>' + person.bonus + '</b></div><div class="yz-total grand"><span>Total</span><b>' + totals.total + '</b></div></section></div><details class="yz-other"><summary>Other scorecards</summary><div class="yz-other-cards">' + s.players.map(function (player, i) { if (i === p) return ''; return '<section><h3>' + esc(player.name) + ' · ' + s.scores[i] + ' points</h3><dl>' + E.categories.map(function (c) { return '<div><dt>' + c.label + '</dt><dd>' + (player.card[c.id] === null ? 'Open' : player.card[c.id]) + '</dd></div>'; }).join('') + '</dl><p>Upper bonus: ' + E.totals(player).upperBonus + ' · Yahtzee bonuses: ' + player.bonus + '</p></section>'; }).join('') + '</div></details><details class="yz-rules"><summary>How to play and score</summary><p>Each turn, roll up to three times. Tap a die to keep it or release it for the next roll. You may score after any roll. Select one of your unused categories, check the preview and confirm. A zero uses that category too.</p><p>Reach 63 in the upper section for 35 bonus points. Three/four of a kind score the sum of all five dice. Full house means a pair and three of another number; a small/large straight needs four/five consecutive numbers. Chance is the sum of all dice. Your first Yahtzee scores 50.</p><p>After your Yahtzee category is filled, another five-of-a-kind uses the Joker rule: fill the matching upper category first; if it is filled, use an open lower category, with full house/straights worth their fixed scores. If all lower categories are full, put zero in an open upper category. You also earn 100 extra points if your Yahtzee category contains 50; a zero there earns no bonus.</p><p>After all thirteen categories are filled for every player, the highest total wins. Equal totals share the win. This version starts with Player 1 and supports two to four players.</p></details>';
    }
  });
})();
