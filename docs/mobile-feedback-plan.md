# Mobile play feedback

- Fix first-load Codex setup redraws before a game exists; test player count, names, bot type and all difficulty buttons on a touch viewport.
- Keep room controls in the menu. Remove Splendor's remaining inline room-code label during play.
- Catan: legible player summaries with explicit built roads and longest route, including zero; avoid shrinking four players into unreadable columns.
- Shared activity view: scrollable recent completed turn/round plus the current one; tap to open full, scrollable history with keyboard and touch support. Preserve reading position during updates. Retain complete new-game logs; old saves can only show history previously saved.
- Catan: durable, named dice-result breakdown of resource gains, staggered receipt animations and tile highlights. No private resource steals/dev-card identities in public feedback. No historical animation flood on reconnect. Reduced-motion support.
- Splendor: visible actor and public move summary near the market, gem/card feedback tied to that actor even when their panel is offscreen.
- Review all ten games at phone/tablet/laptop widths. Fix observed clipping/interaction problems, preserving game rules and online record formats.
- Validate meaningful unit/replay tests, then real browser interaction, scrolling, keyboard focus, reduced motion, and screenshots. Push a new review PR, do not interrupt active games or force an update.

Review: full history cannot be reconstructed for old local saves whose log was truncated. Online histories should be rebuilt only from accepted records; previews must never reveal hidden tickets, reserved cards or objectives. Animation is presentation only and must not block legal moves or change outcomes. Compact feedback must take space in the layout, not cover the board or controls.
