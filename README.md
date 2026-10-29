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
| `codex/` | Codex Naturalis | Bots (Easy/Normal/Hard), pass-and-play |
| `isles/` | Catan | Classic and Seafarers modes, bots, pass-and-play |
| `gems/` | Splendor | Bots (Easy/Medium/Hard), pass-and-play |
| `sketch/` | Pen & Paper Pictionary | One phone runs words and timer for 2–4 teams |

Each game is a single `index.html` that also loads the shared menu from `shared/hubkit.js` (only Google Fonts load from outside the site), so it runs from any static host. The service worker `sw.js` and the manifest sit in the site root, and the games keep working if `hubkit.js` fails to load.
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

## Adding a game

1. Make a new folder, e.g. `newgame/`, with the game's `index.html`.
2. Load `../shared/hubkit.js` in it (see the spec), add a box for it on the shelf in the root `index.html`, and add its folder to the precache list in `sw.js`.
3. Push to `main`. GitHub Pages publishes within a minute or two.

## Names

The games use their original names for now, labelled as unofficial fan versions in the hub footer. If a takedown request ever arrives, switch to fan names (the earlier versions in git history used Naturalist's Codex, Settle the Isles, Gem Guild and Pen & Paper Sketch).
