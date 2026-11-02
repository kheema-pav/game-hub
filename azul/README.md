# Azul

Original JavaScript implementation of the standard coloured-wall base game for 2 to 4 players. Original geometric tile symbols and styling; no publisher artwork or upstream game code is bundled. Game design: Michael Kiesling. This fan version is not affiliated with the game's publishers.

Rules checked against the [official Next Move English rulebook](https://cdn.svc.asmodee.net/production-nextmove/uploads/sites/4/2024/06/EN-Azul-Rules-Next-Move-web.pdf). The optional grey-wall variant is not included. The starting player is selected reproducibly from the game seed; subsequent rounds use the first-player marker.

The engine separates taking a colour group and placing it, so players use a source/colour selection followed by a pattern-line or floor selection. Both stages belong to the same player. The runner supplies solo bots, same-device handover, online room replay and saves.

`engine.js` contains all rules and deterministic bots. `game.js` renders the public board and choices. `style.css` and `index.html` provide the responsive page. No neural model, analytics or external game service is required.

Run `node --test azul/engine.test.js` from the repository root. Tests include scoring fixtures, drafting/placement restrictions, floor overflow, bag refill, shared wins, immutable rejected actions, seeded repeatability and full games for all player counts and bot levels, with 100-tile conservation after every action.
