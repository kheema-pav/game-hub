'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine');
let config;
const context = { window: { HubEngines: { yahtzee: E } }, HubTabletop: { mount(c) { config = c; } } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), context);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const create = () => E.create({ seed: 144, players: [{ name: 'You' }, { name: '<img src=x>', bot: true }], options: {} });
const render = (s, draft = {}, actions = E.legal(s, E.actor(s))) => config.render(s, 0, actions, { draft, esc });

test('Yahtzee registers public multiplayer and renders roll-first guidance without premature scoring', () => {
  assert.equal(config.id, 'yahtzee'); assert.equal(config.minPlayers, 2); assert.equal(config.maxPlayers, 4);
  assert.equal(config.privateInformation, false); assert.equal(config.inlineRules, true);
  const html = render(create());
  assert.match(html, /Your dice/); assert.match(html, /Roll all five dice/);
  assert.doesNotMatch(html, /data-choice="category"/); assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
});

test('held-die and score previews change only draft state until explicit confirmation', () => {
  const s = E.apply(create(), 0, { type: 'roll', keep: 0 }).state, before = JSON.stringify(s);
  const draft = config.choose({}, 'keep', '2', { state: s });
  assert.equal(draft.keep, 4); assert.match(render(s, draft), /aria-pressed="true" aria-label="Die 3:/);
  config.choose(draft, 'category', 'chance', { state: s });
  const html = render(s, draft);
  assert.match(html, /Confirm \d+ points/);
  assert.match(html, /data-choice="category" data-value="chance" aria-pressed="true"/);
  assert.equal(JSON.stringify(s), before);
});

test('zero score requires a clearly labelled confirmation and completed categories are disabled', () => {
  const s = create(); s.rolls = 3; s.dice = [1, 2, 3, 4, 5]; s.players[0].card.chance = 19;
  const html = render(s, { category: 'yahtzee' });
  assert.match(html, /uses Yahtzee for zero points/); assert.match(html, /Confirm 0 points/);
  assert.doesNotMatch(html, /data-choice="category" data-value="chance"/);
  assert.doesNotMatch(html, /data-choice="keep"/);
});

test('non-acting online viewers get no actionable held-die, roll or score controls', () => {
  const s = E.apply(create(), 0, { type: 'roll', keep: 0 }).state;
  const html = render(s, { category: 'chance' }, []);
  assert.doesNotMatch(html, /data-move=/); assert.doesNotMatch(html, /data-choice=/); assert.match(html, /Waiting for You/);
});

test('Joker guidance matches forced scoring and shows the earned bonus', () => {
  const s = create(); s.rolls = 1; s.dice = [6, 6, 6, 6, 6]; s.players[0].card.yahtzee = 50;
  const html = render(s, { category: 'sixes' });
  assert.match(html, /Joker roll!/); assert.match(html, /Use the matching upper category/);
  assert.match(html, /Confirm 30 points \+ bonus/);
  assert.equal((html.match(/data-choice="category"/g) || []).length, 1);
});

test('Joker guidance distinguishes a single remaining lower row or unrelated upper row', () => {
  const s = create(); s.rolls = 1; s.dice = [6, 6, 6, 6, 6];
  E.categories.forEach(c => { s.players[0].card[c.id] = 0; });
  s.players[0].card.yahtzee = 50; s.players[0].card.chance = null;
  assert.match(render(s), /Choose an open lower category/);
  assert.doesNotMatch(render(s), /Use the matching upper category/);
  s.players[0].card.chance = 20; s.players[0].card.ones = null;
  assert.match(render(s), /lower section is full/);
  assert.doesNotMatch(render(s), /Use the matching upper category/);
});
