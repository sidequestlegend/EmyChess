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

Graph members used: relay 36 and spin 3, all on the SDK allow list of 29,061. Final bundles: Android 1,606 KiB, Windows
2,152 KiB, each with the third-party notices inside.

Artifacts (`PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): `android/chess-table`,
`windows/chess-table`, `pk-chess-table.js` (GPL-3.0 header), `chess-table.jpg`, `chess-table.snippet.html` (with the
game's settings and `position="0 0.75 0"`), `manifest.json` (checks android PASS, windows PASS, bindings
`ec156bc0565c701559fee99e289c187132131af8`).

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="chess-table" ... auto-timer="true" clock="600">` with the built script and both bundles
from the test's local server (`?v=<sha1>` on the bundle addresses), and `Assets/WebRoot/playtest/chess-playtest.js`,
which drives the table through the SDK's desktop player with portkit's InputSim (a mouse of the test's own: the SDK casts
its own rays and raises click, grab and drop) and reads Unity back with the `probe` command. One player holds both
sides (F7). **RESULT 22 passed, 0 failed; 0 console error lines**, on the exported bundles (`playtest/evidence_single.txt`, screenshot
`playtest/evidence_single_mate.jpg`).

```
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS the kit is in the scene: pieces in their pools, the main menu showing: holder True, pawn0 active False, main menu True
PASS a fresh table takes the element's settings: auto-timer true, clock 600
PASS Join White and Join Black reach the script (UI colliders, real mouse): white Main Editor, black Main Editor
PASS the panel's name text reached Unity (relay op text): Main Editor
PASS Start Game sets up the 32 pieces: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
PASS the e2 pawn stands on e2 (positions read back from Unity): square 0.031 0.832 0.594, piece 0.031 0.831 0.594
PASS White's pieces are on the Grabbable layer, Black's on the UI layer
PASS the automated clock starts with White's time
PASS f2f3 is played (grabbed and let go (in place, then the square clicked: see TESTS.md))
PASS e7e5 is played (grabbed and let go (in place, then the square clicked: see TESTS.md))
PASS g2g4 is played (click a piece, click a square)
PASS d8h4 is played (grabbed and let go (in place, then the square clicked: see TESTS.md)): rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR
PASS fool's mate is checkmate, Black wins: state 1
PASS the banner's text reached Unity: CHECKMATE! Winner: Main Editor
PASS the banner shows
PASS the checked king's square is red (D3 fixed): 1.000 0.000 0.000 0.600
PASS nothing can be picked up after the result (D9)
PASS the clock switched at every move: MOVES 005: 005
PASS the clock is frozen at the result and shows HH:MM:SS (LCD digits): 00:09:55 499, then 00:09:55 499
PASS End Game clears the board (the pieces are switched off in Unity): 8/8/8/8/8/8/8/8, pawn0 active False
PASS the credits panel opens and closes: True, False
```

**A quick click on a piece on the Grabbable layer** reached the page as a grab and a drop (which chooses the piece) in
one run and as nothing at all in another. The test then does what a player would: hold the button a moment and let go
in place. In the final run the quick click registered. Clicks on the UI layer (squares, the opponent's pieces, the
panel's buttons) registered every time.

**What "grabbed" means here.** The desktop grab works: the page hears `grab` when the button goes down and `drop`
when it comes up (the page's own listener and the game's trace agree), and the dropped piece's position is read back.
But a piece held with the test's mouse does not follow the pointer: InputSim moves the cursor by absolute position, and
the SDK's desktop hand evidently carries a held object by another input (mouse movement or the camera). So each grab
was let go on its own square, which the port treats as choosing the piece (its legal squares light up), and a click on
the target square made the move. Carrying a piece across the board and letting it go over another square, the path a
headset player uses, is covered by the fake-room scenarios (with the host moving the object) and the golden vectors for
the drop mapping, but **not by Play mode**.

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone (`PortKit/Multiplayer/Activate Player 2`) open the same page. The
player whose session id sorts first takes White, the other Black; they follow each other through the table's state and
exchange state digests at checkpoints as one-shots (which the runtime ignores). After the fourth move Black reloads its
page. **RESULT 28 passed, 0 failed**, twice, the second time on the exported bundles (`playtest/evidence_multi.txt`).

```
[main] PASS one player holds White, the other Black, and the game starts: white Player 2, black Main Editor
[main] PASS Black cannot pick up or choose White's pieces: layer 5, rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
[vp-...] PASS e2e4 played by White          [main] PASS e2e4 arrives at the other player
[main]   PASS e7e5 played by Black          [vp-...] PASS e7e5 arrives at the other player
[vp-...] PASS g1f3 played by White          [main] PASS g1f3 arrives at the other player
[main]   PASS b8c6 played by Black          [vp-...] PASS b8c6 arrives at the other player
[main] (Black reloads its page)
[main] PASS the kit loads from a hand-written bs-snippet and the instance starts
[main] PASS after reloading its page Black sees the position (late join): r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R
[main] PASS Black is still Black after the reload (sides are user ids): Main Editor / Main Editor
[vp-...] PASS Black's page, reloaded, holds the same state as White's (digest): 3fac22d2 / 3fac22d2
[vp-...] PASS f1c4 played by White          [main] PASS f1c4 arrives at the other player
[main]   PASS g8f6 played by Black          [vp-...] PASS g8f6 arrives at the other player
[main] PASS both pages reach the same state digest after the last move: ebb0521b / ebb0521b
```

The final run (on the exported bundles) had one error line in the main editor's console, an earlier run two, all the SDK's: a `NullReferenceException` in `BS.BSScene.Click`
(`BSScene.cs`) when the bystander check let go of a long press on a piece on the UI layer (nothing happened, as the
check wanted; it looks like the desktop controller calling Click with no object), and "Failed to load after 25 seconds
... (state SCENE_START): no component is still loading" while Black's page reloaded (the page then loaded and passed).

## What remains unverified

- **Everything in the app and in a headset (rung 5):** grabbing a 3 to 10 cm piece with a hand and carrying it, laser
  clicks on the UI layer, the read-back of a dropped piece's position on Quest, relay and clock rates on Quest, frame
  time with the kit's 52 TextMesh Pro texts, sound (the relay `audio` op is built and its records are checked in the
  fake room; nobody listened in Play mode), and the first-grab-of-a-session quirk in the app.
- **Carrying a grabbed piece in Play mode** (above): only grab-and-let-go-in-place was driven.
- **Anarchy mode, the ghost piece, promotion and the manual clock in Play mode:** covered in Node only.
- **Leaving and the 60 s grace with two real clients:** covered in Node (a player leaves; one comes back); in Play mode
  only a reload (a quick return) ran.
- **Two tables in one Play-mode page:** covered in Node only (the kit's own S1 spike ran two copies of a kit in Play).
- **The kit at other scales**: tested at the default (1/16 of upstream); the `scale` setting multiplies it.
