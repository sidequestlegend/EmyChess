// Port of Packages/com.emymin.emychess/Runtime/Scripts/Interactions/PiecePlacer.cs (EmyChess, GPL-3.0).
//
// The ghost piece on each Anarchy console: choose a type with < and >, carry the ghost onto the board, let go, and a
// piece of that side's colour appears there. The choice is per client, as upstream.
//
// Differences (PORT.md 10.1): the square is the one under the ghost (D5: upstream's truncating cast landed one square
// toward a1); a ghost let go off the board adds nothing (D6: upstream clamped it onto an edge square); and in click mode
// the ghost can be clicked and then a square (click-to-move).

import { Behaviour, type GameObject, Mathf, NetworkEventTarget, Quaternion, type TextRef, Vector3 } from "../portkit/src/index.ts";
import type { Board } from "./Board.ts";
import type { ClickToMove } from "./ClickToMove.ts";
import { CLICK_LAYER, GRAB_LAYER } from "./Piece.ts";

/** Upstream's square for a ghost at local coordinate `local` under pieces_parent: `(int)pos * -1 - 1` (C# truncates). */
export function upstreamPlacerSquare(local: number): number {
  return Math.trunc(local) * -1 - 1;
}

/** The port's: the square whose centre is nearest, as for a piece; null off the board. `at` is in square units (a1 = 0). */
export function placerSquare(at: number): number | null {
  if (!(at >= -0.5 && at < 7.5)) return null;
  return Mathf.RoundToInt(Mathf.Clamp(at, 0, 7));
}

export class PiecePlacer extends Behaviour {
  board!: Board;
  white = false;
  currentType = "";
  /** The six ghost meshes under the placer (kit builder), shown one at a time by name. */
  pieceMeshes: GameObject[] = [];
  availableText!: TextRef;
  pieceCount!: TextRef;
  clickToMove: ClickToMove | null = null;

  private readonly types = ["pawn", "knight", "rook", "bishop", "queen", "king"];
  private index = 0;
  enabled = false;
  private held = false;

  override Start(): void {
    this.gameObject.On("click", () => {
      if (this.enabled) this.clickToMove?.ChoosePlacer(this);
    });
  }

  _Setup(): void {
    this.index = 0;
    this.currentType = this.types[this.index]!;
    this.SetEnabled(true);
    this._Refresh();
  }

  /** Upstream: pickup.pickupable. Grabbable layer when it may be used (UI layer, clickable, in click mode). */
  SetEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.held) return;
    this.gameObject.layer = enabled && this.board.chessManager.GrabInput() ? GRAB_LAYER : CLICK_LAYER;
  }

  _NextType(): void {
    this.index = (this.index + 1) % this.types.length;
    this.currentType = this.types[this.index]!;
    this._Refresh();
  }

  _PreviousType(): void {
    this.index = (this.index - 1 + this.types.length) % this.types.length;
    this.currentType = this.types[this.index]!;
    this._Refresh();
  }

  _Refresh(): void {
    if (this.currentType === "" || this.currentType === null) {
      this._Setup();
      return;
    }
    for (const child of this.pieceMeshes) child.SetActive(child.name === this.currentType);
    this.availableText.text = "Available " + this.currentType + "s";
    this.pieceCount.text = String(this.board.GetPiecesAvailableCount(this.currentType));
  }

  override OnPickup(): void {
    this.held = true;
    void this.board.RefreshFrame();
  }

  override OnDrop(): void {
    this.held = false;
    const at = this.board.WorldToSquare(this.transform.position);
    if (at !== null && this.enabled) {
      const x = placerSquare(at.x);
      const y = placerSquare(at.y);
      if (x !== null && y !== null) this.PlaceAt(x, y);
    }
    this.transform.localPosition = Vector3.zero;
    this.transform.localRotation = Quaternion.identity;
    this.SetEnabled(this.enabled);
    this._Refresh();
  }

  /** Adds a piece of the chosen type and this console's colour on a square, capturing what stands there. */
  PlaceAt(x: number, y: number): void {
    const manager = this.board.chessManager;
    if (!this.board.currentRules.anarchy || !manager.inProgress || this.board.GetPiecesAvailableCount(this.currentType) <= 0) return;
    const captured = this.board.GetPiece(x, y);
    if (captured !== null) captured._Capture();
    const spawned = this.board._SpawnPiece(x, y, this.white, this.currentType);
    if (spawned !== null) spawned.SendCustomNetworkEvent(NetworkEventTarget.All, "PieceMovedAudio");
    this._Refresh();
  }

  /** Upstream's OnEnable: the console was switched on. */
  OnEnable(): void {
    this._Setup();
  }
}
