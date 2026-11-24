// Port of Packages/com.emymin.emychess/Runtime/Scripts/Interactions/PromotionPicker.cs (EmyChess, GPL-3.0).
//
// Local to the promoting player, as upstream. Differences: the buttons are the PromotionButton behaviours themselves
// (upstream took the first UdonBehaviour of each child, which was a stray Piece, so the counters never showed: D4);
// the picker closes on every client when the game stops (D10, ChessManager._RefreshUI).

import { Behaviour, type GameObject, Quaternion, Vector3 } from "../portkit/src/index.ts";
import type { Board } from "./Board.ts";
import type { Piece } from "./Piece.ts";
import type { PromotionButton } from "./PromotionButton.ts";

export class PromotionPicker extends Behaviour {
  board!: Board;
  piecesButtonsParent!: GameObject;
  targetPiece: Piece | null = null;
  private promotionButtons: PromotionButton[] = [];
  private open = false;

  override Start(): void {
    this.promotionButtons = this.FindBehavioursOfType<PromotionButton>("PromotionButton");
    this.piecesButtonsParent.SetActive(false);
  }

  IsOpen(): boolean {
    return this.open;
  }

  Setup(piece: Piece): void {
    this.targetPiece = piece;
    this.open = true;
    this.board._AllPiecesUngrabbable();
    this.transform.localPosition = new Vector3(-(piece.x + 0.5), 0, -(piece.y + 0.5));
    this.transform.localRotation = piece.white ? Quaternion.identity : Quaternion.identity.mul(Quaternion.Euler(0, 180, 0));
    this.piecesButtonsParent.SetActive(true);
    for (const button of this.promotionButtons) button._RefreshCounter();
  }

  _PromotionDone(): void {
    this._Hide();
    this.board.chessManager._EndTurn();
  }

  _Hide(): void {
    if (!this.open && this.targetPiece === null) return;
    this.open = false;
    this.targetPiece = null;
    this.piecesButtonsParent.SetActive(false);
  }

  PromoteTo(type: string): void {
    const target = this.targetPiece;
    if (!this.open || target === null || !target._active) return; // (closed meanwhile: D10)
    const white = target.white;
    if (type === "pawn") {
      this._PromotionDone();
      return;
    }
    if (this.board.GetPiecesAvailableCount(type) > 0) {
      const x = target.x;
      const y = target.y;
      target._ReturnToPool();
      this.board._SpawnPiece(x, y, white, type);
      this._PromotionDone();
    }
    this.Debug.Log(`[ChessManager] ${white ? "White " : "Black "}${target.type} promoted to ${type}`);
  }
}
