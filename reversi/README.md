# Reversi

An original implementation of standard 8×8 Reversi, with an original green felt board and black/ivory discs. Play against a bot, share one device or use Game Hub's online rooms. No outside artwork, bot service or new dependencies.

## Rules

The rules follow the [World Othello Federation's official playing rules](https://www.worldothello.org/about/about-othello/othello-rules/official-rules/english), checked 2 November 2026. Black starts from the standard four central discs. Moves must trap at least one opposing disc in a straight line; all directly trapped lines flip. A blocked player passes automatically. When neither side can move, the larger disc count wins, with a draw for equal counts. Some squares may remain empty. Displayed scores are actual disc counts, not tournament scores that award empty squares to the winner.

Legal squares show a faint disc and the number of discs they flip. Hovering or focusing a move outlines its captured discs; keyboard users can Tab between available moves and press Enter or Space. The last placed disc gets a gold ring. A visible notice explains an automatic pass. There is no private information and no pass-device curtain.

## Difficulty

- **Easy:** varied deterministic legal moves.
- **Normal:** one-move evaluation of corner control, mobility, exposed discs and game stage.
- **Hard:** looks up to three placements ahead with alpha-beta pruning, limited to 5,000 search nodes.
- **Expert:** searches progressively deeper, up to six placements in normal play and toward the end when ten or fewer squares remain. A 16,000-node ceiling bounds work; only a fully completed search depth replaces the previous choice.

These are practical local opponents, not a claim of perfect or tournament-strength play. The engine reads only the public board and uses no external model or future random values.

## Engine and checks

`engine.js` exports `create`, `actor`, `legal`, `apply`, `bot`, `result`, `flips` and `coordinate`. `apply` is pure, validates the author and exact action shape, and produces all forced passes as part of the accepted placement. Online replay uses the same legal actions and engine. State and saves have version 1.

Run `node --test reversi/test/*.test.js`. Coverage includes the standard opening, all eight capture directions, no row wrapping or secondary flips, invalid actions, forced passes, termination with empty squares, a 32–32 draw, all four complete bot games, repeatable replay, immutable inputs, and an exhaustively checked endgame where Expert finds a win that Normal misses. Renderer checks cover legal controls, rules, escaped names and pass notices.
