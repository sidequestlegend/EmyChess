# chess-table: port notes for EmyChess (pathfinder)

Analysis only. Everything here comes from reading the clone at
`C:\workspace\AltspaceGames\chess-table` (upstream commit `428aae7`), the port kit contract
(`portkit/README.md`), the approved plan, the Creator SDK 4.0.29 docs and `RELAY.md`. Nothing was
compiled, run or opened in Unity. The prefab and scene YAML were resolved with a read-only script
(nested prefab instances expanded, scripts matched by GUID from `.meta` files, FBX node trees read from
the binary files). Statements about what VRChat does at run time are marked as such; they were not
observed.

Path shorthand used below:

- `S/` = `Packages/com.emymin.emychess/Runtime/Scripts/` (a bare `Piece.cs:117` means `S/Piece.cs` line 117;
  the files in `Gamerules/`, `Interactions/` and `Misc/` have unique names, so they are cited by name too)
- `R/` = `Packages/com.emymin.emychess/Runtime/`

Contents: 1 Upstream at a glance, 2 Feature checklist, 3 State and messages, 4 Platform-call census,
5 Object model, 6 Assets, 7 Translation map, 8 Snippet design, 9 Test plan, 10 Changed or left out,
risks and questions, 11 Not determined.

---

## 1. Upstream at a glance

| Item | Value | Where |
|---|---|---|
| Repository | emymin/EmyChess, "A chess prefab for VRChat SDK3 worlds, powered by Udon, written in C# using UdonSharp" | `README.md:5` |
| Commit | `428aae78a7a9c280b8d4e182045306e02d45efd1`, 2024-11-19, "Update README.md"; 29 commits; tags `0.1`, `0.1.1`, `0.1.2`, `0.1.3` | git |
| Authors by commit | Emymin 21, BlackStartx 5, ZenithVal 2, BluWizard 1 | git log |
| Package | `com.emymin.emychess` 0.1.3 | `Packages/com.emymin.emychess/package.json:2-4` |
| Version shown in the world | "EmyChess v0.1.2" (one release behind the package) | `R/EmyChess.prefab:232` |
| Unity | 2019.4.31f1, built-in render pipeline, linear colour space | `ProjectSettings/ProjectVersion.txt:1`, `ProjectSettings/GraphicsSettings.asset:41`, `ProjectSettings/ProjectSettings.asset:50` |
| VRChat SDK | `com.vrchat.worlds` 3.1.10, `com.vrchat.base` 3.1.10, `com.vrchat.udonsharp` 1.1.6, `com.vrchat.clientsim` 1.2.2. Declared only: the packages are not in the repo | `Packages/vpm-manifest.json:3-12` |
| Unity packages | ugui 1.0.0, TextMeshPro 2.1.6 (not used by any prefab: all text is legacy `UnityEngine.UI.Text`), Oculus and OpenVR standalone | `Packages/manifest.json` |
| Entry prefab | `R/EmyChess.prefab` (560,378 bytes, 543 YAML documents, 73 nested prefab instances, 218 GameObjects once expanded) | |
| Example scene | `R/ExampleScene.unity`: Main Camera, Directional Light, a Plane at scale 100, the EmyChess prefab at the origin with scale 1, and a `Descriptor` object with the VRChat scene descriptor and pipeline manager. `EditorBuildSettings.asset` lists no scenes | `R/ExampleScene.unity:129-721` |
| Sub-prefabs | `R/Prefabs/{pawn,bishop,king,knight,queen,rook}.prefab`, `PromotionPicker.prefab`, `AnarchyControls.prefab` | |
| Code | 14 C# files, 2,451 lines: 13 runtime files (2,243 lines) and one editor inspector (208). Namespace `Emychess`. No tests | `S/`, `Packages/com.emymin.emychess/Editor/BoardInspector.cs` |
| Size at prefab scale 1 | One square is one Unity unit: the board is 8 m wide and a king is 1.56 m tall. The README says "Position and scale as desired" | `Piece.cs:117`, `R/Prefabs/king.prefab` (collider size), `README.md:23` |

The plan's per-game note names eight files. There are thirteen runtime scripts: the five it does not name
are `PromotionButton.cs`, `TimerButton.cs`, `SendEventOnInteract.cs`, `PlayerHolder.cs` and `Spin.cs`.

### Licences

| What | Licence | Evidence | Note |
|---|---|---|---|
| All code | GPL-3.0 ("GNU Public License v3.0"; no "or later" wording anywhere) | `README.md:29`, `LICENSE` | No source file carries a licence header or a copyright line |
| All other assets (models, prefabs, materials, font, shaders unless listed below) | CC BY-SA 4.0 | `README.md:31`, `LICENSE-CC-BY-SA` | |
| `R/Materials/wood.png` | CC0, from OpenGameArt node 10010 | `README.md:32` | The page returned HTTP 403 to an automated fetch, so the claim is **not verified**. The README path (`Materials/wood.png`) is stale |
| `R/Audio/Move.ogg` | CC0, freesound 366065, "chess pieces.wav" by simone_ds | `README.md:33` | Verified on freesound.org on 2026-11-24 |
| `R/Audio/Capture.ogg` | CC0, freesound 144947, "Knock_3.wav" by a deleted user | `README.md:33` | Verified on freesound.org on 2026-11-24 |
| `R/Materials/BackfaceCulledUI.shader` | **MIT, Unity Technologies** (a copy of Unity's built-in UI shader with `Cull Off` changed to `Cull Back`) | `R/Materials/BackfaceCulledUI.shader:1-2` | Not mentioned in the README. The `license.txt` its header points to is not in the repo |
| `Packages/com.vrchat.core.vpm-resolver/`, `Packages/com.vrchat.core.bootstrap/` (24 files besides `.meta` files) | **VRChat Distro Licence**: redistribution only at no charge, under VRChat's Materials License Agreement | `Packages/com.vrchat.core.vpm-resolver/License.md`, `Packages/com.vrchat.core.bootstrap/License.md` | Contradicts `README.md:29` ("All code in this repository"). Not gameplay code; nothing from these folders may go into the kit or the script |
| Six prebuilt DLLs inside the resolver: `vpm-core-lib.dll` (VRChat), `Serilog.dll` and `Serilog.Sinks.File.dll` (Apache-2.0), `Serilog.Sinks.Unity3D.dll` (MIT), `YamlDotNet.dll` (MIT), `SemanticVersioning.dll` (MIT) | as named | `Packages/com.vrchat.core.vpm-resolver/Editor/Dependencies/*.License.*` | Binaries with no source in the repo. Editor tooling for VRChat's package manager; unused by the port |
| `R/UI/EmyLCD.ttf` | Covered by the CC BY-SA sentence | name table: "EmyLCD Regular", "Version 1.000;;EmyLCD Regular;2021;FL720" | The Unity import file still names the font "Open 24 Display St" (`R/UI/EmyLCD.ttf.meta:11-13`), which is a third-party font. Whether EmyLCD is original or derived from it cannot be told from the repo. The font has 16 glyphs: space, `+`, `0`-`9`, `:` |
| Legacy UI font and sprites | Unity built-in resources (Arial, UISprite, Checkmark) | prefab references to `0000000000000000e000000000000000` and `...f000000000000000` | Not in the repo. Unity 6 no longer ships Arial; the port needs its own font (see 6) |
| `Website/` (index.html, cover.css, favicon.ico), `.github/workflows/` | VRChat package-listing template; Bootstrap is loaded from a CDN | `Website/index.html:11`, `.github/workflows/build-listing.yml` | Not ported |
| `preview.png` (two identical copies, 1157 x 981) | Covered by the CC BY-SA sentence | | Shows a table and a room that are not in the repo. Not shipped |

Consequences for the port:

1. `pk-chess-table.js` is a translation of GPL-3.0 code, so the whole bundle is GPL-3.0. The shared
   runtime (`ts/portkit`) is compiled into that bundle, so the runtime must carry a GPL-compatible
   licence, and the served (minified) script needs a pointer to its source: a banner comment with the
   fork URL, and the same link on the credits panel.
2. The kit bundle is an adaptation of CC BY-SA 4.0 art: it stays CC BY-SA 4.0, credits Emymin, links
   the licence and says that it was changed (converted to URP, UI rebuilt).
3. `THIRD-PARTY-NOTICES.md` needs: EmyChess code (GPL-3.0, with the four contributor names), EmyChess
   art (CC BY-SA 4.0), wood texture (CC0, OpenGameArt node 10010), two sounds (CC0, freesound ids),
   Unity UI shader (MIT) only if a derivative of it ships, and the replacement UI font (LiberationSans,
   SIL OFL, from the TextMeshPro essentials).

---

## 2. Feature checklist

Numbered so the port can be judged item by item. "Everyone" means every client in the instance. Items
describe upstream as written; where upstream is broken the item says so and points at a defect `D..` in
2.9, which gives the stance proposed for the port.

### 2.1 Lobby and sides

| # | Statement | Upstream |
|---|---|---|
| F1 | With no game in progress the main menu is shown (Join White, Join Black, Start Game, Standard, Anarchy, Automated Timer) and the game menu is hidden. With a game in progress it is the reverse (Currently Moving, two scores, End Game) | `ChessManager.cs:99,106`; `R/EmyChess.prefab:3138` (MainMenu), `:5973` (GameMenu, inactive by default) |
| F2 | The panel always shows the title "EmyChess v0.1.2", "White Player: <name>" and "Black Player: <name>". An empty side shows "-" | `R/EmyChess.prefab:232`; `ChessManager.cs:96-97` |
| F3 | Join White / Join Black registers the local player for that side, for everyone | `ChessManager.cs:166-182,186-209`; buttons `R/EmyChess.prefab:6479,5730` |
| F4 | For the player who holds a side the button reads "Leave White" / "Leave Black"; for everyone else it reads "Join White" / "Join Black" | `ChessManager.cs:102-103` |
| F5 | Pressing your own side's button again leaves the side | `ChessManager.cs:188-191,201-204,239-254` |
| F6 | Pressing Join on a side held by someone else replaces them at once, with no confirmation (only "is it me?" is checked) | `ChessManager.cs:188,201` then `:166-182` |
| F7 | One player can hold both sides and then moves both colours | no check in `ChessManager.cs:166-182`; turn test at `:90-94` |
| F8 | Start Game is enabled only when both sides are registered and the local player is one of them | `ChessManager.cs:101` |
| F9 | Standard / Anarchy can be pressed by anyone, registered or not, while the main menu is shown. The label under "Selected Game Mode" reads "Standard" or "Anarchy". Default is Standard | `ChessManager.cs:100,218-233`; `DefaultRules.cs:30`; `R/EmyChess.prefab:5026,3839` |
| F10 | Choosing Anarchy shows both anarchy consoles at once, before any game starts; choosing Standard hides them | `ChessManager.cs:113-114` |
| F11 | The Automated Timer check box can be toggled by anyone while the main menu is shown; the tick shows its state; default off. Below it: "Make sure to set the timer before making the first move" | `ChessManager.cs:104,358-364`; `R/EmyChess.prefab:5156,3127` |
| F12 | Sides, mode and the timer toggle cannot be changed during a game (their controls are in the hidden main menu) | `ChessManager.cs:99` |

### 2.2 Starting and ending

| # | Statement | Upstream |
|---|---|---|
| F13 | Start Game, for everyone: game in progress, White to move, both scores 0, game-over banner hidden, board cleared and set to the standard start position | `ChessManager.cs:319-337`; `DefaultRules.cs:442-445`; `Board.cs:212-252` |
| F14 | Coordinates: x is the file (0 = a), y is the rank (0 = rank 1). White starts on ranks 1 and 2. A piece on (x, y) stands at local position (-(x + 0.5), 0, -(y + 0.5)) under `pieces_parent`; black pieces are turned 180 degrees about the vertical axis | `Board.cs:215-235,294-297`; `Piece.cs:117-119` |
| F15 | Starting in Anarchy gives the same start position | same path as F13 |
| F16 | Start with Automated Timer on: if the clock is already running it is reset to zero (and so does not start); otherwise White's clock starts, provided both clocks are above zero | `ChessManager.cs:328-332`; `Timer.cs:129-142` |
| F17 | The game menu shows "Currently Moving: <name> (white)" or "(black)" | `ChessManager.cs:107-108` |
| F18 | End Game is enabled only for the two registered players. For everyone it ends the game: board cleared, main menu back, banner hidden, clock reset to zero if Automated Timer is on. Both sides stay registered, so Start Game works again at once | `ChessManager.cs:111,338-353` |
| F19 | A game also ends when the turn passes to a side that has no registered player | `ChessManager.cs:268-271` |

### 2.3 Moving pieces (both modes)

| # | Statement | Upstream |
|---|---|---|
| F20 | Only the registered player of the side to move can pick up pieces, only pieces of that colour, and only while a game is in progress. Everyone else can pick up nothing | `Board.cs:169-183`; `Piece.cs:92-106`; `ChessManager.cs:124` |
| F21 | While a piece is held, other players do not see it move (pieces have no object sync). When it is dropped they see it jump to its new square | pieces carry no `VRCObjectSync` (`R/Prefabs/pawn.prefab`); TODO at `Piece.cs:239` |
| F22 | A dropped piece goes to the nearest square: square = round(clamp(-local - 0.5, 0, 7)) on each axis, with halves rounded to the even number | `Piece.cs:292-293,301-302` |
| F23 | A placed piece is centred on its square, upright, at scale 1, with the white or the black material | `Piece.cs:117-124` |
| F24 | A move without a capture plays `Move.ogg`, and a capture plays `Capture.ogg`, from the moved piece, for everyone present at that moment | `Piece.cs:256-265,200-210`; `Board.cs:28-29` |
| F25 | A captured piece disappears for everyone and returns to its pool | `Piece.cs:175-188` |
| F26 | Score: whenever a piece is captured the side of the opposite colour to that piece gains pawn 1, knight 3, bishop 3, rook 5, queen 9, king 0. "Score: n" is shown for each side in the game menu and is refreshed at the next end of turn | `Piece.cs:166-180`; `ChessManager.cs:303-317,109-110` |

### 2.4 Standard mode

| # | Statement | Upstream |
|---|---|---|
| F27 | On pick-up the legal target squares of that piece are tinted orange (colour (1, 0.5, 0) blended 60 %) on the holder's client only. Targets include captures, en passant and castling squares. All tints clear on drop | `Piece.cs:221-236,285`; `Board.cs:431-450`; `R/Materials/Board.shader:71-76`; `R/Materials/Board.mat` |
| F28 | While a piece is held nothing else can be picked up | `Piece.cs:225` |
| F29 | An illegal drop (including back on its own square) returns the piece to its square with no sound. The same player continues and can pick up again | `DefaultRules.cs:431-435`; `Piece.cs:280-283` |
| F30 | A legal move marks the piece as moved and passes the turn at once, except when a promotion choice is pending (F38) | `DefaultRules.cs:426-427`; `Piece.cs:267-277` |
| F31 | Pawn: one square forward if empty; two squares forward if it has never moved and both squares are empty; one square diagonally forward onto an enemy piece | `DefaultRules.cs:111-133` |
| F32 | En passant: a pawn standing beside an enemy pawn that made a two-square move on the previous turn may move diagonally behind it, and that pawn is captured (capture sound, +1) | `DefaultRules.cs:134-150,405-409,418-425`; `Board.cs:377-381` |
| F33 | Knight: the eight L-moves, onto empty squares or enemy pieces | `DefaultRules.cs:212-229` |
| F34 | Bishop, rook, queen: slide until blocked; may capture the first enemy piece met | `DefaultRules.cs:192-211` |
| F35 | King: one square in any direction, onto empty squares or enemy pieces | `DefaultRules.cs:154-166` |
| F36 | Castling: allowed when the king has never moved, a rook of its colour that has never moved stands on file a or h of the king's rank, every square between them is empty, and the king's destination square is not attacked. The king moves two squares toward the rook and the rook lands on the square the king crossed. One move sound. Upstream does **not** require that the king is not in check or that the crossed square is not attacked (D1) | `DefaultRules.cs:167-190,411-417`; `Board.cs:382-390` |
| F37 | No move may leave the mover's own king attacked (pinned pieces, king stepping into an attack, en passant uncovering an attack) | `DefaultRules.cs:312-346,271-304` |
| F38 | Promotion: when a pawn reaches the last rank the turn does not pass. A picker appears above that pawn on the mover's client only, with five translucent blue pieces: bishop, rook, pawn, queen, knight. Everything is locked until one is clicked | `Piece.cs:269-272`; `PromotionPicker.cs:33-44`; `R/Prefabs/PromotionPicker.prefab:1225-1614` |
| F39 | Clicking queen, rook, bishop or knight replaces the pawn with that piece (same colour, same square, "never moved"), hides the picker and passes the turn. Clicking the pawn keeps the pawn and passes the turn | `PromotionPicker.cs:54-72,45-49` |
| F40 | If the pool of the chosen type is empty, nothing happens and the picker stays open | `PromotionPicker.cs:63` |
| F41 | While the picker is open the other players see only a pawn on the last rank; the promoting side's clock keeps running | picker is not synced (`PromotionPicker.cs`, no synced fields) |
| F42 | Each picker piece except the pawn has a small counter label meant to show how many pieces of that type are left. As shipped it stays at "0" (D4) | `PromotionButton.cs:19-22`; `PromotionPicker.cs:20-28,40-43` |
| F43 | After each turn the mover's client tests whether the next side's king is attacked. The only visible result is a console line ("White King is in check"); the red square it sets is cleared in the same call (D3) | `ChessManager.cs:278-285,300,122` |
| F44 | Checkmate: the side to move has no legal move and its king is attacked. Everyone sees "CHECKMATE! Winner: <name>" and all pieces are locked | `ChessManager.cs:287-292`; `Board.cs:130-152`; `GameOverMessage.cs:24-50,61-68` |
| F45 | Stalemate: no legal move and the king is not attacked. Everyone sees "STALEMATE, nobody wins" | `Board.cs:153-156`; `GameOverMessage.cs:37-39` |
| F46 | When only the two kings are left the result is reported as checkmate, with the player who made the last move as winner (D2) | `Board.cs:123-129`; `ChessManager.cs:290-291` |
| F47 | The banner hangs three squares above the centre of the board and spins about the vertical axis; its back face is not drawn | `R/EmyChess.prefab:870,2012-2025,1613`; `Spin.cs:15-18`; `R/Materials/BackfaceCulledUI.shader:41` |
| F48 | After a result the game is still "in progress": the game menu stays until a registered player presses End Game | `ChessManager.cs:287-296` (no change to `inProgress`) |
| F49 | Not in upstream, so not expected of the port: draws by repetition, fifty moves or insufficient material (other than F46), resigning, draw offers, undo, move list or notation, touch-move, FEN import or export, any check on what spectators press | `Board.cs:212` (TODO), whole code base |

### 2.5 Anarchy mode

| # | Statement | Upstream |
|---|---|---|
| F50 | A dropped piece goes to the nearest square with no legality test. Whatever stands there, of either colour, kings included, is captured (capture sound and score as F26) | `Piece.cs:253`; `DefaultRules.cs:363-370` |
| F51 | The turn does not pass by itself. The player may make any number of moves, and may hold two pieces at once | `Piece.cs:223,267`; nothing locks on pick-up |
| F52 | Each side has a console (white at local (-3, 0, 7), black at (3, 0, -7)) with a red END TURN button. It works only for that side's registered player, on their turn, during a game, and passes the turn | `ChessManager.cs:115-116,264-302`; `R/Prefabs/AnarchyControls.prefab:896-932` |
| F53 | No orange tints, no check, checkmate or stalemate, no promotion picker | `Piece.cs:223,267`; `ChessManager.cs:276` |
| F54 | Deleting: a piece dropped far outside the board is removed. The test is on the square coordinate before clamping: below -3 or above 11 on either axis (2.5 squares past the a/1 edge, 3.5 past the h/8 edge). It scores like a capture and plays no sound | `Piece.cs:294-299` |
| F55 | Piece placer: a translucent piece on each console shows the selected type. "<" and ">" step through pawn, knight, rook, bishop, queen, king and wrap. Anyone can press them. The selection is per client and is not shared | `PiecePlacer.cs:28-56,60-63`; `R/Prefabs/AnarchyControls.prefab:388,518` |
| F56 | The console shows "Available <type>s" and the number of unused pieces of that type. Pools are shared by both colours: pawn 20, bishop 8, king 8, knight 8, queen 16, rook 8 (68 pieces) | `PiecePlacer.cs:64-65`; `Board.cs:82-95`; `R/EmyChess.prefab:4390` (`pieceAmounts`), pools at `:4287-4880` |
| F57 | The placer can be picked up only by that side's registered player, on their turn, during a game. On drop, if the mode is Anarchy and a piece of the type is available, a piece of that side's colour appears on the computed square, any piece already there is captured (score, no capture sound), and the move sound plays. The placer then jumps back to its console | `ChessManager.cs:117-120`; `PiecePlacer.cs:67-85` |
| F58 | The placer's square is computed as `(int)pos * -1 - 1` on each axis, which lands one square toward a1 from the square under the placer (D5), and is clamped to the board, so a placer dropped anywhere at all still spawns a piece on an edge square (D6) | `PiecePlacer.cs:69-71`; `Piece.cs:153-154` |
| F59 | A spawned piece can be moved at once by its owner | `Piece.cs:92-97` via `_Setup` |
| F60 | The selection returns to pawn each time the consoles are switched on | `PiecePlacer.cs:86-89,32-38` |
| F61 | The counts refresh whenever any piece changes | `Piece.cs:127`; `ChessManager.cs:128-132` |
| F62 | With Automated Timer on, END TURN switches the clock, and running out of time ends the game as in F72 | `ChessManager.cs:272-275`; `Timer.cs:175` |

### 2.6 Clock

| # | Statement | Upstream |
|---|---|---|
| F63 | The clock shows two times as `HH:MM:SS` with a smaller three-digit millisecond field each (Black left, White right), and a three-digit MOVES counter | `Timer.cs:48-67`; fields in `R/EmyChess.prefab:346` onward |
| F64 | Screen buttons "+30 s", "60" and "+15m" add 30 s, 60 s and 900 s. They work only while the clock is stopped, and set **both** sides to White's time plus the amount. Above 99 hours nothing happens | `Timer.cs:79-124`; `R/EmyChess.prefab:3047,1899,777` |
| F65 | RESET sets both times to zero, stops the clock, sets MOVES to 000 and makes White the side to run | `Timer.cs:143-155`; `R/EmyChess.prefab:2413` |
| F66 | The clock's two physical buttons: the button of the side whose time is running (White's when stopped after a reset) is tilted up by 10 degrees | `TimerButton.cs:24-30`; `R/EmyChess.prefab:420-500` |
| F67 | Manual mode (Automated Timer off): clicking the raised button starts the other side's countdown and raises the other button. This is how the clock is started and switched. It works at any time, with or without a game | `TimerButton.cs:32-39`; `Timer.cs:159-162` |
| F68 | A countdown starts only if both times are above zero. Each start adds one to MOVES (stops at 255) | `Timer.cs:129-142` |
| F69 | Automated mode: the physical buttons do nothing; the clock starts at Start Game (F16) and switches at every end of turn | `TimerButton.cs:29,34`; `ChessManager.cs:272-275,328-332` |
| F70 | The clock side is toggled, not derived from whose turn it is, so after a RESET during a game it can run for the wrong side | `Timer.cs:159-162` |
| F71 | Anyone, including spectators, can press the screen buttons and (in manual mode) the physical buttons, at any time | no check in `Timer.cs`; TODO at `TimerButton.cs:29` |
| F72 | Automated mode, game in progress: when the running time reaches zero everyone sees "TIME'S UP! Winner: <name>" (the other side) and all pieces are locked | `Timer.cs:171-176`; `GameOverMessage.cs:40-42` |
| F73 | Automated mode: the clock stops while any game-over banner is up | `Timer.cs:168` |
| F74 | Manual mode: at zero the display stays at zero and nothing else happens | `Timer.cs:171-176` |
| F75 | Hours are shown modulo 24: 25 hours reads `01:00:00`, and the 99-hour maximum reads `03:00:00` (D14) | `Timer.cs:50-51` (`TimeSpan.Hours`) |
| F76 | The running time is computed on one client (whoever last started, switched, reset or added time) from its local clock, and sent to the others several times a second | `Timer.cs:16,19-22,134-137,163-181` |

### 2.7 Network, late joiners, leaving

| # | Statement | Upstream |
|---|---|---|
| F77 | Shared by everyone: who holds each side, game in progress, side to move, mode, both scores, the timer toggle, each piece's presence, square, colour and "has moved", both clock times, clock running, clock side, MOVES, the game-over state and winner | section 3 |
| F78 | A player who arrives late gets all of F77 and sees the right menu, names, board, clock and banner. Upstream notes that late joiners sometimes miss pieces (D20) | VRChat sends synced variables to joiners; `Piece.cs:133` |
| F79 | A late joiner does not get: sounds already played, another player's open promotion picker or orange tints, another player's placer selection, or which pawn may be taken en passant (D8) | none of these are synced; `Piece.cs:110` |
| F80 | A late joiner cannot take a side during a game and can pick up nothing: they watch | `ChessManager.cs:99`; `Board.cs:179-182` |
| F81 | A registered player leaves during a game: the other registered player's client ends the game (F18) | `ChessManager.cs:366-378` |
| F82 | A registered player leaves with no game in progress: the other registered player's client unregisters that side | `ChessManager.cs:370-376` |
| F83 | If no registered player remains, nothing reacts: the game stays as it is and the side passes to whoever VRChat gives the holder object to (D11) | `ChessManager.cs:368` |
| F84 | Spectators leaving has no effect | `ChessManager.cs:368` |
| F85 | Nothing is saved. A new instance starts empty | no persistence API is used |
| F86 | Clients are trusted: the mover's client decides whether a move is legal and writes the result | `Piece.cs:250-286` |

### 2.8 Presentation

| # | Statement | Upstream |
|---|---|---|
| F87 | Board: an 8 x 8 checker drawn by the shader, dark (0.34, 0.16, 0) and light (1, 0.85, 0.66), smoothness 0.536, in a wooden frame | `R/Materials/Board.shader`; `R/Materials/Board.mat` |
| F88 | Six piece meshes. White pieces: colour white, smoothness 0.5. Black pieces: colour 0.19 grey, smoothness 0.162 | `R/Models/Pieces.fbx`; `R/Materials/WhitePiece.mat`, `BlackPiece.mat` |
| F89 | Picker pieces and the placer piece use a translucent blue material with emission | `R/Materials/GhostPiece.mat` |
| F90 | A sloped wooden panel beside the board carries the menus; a chess clock model stands on the other side | `R/Models/ChessSet.fbx` (`UIHolder`), `R/Models/Timer.fbx` |
| F91 | No animations, particles, music, haptics, seats or teleporting. The only motion is the spinning banner and the tilting clock buttons | no Animator, Animation or ParticleSystem in any prefab |

### 2.9 Upstream defects found by reading (D1 to D24)

Each is cited above where it changes what a player sees. "Stance" is the proposal for the port; the
ones that change rules are also listed as questions in 10.4.

| # | Defect | Where | Stance |
|---|---|---|---|
| D1 | Castling is allowed while in check and across an attacked square. The check test is commented out ("very WEIRD stuff happens") | `DefaultRules.cs:169` | Mirror, so the golden vectors stay the single authority. Ask |
| D2 | King against king is reported as checkmate won by the last mover | `Board.cs:123-129` | Mirror the state value; ask whether to word it as a draw |
| D3 | The red "king in check" square is set and then cleared in the same call, so it never shows | `ChessManager.cs:283` then `:300` to `:122` | Fix: show it, for everyone (the TODO at `:285` says this was the intent) |
| D4 | Promotion counters never refresh. The five picker buttons are instances of the piece prefabs. Their `m_RemovedComponents` lists still name the pre-UdonSharp-1.0 component ids, so the `Piece` behaviour was not removed and is the first `UdonBehaviour` on each button. `PromotionPicker.Start` takes the first `UdonBehaviour` and calls `_RefreshCounter` on it, which that program does not have | `R/Prefabs/PromotionPicker.prefab:1722-2233`; `PromotionPicker.cs:26,42` | Fix: bind the picker to the `PromotionButton` behaviours and strip the stray `Piece` behaviours (also on `reference_pawn`) |
| D5 | Placer square is off by one toward a1: `(int)pos.x*-1-1` truncates toward zero (UdonSharp's cast truncates: `EmitContext.CastValue` calls `Math.Truncate` first), so the centre of square 3 (-3.5) gives 2, and square 0 gives -1, which is then clamped to 0 without capturing what stands there | `PiecePlacer.cs:70-71`; `Piece.cs:153-154` | Fix (floor), keep a vector of the upstream mapping. Ask |
| D6 | A placer dropped anywhere, however far from the board, still spawns on the clamped edge square | `PiecePlacer.cs:72-80`; `Piece.cs:153-154` | Mirror. Ask |
| D7 | Stray `Piece` behaviours with empty `board`, `pool` and `type` on the five picker buttons and on `reference_pawn`; the bishop button also keeps the piece's BoxCollider beside its CapsuleCollider | `R/Prefabs/PromotionPicker.prefab` | Strip in the kit builder |
| D8 | "Pawn that made a double push" is not synced. Other clients guess it from "y changed by two since the last update", never clear it, start from zero for late joiners, and inherit stale values from pooled pawns of the previous game | `Piece.cs:108-114,120-121`; `DefaultRules.cs:418-425` | Fix: write it with the move (one small field), so every client agrees |
| D9 | After checkmate the loser's client may leave their pieces pickable, depending on which of two objects' updates arrives last | `ChessManager.cs:124` against `GameOverMessage.cs:48` | Fix: lock whenever the game-over state is not 0 |
| D10 | End Game pressed by one player does not close a promotion picker open on the other player's client; choosing there afterwards spawns a piece on the cleared board and flips the turn | `ChessManager.cs:350`; `PromotionPicker.cs:54-72` | Fix: every client hides its picker when the game is not in progress |
| D11 | A side belongs to whoever owns a holder object. When that player leaves, VRChat hands the object to someone else, who then appears as the player without having joined | `PlayerHolder.cs:24-27`; `ChessManager.cs:150-160` | Fix: a side is a user id; a user who has left is nobody |
| D12 | If the leaver was the only registered player (or held both sides), no client reacts | `ChessManager.cs:368` | Fix: the referee ends the game or frees the side |
| D13 | The clock is computed from the local `Time.time` of whoever touched it last, in private fields. If ownership moves (VRChat passes objects on when their owner leaves), the new owner computes from its own stale or zero values, which in automated mode can give an instant "TIME'S UP" | `Timer.cs:40-41,134-137,166-177` | Fix: the start moment is shared and measured on the synced clock |
| D14 | Hours wrap at 24 | `Timer.cs:50-51` | Fix: show total hours (00 to 99) |
| D15 | With Automated Timer on, starting a game while the clock is running resets it to zero and it does not start | `ChessManager.cs:330-331` | Mirror |
| D16 | Scores are bytes and wrap at 256; capturing or deleting your own piece scores for the opponent; End Game adds every remaining piece to the hidden scores | `ChessManager.cs:303-317`; `Piece.cs:179`; `Board.cs:199-206` | Mirror (wrap included) |
| D17 | `GetAllLegalMoves` tests the x difference where it means the y difference, so the "double push" argument it passes on is always null. No visible effect | `DefaultRules.cs:334` | Mirror |
| D18 | A two-square pawn move is tied to "never moved", not to the rank. Only matters for positions loaded by FEN, which sets every piece to "never moved" | `DefaultRules.cs:116`; `Piece.cs:156` | Mirror; the vector loader sets the flag per piece |
| D19 | The pawn double-push test reads the live grid, not the grid it was given | `DefaultRules.cs:118` | Mirror |
| D20 | "late joiners sometimes can't see all pieces"; and `_Setup` delays its sync by 20 frames as a workaround | `Piece.cs:133,159` | Gone by design: joiners get one snapshot. The delay is dropped |
| D21 | "legal moves are not always up to date when picking up a piece at the start of a turn": the opponent's move arrives as several separate updates | `Piece.cs:275` | Gone by design if the runtime applies a whole change set before any callback runs (see 3.6) |
| D22 | `GameOverMessage._Refresh` reads the winner's name without a null test | `GameOverMessage.cs:30` | Fix: show "-" |
| D23 | Ending a game (or capturing a piece) while that piece is held forces a drop. If VRChat raises `OnDrop` inside `Drop()`, the piece is still active and the drop is handled as a move before the piece is removed; if it raises it later, nothing happens. Which one is not known | `Piece.cs:177,288-307` | Fix: ignore drops when no game is in progress or the piece is gone |
| D24 | The banner turns one degree per frame, so its speed follows the frame rate; `_LogGrid` prints 7 x 7 of the 8 x 8 grid; an illegal drop still sends a sync | `Spin.cs:17`; `Board.cs:472-475`; `DefaultRules.cs:433` | Fixed speed (90 degrees a second); the other two are harmless |

---

## 3. State and messages

### 3.1 Synced variables (18 fields on 6 behaviour types)

All are Manual sync except `Timer` (Continuous). "Writer" is the client that calls the method; each
method first takes ownership of the object (3.3).

| Behaviour (objects) | Field | Type | Written by, when |
|---|---|---|---|
| `ChessManager` (1), `ChessManager.cs:27-49` | `isWhiteRegistered`, `isBlackRegistered` | bool | the joining or leaving player (`:173,177,245,250`); the remaining player on `OnPlayerLeft` (`:374`) |
| | `inProgress` | bool | a registered player at Start (`:323`) and End (`:343`); the mover when the next side has no player (`:270`) |
| | `currentSide` | bool, true = White | `_StartGame` (`:325`), `_EndTurn` (`:267`) |
| | `anarchy` | bool | anyone, `SetGameMode` (`:222`) |
| | `whiteScore`, `blackScore` | byte | the capturing client, `AddScore` (`:308,312`), which does **not** request a sync: the values travel with the next `_EndTurn`, `_StartGame` or `_EndGame` |
| | `automatedTimer` | bool | anyone, `_ToggleAutoTimer` (`:361`) |
| `DefaultRules` (1), `DefaultRules.cs:29-30` | `anarchy` | bool | anyone, `SetAnarchy` (`:453`). A second copy of the mode: this one drives the rules, the `ChessManager` one drives the UI |
| `Piece` (68 pooled; 6 strays, D7), `Piece.cs:24-25` | `_state` | byte: bits 7-5 x, 4-2 y, 1 white, 0 hasMoved | the mover, `_SetPosition` (`:142-149`, at once); the spawner, `_Setup` (`:150-160`, 20 frames later) |
| `PlayerHolder` (2), `PlayerHolder.cs:18-19` | `_donotuse` | bool | never written. It exists so the object can be owned; **the owner is the data** |
| `GameOverMessage` (1), `GameOverMessage.cs:16-19` | `gameOverState` | byte: 0 none, 1 checkmate, 2 stalemate, 3 time | the mover in `_EndTurn` (`ChessManager.cs:291,295`), the clock's owner (`Timer.cs:175`), a registered player at Start and End, the instance master at load (`GameOverMessage.cs:81`) |
| | `winningSide` | bool | with state 1 or 3 |
| `Timer` (1), `Timer.cs:19-28` | `timeBlack`, `timeWhite` | float seconds, Linear smoothing | the owner, every frame while running (`:172`); anyone on add or reset |
| | `isStarted`, `isCurrentSideWhite` | bool | `_StartCountDown` (`:135,139`), `_ResetTimer` (`:147,149`) |
| | `moves` | byte | `_StartCountDown` (`:138`), `_ResetTimer` (`:148`) |
| `VRCObjectPool` (6) | which pooled objects are active | SDK-internal | the pool's owner, `TryToSpawn` (`Board.cs:100`), `Return` (`Piece.cs:187`) |

Shared state that is **not** synced but is derived on each client:

| Value | Derived from | Where |
|---|---|---|
| `Board.grid` (64 piece references) | rebuilt from the active children of `pieces_parent` every time any piece runs `_UpdateState` | `Board.cs:332-342,417-420`; `Piece.cs:126` |
| `Board.whiteKing`, `blackKing` | the first king of that colour to run `_UpdateState` while the current reference is empty or inactive | `Piece.cs:129-130` |
| `Board.PawnThatDidADoublePushLastRound` | set and cleared by the mover (`DefaultRules.cs:418-425`); guessed elsewhere (D8) | |
| Piece parent, position, rotation, material, "can be picked up" | `_state` plus the `ChessManager` fields | `Piece.cs:88-132` |
| The order of pieces in `GetAllPieces` | the order in which pieces were first reparented on this client. It decides which piece "wins" a square when two stand on it (possible in Anarchy) | `Board.cs:272-286`; `Piece.cs:90` |

Local only: orange and red tints (`Board.IndicatorArray`), `Piece.legalMoves`, `previousX/Y`, the picker
and its `targetPiece`, the placer's `index` and `currentType`, the clock's `startingTime` and
`startedCountingDownTime`, `TimerButton.isRaised`.

### 3.2 Network events

| Event | Target | Sent from | Effect |
|---|---|---|---|
| `PieceMovedAudio` | All | `Piece.cs:260` (move without capture), `PiecePlacer.cs:79` (spawn) | `PlayOneShot(board.pieceMovedClip)` on the piece's AudioSource |
| `PieceCapturedAudio` | All | `Piece.cs:264` | `PlayOneShot(board.pieceCapturedClip)` |

Neither is replayed for late joiners (VRChat events are not kept). No other network events exist.

Local events by name: 15 UI buttons and 2 `SendEventOnInteract` objects call `SendCustomEvent` with a
string (wiring table in 5.3). One delayed event: `SendCustomEventDelayedFrames("_RequestSerialization", 20)`
at `Piece.cs:159`.

### 3.3 Ownership transfers (21 call sites, all "take it myself, then write")

| Object | Call sites |
|---|---|
| `ChessManager` | `ChessManager.cs:168,220,241,266,306,322,342,360` |
| `PlayerHolder` | `PlayerHolder.cs:22`, called from `ChessManager.cs:170`. Never released: leaving a side only clears the flag |
| `DefaultRules` | `DefaultRules.cs:452` |
| `GameOverMessage` | `GameOverMessage.cs:63,74` |
| `Timer` | `Timer.cs:85` (only if not already the owner), `:134`, `:145` |
| Pool objects | `Board.cs:99`, `Piece.cs:186` |
| Piece objects | `Board.cs:103`, `Piece.cs:139,144,152` |

`Networking.GetOwner` is read in three places: `PlayerHolder.cs:26` (who is the player) and
`Timer.cs:83,166` (am I the clock's owner). `Networking.IsMaster` is read at load in three places:
`Board.cs:496` (empty body), `GameOverMessage.cs:81` and `Timer.cs:184` (reset). No ownership callbacks
are used. Picking a piece up does not change its owner; dropping it does.

### 3.4 Timers, per-frame work, random numbers, persistence

| Kind | Where | What |
|---|---|---|
| Per frame | `Timer.cs:163-181` | owner only: subtract elapsed local time, test for zero, redraw |
| Per frame | `Spin.cs:15-18` | rotate the banner one degree |
| Delayed | `Piece.cs:159` | sync a new piece 20 frames after spawning it |
| Clock source | `Timer.cs:136,171` | `Time.time` of the owning client; no server time anywhere |
| Random numbers | none | |
| Persistence | none | no player data, no player objects; state lasts as long as the instance |

### 3.5 Order of work in the two calls that matter most

`Piece.PieceDropped` in Standard mode, legal capture (`Piece.cs:250-286` to `DefaultRules.cs:388-430`):

1. `board.GetPiece(x, y)` reads the grid.
2. The target is captured: forced drop if held, returned to its pool, score added. **The grid is not rebuilt.**
3. The en passant test reads the same stale grid (`:405`), which is why an ordinary diagonal capture is not mistaken for en passant. A port that rebuilds the grid in step 2 breaks this.
4. Castling moves the rook with `_SetPosition` (sync, grid rebuilt).
5. The double-push reference is set or cleared.
6. `hasMoved = true`, `_SetPosition` (sync, grid rebuilt, king references refreshed).
7. Sound event to all.
8. Promotion picker, or `_EndTurn`.

`ChessManager._EndTurn` (`:264-302`): flip side; end the game if the new side has no player (and
carry on, there is no `return`); switch the clock if automated; in Standard mode test check, then
checkmate, stalemate and the two-kings case, and set or clear the game-over state; refresh the UI
(which clears all tints and re-enables the next player's pieces); sync.

### 3.6 What the port's runtime has to hold

Proposed leaves under `pk1.chess-table.<inst>.` (the README gives each behaviour one leaf, `v.<id>`):

| Leaf | Content | Note |
|---|---|---|
| `ref` | referee `{sid, uid, term}` | runtime |
| `v.cm` | the eight `ChessManager` fields, plus `ep` (pool index of the pawn that just made a double push, or -1; D8) | |
| `v.rules` | `anarchy` | could be folded into `v.cm`; kept to mirror upstream |
| `v.white`, `v.black` | the holder's owner uid | `GetOwner()` returns null when that user is not in the room (D11) |
| `v.gom` | `gameOverState`, `winningSide` | |
| `v.timer` | `timeBlack`, `timeWhite`, `isStarted`, `isCurrentSideWhite`, `moves`, plus `startingTime` and `startedAt` (synced-clock seconds) | replaces Continuous sync (D13) |
| pieces | per piece: active flag and `_state` byte | 68 leaves if "one leaf per behaviour" is taken literally; **proposed: one leaf** `v.pieces`, a 272-character hex string (68 x 2 bytes), see 10.3 R4 |

Per table that is 75 leaves with a leaf per piece, or 8 with the packed leaf, out of the room's 2,048.
User state: none. One-shots: one type, `ev` (behaviour id and method name) for the two sound events.

Three things the runtime must provide that the README does not spell out:

1. **Apply, then notify.** All leaves in one change event are applied before any `OnDeserialization`
   runs, and pieces are notified before `ChessManager` (fixes D21).
2. **All writes of one tick in one batch.** Starting a game writes 32 pieces plus `v.cm`, `v.gom` and
   `v.timer`. As one batch it costs one token of the shared 20-per-second bucket (`RELAY.md` section 4).
3. **`IsMaster` is not `IsReferee`.** Upstream resets the clock and the banner when the instance master
   loads the world. Space state outlives the room by 24 hours and referees change during a game, so the
   mapping must be "referee, and this instance has no state yet". Related: a table found with a game in
   progress whose players are not in the room is reset by the referee (10.1 C4).

---

## 4. Platform-call census

Counts are occurrences in the 13 runtime scripts (comments excluded where noted). "Gap" means the port
kit contract has no equivalent today; the cost to the player is stated.

### 4.1 VRChat and Udon

| API | Count | Files | Port kit equivalent, or gap |
|---|---|---|---|
| `[UdonSynced]` | 18 fields | ChessManager 8, Timer 5, GameOverMessage 2, DefaultRules 1, Piece 1, PlayerHolder 1 | `synced` fields in the behaviour's leaf |
| `UdonSyncMode.Linear` | 2 | Timer | Not needed: every client computes the time from a shared start moment |
| `BehaviourSyncMode.Manual` | 6 classes | Board, ChessManager, DefaultRules, GameOverMessage, PlayerHolder, Piece | The runtime's model |
| `BehaviourSyncMode.Continuous` | 1 class | Timer | **Gap, by design.** Continuous sync would spend the shared 20-per-second bucket. `Timer` is restructured (3.6). Cost: none; remote clocks get smoother |
| `RequestSerialization()` | 12 (2 more commented out) | ChessManager 7, Piece 2, GameOverMessage 2, DefaultRules 1 | `RequestSerialization()` |
| `OnDeserialization()` | 4 | ChessManager, Piece, Timer, GameOverMessage | `OnDeserialization()`, with the ordering in 3.6 |
| `Networking.SetOwner(LocalPlayer, obj)` | 21 | 3.3 | `Networking.SetOwner(player, b)`. The two calls on pool objects (`Board.cs:99`, `Piece.cs:186`) go to the pool shim |
| `Networking.LocalPlayer` | 31 | Board 3, ChessManager 13, DefaultRules 1, GameOverMessage 2, PlayerHolder 1, Piece 6, Timer 5 | `Networking.LocalPlayer` |
| `Networking.GetOwner(obj)` | 3 | PlayerHolder 1, Timer 2 | **Not in the README's list.** Needed: `Networking.GetOwner(b)` returning a player or null. The two Timer uses become `IsOwner` or go away |
| `Networking.IsMaster` | 3 | Board (empty body), GameOverMessage, Timer | `Networking.IsReferee`, guarded as in 3.6 point 3 |
| `SendCustomNetworkEvent(All, name)` | 3 | Piece 2, PiecePlacer 1 | `SendCustomNetworkEvent(target, name)`: one-shot to the others plus a local call |
| `SendCustomEventDelayedFrames` | 1 | Piece | The README lists only `...DelayedSeconds`. Not needed: the call is a workaround for a VRChat sync problem (D20). Dropped |
| `UdonBehaviour.SendCustomEvent(string)` | 1 call, plus 15 UI buttons wired to it in the prefabs | SendEventOnInteract; prefabs | A method called by name through `events` in `bindings.json` |
| `Interact()` override | 3 classes, 9 objects | PromotionButton (5), TimerButton (2), SendEventOnInteract (2) | `click` on a layer-5 collider |
| `DisableInteractive` | 3 | ChessManager 2, TimerButton 1 | **Gap.** No per-object "cannot be clicked now". The script ignores the click. Cost: no built-in cue that a button is dead; the port tints the two END TURN buttons instead |
| Interact text ("End Turn", "Use") | 2 objects with custom text | `R/Prefabs/AnarchyControls.prefab:896` | **Gap.** No hover tooltip. Cost: none here, the button is labelled |
| `OnPickup()` | 1 | Piece | `grab` |
| `OnDrop()` | 2 | Piece, PiecePlacer | `drop`, **plus a fresh read of the object's position** (see 10.3 R1). The README has no call for reading a transform |
| `VRC_Pickup` component | 70 objects | 68 pieces, 2 placers | `BS.Grababble` (collider on layer 20 and a Rigidbody) |
| `pickup.pickupable = x` | 2 | Piece, PiecePlacer | **Gap.** No such property. Moving the collider between layer 20 (grab) and layer 5 (click, hands pass through) does it. Cost: none if the layer write is quick; a piece may stay grabbable for a frame or two |
| `pickup.IsHeld`, `pickup.Drop()` | 1 each | Piece | Tracked from `grab` and `drop`; `obj.ReleaseGrab()`. **Gap:** it only works on the local player, as in the SDK docs. Cost: a piece held by someone else cannot be taken out of their hand; their own page lets go when the state says the piece is gone |
| Pickup settings: `DisallowTheft` 1 (pieces), `proximity` 2 m, `AutoHold` auto, kinematic body, rotation frozen | 70 objects | `R/Prefabs/*.prefab` | **Gap:** no grab-from-a-distance setting was found. Cost: at large scales pieces must be reached by hand; click-to-move (8.4) covers it |
| `VRCObjectPool` (`TryToSpawn`, `Return`, `Pool`) | 6 objects; 7 mentions | Board 6, Piece 1 | **Gap.** Not in the runtime. A pool shim of about 40 lines: fixed array, active flags in state, "first inactive in array order". Cost: none |
| `VRCPlayerApi`, `.displayName` | 9, 8 | ChessManager, Board, PlayerHolder, GameOverMessage | A player object with `displayName` (`user.name`), compared by uid |
| `OnPlayerLeft(player)` | 1 | ChessManager | **Not in the README's list.** `user-left` delivered as `OnPlayerLeft` |
| `GetComponent(typeof(UdonBehaviour))` | 3 | Board 2, PromotionPicker 1 | Object-to-behaviour lookup from `bindings.json` |
| `VRCUiShape` | 4 canvases | main panel, clock screen, two placer button canvases | Dropped: Unity canvases take clicks in the app, or the buttons become click colliders (5.3) |
| VRChat scene descriptor, pipeline manager | 1 each | `R/ExampleScene.unity` | Not ported |
| Persistence, stations, player tracking, haptics, URL loading | 0 | | |

### 4.2 Unity calls that need a shim or a relay

| API | Count | Files | Port kit equivalent, or gap |
|---|---|---|---|
| `Text.text = ` | 19 writes to 25 Text objects | ChessManager 10, Timer 5, PiecePlacer 2, PromotionButton 1, GameOverMessage 1 | Relay op `text`. While a clock runs its milliseconds text changes every tick: about 20 relay calls a second (10.3 R6) |
| `Button.interactable = ` | 2 | ChessManager (Start, End Game) | **Gap.** No relay op. Proposed new op `interactable` (5.3). Cost without it: the buttons look live when they are not |
| `GameObject.SetActive` | 9 | ChessManager 5, PromotionPicker 2, PiecePlacer 1, GameOverMessage 1 | `obj.active` from the page for kit objects it knows, else relay op `active` |
| `activeSelf`, `activeInHierarchy` | 6 | Board 3, Piece 3 | Kept in the script (pool flags) |
| `renderer.material.SetFloatArray("_Indicators", float[64])` | 1 | Board | **Gap.** No relay op sets a float array. Replaced by page-made quads over the squares (6.3). Cost: none |
| `renderer.material = white or black` | 1 | Piece | **Gap** as written (no material swap). Each piece carries a white and a black renderer and the script switches between them. Cost: none |
| `AudioSource.PlayOneShot(clip)` | 2 | Piece | `BS.AudioSource.PlayOneShot(index)`. Contract wrinkle: the clips are fields of `Board`, played through each piece's source, while `{"$clip": n}` is defined as an index into "that object's" clip list (10.3 R9) |
| `transform.localPosition`, `localRotation`, `localScale`, `localEulerAngles`, `SetParent` | 12 | Piece, PromotionPicker, PiecePlacer, TimerButton | Page transform calls on kit objects (`SetTransform`); reading needs R1 |
| `Transform.InverseTransformPoint` | 1 | PiecePlacer | Maths helper in the runtime plus the parent's world pose |
| `transform.Rotate` per frame | 1 | Spin | An Animation clip in the kit; no script |
| `Time.time` | 2 | Timer | `Networking.GetServerTimeInSeconds()` (relay op `clock`) |
| `Update()` | 2 | Timer, Spin | Runtime tick at 20 Hz. Upstream redraws the clock every frame |
| `Start()`, `OnEnable()` | 6, 2 | | Lifecycle calls; `OnEnable` on the placer must run when the consoles are switched on |
| `TimeSpan.FromSeconds`, `string.Format("{0:D2}...")`, `ToString("D3")` | 3 | Timer | Hand-written; see 9.1 on how .NET and Unity's Mono differ |
| `Mathf` (`Abs`, `Min`, `Max`, `Clamp`, `RoundToInt`) | 27 uses on 20 lines | DefaultRules, Piece, Board | Hand-written. `RoundToInt` rounds halves to even; `Math.round` does not |
| `Vector2` values, `==` on them | throughout DefaultRules | | A small integer pair type |
| `Array.Copy`, `Char.IsDigit`, `int.Parse`; `string.Split` | 1 each; 3 | DefaultRules, Board; Board, Timer | Plain TypeScript |
| `Debug.Log*` | 17 | | `console.log`, same text |

---

## 5. Object model

### 5.1 Hierarchy of `R/EmyChess.prefab` (expanded)

218 GameObjects, 72 of them inactive at rest (the 68 pooled pieces, the picker's `Pieces`, the pawn
button's label canvas, `reference_pawn`, `GameMenu`). Layers: 170 objects on 17, 44 on 0, 2 on 13, 2 on
5. This repo's `TagManager.asset` names none of them; by VRChat convention 17 is Walkthrough and 13 is
Pickup. Transforms of children that come from an FBX are not in the YAML: the values marked "derived"
are worked out from the FBX node data and the import settings (file scale 0.01, X mirrored) and were
not checked in Unity.

```
EmyChess                                      empty root
+- ChessManager                               ChessManager                              (prefab line 4013)
+- ChessSet                                   ChessSet.fbx root (a Null)
|  +- Board                                   mesh (2 tris, Board.mat); Board           (4350)
|  |  |                                       derived local position (4, 0.5, 4), scale 0.01: its origin is the a1 corner
|  |  +- pieces_parent                        scale 100; empty at rest; pieces are reparented here on first use (4204)
|  |  +- pieces_pools                                                                     (4551)
|  |  |  +- pawn    VRCObjectPool, pawn0..pawn19      (inactive piece prefab instances)
|  |  |  +- bishop  VRCObjectPool, bishop0..bishop7
|  |  |  +- king    VRCObjectPool, king0..king7
|  |  |  +- knight  VRCObjectPool, knight0..knight7
|  |  |  +- queen   VRCObjectPool, queen0..queen15
|  |  |  +- rook    VRCObjectPool, rook0..rook7
|  |  +- additional_transforms                scale 100                                  (2689)
|  |     +- PromotionPicker                   PromotionPicker.prefab; PromotionPicker; at (-0.5, 0, -0.5)
|  |     |  +- Pieces (inactive)              y 0.478, scale 0.4589
|  |     |  |  +- pawn, queen, knight, bishop, rook    piece prefab instances with GhostPiece.mat,
|  |     |  |  |                              a CapsuleCollider and a PromotionButton each (plus the stray Piece, D7)
|  |     |  |  |  +- Canvas / Image / AvailableCount   world canvas, Text "0" (the pawn's canvas is inactive)
|  |     |  +- reference_pawn (inactive)
|  |     +- GameOverMessage                   GameOverMessage; at (-4, 3, -4) = 3 squares above the board centre (870)
|  |        +- GameOver                       world Canvas 1174 x 140; Spin (speed 1)     (2012)
|  |           +- Image                       brown panel
|  |              +- GameOverText             Text, BackfaceCulledUI.mat                  (1613)
|  +- border                                  mesh (34 tris, Wood.mat)
|  +- UIHolder                                mesh (12 tris, Wood.mat); derived position (6.25, 0.75, 0)
|     +- Canvas                               world Canvas 8 x 2.11, VRCUiShape
|        +- Title, logText, devText
|        +- MainMenu                                                                      (3138)
|        |  +- WhiteJoin/Text, BlackJoin/Text
|        |  +- GameMode: GameModeText, "Anarchy Button"/Text, "Standard Button"/Text
|        |  +- StartButton/Text
|        |  +- AutoTimerToggle: Background/Checkmark, Label, TimerNote
|        +- GameMenu (inactive)                                                           (5973)
|        |  +- CurrentlyMoving: CurrentMoveLabel, CurrentSideLabel
|        |  +- whiteScore/whiteScoreLabel, blackScore/blackScoreLabel
|        |  +- endGame/Text
|        +- WhitePlayerLabel/Label, BlackPlayerLabel/Label
+- Rules
|  +- DefaultRules                            DefaultRules                               (4688)
+- Timer                                      Timer.fbx root (clock body, 364 tris); Timer; at (-6, 0, 0)   (346)
|  +- TimerButton_Left                        mesh, BoxCollider, TimerButton (raiseAngle 10)  = Black      (420)
|  +- TimerButton_Right                       mesh, BoxCollider, TimerButton (raiseAngle -10) = White      (485)
|  +- TimerGlass                              mesh (TimerGlass.mat)
|  +- TimerScreen                             mesh (TimerScreen.mat)
|     +- Canvas                               world Canvas 215 x 86, VRCUiShape
|        +- LeftTimer/LeftMilliseconds, RightTimer/RightMilliseconds
|        +- MovesCounter/MovesLabel
|        +- Reset/Text, Add30s/Text, Add1m/Text, Add15m/Text
|        +- six line Images
+- Utils
|  +- PlayerObjects
|     +- whitePlayerObject                    PlayerHolder                               (2428)
|     +- blackPlayerObject                    PlayerHolder                               (1626)
+- AnarchyControls_Black                      AnarchyControls.prefab; at (3, 0, -7), turned 90 degrees
|  +- EndTurnButton                           mesh (RedButton.mat), BoxCollider, SendEventOnInteract
|  +- PiecePlacerHolder                       (named SpawnPieceHolder in the FBX)
|  |  +- PiecePlacer                          layer 13; BoxCollider, kinematic Rigidbody, VRCPickup, PiecePlacer
|  |     +- Pieces                            Pieces.fbx: bishop, king, knight, pawn, queen, rook (GhostPiece.mat)
|  +- TextCanvas: EndTurnText, AnarchyText
|  +- ButtonCanvas (VRCUiShape): NextType/Text, PreviousType/Text, AvailableText, PieceCount
+- AnarchyControls_White                      the same; at (-3, 0, 7), turned -90 degrees; PiecePlacer.white = 1 (6576)
```

Piece prefab (all six, `R/Prefabs/<type>.prefab`; pawn line numbers): layer 17 (`:20`); MeshFilter (mesh
from `Pieces.fbx`); MeshRenderer (`WhitePiece.mat`); Rigidbody, no gravity, kinematic, rotation frozen
(`:99-102`); BoxCollider (`:115`); VRCPickup with `DisallowTheft` 1, `pickupable` 1, `proximity` 2
(`:130-148`); `Piece`; UdonBehaviour, Manual (`:193`); AudioSource, no clip, not play-on-awake, 3D, custom
rolloff from 1 to 5 (`:220-223`).

| Type | Collider size (x, y, z) | Mesh | Triangles |
|---|---|---|---|
| pawn | 0.524, 0.744, 0.524 | Cylinder.008 | 406 |
| rook | 0.513, 0.879, 0.513 | Cylinder.012 | 380 |
| knight | 0.553, 0.983, 0.564 | Cylinder.007 | 686 |
| bishop | 0.560, 1.184, 0.560 | Cylinder.005 | 730 |
| queen | 0.622, 1.480, 0.622 | Cylinder.011 | 574 |
| king | 0.620, 1.562, 0.620 | Cylinder.006 | 616 |

Pool sizes come from `Board.pieceAmounts` (`R/EmyChess.prefab:4390`, bytes `14 08 08 08 10 08`) in the
order pawn, bishop, king, knight, queen, rook: 20, 8, 8, 8, 16, 8. They are the output of the editor
inspector (`Editor/BoardInspector.cs:78-116`), whose own default is 16, 8, 2, 8, 16, 8 (`:62`). If the
VRChat pool hands out the first inactive object in array order (its usual behaviour; the SDK is not in
the repo), a new game always uses the same objects, in FEN order: `king0` is the black king, `king1`
the white one, `pawn0`-`pawn7` Black's pawns, `pawn8`-`pawn15` White's. The port's pool shim should do
exactly that, so the golden vectors can name objects.

### 5.2 Serialized fields of each behaviour

Paths are relative to the prefab root. UdonSharp 1.x keeps the fields in plain YAML on a proxy
component whose script GUID is the `.cs` file's, so they were read directly.

**ChessManager** (`ChessManager`, script `91d4fcaf...`, `R/EmyChess.prefab:4042`)

| Field | Refers to |
|---|---|
| `board` | `Board` on `ChessSet/Board` |
| `timer` | `Timer` on `Timer` |
| `picker` | `PromotionPicker` on `ChessSet/Board/additional_transforms/PromotionPicker` |
| `whitePlayerHolder`, `blackPlayerHolder` | `PlayerHolder` on `Utils/PlayerObjects/whitePlayerObject`, `.../blackPlayerObject` |
| `whitePlayerLabel`, `blackPlayerLabel` | Text on `ChessSet/UIHolder/Canvas/WhitePlayerLabel`, `.../BlackPlayerLabel` |
| `mainMenu`, `gameMenu` | GameObjects `.../Canvas/MainMenu`, `.../Canvas/GameMenu` |
| `gameModeLabel` | Text `.../MainMenu/GameMode/GameModeText` |
| `logText` | Text `.../Canvas/logText` (set to "" at start; otherwise unused) |
| `startButton`, `endButton` | Button `.../MainMenu/StartButton`, `.../GameMenu/endGame` |
| `whiteJoinLabel`, `blackJoinLabel` | Text `.../MainMenu/WhiteJoin/Text`, `.../BlackJoin/Text` |
| `autoTimerCheckMark` | GameObject `.../MainMenu/AutoTimerToggle/Background/Checkmark` |
| `currentPlayerLabel`, `currentSideLabel` | Text `.../GameMenu/CurrentlyMoving/CurrentMoveLabel`, `.../CurrentSideLabel` |
| `whiteScoreLabel`, `blackScoreLabel` | Text `.../GameMenu/whiteScore/whiteScoreLabel`, `.../blackScore/blackScoreLabel` |
| `gameOverMessage` | `GameOverMessage` on `.../additional_transforms/GameOverMessage` |
| `anarchyControls_black`, `anarchyControl_white` | GameObjects `AnarchyControls_Black`, `AnarchyControls_White` |
| `endTurnButton_black`, `endTurnButton_white` | UdonBehaviour on `AnarchyControls_Black/EndTurnButton`, `AnarchyControls_White/EndTurnButton` |
| `blackPiecePlacer`, `whitePiecePlacer` | `PiecePlacer` on `AnarchyControls_*/PiecePlacerHolder/PiecePlacer` |
| synced fields | all 0 |

**Board** (`ChessSet/Board`, script `617aecfd...`, `:4350`)

| Field | Refers to |
|---|---|
| `piece_pools` (6) | VRCObjectPool on `ChessSet/Board/pieces_pools/{pawn,bishop,king,knight,queen,rook}`, in that order (`:4363`) |
| `pieces_parent` | Transform `ChessSet/Board/pieces_parent` |
| `whitePieceMaterial`, `blackPieceMaterial`, `ghostMaterial` | `WhitePiece.mat`, `BlackPiece.mat`, `GhostPiece.mat` (`ghostMaterial` is never read by code) |
| `pieceMovedClip`, `pieceCapturedClip` | `R/Audio/Move.ogg`, `R/Audio/Capture.ogg` |
| `board_renderer` | MeshRenderer on `ChessSet/Board` |
| `currentRules` | `DefaultRules` on `Rules/DefaultRules` |
| `chessManager` | `ChessManager` on `ChessManager` |
| `piecePrefabs` (6), `pieceAmounts` | editor only: the six piece prefabs; 20, 8, 8, 8, 16, 8 |
| `grid`, `whiteKing`, `blackKing`, `PawnThatDidADoublePushLastRound` | empty |

**Piece** (68 pooled objects, script `1c6ac312...`): `pool` = the VRCObjectPool it sits in, `board` = the
`Board`, `type` = the pool's name. All three are instance overrides written by the inspector (68 `pool`
and 68 `type` overrides in the prefab; 71 `board` overrides, the other three being the picker and the
two placers).

**DefaultRules** (`Rules/DefaultRules`, `:4717`): `anarchy` 0; the two marker vectors are (0, 0) in the
file and are set to (-1, -1) and (-2, -2) in `Start` (`DefaultRules.cs:57-58`).

**Timer** (`Timer`, script `e5565efa...`, `:346`)

| Field | Refers to |
|---|---|
| `chessManager` | `ChessManager` |
| `displayBlack`, `millisecondsDisplayBlack` | Text `Timer/TimerScreen/Canvas/LeftTimer`, `.../LeftTimer/LeftMilliseconds` |
| `displayWhite`, `millisecondsDisplayWhite` | Text `.../RightTimer`, `.../RightTimer/RightMilliseconds` |
| `displayMoves` | Text `.../MovesCounter` |
| `whiteButton`, `blackButton` | `TimerButton` on `Timer/TimerButton_Right`, `Timer/TimerButton_Left` |

**TimerButton** (2, `:420`, `:485`): `allowPush` 0, `isRaised` 0, `raiseAngle` 10 (left) or -10 (right),
`timer` = `Timer`.

**GameOverMessage** (`:905`): `chessManager`; `statusMessage` = Text
`.../GameOverMessage/GameOver/Image/GameOverText`; `uiParent` = GameObject `.../GameOverMessage/GameOver`.

**Spin** (on `.../GameOverMessage/GameOver`, `:2012-2025`): `speed` 1.

**PlayerHolder** (2, `:1655`, `:2457`): no fields.

**PromotionPicker** (`R/Prefabs/PromotionPicker.prefab:1333`): `board` = `Board` (instance override),
`piecesButtonsParent` = GameObject `.../PromotionPicker/Pieces`.

**PromotionButton** (5, `R/Prefabs/PromotionPicker.prefab:1211-1614`): `picker`; `promotionType` =
"pawn", "queen", "knight", "bishop" or "rook"; `availableCountLabel` = the `AvailableCount` Text under
that button.

**PiecePlacer** (2, `R/Prefabs/AnarchyControls.prefab:1039`): `board` (override); `white` 0 in the prefab,
1 on the white console (`R/EmyChess.prefab:6576`); `pieceMeshParent` = Transform
`.../PiecePlacer/Pieces`; `availableText`, `pieceCount` = Text
`AnarchyControls_*/ButtonCanvas/AvailableText`, `.../PieceCount`.

**SendEventOnInteract** (2, `R/Prefabs/AnarchyControls.prefab:918-932`): `targetBehaviour` = the
UdonBehaviour on `ChessManager`, `eventName` "_EndTurn"; interact text "End Turn" (`:896`).

### 5.3 Buttons, clickable objects and pickups

UI buttons: all 15 are `UnityEngine.UI.Button` with one persistent call, `UdonBehaviour.SendCustomEvent`
(string argument, call state "runtime only"). No other UnityEvents are wired anywhere.

| Button (path under the root) | Target | Method | Prefab line |
|---|---|---|---|
| `ChessSet/UIHolder/Canvas/MainMenu/WhiteJoin` | ChessManager | `_RegisterWhite` | `R/EmyChess.prefab:6479` |
| `.../MainMenu/BlackJoin` | ChessManager | `_RegisterBlack` | `:5730` |
| `.../MainMenu/GameMode/Standard Button` | ChessManager | `_SetStandardGameMode` | `:5026` |
| `.../MainMenu/GameMode/Anarchy Button` | ChessManager | `_SetAnarchyGameMode` | `:3839` |
| `.../MainMenu/StartButton` | ChessManager | `_StartGame` | `:2838` |
| `.../MainMenu/AutoTimerToggle/Background` | ChessManager | `_ToggleAutoTimer` | `:5156` |
| `.../GameMenu/endGame` | ChessManager | `_EndGame` | `:5443` |
| `Timer/TimerScreen/Canvas/Reset` | Timer | `_ResetTimerEvent` | `:2413` |
| `.../Canvas/Add30s` | Timer | `_Add30s` | `:3047` |
| `.../Canvas/Add1m` (label "60") | Timer | `_Add1m` | `:1899` |
| `.../Canvas/Add15m` | Timer | `_Add15m` | `:777` |
| `AnarchyControls_Black/ButtonCanvas/NextType`, `.../PreviousType` | that console's PiecePlacer | `_NextType`, `_PreviousType` | `R/Prefabs/AnarchyControls.prefab:388,518` |
| `AnarchyControls_White/ButtonCanvas/NextType`, `.../PreviousType` | that console's PiecePlacer | `_NextType`, `_PreviousType` | same prefab |

The four clock buttons have their background Image disabled (text only). Smallest targets at prefab
scale 1: the clock's "+30 s" and "60" are about 0.36 units square, the placer arrows 0.42 x 0.37, Join
1.19 x 0.40, Start Game 2.0 x 0.59. At the proposed default scale of 0.0625 the smallest is about 2.3 cm.

Objects clicked through `Interact` (a collider plus an UdonBehaviour):

| Object | Collider | Behaviour | Does |
|---|---|---|---|
| `Timer/TimerButton_Left`, `Timer/TimerButton_Right` | Box, about 0.79 x 2.06 x 0.19 units after the model's scale of 100 | TimerButton | `timer._SwitchSide()` in manual mode |
| `AnarchyControls_*/EndTurnButton` (2) | Box 1.62 x 0.66 x 1.25 | SendEventOnInteract | `ChessManager._EndTurn()` |
| `.../PromotionPicker/Pieces/{pawn,queen,knight,bishop,rook}` (5) | Capsule (the bishop also has a Box, D7) | PromotionButton | `picker.PromoteTo(type)` |

Pickups: the 68 pooled pieces (`OnPickup`, `OnDrop` in `Piece`) and the 2 placers (`OnDrop` in
`PiecePlacer`; `DisallowTheft` 0, layer 13).

For the kit: 15 + 9 = 24 click targets, 70 grab targets, 25 texts the script writes, about 90
behaviours to bind (1 ChessManager, 1 Board, 1 DefaultRules, 1 Timer, 2 TimerButton, 1
GameOverMessage, 2 PlayerHolder, 1 PromotionPicker, 5 PromotionButton, 2 PiecePlacer, 2
SendEventOnInteract, 68 Piece; Spin becomes an Animation). Two routes for the 15 UI buttons: keep them
as Unity Buttons and use the `uiButton` event kind (depends on spike S6), or have the kit builder add a
layer-5 BoxCollider the size of each button's rectangle and bind `click`. The second needs nothing
unproven and is the proposal.

Relay ops this game needs: `text`, `clock`, and one new op, `interactable` (`1` or `0`, on a UI Button),
unless the Start and End Game buttons get separate "enabled" and "disabled" looks switched with
`active`.

### 5.4 Canvases, animators, audio

- 12 world-space canvases (render mode 2), each with a CanvasScaler and a GraphicRaycaster: the main
  panel, the clock screen, the banner, five picker labels, and two per console. 52 Text components, 26
  Images (4 disabled), 15 Buttons. Fonts: Unity's built-in Arial everywhere except the clock's digits
  and its four button labels, which use `EmyLCD.ttf`. That font has no letters, so "RESET", "s" and "m"
  already fall back to another font upstream.
- Animators, Animation components, particle systems: none in any prefab or in the scene.
- Audio sources: 68, one on every pooled piece, all identical (5.1). Clips: 2, referenced only from
  `Board` (`pieceMovedClip`, `pieceCapturedClip`).

---

## 6. Assets

### 6.1 Inventory (everything under `R/` that the prefab uses)

| Kind | Count | Bytes | Largest | Notes |
|---|---|---|---|---|
| Models (binary FBX 7.4, exported from Blender 2.93) | 4 | 187,648 | `Pieces.fbx` 100,812 | `ChessSet.fbx` 21,964 (board 2 tris, border 34, panel 12); `Timer.fbx` 41,740 (566 tris in 5 meshes); `AnarchyControls.fbx` 23,132 (208 tris); `Pieces.fbx` (3,392 tris for one of each). Import: file scale on, scale 1, read/write on, no compression |
| Textures | 1 used | 864,559 | `wood.png` 1024 x 1024 RGBA | Import cap 1024, crunched. Used only by `Wood.mat` |
| Other images | 2 (identical) | 1,182,656 each | `preview.png` 1157 x 981 | Repo root and `R/Resources/`; not referenced by any prefab or script |
| Audio | 2 | 11,065 | `Move.ogg` 5,858 | Ogg Vorbis, stereo, 48 kHz, 0.215 s and 0.142 s; imported as 3D, normalised |
| Materials | 9 | 18,375 | | Table below |
| Shaders | 2 | 6,429 | `BackfaceCulledUI.shader` 3,736 | Table below |
| Fonts | 1 | 3,744 | `EmyLCD.ttf` | 16 glyphs: space, `+`, digits, `:`. Embedding flag 4 (preview and print) |
| Prefabs | 9 | 781,369 | `EmyChess.prefab` 560,378 | |
| Animations, controllers, particles, videos | 0 | | | |

No texture is larger than 2048 px. Triangles on screen: 16,060 for the 32 starting pieces; 36,600 if
all 68 are on the board; 1,030 for the board, frame, panel, clock and two consoles; up to 9,560 more
for the ghost pieces (six meshes on each placer, of which one is shown at a time, and five in the
picker).

### 6.2 Materials and shaders

| Material | Shader | Settings | Used by |
|---|---|---|---|
| `WhitePiece.mat` | Standard | white, smoothness 0.5, GPU instancing | pieces (default of the piece prefabs and of `Pieces.fbx`) |
| `BlackPiece.mat` | Standard | (0.189, 0.189, 0.189), smoothness 0.162, GPU instancing | black pieces (set by script), and the clock's black parts ("TimerBlack" is remapped to it) |
| `GhostPiece.mat` | Standard, transparent | (0.36, 0.61, 1, 0.34), emission (0, 0.43, 1) | picker pieces, placer pieces |
| `Wood.mat` | Standard | `wood.png`, smoothness 0.446 | border, panel, clock body, consoles |
| `RedButton.mat` | Standard | (0.95, 0.55, 0.55) | END TURN buttons |
| `TimerGlass.mat` | Standard, transparent | white, alpha 0.106, smoothness 1 | clock glass |
| `TimerScreen.mat` | Standard | (0.62, 0.76, 0.70), smoothness 0 | clock screen |
| `Board.mat` | `EmyChess/Board` | colours in F87, texture mix 0, tint colours orange, red, green | board |
| `BackfaceCulledUI.mat` | `EmyChess/BackfaceCulledUI` | | banner text |

Shaders that must be re-made for URP and Quest:

| Shader | What it does | Proposal |
|---|---|---|
| `EmyChess/Board` (surface shader, built-in pipeline only) | Antialiased procedural 8 x 8 checker; reads `float _Indicators[64]` and blends a tint 60 % into marked squares | URP Lit with a small generated checker texture, or a Shader Graph checker. Tints are no longer a shader job (6.3) |
| `EmyChess/BackfaceCulledUI` (Unity's UI shader, MIT, with `Cull Back`) | Stops the banner text showing mirrored from behind | A TextMeshPro material with cull mode Back. No derivative of the Unity shader ships |
| Standard (7 materials) | | URP Lit; two transparent ones (ghost with emission, glass) |
| Unity UI default (Images, Text) | | URP's UI shader, or TextMeshPro |

### 6.3 What the kit builder has to make that is not in the repo

1. **Square tints.** The page makes its own flat quads under `pieces_parent` (local only, nothing in the
   kit, no relay): a pool of 28 orange ones (a queen has at most 27 moves) and one red one, placed with
   `SetTransform` and switched with `active`. Unlit, colour (1, 0.5, 0) and (1, 0, 0) at 60 % opacity,
   which matches the shader's blend. The same quads can be the click targets for click-to-move (8.4).
2. **Fonts.** A TextMeshPro font asset from `EmyLCD.ttf` (digits, `+`, `:`) with LiberationSans SDF (SIL
   OFL) as fallback, and LiberationSans for every other label. Unity 6 has no built-in Arial.
3. **Two renderers per piece** (white and black), since the script cannot swap a material; or one
   renderer and the relay's `color` op, which loses the difference in smoothness.
4. **The banner's spin** as a looping Animation clip (90 degrees a second) that restarts when the object
   is switched on, as `Spin.OnEnable` does.
5. **Click colliders** for the 15 UI buttons (5.3), and the 9 `Interact` colliders moved to layer 5.
6. **A credits panel** (GPL-3.0, CC BY-SA 4.0, CC0 items, the fork's URL).
7. Whether a1 comes out dark depends on the board mesh's UVs and was not checked.

---

## 7. Translation map

Runtime scripts in porting order. The first three hold all the rules and can be tested against golden
vectors before anything else exists.

| # | Upstream file | Lines | Port file | Hard parts |
|---|---|---|---|---|
| 1 | `S/Piece.cs` | 311 | `ts/src/Piece.ts` | The state byte (`:24-57`) with C# byte arithmetic. `_UpdateState` (`:88-132`) does eight things in a fixed order: reparent, grab permission, double-push tracking, pose, material, grid rebuild, placer counts, king references. `OnDrop` (`:288-307`) needs the piece's position **after** the physics hold ends. `Mathf.RoundToInt` rounds halves to even. `pickup.IsHeld` and `Drop()` inside `_Capture` |
| 2 | `S/Board.cs` | 505 | `ts/src/Board.ts` | A pool shim for six `VRCObjectPool`s, handing out the first inactive object in array order. `GetAllPieces` (`:272-286`) depends on the child order of `pieces_parent`, which is "order of first use on this client". The grid is rebuilt only from `Piece._UpdateState`, and `MoveLegalCheck` relies on it being stale (3.5). FEN loop (`:212-252`). Tints re-done with quads (`:431-450`). `_CheckIfGameOver` (`:119-162`) |
| 3 | `S/Gamerules/DefaultRules.cs` | 459 | `ts/src/DefaultRules.ts` | Move lists are 64-entry `Vector2` arrays with an end marker (-1, -1) and a skip marker (-2, -2) (`:20-23,75-90`); the order of generation must match for the vectors. One read of the live grid inside a function that otherwise uses the grid it is given (`:118`). `isKingInCheck` walks the live piece list against a test grid (`:271-304`). The quirks D1, D17, D18, D19 must be kept. Start-up values are set in `Start` (`:55-65`) |
| 4 | `S/Misc/PlayerHolder.cs` | 29 | `ts/src/PlayerHolder.ts` | The owner is the data. Needs `Networking.GetOwner` returning null for a user who has left |
| 5 | `S/Misc/GameOverMessage.cs` | 85 | `ts/src/GameOverMessage.ts` | Reset at start by the master only (3.6 point 3); null winner (D22) |
| 6 | `S/ChessManager.cs` | 380 | `ts/src/ChessManager.ts` | `_RefreshUI` (`:85-126`) fans out to 10 texts, 5 active flags, 2 button states, 2 click gates, 2 placers, the tints and every piece's grab permission. `_EndTurn` (`:264-302`) order of work, including ending the game without returning. `OnPlayerLeft` (`:366-378`) and the referee's part in it |
| 7 | `S/Interactions/PromotionPicker.cs` | 76 | `ts/src/PromotionPicker.ts` | Local-only UI; finds its buttons by child order (D4); must hide on every client when the game stops (D10) |
| 8 | `S/Interactions/PromotionButton.cs` | 30 | `ts/src/PromotionButton.ts` | None |
| 9 | `S/Timer.cs` | 189 | `ts/src/Timer.ts` | The only file that is restructured, not translated: a shared start moment on the synced clock replaces per-frame writes (D13). `GetTimeString` (`:48-54`) must copy Unity's `TimeSpan.FromSeconds`, which rounds to the millisecond (9.1). The referee decides time-outs. Redraw rate |
| 10 | `S/Interactions/TimerButton.cs` | 43 | `ts/src/TimerButton.ts` | Sets a local Euler X while keeping Y and Z (`:27-28`) |
| 11 | `S/Interactions/PiecePlacer.cs` | 92 | `ts/src/PiecePlacer.ts` | `InverseTransformPoint` of a world position (`:69`); the truncating cast (D5); jumping back to its holder; `OnEnable` must run when the console is switched on |
| 12 | `S/Interactions/SendEventOnInteract.cs` | 19 | `ts/src/SendEventOnInteract.ts` | Calls a method by name |
| 13 | `S/Misc/Spin.cs` | 25 | `ts/src/Spin.ts` | Becomes an Animation in the kit; the file stays as a stub so the map is one to one |
| - | (new) | | `ts/src/index.ts` | Finds the `<bs-snippet>` elements, reads settings, loads the kit, builds behaviours from `bindings.json`, makes the tint quads |
| - | `Editor/BoardInspector.cs` | 208 | `Assets/Kit/Editor/ChessKitBuilder.cs` (C#, not TypeScript) | Its pool generation (`:78-116`) is what the kit builder repeats: 68 instances with `board`, `type` and `pool` set |

Total to translate: 2,243 lines in 13 files, of which about 1,275 (Piece, Board, DefaultRules) are rules.

---

## 8. Snippet design

### 8.1 Element and settings

```html
<bs-snippet name="chess-table" title="Chess Table"
  description="Two-player chess with legal moves, clock and a free-play mode. A port of EmyChess."
  script="https://<handle>.worldspace.host/pk-chess-table.js"
  position="0 0.75 0" rotation="0 0 0" scale="0.0625"
  room="" mode="standard" auto-timer="false" clock="0" input="auto"
  allow-anarchy="true" sound="true" credits="true">
  <bs-gizmo type="position" attribute="position"/>
  <bs-gizmo type="box" attribute="position" size="0.82 0.2 1.0"/>
  <bs-gizmo type="plane" attribute="position" size="0.5 0.5" rotation="90 0 0"/>
</bs-snippet>
```

| Attribute | Default | Meaning | Upstream source of the default |
|---|---|---|---|
| `position` | `0 0.75 0` | World position of the kit root (the base of the set; the playing surface is 0.5 units above it) | none: upstream is placed by hand |
| `rotation` | `0 0 0` | Euler degrees. Any rotation works: all square maths is in the board's local space | |
| `scale` | `0.0625` | One number. The board is 8 x `scale` metres: 0.5 m by default, with a 9.8 cm king. `1` is upstream's giant set | `README.md:23` |
| `room` | empty | Instance key (README names table). Two elements with the same `room` share one game | |
| `mode` | `standard` | Mode selected when the table is fresh: `standard` or `anarchy` | `DefaultRules.cs:30` |
| `auto-timer` | `false` | Automated Timer when fresh | `ChessManager.cs:49` (false) |
| `clock` | `0` | Seconds on both clocks when fresh and after RESET | `Timer.cs:184` (0) |
| `input` | `auto` | `auto`: grab in a headset, click-to-move on a flat screen. `grab` or `click` force one (8.4) | new |
| `allow-anarchy` | `true` | `false` hides the Anarchy button, for hosts who want rules only | new |
| `sound` | `true` | Move and capture sounds | |
| `credits` | `true` | The credits panel. It carries the licence notices, so `false` should be allowed only if the host shows them elsewhere (question Q8) | |
| `windows`, `android` | none | Bundle addresses for tests (README names table) | |

Fresh-table settings apply only when the instance has no state yet; after that the shared state wins.
Every value is validated and falls back to its default.

Gizmos: the position handle; a box for the footprint (about 13 x 16 units, so about 0.82 x 1.0 m at
the default scale); a flat 0.5 m plane for the board. Gizmo sizes are fixed numbers in the markup, so
the box and the plane are right only at the default `scale`. The snippet's description should say so.

`single`: **no**. Several tables in one world is the normal case.

Seats and players: no seats (upstream has no stations). Two sides, which one user may both hold;
any number of spectators; no limit below the room's.

### 8.2 What is per instance

- Holder object `pk1:chess-table:<inst>` and everything under it, including the page-made tint quads.
- Every state key (`pk1.chess-table.<inst>.`), the referee leaf, the one-shot envelope (`g`, `i`).
- The relay payload prefix (`chess-table:<inst>|`) and the clock request ids.
- Behaviour objects, scheduler entries and the 20 Hz tick subscription.
- Network ids, only if any object ends up synced (proposal: none do, 10.3 R2).
- Nothing in `localStorage`, no user state.

Shared by all instances on a page: the script, `window.__pk1`, the compiled bindings, the bundle
addresses, the synced-clock offset.

### 8.3 Networked objects and budgets per table

| Budget | Use |
|---|---|
| Networked objects (1,024 per room) | 0 if pieces are not synced objects (proposal); 70 if they are |
| Space-state keys (2,048 per room) | 8 with the packed piece leaf; 75 with a leaf per piece |
| State writes | one batch per player action; none while a clock runs |
| One-shots | one per move or spawn (the sound) |
| Page-to-Unity calls | a board reset touches 32 pieces (pose, layer, active, colour): about 100 calls in one tick on each client (10.3 R7) |

### 8.4 Player actions

"Click" is a pointer and trigger in a headset and the left mouse button on a flat screen; it needs a
collider on layer 5. "Grab" is the grip in a headset; on a flat screen it is holding the left mouse
button over a collider on layer 20, with the object following the cursor and the scroll wheel setting
its distance (SDK doc `getting-started/testing-in-play-mode.md`; that the released app behaves the same
on a flat screen is not confirmed).

| Action | In a headset | On a flat screen | Notes |
|---|---|---|---|
| Join or leave a side | Click Join White / Join Black | same | Upstream lets anyone take an occupied side (F6); see Q5 |
| Choose the mode, toggle Automated Timer | Click | same | |
| Start Game, End Game | Click | same | The script ignores the click when the button is disabled |
| Move a piece | `input="grab"`: grab your piece (targets tint orange), carry it, let go over a square. `input="click"`: click your piece (it lifts slightly, targets tint), then click a tinted square or the piece standing on it; clicking the piece again cancels | `auto` picks click-to-move; grab also works | Grab maps to `OnPickup` and `OnDrop`; click-to-move calls `PiecePicked()` and `PieceDropped(x, y)`, which upstream exposes as separate methods (`Piece.cs:221,250`). Click-to-move is an addition; upstream lists a mouse mode as a TODO (`Piece.cs:216`) |
| Illegal move | The piece returns to its square | same | |
| Promote | Click one of the five pieces above the pawn | same | Only the promoting player sees them |
| Add time, reset the clock | Click "+30 s", "60", "+15m", RESET on the clock screen | same | Anyone |
| Switch the clock by hand | Click the raised clock button | same | Manual mode only |
| End turn (Anarchy) | Click the red button on your console | same | |
| Choose a piece type (Anarchy) | Click "<" or ">" on a console | same | Per player, not shared |
| Add a piece (Anarchy) | Grab the ghost piece from your console and let go over a square | Grab with the mouse; or, in click mode, click the ghost piece and then a square | |
| Delete a piece (Anarchy) | Carry it well off the board and let go | Drag it off the board; in click mode, click the piece and then a "remove" target beside the board | The remove target is an addition for click mode |
| Watch | Nothing to do | same | Spectators can still press the clock, mode and timer controls, as upstream (F9, F11, F71) |

Which pieces can be acted on is decided on each client by the same test upstream uses for
`pickupable`. In grab mode a piece that may be moved has its collider on layer 20 and every other piece
on layer 5, where hands pass through it and the script ignores clicks. In click mode all pieces stay on
layer 5 and the script decides which clicks count.

---

## 9. Test plan

### 9.1 Golden vectors (rung 1; upstream C# compiled with dotnet against stubs)

Compile all 13 runtime files unchanged against a stub library and drive the real methods
(`_StartGame`, `PiecePicked`, `PieceDropped`, `PromoteTo`, `_EndTurn`), recording outputs as JSON for
the TypeScript to match. What the stubs need: `UdonSharpBehaviour` deriving from `UdonBehaviour` (so the
casts at `Board.cs:104,281` and `PromotionPicker.cs:26` work); `GameObject` and `Transform` with
parent, ordered children, active flag and local pose; `VRCObjectPool`; `VRC_Pickup`; `Networking`;
`VRCPlayerApi`; `Text`, `Button`, `Renderer`, `Material`, `AudioSource`; `Vector2`, `Vector3`,
`Quaternion`, `Mathf`, `Time`, `Debug`; and a recorder for sync requests, events and sounds. `Start`
must be called on `DefaultRules` before anything else, or the two markers are (0, 0).

Three traps:

1. **`TimeSpan.FromSeconds`.** Unity 2019's Mono uses the .NET Framework implementation, which rounds
   to the nearest millisecond; .NET Core 3.0 and later keep the fraction. Vectors for `GetTimeString`
   built with modern dotnet would be off by up to 1 ms. The harness must supply its own rounding
   (value x 1000 + 0.5, truncated), or the vectors must be built with Mono. (From the published
   class-library behaviour; not run here.)
2. **Loading positions.** `ReadFENString` marks every piece "never moved" (`Piece.cs:156`), which gives
   any pawn a double step and any king and rook castling rights. The harness loader sets `hasMoved` and
   the double-push pawn explicitly and records them in each vector.
3. **Piece order.** `pieces_parent`'s child order is part of the input when two pieces share a square.

| Set | Input | Output compared | Why it suits vectors |
|---|---|---|---|
| V1 state byte | all 256 values; each setter with each value | x, y, white, hasMoved; resulting byte | `Piece.cs:24-57` |
| V2 FEN set-up | the start FEN and 20 others | per piece: pool object, x, y, colour; which objects are `whiteKing`, `blackKing` | `Board.cs:212-252` |
| V3 pseudo-legal moves | about 200 positions, every piece | the ordered list up to the end marker | `DefaultRules.cs:100-231` |
| V4 legal moves | the same | the same list with skip markers | `DefaultRules.cs:312-346` |
| V5 attack tests | `isCaptureFeasible` for 6 types x 64 x 64 squares; `isKingInCheck` on the positions | booleans | `DefaultRules.cs:251-304` |
| V6 applying a move | positions x legal and illegal targets | result 0, 1 or 2; every piece's state and active flag; scores; double-push pawn; side to move; game-over state; sounds; whether the picker opened | `Piece.cs:250-286`, `DefaultRules.cs:388-437`, `ChessManager.cs:264-302` |
| V7 perft | start position to depth 4 (depth 5 nightly); Kiwipete and the usual positions 3, 4 and 5 to depth 3; promotion counted as upstream offers it (five choices) | node counts, and the full move list at depth 1 | The start position should give the standard 20, 400, 8,902, 197,281 (no castling or promotion can occur that early). A difference there is an upstream finding and the upstream number still wins |
| V8 known quirks | castling out of check; castling across an attacked square; king against king; en passant that uncovers a rank attack; a pawn loaded off its home rank | as V4 and V6 | Pins D1, D2, D17, D18, D19 so nobody "fixes" them by accident |
| V9 results | fool's mate, a back-rank mate, three stalemates | `_CheckIfGameOver` and the banner text | `Board.cs:119-162`, `GameOverMessage.cs:24-50` |
| V10 whole games | six recorded games covering both castlings, en passant, each promotion choice including "stay a pawn" | the state after every ply | end to end |
| V11 drop mapping | local positions on a 0.05 grid from -5 to 12, including every exact half | square, or "deleted" in Anarchy | `Piece.cs:292-302` (rounding to even, clamp, thresholds) |
| V12 placer mapping | the same grid | upstream's x, y (documents D5) | `PiecePlacer.cs:69-71` |
| V13 Anarchy | scripted moves, captures of own pieces and kings, spawns until a pool is empty, deletions | states, scores (with the wrap at 256), counts | `DefaultRules.cs:363-370`, `PiecePlacer.cs:67-85` |
| V14 clock text | 0, 0.0004, 0.0005, 59.9995, 3599.999, 86399.9995, 86400, 356400; MOVES 0 to 255 | the two strings | `Timer.cs:48-66`; the port then departs on purpose for D14 |

Not suited to vectors: the clock's running time, ownership, late joining, leaving. Those are scenarios.

### 9.2 Node scenarios (rung 1; several clients on the fake room, virtual time)

| # | Scenario | Pass rule |
|---|---|---|
| N1 | A joins White, B joins Black, C watches; A starts | All three clients hold the same digest; C's pieces cannot be acted on |
| N2 | Scholar's mate, A and B alternating | Same digest after every ply; banner text on all three; nothing can be moved afterwards |
| N3 | Illegal drops by the player to move, and attempts by the other player and by C | State unchanged; no write, or a no-op write |
| N4 | D joins at ten different points of N2 | D's digest equals A's within one tick; D's en passant target equals A's (D8) |
| N5 | Promotion: the picker is open on A only; B presses End Game | A's picker closes; no piece appears (D10) |
| N6 | B leaves mid-game; A leaves mid-game; both leave; a player holding both sides leaves | Game ended, sides freed, by the remaining player or the referee (D11, D12) |
| N7 | The referee leaves during each of N2's plies | A new referee within the stagger time; no state lost; nothing reset (3.6 point 3) |
| N8 | Everyone leaves mid-game; E arrives 1 hour later and 25 hours later | E gets a fresh table both times (10.1 C4) |
| N9 | Automated clock: 5 s each, alternate moves, then let Black run out | Displays within 100 ms of each other on all clients; "TIME'S UP" once, written by the referee; the clock stops |
| N10 | Manual clock: C presses buttons during a game; RESET mid-game; add time while stopped and while running | Matches F64 to F71 |
| N11 | Anarchy: spawn, capture own piece, delete, end turn; A and B each choose a different placer type | Counts and scores agree; selections stay per client |
| N12 | Two tables with different `room` values plus another game's snippet in one room; a full game on each at once | No key, one-shot or relay payload crosses over; removing one element leaves the other running |
| N13 | A and B press Join White in the same tick; A drops a piece in the tick B presses End Game | One winner; digests agree; no piece left on a cleared board |
| N14 | Budget: Start, 200 plies, End, repeated 50 times, recording relay tokens | Never above 20 writes a second; no `rate_limited`; key count constant |
| N15 | Random soak: 1,000 random actions by 4 clients with joins and leaves | Digests agree at every quiet point; no exception |

### 9.3 Play mode, one player (rung 3)

A scenario bot in the page drives the script through `window.__pk1`; PASS and FAIL lines go to the
console. One player may hold both sides (F7), so a whole game needs no second player.

| # | Check |
|---|---|
| P1 | The kit loads from a hand-written `<bs-snippet>`; every binding resolves; 68 pieces inactive; main menu shown |
| P2 | Join both sides, start: 32 pieces on the right squares with the right colours (positions read back from Unity) |
| P3 | Scholar's mate through `PiecePicked` and `PieceDropped`: texts on the panel, banner shown and turning, pieces locked |
| P4 | Real input: a mouse grab and release over a square moves the piece; a release over an illegal square returns it; the position read at drop is the one the hand left it at (R1) |
| P5 | Tints: picking up the b1 knight shows exactly two quads on a3 and c3; they go on drop |
| P6 | Promotion: picker placed over the pawn, each choice works, counters show pool counts |
| P7 | Clock: add time, start, the text changes at the tick rate, RESET; relay calls per second recorded |
| P8 | Anarchy: consoles appear, type cycling, spawn by dropping the placer, delete by far drop, END TURN |
| P9 | Sounds play once per move at the piece |
| P10 | Two tables in one scene: a game on each without interference; remove one element at run time |
| P11 | Every button's click reaches the script (15 UI, 9 physical); disabled buttons do nothing |

### 9.4 Local Multiplayer, two players (rung 4)

| # | Check |
|---|---|
| M1 | Each player joins one side; a 20-ply game with a capture, a castle and en passant; both pages reach the same digest after every ply |
| M2 | Player 2 cannot grab or click Player 1's pieces, nor their own out of turn |
| M3 | Player 2 reloads the page mid-game: same digest, same board, clock within 100 ms |
| M4 | Player 2 closes mid-game: Player 1's page ends the game and frees the side within 2 s |
| M5 | Automated clock time-out: seen once on both |
| M6 | A held piece: Player 2 sees it stay put until the drop (upstream behaviour, F21) and nothing flickers afterwards |
| M7 | Promotion on Player 1: Player 2 sees no picker, then the new piece |
| M8 | Simultaneous Join on the same side: one holder, both pages agree |
| M9 | Main editor is the referee and stops: the clone becomes referee and play continues |

Rung 5 (app and headset), when a world is available: grabbing 3 cm pieces by hand at the default scale;
frame time on Quest with 12 canvases and 52 texts; clock text rate; hover feedback on click targets.

---

## 10. Changed or left out, risks, questions

### 10.1 Changed

| # | Change | Reason |
|---|---|---|
| C1 | The clock is a shared start moment on the synced clock; every client computes the time; the referee declares a time-out | Per-frame synced floats do not fit a 20-per-second write budget, and upstream's version breaks when the clock's owner changes (D13) |
| C2 | A side is a user id. A user who is not in the room holds nothing | There is no object ownership to borrow, and upstream's version hands the side to a stranger (D11) |
| C3 | The referee ends the game or frees a side when a registered player leaves and no registered player is left to do it | D12 |
| C4 | A table whose registered players are all absent when a referee is elected is reset | Space state lasts 24 hours after the room empties; a VRChat instance does not |
| C5 | All writes of one action go in one batch, and a client applies a whole change set before reacting | Removes D20 and D21 and keeps within the write budget |
| C6 | The pawn open to en passant is part of the shared state | D8 |
| C7 | Pieces are locked whenever a result is showing; drops are ignored when no game is in progress; the picker closes on every client when the game stops | D9, D10, D23 |
| C8 | Promotion counters work | D4; the code's intent is plain |
| C9 | The red check square is shown, to everyone | D3; the TODO states the intent |
| C10 | Hours are shown as total hours | D14 |
| C11 | Click-to-move as a second way to move, and the default on a flat screen | No evidence that carrying small objects with a mouse is good enough; upstream wanted it (`Piece.cs:216`) |
| C12 | Tints are quads made by the page, not a shader array | No relay op can set a float array |
| C13 | The banner turns at 90 degrees a second, by Animation | Upstream's speed follows the frame rate (D24); the script ticks at 20 Hz |
| C14 | All text is TextMeshPro with LiberationSans and an EmyLCD font asset | Unity 6 has no built-in Arial; the kit must hold everything it uses |
| C15 | The placer puts the piece on the square under it (pending Q3) | D5 |
| C16 | A dead button is marked by tint or state, not by removing a hover prompt | No `DisableInteractive`, no tooltips |
| C17 | Default size is a 0.5 m table-top board | Upstream's prefab is 8 m wide at scale 1 and is scaled by hand |

### 10.2 Left out

| Item | Reason |
|---|---|
| `Editor/BoardInspector.cs` | Editor tool; its pool generation is repeated in the kit builder |
| `SendCustomEventDelayedFrames` at `Piece.cs:159` | Workaround for a VRChat sync problem that does not exist here |
| Debug helpers: `_DebugGrid`, `_LogGrid`, `_LogCurrentGrid`, `_DebugState`, tint value 3, `logText`, `devText` | Unused by the game. The console lines are kept |
| `R/ExampleScene.unity`, VRChat descriptor | Replaced by `Assets/Scenes/Showcase.unity` |
| `Board.shader`, `BackfaceCulledUI.shader` | Built-in pipeline only; replaced (6.2) |
| `preview.png`, `Website/`, `.github/`, `Packages/com.vrchat.core.*` | Packaging and listing, not the game. The VRChat folders must not be copied into anything that ships |
| Interact prompts ("End Turn", "Use") | No equivalent |
| `DisallowTheft`, pickup `proximity` | Not needed: only the mover's client can act on a piece; no grab-from-a-distance setting was found |
| Seeing a held piece move in someone else's hand | Not in upstream either (F21). Could be added later with synced objects (R2) |

### 10.3 Open risks, ranked

| # | Risk | Why it matters | What settles it |
|---|---|---|---|
| R1 | **Grab, drop and read-back on kit objects.** Pieces are kinematic bodies upstream. The SDK says a Rigidbody is needed "to be picked up" and that `kinematicIfNotOwned` exists for synced objects, but not whether a plain kinematic body follows the hand. On drop the script needs the piece's position; the README has no transform read and `drop` carries only the hand. `WatchTransform` or a property query can supply it, with unknown delay | Without it, moving pieces by hand does not work at all. Click-to-move (C11) is the fallback and needs none of it | A spike on the pathfinder before `Piece.ts` is finished: grab a kinematic kit object, release it, read its local position in the same tick and one tick later |
| R2 | **Synced objects for pieces.** The README's example binding gives a piece `"sync": "transform"`. Upstream has no object sync on pieces, and a synced piece would be posed both by its owner's stream and by every client from state; a late stream frame can pull a piece back for up to a second | Flicker, and 70 of the room's 1,024 objects per table | Proposal: `"sync": "none"` for all 70. Revisit only if R1 shows that grabbing needs a synced object |
| R3 | **Clicks from kit objects.** 24 click targets; the 15 UI buttons either need the `uiButton` route (spike S6) or colliders | The whole lobby is buttons | Proposal: colliders on layer 5 for all 24; S6 then only matters for looks |
| R4 | **One leaf per behaviour** gives 68 piece leaves per table (75 in all) and has no home for the pools' active flags | Key budget (2,048 a room) and a runtime feature the README does not describe | Decide in the runtime: a behaviour class may share one packed leaf, or the game keeps an array on `Board` |
| R5 | **`IsMaster` and 24-hour state** (3.6 point 3, C4) | A referee change mid-game must not reset the clock; an abandoned table must not greet the next visitor mid-game | Runtime rule plus scenarios N7 and N8 |
| R6 | **Clock text rate.** Milliseconds change every tick: about 20 relay calls a second per running clock, each a string through `SendToVisualScripting` and a graph | Cost on Quest is unknown until rung 5 | Measure in P7; fallbacks are tenths of a second at 10 Hz, or a small generated graph that draws the running time itself |
| R7 | **Burst of page-to-Unity calls** at Start and End (about 100 a tick per client) | A visible hitch on Quest | Use `SetTransform` and `SetComponents` batches; measure in P2 |
| R8 | **Small targets** at the default scale: 3 cm pawns, 2.3 cm clock buttons | Hard to grab or hit in a headset | Rung 5; the `scale` setting and click-to-move are the outs |
| R9 | **`$clip` wording.** The clips belong to `Board` but play through each piece's source | A binding the exporter may reject | Give every piece the same two-clip list (0 move, 1 capture) and read `Board`'s two fields as indices; or one source on the board |
| R10 | **Golden-vector fidelity**: the three traps in 9.1 | Wrong vectors would "prove" a wrong port | Harness review; V7 against the published perft numbers for the start position |
| R11 | **Licence hygiene**: GPL-3.0 reaches the bundled runtime; the VRChat folders in the fork are not GPL; the font's origin is unclear | A public fork and a public script | Notices as in section 1; a decision on Q7 |
| R12 | **Flat-screen grabbing in the app** is documented for Play mode only | `input="auto"` assumes it | Rung 5 |

### 10.4 Questions for Shane, most important first

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Castling: keep upstream's looser rule (allowed out of check and across an attacked square, D1) or make it the standard rule? | Keep upstream's, so the vectors stay the authority |
| Q2 | King against king: keep "CHECKMATE! Winner: <last mover>" (D2) or show a draw? | Show "DRAW, only the kings are left"; keep state 1 |
| Q3 | Piece placer: fix the one-square offset (D5)? And should a placer dropped away from the board still add a piece (D6)? | Fix the offset; keep D6 |
| Q4 | Is click-to-move welcome as an addition, and as the flat-screen default? | Yes |
| Q5 | Should Join on an occupied side still take it over (F6), and may spectators press the clock, mode and timer controls (F9, F11, F71)? | Keep both, as upstream |
| Q6 | The slug is `chess-table` but upstream has no table (the one in `preview.png` is not in the repo). Add a plain table, or ship the set alone to stand on the host's furniture? | Set alone; `position` puts it on a surface |
| Q7 | `EmyLCD.ttf` may derive from "Open 24 Display St". Ship it under the README's CC BY-SA statement, ask the author, or replace the digits with LiberationSans? | Ship it, with the doubt recorded in the notices |
| Q8 | May a host switch the credits panel off? | No: drop the `credits` setting |
| Q9 | Should other players see a piece while it is held (not in upstream)? | No, unless R1 forces synced objects anyway |

**Decided by the coordinator (2026-11-24)**, replacing the defaults above:

| # | Decision |
|---|---|
| Q1 | Standard chess: no castling out of check, through an attacked square or into check. Anarchy stays as upstream (free moves, no validation) |
| Q2 | King against king and the other dead positions are a **draw** ("DRAW! Neither side can checkmate"), game-over state 4 |
| Q3 | The upstream defects that are plainly bugs are fixed (placer one square off, promotion counters, check square cleared in the same call, and the rest that are bugs rather than rules), each listed in 10.5 as a deliberate difference. A ghost let go off the board adds nothing (D6 fixed too) |
| Q4 | Pieces are picked up and dropped as upstream (grabbable, `sync: none`, position read back at drop, snapped by the rules). Click-to-move is offered as well (click a piece, then a square), for desktop and as the VR fallback |
| Q5 | A player claims White or Black as upstream (taking an occupied side still replaces its holder; spectators may press the clock, mode and timer controls). When a seated player leaves, the side is freed after 60 s (upstream acts at once; a player who comes back within the minute keeps the side) |
| Q6 | No table: upstream ships none; the snippet is the board, clock and controls. The slug proposal `chess-table` stays |
| Q7 | `EmyLCD.ttf` is replaced by an openly licensed seven-segment font: DSEG7 Classic (SIL OFL 1.1). The wood texture is kept: its OpenGameArt page (node 10010) was fetched and reads CC0, and `wood.png` is a crop of that page's `darkwood2.jpg` |
| Q8 | A small credits panel on the board, opened and closed by each viewer, lists the licences and the source links. It cannot be switched off (no `credits` setting) |
| -  | Licence: `pk-chess-table.js` is GPL-3.0 as a whole (it bundles the MIT portkit runtime); its header carries the licence, the copyright lines, the upstream URL and the fork's (`https://github.com/sidequestlegend/EmyChess`). Upstream art stays CC BY-SA 4.0 with attribution. Nothing VRChat's ships |

### 10.5 As built: every deliberate difference from upstream

Rules (checked against upstream's own C# by the golden vectors, `ts/test/golden.test.ts`: these are the only differences
they allow):

| # | Difference | Upstream |
|---|---|---|
| D1 | Castling is refused when the king is in check or crosses an attacked square (`DefaultRules.GetAllLegalMoves`, `CastlesThroughCheck`) | allowed: Kiwipete perft(2) is 2043 upstream, 2039 here (the published count) |
| D2 | Dead positions are a draw, state 4: bare kings, king and one bishop or knight against a king, kings and bishops all on one square colour (`Board.IsDeadPosition`) | kings only: state 1, "CHECKMATE! Winner: <last mover>" |
| D5 | The ghost piece lands on the square under it (the nearest centre, as a piece does) | `(int)pos*-1-1`: one square toward a1 |
| D6 | A ghost let go off the board adds nothing | clamped onto an edge square |
| D14 | The clock shows total hours, 00 to 99 | `TimeSpan.Hours`: wraps at 24 |

Bugs fixed (not rules), each tested in `ts/test/scenarios.test.ts` or by the Play-mode test:

| # | Fix |
|---|---|
| D3 | The red square of a king in check is shown, on every client, while it is that side's move |
| D4 | The promotion counters show the pieces left in each pool (the picker reads its PromotionButtons, not the stray Piece) |
| D7 | The stray Piece behaviours on the picker's buttons and `reference_pawn` (and the bishop button's extra BoxCollider) are not in the kit |
| D8 | The pawn open to en passant is synced (`Board.doublePushIndex`) instead of guessed on each client |
| D9 | No piece can be picked up while a result shows or a promotion is open |
| D10 | The promotion picker closes on every client when the game stops, and a click on it afterwards does nothing |
| D11, D12 | A side is a user id. A player who leaves is shown "(away)" and keeps the side 60 s; then the other registered player, or the referee if none is left, ends the game and frees the side |
| D13 | The clock is a stored time plus the shared-clock moment its count began; every client works it out; only the referee calls TIME'S UP |
| D15 | Start Game with a running automated clock stops it (keeping both times) and starts White's; upstream reset it to zero, so it never started |
| D20, D21 | Gone by design: the whole table is one sync group (one leaf), applied as a whole before any behaviour reacts |
| D22 | A missing winner reads "-" |
| D23 | A piece let go while no game is on, or after it was captured, goes back to its square; nothing else happens |
| D24 | The banner turns at 90 degrees a second (a small graph), not one degree a frame |

Other changes, and why:

- **Size.** The kit is 1/16 of upstream's prefab: a 0.5 m board, a 9.8 cm king. The snippet's `scale` (default 1)
  multiplies that. (Proposed in 8.1 as `scale="0.0625"`; baked into the kit so that scale 1 is the natural size.)
- **Fonts and text.** Every legacy uGUI Text is TextMesh Pro (Liberation Sans); the clock's digits use an atlas drawn
  from DSEG7 Classic. The banner's text uses TextMesh Pro with back faces culled instead of `BackfaceCulledUI.shader`.
- **Board.** An 8 x 8 checker texture (a1 dark, read from the board mesh's UVs) instead of the procedural shader; 64
  square quads carry the tints (orange: a legal move, red: check, green: the piece chosen for click-to-move) and are the
  click targets for click-to-move.
- **Buttons.** The 15 uGUI buttons are clicked through colliders on the UI layer (no uGUI raycaster); a button that does
  nothing for you now is drawn grey (Start Game, End Game) or dark (END TURN). Spectators' clicks on Join/Start/End
  during a game are ignored, as the hidden menu made them upstream.
- **Pieces.** Grabbable (BS Grababble on the Grabbable layer) while they may be moved, else on the UI layer (clickable,
  hands pass through); white or black by colour and smoothness on the piece's own material (relay `color`, `matFloat`).
  Sounds play through each piece's audio source from the board's clip list (relay `audio`). With `input="click"` no
  piece is ever grabbable.
- **Click-to-move.** A piece clicked, or let go on its own square, is chosen; a click on a highlighted square or the
  piece standing there moves it, through upstream's own PiecePicked and PieceDropped. In Anarchy the ghost piece can be
  clicked and then a square.
- **Settings.** `mode`, `auto-timer`, `clock`, `input`, `allow-anarchy`, `sound` apply to a fresh table (set by its
  referee). `credits` is not a setting (Q8).
- **Left out of 8.4:** the "remove" target beside the board for deleting a piece in click mode (deleting is by carrying
  a piece off the board, as upstream).
- **Manual clock at zero:** a side whose time has run out cannot be switched (upstream's count stopped a hair above
  zero and could still switch).

### 10.6 Checklist status (the 91 features of section 2)

All 91 are in the port: **74 as upstream, 17 changed on purpose, none left out**. Evidence: N = Node (fake room or
golden vectors, `ts/test`), P = editor Play mode (rung 3, `playtest/evidence_single.txt`), M = two Local Multiplayer
players (rung 4, `playtest/evidence_multi.txt`).

| Features | Status | Evidence |
|---|---|---|
| F1-F15 lobby, sides, start (menus, labels, join/leave, replace, one player both sides, Start rules, mode, timer toggle, start position, coordinates) | as upstream | N, P (F1-F3, F7, F8, F13, F14), M (F3, F5) |
| F16 Start with the automated clock running | **changed** (D15: stops it and starts White's) | N |
| F17, F18 currently moving, End Game | as upstream | N, P |
| F19 the game ends when the turn passes to a side nobody holds | **changed**: a player who left holds the side 60 s ("away") | N |
| F20-F35 moving pieces, sounds, captures, scores, tints, legal moves of every piece | as upstream | N (vectors: every move list), P (F20, F23, F27-F30) |
| F36 castling | **changed** (D1: standard rule) | N (vectors) |
| F37-F41 king safety, promotion picker, choices, empty pool, others see a pawn | as upstream | N |
| F42 promotion counters | **changed** (D4 fixed: they show the pools) | N |
| F43 check | **changed** (D3: the red square shows, for everyone) | N, P |
| F44, F45, F48, F49 checkmate, stalemate, game stays on after a result, what upstream does not have | as upstream | N, P (F44) |
| F46 king against king | **changed** (D2: a draw, as are the other dead positions) | N (vectors) |
| F47 the banner turns | **changed** (90 degrees a second, a graph; D24) | P (banner shows) |
| F50-F56, F59-F62 Anarchy: free drops, many moves, END TURN, no tints, deleting, placer types and counts, spawned pieces, console reset, clock | as upstream | N (vectors F50, F54; scenario) |
| F57, F58 where the ghost piece lands | **changed** (D5, D6) | N (vectors) |
| F63-F71 clock display and buttons, manual clock, MOVES, anyone may press | as upstream | N, P (F63, F68) |
| F72 TIME'S UP | **changed** (called by the referee from the synced clock, D13) | N |
| F73 the clock stops at a result (automated) | as upstream (frozen on every client at once) | N, P |
| F74 manual clock at zero | **changed** slightly (a side at zero cannot be switched) | N |
| F75 hours | **changed** (D14: total hours) | N (vectors) |
| F76 who computes the running time | **changed** (C1: every client, from the synced clock) | N |
| F77-F80, F84, F86 what is shared, late joiners, spectators, trust | as upstream (late joiners get every field at once: D20, D21 gone) | N, M (F78 by reload) |
| F81-F83 a registered player leaves | **changed** (60 s grace; then the other player or the referee ends the game and frees the side: D11, D12) | N |
| F85 nothing is saved | **changed** slightly: the room keeps the table for 24 h; a referee who finds a table whose players are all away resets it (C4) | N |
| F87-F91 presentation | as upstream, remade for URP (6.2, 10.5) | P (screenshot) |

Additions (not in upstream): click-to-move, dead-position draws, the credits panel, snippet settings, two tables in one
room (each its own `room`).

---

## 11. Not determined

- Anything about run-time behaviour in VRChat: nothing was run. In particular the order of ownership
  hand-over and `OnPlayerLeft`, whether inactive pooled objects receive `OnDeserialization`, and how
  often D9 actually happens.
- D4 and D5 are conclusions from the prefab YAML and from UdonSharp's cast code (read from the public
  UdonSharp repository, current master; EmyChess declares 1.1.6). They were not observed.
- The identity of four VRChat SDK components referenced by DLL file id (`1804438810` pickup,
  `454367647` object pool, `-1533785930` UI shape, `-17141911` scene descriptor) is inferred from their
  serialized fields and where they sit; the SDK is not in the repo.
- Child transforms inside the four FBX files, and therefore the exact layout numbers marked "derived"
  in 5.1, and whether a1 is a dark square.
- That Unity's `TimeSpan.FromSeconds` rounds to the millisecond (9.1) and that the VRChat object pool
  spawns in array order (5.1): both are stated from general knowledge of those libraries, not from the
  repo, and neither was run.
- The OpenGameArt licence page for the wood texture (HTTP 403).
- Where `EmyLCD.ttf` came from.
- On the Altspace side: whether a kinematic body can be grabbed, how soon a dropped object's position
  can be read, whether Unity UI buttons in a kit can notify the page, what hover feedback click targets
  get, and whether flat-screen grabbing in the app matches Play mode.
