# Suggested additions

Research only; no third-party game code has been imported.

## 1. Four in a Row: easiest social addition

Source: https://github.com/kenrick95/c4
Licence: MIT, verified in https://github.com/kenrick95/c4/blob/master/LICENSE

The TypeScript project already has a rules engine, computer opponent, Canvas browser interface, local two-player mode and tests. Its engine is separately packaged as @kenrick95/c4. Compile the reusable code once, build a HubKit screen, and connect human moves to HubOnline. Its existing online mode uses a separate server and cannot be dropped into this Firebase setup unchanged. Open-information play avoids hidden-card handling. Expected effort: low to medium.

## 2. Azul: richer tabletop fit

Source: https://github.com/RemiFabre/ludometer/tree/main/web/player
Licence: MIT, verified in https://github.com/RemiFabre/ludometer/blob/main/LICENSE

The project contains a framework-free JavaScript browser player, deterministic two-player rules and browser AI. Its README describes its own artwork and MIT-licensed model weights. It is explicitly alpha software. Reuse the rules and possibly the board UI; add local and HubOnline adapters. The strongest bot carries large neural model/runtime downloads, so consider a lighter heuristic bot. Remove upstream research telemetry and game uploads. Preserve all applicable licence notices, including any separately used runtime. Expected effort: medium, with a rules/playtesting pass.

## Optional solo filler: 2048

Source: https://github.com/gabrielecirulli/2048
Licence: MIT, verified in https://github.com/gabrielecirulli/2048/blob/master/LICENSE.txt

Vanilla JavaScript/CSS, mobile swipe handling and saved scores, with no server. Add HubKit, namespace its local storage, replace bundled fonts with existing hub fonts, and cache its assets. Retain licence/author notices and remove upstream official-version text. Easiest integration, but contributes less to group game nights.

The MIT code licences permit reuse subject to their notices; do not assume they license unrelated publisher names or artwork. These candidates were source-reviewed, not independently playtested.
