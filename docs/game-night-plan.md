# Four bot levels and local game nights

## Scope

- Nine bot games offer Easy, Normal (existing Splendor Medium), Hard and Expert. Pictionary remains a human drawing game.
- Preserve Connect 4 and Splendor Hard. Add bounded stronger Expert strategies, with meaningful strategic differences in the other bots.
- Bots use legal moves and permitted information. No future dice, deck order, opponent private cards or ticket peeking.
- Local/same-device rematches retain players and game settings. Resume identifies the saved table. Hub lists the latest 50 completed local games, with scores, winners, difficulty and date. Online room lifecycle remains unchanged.

## Review of risks before implementation

- Labels alone are insufficient: add tactical fixtures and full-game runs; report strategy changes without promising a universal win rate.
- Search must stay bounded on phones. Benchmark decisions; avoid replaying unknown random futures.
- Preserve existing saves and online rule versions. UI metadata stays outside online replay.
- Record completed results once, including ties and game-specific tie breakers. Abandoning or restarting is not a win.
- Rematch must use the finished game's players/settings, including after resume, rather than stale setup preferences.
- Local storage can be disabled/full/corrupt. Gameplay must continue; never claim a failed write succeeded. Clear results without clearing active saves.
- Fixed viewport layouts must remain intact. Add history to the hub and compact setup metadata, not the playing boards.

## Validation

Engine tactical tests, pure input/hidden-information checks, complete four-level games, targeted lifecycle and storage tests, existing Node suites, then CI browser and Firestore suites. Browser automation covers four-level setup, save replacement confirmation, rematch settings, history deduplication and hub resume/history display.

## Added scope

The user selected Reversi and Yahtzee during implementation. Both are included with four bot levels, solo/local/online play, shared save/rematch/history integration, legal-action tests and complete replay checks.

## Follow-up ideas (not part of this change)

Carcassonne remains a larger future addition. Future UX priorities: optional move hints/explanations, a short guided first game and explicit accessibility checks on a real phone.
