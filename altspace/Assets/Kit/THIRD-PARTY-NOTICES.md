# Chess Table: third-party notices

Chess Table (snippet `chess-table`, script `pk-chess-table.js`, kit bundles `chess-table`) is a port of EmyChess to
Altspace. Port source: https://github.com/sidequestlegend/EmyChess (branch `altspace`, folder `altspace/`).
A copy of this file is inside every kit bundle (`Assets/Kit/THIRD-PARTY-NOTICES.md`).

## EmyChess: code

- Source: https://github.com/emymin/EmyChess (commit `428aae7`, package `com.emymin.emychess` 0.1.3)
- Authors: emymin, with BlackStartx, ZenithVal and BluWizard (git history)
- Licence: GNU General Public License v3.0 (`LICENSE` at the repository root; no "or later" wording)
- What of it is here: the 13 gameplay scripts are translated to TypeScript in `altspace/ts/src/` (one file per upstream
  file) and bundled into `pk-chess-table.js`. The script as a whole is therefore under GPL-3.0; its header says so and
  names the source. Changes from upstream are listed in `altspace/PORT.md` (section 10).

## EmyChess: art

- Models (`ChessSet.fbx`, `Pieces.fbx`, `Timer.fbx`, `AnarchyControls.fbx`), prefabs and materials, from the same
  repository.
- Licence: Creative Commons Attribution-ShareAlike 4.0 International (`LICENSE-CC-BY-SA`;
  https://creativecommons.org/licenses/by-sa/4.0/). Credit: EmyChess by emymin.
- Changed for this port (the kit is an adaptation, also CC BY-SA 4.0): materials remade for the Universal Render
  Pipeline; the board's checker drawn as an 8 x 8 texture instead of upstream's shader; every text remade in
  TextMesh Pro; 64 square click targets and tints added; the pieces moved under one parent; scaled to a table-top set
  (1/16); a credits panel added. Not shipped: `EmyLCD.ttf` (origin unclear), the `Board` and `BackfaceCulledUI`
  shaders, `preview.png`, the example scene.

## Wood texture

- `Runtime/Materials/wood.png` of EmyChess: a square crop of `darkwood2.jpg` from "Dark wood textures" by **bart**,
  OpenGameArt node 10010, https://opengameart.org/node/10010
- Licence: CC0 1.0 (public domain dedication). Checked on 2026-11-24 by fetching the page (licence field "CC0", linking
  https://creativecommons.org/publicdomain/zero/1.0/); the crop was matched against the page's file (correlation 0.82
  on a 32 x 32 grey version, against no better match elsewhere in the image).

## Sounds

- `Move.ogg`: "chess pieces.wav" by simone_ds, https://freesound.org/s/366065/ - CC0 1.0
- `Capture.ogg`: "Knock_3.wav" (uploader's account deleted), https://freesound.org/s/144947/ - CC0 1.0
- Both checked on freesound.org on 2026-11-24.

## Fonts

- **Liberation Sans** (LiberationSans SDF of TextMesh Pro's essentials), every text of the kit: SIL Open Font
  License 1.1. Copyright (c) 2012 Red Hat, Inc., with Reserved Font Name "Liberation".
- **DSEG7 Classic** Regular by keshikan, http://www.keshikan.net/fonts-e.html (release v0.46,
  https://github.com/keshikan/DSEG): the clock's digits. Copyright (c) 2017 keshikan, with Reserved Font Name "DSEG";
  SIL Open Font License 1.1 (full text in `Assets/Kit/Fonts/DSEG-LICENSE.txt`). The kit holds a TextMesh Pro atlas
  rendered from it (digits, colon and space), named "LcdDigits SDF".

## portkit runtime

- The runtime bundled into `pk-chess-table.js` (`altspace/ts/portkit/`) and the Unity editor package
  (`altspace/Packages/com.altspacegames.portkit/`): MIT License, Copyright (c) 2026 the portkit authors (`LICENSE`
  in those folders). Compatible with GPL-3.0; the combined script is GPL-3.0.

## Not used or shipped

- VRChat's packages in the upstream repository (`Packages/com.vrchat.core.vpm-resolver`, `com.vrchat.core.bootstrap`,
  their DLLs): VRChat Distro Licence. Nothing of them is in the kit, the script or this project.
- Unity's UI shader (MIT) that upstream's `BackfaceCulledUI.shader` derives from: not shipped (TextMesh Pro's own
  shader culls the banner's back face instead).
