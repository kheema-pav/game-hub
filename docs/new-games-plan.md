# New games implementation and acceptance

Build Four in a Row (`connect4`, 2 players), Ludo (`ludo`, 2-4), Azul (`azul`, 2-4), and Ticket to Ride (`ticket`, USA 2-5 and Europe 2-5). The user requested two or three Ticket editions; this release selects USA and Europe, including their distinct rules. Use original board rendering and code; if reusing any source, preserve its verified licence and notices. No copied publisher artwork.

## Shared runner contract

Root owns shared/tabletop.js and shared/tabletop.css, registry/opts/hub/SW integration. Per-game builders own only their new folder and its tests. Each folder index.html loads ../shared/firebase-config.js, ../shared/hubkit.js, ../shared/versions.js, ../shared/online.js, ../shared/lobby.js, ../shared/session.js, engine.js, ../shared/tabletop-core.js, ../shared/tabletop.js, game.js (classic scripts in this order); styles shared/tabletop.css then style.css.

Engine `window.HubEngines[id]` API (also CommonJS exports for tests):
- `create({seed,players,options}) -> JSON state`; players array objects {name,color,bot}, options flat room settings. All random choices use a seeded generator stored in state. Do not mutate supplied players/options.
- `actor(state) -> index`; `legal(state,player) -> serialisable action array`, empty for wrong actor or over. Include all actions the human can choose.
- `apply(state,player,action) -> {ok,state,error?}`; success returns a NEW state, failure leaves input unchanged. Validate actions; never trust authorship/indices or mutable client values. No Math.random or current time in engine.
- State has `over` boolean and `winner` index or null (ties allowed via winners array). Optional `scores` array. `result(state)` optional returns text. Engines must handle a full bot-driven game to completion.
- `bot(state,player,level) -> action` chooses a legal action, level easy/normal/hard. Deterministic tie breaks okay; no hidden information access beyond player view where practical.

Each game calls `HubTabletop.mount({id,title,minPlayers,maxPlayers,engine,options,render,describe,score})` in game.js:
- options array {key,label,values:[{value,label}]} supports `edition:usa|europe` for Ticket.
- `render(state,viewer,actions,context) -> HTML`; escape all player names. actions is legal actions for current local viewer (empty while waiting). Use `<button data-move="INDEX">` to submit the matching action. context has `esc`, `names`, `online`, `draft`, `setDraft` optional (draft helpers can be added root if needed).
- `describe(action,state) -> short label` and optional `score(state,index)`. Renderer includes board, own hand and action controls; hide private information of other players. Purely decorative context may include no actions for watchers.
- Build a usable mobile board and clear action prompts. Avoid dumping hundreds of ungrouped action buttons. For complex selection use staged engine phases or runner data-choice hooks agreed with root.

## Shared runner behavior

Setup offers Solo vs bots, Same device, Online, player count/name/bot level, edition. mode query and room/resume precedence match existing games. Save under `hub.<id>.save.v1`; local resume only on explicit Continue; do not overwrite in online mode. Pass-device curtain protects private hands. Shared menu and session panel. Online uses seeded seat order and append-only authored {k,action} records, replay validates current actor and legal action, rejects invalid/stale records; version checks and terminal guard before replay/write. Games with sequential subphases keep a single actor at a time. Optimistic writes are serialized and never lose acknowledged history. No automatic bot/host substitution online.

## Acceptance

Engine tests cover legal/illegal actions, seeded repeatability, no mutation on reject, game-specific scoring/end conditions and complete bot games. Runner tests cover replay author validation, online/local save separation, mode/resume precedence, terminal blocking. New games must be registered in hub, versions, room options rules, and exact offline precache. CI must run all new tests. Independent review and fix holes before final push. Firebase rules deployment remains a prerequisite to running the new clients online.

## Independent review corrections accepted

- Ticket editions must contain their complete route/ticket datasets and edition rules, not abbreviated maps. Verify USA card-draw/market rules, ticket minimums, double routes, longest trail and final turn; Europe long/short initial tickets, ferries, tunnels, stations, unused-station bonus and tie-breaks. Source references and dataset counts go in ticket/README.md.
- Azul implements the complete normal coloured-wall base game, including 100-tile conservation, factory counts, exact wall/floor/end bonuses, round-end trigger and row tie-breaks. The optional grey-wall variant is out of scope.
- Ludo explicitly documents house rules; no blockades, extra turns only for six, third six forfeits, six to enter, exact finish, listed safe squares.
- Complex actions use engine-staged single-actor phases. Renderer may also use `data-choice="key" data-value="value"` controls to set a local string draft filter. Runner updates `context.draft` and rerenders without changing game state or writing a move. This is for grouping/filtering routes/cards; moves still use current legal-action indices. No other ad hoc renderer callbacks.
- Runner must preserve acknowledged move prefixes, validate saved game identity/version/options/player kinds, enforce per-game player counts before replay, force all online seats human and handle `winners[]` ties. No automatic stats until an explicit unique game result can be recorded safely.
- Cache every new asset/data file; report any unrun browser/multi-device acceptance separately. Independent review complete; implementation may proceed.
