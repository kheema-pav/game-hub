# Online play, phase 2: platform v2, Catan, Pictionary

Status: draft for review. Builds on docs/online-plan.md (and its amendments) and the Codex/Splendor online modes.

## A. Platform v2 (shared, done first; one rules update for the owner to publish once)

### A1. Room options
Games need settings fixed at creation (Catan mode and target, Pictionary timer and rounds).
- `rooms/{code}` may include `opts`: a map with at most 8 keys, values string/int/bool only. Set at create, never changed.
- `HubOnline.rooms.create({game, maxSeats, opts})`; `watch()` and `lookup()` return `room.opts`.

### A2. Bigger rooms
- `maxSeats` limit becomes 2..8 in the rules (games enforce their own limits in the UI: Codex/Splendor/Catan 2–4, Pictionary 2–8).

### A3. Drawing channel (Pictionary)
- New subcollection `rooms/{code}/draw/{docId}` where `docId` = `<uid>_<n>` (n = an integer the game chooses, e.g. the turn number).
- Rules: read by signed-in users; create/update only by a seated member of a `playing` room, only when `docId` starts with their own uid followed by `_`; body keys only `strokes` (list) and `w`/`h` (ints); size naturally capped by the 1 MiB document limit (the game keeps each doc well under 200 KB).
- `HubOnline.draw.write(code, n, {strokes, w, h})` (own doc; serialised and coalesced like writeMine, at most one write in flight, newest wins) and `HubOnline.draw.watch(code, docId, cb)`.

### A4. Ordered actions across players (general mechanism)
Every move record may carry `k`: the global action step at which it applies (0-based count of actions applied so far in the replay). Games with interrupts (Catan) use it; games with strict single-actor turns may ignore it.
Replay rule for games that use `k`: at step k, gather each player's next unconsumed record. A record is a candidate only if its player is allowed to act at this step (game-defined) and `rec.k === k`. Records with `rec.k < k` are stale and skipped (logged). If several candidates exist, the game's fixed priority picks one; the others become stale. If none, the game waits.
Full replay from scratch on every update keeps every replica convergent even after a rare race.

### A5. Tests
Extend `firebase/test/rules.test.js`: opts accepted at create (valid map, ≤ 8 keys, simple values), rejected when changed later or oversized; maxSeats 8 ok, 9 rejected; draw docs: own-prefixed id ok for a member of a playing room, someone else's prefix rejected, non-member rejected, wrong keys rejected. All existing tests still pass.

## B. Catan online

### B1. Determinism
- All engine randomness goes through an injectable generator: `Engine.setRng(fn)` (default `Math.random`). Replace `Math.random` in `shuffle`, `placePorts`, `genSeafarers` template/flip, `doRoll` dice, and `doSteal`. Bot code keeps `Math.random` (bots are not used online).
- Online: `setRng(mulberry32(seed))` before `newGame`, and the same generator continues through the replay, so board, ports, dev deck, dice and steals are identical everywhere as long as actions are replayed in the same order (A4 guarantees that).
- Accepted for friends: anyone digging in devtools could predict dice and cards from the seed.

### B2. Room and seats
- Room `opts`: `{mode:'base'|'seafarers', target:int, friendly:bool}`. Seats 2–4, no bots.
- Seat order: uids sorted, then shuffled with the seeded generator before `newGame`; names and colours from the seat snapshots (colours: use the profile colour unless two players share one; then fall back to Catan's default palette for the later seat).

### B3. Action records
`{k, a, args}` with `a` from a whitelist that maps to engine calls:
`setupSettlement(v)`, `setupEdge(e, kind)`, `roll()`, `discard(cards)`, `moveRobber(hex)`, `steal(target)`, `gold(picks)`, `build(kind, id)`, `endFreeRoads()`, `buyDev()`, `playDev(type, args)`, `bankTrade(give, get)`, `offer(to, give, get)`, `respond(accept)`, `withdrawOffer()` (new engine function: offerer cancels while phase is 'offer'; phase returns to 'main'), `moveShip(from, to)`, `endTurn()`.
- Instant player-to-player `doTrade` is not used online; trades between people always go through `offer` and `respond`.
- Who may act at step k: `actor(s)`; additionally, during phase 'offer', the offerer may submit `withdrawOffer`. Priority when both exist at the same k: the responder.
- A record is valid when the engine call returns ok. Invalid or stale records are skipped and logged.

### B4. Interface
- New-game screen gets "Play online" (create with mode/target/friendly options and 2–4 seats, or join with a code) via `HubLobby`.
- In online mode: the local player is the viewer; hands of others hidden as today; the pass-and-play curtain, "Hide hands" and bot settings are off; "Confirm moves" stays as a local preference.
- When `actor(s)` is the local player, show the matching controls even when it is not their turn (discard, gold, respond to an offer). Otherwise show "Waiting for X to roll / discard / respond…".
- Trade: choose a player, compose the offer, send. The receiver gets a sheet with Accept / Decline and the cards. The offerer sees "Waiting for X" and Withdraw.
- Remote actions animate through the existing fx pipeline; only fx from records not yet seen on this device are played (track the count of applied records; clear older fx).
- Chime, tab title and menu badge when the actor becomes the local player after a remote update.
- No local save writes in online mode (`sti.save.v1` untouched). Stats on game end.
- Turn summary for the hub: `next` = uid of `actor(s)`, phase 'setup' during the initial placement, 'play', 'over'.

### B5. Tests (builder, emulator)
- A full 3-player online game (base mode) and a 2-player seafarers game, driven by scripted legal actions from each player's own browser context, to a winner, with identical final state on every replica (compare a hash of the state JSON).
- Rolling a 7 with two players over 7 cards: both discard in queue order from their own devices.
- Offer accepted, offer declined, offer withdrawn; a race where withdraw and respond carry the same k resolves to the responder on every replica.
- Invalid injected records skipped everywhere. Reload mid-game resumes. Local Catan (bots, pass-and-play, #continue) unchanged.

## C. Pictionary online (draw on your own phone)

### C1. Modes
- Keep "One phone" exactly as today. Add "Online": each player on their own phone. Players are individuals (2–8), not teams.

### C2. Rules of play online
- Room `opts`: `{secs: 45|60|90, rounds: 1|2|3}`. Each player draws `rounds` times, in seat order (uids sorted, then seeded shuffle).
- Word for turn t: from the seeded word list (same list as today), skipping words already used; the drawer may skip once per turn (next seeded word).
- The drawer sees the word and a canvas; everyone else sees the live drawing and a guess box.
- First correct guess (case-insensitive, trimmed, ignoring punctuation and a leading "a "/"the ") scores 2 for the guesser and 1 for the drawer. The turn ends at the first correct guess or when time runs out.

### C3. Authority and records
- The drawer's device is the authority for its turn. Records in the drawer's own list: `start{t, word index}` (t = drawer's Date.now()), `skip{}`, `correct{uid}`, `end{reason:'guessed'|'time'}`.
- Guessers write `guess{t, turn, text}` records to their own lists. The drawer's client watches guesses for the current turn and writes `correct` for the first matching one it sees, then `end`.
- Everyone displays the countdown from the drawer's `start.t` (clock skew between phones is acceptable).
- If the drawer leaves mid-turn, the game waits; a later phase may add a timeout.

### C4. Drawing sync
- Strokes are captured on a canvas as points normalised to 0–1000 in each axis, with colour/width per stroke, encoded compactly (e.g. `"c3w2:12,45;13,47;..."`).
- The drawer writes `draw/<uid>_<turn>` every 250 ms while drawing (coalesced; only one write in flight), plus a final write at the end. Viewers render incrementally.
- Tools: pen (3 sizes, 6 colours), eraser, clear (a clear is a stroke marker so viewers replay it), undo last stroke.

### C5. Interface
- Online lobby via `HubLobby` (opts: timer and rounds), names from profiles.
- Turn screen for the drawer: word, timer, canvas with tools, skip (once), "Waiting for guesses" feed.
- Turn screen for guessers: canvas (view only), timer, guess input (on phones the input sits above the keyboard and the canvas stays visible), feed of guesses (wrong guesses visible to all; the correct one shows as "Sam guessed it!").
- Scores between turns; final scorecard; stats.
- Sounds: tick in the last 10 seconds, buzzer, score.

### C6. Tests (builder, emulator)
- 3-player online game, 1 round each, with scripted drawing (synthetic pointer events) and guesses; scores identical everywhere; a correct guess ends the turn on every device; time-out path; skip; reload mid-game; One-phone mode unchanged.
- Draw doc size stays under 200 KB for a 90-second dense drawing.
