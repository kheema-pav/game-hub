/* Shared local/online shell. Game engines and renderers remain independent classic scripts. */
(function () {
  'use strict';
  var C = window.HubTabletopCore;
  var COLORS = ['#df654b', '#3985c7', '#dfb93d', '#52a57d', '#9b72c9'];
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function write(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch (e) { return false; } }
  function randomSeed() { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Date.now() >>> 0; } }
  function mount(config) {
    if (!C || !config || !config.engine) throw new Error('Game Hub could not load its game engine.');
    config.options = config.options || [];
    config.gameVersion = window.HubGameVersions && HubGameVersions.games[config.id] || 1;
    var engine = config.engine, saveKey = 'hub.' + config.id + '.save.v1', configKey = 'hub.' + config.id + '.config.v1';
    var root = document.getElementById('app');
    if (!root) { root = document.createElement('main'); root.id = 'app'; document.body.appendChild(root); }
    root.classList.add('tt-app');
    var defaults = {};
    config.options.forEach(function (option) { defaults[option.key] = option.values[0].value; });
    var setup = { mode: 'solo', count: Math.max(2, config.minPlayers), level: 'normal', options: C.clone(defaults), names: [] };
    var savedConfig = read(configKey);
    if (savedConfig && ['solo', 'local'].includes(savedConfig.mode)) setup.mode = savedConfig.mode;
    if (savedConfig && Number.isInteger(savedConfig.count) && savedConfig.count >= config.minPlayers && savedConfig.count <= config.maxPlayers) setup.count = savedConfig.count;
    if (savedConfig && ['easy', 'normal', 'hard', 'expert'].includes(savedConfig.level)) setup.level = savedConfig.level;
    if (savedConfig && C.validOptions(savedConfig.options, config.options)) setup.options = savedConfig.options;
    if (savedConfig && Array.isArray(savedConfig.names)) setup.names = savedConfig.names.map(function (name) { return String(name).slice(0, 16); });
    var state = null, people = [], currentOptions = C.clone(setup.options), screen = 'setup', message = '', log = [], actions = [], draft = {};
    var viewer = 0, visibleHuman = null, curtain = false, botTimer = null, resultSound = false;
    var online = null, generation = 0, lobby = null, pendingNew = false;
    var params = new URLSearchParams(location.search), invite = params.get('room'), intent = params.get('mode');
    if (!invite && location.hash !== '#continue' && ['solo', 'local', 'online'].includes(intent)) setup.mode = intent;
    function onlineAvailable() { return !!(window.HubOnline && HubOnline.available()); }
    function sound(name) { try { if (window.HubKit) HubKit.sfx(name); } catch (e) {} }
    function title() { return '<header class="tt-head"><div><div class="tt-meta">Game Hub · ' + (online ? 'Online room ' + esc(online.code) : setup.mode === 'local' ? 'Same device' : 'Solo table') + '</div><h1>' + esc(config.title) + '</h1></div></header>'; }
    function errorHTML() { return '<div class="tt-error" role="alert">' + esc(message) + (online && online.retry ? ' <button data-tt="retry-write">Retry move</button>' : '') + (online && online.reopen ? ' <button data-tt="reopen">Reopen room</button>' : '') + '</div>'; }
    function persistSetup() { write(configKey, setup); }
    function save() {
      if (online || !state) return;
      if (window.HubGameNight) {
        HubGameNight.touch(state);
        if (state.over) {
          var winners = Array.isArray(state.winners) ? state.winners : Number.isInteger(state.winner) && state.winner >= 0 ? [state.winner] : [];
          if (!HubGameNight.finish(config.id, state, { players: people.map(function (p, i) { return { name: p.name, bot: p.bot, score: score(i) }; }), winners: winners, mode: setup.mode === 'solo' ? 'solo' : 'local', level: setup.level, summary: config.id === 'ticket' ? (currentOptions.edition === 'europe' ? 'Europe Classic' : 'USA Classic') : '' })) message = 'Game finished. This browser could not save the result to your history.';
        }
      }
      if (!write(saveKey, { v: 1, game: config.id, gameVersion: config.gameVersion, options: currentOptions, players: people, level: setup.level, state: state, log: log.slice(-20) })) message = 'This browser could not save the game. Keep this tab open to finish.';
    }
    function stopBot() { clearTimeout(botTimer); botTimer = null; }
    function stopOnline() {
      generation++; stopBot();
      if (lobby) { try { lobby.close(); } catch (e) {} lobby = null; }
      if (online) {
        if (online.unsubscribe) online.unsubscribe();
        if (online.session) online.session.close();
      }
      online = null;
      try { if (window.HubLobby) HubLobby.close(); } catch (e) {}
    }
    function setupScreen() {
      var saved = read(saveKey), resumable = C.validSave(saved, config) && !saved.state.over;
      var countOptions = '';
      for (var n = config.minPlayers; n <= config.maxPlayers; n++) countOptions += '<option value="' + n + '"' + (setup.count === n ? ' selected' : '') + '>' + n + ' players</option>';
      var settings = config.options.map(function (option) { return '<label>' + esc(option.label) + '<select data-option="' + esc(option.key) + '">' + option.values.map(function (value) { return '<option value="' + esc(value.value) + '"' + (setup.options[option.key] === value.value ? ' selected' : '') + '>' + esc(value.label) + '</option>'; }).join('') + '</select></label>'; }).join('');
      var names = Array.from({ length: setup.count }, function (_, i) { return '<div class="tt-person"><input maxlength="16" aria-label="Player ' + (i + 1) + ' name" data-name="' + i + '" value="' + esc(setup.names[i] || (i === 0 ? 'You' : setup.mode === 'solo' ? 'Bot ' + i : 'Player ' + (i + 1))) + '"><span class="tt-muted">' + (setup.mode === 'solo' && i ? 'Computer' : 'Human') + '</span></div>'; }).join('');
      var resumeInfo = resumable && window.HubGameNight ? '<p class="tt-resume-info">Saved table: ' + esc(HubGameNight.describe(config.id, saved)) + '</p>' : '';
      var newPrompt = pendingNew && resumable ? '<div class="tt-new-warning" role="alert"><p>Starting a new game replaces the unfinished saved table. Your results history stays.</p><div class="tt-actions"><button data-tt="confirm-new" class="tt-primary">Replace saved game</button><button data-tt="cancel-new">Keep saved game</button></div></div>' : '';
      root.innerHTML = '<div class="tt-setup">' + title() + '<p class="tt-muted">' + esc(config.subtitle || 'A tabletop classic, ready wherever you are.') + '</p>' + errorHTML() + '<section class="tt-card"><h2>Choose your table</h2><div class="tt-mode">' + [['solo', 'Solo vs bots'], ['local', 'Same device'], ['online', 'Online']].map(function (mode) { return '<button data-tt="mode" data-value="' + mode[0] + '" aria-pressed="' + (setup.mode === mode[0]) + '">' + mode[1] + '</button>'; }).join('') + '</div><div class="tt-form"><label>Table size<select data-setting="count">' + countOptions + '</select></label>' + (setup.mode === 'solo' ? '<label>Bot level<select data-setting="level">' + ['easy', 'normal', 'hard', 'expert'].map(function (level) { return '<option' + (setup.level === level ? ' selected' : '') + ' value="' + level + '">' + level[0].toUpperCase() + level.slice(1) + '</option>'; }).join('') + '</select></label>' : '') + settings + '</div>' + (setup.mode === 'solo' ? '<p class="tt-muted tt-level-note">' + esc({ easy: 'Relaxed choices while you learn.', normal: 'A balanced opponent for a casual game.', hard: 'A challenging opponent with stronger tactics.', expert: 'Our strongest bot. Plans further and weighs more trade-offs.' }[setup.level]) + '</p>' : '') + (setup.mode !== 'online' ? names : '<p class="tt-muted">Every player uses their own phone or laptop. Create a room and share its code, or join a friend.</p>') + '<div class="tt-actions">' + (setup.mode === 'online' ? '<button class="tt-primary" data-tt="online">Create or join online</button>' : '<button class="tt-primary" data-tt="start">Start new game</button>') + (resumable ? '<button data-tt="continue">Continue saved game</button>' : '') + '</div>' + resumeInfo + newPrompt + (setup.mode === 'online' && !onlineAvailable() ? '<p role="status">Online play is unavailable. You can still choose Solo or Same device.</p>' : '') + '</section>' + helpHTML() + '</div>';
    }
    function helpHTML() {
      if (screen === 'game' && config.inlineRules) return '';
      var rules = typeof config.rules === 'string' ? config.rules : config.rules && config.rules.join ? config.rules.map(function (rule) { return '<p>' + esc(rule) + '</p>'; }).join('') : '<p>Choose an available move on your turn. Your local game saves after every move.</p>';
      return '<details class="tt-help"><summary>How to play</summary>' + rules + '<p>' + (config.privateInformation === false ? 'Same-device players take turns on this board.' : 'Same-device play hides the board between human turns.') + ' Online hands belong to this browser; clearing browser data loses your anonymous seat.</p></details>';
    }
    function names() { return people.map(function (person) { return person.name; }); }
    function score(i) { try { return config.score ? config.score(state, i) : state.scores ? state.scores[i] : null; } catch (e) { return null; } }
    function results() {
      var winners = Array.isArray(state.winners) ? state.winners : Number.isInteger(state.winner) ? [state.winner] : [];
      return winners.length === 1 ? names()[winners[0]] + (names()[winners[0]] === 'You' ? ' win!' : ' wins!') : winners.length ? 'Shared win: ' + winners.map(function (i) { return names()[i]; }).join(', ') : 'Draw';
    }
    function render() {
      root.setAttribute('data-game', config.id);
      root.setAttribute('data-screen', screen);
      if (screen === 'setup') { setupScreen(); return; }
      if (screen === 'connecting') { root.innerHTML = title() + '<section class="tt-card"><h2>Opening your table</h2><p role="status">' + esc(message || 'Connecting to the game server…') + '</p><button data-tt="setup">Back to setup</button></section>'; return; }
      if (!state) return;
      var actor = engine.actor(state);
      if (!online && !state.over && people[actor] && !people[actor].bot) {
        var humanCount = people.filter(function (person) { return !person.bot; }).length;
        if (config.privateInformation !== false && humanCount > 1 && visibleHuman !== actor) curtain = true;
        viewer = actor;
      } else if (online) viewer = online.seats.indexOf(HubOnline.uid);
      if (curtain && !state.over) {
        root.innerHTML = title() + '<section class="tt-curtain tt-card"><p class="tt-muted">Pass the device</p><h2>' + esc(people[actor].name) + ', your turn</h2><p>Keep other players’ hands private.</p><button class="tt-primary" data-tt="reveal">Ready, show my turn</button><button data-tt="setup">Game setup</button></section>'; return;
      }
      var canAct = !state.over && !curtain && (online ? !online.blocked && !online.sending && !online.retry && actor === viewer : people[actor] && !people[actor].bot);
      actions = canAct ? engine.legal(state, actor) : [];
      var board;
      try { board = config.render(state, Math.max(0, viewer), actions, { esc: esc, names: names(), online: !!online, draft: draft }); }
      catch (e) { board = '<p class="tt-error">This board could not be displayed. Reopen the saved game or room.</p>'; try { console.error(e); } catch (_) {} }
      var status = state.over ? results() : online && online.sending ? 'Sending your move…' : canAct ? 'Your turn, ' + people[actor].name : 'Waiting for ' + (people[actor] ? people[actor].name : 'another player');
      root.innerHTML = title() + errorHTML() + '<div class="tt-scores">' + people.map(function (person, i) { var points = score(i); return '<div class="tt-player' + (!state.over && actor === i ? ' active' : '') + '"><b>' + esc(person.name) + '</b><small>' + (points != null ? esc(points) + ' points' : i === viewer ? 'You' : person.bot ? 'Computer' : 'Player ' + (i + 1)) + '</small></div>'; }).join('') + '</div><div class="tt-status' + (state.over ? ' tt-result' : '') + '" role="status">' + esc(status) + '</div><section class="tt-board">' + board + '</section>' + (state.over ? '<div class="tt-actions"><button data-tt="' + (online ? 'replace' : 'rematch') + '" class="tt-primary">' + (online ? 'Play again' : 'Rematch, same players') + '</button><button data-tt="setup">Game setup</button></div>' : '') + (log.length ? '<details><summary>Recent moves</summary><ol class="tt-log">' + log.slice(-12).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ol></details>' : '') + helpHTML();
      if (state.over && !resultSound) { resultSound = true; sound('win'); }
      scheduleBot();
    }
    function scheduleBot() {
      stopBot();
      if (online || !state || state.over || curtain || screen !== 'game') return;
      var actor = engine.actor(state);
      if (!people[actor] || !people[actor].bot) return;
      botTimer = setTimeout(function () {
        botTimer = null;
        if (!state || state.over || online || screen !== 'game') return;
        try {
          var move = engine.bot(state, actor, setup.level);
          if (!move) { message = 'The computer could not find a move. Reopen your saved game to retry.'; render(); return; }
          playLocal(move);
        } catch (error) { message = 'The computer could not complete its move: ' + error.message; root.innerHTML += errorHTML(); }
      }, 380);
    }
    function playLocal(action) {
      if (!state || state.over || online || curtain) return;
      var actor = engine.actor(state), result = engine.apply(state, actor, action);
      if (!result || !result.ok || !result.state) { message = result && result.error || 'That move is unavailable.'; render(); return; }
      log.push(people[actor].name + ': ' + (config.describe ? config.describe(action, state) : 'played a move'));
      state = result.state; draft = {}; message = ''; sound('place'); save(); render();
    }
    function startLocal(rematch) {
      var rematchPeople = rematch ? C.clone(people) : null;
      if (rematch) {
        setup.names = people.map(function (p) { return p.name; }); setup.count = people.length;
        setup.options = C.clone(currentOptions); setup.mode = people.some(function (p) { return p.bot; }) ? 'solo' : 'local';
      }
      pendingNew = false;
      stopOnline(); stopBot(); message = ''; log = []; draft = {}; resultSound = false; visibleHuman = null; curtain = false;
      currentOptions = C.clone(setup.options);
      people = rematchPeople || Array.from({ length: setup.count }, function (_, i) { return { name: String(setup.names[i] || (i ? setup.mode === 'solo' ? 'Bot ' + i : 'Player ' + (i + 1) : 'You')).slice(0, 16), color: COLORS[i], bot: setup.mode === 'solo' && i > 0 }; });
      try { state = engine.create({ seed: randomSeed(), players: C.clone(people), options: C.clone(currentOptions) }); screen = 'game'; persistSetup(); save(); clearURL(); render(); }
      catch (error) { screen = 'setup'; message = error.message; render(); }
    }
    function requestStart() {
      var saved = read(saveKey);
      if (C.validSave(saved, config) && !saved.state.over) { pendingNew = true; render(); }
      else startLocal(false);
    }
    function resume() {
      var saved = read(saveKey);
      if (!C.validSave(saved, config)) { message = 'This saved game is unavailable or uses a different version. Start a new table.'; screen = 'setup'; render(); return; }
      stopOnline(); people = saved.players; currentOptions = saved.options; state = saved.state; setup.level = ['easy', 'normal', 'hard', 'expert'].includes(saved.level) ? saved.level : 'normal';
      setup.mode = people.some(function (person) { return person.bot; }) ? 'solo' : 'local'; log = Array.isArray(saved.log) ? saved.log.filter(function (line) { return typeof line === 'string'; }) : [];
      viewer = 0; visibleHuman = null; curtain = false; draft = {}; message = ''; screen = 'game'; resultSound = false; clearURL(); render();
    }
    function clearURL() { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    function backSetup() { stopOnline(); state = null; screen = 'setup'; message = ''; curtain = false; pendingNew = false; clearURL(); render(); }
    function openOnline() {
      if (!onlineAvailable() || !window.HubLobby) { message = 'Online play is unavailable. Choose Solo or Same device, or reconnect and try again.'; screen = 'setup'; render(); return; }
      persistSetup();
      lobby = HubLobby.openCreateJoin({ game: config.id, gameName: config.title, seatOptions: Array.from({ length: config.maxPlayers - config.minPlayers + 1 }, function (_, i) { return i + config.minPlayers; }), opts: function () { return C.clone(setup.options); }, onRoom: enterRoom });
    }
    function enterRoom(code) {
      stopOnline(); state = null; screen = 'connecting'; message = ''; render();
      try { history.replaceState(null, '', location.pathname + '?room=' + code); } catch (e) {}
      if (!onlineAvailable() || !window.HubLobby) { message = 'Online play is unavailable. Reconnect and reopen this invitation.'; render(); return; }
      var token = generation;
      lobby = HubLobby.enter(code, { game: config.id, gameName: config.title, minToStart: config.minPlayers,
        onPlay: function (value) { if (token === generation) beginOnline(value.code); }, onExit: backSetup });
    }
    function beginOnline(code) {
      lobby = null; screen = 'connecting'; message = ''; resultSound = false;
      online = { code: code, room: null, docs: {}, mine: [], confirmed: [], seats: [], k: 0, blocked: false, sending: false, retry: false, session: null, unsubscribe: null };
      var token = generation, session = online;
      if (window.HubSession) session.session = HubSession.mount({ code: code, onExit: backSetup, onRestart: enterRoom });
      session.unsubscribe = HubOnline.rooms.watch(code, function (snapshot) {
        if (token !== generation || online !== session) return;
        var good = !session.session || session.session.update(snapshot);
        if (!good || snapshot.room && ['cancelled', 'ended'].includes(snapshot.room.status)) { session.blocked = true; stopBot(); return; }
        if (session.blocked) return;
        if (snapshot.error) { message = snapshot.error.code === 'offline' ? 'You are offline. Reconnect to continue.' : snapshot.error.message || 'Could not reach the game server.'; if (state) render(); else render(); return; }
        if (!snapshot.room) { message = 'This room could not be found.'; render(); return; }
        if (snapshot.room.game !== config.id) { session.blocked = true; message = 'This room belongs to a different game. Open it from the hub.'; render(); return; }
        var compatibility = HubOnline.rooms.compatibility(snapshot.room);
        if (!compatibility.ok) { session.blocked = true; message = compatibility.message; render(); return; }
        if (!snapshot.room.seats || !snapshot.room.seats[HubOnline.uid]) { session.blocked = true; message = 'This browser does not hold a seat in this room.'; render(); return; }
        session.room = snapshot.room; session.docs = snapshot.players || {};
        if (!snapshot.pending) {
          var confirmed = session.docs[HubOnline.uid] && session.docs[HubOnline.uid].moves;
          if (Array.isArray(confirmed) && confirmed.length >= session.confirmed.length) session.confirmed = C.clone(confirmed);
        }
        if (snapshot.room.status !== 'playing') return;
        rebuildOnline(session);
      });
    }
    function rebuildOnline(session) {
      if (online !== session || session.blocked || !session.room) return;
      try {
        if (!C.validOptions(session.room.opts || {}, config.options)) throw new Error('This room has unsupported game settings. Start a new room.');
        session.mine = C.mergeMine(session.docs[HubOnline.uid] && session.docs[HubOnline.uid].moves, session.mine);
        var replay = C.replay(config, session.room, session.docs, HubOnline.uid, session.mine);
        var changed = session.k !== replay.k;
        state = replay.state; session.seats = replay.seats; session.k = replay.k;
        people = replay.seats.map(function (id) { var person = session.room.seats[id]; return { name: person.name || 'Player', color: person.color, bot: false }; });
        currentOptions = session.room.opts || {}; viewer = session.seats.indexOf(HubOnline.uid); screen = 'game'; curtain = false; if (changed) draft = {}; render();
      } catch (error) { session.blocked = true; session.reopen = true; message = error.message; render(); }
    }
    function sendOnline(action) {
      var session = online;
      if (!session || session.blocked || session.sending || session.retry || !state || state.over || engine.actor(state) !== viewer) return;
      var allowed = engine.legal(state, viewer).find(function (candidate) { return C.stable(candidate) === C.stable(action); });
      if (!allowed) return;
      session.previous = C.clone(session.mine);
      session.mine.push({ k: session.k, action: C.clone(allowed) });
      session.sending = true; session.retry = false; message = '';
      rebuildOnline(session); flush(session);
    }
    function flush(session) {
      if (online !== session || session.blocked || !session.room) return;
      var nextActor = state && !state.over ? session.seats[engine.actor(state)] : null;
      HubOnline.rooms.writeMine(session.code, { moves: session.mine, turn: { next: nextActor, phase: state && state.over ? 'over' : 'play' } }).then(function () {
        if (online !== session || session.blocked) return;
        if (session.mine.length >= session.confirmed.length) session.confirmed = C.clone(session.mine);
        session.sending = false; session.retry = false; message = ''; sound('place'); render();
      }).catch(function (error) {
        if (online !== session || session.blocked) return;
        session.sending = false;
        if (error.code === 'offline' || error.code === 'timeout') { session.retry = true; message = 'Your move is waiting to sync. Reconnect, then retry.'; }
        else {
          // Firestore may have echoed this optimistic suffix in a pending snapshot.
          // A rejected write is not part of the server's accepted move history.
          var previous = session.previous || [];
          session.mine = C.clone(session.confirmed.length >= previous.length ? session.confirmed : previous);
          session.docs[HubOnline.uid] = Object.assign({}, session.docs[HubOnline.uid] || {}, { moves: C.clone(session.mine) });
          session.retry = false; message = error.code === 'denied' ? 'The server refused this move. Reopen the room, or ask the host to publish the current Firestore rules.' : error.message || 'Your move could not be saved.'; }
        rebuildOnline(session);
      });
    }
    function selectChoice(target) {
      var key = target.getAttribute('data-choice'), value = target.getAttribute('data-value') || '';
      var focusValue = target.getAttribute('data-ticket') || value, focusKey = target.getAttribute('data-focus-key');
      var panels = typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll('[data-scroll-key]')).map(function (el) { return [el.getAttribute('data-scroll-key'), el.scrollTop, el.scrollLeft]; }) : [];
      var opened = typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll('details[open]')).map(function (el) { return el.querySelector('summary') && el.querySelector('summary').textContent; }) : [];
      if (config.choose) draft = config.choose(draft, key, value, { state: state, viewer: viewer, target: target }) || draft;
      else draft[key] = value;
      render();
      if (typeof root.querySelectorAll !== 'function') return;
      root.querySelectorAll('details').forEach(function (el) { if (el.querySelector('summary') && opened.includes(el.querySelector('summary').textContent)) el.open = true; });
      root.querySelectorAll('[data-scroll-key]').forEach(function (el) { var saved = panels.find(function (item) { return item[0] === el.getAttribute('data-scroll-key'); }); if (saved) { el.scrollTop = saved[1]; el.scrollLeft = saved[2]; } });
      var candidates = Array.from(root.querySelectorAll('[data-choice]'));
      var focus = focusKey ? candidates.find(function (el) { return el.getAttribute('data-focus-key') === focusKey; }) : candidates.find(function (el) { return el.getAttribute('data-choice') === key && (el.getAttribute('data-ticket') || el.getAttribute('data-value') || '') === focusValue; });
      if (focus && typeof focus.focus === 'function') focus.focus({ preventScroll: true });
    }
    root.addEventListener('click', function (event) {
      var target = event.target.closest('button[data-tt],button[data-move],[data-choice]');
      if (!target || !root.contains(target) || target.disabled) return;
      if (target.hasAttribute('data-choice')) { selectChoice(target); return; }
      if (target.hasAttribute('data-move')) {
        var index = Number(target.getAttribute('data-move'));
        if (!Number.isInteger(index) || !actions[index]) return;
        if (online) sendOnline(actions[index]); else playLocal(actions[index]); return;
      }
      var action = target.getAttribute('data-tt');
      if (action === 'mode') { setup.mode = target.getAttribute('data-value'); message = ''; persistSetup(); render(); }
      else if (action === 'start') requestStart();
      else if (action === 'confirm-new' && pendingNew) startLocal(false);
      else if (action === 'cancel-new') { pendingNew = false; render(); }
      else if (action === 'rematch' && state && state.over && !online) startLocal(true);
      else if (action === 'continue') resume();
      else if (action === 'setup') backSetup();
      else if (action === 'reopen' && online) enterRoom(online.code);
      else if (action === 'online') openOnline();
      else if (action === 'reveal') { visibleHuman = engine.actor(state); curtain = false; render(); }
      else if (action === 'retry-write' && online && online.retry) { online.sending = true; online.retry = false; render(); flush(online); }
      else if (action === 'replace' && online && !online.blocked) {
        var session = online; target.disabled = true;
        HubOnline.rooms.replacement(session.code).then(function (value) { if (online === session) enterRoom(value.code); }).catch(function (error) { message = error.message; render(); });
      }
    });
    root.addEventListener('keydown', function (event) {
      var target = event.target.closest('[data-choice]');
      if (target && target.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); selectChoice(target);
      }
    });
    root.addEventListener('change', function (event) {
      var field = event.target;
      if (field.hasAttribute('data-setting')) { var key = field.getAttribute('data-setting'); if (key === 'count') setup.count = Number(field.value); else if (key === 'level') setup.level = field.value; persistSetup(); render(); }
      else if (field.hasAttribute('data-option')) { setup.options[field.getAttribute('data-option')] = field.value; persistSetup(); render(); }
      else if (field.hasAttribute('data-name')) { setup.names[Number(field.getAttribute('data-name'))] = field.value.trim().slice(0, 16); persistSetup(); }
    });
    window.addEventListener('pagehide', function () { stopOnline(); stopBot(); });
    window.addEventListener('pageshow', function (event) { if (event.persisted) { var code = new URLSearchParams(location.search).get('room'); if (code) enterRoom(code); else if (state) render(); } });
    try { if (window.HubKit) HubKit.init({ id: config.id, name: config.title, scheme: 'auto', floating: true, onLeave: stopOnline, items: function () { return [{ label: 'Game setup', onSelect: backSetup }]; } }); } catch (e) {}
    if (invite) enterRoom(invite);
    else if (location.hash === '#continue') resume();
    else { render(); if (setup.mode === 'online') openOnline(); }
    return { close: stopOnline };
  }
  window.HubTabletop = { mount: mount };
})();
