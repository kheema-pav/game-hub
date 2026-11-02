# Azul

Original JavaScript implementation of the standard coloured-wall base game for 2 to 4 players. Original geometric tile symbols and styling; no publisher artwork or upstream game code is bundled. Game design: Michael Kiesling. This fan version is not affiliated with the game's publishers.

Rules checked against the [official Next Move English rulebook](https://cdn.svc.asmodee.net/production-nextmove/uploads/sites/4/2024/06/EN-Azul-Rules-Next-Move-web.pdf). The optional grey-wall variant is not included. The starting player is selected reproducibly from the game seed; subsequent rounds use the first-player marker.

The engine separates taking a colour group and placing it, so players use a source/colour selection followed by a pattern-line or floor selection. Both stages belong to the same player. The runner supplies solo bots, same-device handover, online room replay and saves.

`engine.js` contains all rules and deterministic bots. `game.js` renders the public board and choices. `style.css` and `index.html` provide the responsive page. No neural model, analytics or external game service is required.

Bot levels are Easy, Normal, Hard and Expert. Easy makes varied, simple legal
choices. Normal prefers usable groups and completed pattern lines. Hard projects
the current round's wall scores, floor costs, incomplete lines and mosaic bonuses,
and considers the next player's best visible pick. Expert gives more weight to
denying valuable completions. Both stronger levels avoid voluntarily ending the
game behind when a useful alternative exists. They inspect public boards and tile
supply only, never the hidden bag order or future deals.

These are bounded heuristics, not a solved-game search or guaranteed win rates.
In a calibration check using held-out seeds 101–120 with seats swapped (40 games
per pairing), Hard beat Normal 25–15, Expert beat Hard 26–14, and Expert beat
Normal 28–12. Human experience and multiplayer strength may differ.

Run `node --test azul/engine.test.js` from the repository root. Tests include scoring fixtures, drafting/placement restrictions, floor overflow, bag refill, shared wins, immutable rejected actions, seeded repeatability, public-information-only decisions, denial and endgame choices, and full games for all player counts and four bot levels, with 100-tile conservation after every action.
