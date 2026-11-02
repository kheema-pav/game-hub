# Four in a Row

Original implementation of the familiar gravity-based connection game. Two players alternate dropping discs into seven columns on a six-row board. Connect at least four discs horizontally, vertically or diagonally to win; a full board without a winner is a draw.

Play against a bot, pass one device, or invite another player using the hub's online rooms. Easy makes simple deterministic choices; Normal spots immediate wins and threats; Hard retains its existing five- to six-ply search (a ply is one player’s move). Expert searches deeper, up to ten plies, reuses previously evaluated positions and detects immediate threats at the search horizon. Expert has a deterministic 40,000-node extra-search budget and uses its last fully completed search, falling back to the existing Hard move when needed. This bounds thinking work; it is not a claim of perfect play. The engine uses no external service, copied source, publisher artwork or model.

Run `node --test connect4/test/*.test.js` from the repository root. The tests also boot the actual shared runner in a small DOM harness to check local, online and resume wiring. Browser layout and real multi-device Firebase transport still require browser checks. The engine is deterministic, uses immutable state transitions and exports both a browser registry entry and CommonJS for tests.
