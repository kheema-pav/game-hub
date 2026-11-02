/* Original, deterministic Yahtzee engine. Probability search never reads future rolls. */
(function (root) {
  'use strict';
  var CATEGORIES = [
    { id: 'ones', label: 'Ones', hint: 'Add the ones', face: 1 },
    { id: 'twos', label: 'Twos', hint: 'Add the twos', face: 2 },
    { id: 'threes', label: 'Threes', hint: 'Add the threes', face: 3 },
    { id: 'fours', label: 'Fours', hint: 'Add the fours', face: 4 },
    { id: 'fives', label: 'Fives', hint: 'Add the fives', face: 5 },
    { id: 'sixes', label: 'Sixes', hint: 'Add the sixes', face: 6 },
    { id: 'three', label: 'Three of a kind', hint: '3 matching · add all dice' },
    { id: 'four', label: 'Four of a kind', hint: '4 matching · add all dice' },
    { id: 'full', label: 'Full house', hint: 'A pair + three matching · 25' },
    { id: 'small', label: 'Small straight', hint: '4 in a sequence · 30' },
    { id: 'large', label: 'Large straight', hint: '5 in a sequence · 40' },
    { id: 'yahtzee', label: 'Yahtzee', hint: '5 matching · 50' },
    { id: 'chance', label: 'Chance', hint: 'Add all dice' }
  ];
  var KEYS = CATEGORIES.map(function (c) { return c.id; });
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function counts(dice) { var c = [0, 0, 0, 0, 0, 0]; dice.forEach(function (d) { if (d >= 1 && d <= 6) c[d - 1]++; }); return c; }
  function isYahtzee(dice) { return dice.length === 5 && dice[0] > 0 && dice.every(function (d) { return d === dice[0]; }); }
  function rawScore(dice, category, joker) {
    var c = counts(dice), sum = dice.reduce(function (n, d) { return n + d; }, 0), upper = KEYS.indexOf(category);
    if (upper >= 0 && upper < 6) return c[upper] * (upper + 1);
    if (category === 'three') return Math.max.apply(null, c) >= 3 ? sum : 0;
    if (category === 'four') return Math.max.apply(null, c) >= 4 ? sum : 0;
    if (category === 'full') return joker || c.includes(3) && c.includes(2) ? 25 : 0;
    if (category === 'small') return joker || [0, 1, 2].some(function (i) { return c.slice(i, i + 4).every(Boolean); }) ? 30 : 0;
    if (category === 'large') return joker || [0, 1].some(function (i) { return c.slice(i, i + 5).every(Boolean); }) ? 40 : 0;
    if (category === 'yahtzee') return isYahtzee(dice) ? 50 : 0;
    return category === 'chance' ? sum : 0;
  }
  function scoreOptions(dice, card) {
    var open = KEYS.filter(function (key) { return card[key] === null; });
    var joker = isYahtzee(dice) && card.yahtzee !== null;
    if (joker) {
      var upper = KEYS[dice[0] - 1], lower = open.filter(function (key) { return KEYS.indexOf(key) >= 6; });
      open = card[upper] === null ? [upper] : lower.length ? lower : open;
    }
    return open.map(function (key) { return { category: key, points: rawScore(dice, key, joker), bonus: joker && card.yahtzee === 50 ? 100 : 0 }; });
  }
  function totals(player) {
    var upper = KEYS.slice(0, 6).reduce(function (n, key) { return n + (player.card[key] || 0); }, 0);
    var lower = KEYS.slice(6).reduce(function (n, key) { return n + (player.card[key] || 0); }, 0);
    return { upper: upper, upperBonus: upper >= 63 ? 35 : 0, yahtzeeBonus: player.bonus, total: upper + lower + (upper >= 63 ? 35 : 0) + player.bonus };
  }
  function create(config) {
    config = config || {};
    if (!Array.isArray(config.players) || config.players.length < 2 || config.players.length > 4) throw new Error('Choose two to four players.');
    return { v: 1, game: 'yahtzee', options: {}, rng: (config.seed >>> 0) || 1,
      players: config.players.map(function (p, i) { return { name: String(p.name || 'Player ' + (i + 1)).slice(0, 40), bot: !!p.bot, color: p.color || '', card: Object.fromEntries(KEYS.map(function (key) { return [key, null]; })), bonus: 0 }; }),
      current: 0, turn: 1, round: 1, dice: [0, 0, 0, 0, 0], rolls: 0, lastKeep: 0, last: null, scores: config.players.map(function () { return 0; }), over: false, winner: null, winners: [] };
  }
  function actor(s) { return s && !s.over ? s.current : -1; }
  function legal(s, p) {
    if (!s || s.over || !Number.isInteger(p) || p !== s.current || !s.players[p]) return [];
    if (!s.rolls) return [{ type: 'roll', keep: 0 }];
    var actions = scoreOptions(s.dice, s.players[p].card).map(function (v) { return { type: 'score', category: v.category }; });
    if (s.rolls < 3) for (var mask = 0; mask < 31; mask++) actions.push({ type: 'roll', keep: mask });
    return actions;
  }
  function sameAction(a, b) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).length !== 2 || a.type !== b.type) return false;
    return a.type === 'roll' ? a.keep === b.keep : a.category === b.category;
  }
  function apply(s, p, action) {
    if (!legal(s, p).some(function (a) { return sameAction(action, a); })) return { ok: false, state: s, error: 'That move is unavailable. Choose a roll or an open score category.' };
    var n = clone(s);
    if (action.type === 'roll') {
      for (var i = 0; i < 5; i++) if (!(action.keep & (1 << i))) {
        var x = n.rng >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; n.rng = x >>> 0;
        n.dice[i] = 1 + Math.floor(n.rng / 4294967296 * 6);
      }
      n.rolls++; n.lastKeep = action.keep;
    } else {
      var scored = scoreOptions(n.dice, n.players[p].card).find(function (v) { return v.category === action.category; });
      n.players[p].card[action.category] = scored.points; n.players[p].bonus += scored.bonus;
      n.scores[p] = totals(n.players[p]).total;
      n.last = { player: p, category: action.category, points: scored.points, bonus: scored.bonus };
      n.over = n.players.every(function (person) { return KEYS.every(function (key) { return person.card[key] !== null; }); });
      if (n.over) {
        var high = Math.max.apply(null, n.scores);
        n.winners = n.scores.map(function (score, i) { return score === high ? i : -1; }).filter(function (i) { return i >= 0; });
        n.winner = n.winners.length === 1 ? n.winners[0] : null;
      } else { n.current = (p + 1) % n.players.length; n.turn++; n.round = Math.floor((n.turn - 1) / n.players.length) + 1; n.rolls = 0; n.lastKeep = 0; n.dice = [0, 0, 0, 0, 0]; }
    }
    return { ok: true, state: n };
  }
  // Unordered dice outcomes with their exact multiplicity: at most 252 outcomes.
  var OUTCOMES = [], factorial = [1, 1, 2, 6, 24, 120];
  function outcomes(n) {
    if (OUTCOMES[n]) return OUTCOMES[n];
    var rows = [];
    function visit(left, face, dice, denominator) {
      if (face === 6) { var tail = Array(left).fill(6); rows.push({ dice: dice.concat(tail), probability: factorial[n] / denominator / factorial[left] / Math.pow(6, n) }); return; }
      for (var k = 0; k <= left; k++) visit(left - k, face + 1, dice.concat(Array(k).fill(face)), denominator * factorial[k]);
    }
    visit(n, 1, [], 1); OUTCOMES[n] = rows; return rows;
  }
  function holds(dice) {
    var c = counts(dice), out = [];
    function visit(face, values) {
      if (face === 6) { if (values.length < 5) out.push(values); return; }
      for (var k = 0; k <= c[face]; k++) visit(face + 1, values.concat(Array(k).fill(face + 1)));
    }
    visit(0, []); return out;
  }
  function keepMask(dice, values) {
    var left = counts(values), mask = 0;
    dice.forEach(function (d, i) { if (left[d - 1]) { left[d - 1]--; mask |= 1 << i; } }); return mask;
  }
  var BASELINE = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, three: 20, four: 15, full: 20, small: 25, large: 25, yahtzee: 10, chance: 22 };
  function utility(choice, card, level) {
    if (level === 'easy') return choice.points + choice.bonus;
    var v = choice.points + choice.bonus - BASELINE[choice.category];
    var upperIndex = KEYS.indexOf(choice.category);
    if (upperIndex >= 0 && upperIndex < 6) {
      var upper = KEYS.slice(0, 6).reduce(function (n, key) { return n + (card[key] || 0); }, 0);
      if (upper < 63) {
        var remaining = KEYS.slice(0, 6).reduce(function (n, key, i) { return n + (card[key] === null && key !== choice.category ? 3 * (i + 1) : 0); }, 0);
        if (upper + choice.points >= 63) v += 35;
        else if (level === 'expert') {
          // Smooth bonus equity rewards staying on pace, without counting 35 twice.
          var before = Math.max(0, Math.min(1, (upper + remaining + 3 * (upperIndex + 1) - 48) / 20));
          var after = Math.max(0, Math.min(1, (upper + remaining + choice.points - 48) / 20));
          v += 35 * (after - before);
        } else if (remaining + upper + choice.points >= 63) v += Math.min(choice.points, 63 - upper) * .35;
      }
    }
    if (choice.category === 'yahtzee' && choice.points === 50) v += level === 'expert' ? 8 : 3;
    return v;
  }
  function bestScore(dice, card, level) {
    var options = scoreOptions(dice, card), best = null;
    options.forEach(function (option) { var value = utility(option, card, level); if (!best || value > best.value) best = { action: { type: 'score', category: option.category }, value: value }; });
    return best;
  }
  function bot(s, p, level) {
    if (!legal(s, p).length) return null;
    if (!s.rolls) return { type: 'roll', keep: 0 };
    level = ['easy', 'normal', 'hard', 'expert'].includes(level) ? level : 'normal';
    var card = s.players[p].card, best = bestScore(s.dice, card, level);
    if (s.rolls === 3 || level === 'easy') return best.action;
    if (level === 'normal') {
      var options = scoreOptions(s.dice, card);
      if (options.some(function (o) { return ['yahtzee', 'large', 'full'].includes(o.category) && o.points > 0; })) return best.action;
      var c = counts(s.dice), face = 6;
      for (var f = 5; f >= 1; f--) if (c[f - 1] > c[face - 1]) face = f;
      var kept = Array(c[face - 1]).fill(face);
      if ((card.small === null || card.large === null) && kept.length < 3) {
        var run = [];
        for (var start = 1; start <= 3; start++) {
          var candidate = [start, start + 1, start + 2, start + 3].filter(function (d) { return c[d - 1]; });
          if (candidate.length > run.length) run = candidate;
        }
        if (run.length >= 3) kept = run;
      }
      if (kept.length === 5) return best.action;
      return { type: 'roll', keep: keepMask(s.dice, kept) };
    }
    // Hard sees one reroll. Expert solves the entire remaining turn exactly for
    // this scorecard utility; neither simulates or reads the seeded RNG.
    var expected = new Map(), states = new Map(), terminal = new Map();
    function value(dice, left) {
      var sorted = dice.slice().sort(), key = sorted.join(''), cacheKey = left + ':' + key;
      if (states.has(cacheKey)) return states.get(cacheKey);
      if (!terminal.has(key)) terminal.set(key, bestScore(sorted, card, level));
      var selected = terminal.get(key), result = { value: selected.value, action: selected.action };
      if (left) holds(sorted).forEach(function (held) {
        var hkey = left + ':' + held.join(''), ev;
        if (expected.has(hkey)) ev = expected.get(hkey);
        else {
          ev = outcomes(5 - held.length).reduce(function (sum, outcome) { return sum + outcome.probability * value(held.concat(outcome.dice), left - 1).value; }, 0);
          expected.set(hkey, ev);
        }
        if (ev > result.value + 1e-9) result = { value: ev, held: held };
      });
      states.set(cacheKey, result); return result;
    }
    var decision = value(s.dice, level === 'expert' ? 3 - s.rolls : 1);
    return decision.held ? { type: 'roll', keep: keepMask(s.dice, decision.held) } : decision.action;
  }
  function result(s) { return s.over ? s.winners.length === 1 ? s.players[s.winners[0]].name + ' wins with ' + s.scores[s.winners[0]] + ' points.' : 'A shared win on ' + Math.max.apply(null, s.scores) + ' points.' : 'Roll, keep and make every category count.'; }
  var api = { create: create, actor: actor, legal: legal, apply: apply, bot: bot, result: result, categories: CATEGORIES, rawScore: rawScore, scoreOptions: scoreOptions, totals: totals };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.HubEngines = root.HubEngines || {}; root.HubEngines.yahtzee = api; }
})(typeof window !== 'undefined' ? window : null);
