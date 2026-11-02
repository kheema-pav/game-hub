# Ludo

An original deterministic Ludo engine and CSS board for Game Hub, with 2–4 human players, bots, or shared online rooms. All code and board rendering in this folder were written for this project; no third-party code or publisher artwork is included.

## Fixed house rules

- Four tokens per player. Two-player games use opposite corners; three and four players use adjacent clockwise corners.
- Roll six to place a token from its yard onto its coloured start. The six is used to enter, rather than also moving six squares.
- Six earns another roll. A third consecutive six is forfeited before moving, and play passes. Moves made on the earlier two sixes remain valid.
- A roll with no legal move passes play, except a six still earns another roll (subject to the three-six limit).
- The 52-square common circuit has eight safe squares: the four coloured starts and four starred squares. Safe indices are 0, 8, 13, 21, 26, 34, 39 and 47, relative to the bottom-left start.
- Land on an opposing token on an unsafe square to return it to its yard. Multiple tokens may share any square, there are no blockades, and tokens may always pass one another. An unsafe landing captures all opposing tokens on that square.
- Each token advances 50 steps from its start to its own home entrance, then five private home-column squares and one final step home (56 steps from the start). An exact die roll is required to finish; overshooting is illegal. Completed tokens do not move again.
- Capturing and finishing do not grant bonus rolls. First to bring all four tokens home wins.

These rules are intentionally explicit because regional Ludo rules differ, particularly for blockades and bonus rolls.

## Engine and tests

`engine.js` exposes `HubEngines.ludo` in browsers and CommonJS exports for Node tests. `apply` is pure and validates the action author's seat, phase, token and exact action shape. Randomness is seeded and stored in state. The bot uses the same legal actions as a human: Easy moves the first legal token, Normal prioritises captures and progress, Hard also considers safe squares and capture risk.

Run `node --test ludo/test/engine.test.js` from the repository root. Tests cover capturing, safe squares, exact finish, third-six forfeits, input immutability, seeded determinism, injected actions and complete bot games for all player counts and difficulty levels.
