# Four in a Row

Original implementation of the familiar gravity-based connection game. Two players alternate dropping discs into seven columns on a six-row board. Connect at least four discs horizontally, vertically or diagonally to win; a full board without a winner is a draw.

Play against a bot, pass one device, or invite another player using the hub's online rooms. Easy makes simple deterministic choices; Normal spots immediate wins and threats; Hard searches several turns ahead with alpha-beta pruning. The engine uses no external service, copied source, publisher artwork or model.

Run `node --test connect4/test/*.test.js` from the repository root. The tests also boot the actual shared runner in a small DOM harness to check local, online and resume wiring. Browser layout and real multi-device Firebase transport still require browser checks. The engine is deterministic, uses immutable state transitions and exports both a browser registry entry and CommonJS for tests.
