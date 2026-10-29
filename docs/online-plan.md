# Online play, phase 1: game codes, profiles, Codex online

Status: reviewed; ready to build. **Read "Amendments after review" at the end first; it overrides anything above.** Owner: coordinator session. Builders: Sonnet helper agents.

## Goal

Two to four friends play Codex Naturalis online, each on their own phone, by sharing a six-digit game code. Nobody signs in. Every player has a simple profile (name and colour) and personal stats. The site stays on GitHub Pages; Firebase (free Spark plan) stores profiles and games.

## What players see

1. **Profile, once.** The first time a player opens the shared menu (or starts an online game), they enter a name (max 16 characters) and pick one of 8 colours. They can change both later in the menu under "You". All games use this name instead of "You" where a name is shown to others.
2. **Start an online game.** In Codex's new-game dialog, a third tab "Online" next to the player setup: choose 2, 3 or 4 players, tap "Create game". The screen shows the code in large digits (e.g. `482 619`), a "Copy link" button (`.../codex/?room=482619`) and the list of joined players. The host taps "Start" once at least 2 players have joined (it starts by itself when all seats are full).
3. **Join.** Either open the link, or type the code into a "Join a game" box on the hub (the hub looks the code up and opens the right game), or into "Join with a code" in Codex's dialog. Joining shows the same waiting room.
4. **Play.** Same Codex screens as today. Each player chooses their starter side and secret objective on their own phone, then plays their turns. Moves appear on other phones within about a second, with the existing drop animation and sounds. When it's your turn: chime, tab title "Your turn", and the menu button shows a small dot.
5. **Leave and come back.** Players can close the page at any time. The hub shows the game under "Continue" ("Online · your turn" or "Online · waiting for Sam"). Reopening resumes exactly where the game is.
6. **Finish.** Everyone sees the same scorecard. Each player's stats update (games played and won per game, best score).

## Architecture

- **Hosting:** unchanged (GitHub Pages). Firebase JS SDK loaded from `https://www.gstatic.com/firebasejs/<pinned version>/firebase-*.js` as ES modules, version pinned (use a 10.x or 11.x release the builder confirms exists). Lazy-loaded only when online features are used, so offline/local play never waits for it.
- **Identity:** Firebase Anonymous Auth. Each browser gets a stable `uid` automatically. No sign-in screens. (Later phase: optional Google sign-in linking the anonymous account, to carry a profile across devices.)
- **Config:** `shared/firebase-config.js` holds the public web config the owner pastes from the Firebase console. It is not a secret; protection comes from security rules and the authorised domain.
- **Shared module `shared/online.js`** (game-agnostic), exposing `window.HubOnline`:
  - `ready()` → resolves `{uid}` after anonymous sign-in.
  - `profile.get()` / `profile.set({name,color})`: localStorage `hub.profile` is the source of truth on the device, mirrored to `profiles/{uid}`.
  - `rooms.create({game, maxSeats, settings})` → `{code}`. Generates a random 6-digit code (first digit 1–9), creates `rooms/{code}` in a transaction only if absent, retries on collision.
  - `rooms.join(code)` → adds the caller to `seats` in a transaction (fails clearly if full, started, or missing).
  - `rooms.watch(code, cb)` → live updates of the room doc plus all `players/*` docs, delivered as one combined object.
  - `rooms.start(code)` (host only).
  - `rooms.saveSetup(code, setup)` and `rooms.appendMove(code, move)`: write the caller's own `players/{uid}` doc.
  - `rooms.mine()` → the rooms this device has joined (localStorage `hub.rooms`, list of `{code, game, joinedAt}`), for the hub's Continue list.
  - `stats.record(game, {won, score})`: once per finished room per player (guard with a `statsRecorded` flag in the player's own doc).
- **Game logic stays in each game.** The online engine pattern already proven in `/home/user/naturalists-codex-online/index.html` (deterministic rebuild from a shared seed plus each player's own move list, every client validating every move, illegal moves ignored and logged) is generalised from 2 to 2–4 players for Codex.

## Data model (Firestore)

```
profiles/{uid}            { name, color, updatedAt, stats: { codex: {played, won, best} } }
rooms/{code}              { game:'codex', v:1, host:uid, seed:int, maxSeats:2..4, status:'open'|'playing',
                            seats: { uid: {name, color, joinedAt} }, createdAt, startedAt? }
rooms/{code}/players/{uid}{ setup?: {face, secret}, moves: [ {id, face, x, y, src} ... ], statsRecorded?: true }
```
- Seat order = seats sorted by `joinedAt`, ties by uid. First player = derived from `seed` (same as the claude.ai online version).
- Names in `seats` are a snapshot for display; the live name comes from `profiles/{uid}` when readable.
- One move list per player keeps writes single-writer (no conflicts) and lets the rules restrict each player to their own document.

## Security rules (to paste into the console; final version kept in `firebase/firestore.rules`)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function room(code) { return get(/databases/$(db)/documents/rooms/$(code)).data; }

    match /profiles/{uid} {
      allow read: if signedIn();
      allow write: if signedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['name','color','updatedAt','stats'])
        && request.resource.data.name is string && request.resource.data.name.size() <= 16;
    }

    match /rooms/{code} {
      allow read: if signedIn();
      allow create: if signedIn() && code.matches('^[1-9][0-9]{5}$')
        && request.resource.data.host == request.auth.uid
        && request.resource.data.status == 'open'
        && request.resource.data.maxSeats >= 2 && request.resource.data.maxSeats <= 4
        && request.resource.data.seats.keys().hasOnly([request.auth.uid]);
      allow update: if signedIn() && (
        // join: add only yourself, while open and not full
        (resource.data.status == 'open'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['seats'])
          && request.resource.data.seats.diff(resource.data.seats).addedKeys().hasOnly([request.auth.uid])
          && request.resource.data.seats.diff(resource.data.seats).removedKeys().size() == 0
          && request.resource.data.seats.diff(resource.data.seats).changedKeys().size() == 0
          && request.resource.data.seats.size() <= resource.data.maxSeats)
        ||
        // host starts the game
        (request.auth.uid == resource.data.host && resource.data.status == 'open'
          && request.resource.data.status == 'playing'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','startedAt']))
      );
      allow delete: if false;

      match /players/{uid} {
        allow read: if signedIn();
        allow create, update: if signedIn() && request.auth.uid == uid
          && (request.auth.uid in room(code).seats)
          && room(code).status == 'playing';
        allow delete: if false;
      }
    }
  }
}
```
Notes: moves can only be appended by their owner (validation of game legality happens in every client, as before). Rooms are small; no cleanup needed at this scale (a later phase can add a TTL policy on `createdAt`).

## Shared menu changes (HubKit)

- New "You" row at the top of the Settings section: shows the colour dot and name; tapping opens a small inline editor (name field, 8 colour swatches, Save). Stored via `HubOnline.profile.set` when online.js is loaded, otherwise straight to localStorage `hub.profile`.
- Optional `HubKit.setBadge(bool)`: a small dot on the menu button (used for "your turn").
- HubKit must keep working without online.js and without network.

## Hub changes

- "Join a game" box under the shelf: 6-digit input (numeric keyboard, auto-advance, paste support), Join button. Looks up `rooms/{code}`, then opens `<game>/?room=<code>`. Clear errors: "No game with that code", "That game is full", "That game has already started".
- Continue section lists online rooms from `rooms.mine()` with status ("your turn", "waiting for …", "finished") read live; finished rooms drop off after 7 days.
- Small "Your stats" line under the header (games played, wins) from the local profile mirror.

## Codex changes

- New-game dialog: tabs "On this device" (today's setup) and "Online" (create with 2–4 seats, or join with a code). URL `?room=CODE` opens straight into that room.
- Online mode reuses the existing renderers; the rebuild engine from the claude.ai online version, generalised to N players: seats order, `advance()` with n players and the first-player offset, end-of-game trigger (finish the round, then one more), results.
- Waiting room screen (modal): big code, Copy link (clipboard with fallback select), player list with colours, Start (host, enabled at ≥2), Leave.
- Setup modal per player as today; "Waiting for X to set up" banner.
- Your-turn signals: chime (existing rule), tab title, `HubKit.setBadge(true)`.
- Local pass-and-play and bot games are unchanged.
- Stats recorded at game end for online games (and for local games against bots, locally only).

## Owner steps (outside the code)

1. Create the Firebase project, web app, Firestore (production mode), and enable Anonymous sign-in (steps written separately for the owner).
2. Paste the `firebaseConfig` values to the coordinator.
3. After the builder finishes, paste `firebase/firestore.rules` into Firestore > Rules and Publish.
4. Add `kheema-pav.github.io` under Authentication > Settings > Authorised domains.

## Testing

- Unit-level: the N-player rebuild engine in Node with simulated move lists (2, 3, 4 players; illegal moves ignored; same final state on every replica).
- Live: two or three Playwright browser contexts (separate storage = separate anonymous users) against the real Firebase project: create, join by code and by link, full game to the scorecard, reload mid-game resumes, hub Continue lists the room, rules reject: writing another player's doc, joining a full room, non-host starting.
- Regression: local Codex, the other three games, the hub and offline mode still work; with Firebase unreachable, local play is unaffected.

## Work split

1. Owner: Firebase setup (can run in parallel with step 2).
2. Builder 1: `shared/online.js`, `firebase/firestore.rules`, HubKit "You" row and `setBadge`, hub Join box, Continue for online rooms, stats line. Tested against a mock of `HubOnline` first, then live once config exists.
3. Builder 2 (after builder 1's API is fixed): Codex online mode.
4. Coordinator: live acceptance tests, rules verification, deploy.


## Amendments after review (override everything above)

### 1. Identity and SDK loading
- `shared/online.js` is a **classic script** (not a module) that defines `window.HubOnline` synchronously, then lazily `import()`s the Firebase modules from `https://www.gstatic.com/firebasejs/<VER>/firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`, one pinned version for all three. Verify the URLs return 200 with curl before using them. If the import fails, online features report "unavailable" and nothing else breaks.
- `shared/firebase-config.js` sets `window.HUB_FIREBASE_CONFIG = null;` until the owner's values are pasted in. `HubOnline.available()` is false while it is null.
- Auth: `getAuth()` with default persistence; `await auth.authStateReady()`; call `signInAnonymously` only if `auth.currentUser` is still null. Never create a second anonymous user on reload.
- Firestore: default memory cache (no persistent cache).
- Emulator switch for tests: if `localStorage['hub.emulator']` is set to `"host:firestorePort:authPort"`, connect to the emulators (`connectFirestoreEmulator`, `connectAuthEmulator`) and use a demo project id (`demo-game-hub`) even when the config is null.
- Authorised domains are not needed for anonymous auth. (Optional hardening for the owner later: restrict the API key by HTTP referrer.)

### 2. Profile and stats live in HubKit (work without Firebase)
- localStorage `hub.profile` = `{name, color, stats:{<game>:{played, won, best}}}` is the single source of truth on the device.
- HubKit adds: `HubKit.profile()` → `{name, color}` (defaults: name "", color first swatch); `HubKit.setProfile({name, color})`; `HubKit.recordResult(game, key, {won, score})`, idempotent per `key` using localStorage `hub.statsDone` (a set of keys), updating `hub.profile.stats`; `HubKit.setBadge(bool)`; and the "You" row in the sheet (name field max 16 chars, 8 colour swatches, Save). Colours: `#e4572e`, `#f2b632`, `#4f9d69`, `#3b6fa8`, `#7c4d9b`, `#e86fa0`, `#2bb3b1`, `#8d6e4a`.
- `HubOnline` mirrors `hub.profile` to `profiles/{uid}` after `ready()` and whenever it changes. It never reads stats back from the server in phase 1.
- Local bot and pass-and-play games call `recordResult` too (key = a local game id); online games use key = `uid + ':' + code`.

### 3. Frozen `HubOnline` API (both builders code against exactly this)
```js
HubOnline.available()                      // bool
HubOnline.ready()                          // Promise<{uid}>; rejects {code:'unavailable'|'offline'|'auth'}
HubOnline.uid                              // string after ready(), else null
HubOnline.rooms.create({game, maxSeats})   // Promise<{code}>; seat snapshot from HubKit.profile()
HubOnline.rooms.lookup(code)               // Promise<{exists, game, status, maxSeats, seats, seated}>; 8 s timeout; rejects {code:'offline'|'timeout'|'denied'}
HubOnline.rooms.join(code)                 // Promise<{code, game}>; idempotent: if already seated, resolves even after start;
                                           //  rejects {code:'missing'|'full'|'started'|'offline'|'denied'}
HubOnline.rooms.leave(code)                // non-host, while open
HubOnline.rooms.start(code)                // host, while open, at least 2 seated
HubOnline.rooms.watch(code, cb)            // returns unsubscribe; cb({room, players:{uid:{setup?, moves:[], turn?}}, pending, error})
                                           //  `pending` = this client has unconfirmed writes (from hasPendingWrites)
HubOnline.rooms.writeMine(code, {setup?, moves, turn})  // full set of the caller's own players/{uid} doc; queued, one write at a time;
                                           //  sets turn.at = serverTimestamp()
HubOnline.rooms.mine()                     // [{code, game, uid, joinedAt}] from localStorage 'hub.rooms', filtered to the current uid
HubOnline.rooms.forget(code)               // removes from 'hub.rooms' (hub "Remove" link)
```
- `hub.rooms` gets an entry on create, on join, and when a seated player opens `?room=`.
- Turn summary for the hub: every write of your own doc includes `turn: {phase:'setup'|'play'|'over', next: uid|null, at}` computed by the game's replay. The hub shows the summary with the latest `at` across the room's player docs (display only; games always replay the moves).

### 4. Seats, start, leave
- Seat order = `Object.keys(seats)` sorted by uid (not joinedAt; joinedAt is client-chosen). First player = `Math.floor(r()*n)` drawn from the seeded generator after the same shuffles as the local game. The waiting room may list players in joinedAt order for display.
- The join that fills the last seat also sets `status:'playing'` and `startedAt` (allowed by the rules). The host can start earlier with at least 2 seated.
- Non-hosts can leave while the room is open. A host leaving or a player never setting up leaves the game stuck; accepted for phase 1 (hub "Remove" link hides it).
- `rooms.create` writes only `game, v, host, seed, maxSeats, status, seats, createdAt` (no settings field).

### 5. Security rules
Use the reviewer's corrected rules (below) as the starting point and **prove them with the Firestore emulator** using `@firebase/rules-unit-testing`: tests must cover create, join, join-the-last-seat-starts, full room, leave, host start with 1 vs 2 seated, non-host start, writing another player's doc, rewriting or truncating your own moves, changing setup after it is set, listing rooms or profiles (must fail), oversized names. Fix the rules until every test passes; keep the final version in `firebase/firestore.rules`.
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function me() { return request.auth.uid; }
    function room(code) { return get(/databases/$(db)/documents/rooms/$(code)).data; }
    function seatOk(s) { return s.keys().hasOnly(['name','color','joinedAt'])
      && s.name is string && s.name.size() <= 16 && s.color is string && s.color.size() <= 16; }

    match /profiles/{uid} {
      allow get: if signedIn();
      allow create, update: if signedIn() && me() == uid
        && request.resource.data.keys().hasOnly(['name','color','updatedAt','stats'])
        && request.resource.data.name is string && request.resource.data.name.size() <= 16
        && request.resource.data.color is string && request.resource.data.color.size() <= 16;
    }

    match /rooms/{code} {
      function n() { return request.resource.data; }
      function sd() { return n().seats.diff(resource.data.seats); }
      function joining() {
        return n().diff(resource.data).affectedKeys().hasOnly(['seats','status','startedAt'])
          && sd().addedKeys() == [me()].toSet() && sd().affectedKeys() == sd().addedKeys()
          && seatOk(n().seats[me()]) && n().seats.size() <= resource.data.maxSeats
          && (n().status == 'open' || (n().status == 'playing' && n().seats.size() == resource.data.maxSeats));
      }
      function leaving() {
        return me() != resource.data.host
          && n().diff(resource.data).affectedKeys().hasOnly(['seats'])
          && sd().removedKeys() == [me()].toSet() && sd().affectedKeys() == sd().removedKeys();
      }
      function starting() {
        return me() == resource.data.host && n().status == 'playing' && resource.data.seats.size() >= 2
          && n().diff(resource.data).affectedKeys().hasOnly(['status','startedAt']);
      }
      allow get: if signedIn();
      allow create: if signedIn() && code.matches('[1-9][0-9]{5}')
        && n().keys().hasOnly(['game','v','host','seed','maxSeats','status','seats','createdAt'])
        && n().host == me() && n().seed is int && n().status == 'open'
        && n().maxSeats is int && n().maxSeats >= 2 && n().maxSeats <= 4
        && n().seats.keys().hasOnly([me()]) && seatOk(n().seats[me()]);
      allow update: if signedIn() && resource.data.status == 'open' && (joining() || leaving() || starting());

      match /players/{uid} {
        function member() { let r = room(code); return signedIn() && me() == uid && r.status == 'playing' && uid in r.seats; }
        function shape() { return request.resource.data.keys().hasOnly(['setup','moves','turn'])
          && request.resource.data.get('moves', []) is list; }
        function appendOnly() { let o = resource.data.get('moves', []); let m = request.resource.data.get('moves', []);
          return m.size() >= o.size() && m[0:o.size()] == o; }
        function setupFixed() { return !('setup' in resource.data) || request.resource.data.setup == resource.data.setup; }
        allow read: if signedIn();
        allow create: if member() && shape();
        allow update: if member() && shape() && appendOnly() && setupFixed();
      }
    }
  }
}
```
Note: `players` docs allow collection reads (the room's subcollection is listed by `watch`); that is intended. Rooms and profiles allow `get` only, never `list`.

### 6. Writes and pending state
- Writes do not fail while offline (they queue). Show "Sending…" while `pending` is true; roll back only on an actual rejection (permission denied).
- `writeMine` serialises writes (one in flight at a time).

### 7. Codex online integration (must-follow list)
- `start()` branches on `?room=CODE` **before** loading the local save or creating a local game. In online mode never call `save()` (it would overwrite `naturalists-codex-v1`), never run `aiStep`, `setupNext` or the pass-and-play `handoff` phase.
- Generalise the online engine from `/home/user/naturalists-codex-online/index.html` to n = 2..4: replace every 2-player hardcode (`n=2` in advance, `seatsFor`, `if(!seats[1])`, `moveCount`/`ptr` `[0,0]`, `passStreak>=4` becomes `>= 2*n`, `moveCount[1-S.me]`).
- `build()` gives each player `name` (seat snapshot), `ai:false`, and `handOwner()` returns `S.me`. Every player name in HTML goes through `esc()`.
- Players who open a started room without a seat (different browser or device) see "This game started without you" with a link back to the hub.
- Chime only when the turn changes to you after a remote update, never on first load.
- Stats: `HubKit.recordResult('codex', uid+':'+code, {won, score})` once when the game is over.

### 8. Service worker and hub
- Bump `sw.js` VERSION to `gh-v2`; precache `shared/online.js` and `shared/firebase-config.js`. Do not intercept gstatic.
- Hub: there is no Continue section today, only a line per game box. Add an "Online games" strip directly under the header (hidden when empty) listing `rooms.mine()` entries: game name, code, status from the turn summary ("Your turn", "Waiting for Sam", "Setting up", "Finished"), Open and Remove. Load online.js on the hub only when `hub.rooms` has entries or the Join box is used.
- Join box errors: "No game with that code", "That game is full", "That game has already started", "You're offline", "Couldn't reach the game server". Player names on the hub are set with `textContent`.

### 9. Build order
1. Builder 1: `shared/online.js`, `shared/firebase-config.js`, `firebase/firestore.rules` + emulator rules tests (`firebase/test/`), HubKit profile/stats/badge additions, hub Join box and Online games strip, sw.js v2. Tests run against the Firebase emulator (Java 21 and npm are available; use `npx firebase-tools` with `--project demo-game-hub`).
2. Builder 2 (after builder 1): Codex online mode, tested with 2–4 Playwright browser contexts against the emulator.
3. Coordinator: acceptance, then live tests once the owner's config is in.
