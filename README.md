# Game Hub

Fan-made tabletop games for phone and laptop, served as a static site by GitHub Pages.

## Layout

| Folder | Game | Notes |
|---|---|---|
| `index.html` | The hub page | Links to every game; shows "Continue" for games in progress |
| `shared/` | `hubkit.js` and `demo.html` | The shared menu, settings and sound used by the hub and every game |
| `manifest.webmanifest`, `icons/` | Install info and app icons | Lets phones add the hub to the home screen |
| `sw.js` | Service worker | Caches the site so it also works offline |
| `codex/` | Codex Naturalis | Bots (Easy/Normal/Hard), pass-and-play |
| `isles/` | Catan | Classic and Seafarers modes, bots, pass-and-play |
| `gems/` | Splendor | Bots (Easy/Medium/Hard), pass-and-play |
| `sketch/` | Pen & Paper Pictionary | One phone runs words and timer for 2–4 teams |

Each game is a single `index.html` that also loads the shared menu from `shared/hubkit.js` (only Google Fonts load from outside the site), so it runs from any static host. The service worker `sw.js` and the manifest sit in the site root, and the games keep working if `hubkit.js` fails to load.
Saved games stay in each player's own browser.

## How the shared menu works

Every page loads `shared/hubkit.js`, which adds the same menu button and menu sheet to the hub and each game, plus shared settings (sound, volume, vibration, keep screen awake) stored under one `localStorage` key, synthesised sound effects and a way back to the hub. Each game calls `HubKit.init` with its own menu items and uses `HubKit.sfx` for sounds. The kit also registers `sw.js`. The full API, the sound recipes and the per-game integration rules are in [`docs/hubkit-spec.md`](docs/hubkit-spec.md). When you add a game folder, add it to the precache list in `sw.js` (and bump its version string so old caches are cleared).

## Adding a game

1. Make a new folder, e.g. `newgame/`, with the game's `index.html`.
2. Load `../shared/hubkit.js` in it (see the spec), add a box for it on the shelf in the root `index.html`, and add its folder to the precache list in `sw.js`.
3. Push to `main`. GitHub Pages publishes within a minute or two.

## Names

The games use their original names for now, labelled as unofficial fan versions in the hub footer. If a takedown request ever arrives, switch to fan names (the earlier versions in git history used Naturalist's Codex, Settle the Isles, Gem Guild and Pen & Paper Sketch).
