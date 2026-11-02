/* Pure shared replay/save helpers for the additional tabletop games. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HubTabletopCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function seats(room) {
    var ids = Object.keys(room.seats || {}).sort(), seed = (room.seed ^ 0x51ed270b) >>> 0;
    for (var i = ids.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      var j = seed % (i + 1), old = ids[i]; ids[i] = ids[j]; ids[j] = old;
    }
    return ids;
  }
  function mergeMine(server, mine) {
    server = Array.isArray(server) ? server : []; mine = Array.isArray(mine) ? mine : [];
    var short = Math.min(server.length, mine.length);
    for (var i = 0; i < short; i++) if (stable(server[i]) !== stable(mine[i])) throw new Error('This seat changed in another tab. Reopen the room to use its latest moves.');
    return clone(server.length >= mine.length ? server : mine);
  }
  function replay(config, room, docs, ownUid, ownMoves) {
    if (!room || room.game !== config.id) throw new Error('This room belongs to a different game. Open its invitation from the hub.');
    if (!Number.isInteger(room.seed)) throw new Error('This room has an invalid game seed.');
    var ids = seats(room);
    if (ids.length < config.minPlayers || ids.length > config.maxPlayers) throw new Error('This room has an unsupported number of players.');
    var people = ids.map(function (id, i) {
      var seat = room.seats[id]; return { name: String(seat.name || 'Player ' + (i + 1)).slice(0, 16), color: seat.color, bot: false };
    });
    var state = config.engine.create({ seed: room.seed, players: people, options: clone(room.opts || {}) });
    var lists = ids.map(function (id) {
      var moves = docs && docs[id] && docs[id].moves;
      return id === ownUid ? mergeMine(moves, ownMoves) : Array.isArray(moves) ? moves : [];
    });
    var pointers = ids.map(function () { return 0; }), k = 0, rejected = 0;
    for (var guard = 0; guard < 100000 && !state.over; guard++) {
      var player = config.engine.actor(state);
      if (!Number.isInteger(player) || player < 0 || player >= ids.length) throw new Error('The game reported an invalid player turn.');
      var list = lists[player], record = null;
      while (pointers[player] < list.length) {
        var candidate = list[pointers[player]++];
        if (candidate && Number.isInteger(candidate.k) && candidate.k === k && candidate.action && typeof candidate.action === 'object') { record = candidate; break; }
        rejected++;
      }
      if (!record) return { state: state, seats: ids, k: k, rejected: rejected };
      try {
        // Validate against the actual legal-action set before invoking a game engine.
        var options = config.engine.legal(state, player), key = stable(record.action);
        var action = options.find(function (move) { return stable(move) === key; });
        if (!action) { rejected++; continue; }
        var result = config.engine.apply(state, player, action);
        if (!result || !result.ok || !result.state) { rejected++; continue; }
        state = result.state; k++;
      } catch (error) { rejected++; }
    }
    if (!state.over) throw new Error('This game history is too large to replay safely.');
    return { state: state, seats: ids, k: k, rejected: rejected };
  }
  function validOptions(options, definitions) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
    var allowed = (definitions || []).map(function (definition) { return definition.key; });
    return Object.keys(options).every(function (key) { return allowed.includes(key); }) && (definitions || []).every(function (definition) {
      return definition.values.some(function (option) { return option.value === options[definition.key]; });
    });
  }
  function validSave(saved, config) {
    if (!saved || saved.v !== 1 || saved.game !== config.id || saved.gameVersion !== (config.gameVersion || 1) || !saved.state || typeof saved.state !== 'object') return false;
    if (!validOptions(saved.options, config.options || [])) return false;
    if (!Array.isArray(saved.players) || saved.players.length < config.minPlayers || saved.players.length > config.maxPlayers) return false;
    if (!saved.players.every(function (player) { return player && typeof player.name === 'string' && typeof player.bot === 'boolean'; })) return false;
    if (typeof saved.state.over !== 'boolean') return false;
    if (Array.isArray(saved.state.players)) {
      if (saved.state.players.length !== saved.players.length) return false;
      if (!saved.state.players.every(function (player, i) { return player && player.name === saved.players[i].name && (player.bot === undefined || player.bot === saved.players[i].bot); })) return false;
    }
    if (saved.state.options && stable(saved.state.options) !== stable(saved.options)) return false;
    try {
      if (!saved.state.over) {
        var actor = config.engine.actor(saved.state);
        if (!Number.isInteger(actor) || actor < 0 || actor >= saved.players.length) return false;
        if (!Array.isArray(config.engine.legal(saved.state, actor))) return false;
      }
    } catch (error) { return false; }
    return true;
  }
  return { stable: stable, clone: clone, seats: seats, mergeMine: mergeMine, replay: replay, validOptions: validOptions, validSave: validSave };
});
