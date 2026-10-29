# HubKit spec: shared menu, settings and sound for Game Hub

Status: approved plan, ready to build. Owner: coordinator session. Builders: Sonnet helper agents.

**Read "Amendments after review" at the end first. Where it conflicts with anything above, the amendment wins.**

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


## Amendments after review (these override everything above)

### A. API and kit behaviour
1. `HubKit.setFloating(bool)` is part of the public API.
2. `accent` may be a string or `{light, dark}`; the kit uses the one matching the sheet's scheme. Text on accent-coloured buttons is black or white, whichever has higher contrast (compute from luminance).
   Per game: hub `{light:'#b07d12', dark:'#f2b632'}` auto; Codex `{light:'#7a5a12', dark:'#d8b45a'}` auto; Catan `'#ffc94a'` with `scheme:'dark'`; Splendor `{light:'#94680f', dark:'#d9ae52'}` auto; Pictionary `'#ffd23f'` auto.
3. Items: plain and confirm items close the sheet, then call `onSelect`. Value and toggle items keep the sheet open and re-render it. Hide the "This game" section when `items()` returns an empty array.
4. No `data-act` attribute anywhere in kit markup. Use `data-hk-*` attributes only. (The games' document-level handlers react to `data-act`.)
5. Haptics are automatic: when vibration is on and supported, `sfx('place')` buzzes 10 ms, `sfx('error')` [30,40,30], `sfx('win')` [20,40,20,40,60], `sfx('buzzer')` [200,100,200]. Games never call `buzz` themselves.
6. Audio unlock: try to create/resume the AudioContext on `pointerup`, `touchend`, `click` and `keydown` (capture phase, passive). Keep the listeners until `ctx.state === 'running'`. Call `resume()` again on `visibilitychange` when visible (Safari can leave it `interrupted`). `sfx` before unlock is a silent no-op.
7. Style isolation: every kit rule is scoped as `#hubkit-root .hk-…` for sheet contents, and the menu button uses `button.hk-menu-btn.hk-menu-btn` (doubled class for specificity) and explicitly sets border, background, padding, margin, min-height, min-width, width, height, transform, box-shadow, font, line-height, color, border-radius and outline, including `:active` and `:focus-visible`. (Pictionary styles every `button` globally and `.top button`.)
8. Focus: on close, focus the first visible `[data-hubkit="menu"]` (the game may have re-rendered the button while the sheet was open), or the floating button.
9. Keys: the kit adds its keydown listener on `window` in the capture phase. While the sheet is open it handles Esc (close) and Tab (focus trap) and calls `stopImmediatePropagation()` on every keydown so game shortcuts (Codex `f`, Ctrl+Z, Splendor Esc) don't fire behind it. The `m` mute shortcut works only when the sheet is closed, ignores Ctrl/Meta/Alt and key repeats, ignores focus in input/textarea/select/contenteditable, and shows a small toast "Sound off" / "Sound on" for 1.2 s (kit-rendered, bottom centre, z 5000, `aria-live="polite"`).
10. Lifecycle: close the sheet on `pagehide`; on `pageshow` re-read settings. Listen for `storage` events on `hubkit.settings` so mute syncs across tabs.
11. Sheet sizing: `max-height: calc(100dvh - env(safe-area-inset-top,0px) - 16px)`, internal scrolling with `overscroll-behavior: contain`, bottom padding `calc(16px + env(safe-area-inset-bottom,0px))`.
12. Service worker registration happens only inside the kit. Capture `document.currentScript.src` at the top level of hubkit.js (it is null later) to compute `HUB_URL`, and register `HUB_URL + 'sw.js'` with scope `HUB_URL`, only on https or localhost, in try/catch.
13. Every page that loads the kit must still work if the kit fails to load. Each game and the hub include this stub right after the kit script tag:
    `<script>window.HubKit=window.HubKit||{init(){},buttonHTML:()=>'',open(){},close(){},isOpen:()=>false,sfx(){},buzz(){},refresh(){},setFloating(){},settings:{}};</script>`

### B. Service worker (replaces the earlier rules)
- Precache with `new Request(url, {cache:'reload'})`: `./`, `codex/`, `isles/`, `gems/`, `sketch/` (folder URLs, which is how pages are opened), `shared/hubkit.js`, `manifest.webmanifest`, the icons.
- Fetch: same-origin GET → network first with a 3 s timeout, store every successful response in the cache, fall back to `caches.match(request, {ignoreSearch:true})`. Google Fonts → stale-while-revalidate in a separate cache. Ignore other origins and non-GET.
- `self.skipWaiting()` on install and `clients.claim()` on activate. Delete caches whose name isn't the current version on activate. Version string: `gh-v1`.

### C. Hub "Continue" (replaces section "Hub page changes" item 2)
- In progress rules:
  - Codex `naturalists-codex-v1`: object with `v===1`, `phase` not `'setup'` and not `'over'`; label "Round {round}".
  - Catan `sti.save.v1`: object with `G.v===1` and `G.phase !== 'gameover'`; label "Turn {G.turnNo}" (use "Setting up" when `G.phase==='setup'`).
  - Splendor `gemguild-game-v1`: object with `players` array and `over !== true`; label "Round {round}".
  - Pictionary `pictionary.save.v1`: `{v:1, screen, teams, scores, turn, rounds, secs, used:[...], skipsLeft}`; in progress when `screen` is not `'setup'` or `'final'`; label "Turn {turn+1} of {teams.length*rounds}".
- Links when in progress: `codex/` (resumes by itself), `isles/#continue`, `gems/#continue`, `sketch/` (resumes by itself).
- Recompute on load and on `pageshow`.
- Footer hint addition: "On iPhone, games saved in Safari and in the home-screen app are kept separately."

### D. Game-specific corrections
- **Codex.** The header `.actions` is static HTML: insert the menu button with JS at startup (`insertAdjacentHTML`) and remove the Rules and New game buttons from the static markup. On a 390 px phone the target layout is: row 1 brand on the left and menu button on the right; row 2 the player chips at full width. Codex's own modals (setup, handoff, results, rules, new game) cover the header, so in `renderModal` call `HubKit.setFloating(!m.hidden)`.
- **Catan.** The topbar is static HTML: replace the existing ☰ button element with the kit button at startup. `items()` on the home screen (detect with `$('#game').hidden`, not `G`) returns Rules only if a rules view exists, else `[]`. "Leave game" becomes "Back to setup" with **no** kit confirm (the game stays saved). Move the old menu's info line (Bank / Dev cards left / Playing to) into the Building costs modal. Floating is on while `#home` is shown **or** while the pass-and-play curtain is visible. Support `#continue`: on boot, if a save exists, run the existing resume path, then `history.replaceState(null,'',location.pathname)`.
- **Splendor.** "New game" item has **no** kit confirm (the game already shows its own confirm dialog). Setup screen: floating on, `items()` returns "How to play" only. Support `#continue` the same way as Catan, using the existing "Resume saved game" path.
- **Pictionary.** Remove the header "End game" button; End game lives only in the sheet as a confirm item. The menu button goes where End game was (top-right of `.top`). Floating on for the setup **and** final screens. Play `tick` only when `S.left` changes to a value from 10 down to 1 (the interval runs every 250 ms). Save shape is exactly as in section C; never save `tick`, `wake` or the `Set` itself (`used` is saved as an array). Restore: `secret` and `draw` screens resume at `handover`; `verdict` and `scores` resume as they were. Keep the game's own screen wake lock code as it is.
- **Chime rule (all games):** play `chime` when control passes from a different player to a human. In pass-and-play, play it when the pass-the-device screen appears, not when the hand is revealed. Never on page load, resume, or the very first turn.
- **All games** also add `<link rel="manifest" href="../manifest.webmanifest">` and `<link rel="apple-touch-icon" href="../icons/icon-180.png">`.

### E. Acceptance test changes
- Test 3: "Continue" for Catan and Splendor must land in the running game (via `#continue`), not on the setup screen. Codex shows "Continue" only after the setup choices are made.
- Test 6: on a 390 px phone the Codex header is two rows (brand + menu, then players), with no horizontal scroll.
- New test: with `shared/hubkit.js` blocked (Playwright route abort), every game still loads and plays.
- New test: while the sheet is open, pressing `f`, Ctrl+Z and Esc does not trigger game actions; Esc closes the sheet.

### F. Work split
1. Kit builder alone first: `shared/hubkit.js`, `shared/demo.html`. Touches nothing else.
2. Then in parallel, no file overlaps: (a) hub `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, README; (b) `codex/`; (c) `isles/`; (d) `gems/`; (e) `sketch/`.
3. Game builders do not edit `shared/hubkit.js`. They report kit bugs to the coordinator.
