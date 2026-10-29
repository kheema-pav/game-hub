# Game Hub

Fan-made tabletop games for phone and laptop, served as a static site by GitHub Pages.

## Layout

| Folder | Game | Notes |
|---|---|---|
| `index.html` | The hub page | Links to every game |
| `codex/` | Codex Naturalis | Bots (Easy/Normal/Hard), pass-and-play |
| `isles/` | Catan | Classic and Seafarers modes, bots, pass-and-play |
| `gems/` | Splendor | Bots (Easy/Medium/Hard), pass-and-play |
| `sketch/` | Pen & Paper Pictionary | One phone runs words and timer for 2–4 teams |

Each game is a single self-contained `index.html` (only Google Fonts load from outside), so it runs from any static host.
Saved games stay in each player's own browser.

## Adding a game

1. Make a new folder, e.g. `newgame/`, with the game's `index.html`.
2. Add a box for it on the shelf in the root `index.html`.
3. Push to `main`. GitHub Pages publishes within a minute or two.

## Names

The games use their original names for now, labelled as unofficial fan versions in the hub footer. If a takedown request ever arrives, switch to fan names (the earlier versions in git history used Naturalist's Codex, Settle the Isles, Gem Guild and Pen & Paper Sketch).
