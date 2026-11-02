# Ticket to Ride: USA Classic and Europe Classic

Original deterministic JavaScript engine and SVG railway diagram, integrated with Game Hub's shared local/online runner. No game-board scans, publisher illustrations, card artwork, or third-party game engine are included.

## Editions and complete data

| Edition | Cities | Route lanes | Train spaces | Destination tickets | Tunnels | Ferry lanes |
|---|---:|---:|---:|---:|---:|---:|
| USA Classic | 36 | 100 | 309 | 30 | 0 | 0 |
| Europe Classic | 47 | 101 | 300 | 46 (40 regular, 6 long) | 18 | 13 |

Parallel lanes count as separate routes. Europe's ferry lanes require 17 locomotive cards in total across the map. Data fixtures check all counts and ensure every endpoint exists. These are full classic maps, not reduced teaching maps.

USA uses the classic 30-ticket edition: deal three destination tickets, keep at least two. This is deliberately distinct from the refreshed 2025 USA product, whose official rulebook has 33 tickets and deals four. Europe deals three regular tickets and one long ticket, keeps at least two and removes initial rejected tickets and undealt long tickets from play.

Both editions have 110 train cards (12 in each of eight colours, plus 14 locomotives), four starting cards and 45 trains per player. Both support 2-5 players.

## Data sources and licences

- USA route/ticket tables and normalized city coordinates adapted from [Robert Bettles' TicketToRideAnalysis](https://github.com/Rob217/TicketToRideAnalysis/tree/master/data/USA), MIT, copyright 2020 Robert Bettles. Full licence retained in [vendor/robert-bettles-MIT.txt](vendor/robert-bettles-MIT.txt).
- Europe route/ticket facts adapted from [s03ram/ticket-to-ride-europe/data.py](https://github.com/s03ram/ticket-to-ride-europe/blob/main/data.py), MIT, copyright 2025 seram03. Full licence retained in [vendor/seram03-MIT.txt](vendor/seram03-MIT.txt).
- Europe route lane facts were cross-checked against the independent [jkornel44 transcription](https://github.com/jkornel44/Ticket-to-Ride-Europe/blob/main/src/constants/connections.js). No source code or artwork from that repository is bundled. This check identified three source-data corrections: missing Amsterdam-Frankfurt (2 white), Angora-Smyrna is length 3, and Brindisi-Palermo requires 1 locomotive. The source's `grey` means black; its empty colour means an unrestricted grey route. Five destination-city spelling errors were normalized (`paris`, `Muchen`, `Sevastopl`, `Venizia`, `Athena`). Europe's city positions are an original schematic layout.
- Rules checked against the publisher's [Europe classic rulebook](https://games-for-you.oozmi-cdn.com/products/db57155a-6ffe-45e5-ad38-93b0ee738d8a/pdfs/ticket-to-ride-europe_rulebook_en.pdf) (2015 Days of Wonder PDF, hosted by a retailer) and [USA official rules](https://www.daysofwonder.com/game/ticket-to-ride/). Classic USA setup is described above rather than silently adopting the refreshed deck.

Ticket to Ride is a game by Alan R. Moon and a trademark of Days of Wonder/Asmodee. Upstream MIT permissions concern the adapted software/data contributions and do not grant publisher trademarks or artwork. This is an unofficial fan implementation.

## Rules implemented

- Blind/face-up card draws, face-up locomotive restrictions, immediate market replacement, three-locomotive market refresh, discard reshuffles and unrestricted hand size.
- Colour sets, any-colour grey routes, voluntary locomotive substitution and full-route train supply checks.
- Parallel-route restrictions: one lane only with 2/3 players, different owners with 4/5; no player can own both lanes.
- Destination selection at setup and later turns; only newly drawn tickets can be rejected, with edition-correct initial rejection handling.
- Europe ferry locomotive minimums and tunnels with three-card reveal, extra payment or voluntary abort. An all-locomotive tunnel payment matches only revealed locomotives. Tunnel payments stay in escrow and cannot reappear in the reveal deck.
- Europe stations cost 1/2/3 matching cards, one station per city and up to three per player. Final station assignments choose one opponent route per station consistently for all destination tickets. Borrowed routes never extend the longest route. Unbuilt stations score four points each.
- A full final round after a player reaches two trains or fewer, including one more turn for the triggering player.
- Exact longest edge-trail calculation: cities can repeat, individual routes cannot. Route points, positive/negative tickets, shared longest-route bonuses, completed-ticket tie-breaks, Europe's unused-station tie-break and shared victories.

Choices are staged so there is one active player at a time. Selecting a route, choosing its payment, inspecting a tunnel and assigning final stations are separately replayable actions. Selecting/cancelling an unrevealed payment does not consume the turn.

Two deterministic exhaustion safeguards address unusual physical-game stalemates: if fewer than three non-locomotives remain drawable, a market that cannot satisfy its normal refresh rule stays face down and blind draws remain available; if every player has no possible action, the game scores instead of running forever. Neither automatically forfeits a player's turn while a legal action exists. Online starting order comes from the shared seeded room order, rather than players' travel histories.

## Files and checks

- `data.js`: complete immutable-by-convention map facts.
- `engine.js`: create/actor/legal/apply/bot and scoring, without browser or clock dependencies.
- `game.js`, `style.css`: original board and private-hand interface, grouped route selection, ticket toggles and staged payments.
- `test/engine.test.js`: rules fixtures, conservation, rejected-action immutability, seeded repeatability and full games for 2/3/4/5 players in both editions.

Run `node --test ticket/test/*.test.js` from the repository root. Bots use their own cards/tickets and public routes, not opposing private hands; normal/hard prioritize paths toward their tickets, easy varies among affordable claims. They are practical opponents, not a claim of championship play.

## Geographic board (November 2026)

The display now uses real geographic coordinates and Natural Earth's public-domain
1:110m country outlines and lakes, projected into a local SVG. Both USA and Europe maps are
bundled in `geography.js`; no map service, tracking, API key, or network request is
needed during play. City coordinates are rounded for this display. The historical
city names used by the Europe game are retained. Outlines show contemporary
geography, not historical borders.

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
Lake source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_lakes.geojson
License: https://www.naturalearthdata.com/about/terms-of-use/ (public domain).

Destination previews are independent of the keep/discard choice. Their A/B city
markers and dashed guide show the destination pair, not a claimable railway or a
suggested path. Railway selection highlights its actual train spaces; route IDs,
engine rules, online records, and saved games are unchanged.
