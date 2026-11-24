// Click-to-move: an addition of the port (no upstream file). Upstream moves pieces only by picking them up; its
// Piece.cs:216 lists "a desktop mode ... can move with mouse" as a TODO. Here a piece is chosen by clicking it (or by
// letting it go on its own square), its legal squares show, and a click on a square or on the piece standing there
// moves it, through upstream's own Piece.PiecePicked and Piece.PieceDropped. In Anarchy a ghost piece can be clicked and
// then a square. It is the way to play on a flat screen and the fallback in a headset.

import { Behaviour } from "../portkit/src/index.ts";
import type { Board } from "./Board.ts";
import { same } from "./ChessManager.ts";
import type { Piece } from "./Piece.ts";
import type { PiecePlacer } from "./PiecePlacer.ts";

export class ClickToMove extends Behaviour {
  board!: Board;
  chosen: Piece | null = null;
  chosenPlacer: PiecePlacer | null = null;

  override Start(): void {
    this.board.clickToMove = this;
  }

  /** True when the local player may move this piece now (upstream's grab rule: their side, their turn, a game on). */
  MayMove(piece: Piece): boolean {
    const manager = this.board.chessManager;
    return piece._active && manager.inProgress && manager.CanMovePieces() && manager.currentSide === piece.white && same(this.Networking.LocalPlayer, manager.GetPlayer(manager.currentSide));
  }

  /** A piece was clicked. */
  PieceClicked(piece: Piece): void {
    if (this.chosen !== null && this.chosen !== piece && (this.board.currentRules.anarchy ? piece.white !== this.chosen.white : this.chosen.IsLegalTarget(piece.x, piece.y))) {
      // (in Anarchy a click on one of your own pieces chooses that one instead; carry a piece onto your own to take it)
      this.MoveChosenTo(piece.x, piece.y);
      return;
    }
    if (this.chosen === piece) {
      this.Clear(true);
      return;
    }
    if (this.MayMove(piece)) this.Choose(piece, true);
  }

  /** A square of the board was clicked. */
  SquareClicked(x: number, y: number): void {
    if (this.chosenPlacer !== null) {
      const placer = this.chosenPlacer;
      this.Clear(true);
      placer.PlaceAt(x, y);
      return;
    }
    if (this.chosen !== null) this.MoveChosenTo(x, y);
  }

  /** Chooses a piece: `pick` finds and shows its moves (it was clicked); otherwise they show already (let go in place). */
  Choose(piece: Piece, pick: boolean): void {
    if (!this.MayMove(piece)) return;
    this.chosenPlacer = null;
    if (pick) {
      this.board._ClearIndicators();
      this.board.chessManager._RefreshCheck();
      piece.PiecePicked();
    }
    this.chosen = piece;
    this.board.SetIndicator(piece.x, piece.y, 4);
    // the player may still change their mind and pick up or click another piece
    this.board._SetPiecesGrabbable(this.Networking.LocalPlayer, piece.white);
  }

  ChoosePlacer(placer: PiecePlacer): void {
    this.Clear(true);
    this.chosenPlacer = placer;
  }

  private MoveChosenTo(x: number, y: number): void {
    const piece = this.chosen!;
    this.chosen = null;
    if (!this.MayMove(piece)) {
      this.Clear(true);
      return;
    }
    piece.PieceDropped(x, y);
  }

  /** Forgets the choice; `tints` also takes its squares away and lets the player's pieces be picked up again. */
  Clear(tints: boolean): void {
    const had = this.chosen !== null || this.chosenPlacer !== null;
    this.chosen = null;
    this.chosenPlacer = null;
    if (!had || !tints) return;
    const manager = this.board.chessManager;
    this.board._ClearIndicators();
    manager._RefreshCheck();
    this.board._SetPiecesGrabbable(manager.GetPlayer(manager.currentSide), manager.currentSide);
  }

  /** Shows the choice again after the panel was redrawn (which clears the tints). */
  Reshow(): void {
    const piece = this.chosen;
    if (piece === null) return;
    if (!this.MayMove(piece)) {
      this.chosen = null;
      return;
    }
    const rules = this.board.currentRules;
    if (!rules.anarchy) {
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if (piece.IsLegalTarget(x, y)) this.board.SetIndicator(x, y, 1);
    }
    this.board.SetIndicator(piece.x, piece.y, 4);
  }
}

/** One square of the board: a click target for click-to-move (an addition of the port). */
export class BoardSquare extends Behaviour {
  x = 0;
  y = 0;
  clickToMove!: ClickToMove;

  override Interact(): void {
    this.clickToMove.SquareClicked(this.x, this.y);
  }
}
