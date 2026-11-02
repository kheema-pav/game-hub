# Validation and delivery

## Implemented

- Host cancellation/end, advisory presence, guest replacement rooms and terminal-state enforcement.
- Homepage create/join controls, explicit play modes and preserved Continue links.
- Existing games split into shipped styles/rules/UI files, with version checks and complete-release offline caching.
- Four new games using the shared local/online shell: Four in a Row, Ludo, Azul, Ticket to Ride USA Classic and Europe Classic.
- Reviewed plans and follow-up fixes, including rejected optimistic-write rollback, preservation of newer confirmed history, conflicting-tab recovery, save compatibility and Pictionary setup edits preserving saves.

## Checks completed locally

- 162 dependency-free tests pass, including full bot games, conservation/scoring fixtures, all-game authored online replay, actual shipped-script startup/action tests in a mocked DOM, mode/resume/privacy, lifecycle permissions, save separation and offline-cache fixtures.
- Existing Catan engine suite: 49 pass, zero fail; 8,067 malformed/stale records checked.
- Shipped JavaScript parses; every local HTML dependency exists; git whitespace checks pass.

Command:

```
node --test test/*.test.js shared/test/*.test.js isles/test/entry-modes.test.js sketch/test/*.test.js connect4/test/*.test.js ludo/test/*.test.js azul/*.test.js ticket/test/*.test.js
node isles/test/engine.test.js
```

## Checks not yet completed

Firestore emulator permission tests require Java 21. Real Chromium phone/laptop smoke tests and screenshot capture are configured alongside them in `.github/workflows/checks.yml`, but have not run here. Local server binding and browser file navigation were unavailable in this session. No claim is made that mocked-DOM checks validate visual layout or actual multi-device transport.

## Publication and deployment

GitHub collaborator write access is confirmed. The attempted GitHub tree write was blocked by this session's approval policy, so no branch/PR/static deployment or Firestore-rules deployment was published. The complete work is committed locally on `improve-game-night`; an apply-ready patch is in `artifacts/game-hub-changes.patch`.

Publish the updated Firebase rules before deploying the static client. This repository adds `gameVersion`, recovery metadata, a presence collection and the fixed Ticket edition option. Old v1 rooms remain supported, but older clients cannot be forcibly upgraded. Close all hub tabs and reopen after a release to activate the complete next offline cache.
