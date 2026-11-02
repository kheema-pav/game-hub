# Game Hub: reliability, onboarding and maintainability

Base: main, b5db5f44fe19d544dd14d061ce3711af26cf3e05. Scope: review steps 2, 3 and 5. The later new-game request is covered by the separately reviewed docs/new-games-plan.md.

## Proposed implementation

1. Room lifecycle and recovery
- Add explicit host cancellation/end operations with server-validated transitions. Never delete rooms or silently reset an existing game's move history.
- Track seated-player presence in a separate collection, using server timestamps and throttled heartbeats only while an active room is visible. Distinguish disconnected/away/unknown from having left.
- Add a shared in-game room panel with named player status, host-confirmed end/cancel, and a rematch that creates a fresh room with the same settings and share link. Every game must stop accepting moves when a room ends.
- Keep local saves untouched. A non-host cannot cancel/end another person's room. No automatic skipping or bot substitution, which would alter rules and replay consistency.

2. Discoverable play modes
- Put Create online game / Join a game above the shelf. Keep the shelf design, update badges and copy, and support direct Solo, Same device and Online entry intents in every game.
- Mode links must actually select a valid setup rather than just change labels. Pictionary offers Same device and Online only. Unsupported/missing online config must degrade clearly.
- Resume links and existing room invitations keep priority over mode intents. Keyboard, focus, narrow layouts and local play remain functional.

3. Maintainable files and compatibility
- Extract each game's inline CSS and executable JS into local files in the same folder, then split natural game rules/replay boundaries where safe. Retain classic script execution order and globals; avoid a framework/build-system migration.
- Update source-extracting Catan test helpers and service-worker precache for new assets. Verify no code or styles are lost.
- Add a central game/protocol version registry to newly created rooms, with explicit incompatible-version UI before joining/replay. Decide legacy-room support explicitly; do not claim old clients can be forcibly upgraded.
- Avoid mixed cached releases: version cache and document a reproducible asset/version update process.

4. Validation and delivery
- Add focused lifecycle/compatibility tests, extend Firebase rules tests, run existing Catan engine tests and parse all shipped scripts. Exercise local and online UI transitions with isolated tests where available.
- Review the complete diff after parallel work, fix integration issues, then push a feature branch and open a PR if access permits. Do not claim Firebase rules are deployed merely because code is pushed.
- Current GitHub connector reports read-only access and local CLI authentication is unavailable. Complete the build and review regardless; try authorized available publication paths, and state any concrete blocker accurately.

## Plan review
Independent review completed before implementation. Review focus: presence cost and false disconnects; terminal-state enforcement; host loss; rematch races; legacy rooms; offline cache consistency; preservation of all save keys and local game behavior.

## Review corrections accepted
- Terminal states are `cancelled` (was open) and `ended` (was playing), host-only, irreversible. Check every entry/replay path, including Codex's custom lobby; never reopen a terminal room's lobby.
- Any seated player can create a separate replacement room when the host is unavailable. This preserves original history and requires sharing a new invitation. Do not automatically migrate others.
- Presence is advisory: 60-second visible-room heartbeat; stale after 150 seconds; unknown/away are not forfeits. Never write presence from hub watchers. Closing a tab does not write an offline marker that could override another active tab with the same identity.
- Shared session API: `HubSession.mount({code,onExit,onRestart})` returns `{update(snapshot),close()}`. Games call update before replay; false blocks terminal/incompatible room replay. It calls `HubOnline.rooms.trackPresence(code)` and stops on close/terminal. Session owns its own Room button/panel; it does not attach another room watcher.
- Shared online API: `rooms.end(code)`, `rooms.replacement(code) -> {code}`, `rooms.trackPresence(code) -> stop`, `rooms.compatibility(room) -> {ok,message}`. `watch` snapshots include `presence`; lookup includes version fields. `end` chooses cancelled/ended from server state. replacement requires current identity seated and uses fresh creation.
- Central registry `shared/versions.js` defines `HubGameVersions = {platform:2,games:{codex:1,isles:1,gems:1,sketch:1}}`. New room `v:2` and `gameVersion:1`. Existing v1 rooms are deliberately accepted, with lifecycle/presence relying on updated rules, and deterministic engine behaviour unchanged. Future unsupported versions block before join/replay. Old clients cannot be forcibly upgraded; document that limitation.
- Mode query contract `?mode=solo`, `?mode=local`, `?mode=online`. Room invitations and existing #continue take precedence. Pictionary has no Solo. Direct Online opens create/join; absent configuration shows clear unavailable message with local setup usable.
- Refactor uses separate style.css, engine.js and game.js files per game. Extract the existing engine boundary only where safe; preserve script order and globals. Update Catan helpers to read shipped files. Shared session script loads before game.js.
- Service worker must precache every extracted/shared asset with exact cache lookup and fail installation if core assets cannot load. Do not activate a partial release. Document deployment order: publish Firestore rules before using lifecycle features; unsupported writes display actionable errors. No cloud rules deployment is assumed.
- Independent plan review completed; builders may proceed with these amendments.
