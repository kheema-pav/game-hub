# Yahtzee

An original implementation for Game Hub: five dice, thirteen score categories, two to four players, local/same-device play, online rooms and four bot levels. No publisher artwork or external runtime dependency is used.

## Rules

Scoring follows the [official Hasbro Game Folio rules](https://www.hasbro.com/common/instruct/40958.pdf), including three rolls, optional early scoring, the 35-point upper bonus at 63, a 50-point first Yahtzee, and 100-point subsequent Yahtzee bonuses. Reviewed 2 November 2026.

The forced Joker procedure applies after the Yahtzee category contains either 50 or zero. Use the matching upper category if open; otherwise use an open lower category (fixed full-house/straight scores apply); if no lower category remains, use zero in an open upper category. A prior zero in the Yahtzee category disables the 100-point bonus, but does not disable Joker scoring. Bonuses are awarded once when the turn is scored, not on every reroll.

Unlike the physical rules' opening roll-off, this implementation starts with Player 1. Solo mode means one human against bots; solitaire high-score mode is not included. Equal final totals share the win.

## Interface

- Tap a die to keep or release it. Held dice remain selected after a reroll.
- Every open category shows its current point preview.
- Select a category, then confirm its score. Zero-point choices are explicitly labelled.
- Upper-bonus progress, round/roll counts and public opponent scorecards are visible.
- The shared shell handles saves, rematches, local history and online replay.

## Bots

| Level | Decision method |
| --- | --- |
| Easy | Takes the best immediate raw score after one roll. |
| Normal | Keeps matching dice or partial straights; banks completed combinations. |
| Hard | Calculates exact expected scorecard utility for one reroll, weighing category opportunity cost. |
| Expert | Calculates the full remaining turn, with upper-bonus progress and the value of keeping difficult categories open. |

Hard/Expert enumerate unordered dice outcomes with exact probability weights and cache held-dice expectations. They do not inspect the game's seeded random generator, future dice or opponent scorecards. Their turn search is exact for the chosen utility function; the utility is a practical heuristic rather than a mathematically optimal whole-game strategy.

## Tests

```sh
node --test yahtzee/test/*.test.js
```

Tests cover every category, upper and repeated-Yahtzee bonuses, all forced Joker branches (including a scratched Yahtzee), strict action validation, held-dice behavior, three-roll limits, immutable seeded replay, ties, public/disabled UI controls, explicit zero-score confirmation and complete games at all four bot levels and table sizes.
