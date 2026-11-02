Adds Reversi and Yahtzee, four bot difficulty levels, and local game-night conveniences.

Reversi includes legal flip previews, automatic passes and correct endgame scoring. Yahtzee includes held dice, score previews with explicit confirmation, all thirteen categories, upper bonuses and repeat-Yahtzee/Joker rules. Both support solo, same-device and existing online rooms, saves and offline caching.

All nine bot games offer Easy, Normal, Hard and Expert. Connect 4 and Splendor retain their previous Hard behavior. Other bots gain game-specific planning, with stronger profiles evaluated against lower levels in paired-seat samples. Bots do not use future randomness or opponents' hidden cards. Levels are practical presets, not calibrated ratings; luck still affects outcomes.

The hub surfaces unfinished saved tables and the last 50 completed local results. Rematches retain players and settings; abandoned games do not count as completed results. Results are browser-local, exclude hands/moves, deduplicate across reloads and can be cleared without deleting active saves. Existing saves remain compatible, including Splendor's internal `medium` level. Online room history and protocol remain unchanged.

Validation:
- 281 dependency-free tests passed across game engines, legal replay, hidden-information independence, storage, rematches, hub integration and offline releases.
- 49 existing Catan checks passed, including 8,067 injected invalid/stale records.
- Complete games cover every bot level and supported player counts, with both Ticket/Catan editions.
- Independent engine reviews completed for new games and original-game bot changes.
- Browser CI now checks all ten game entries, six shared-shell games at phone/laptop widths, held dice, score confirmation, save replacement, rematches and history. Browser/Firestore execution remains pending CI: this local environment rejects server binding with EPERM.
- `git diff --check` and script parsing passed.

Service-worker release is gh-v9. No new Firebase rule publication is needed; the new games use the existing platform-v2 schema. Review CI and new-game screenshots before merging.
