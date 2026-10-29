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
