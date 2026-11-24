// Port of Packages/com.emymin.emychess/Runtime/Scripts/Misc/Spin.cs (EmyChess, GPL-3.0).
//
// The banner's turning is a small graph in the kit (ChessKitBuilder: 90 degrees a second, square again when shown):
// upstream turned it one degree a frame (D24), and the page has no frame loop. Kept as a class so the bindings' Spin
// behaviour has a home and the translation map stays one file per upstream file.

import { Behaviour } from "../portkit/src/index.ts";

export class Spin extends Behaviour {
  /** Upstream's degrees per frame; the kit's graph turns at 90 degrees a second instead. */
  speed = 1;
}
