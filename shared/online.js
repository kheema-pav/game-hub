/*!
 * HubOnline: online rooms for Game Hub (game codes, anonymous identity, live room + player documents).
 * Classic script. Defines window.HubOnline immediately; the Firebase SDK is loaded lazily with import()
 * the first time ready() (or anything that needs it) is called. Spec: docs/online-plan.md (amendments win).
 *
 * Frozen API (see the plan, amendment 3):
 *   available()  ready()  uid
 *   rooms.create({game,maxSeats,opts})  rooms.lookup(code)  rooms.join(code)  rooms.leave(code)  rooms.start(code)
 *   rooms.watch(code, cb)  rooms.writeMine(code, {setup?, moves, turn})  rooms.mine()  rooms.forget(code)
 * Added by docs/online-phase2.md (R2, R6):
 *   maxSeats 2..8; opts = optional flat object (<= 8 keys, string/int/bool values) fixed at creation, returned as room.opts
 *   draw.add(code, t, i, d)  draw.watch(code, drawerUid, t, cb)   (append-only drawing chunks for Pictionary)
 */
(function () {
  'use strict';
  if (window.HubOnline) return;

  var VER = '11.10.0';
  var BASE = 'https://www.gstatic.com/firebasejs/' + VER + '/';
  var ROOMS_KEY = 'hub.rooms';
  var PROFILE_KEY = 'hub.profile';
  var CODE_RE = /^[1-9][0-9]{5}$/;
  var POLL_MIN = 6000, POLL_MAX = 30000;   // backup server check while a room is open (ms)

  /* ---------- small helpers ---------- */
  function err(code, message, cause) {
    var e = new Error(message || code);
    e.code = code;
    e.isHub = true;
    if (cause) e.cause = cause;
    return e;
  }
  function norm(c) { return String(c == null ? '' : c).replace(/\D/g, ''); }
  function offlineNow() { try { return navigator.onLine === false; } catch (e) { return false; } }
  function withTimeout(p, ms, code) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(err(offlineNow() ? 'offline' : code, 'Timed out')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function randInt(max) { // 0 .. max-1
    try {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] % max;
    } catch (e) { return Math.floor(Math.random() * max); }
  }
  function randomCode() { return String(100000 + randInt(900000)); } // first digit 1-9
  function clean(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); } // drops undefined, keeps null
  function plain(v) { // Firestore Timestamps -> milliseconds, recursively
    if (v && typeof v === 'object') {
      if (typeof v.toMillis === 'function') return v.toMillis();
      if (Array.isArray(v)) return v.map(plain);
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = plain(v[k]); });
      return o;
    }
    return v;
  }

  function stable(v) {                    // JSON with sorted keys, for comparing two copies of a document
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  /* ---------- configuration ---------- */
  // localStorage['hub.emulator'] = "host:firestorePort:authPort" switches to the local emulators (tests only).
  function emulator() {
    try {
      var v = localStorage.getItem('hub.emulator');
      if (!v) return null;
      var p = String(v).split(':');
      var fs = +p[1], au = +p[2];
      if (!p[0] || !(fs > 0) || !(au > 0)) return null;
      return { host: p[0], fs: fs, auth: au };
    } catch (e) { return null; }
  }
  function config() {
    if (emulator()) return { apiKey: 'demo-key', projectId: 'demo-game-hub', appId: '1:1:web:demo', authDomain: 'demo-game-hub.firebaseapp.com' };
    var c = window.HUB_FIREBASE_CONFIG;
    return c && typeof c === 'object' && c.apiKey && c.projectId ? c : null;
  }
  function available() { return !!config(); }

  /* ---------- Firebase SDK (lazy) ---------- */
  var sdkP = null;
  function sdk() {
    if (sdkP) return sdkP;
    if (!available()) return Promise.reject(err('unavailable', 'Online play is not set up'));
    sdkP = Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-firestore.js')
    ]).then(function (m) {
      return { app: m[0], auth: m[1], fs: m[2] };
    }).catch(function (e) {
      sdkP = null;
      throw err(offlineNow() ? 'offline' : 'unavailable', 'Could not load the online module', e);
    });
    return sdkP;
  }

  var core = null;       // {m, app, auth, db}
  var readyP = null;
  var api = { uid: null };

  function initCore(m) {
    if (core) return core;
    var e = emulator();
    var app = m.app.initializeApp(config());
    var auth = m.auth.getAuth(app);
    if (e) m.auth.connectAuthEmulator(auth, 'http://' + e.host + ':' + e.auth, { disableWarnings: true });
    // Long polling instead of the streaming channel: on some phones and mobile networks the stream connects but
    // never delivers updates, so the page only changed on reload. Memory cache as before.
    var db;
    try { db = m.fs.initializeFirestore(app, { experimentalForceLongPolling: true }); }
    catch (x) { db = m.fs.getFirestore(app); }
    if (e) m.fs.connectFirestoreEmulator(db, e.host, e.fs);
    core = { m: m, app: app, auth: auth, db: db };
    return core;
  }

  function ready() {
    if (readyP) return readyP;
    readyP = (async function () {
      var m = await sdk();
      var c = initCore(m);
      try {
        await c.auth.authStateReady();                              // restores the stored user first
        if (!c.auth.currentUser) await m.auth.signInAnonymously(c.auth);
      } catch (e) {
        throw err(e && (e.code === 'auth/network-request-failed' || offlineNow()) ? 'offline' : 'auth', 'Could not sign in', e);
      }
      if (!c.auth.currentUser) throw err('auth', 'Could not sign in');
      api.uid = c.auth.currentUser.uid;
      scheduleMirror(0);
      return { uid: api.uid };
    })();
    readyP.catch(function () { readyP = null; });
    return readyP;
  }

  /* ---------- error mapping ---------- */
  var NETWORK = { 'unavailable': 1, 'deadline-exceeded': 1, 'cancelled': 1, 'aborted': 1, 'auth/network-request-failed': 1, 'internal': 1 };
  function fsErr(e) {
    if (e && e.isHub) return e;
    var c = e && e.code;
    if (c === 'permission-denied' || c === 'unauthenticated') return err('denied', 'Not allowed', e);
    if (NETWORK[c] || offlineNow()) return err('offline', 'Offline', e);
    return err('denied', (e && e.message) || 'Request failed', e);
  }
  function readyErrFor(set) { // ready() rejects unavailable|offline|auth; narrow to a method's documented set
    return function (e) {
      if (!e || !e.isHub) throw fsErr(e);
      if (set === 'lookup') {
        if (e.code === 'offline') throw e;
        throw err(e.code === 'auth' ? 'denied' : 'timeout', e.message, e);
      }
      if (set === 'room') {
        if (e.code === 'unavailable') throw err('offline', e.message, e);
        if (e.code === 'auth') throw err('denied', e.message, e);
      }
      throw e;
    };
  }

  /* ---------- local profile (written by HubKit) and its mirror in profiles/{uid} ---------- */
  function readRawProfile() {
    try {
      var d = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (d && typeof d === 'object' && !Array.isArray(d)) return d;
    } catch (e) {}
    return {};
  }
  function myProfile() {
    var p = null;
    try { if (window.HubKit && typeof window.HubKit.profile === 'function') p = window.HubKit.profile(); } catch (e) {}
    if (!p) { var r = readRawProfile(); p = { name: r.name, color: r.color }; }
    var name = String(p.name == null ? '' : p.name).replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player';
    var color = typeof p.color === 'string' && p.color.length <= 16 ? p.color : '#e4572e';
    return { name: name, color: color, real: String(p.name == null ? '' : p.name).replace(/\s+/g, ' ').trim().slice(0, 16) };
  }
  function mySeat() {
    var p = myProfile();
    return { name: p.name, color: p.color, joinedAt: Date.now() };
  }

  var mirrorTimer = 0, lastMirror = '';
  function scheduleMirror(ms) {
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(mirror, ms == null ? 400 : ms);
  }
  function mirror() {
    if (!core || !api.uid) return;
    try {
      var p = myProfile(), raw = readRawProfile();
      var stats = raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats) ? clean(raw.stats) : {};
      var sig = JSON.stringify([p.real, p.color, stats]);
      if (sig === lastMirror) return;
      lastMirror = sig;
      var m = core.m.fs;
      m.setDoc(m.doc(core.db, 'profiles', api.uid), {
        name: p.real, color: p.color, stats: stats, updatedAt: m.serverTimestamp()
      }).catch(function (e) { lastMirror = ''; });
    } catch (e) { lastMirror = ''; }
  }
  window.addEventListener('hubprofilechange', function () { if (core) scheduleMirror(); });
  window.addEventListener('storage', function (e) { if (core && (e.key === PROFILE_KEY || e.key === null)) scheduleMirror(); });

  /* ---------- hub.rooms (rooms this device has joined) ---------- */
  function loadRooms() {
    try {
      var a = JSON.parse(localStorage.getItem(ROOMS_KEY));
      if (Array.isArray(a)) return a.filter(function (r) { return r && typeof r.code === 'string' && CODE_RE.test(r.code); });
    } catch (e) {}
    return [];
  }
  function saveRooms(a) { try { localStorage.setItem(ROOMS_KEY, JSON.stringify(a.slice(-40))); } catch (e) {} }
  function remember(code, game) {
    if (!api.uid) return;
    var a = loadRooms(), hit = null;
    a.forEach(function (r) { if (r.code === code && r.uid === api.uid) hit = r; });
    if (hit) { if (!hit.game && game) hit.game = game; }
    else a.push({ code: code, game: game || '', uid: api.uid, joinedAt: Date.now() });
    saveRooms(a);
  }

  /* ---------- rooms ---------- */
  function roomRef(code) { return core.m.fs.doc(core.db, 'rooms', code); }

  async function create(o) {
    o = o || {};
    var game = o.game, maxSeats = o.maxSeats;
    if (typeof game !== 'string' || !/^[a-z][a-z0-9_-]{0,23}$/.test(game)) throw err('invalid', 'create needs a game id');
    if (!(typeof maxSeats === 'number' && maxSeats % 1 === 0 && maxSeats >= 2 && maxSeats <= 8)) throw err('invalid', 'maxSeats must be a whole number from 2 to 8');
    var opts = null;
    if (o.opts !== undefined && o.opts !== null) {
      var okOpts = typeof o.opts === 'object' && !Array.isArray(o.opts) && Object.keys(o.opts).length <= 8;
      if (okOpts) Object.keys(o.opts).forEach(function (k) {
        var v = o.opts[k];
        if (!(typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && v % 1 === 0))) okOpts = false;
      });
      if (!okOpts) throw err('invalid', 'opts must be an object of at most 8 string, integer or boolean values');
      opts = clean(o.opts);
    }
    if (offlineNow()) throw err('offline', 'Offline');
    await ready().catch(readyErrFor('room'));
    var fs = core.m.fs, seat = mySeat();
    for (var i = 0; i < 8; i++) {
      var code = randomCode(), ref = roomRef(code);
      try {
        await withTimeout(fs.runTransaction(core.db, async function (tx) {
          var snap = await tx.get(ref);
          if (snap.exists()) throw COLLISION;
          var seats = {};
          seats[api.uid] = seat;
          var data = {
            game: game, v: 1, host: api.uid, seed: 1 + randInt(2147483646), maxSeats: maxSeats,
            status: 'open', seats: seats, createdAt: fs.serverTimestamp()
          };
          if (opts) data.opts = opts;
          tx.set(ref, data);
        }), 12000, 'offline');
        remember(code, game);
        return { code: code };
      } catch (e) {
        if (e === COLLISION) continue;
        throw fsErr(e);
      }
    }
    throw err('denied', 'Could not find a free game code');
  }
  var COLLISION = { collision: true };

  async function lookup(code) {
    code = norm(code);
    if (!CODE_RE.test(code)) return { exists: false, code: code };
    if (offlineNow()) throw err('offline', 'Offline');
    return withTimeout((async function () {
      await ready().catch(readyErrFor('lookup'));
      var snap;
      try { snap = await core.m.fs.getDoc(roomRef(code)); }
      catch (e) {
        var x = fsErr(e);
        throw x.code === 'offline' && !offlineNow() ? err('timeout', 'Could not reach the game server', e) : x;
      }
      if (!snap.exists()) return { exists: false, code: code };
      var d = plain(snap.data());
      var seats = d.seats && typeof d.seats === 'object' ? d.seats : {};
      return {
        exists: true, code: code, game: d.game, status: d.status, maxSeats: d.maxSeats, host: d.host,
        seats: seats, seated: !!seats[api.uid], opts: d.opts && typeof d.opts === 'object' ? d.opts : {}
      };
    })(), 8000, 'timeout');
  }

  async function join(code) {
    code = norm(code);
    if (!CODE_RE.test(code)) throw err('missing', 'No game with that code');
    if (offlineNow()) throw err('offline', 'Offline');
    await ready().catch(readyErrFor('room'));
    var fs = core.m.fs, ref = roomRef(code), uid = api.uid, seat = mySeat(), game = '';
    try {
      await withTimeout(fs.runTransaction(core.db, async function (tx) {
        var snap = await tx.get(ref);
        if (!snap.exists()) throw err('missing', 'No game with that code');
        var d = snap.data(), seats = d.seats || {};
        game = d.game;
        if (seats[uid]) return;                                   // already seated: fine, even after the start
        if (d.status !== 'open') throw err('started', 'That game has already started');
        var n = Object.keys(seats).length;
        if (n >= d.maxSeats) throw err('full', 'That game is full');
        var upd = {};
        upd['seats.' + uid] = seat;
        if (n + 1 >= d.maxSeats) { upd.status = 'playing'; upd.startedAt = fs.serverTimestamp(); }
        tx.update(ref, upd);
      }), 12000, 'offline');
    } catch (e) { throw fsErr(e); }
    remember(code, game);
    return { code: code, game: game };
  }

  async function leave(code) {
    code = norm(code);
    if (!CODE_RE.test(code)) throw err('missing', 'No game with that code');
    if (offlineNow()) throw err('offline', 'Offline');
    await ready().catch(readyErrFor('room'));
    var fs = core.m.fs, upd = {};
    upd['seats.' + api.uid] = fs.deleteField();
    try { await withTimeout(fs.updateDoc(roomRef(code), upd), 12000, 'offline'); }
    catch (e) { throw fsErr(e); }
    forget(code);
  }

  async function start(code) {
    code = norm(code);
    if (!CODE_RE.test(code)) throw err('missing', 'No game with that code');
    if (offlineNow()) throw err('offline', 'Offline');
    await ready().catch(readyErrFor('room'));
    var fs = core.m.fs;
    try { await withTimeout(fs.updateDoc(roomRef(code), { status: 'playing', startedAt: fs.serverTimestamp() }), 12000, 'offline'); }
    catch (e) { throw fsErr(e); }
  }

  /* ---------- waking watchers ---------- */
  // Every live watcher registers a wake(reason) hook. When the page comes back into view, the browser goes back
  // online or the window regains focus, each watcher checks the server, because a sleeping phone can drop the
  // live connection without noticing.
  var wakers = [];
  var wakeT = null;
  function wakeAll(reason) {
    clearTimeout(wakeT);
    wakeT = setTimeout(function () { wakers.slice().forEach(function (w) { try { w(reason); } catch (e) {} }); }, 300);
  }
  function addWaker(w) {
    wakers.push(w);
    return function () { var i = wakers.indexOf(w); if (i >= 0) wakers.splice(i, 1); };
  }
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    wakeAll(hiddenAt && Date.now() - hiddenAt > 5000 ? 'resume' : 'visible');
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) wakeAll('resume'); });
  window.addEventListener('online', function () { wakeAll('resume'); });
  window.addEventListener('focus', function () { wakeAll('visible'); });

  // Backup reads go over plain fetch (Firestore REST) instead of the SDK. The SDK's getDocFromServer reuses the
  // listener's own query target, so when the live stream is wedged it just hands back the same stale snapshot
  // (or hangs behind the dead channel). A separate transport sees what the server really holds.
  function restMillis(t) {                // same arithmetic as Timestamp.toMillis(), so both sources compare equal
    var m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/.exec(String(t));
    if (!m) return Date.parse(t);
    return Date.parse(m[1] + 'Z') / 1000 * 1000 + Number(((m[2] || '') + '000000000').slice(0, 9)) / 1e6;
  }
  function restValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return restMillis(v.timestampValue);
    if ('mapValue' in v) return restFields(v.mapValue.fields);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(restValue);
    return null;
  }
  function restFields(f) {
    var o = {};
    Object.keys(f || {}).forEach(function (k) { o[k] = restValue(f[k]); });
    return o;
  }
  function restGet(path) {
    var c = core, e = emulator(), cfg = config();
    if (!c || !c.auth.currentUser || !cfg || typeof fetch !== 'function') return Promise.reject(err('unavailable', 'No REST'));
    return c.auth.currentUser.getIdToken().then(function (tok) {
      var base = e ? 'http://' + e.host + ':' + e.fs + '/v1' : 'https://firestore.googleapis.com/v1';
      var url = base + '/projects/' + encodeURIComponent(cfg.projectId) + '/databases/(default)/documents/' + path;
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); }, 10000);
      return fetch(url, { headers: { Authorization: 'Bearer ' + tok }, signal: ctl ? ctl.signal : undefined, cache: 'no-store' }).then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw err('denied', 'REST ' + r.status);   // incl. 404: let the SDK read decide whether the room is gone
        return r.json();
      }, function (x) { clearTimeout(t); throw x; });
    });
  }
  // -> {room: plain|null, players: {uid: plain}} read from the server over REST
  function restRead(code) {
    return Promise.all([restGet('rooms/' + code), restGet('rooms/' + code + '/players?pageSize=100')]).then(function (r) {
      var room = null, players = {};
      if (r[0] && r[0].fields) { room = restFields(r[0].fields); room.code = code; }
      var docs = (r[1] && r[1].documents) || [];
      docs.forEach(function (d) {
        var x = restFields(d.fields);
        if (!Array.isArray(x.moves)) x.moves = [];
        players[d.name.split('/').pop()] = x;
      });
      return { room: room, players: players };
    });
  }
  // Tear down and rebuild Firestore's network streams: a wedged long-poll channel does not recover by itself.
  var lastRestart = 0;
  function restartNetwork() {
    if (!core || Date.now() - lastRestart < 15000) return;
    lastRestart = Date.now();
    var fs = core.m.fs, db = core.db;
    fs.disableNetwork(db).then(function () { return fs.enableNetwork(db); }).catch(function () { try { fs.enableNetwork(db); } catch (e) {} });
  }

  function watch(code, cb) {
    code = norm(code);
    var stopped = false, unsubs = [], unWake = null, pollT = null, gap = POLL_MIN, polling = false, skipCache = { room: false, players: false };
    var st = { room: undefined, players: undefined, roomPending: false, playersPending: false, fromCache: false, serverAt: 0 };
    function out(error) {
      if (stopped || typeof cb !== 'function') return;
      try {
        cb({
          room: st.room || null, players: st.players || {},
          pending: !!(st.roomPending || st.playersPending), fromCache: !!st.fromCache, error: error || null
        });
      } catch (e) { try { console.error(e); } catch (_) {} }
    }
    function emit() { if (st.room !== undefined && st.players !== undefined) out(null); }
    function fail(e) {
      var x = e && e.isHub ? e : fsErr(e);
      out({ code: x.code, message: x.message });
    }
    if (!CODE_RE.test(code)) {
      Promise.resolve().then(function () { st.room = null; st.players = {}; emit(); });
      return function () { stopped = true; };
    }
    function roomData(snap) {
      var d = plain(snap.data({ serverTimestamps: 'estimate' }));
      d.code = code;
      if (d.seats && d.seats[api.uid]) remember(code, d.game);     // a seated player opening the room is remembered
      return d;
    }
    function playersData(snap) {
      var players = {};
      snap.forEach(function (d) {
        var x = plain(d.data({ serverTimestamps: 'estimate' }));
        if (!Array.isArray(x.moves)) x.moves = [];
        players[d.id] = x;
      });
      return players;
    }
    function subscribe() {
      unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      unsubs = [];
      if (stopped) return;
      var fs = core.m.fs, ref = roomRef(code);
      unsubs.push(fs.onSnapshot(ref, { includeMetadataChanges: true }, function (snap) {
        if (skipCache.room) {                                       // after a backup recovery, wait for the server's word
          if (snap.metadata.fromCache && !snap.metadata.hasPendingWrites) return;
          if (!snap.metadata.fromCache) skipCache.room = false;
        }
        st.roomPending = snap.metadata.hasPendingWrites;
        st.fromCache = snap.metadata.fromCache;
        if (!snap.metadata.fromCache) st.serverAt = Date.now();
        if (!snap.exists()) {
          if (snap.metadata.fromCache) return;                      // not confirmed by the server yet
          st.room = null;
        } else st.room = roomData(snap);
        emit();
      }, fail));
      unsubs.push(fs.onSnapshot(fs.collection(ref, 'players'), { includeMetadataChanges: true }, function (snap) {
        if (skipCache.players) {
          if (snap.metadata.fromCache && !snap.metadata.hasPendingWrites) return;
          if (!snap.metadata.fromCache) skipCache.players = false;
        }
        st.playersPending = snap.metadata.hasPendingWrites;
        if (!snap.metadata.fromCache) st.serverAt = Date.now();
        if (snap.metadata.fromCache && snap.size === 0 && !snap.metadata.hasPendingWrites) return;   // wait for the server
        st.players = playersData(snap);
        emit();
      }, fail));
    }
    // Backup check: read the room straight from the server now and then. If it shows something the live
    // listeners missed, use it and reconnect them. Quiet checks back off to POLL_MAX to save reads.
    function schedule(ms) {
      clearTimeout(pollT);
      if (!stopped) pollT = setTimeout(poll, ms);
    }
    function poll(reason) {
      if (stopped || polling) return;
      if (document.hidden || offlineNow()) { schedule(gap); return; }
      polling = true;
      var t0 = Date.now();
      // REST first; if that is unavailable (blocked, not allowed) fall back to the SDK's server reads.
      var read = restRead(code).catch(function () {
        var fs = core.m.fs, ref = roomRef(code);
        return Promise.all([fs.getDocFromServer(ref), fs.getDocsFromServer(fs.collection(ref, 'players'))]).then(function (r) {
          return { room: r[0].exists() ? roomData(r[0]) : null, players: playersData(r[1]) };
        });
      });
      read.then(function (r) {
        if (stopped) return;
        // Skip if a live update landed while we were reading, or our own write is still on its way.
        if (st.serverAt > t0 || st.roomPending || st.playersPending) return;
        var room = r.room, players = r.players, cur = st.players || {}, missed = false;
        Object.keys(cur).forEach(function (id) {                   // move lists only grow: never go backwards
          var a = cur[id], b = players[id];
          if (b && a && a.moves.length > b.moves.length) players[id] = a;
        });
        if (stable(room) !== stable(st.room === undefined ? null : st.room)) missed = true;
        Object.keys(players).forEach(function (id) {
          var a = cur[id], b = players[id];
          if (!a || b.moves.length !== a.moves.length || stable(b.setup || null) !== stable(a.setup || null)) missed = true;
        });
        if (missed) {
          try { console.warn('HubOnline: live updates missed; reconnecting'); } catch (e) {}
          st.room = room; st.players = players; st.fromCache = false; st.serverAt = Date.now();
          skipCache = { room: true, players: true };               // the restarted listeners first replay the (older) cache
          emit();
          restartNetwork();
          subscribe();
          gap = POLL_MIN;
        } else gap = Math.min(POLL_MAX, Math.round(gap * 1.5));
      }).catch(function () {}).then(function () { polling = false; schedule(gap); });
    }
    ready().then(function () {
      if (stopped) return;
      subscribe();
      schedule(POLL_MIN);
      unWake = addWaker(function (reason) {
        if (stopped) return;
        if (reason === 'resume') subscribe();                       // the old connection may be dead after a sleep
        gap = POLL_MIN;
        clearTimeout(pollT);
        poll(reason);
      });
    }, fail);
    return function () {
      stopped = true;
      clearTimeout(pollT);
      if (unWake) unWake();
      unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      unsubs = [];
    };
  }

  // One write in flight per room; writes that arrive meanwhile are merged into the latest one (each write is
  // the full document, so the newest supersedes the rest). Every caller's promise settles with the merged write.
  var queues = {};
  function writeMine(code, o) {
    code = norm(code);
    o = o || {};
    return new Promise(function (resolve, reject) {
      if (!CODE_RE.test(code)) return reject(err('missing', 'No game with that code'));
      var q = queues[code] || (queues[code] = { busy: false, next: null });
      var job = { o: o, waiters: [{ resolve: resolve, reject: reject }] };
      if (q.busy) {
        if (q.next) job.waiters = q.next.waiters.concat(job.waiters);
        q.next = job;
      } else run(code, q, job);
    });
  }
  function run(code, q, job) {
    q.busy = true;
    send(code, job.o).then(function () {
      job.waiters.forEach(function (w) { w.resolve(); });
    }, function (e) {
      var x = fsErr(e);
      job.waiters.forEach(function (w) { w.reject(x); });
    }).then(function () {
      q.busy = false;
      var n = q.next;
      q.next = null;
      if (n) run(code, q, n);
    });
  }
  async function send(code, o) {
    await ready().catch(readyErrFor('room'));
    var fs = core.m.fs;
    var data = {
      moves: Array.isArray(o.moves) ? clean(o.moves) : [],
      turn: Object.assign({}, clean(o.turn) || {}, { at: fs.serverTimestamp() })
    };
    if (o.setup !== undefined && o.setup !== null) data.setup = clean(o.setup);
    // Resolves when the server has accepted the write; while offline it stays queued by the SDK.
    await fs.setDoc(fs.doc(core.db, 'rooms', code, 'players', api.uid), data);
  }

  /* ---------- drawing chunks (Pictionary): rooms/{code}/draw/{uid}_{t}_{i} = {t, i, d}, create-only ---------- */
  // Chunks go out strictly in call order, one at a time, never merged. A failed chunk rejects its own promise and the
  // queue moves on; the caller may call add() again with the same arguments (an identical re-send is allowed by the rules).
  var drawQueues = {};
  function drawAdd(code, t, i, d) {
    code = norm(code);
    return new Promise(function (resolve, reject) {
      if (!CODE_RE.test(code)) return reject(err('missing', 'No game with that code'));
      if (!(typeof t === 'number' && t % 1 === 0 && t >= 0 && t < 100)) return reject(err('invalid', 't must be a whole number from 0 to 99'));
      if (!(typeof i === 'number' && i % 1 === 0 && i >= 0 && i < 100000)) return reject(err('invalid', 'i must be a whole number from 0 to 99999'));
      if (typeof d !== 'string' || d.length > 40000) return reject(err('invalid', 'd must be a string of at most 40000 characters'));
      var q = drawQueues[code] || (drawQueues[code] = { busy: false, jobs: [] });
      q.jobs.push({ t: t, i: i, d: d, resolve: resolve, reject: reject });
      if (!q.busy) drawPump(code, q);
    });
  }
  function drawPump(code, q) {
    var job = q.jobs.shift();
    if (!job) { q.busy = false; return; }
    q.busy = true;
    ready().catch(readyErrFor('room')).then(function () {
      var fs = core.m.fs;
      return fs.setDoc(fs.doc(core.db, 'rooms', code, 'draw', api.uid + '_' + job.t + '_' + job.i), { t: job.t, i: job.i, d: job.d });
    }).then(function () { job.resolve(); }, function (e) { job.reject(fsErr(e)); }).then(function () { drawPump(code, q); });
  }
  // cb(list, error): list = every chunk of turn t written by drawerUid, sorted by i, as [{id, t, i, d}]. Called on every change.
  function drawWatch(code, drawerUid, t, cb) {
    code = norm(code);
    var stopped = false, unsub = null, prefix = String(drawerUid) + '_';
    function out(list, error) {
      if (stopped || typeof cb !== 'function') return;
      try { cb(list, error || null); } catch (e) { try { console.error(e); } catch (_) {} }
    }
    function fail(e) { var x = e && e.isHub ? e : fsErr(e); out([], { code: x.code, message: x.message }); }
    if (!CODE_RE.test(code) || !drawerUid || !(typeof t === 'number' && t % 1 === 0)) {
      Promise.resolve().then(function () { out([], null); });
      return function () { stopped = true; };
    }
    var unWake = null;
    function sub() {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      if (stopped) return;
      var fs = core.m.fs;
      unsub = fs.onSnapshot(fs.query(fs.collection(core.db, 'rooms', code, 'draw'), fs.where('t', '==', t)), function (snap) {
        var list = [];
        snap.forEach(function (d) {
          if (d.id.indexOf(prefix) !== 0) return;
          var x = plain(d.data({ serverTimestamps: 'estimate' }));
          list.push({ id: d.id, t: x.t, i: x.i, d: typeof x.d === 'string' ? x.d : '' });
        });
        list.sort(function (a, b) { return a.i - b.i; });
        out(list, null);
      }, fail);
    }
    ready().then(function () {
      if (stopped) return;
      sub();
      unWake = addWaker(function (reason) { if (!stopped && reason === 'resume') sub(); });
    }, fail);
    return function () {
      stopped = true;
      if (unWake) unWake();
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    };
  }

  function mine() {
    var a = loadRooms().filter(function (r) { return !api.uid || r.uid === api.uid; });
    a.sort(function (x, y) { return (y.joinedAt || 0) - (x.joinedAt || 0); });
    return a.map(function (r) { return { code: r.code, game: r.game || '', uid: r.uid, joinedAt: r.joinedAt || 0 }; });
  }
  function forget(code) {
    code = norm(code);
    saveRooms(loadRooms().filter(function (r) { return r.code !== code; }));
  }

  api.available = available;
  api.ready = ready;
  api.rooms = { create: create, lookup: lookup, join: join, leave: leave, start: start, watch: watch, writeMine: writeMine, mine: mine, forget: forget };
  api.draw = { add: drawAdd, watch: drawWatch };
  window.HubOnline = api;
})();
