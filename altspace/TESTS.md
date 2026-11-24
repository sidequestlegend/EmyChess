# chess-table: test evidence

Everything here ran on 2026-11-24 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor. Nothing ran
in the Altspace app, on a Quest, or with controllers (rung 5: not run; worlds stay Private).

How to run each rung again:

```
cd altspace/ts && npm test                                                    rungs 0 and 1
cd altspace/ts && npm run golden                                              remake vectors/upstream.json (dotnet 8)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                    rung 2 (Logs/portkit_check.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json chess-table   rung 3
portkit/tools/remote.sh altspace menu "PortKit/Multiplayer/Activate Player 2"
portkit/tools/playtest.sh altspace altspace/playtest/multi.json chess-table    rung 4
```

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **40 tests, 40 pass, 0 fail.**

### Golden vectors (`test/golden.test.ts`, 28 tests)

`golden/Harness.cs` compiles EmyChess's 13 runtime scripts **unchanged** with dotnet 8 against portkit's stand-ins
(`ts/portkit/golden/UdonStubs.cs`) and drives them through their own calls (`_ClearBoard`, `_SpawnPiece`,
`PiecePicked`, `PieceDropped`, `PromoteTo`, `OnDrop`, `GetTimeString`). `vectors/upstream.json` (1.2 MB) holds 22 suites
(the start position to depth 3, Kiwipete, the standard perft positions 3, 4 and 5, castling into, out of and through
check for both colours, en passant and en passant that uncovers a rank attack, a pawn off its home rank, fool's mate,
a back-rank mate, three stalemates, dead positions, promotions with and without capture: 1,124 positions, every legal
and pseudo-legal move list of every piece, every move played with its result and the position after), the state byte
(256 x 36 reads and writes), the capture-feasibility table (6 x 64 x 64), 682 drop positions, 682 ghost-piece drops and
15 clock texts. The TypeScript plays the same through its own calls on a `RulesBench`. Allowed differences, and only
these:

```
# kiwipete: 5 castling moves refused by the port (D1), 0 results that are draws by dead position (D2)
# castle out of check: 2 castling moves refused by the port (D1)
# castle through attack: 1 castling moves refused by the port (D1)
# black castles through attack: 1 castling moves refused by the port (D1)
# kings only: 9 results that are draws by dead position (D2)
# king takes the last piece: 1 results that are draws by dead position (D2)
# king and bishop: 8 results that are draws by dead position (D2)
# promotion: 1 results that are draws by dead position (D2)
# promotion with capture: 2 results that are draws by dead position (D2)
# perft start: port 20, 400, 8902; upstream 20, 400, 8902
# perft kiwipete: port 48, 2039; upstream 48, 2043
# perft position3: port 14, 191, 2812; upstream 14, 191, 2812
# perft position4: port 6, 264; upstream 6, 264
# perft position5: port 44, 1486; upstream 44, 1486
# ghost piece: 682 of 682 drops land elsewhere than upstream's (D5, D6)
```

The port gives the published perft counts everywhere. Upstream does too, except Kiwipete depth 2 (2043, four castlings
through check: upstream defect D1, a finding about upstream). Drops of a piece land exactly where upstream's `OnDrop`
puts them (rounding halves to even, deleting far off in Anarchy); clock texts match upstream's (with .NET Framework's
millisecond rounding, which the harness supplies) except hours of 24 and more (D14).

### Multi-player scenarios on the fake room (`test/scenarios.test.ts`, 12 tests)

Players act through the inputs a player has: clicks on the panel's button colliders, grabbing a piece, carrying it and
letting it go, clicking pieces and squares (the fake room honours layers: clicks reach layers 5 and 22 only, grabs
layer 20 only).

```
ok 1 - two players play a whole game (fool's mate); a watcher sees it all and can move nothing
ok 2 - click-to-move: castling both ways, en passant, promotion, check shown, a late joiner sees the position
ok 3 - promotion through the picker: only the promoting player sees it, every choice works, counters show the pools
ok 4 - the referee leaves mid-game: play goes on, nothing is reset
ok 5 - two tables in one room stay separate
ok 6 - automated clock: it switches with every move, and the referee calls time once
ok 7 - a registered player who leaves keeps the side for a minute, then the game ends and the side is free
ok 8 - a player who comes back within the minute keeps the side
ok 9 - anarchy: free moves, placing pieces with the ghost, deleting by dropping off the board, END TURN
ok 10 - the game's state fits the room's key budget
ok 11 - End Game while a promotion is open on the other page closes it there, and its buttons do nothing (D10)
ok 12 - manual clock: anyone may set time and switch it; the raised button switches, the lowered one does nothing
```

Every scenario ends with all clients holding the same state digest (`world.agree()`) and no error logged. The table
costs 5 space-state leaves per copy (one sync group for the whole table) and no user state.

## Rung 2: the kit in edit mode (`PortKit/Kit/Check`)

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS chess-table bindings: 223 objects resolve by path; hash matches
PASS chess-table android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 454/1789, behaviours 443, scripts 11, ...
PASS chess-table windows bundle: PASS Kind=Pass Reasons=[] Reports=[] ...
DONE
```

Graph members used: relay 36 and spin 3, all on the SDK allow list of 29,061. Bundles: Android 1.6 MB, Windows 2.6 MB,
each with the third-party notices inside.
