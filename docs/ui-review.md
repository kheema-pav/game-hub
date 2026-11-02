# Game-night interface review

The playing surface and the controls needed for a turn were too far apart. Ticket
to Ride also used an abstract grid instead of geography, and destination tickets
could not show their cities. This pass improves all eight game interfaces while
preserving engines, route IDs, saves and online move formats.

## Changes

- Ticket to Ride: bundled geographic USA and Europe maps, lakes, individual train
  spaces, separate preview/keep controls, A/B city markers and a destination guide,
  route glow, selection zoom, sticky map and adjacent desktop controls. Mobile
  keeps the map above the choices, with an expandable score/train summary.
- Four in a Row: tactile board and discs, whole-column targets, landing previews,
  distinct player symbols, last-move/winning-disc emphasis.
- Ludo: board and piece depth, die pips, legal landing markers and move cards that
  explain captures, safe landings and arrival home.
- Azul: supply and player board together, ceramic styling, tile placement/spill
  previews, blocked-line explanations and compact opponent boards.
- Codex: persistent turn guidance and phone Hand/Market/Objectives dock, automatic
  market reveal after placement, keyboard placement, Fit for large boards.
- Splendor: bank/actions beside the market on desktop and before it on phones,
  affordable-card cues, prestige progress and keyboard-safe dialogs.
- Catan: resource names, readable build costs, settlement resource/dice previews,
  accessible board choices, bigger zoom controls and richer island styling.
- Pictionary: wider desktop canvas with tools/guesses alongside, keyboard-friendly
  word reveal, clearer pause/low-time states and compact phone keyboard layout.
- Shared: compact playing header, uninterrupted local turns for public-information
  games, focus/scroll retention for draft choices. Private Ticket hands still use
  the same-device curtain. Complete offline cache release advances to gh-v7.

## Validation

- 188 dependency-free engine, replay, integration, UI and release tests pass.
- 49 additional Catan engine tests pass, including 8,067 injected invalid records.
- Independent code review fixed phone keyboard crowding, large-board fitting,
  endpoint clearing, pending-payment rendering and focus/scroll problems.
- CI browser coverage now checks Ticket destination markers, non-mutating
  previews, selection zoom focus, simultaneous map/control visibility and local
  public-game turns at 390px and 1280px. Screenshots are retained as CI artifacts.

Actual browser execution and visual inspection remain pending: this editing
session cannot bind a local preview port, and browser policy forbids local-file
navigation. CI browser checks must pass and screenshots should be inspected
before merging. Firebase rules do not change in this PR.
