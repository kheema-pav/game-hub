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

## Amendments after review (override everything above)

### R1. Replay rule (replaces A4)
```
loop: allowed = allowedAt(s)   // [{p, acts}]; offer phase: responder(respond) + offerer(withdrawOffer only)
  for each allowed p: j = first index >= ptr[p] with rec.k === k && acts.includes(rec.a)
  no candidate -> wait
  pick by priority; ptr[p] = j+1   (records skipped over are stale; log them)
  r = apply(s, p, rec); if r.ok k++   // invalid: k unchanged, loop again
```
- k counts applied records only. Each client computes k from a local replay that includes its own local unsent records (`myMoves`), not just the snapshot.
- When one of your own records turns out stale, toast e.g. "Too late: Sam accepted your trade."
- fx dedupe by record identity (player, index), not by a count.

### R2. Pictionary drawing = append-only chunk docs (replaces A3/C4 transport)
- Docs `rooms/{code}/draw/{uid}_{turn}_{seq}` with body `{t, i, d}`: `t` turn, `i` seq, `d` encoded new points plus `x` (clear) and `u` (undo) markers. Create a chunk every ~800 ms while drawing (never update), flush at turn end.
- Viewers query `where('t','==',turn)`, keep ids starting with the drawer's uid, sort by `i`, animate each chunk's points over the interval.
- API: `HubOnline.draw.add(code, t, i, d)` (queued in order, no coalescing) and `HubOnline.draw.watch(code, drawerUid, t, cb)`.
- Drawer reload: rebuild canvas from own chunks, continue from max(i)+1.

### R3. Catan action safety
- Never spread record args into engine calls. Map each action explicitly (e.g. `roll → E.doRoll(G)` with no args; discard/gold player = the record's author seat).
- Sanitize before the engine: ids `Number.isInteger`; kinds from fixed lists (setupEdge road|ship; build road|ship|settlement|city); card maps only resource keys with integers 0..19; `to` integer 0..n−1 and not the offerer (also add this check inside `doOffer`); `plenty` two resources, `mono` one. Wrap each apply in try/catch.
- Invariant: failure paths never consume the generator (holds today; keep it for withdrawOffer and the sanitizer).
- Cap offers at 5 per turn.

### R4. Catan online UI rules
- Undo disabled online; `rematch` and the instant player trade (`do-ptrade` → doTrade) removed online.
- The UI never changes G directly online: sanitize → append to `myMoves` → full replay → write.
- Generator state lives in the game state as `s.rng` (uint32 mulberry32, same as Codex `rng()`); `newGame(opts)` takes `opts.seed`, falling back to Math.random without one. No global setRng. Seat order: shuffle(sorted uids) with the same generator first, then newGame.
- `placePorts`: sort by `(Math.round(angA*1e9) - Math.round(angB*1e9)) || a.id - b.id` so Safari and Chrome agree. Test: 1,000 seeds × both modes, board hash equal in Playwright chromium and webkit.
- Profile colours (hex) map to the nearest Catan colour id; on a clash the later seat gets the first unused colour.
- Everything using `actor`, `G.current` (renderDock, tradeModal) or `viewer()` for "me" uses `ui.seat` instead. The offerer's dock shows "Waiting for X… / Withdraw".
- `withdrawOffer` valid only in phase 'offer' from `offer.from`; sets offer=null, phase='main', logs it.
- Check `?room` before `loadSave`. Discards stay sequential ("Waiting for X to discard"). Offline blockers stall the game; show who is blocking.
- Responder priority can rewrite history (an Accept committed after a Withdraw still wins); documented, with the toast from R1.

### R5. Pictionary details
- Records: `{a:'start',turn,at}`, `{a:'skip',turn}`, `{a:'correct',turn,uid,gi}`, `{a:'end',turn,why}`, `{a:'guess',turn,at,text}` (text ≤ 40).
- Only records from `order[turn % n]` count as drawer records for a turn. Every client checks that `correct` points to a real matching guess. The word comes from a seeded shuffled deck with a pointer advanced on each start and skip.
- Guesses that match the word are hidden in the feed immediately; never put the word in the DOM or logs for guessers.
- Matching: NFD, strip accents, lower-case, drop a leading `a|an|the`, remove every non-`[a-z0-9]` character.
- Timer shows `clamp(at + secs*1000 - now, 0, secs)`. The drawer ignores guesses first seen after its deadline + 1 s; after a reload it picks the matching guess with the smallest `at`. A skip keeps the clock running and adds a clear marker.

### R6. Platform changes
- `online.js`: create() accepts 2..8 seats and `opts`; lookup() and watch() return `opts`; the draw API from R2.
- HubLobby (built with Splendor) needs an `opts` pass-through and 2–8 seats; do that after the Splendor builder finishes.
- Rules: whitelist opts and add the draw collection:
```
function optsOk(o) { return o is map && o.size() <= 8
  && o.keys().hasOnly(['mode','target','friendly','secs','rounds'])
  && o.get('mode','base') in ['base','seafarers']
  && o.get('target',10) is int && o.get('target',10) >= 5 && o.get('target',10) <= 20
  && o.get('friendly',false) is bool
  && o.get('secs',60) is int && o.get('secs',60) in [45,60,90]
  && o.get('rounds',1) is int && o.get('rounds',1) in [1,2,3]; }
// rooms create: keys add 'opts'; && (!('opts' in n()) || optsOk(n().opts)); maxSeats 2..8
match /draw/{docId} {
  function inRoom() { let r = room(code); return signedIn() && r.status == 'playing' && me() in r.seats; }
  function chunkOk() { let x = request.resource.data;
    return x.keys().hasOnly(['t','i','d']) && x.t is int && x.t >= 0 && x.t < 100
      && x.i is int && x.i >= 0 && x.i < 100000 && x.d is string && x.d.size() <= 40000
      && docId == me() + '_' + string(x.t) + '_' + string(x.i); }
  allow read: if signedIn();
  allow create: if inRoom() && chunkOk();
  allow update: if inRoom() && chunkOk() && request.resource.data == resource.data;
  allow delete: if false;
}
```
(If `string()` misbehaves in the emulator, use `docId.matches(me() + '_[0-9]+_[0-9]+')` plus the t/i checks.) Update the existing maxSeats test (5 → 9 as the rejected value). New tests: opts valid/invalid/oversized/changed-later; draw: own prefix ok, other prefix fails, mismatched id fails, non-member fails, open room fails, 40,001-char d fails, identical re-send ok, changed re-send fails.

### R7. Build order
1. Platform builder now: rules + tests, online.js (opts, 8 seats, draw API). Not sw.js and not lobby.js (owned by the Splendor builder). Owner publishes the rules once.
2. Catan engine builder now, in parallel: state-held generator, sanitizer, withdrawOffer, `to` check, atan2 tie-break, a pure `replayCatan(seed, uids, opts, lists)` tested in Node (deadlock scenario, race, injected records) plus chromium/webkit board hashes. Local regression must pass.
3. After 1, 2 and the Splendor builder: HubLobby opts/8 seats, then Catan online UI and Pictionary online in parallel.
