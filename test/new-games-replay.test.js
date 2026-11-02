'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/tabletop-core');
for (const id of ['connect4', 'ludo', 'azul', 'ticket', 'reversi', 'yahtzee']) {
  const E = require('../' + id + '/engine');
  for (const edition of id === 'ticket' ? ['usa', 'europe'] : ['base']) {
    test(`${id} ${edition}: complete authored online replay agrees across viewers and ignores other players' injected records`, () => {
      const room = { game: id, seed: 39017, opts: id === 'ticket' ? { edition } : {}, seats: { uidA: { name: 'Ada', color: '#e4572e' }, uidB: { name: 'Bram', color: '#3b6fa8' } } };
      const config = { id, engine: E, minPlayers: 2, maxPlayers: ['connect4','reversi'].includes(id) ? 2 : id === 'ticket' ? 5 : 4 };
      const ids = C.seats(room), people = ids.map(uid => ({ ...room.seats[uid], bot: false }));
      let state = E.create({ seed: room.seed, players: people, options: room.opts });
      const docs = Object.fromEntries(ids.map(uid => [uid, { moves: [] }]));
      let k = 0;
      for (; k < 6000 && !state.over; k++) {
        const player = E.actor(state), action = E.bot(state, player, 'normal');
        assert.ok(action, `${id} has a legal bot action at step ${k}`);
        const result = E.apply(state, player, action);
        assert.ok(result.ok, `${id}: ${result.error || 'bot action is valid'}`);
        docs[ids[player]].moves.push({ k, action }); state = result.state;
        if (k % 100 === 0) assert.deepEqual(C.replay(config, room, docs).state, state);
      }
      assert.ok(state.over, `${id} reaches a normal game result within 6000 actions`);
      for (const uid of ids) {
        const replay = C.replay(config, room, docs, uid, docs[uid].moves);
        assert.deepEqual(replay.state, state); assert.equal(replay.k, k);
      }
      // A record from the wrong player cannot steal the initial turn.
      const wrong = ids[1 - E.actor(E.create({ seed: room.seed, players: people, options: room.opts }))];
      const poisoned = JSON.parse(JSON.stringify(docs));
      poisoned[wrong].moves.unshift({ k: 0, action: { type: 'not-a-real-action', column: 0 } });
      assert.deepEqual(C.replay(config, room, poisoned).state, state);
      assert.ok(C.replay(config, room, poisoned).rejected > 0);
    });
  }
}
