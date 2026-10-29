# HubKit spec: shared menu, settings and sound for Game Hub

Status: approved plan, ready to build. Owner: coordinator session. Builders: Sonnet helper agents.

## Goal

Every game on the site gets the same menu button, the same menu sheet, shared sound and settings, and a way back to the hub.
The hub page shows "Continue" for games in progress and can be installed to a phone home screen.

## Principles (from research and the design critique)

- One tap to open the menu, one tap or Esc to close it. The menu contains only what players need: resume, rules, new game, settings, all games.
- One menu button, always top-right, same icon in every game. Fewer header buttons on phones (Codex's header is too tall today).
- Phone: bottom sheet (thumb reach). Desktop (min-width 700px): centred panel, max-width 420px. Dim the page behind.
- Destructive actions (New game, End game) use an inline two-tap confirm inside the sheet ("New game" turns into "Tap again to end this game"). Never `confirm()`.
- Sound is subtle and optional: default volume 0.35, short sounds (mostly under 150 ms), no sound on hover or scrolling, the same sound never retriggers within 40 ms. Every sound pairs with something visible.
- Settings are shared by all games (same origin, one localStorage key).
- Touch targets at least 44x44 px. Visible keyboard focus. The sheet traps focus while open and returns focus to the menu button when it closes.

## Files

```
shared/hubkit.js     the kit (JS with its CSS injected at runtime, no other dependencies)
shared/demo.html     a test page: opens the menu, plays every sound, shows settings state
manifest.webmanifest PWA manifest for the hub
sw.js                service worker (offline play)
icons/               icon-180.png (apple-touch), icon-192.png, icon-512.png, icon.svg
```
Each game folder loads the kit with `<script src="../shared/hubkit.js"></script>` placed before its own scripts. The hub loads `shared/hubkit.js`.

## Public API (window.HubKit)

```js
HubKit.init({
  id: 'codex',                    // 'hub' | 'codex' | 'isles' | 'gems' | 'sketch'
  name: 'Codex Naturalis',        // shown at the top of the sheet
  accent: '#7a5a12',              // sheet accent (buttons, toggles); a CSS colour string
  scheme: 'auto',                 // 'auto' (follow prefers-color-scheme) | 'dark' | 'light'
  floating: false,                // true: kit shows its own fixed button top-right (for screens with no header)
  items: () => [                  // game section, evaluated each time the sheet opens
    { label: 'Rules', onSelect: () => openRules() },
    { label: 'New game', confirm: 'Tap again to end this game', onSelect: () => newGame() },
    { label: 'Bot speed', value: 'Normal', onSelect: () => cyclePace() },   // value shown on the right; sheet re-renders after onSelect
    { label: 'Hide hands', toggle: true, checked: true, onSelect: (on) => setHide(on) },
  ],
  onOpen: () => {}, onClose: () => {},   // optional, e.g. pause a timer
  onLeave: () => {},              // optional: save state before navigating to the hub
});
HubKit.buttonHTML(extraClass?)    // returns the menu button markup for a game's own header template
HubKit.open(); HubKit.close(); HubKit.isOpen()
HubKit.sfx(name, {volume, rate}?) // play a sound if sound is on; never throws; returns nothing
HubKit.buzz(pattern)              // vibrate if the vibration setting is on and supported
HubKit.settings                   // read-only snapshot {sound, volume, vibrate, wake}
HubKit.refresh()                  // re-render the open sheet (after game state changed)
```

### Menu button

- `buttonHTML()` returns `<button type="button" class="hk-menu-btn" data-hubkit="menu" aria-label="Menu" aria-haspopup="dialog">` with an inline SVG icon (three short lines). It must not carry a `data-act` attribute, because the games use `data-act` for their own delegated clicks.
- The kit listens on `document` (capture phase) for clicks on `[data-hubkit="menu"]`, so the button keeps working after the games re-render their HTML with innerHTML.
- Size: 44x44 px, round-rect 12 px radius. Colours come from `currentColor` and a translucent background so it sits on light or dark headers. Games may add their own class for small adjustments.
- `floating: true` adds the same button fixed at `top: calc(env(safe-area-inset-top,0px) + 10px); right: calc(env(safe-area-inset-right,0px) + 10px)`, z-index 4000. A game can switch it on or off at runtime with `HubKit.setFloating(bool)`.

### Sheet layout (top to bottom)

1. Header row: game name (bold) on the left, close button (x) on the right.
2. Primary row of two large buttons: **Resume** (closes) and **All games** (goes to the hub: calls `onLeave`, then `location.href = HUB_URL`). On the hub page itself, this row is hidden.
3. "This game" section: the game's `items`. Plain items are full-width rows; `value` items show the value on the right; `toggle` items show a switch; `confirm` items need a second tap within 4 s (the label changes to the confirm text; the row turns the warning colour).
4. "Settings" section:
   - Sound: switch + volume slider (0–100, step 5). Moving the slider plays the `tap` sound at the new volume (debounced 120 ms).
   - Vibration: switch. Only shown when `navigator.vibrate` exists.
   - Keep screen awake: switch. Only shown when `navigator.wakeLock` exists. Uses the Screen Wake Lock API; re-requests on `visibilitychange` when visible; releases when turned off.
5. Footer (small, muted): "Settings apply to every game." On the hub page also: "Add to your home screen: in Safari tap Share, then Add to Home Screen."

- `HUB_URL` is computed from the kit's own script URL: the folder that contains `shared/`. Do not hardcode `/game-hub/`.
- Esc closes. Keyboard shortcut `m` toggles mute when focus is not in an input.
- Sheet colours: own token set, light and dark, with `--hk-accent` from init. Font: system UI stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`), 16 px base, so it reads the same in every game. z-index 5000 for the backdrop and sheet (the games' own modals go up to 2000).
- Motion: sheet slides up 220 ms ease-out on phones, fades and scales from 0.98 on desktop; none under `prefers-reduced-motion`.
- All CSS class names start with `hk-`. The kit injects one `<style id="hubkit-css">` and one `<div id="hubkit-root">` at the end of `<body>`. It must not touch any other element or global style.

### Settings storage

`localStorage['hubkit.settings'] = {"sound":true,"volume":0.35,"vibrate":true,"wake":false}`. Wrap every read and write in try/catch; fall back to defaults in memory.

## Sound engine

Web Audio only, synthesised at runtime. No audio files.

- Create one `AudioContext` lazily on the first `pointerdown` or `keydown` anywhere (capture phase), then `resume()` it. Before that, `sfx()` does nothing.
- Master chain: per-sound gain → master `GainNode` (value = settings.volume) → `DynamicsCompressorNode` (threshold -18, knee 12, ratio 4) → destination.
- Skip sounds while `document.hidden`. Rate limit: ignore a call with the same name within 40 ms of the previous one.
- `opts.volume` scales that one sound (bots use 0.6). `opts.rate` scales pitch (e.g. 1.1 for variety).
- Add ±3% random pitch variation to card and gem sounds so repeats don't sound mechanical.
- Use one shared white-noise `AudioBuffer` (1 s) for all noise-based sounds.

### Sound library (recipes; times in seconds)

| Name | Use | Recipe |
|---|---|---|
| `tap` | button/menu taps, selecting a card | sine 1100 Hz, gain 0→0.25 in 0.003, exp decay to 0.001 by 0.045 |
| `place` | a card or tile is put down | noise → bandpass 900 Hz Q 1.2, gain 0.9 decaying by 0.07; plus sine 140 Hz, gain 0.5 decaying by 0.09 (a soft thud) |
| `flip` | flipping or reserving a card | noise → highpass 2500 Hz, gain 0.4, 0.05 long, with a linear filter sweep 2500→6000 Hz |
| `draw` | drawing a card from a deck or market | noise → bandpass sweeping 1200→3200 Hz over 0.12, gain 0.35 with 0.01 attack and decay by 0.14 |
| `score` | points gained | two sines 660 Hz then 990 Hz, 0.06 apart, each gain 0.22 decaying by 0.12 |
| `chime` | your turn starts | triangle 784 Hz and 1175 Hz together, gain 0.18, decay by 0.5; gentle |
| `error` | an action is not allowed | square 220 Hz through lowpass 900 Hz, gain 0.12, two pulses 0.06 long, 0.04 apart |
| `win` | you win | triangle arpeggio 523, 659, 784, 1047 Hz, 0.09 apart, each decay 0.3, last note held 0.6 |
| `end` | game over, you did not win | triangle 392 then 330 Hz, 0.15 apart, decay 0.35 |
| `dice` | dice roll | 6 short noise clicks (bandpass 1800 Hz Q 2, 0.02 each) at random gaps 0.03–0.07 s, then one `place`-style thud |
| `build` | road, settlement, city | sine 180 Hz with fast pitch drop to 120 Hz over 0.08, gain 0.5; plus noise click bandpass 600 Hz 0.03 (wood knock) |
| `clink` | taking a gem token | two sines at 2600 Hz and 3900 Hz (ratio 1.5), gain 0.15, decay by 0.18; random detune per call |
| `coin` | trading, paying, buying | sines 1500 Hz then 2250 Hz, 0.04 apart, decay 0.15, gain 0.15 |
| `thud` | robber, heavy event | sine 90 Hz pitch-dropping to 55 Hz over 0.2, gain 0.6, decay 0.25; noise lowpass 400 Hz under it |
| `swish` | steal, discard, take back | noise → bandpass sweeping 800→3000 Hz over 0.18, gain 0.3 |
| `tick` | timer, last seconds | sine 1600 Hz, gain 0.15, 0.025 long |
| `buzzer` | time's up | sawtooth 196 Hz through lowpass 1200 Hz, gain 0.18, 0.5 long with a slight vibrato (6 Hz, ±4 Hz) |

Haptics (`HubKit.buzz`): `place` 10 ms, `error` [30,40,30], `win` [20,40,20,40,60]. The games call `buzz` themselves where noted below.

## Hub page changes (`index.html`)

1. Load the kit and call `HubKit.init({id:'hub', name:'Game Hub', accent:'#f2b632', floating:false, items:()=>[]})`. Put `HubKit.buttonHTML()` (static markup is fine) at the right end of the header row next to the title.
2. "Continue" state on each game box. Read each game's own save from localStorage (try/catch, never throw) and, when a game is in progress, show a line above the Play button, e.g. "Game in progress · round 6", and change the button label to "Continue". Exact save keys and shapes: inspect each game file (Codex `naturalists-codex-v1`, Catan `sti.save.v1`, Splendor `gemguild-game-v1`, Pictionary key added by its builder: `pictionary.save.v1`). A finished game does not count as in progress. If the shape is not understood, show nothing.
3. `<link rel="manifest" href="manifest.webmanifest">`, `<link rel="apple-touch-icon" href="icons/icon-180.png">`, `<meta name="theme-color" content="#121722" media="(prefers-color-scheme: dark)">` and `#dfe4ea` for light, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="Game Hub">`.
4. Manifest: name "Game Hub", short_name "Game Hub", start_url "./", scope "./", display "standalone", background_color "#121722", theme_color "#121722", the three icons (192 and 512 also listed with purpose "any maskable" only if the artwork has safe padding).
5. Icons: the meeple from the hub header, accent yellow on the dark wall colour #121722, centred with 20% padding. Render the PNGs from an SVG with Playwright (Chromium is installed; `require('playwright')` works; launch with no options).
6. Service worker `sw.js`, registered from the hub and from the kit (`navigator.serviceWorker.register(HUB_URL + 'sw.js')`, in try/catch, only on https or localhost):
   - Cache name includes a version string `gh-v1`. On install, precache: `./`, `index.html`, `shared/hubkit.js`, `manifest.webmanifest`, the icons, and each game's `index.html` (`codex/`, `isles/`, `gems/`, `sketch/`). On activate, delete old caches.
   - Same-origin GET: network first, falling back to cache (so updates show immediately when online and the site works offline).
   - Google Fonts (fonts.googleapis.com, fonts.gstatic.com): stale-while-revalidate into a separate cache.
   - Never cache non-GET requests.

## Per-game integration

Each game: add the kit script tag; call `HubKit.init` once at startup; put `${HubKit.buttonHTML()}` into the game's header template(s) at the top-right; route sounds as listed. Keep each game's look; only the header buttons move. Every existing feature must keep working.

### Codex Naturalis (`codex/index.html`)

- Header: replace the "Rules" and "New game" buttons in `.actions` with the menu button. Items: Rules (opens the existing rules modal), New game (opens the existing new-game dialog; no confirm needed because that dialog has Cancel), Bot speed (cycles Slow/Normal/Fast; multiplies the bot delays in `aiStep` by 1.6 / 1 / 0.5; store in localStorage `codex.pace`).
- The setup modal, handoff modal and results modal must still work. The setup dialog's own "Rules" and "Change players" buttons stay.
- Phones: with only the menu button in `.actions`, check that the header is now one row on a 390 px wide screen; if not, tighten `.top` spacing.
- Sounds: selecting a hand card `tap`; Flip `flip`; human placement `place` (+ `score` if points > 0, + `buzz(10)`); undo `swish`; drawing `draw`; bot placement `place` at volume 0.6 (+ `score` 0.6 if points); bot draw `draw` 0.6; start of a human turn after a bot or other player's turn `chime`; clicking a gold card whose requirement is not met `error`; objective highlight toggle `tap`; game over: `win` if a human won (single-human game: that human; pass-and-play: any human), otherwise `end`.

### Catan (`isles/index.html`)

- The existing ☰ button (`data-act="menu"`) becomes `HubKit.buttonHTML()`. Move every row of the old Catan menu (`menuModal()`) into `items`: Building costs and Game log open the existing Catan modals; the toggles and bot skill/speed rows keep their current behaviour; "Leave game" becomes "Quit to setup" with a confirm. Delete the old menu modal code path once nothing calls it.
- Home/setup screen (`#home`): use `HubKit.setFloating(true)` while it is visible, false in the game screen.
- Pass-and-play curtain must still cover everything except the kit (the kit sits above it; that is fine because the curtain is only a privacy screen).
- Sounds: dice roll `dice`; build road/ship/settlement/city `build` (city also `score`); buying a development card `flip`; playing one `flip`; robber or pirate moved `thud`; steal `swish`; any trade `coin`; resources produced for a human `draw`; discard `swish`; your turn (human, after another player) `chime`; illegal action toasts (`.toast.err`) `error`; win `win`/`end` as for Codex. Bot actions at volume 0.6.

### Splendor (`gems/index.html`)

- Game header (`renderGame` top bar): replace the Bot speed, Rules and New game buttons with the menu button. Items: Rules, New game (confirm), Bot speed (value shown, same cycling as today). Setup screen: keep "How to play"; use `HubKit.setFloating(true)` while the setup screen is shown.
- Sounds: each gem taken `clink` (stagger 60 ms between gems); buying a card `place` + `coin`; reserving `flip` (+ `clink` if gold taken); noble arrives `chime` + `score`; returning tokens `swish`; your turn `chime`; invalid selection `error`; game over `win`/`end`. Bot moves at 0.6, timed with the existing flight animations where easy.

### Pictionary (`sketch/index.html`)

- Top status row (`.top`): put the menu button left of "End game". Setup screen: `HubKit.setFloating(true)` while it is shown.
- Items: How to play (a short rules sheet using the existing card styles), End game (confirm; same as the existing button).
- `onOpen` pauses the drawing timer if it is running; `onClose` leaves it paused (the player taps Resume in the game).
- Replace the existing `beep()` calls with kit sounds so mute and volume apply: last 10 seconds `tick` each second; time's up `buzzer` + `buzz([200,100,200])`; Guessed it `score`; Skip `flip`; Start the clock `tap`; final winner `win`.
- Save and restore: store the current game (teams, scores, turn, rounds, seconds, used words, screen, current word) in localStorage `pictionary.save.v1` after every change; on load, if a saved game exists and is not finished, resume at the handover screen (never mid-timer). Clear it on "Play again" or "Change teams" and when the final screen is shown.

## Acceptance tests (coordinator runs these with Playwright)

1. Hub and all four games load with no console errors on a 390x844 phone and 1300x900 desktop, in light and dark.
2. In each game the menu button is visible top-right in the game screen, opens the sheet, Esc and the close button close it, focus returns to the button.
3. "All games" from each game reaches the hub; the hub shows "Continue" for Codex, Catan and Splendor after a game has started; clicking it resumes that game.
4. Muting in one game persists in another game and on the hub.
5. `HubKit.sfx` calls happen at the listed moments (verified by wrapping `HubKit.sfx` in the test and logging names) and never throw, including before any user gesture.
6. No horizontal scroll on phones; the Codex header fits one row on a 390 px phone.
7. The service worker installs on localhost; after going offline, the hub and a game still load.
8. Existing flows still work: a full bot game in Codex, Catan and Splendor reaches game over with the test harness's fast timers; Pictionary plays a full round.
