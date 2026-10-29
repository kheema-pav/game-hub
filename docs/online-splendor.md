# Online play: Splendor

Status: draft for review. Builds on docs/online-plan.md (read its amendments) and the finished Codex online mode in codex/index.html, which is the reference implementation.

## Goal

2–4 friends play Splendor online with a six-digit code, same flow as Codex: create or join, waiting room, play on your own phone, resume any time, shared scorecard, stats.

## Shared lobby (new, reused by every game from here on)

Codex built its own create/join/waiting-room UI. Extract a game-agnostic version into `shared/lobby.js` (`window.HubLobby`) so Splendor, Catan and Pictionary reuse one implementation:
- `HubLobby.openCreateJoin({game, gameName, minSeats:2, maxSeats:4, onRoom(code)})`: a kit-styled sheet (same look as the HubKit sheet; class prefix `hl-`; z-index 5000) with "Create a game" (seat count 2/3/4) and "Join with a code" (6-digit input, paste support, same error messages as the hub). Prompts for a name via HubKit if the profile name is empty.
- `HubLobby.waitingRoom(code, {onStart(roomSnapshot), onLeave()})`: big grouped code, Copy link (`<game>/?room=CODE`), live player list (names escaped, colour dots), Start for the host at ≥ 2, Leave for non-hosts, auto-continues when status becomes `playing`.
- `HubLobby.notSeated(code)`: the "This game started without you" screen with a link to the hub.
- Uses only `HubOnline` and `HubKit`; no game logic. Codex is NOT migrated in this phase (it keeps its working UI); a later cleanup can switch it.

## Splendor online design

**Seats and order.** Seat uids sorted, then shuffled with the seeded generator (after the deck and noble shuffles). Seat index 0 starts. This keeps Splendor's existing round logic (`endTurn` treats `cur === 0` as a new round).

**Determinism.** `newGame` shuffles with `Math.random`. In online mode it must use the room's seed: thread an optional `rng` through `shuffle()`/`newGame()` (default `Math.random` so local play is unchanged), using the same mulberry32 generator as Codex online.

**One move record per turn.** A player's turn is an action plus any token returns plus any noble choice. Each record in the player's `moves` list:
```
{ a: <action as in applyMove: {t:'take',gems:[...]} | {t:'take2',c} | {t:'reserve',lv,i} | {t:'reserveDeck',lv} | {t:'buy',lv,i} | {t:'buyR',i} | {t:'pass'}>,
  ret: {w,u,g,r,k,o} | null,      // tokens returned when over 10
  noble: <noble id> | null }      // chosen noble when more than one is eligible; auto when exactly one
```
**Replay and validation** (every client, in seat order):
1. The action must be in `legalMoves(state, seat)` (compare by value). `{t:'pass'}` only when no legal moves exist.
2. Apply it. If the player now holds more than 10 tokens, `ret` must return exactly the excess using tokens they hold; otherwise `ret` must be null or all zero.
3. If more than one noble is eligible, `noble` must be one of them; if exactly one, it is claimed automatically (ignore `noble`); if none, it must be null.
4. `endTurn`. Illegal records are skipped and logged ("A move from X broke the rules and was ignored"), exactly like Codex.
Game over when `endTurn` sets `over`. Results via the existing `standings()`.

**Committing.** The player composes the turn locally (existing take/buy/reserve UI, then the existing discard dialog and noble picker when needed). The record is written with `writeMine` when the turn is complete (no undo is needed; Splendor actions are confirmed in-dialog today). Show "Sending…" while pending.

**Turn summary** in every write: `turn:{phase:'play'|'over', next:<uid of next player or null>}` computed from the replay.

**Remote moves** animate with the existing bot flight animations: when a new record arrives for another seat, run it through the same animated apply path used for bots (capture rects, apply, play flights) instead of re-rendering instantly. Sounds as for bots (volume 0.6). Chime and `HubKit.setBadge(true)` when the turn passes to you after a remote update (never on first load).

**Screens.**
- Setup screen gets an "Online" section with "Create online game" and "Join with a code" (via HubLobby). `?room=CODE` opens straight into the room (join is idempotent).
- In online mode: no bots, no pass-and-play handoff, no local save (`gemguild-game-v1` is untouched), Bot speed hidden in the menu, "New game" in the menu becomes "Leave game" (returns to the setup screen; the room stays in the hub's Online list).
- Viewer is the local seat: your reserved cards are visible to you, others' face-down reservations show as backs (the data is technically in the seed; accepted).
- Scorecard for everyone at the end; `HubKit.recordResult('gems', uid+':'+code, {won, score})`.

**Rules.** No rule changes needed: player docs already allow `{moves, turn}` with any list items; `game` is a free string ('gems').

## Tests (builder, against the emulator)

- 2- and 3-player online games played to the final scorecard with identical results on every client, including a forced over-10 return and a two-noble choice.
- Illegal injected record is skipped on every client.
- Join by code and by link, reload mid-game, not-seated screen, host start with 2 of 3, leave while open.
- Local play unchanged: a full all-bot game with fast timers, pass-and-play handoff, `#continue` from the hub, no console errors at phone and desktop sizes.
- HubLobby works standalone in shared/demo-lobby.html (create, join, waiting room) against the emulator.

## Amendments after review (override everything above)

P0
1. Canonical moves: sort `take.gems` by COLORS index before writing. Match a record against `legalMoves` with a canonical key (`t|lv|i|c|gems.join('')`), then apply the matched engine move object, never the record's own object.
2. Validate a whole record atomically: an illegal `ret` or `noble` discards the action too. If validating on `cloneState()`, preserve the log (cloneState empties it).
3. Seat types: remote seats `type:'remote'`, local seat `'human'`, `level:null` (UI-only; identical-results tests compare engine fields only). In online mode `scheduleBot`/`botTurn` return immediately. `kindLabel` shows "Online"/"You"; Bot speed hidden; the bar says "Waiting for X" instead of "is thinking…".
4. Never touch local storage online: no `saveGame()`, no `forget(SAVE_KEY)`, no rematch. Online over/confirm dialogs get their own buttons: "See the board" and "Leave game". Leave = unsubscribe watch, reset title and badge, `history.replaceState` away `?room`, `G=null`, back to setup. Skip the hot-reload snapshot online. `start()` checks `?room=` before `#continue`.
5. While the player is drafting a turn (discard or noble dialog open, or a gem selection in progress), defer rebuilds and keep only the latest snapshot; apply it when the draft is committed or cancelled.
6. Replay into a new state and swap `G` only if the applied-record count or an engine fingerprint (state minus log) differs, so the player's own sounds aren't cut off by the local snapshot after setDoc. `console.warn` on an unexpected mismatch.
7. Own moves list = the longer of the server copy and a local overlay (Codex `mineDoc` pattern, codex/index.html ~1289). On permission-denied, drop the overlay and rebuild.

P1
8. RNG order: copy Codex's `rng`/`sshuffle`. `uids = Object.keys(seats).sort()` (default sort); `newGame(placeholders, r)` (decks 1,2,3 then nobles, using r); `order = sshuffle(uids, r)`; assign uid/name to `players[i]` in that order; seat 0 starts. Replaces the generic first-player rule. Use Codex `nameAt` for duplicate names.
9. `ret`: keys TOKENS only, integers ≥ 0, gold allowed, each ≤ held after the action, sum exactly `tokenCount - 10`; null/zeros when not over 10. Order: action → ret → noble → endTurn. Nobles are checked after every action including take and pass.
10. Replay writes the same log entries as the UI (describe/logTags, returns "returned N tokens (…)" in TOKENS order, noble visit, "Final round", "broke the rules"). Refactor `addLog` to `addLog(s, …)`.
11. Accepted leaks (document in code comments): after reserveDeck the player sees the hidden card before committing and could reload to redo; an unsent turn is lost on reload while offline.
12. Remote moves: do not call perform/visit/finishTurn/botDiscard. Use `withFx(pi, () => { G = next; ui.lastMove = …; ui.fresh = …; render(); })` with render inside. Sounds: `moveSounds(pi, rec.a, {gold})`, returnSound, noble chime + score. Animate only when exactly one new record arrived and it is a remote seat's; otherwise swap silently. Your-turn chime/badge/title and over sound only on transitions, never on first load.
13. `HubLobby.enter(code, {game, onPlay})`: lookup, then redirect to `../<game>/?room=` if the code is another game's; missing-code error; notSeated when playing and unseated; join + waiting room when open; straight to play when playing and seated.
14. HubLobby takes `seatOptions` and `minToStart` (Catan will use 3–4; Pictionary up to 8 after platform v2). The host gets "Close" (room stays open; the hub can remove it).
15. Mount HubLobby on `document.body`, its own CSS variables (light/dark), z-index 4900, its own name field when the profile name is empty (Codex `needName` pattern ~1205). Guard HubKit profile/setBadge/recordResult calls (the stub lacks them).

P2
16. On first load of a playing room, each seated client writes its own doc if missing: `{moves:[], turn:{phase:'play', next:<seat0 uid>}}` so the hub shows the right status.
17. Stats: `won` = my standings row `.winner` (shared win counts); `score` = my points. Record whenever `G.over` is observed, including on load (recordResult is idempotent).
18. sw.js: bump to `gh-v3` and precache `shared/lobby.js`. Splendor loads `firebase-config.js`, `online.js`, `lobby.js`; the Online section is hidden when `!HubOnline.available()`.
