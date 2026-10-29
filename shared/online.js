/*!
 * HubOnline: online rooms for Game Hub (game codes, anonymous identity, live room + player documents).
 * Classic script. Defines window.HubOnline immediately; the Firebase SDK is loaded lazily with import()
 * the first time ready() (or anything that needs it) is called. Spec: docs/online-plan.md (amendments win).
 *
 * Frozen API (see the plan, amendment 3):
 *   available()  ready()  uid
 *   rooms.create({game,maxSeats})  rooms.lookup(code)  rooms.join(code)  rooms.leave(code)  rooms.start(code)
 *   rooms.watch(code, cb)  rooms.writeMine(code, {setup?, moves, turn})  rooms.mine()  rooms.forget(code)
 */
(function () {
  'use strict';
  if (window.HubOnline) return;

  var VER = '11.10.0';
  var BASE = 'https://www.gstatic.com/firebasejs/' + VER + '/';
  var ROOMS_KEY = 'hub.rooms';
  var PROFILE_KEY = 'hub.profile';
  var CODE_RE = /^[1-9][0-9]{5}$/;

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
    var db = m.fs.getFirestore(app);                 // default memory cache
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
      }).catch(function () { lastMirror = ''; });
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
    if (!(maxSeats === 2 || maxSeats === 3 || maxSeats === 4)) throw err('invalid', 'maxSeats must be 2, 3 or 4');
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
          tx.set(ref, {
            game: game, v: 1, host: api.uid, seed: 1 + randInt(2147483646), maxSeats: maxSeats,
            status: 'open', seats: seats, createdAt: fs.serverTimestamp()
          });
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
        seats: seats, seated: !!seats[api.uid]
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

  function watch(code, cb) {
    code = norm(code);
    var stopped = false, unsubs = [];
    var st = { room: undefined, players: undefined, roomPending: false, playersPending: false, fromCache: false };
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
    ready().then(function () {
      if (stopped) return;
      var fs = core.m.fs, ref = roomRef(code);
      unsubs.push(fs.onSnapshot(ref, { includeMetadataChanges: true }, function (snap) {
        st.roomPending = snap.metadata.hasPendingWrites;
        st.fromCache = snap.metadata.fromCache;
        if (!snap.exists()) {
          if (snap.metadata.fromCache) return;                      // not confirmed by the server yet
          st.room = null;
        } else {
          var d = plain(snap.data({ serverTimestamps: 'estimate' }));
          d.code = code;
          st.room = d;
          if (d.seats && d.seats[api.uid]) remember(code, d.game);   // a seated player opening the room is remembered
        }
        emit();
      }, fail));
      unsubs.push(fs.onSnapshot(fs.collection(ref, 'players'), { includeMetadataChanges: true }, function (snap) {
        st.playersPending = snap.metadata.hasPendingWrites;
        if (snap.metadata.fromCache && snap.size === 0 && !snap.metadata.hasPendingWrites) return;   // wait for the server
        var players = {};
        snap.forEach(function (d) {
          var x = plain(d.data({ serverTimestamps: 'estimate' }));
          if (!Array.isArray(x.moves)) x.moves = [];
          players[d.id] = x;
        });
        st.players = players;
        emit();
      }, fail));
    }, fail);
    return function () {
      stopped = true;
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
  window.HubOnline = api;
})();
