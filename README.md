# Game Hub

Fan-made tabletop games for phone and laptop, served as a static site by GitHub Pages.

## Layout

| Folder | Game | Notes |
|---|---|---|
| `index.html` | The hub page | Links to every game; shows "Continue" for games in progress |
| `shared/` | `hubkit.js` and `demo.html` | The shared menu, settings and sound used by the hub and every game |
| `manifest.webmanifest`, `icons/` | Install info and app icons | Lets phones add the hub to the home screen |
| `shared/online.js`, `shared/firebase-config.js` | Online play (`window.HubOnline`) and the Firebase web config | Loaded only by pages that use online rooms |
| `firebase/` | Firestore security rules and their tests | `firestore.rules`, `test/` (emulator tests) |
| `sw.js` | Service worker | Caches the site so it also works offline |
| `codex/` | Codex Naturalis | Bots (Easy/Normal/Hard/Expert), pass-and-play |
| `isles/` | Catan | Classic and Seafarers modes, bots, pass-and-play |
| `gems/` | Splendor | Bots (Easy/Normal/Hard/Expert), pass-and-play |
| `sketch/` | Pictionary | One-device teams or online drawing and guessing |
| `ticket/` | Ticket to Ride | USA Classic / Europe Classic, bots, same-device, online |
| `ludo/` | Ludo | 2-4 players, documented house rules, bots, same-device, online |
| `connect4/` | Four in a Row | 2 players, four bot levels, same-device, online |
| `azul/` | Azul | Standard coloured wall, 2-4 players, bots, same-device, online |
| `reversi/` | Reversi | 2 players, four bot levels, automatic passes, same-device, online |
| `yahtzee/` | Yahtzee | 2–4 players, four bot levels, bonuses/Joker rules, same-device, online |
| `shared/game-night*.js` | Local game nights | Saved-table summaries, same-player rematches, latest 50 local results |
| `shared/tabletop*.js`, `shared/tabletop.css` | New-game shell | Local saves, private handover, authored online replay and setup |

Each game has a small `index.html`, `style.css`, `engine.js` (rules/data) and `game.js` (screen and game flow). Catan also has `bot.js`. These are classic scripts with no build step. Shared menus load from `shared/hubkit.js`; online play lazily loads the Firebase SDK from gstatic. The site runs from any static host. The service worker `sw.js` and the manifest sit in the site root, and the games keep working if `hubkit.js` fails to load.
Saved games stay in each player's own browser.

## How the shared menu works

Every page loads `shared/hubkit.js`, which adds the same menu button and menu sheet to the hub and each game, plus shared settings (sound, volume, vibration, keep screen awake) stored under one `localStorage` key, synthesised sound effects and a way back to the hub. Each game calls `HubKit.init` with its own menu items and uses `HubKit.sfx` for sounds. The kit also registers `sw.js`. The full API, the sound recipes and the per-game integration rules are in [`docs/hubkit-spec.md`](docs/hubkit-spec.md). When you add a game folder, add it to the precache list in `sw.js` (and bump its version string so old caches are cleared).

## Online play (game codes)

Online games use a six-digit code. Nobody signs in: each browser gets an anonymous Firebase identity, and a profile (name and colour, set under "You" in the shared menu) is kept on the device and mirrored to Firestore. The hub has a "Join a game" box and an "Online games" strip for rooms this device has joined. `shared/online.js` defines `window.HubOnline` and only loads the Firebase SDK (pinned 11.10.0, from gstatic) when an online feature is used, so local play never waits for it. While `shared/firebase-config.js` holds `null`, online features are off and the hub shows "Online play is on the way". The API and rules are in [`docs/online-plan.md`](docs/online-plan.md).

### Owner steps (Firebase, free Spark plan)

1. In the [Firebase console](https://console.firebase.google.com) create a project, add a Web app (the `</>` icon) and copy its `firebaseConfig`.
2. Build > Authentication > Get started > Sign-in method: enable **Anonymous**.
3. Build > Firestore Database > Create database in **production mode**.
4. Firestore > Rules: paste the contents of `firebase/firestore.rules` and **Publish**.
5. Paste the config into `shared/firebase-config.js` as `window.HUB_FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };`, commit and push. (The values are public by design; the rules protect the data. Anonymous sign-in needs no authorised-domain entry. Optionally restrict the API key by HTTP referrer in Google Cloud > Credentials.)

Rules update for bigger rooms and drawing (platform v2): rooms may now have 2 to 8 seats and an optional `opts` map (at most 8 keys from a fixed whitelist: `mode`, `target`, `friendly`, `secs`, `rounds`, with simple values; set at creation and never changed), and a new `rooms/{code}/draw/{uid}_{turn}_{seq}` collection holds Pictionary drawing chunks (`{t, i, d}`, create-only, `d` up to 40,000 characters, written only by a seated player of a started room under their own uid; an identical re-send is allowed so retries are safe). Re-publish `firebase/firestore.rules` once when updating an existing project.

### Testing the rules and online code locally

Needs Node and Java 21. From `firebase/test/`: `npm install`, then `npm test` starts the Firestore emulator (project `demo-game-hub`, port 8180) and runs `rules.test.js`. To try the site against local emulators, run `npx firebase emulators:start --only firestore,auth --project demo-game-hub --config ../firebase.json`, serve the site, and in the browser console set `localStorage['hub.emulator'] = '127.0.0.1:8180:9199'` (host:firestorePort:authPort; remove it to go back to the real project).

## Room recovery, versions and release checks

The in-game **Room** button shows advisory player presence and recovery actions. The host can cancel an open room or end a started game after confirmation. Terminal rooms retain their history and reject further moves. Any seated player can create a separate replacement room with the same settings, even if the host is absent; share its new invitation. Other players are not silently moved and the old game is unchanged.

Presence writes at most once per minute per visible active tab, never from hub room listings. "Not seen recently" is advisory, not a forfeit. Clearing browser data or changing browser loses the anonymous identity and its seat. Closing a tab does not mark other tabs with the same identity offline.

New rooms fix platform and game versions from `shared/versions.js`. Existing v1 rooms remain supported because their engines have not changed. Unsupported versions are blocked before joining or replay. Old cached clients cannot be forcibly upgraded; ask all players to update before a session. Increment a game's version whenever a rules/replay change would interpret old move histories differently.

Direct mode links use `?mode=solo`, `?mode=local` and `?mode=online`. Room invitations and `#continue` take priority. Pictionary supports local and online modes only.

**Deployment order:**

1. Run the checks below and publish `firebase/firestore.rules` to the existing Firebase project first. This repository does not deploy rules automatically. The new room schema and recovery writes require the updated rules; old clients and v1 rooms remain accepted by them.
2. Deploy the complete static site, including every extracted CSS/JS file and shared scripts. Bump `VERSION` in `sw.js` for each shipped asset change.
3. Close all Game Hub tabs and reopen to activate an available new service worker. A running game keeps its cached release until tabs close. The next release installs only if every required asset downloads successfully; executable files are served from one complete release rather than refreshed individually.
4. Check a new room, a legacy invitation, host cancellation, a guest replacement, a backgrounded phone and an offline local reload.

Dependency-free checks: `node --test test/*.test.js shared/test/*.test.js isles/test/entry-modes.test.js sketch/test/*.test.js codex/test/*.test.js connect4/test/*.test.js ludo/test/*.test.js azul/*.test.js ticket/test/*.test.js reversi/test/*.test.js yahtzee/test/*.test.js` and `node isles/test/engine.test.js`. Firestore checks: `cd firebase/test && npm ci && npm test` (Node and Java 21). GitHub Actions runs these on pushes and pull requests.

All ten games are implemented. Reversi and Yahtzee rules and tests are documented in their folders. Ticket edition details and adapted MIT data credits are in [ticket/README.md](ticket/README.md); Azul uses the standard coloured-wall rules; Ludo house rules are explicit in [ludo/README.md](ludo/README.md).

## Bot levels and local game nights

Every game with bots offers Easy, Normal, Hard and Expert. Existing Connect 4 and Splendor Hard behavior is retained. Expert spends more computation on planning or evaluates more strategic trade-offs; it uses visible information and its own private cards, never future dice/deck order or opponents’ private cards. Pictionary has no bot mode. The names are practical presets, not calibrated ratings, and chance still matters in dice games. Splendor retains the internal `medium` value for compatibility but labels it Normal.

The hub shows saved tables with player names, mode, bot level, edition where relevant, and last saved time for games saved after this update. Completed local games appear in Recent results, capped at 50. Results contain names, scores, winners, level, date and a short game summary, not hands or moves. Clearing results leaves active saves intact. Storage is browser-local and is lost if browser data is cleared. Online matches still use the existing room history; they are not copied into this local result list.

Final-screen rematches retain players and settings. Existing saves remain readable; the shared tabletop setup asks before replacing an unfinished game. Reversi and Yahtzee use the existing platform-v2 room schema and require **no new Firestore rule deployment** beyond the previously published rules.

See [the game-night implementation notes](docs/game-night-plan.md), [the reviewed implementation plan](docs/implementation-plan.md) and [new-game candidates](docs/game-candidates.md).

## Adding a game

1. Make a new folder, e.g. `newgame/`, with the game's `index.html`.
2. Load `../shared/hubkit.js` in it (see the spec), add a box for it on the shelf in the root `index.html`, and add its folder to the precache list in `sw.js`.
3. Push to `main`. GitHub Pages publishes within a minute or two.

## Names

The games use their original names for now, labelled as unofficial fan versions in the hub footer. If a takedown request ever arrives, switch to fan names (the earlier versions in git history used Naturalist's Codex, Settle the Isles, Gem Guild and Pen & Paper Sketch).
