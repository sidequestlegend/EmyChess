# chess-table: test evidence

Everything here ran on 2026-11-24 and (this pass) 2026-11-25 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor. Nothing ran
in the Altspace app, on a Quest, or with controllers (rung 5: not run; worlds stay Private).

**Re-run on the fixed kit (portkit c7abead..1118ef0), 2026-11-24.** `portkit/tools/sync.sh chess-table` mirrored the
runtime into `ts/portkit` and the Unity package. Changes for the game: `Piece.networkCallable = ["PieceMovedAudio",
"PieceCapturedAudio"]` (the only methods chess reaches by `SendCustomNetworkEvent`, from `Piece.OnDrop` and
`PiecePlacer.PlaceAt`; chess sends no `SendCommand`), and the key-budget test (acks and draw numbers moved to the
referee's user state: 3 space leaves per table, not 5). Without the list, the fool's-mate scenario fails on the
refused sound events. Every rung below was run again and passes; the numbers are from that run. One fix on the way:
`ChessKitBuilder` rewrote its materials from fresh ones without URP's validation, so a rebuild kept every material's
motion-vector pass (and the transparent ones' depth and shadow passes) and the Windows bundle grew 25% (2,683 KiB);
it now runs URP's `BaseShaderGUI.SetMaterialKeywords` on them, and the materials come out identical to the ones
verified before.

**Re-run on portkit 812f285 with the review's fixes, 2026-11-25.** `sync.sh chess-table` mirrored the kit again (no
game workaround to remove). The independent review's seven findings (`REVIEW-FINDINGS.md`, chess-table; PORT.md 10.8)
were fixed, each with a Node test that failed before its fix (`test/review.test.ts`, the strengthened
`test/golden.test.ts`, `playMove` in `test/helpers.ts`). The clock became a sync group of its own (the race test
showed a clock press at the moment of a move undoing the move once the kit's write order was fixed). Every rung was
run again (the sections below now give the c971100 run's numbers), with the earlier runs' notes kept where they still explain
something.

**Re-run on portkit c971100 (re-sync round 2), 2026-11-25.** `sync.sh chess-table` mirrored the kit again; no game
code changed and the bindings hash did not move (`570f51b0...`). The kit builder now gives each of the 70 grabbable
pieces a `BSPlayerEvents` with its events made, which works around the SDK's `BSScene.Click` null `onClick` (found by
this game in the last pass): **a click on a piece now reaches the page in Play mode.** So the Play-mode tests capture by
clicking the captured piece itself again (`targetAim` aims at the piece, not at the square's edge beside it), a new
check says each capture's click was heard on the piece (`click pawn6`, `click rook1` from the page's own listener), and
the promotion is a capture onto h8 (g7xh8, the rook clicked), as it was meant to be before the click bug moved it to
the empty g8. `dist/` now carries the licence texts (`dist/licenses/chess-table/`). Every rung was run again; the
sections below give this run's numbers.

How to run each rung again:

```
cd altspace/ts && npm test                                                    rungs 0 and 1
cd altspace/ts && npm run golden                                              remake vectors/upstream.json (dotnet 8)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                    rung 2 (Logs/portkit_check.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json chess-table   rung 3
portkit/tools/playtest.sh altspace altspace/playtest/multi.json chess-table    rung 4
```

## Page script on portkit 552622c, 2026-11-25 evening

Re-synced `ts/portkit` and the package to portkit `552622c`. That commit includes `425bd55`: the page loads kit
items one at a time, because overlapping loads lost relay graphs and Variables in the app. It also includes
`0880bf5`: a referee claimant starts only once its claim has stood for 1.5 s, which fixes the equal-term double
claim, and user-state flushes go one at a time. The bundles are unchanged from the rebuild below. `npm test`:
**53 of 53** (0 failed). `npm run build`: 502194 bytes. Export Artifacts -> `dist/`: 9 files (4 licence texts), footprint 0.88 x 0.24 x 1 m, bindings 570f51b07013d2ca2f36dbf48a01db107e487d7d. Rung 4 again on this script (pages start up to 1.5 s later now): **47 passed, 0 failed**, 0 console error lines (`playtest/evidence_multi.txt`).

## Canvas colliders, 2026-11-25 evening (portkit 476075d)

In world 9d7311 the SDK's `BSKitItem` gave every world-space canvas without a BoxCollider a solid one when the kit
loaded: rect x scale, on the canvas's layer. rp-toolkit's head-label canvas then pushed its wearer about (measured in
the hub's Play mode, portkit GAPS.md "Fourth pass"). Re-synced to portkit `476075d`, whose builder gives every
world-space canvas a trigger box of its own first, and whose `PortKit/Kit/Check` fails a canvas that would end up
solid. Rebuilt:

- Build Prefabs: 12 trigger boxes added to world-space canvases, 0 canvas boxes made triggers.
- rung 0/1: `npm test` **53 of 53** (0 failed). `npm run build`: 499377 bytes.
- rung 2: Check all PASS (bindings `570f51b0`, the new "canvas colliders" line, both bundles). Android 1676 KiB, Windows 2212 KiB.
- rung 3 (`playtest/single.json`, chess-single): **28 passed, 0 failed**, 0 console error lines (`playtest/evidence_single.txt`).
- rung 4 (`playtest/multi.json`, chess-multi): **47 passed, 0 failed**, 0 console error lines (`playtest/evidence_multi.txt`).
- `dist/` exported: 9 files (4 licence texts), footprint 0.88 x 0.24 x 1 m, bindings 570f51b07013d2ca2f36dbf48a01db107e487d7d.

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **53 tests, 53 pass, 0 fail** (on portkit c971100 as on 812f285; 40 before the review's
tests).

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
these (since the review: a refused castling is recognised by the test's own attack check from the position, not by
the port's `CastlesThroughCheck`; it is excused only in its own position; and the port's moves must be exactly
upstream's less those castlings, where a `>=` count stood before. With `CastlesThroughCheck` sabotaged to refuse
every castling, the old test failed only its perft test, the new one 8 tests):

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

### Multi-player scenarios on the fake room (`test/scenarios.test.ts`, 12 tests; `test/review.test.ts`, 13 tests)

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

A move the scenarios expect to be made goes through `playMove`, which fails unless the piece now stands on the target
square (as the promoted type when the move names one), its square is empty and the turn passed (the review: `grabMove`
only said the piece was picked up). The review's findings, each failing before its fix:

```
ok 1 - a spectator presses +1m in the same tick as White's move: the move counts once, and White cannot move again
ok 2 - a spectator presses +1m 50 ms after White's move: the move counts once, and White cannot move again
ok 3 - a spectator presses +1m 150 ms after White's move: the move counts once, and White cannot move again
ok 4 - a spectator presses +1m 300 ms after White's move: the move counts once, and White cannot move again
ok 5 - a spectator presses RESET in the same tick as White's move: the move counts once, and White cannot move again
ok 6 - with the automated clock, a spectator's RESET at the moment of a move does not undo the move
ok 7 - a move is one state write, and a watcher never sees the piece moved with the turn not passed
ok 8 - a reload while the promotion choice is open brings the picker back, and the promoter cannot move another piece
ok 9 - a late joiner during a pending promotion sees no picker; End Game clears the pending promotion
ok 10 - castling out of check is refused through the game flow too (D1)
ok 11 - a player who comes back within the minute and leaves again has a whole minute again
ok 12 - a drop before the board's position is known puts the piece back with no tints or locks left
ok 13 - End Game while a piece is held lets go of it, and the drop does nothing
```

Run against the code before the fixes (a copy of the previous commit with these tests): on the old kit, tests 1-9 and
11 fail (10 of 13); on the new kit with the old game code, 1, 2, 5, 6, 8, 9 and 11 fail (the same-tick races: the move
is undone; 3, 4 and 7 pass: the kit's one-write rule fixed the double move). Test 12 fails on the old `Piece.ts` once
the board ignores a degenerate frame (the old code turned it into NaN squares and refused the drop by chance). Test 13
covers `ReleaseGrab()`, which calls the same thing as the old `host?.releaseGrab()`: no behaviour changed.

Every scenario ends with all clients holding the same state digest (`world.agree()`) and no error logged (a refused
network event is logged, so a missing `networkCallable` entry fails the run). The table costs 5 space-state leaves per
copy (`ref`, and two sync groups, the table and the clock, each an owner and a value leaf) and no user state of its
own (the referee's command acknowledgements live in its user state).

## Rung 2: the kit in edit mode (`PortKit/Kit/Check`)

After `Build Prefabs` (bindings unchanged on c971100: 223 bound, 70 grabbable, 90 clickable, hash `570f51b0...`),
`npm run build` and `Build Bundles`:

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS chess-table bindings: 223 objects resolve by path; hash matches (570f51b07013d2ca2f36dbf48a01db107e487d7d)
PASS chess-table android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 595/1934, behaviours 583, scripts 12, calls 0, animation events 0, graph blobs 77 (375 KiB), ...
PASS chess-table windows bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=... objects 595/1934, behaviours 583, scripts 12, ... graph blobs 77 (375 KiB), ...
DONE
```

Relay graph: 620 units, 52 distinct members (the kit's `pkHead` op and per-target `rbLaunch` are new), all on the SDK
allow list of 29,061. 140 behaviours more than on 812f285 (443): a `BSPlayerEvents` on each of the 70 pieces (the
click fix) and an Object-variables holder on each of the 70 pieces' Rigidbodies (the per-target `PkLaunchVelocity` /
`PkLaunchSteps`, declared on every Rigidbody; chess never launches anything: kit gaps in the report), which is also
where the 70 extra graph blobs (316 to 375 KiB) come from. Each bundle carries the notices and four full licence texts
(`CC-BY-SA-4.0.txt`, `GPL-3.0.txt`, `OFL-DSEG.txt`, `LiberationSans - OFL.txt`). Bundle sizes: **Android 1,677 KiB,
Windows 2,215 KiB** (1,664 and 2,211 KiB on 812f285; 1,624 and 2,164 KiB before that).

Artifacts (`PortKit/Kit/Take Photos`, then `Export Artifacts`, `altspace/dist/`, not committed): `android/chess-table`
(1,716,762 bytes, sha1 `50e03058...`), `windows/chess-table` (2,268,332 bytes, `b06abcdb...`), `pk-chess-table.js`
(GPL-3.0 header, then portkit's MIT notice; 499,377 bytes, `b012523c...`), `chess-table.jpg` (footprint 0.88 x 0.24 x
1.00 m, as before), `chess-table.snippet.html`, **`licenses/chess-table/`** (new: `CC-BY-SA-4.0.txt`, `GPL-3.0.txt`,
`OFL-DSEG.txt`, `LiberationSans - OFL.txt`, the texts the bundles carry, each with its sha1 in the manifest) and
`manifest.json` (9 files; checks android PASS, windows PASS, bindings `570f51b0...`). The bundles the Play-mode runs
below loaded (`Library/PortKit/kits/...`) have the same sha1 as the exported ones, and so does the script.

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="chess-table" ... auto-timer="true" clock="600">` with the built script and both bundles
from the test's local server (`?v=<sha1>` on the bundle and script addresses), and `Assets/WebRoot/playtest/chess-playtest.js`,
which drives the table through the SDK's desktop player with portkit's InputSim (a mouse of the test's own: the SDK casts
its own rays and raises click, grab and drop) and reads Unity back with the `probe` command. One player holds both
sides (F7). **RESULT 28 passed, 0 failed; 0 console error lines, twice in a row** on the c971100 bundles
(`playtest/evidence_single.txt` and `playtest/evidence_single_mate.jpg` are the second run; 27 of 27 on 812f285). New
on c971100: the captures (h4xg5, and g7xh8 with promotion) are clicks on the captured piece, and a check says the page
heard each (below). New since the review: the
move sound is checked to play (sent after the move's write now), the credits panel's state is polled (a probe runs
ahead of the relay: the first run of this pass read it too early, left the panel open over the board, and the next
game never started), and a second game is played to a promotion (D25):

```
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS the kit is in the scene: pieces in their pools, the main menu showing: holder True, pawn0 active False, main menu True
PASS a fresh table takes the element's settings: auto-timer true, clock 600
PASS Join White and Join Black reach the script (UI colliders, real mouse): white Main Editor, black Main Editor
PASS the panel's name text reached Unity (relay op text): Main Editor
PASS Start Game sets up the 32 pieces: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
PASS the e2 pawn stands on e2 (positions read back from Unity): square 0.031 0.482 0.444, piece 0.031 0.504 0.444
PASS White's pieces are on the Grabbable layer, Black's on the UI layer
PASS the automated clock starts with White's time
PASS the move sound plays on the moved piece (sent after the move's write): True
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
PASS the clock is frozen at the result and shows HH:MM:SS (LCD digits): 00:09:52 512, then 00:09:52 512
PASS End Game clears the board (the pieces are switched off in Unity): 8/8/8/8/8/8/8/8, pawn0 active False
PASS the credits panel opens and closes: True, False
PASS a second game starts: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
INFO h4g5 capture: the click on pawn6 reached the page
INFO g7h8 capture: the click on rook1 reached the page
PASS each capture is a click on the captured piece, and the page hears it (the kit's click fix): [{"move":"h4g5","piece":"pawn6","reached":true},{"move":"g7h8","piece":"rook1","reached":true}]
PASS a pawn taking on h8 opens the picker, and the pending promotion is shared state: rnbqkb1P/1ppppp1p/5n2/p7/8/8/PPPPPPP1/RNBQKBNR, promotionSquare 63, picker True
PASS nothing can be picked up while the choice is pending (b1 and a5 on the UI layer)
PASS the queen is chosen: h8 is a white queen, the picker closes, Black is to move: rnbqkb1Q/1ppppp1p/5n2/p7/8/8/PPPPPPP1/RNBQKBNR
```

The game's trace for the captures ends `click pawn 6,4` and `click rook 7,7`: the move was finished by the click on the
piece, which the page heard (its own `click` listener on `pawn6` and `rook1`). (The e2 pawn's y, 0.504, is the same in the
812f285 evidence file; the 0.481 this section quoted before came from an older run.)

The reload during the promotion is in rung 4: a single player's reload empties the room, and an empty room starts a
fresh table (`whenEmpty` "reset"), so there is nothing to come back to.

**A click on a piece never reached the page in Play mode before portkit c971100 (found in the 812f285 pass; the
paragraph is kept for the record).** The kit builder now puts a `BSPlayerEvents` with its events made on each
grabbable, BS Held Events takes that one, and the click reaches the page (above); the SDK itself is unchanged. As it
was: every piece is a BS Grababble; the
SDK's `BSGrababble` adds `BSHeldEvents`, which adds a `BSPlayerEvents` with `AddComponent` whose `onClick` stays null,
and `BSScene.Click` calls `interaction.onClick.Invoke(...)` without a null check (`BSScene.cs:443`): the click throws
`NullReferenceException` before `link.OnClick`, so the page never hears it. This is the console error the earlier runs
saw and put down to a bystander's press. Clicking a piece on the Grabbable layer still works (the SDK treats it as a
grab and a drop, which chooses the piece), and squares and panel buttons are unaffected. What it breaks in Play mode:
choosing an opponent's piece as a capture target by clicking it, and choosing a piece with `input="click"`. The tests
capture by clicking the target square beside the piece (`targetAim`), which the game takes as the same move. A capture
whose square is hidden behind another piece from the desktop camera (h7 in front of h8) cannot be clicked that way, so
the Play-mode promotion is on an empty square (g8). If the app's host shares this code, click-to-move captures there
need the square's edge too, and `input="click"` cannot choose a piece: reported as an SDK gap (fix: initialise the
`BSPlayerEvents` events, or `onClick?.Invoke`).

**A quick click on a piece on the Grabbable layer** reached the page as a grab and a drop (which chooses the piece) in
some runs and as nothing at all in others. The test then does what a player would: hold the button a moment and let go
in place. Clicks on the UI layer (squares, the panel's buttons) registered every time.

**What "grabbed" means here.** The desktop grab works: the page hears `grab` when the button goes down and `drop`
when it comes up (the page's own listener and the game's trace agree), and the dropped piece's position is read back.
But a piece held with the test's mouse does not follow the pointer: InputSim moves the cursor by absolute position, and
the SDK's desktop hand evidently carries a held object by another input (mouse movement or the camera). So each grab
was let go on its own square, which the port treats as choosing the piece (its legal squares light up), and a click on
the target square made the move. Carrying a piece across the board and letting it go over another square, the path a
headset player uses, is covered by the fake-room scenarios (with the host moving the object) and the golden vectors for
the drop mapping, but **not by Play mode**.

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone open the same page (`playtest.sh` starts Player 2 and waits for it).
The player whose session id sorts first takes White, the other Black; they follow each other through the table's own
state and exchange state stamps (digest at a `version()`) at checkpoints as one-shots, compared only at equal versions.
They play the promotion line `h2h4 g7g5 h4xg5 g8f6 g5g6 a7a6 g6g7 a6a5 g7xh8` (on c971100 the promotion is a capture
onto h8 again, and both captures are clicks on the captured piece; on 812f285 it ended `g7g8`). Black reloads its page
after the fourth move; White reloads its page while its promotion choice is open, finds the picker open again, and
chooses a queen. **RESULT 47 passed, 0 failed (main 23, Player 2 24), twice in a row** on the c971100 bundles (46 of 46
on 812f285; the new check is White's "each capture is a click on the captured piece"). Console errors: 1 line in the
first run, the SDK's `Failed to load after 25 seconds: http://localhost:42200 (state SCENE_START): no component is still
loading (1 registered)` in the main editor after Black's page reload (the page had loaded, `bs-loaded` at 244 ms, and
every check after it passed); 0 in the second (`playtest/evidence_multi.txt`). Black's bystander press on White's e2
pawn (layer 5) now reaches the page instead of throwing in `BSScene.Click`, and changes nothing, as the check wants. In
the second run Player 2 played White:

```
[vp-...] PASS one player holds White, the other Black, and the game starts: white Player 2, black Main Editor
[main]   PASS Black cannot pick up or choose White's pieces: layer 5, rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
[vp-...] PASS h2h4 played by White           [main]   PASS h2h4 arrives at the other player
[main]   PASS g7g5 played by Black           [vp-...] PASS g7g5 arrives at the other player
[vp-...] PASS h4g5 played by White           [main]   PASS h4g5 arrives at the other player
[main]   PASS g8f6 played by Black           [vp-...] PASS g8f6 arrives at the other player
[main]   (Black reloads its page)
[main]   PASS after reloading its page Black sees the position (late join): rnbqkb1r/pppppp1p/5n2/6P1/8/8/PPPPPPP1/RNBQKBNR
[main]   PASS Black is still Black after the reload (sides are user ids): Main Editor / Main Editor
[vp-...] PASS Black's page, reloaded, holds the same state as White's (digest at the same version): 13:17dfac2f fb9373cb / 13:17dfac2f fb9373cb
(g5g6, g6g7, g7h8 played by White and a7a6, a6a5 by Black, each PASS on its page and PASS "arrives" on the other)
[vp-...] PASS each capture is a click on the captured piece, and the page hears it (the kit's click fix): [{"move":"h4g5","piece":"pawn6","reached":true},{"move":"g7h8","piece":"rook1","reached":true}]
[vp-...] PASS g7h8: White's picker opens and the pending promotion is shared: promotionSquare 63
[main]   PASS Black sees the pending promotion (shared) and no picker: promotionSquare 63
[main]   PASS Black cannot move while White's choice is pending: rnbqkb1P/1ppppp1p/5n2/p7/8/8/PPPPPPP1/RNBQKBNR
[vp-...] PASS both pages hold the same state with the promotion pending (digest at the same version): 22:370a1141 9dee00a6 / 22:370a1141 9dee00a6
[vp-...] (White reloads its page)
[vp-...] PASS after White's reload during the promotion choice the picker is open again (D25): rnbqkb1P/1ppppp1p/5n2/p7/8/8/PPPPPPP1/RNBQKBNR, promotionSquare 63, picker True
[vp-...] PASS White is still White and still to move: Player 2 / Player 2
[vp-...] PASS White cannot pick up another piece while the choice is pending: b1 on the UI layer
[vp-...] PASS White chooses the queen after the reload: h8 is a queen, the picker closes, Black to move: rnbqkb1Q/1ppppp1p/5n2/p7/8/8/PPPPPPP1/RNBQKBNR
[main]   PASS White's queen (chosen after White's reload) arrives at Black, and it is Black's move: rnbqkb1Q/1ppppp1p/5n2/p7/8/8/PPPPPPP1/RNBQKBNR
[main]   PASS both pages reach the same state after the promotion (digest at the same version): 23:c63f17a1 21b6eadd / 23:c63f17a1 21b6eadd
```

## What remains unverified

- **Everything in the app and in a headset (rung 5):** grabbing a 3 to 10 cm piece with a hand and carrying it, laser
  clicks on the UI layer, the read-back of a dropped piece's position on Quest, relay and clock rates on Quest, frame
  time with the kit's 52 TextMesh Pro texts, hearing the sounds (Play mode checks that the move sound's AudioSource
  plays; nobody listened), and the first-grab-of-a-session quirk in the app.
- **Piece clicks in the app:** in Play mode the kit's `BSPlayerEvents` on each piece (portkit c971100) gets clicks on
  a piece on layer 5 to the page (rung 3 and 4: captures by clicking the captured piece); whether the app's own code
  had the SDK's null `onClick` and whether the kit's fix carries over there is not known. `input="click"` (every piece
  on layer 5, a piece chosen by clicking it) uses the same path but was not run in Play mode.
- **Carrying a grabbed piece in Play mode** (above): only grab-and-let-go-in-place was driven.
- **The move races of the review** (a spectator's clock press at the moment of a move): Node only (the fake room
  reproduces the relay's ordering; two real clients cannot be timed to a tick).
- **Anarchy mode, the ghost piece and the manual clock in Play mode:** covered in Node only.
- **Leaving and the 60 s grace with two real clients**, including away, back and away again: covered in Node; in Play
  mode only reloads (quick returns) ran.
- **Two tables in one Play-mode page:** covered in Node only (the kit's own S1 spike ran two copies of a kit in Play).
- **The kit at other scales**: tested at the default (1/16 of upstream); the `scale` setting multiplies it.
