// Port of Packages/com.emymin.emychess/Runtime/Scripts/Gamerules/DefaultRules.cs (EmyChess, GPL-3.0).
//
// Legal moves are passed around as 64-entry Vector2 arrays with an end marker (-1, -1) and a skip marker (-2, -2), as
// upstream does (UdonSharp had no lists); the order moves are generated in is kept, so the golden vectors made from the
// upstream C# can be compared entry by entry. Upstream quirks D17, D18 and D19 (PORT.md 2.9) are kept on purpose.
//
// One deliberate difference, decided for the port (PORT.md 10.4 Q1): castling follows the standard rule. Upstream
// allowed castling out of check and across an attacked square (its check test is commented out, D1); GetAllLegalMoves
// now drops those castling moves. Everything else about move generation is upstream's.

import { Behaviour, Mathf, Vector2 } from "../portkit/src/index.ts";
import type { Board } from "./Board.ts";
import type { Piece } from "./Piece.ts";

export class DefaultRules extends Behaviour {
  static override synced = ["anarchy"];

  /** Whether anarchy mode is enabled, set with SetAnarchy. */
  anarchy = false;
  /** Ends a move list. */
  legalMovesEndMarker = new Vector2(-1, -1);
  /** An entry to skip when iterating over a move list. */
  legalMovesIgnoreMarker = new Vector2(-2, -2);
  /** Directions a generic sliding piece can move in; also the queen's. */
  private slideDirections: Vector2[] = [];
  private rookDirections: Vector2[] = [];
  private bishopDirections: Vector2[] = [];
  private rookColumns: number[] = [];

  override Start(): void {
    this.legalMovesEndMarker = new Vector2(-1, -1);
    this.legalMovesIgnoreMarker = new Vector2(-2, -2);
    this.rookColumns = [0, 7];
    this.slideDirections = [new Vector2(-1, 0), new Vector2(1, 0), new Vector2(0, -1), new Vector2(0, 1), new Vector2(-1, 1), new Vector2(-1, -1), new Vector2(1, 1), new Vector2(1, -1)];
    this.rookDirections = [];
    for (let i = 0; i < 4; i++) this.rookDirections[i] = this.slideDirections[i]!;
    this.bishopDirections = [];
    for (let i = 0; i < 4; i++) this.bishopDirections[i] = this.slideDirections[7 - i]!;
  }

  /** "Appends" a move at `index`; returns the next index. Writes the end marker after it unless the array is full. */
  private AppendMove(index: number, x: number, y: number, legalMoves: Vector2[]): number {
    let newindex = index;
    if (x < 0 || x > 7 || y < 0 || y > 7) return newindex;
    if (index < legalMoves.length) {
      legalMoves[index] = new Vector2(x, y);
      if (index < legalMoves.length - 1) {
        legalMoves[index + 1] = this.legalMovesEndMarker;
        newindex++;
      }
    }
    return newindex;
  }

  /** Every pseudo-legal move of a piece (moves that may leave its own king attacked). */
  GetAllPseudoLegalMovesGrid(movedPiece: Piece, grid: Array<Piece | null>, PawnThatDidADoublePushLastRound: Piece | null, board: Board): Vector2[] {
    const legalMoves: Vector2[] = new Array<Vector2>(64).fill(Vector2.zero);
    let index = 0;
    legalMoves[index] = this.legalMovesEndMarker;
    const type = movedPiece.type;
    const x = movedPiece.x;
    const y = movedPiece.y;
    const white = movedPiece.white;
    const hasMoved = movedPiece.hasMoved;
    if (type === "pawn") {
      const dir = white ? 1 : -1;
      if (board.GetGridPiece(x, y + dir, grid) === null) {
        index = this.AppendMove(index, x, y + dir, legalMoves);
        if (!hasMoved) {
          // D19 (kept): this one test reads the live grid, not the grid it was given
          if (board.GetPiece(x, y + dir * 2) === null) index = this.AppendMove(index, x, y + dir * 2, legalMoves);
        }
      }
      const pieceCaptureLeft = board.GetGridPiece(x - 1, y + dir, grid);
      const pieceCaptureRight = board.GetGridPiece(x + 1, y + dir, grid);
      if (pieceCaptureLeft !== null && pieceCaptureLeft.white !== white) index = this.AppendMove(index, x - 1, y + dir, legalMoves);
      if (pieceCaptureRight !== null && pieceCaptureRight.white !== white) index = this.AppendMove(index, x + 1, y + dir, legalMoves);
      // EN PASSANT
      const pieceLeft = board.GetGridPiece(x - 1, y, grid);
      const pieceRight = board.GetGridPiece(x + 1, y, grid);
      if (pieceLeft !== null && pieceLeft === PawnThatDidADoublePushLastRound && pieceLeft.white !== white) {
        if (board.GetGridPiece(x - 1, y + dir, grid) === null) index = this.AppendMove(index, x - 1, y + dir, legalMoves);
      }
      if (pieceRight !== null && pieceRight === PawnThatDidADoublePushLastRound && pieceRight.white !== white) {
        if (board.GetGridPiece(x + 1, y + dir, grid) === null) index = this.AppendMove(index, x + 1, y + dir, legalMoves);
      }
    } else if (type === "king") {
      for (let i = -1; i < 2; i++) {
        for (let j = -1; j < 2; j++) {
          const squarepiece = board.GetGridPiece(x + i, y + j, grid);
          if (squarepiece === null || squarepiece.white !== white) index = this.AppendMove(index, x + i, y + j, legalMoves);
        }
      }
      if (!hasMoved) {
        // (upstream's check test stood here, commented out: castling out of and through check is dropped in GetAllLegalMoves)
        for (const rookColumn of this.rookColumns) {
          const startRook = board.GetGridPiece(rookColumn, y, grid);
          if (startRook !== null && startRook.type === "rook" && !startRook.hasMoved && startRook.white === white) {
            let free = true;
            for (let i = Mathf.Min(x, rookColumn) + 1; i < Mathf.Max(x, rookColumn); i++) {
              if (board.GetGridPiece(i, y, grid) !== null) free = false;
            }
            if (free) {
              const dir = Mathf.Min(x, rookColumn) === x ? 1 : -1;
              index = this.AppendMove(index, x + dir * 2, y, legalMoves);
            }
          }
        }
      }
    } else if (type === "rook" || type === "bishop" || type === "queen") {
      let allowedDirections = this.slideDirections;
      if (type === "rook") allowedDirections = this.rookDirections;
      else if (type === "bishop") allowedDirections = this.bishopDirections;
      for (const direction of allowedDirections) {
        let pos = new Vector2(x, y);
        for (;;) {
          pos = pos.add(direction);
          if (!board.isValidCoordinate(pos.x, pos.y)) break;
          const obstaclePiece = board.GetGridPiece(pos.x, pos.y, grid);
          if (obstaclePiece !== null && obstaclePiece.white === white) break;
          index = this.AppendMove(index, pos.x, pos.y, legalMoves);
          if (obstaclePiece !== null) break;
        }
      }
    } else if (type === "knight") {
      let left: Vector2;
      let right: Vector2;
      for (const direction of this.rookDirections) {
        let pos = new Vector2(x, y);
        pos = pos.add(direction.scale(2));
        if (direction.x === 0) {
          left = Vector2.left;
          right = Vector2.right;
        } else {
          left = Vector2.up;
          right = Vector2.down;
        }
        const leftPos = pos.add(left);
        const rightPos = pos.add(right);
        const leftPiece = board.GetGridPiece(leftPos.x, leftPos.y, grid);
        const rightPiece = board.GetGridPiece(rightPos.x, rightPos.y, grid);
        if (leftPiece === null || leftPiece.white !== white) index = this.AppendMove(index, leftPos.x, leftPos.y, legalMoves);
        if (rightPiece === null || rightPiece.white !== white) index = this.AppendMove(index, rightPos.x, rightPos.y, legalMoves);
      }
    }
    return legalMoves;
  }

  GetAllPseudoLegalMoves(piece: Piece, board: Board): Vector2[] {
    return this.GetAllPseudoLegalMovesGrid(piece, board.grid, board.PawnThatDidADoublePushLastRound, board);
  }

  /** A quick test of whether a piece of `type` could reach the threatened square at all. */
  isCaptureFeasible(opponentPosition: Vector2, threatenedPosition: Vector2, type: string): boolean {
    const dx = Mathf.Abs(opponentPosition.x - threatenedPosition.x);
    const dy = Mathf.Abs(opponentPosition.y - threatenedPosition.y);
    if (type === "rook") return opponentPosition.x === threatenedPosition.x || opponentPosition.y === threatenedPosition.y;
    else if (type === "pawn") return dx === 1 && dy === 1;
    else if (type === "knight") return dx < 3 && dy < 3;
    else if (type === "bishop") return dx === dy;
    else if (type === "queen") return opponentPosition.x === threatenedPosition.x || opponentPosition.y === threatenedPosition.y || dx === dy;
    // Vector2.magnitude is a float in C#: the same comparison in doubles gives the same answer for whole numbers
    else if (type === "king") return Math.fround(Math.sqrt(dx * dx + dy * dy)) < 3;
    return true;
  }

  /** Whether the king of side `white` standing on `threatenedPos` is attacked on `grid`. */
  isKingInCheck(threatenedPos: Vector2, grid: Array<Piece | null> | null, board: Board, PawnThatDidADoublePush: Piece | null, white: boolean): boolean {
    let isKingChecked = false;
    if (grid === null) {
      this.Debug.LogWarning("Empty grid, might be first turn");
      return false;
    }
    for (const opponentPiece of board.GetAllPieces()) {
      if (opponentPiece.white !== white) {
        if (this.isCaptureFeasible(opponentPiece.GetVec(), threatenedPos, opponentPiece.type)) {
          if (board.GetGridPiece(opponentPiece.x, opponentPiece.y, grid) === opponentPiece) {
            // not captured in the test move
            const opponentPseudoLegalMoves = this.GetAllPseudoLegalMovesGrid(opponentPiece, grid, PawnThatDidADoublePush, board);
            for (const move of opponentPseudoLegalMoves) {
              if (move.equals(this.legalMovesEndMarker)) break;
              if (move.equals(threatenedPos)) {
                isKingChecked = true;
                break;
              }
            }
          }
        }
      }
      if (isKingChecked) break;
    }
    return isKingChecked;
  }

  /** Every legal move of a piece: pseudo-legal moves that leave the king attacked are replaced by the skip marker. */
  GetAllLegalMoves(movedPiece: Piece, board: Board): Vector2[] {
    const pseudoLegalMoves = this.GetAllPseudoLegalMoves(movedPiece, board);
    const piecePos = movedPiece.GetVec();
    const king = movedPiece.white ? board.whiteKing : board.blackKing;
    if (king !== null) {
      const kingPos = king.GetVec();
      const currentGrid = board.grid;
      const testGrid: Array<Piece | null> = new Array<Piece | null>(currentGrid.length).fill(null);
      for (let i = 0; i < pseudoLegalMoves.length; i++) {
        const pseudoLegalMove = pseudoLegalMoves[i]!;
        if (pseudoLegalMove.equals(this.legalMovesEndMarker)) break;
        for (let k = 0; k < currentGrid.length; k++) testGrid[k] = currentGrid[k]!;
        board.MoveGridPieceVec(piecePos, pseudoLegalMove, testGrid);
        let PawnThatDidADoublePush: Piece | null = null;
        // D17 (kept): the x difference is tested where the y difference is meant, so this is never set
        if (movedPiece.type === "pawn" && Mathf.Abs(movedPiece.x - pseudoLegalMove.x) > 1) PawnThatDidADoublePush = movedPiece;
        const threatenedPos = movedPiece.type !== "king" ? kingPos : pseudoLegalMove;
        if (this.isKingInCheck(threatenedPos, testGrid, board, PawnThatDidADoublePush, movedPiece.white)) pseudoLegalMoves[i] = this.legalMovesIgnoreMarker;
        else if (movedPiece.type === "king" && movedPiece === king && Mathf.Abs(pseudoLegalMove.x - piecePos.x) === 2 && this.CastlesThroughCheck(movedPiece, pseudoLegalMove, board)) {
          // Standard chess (decided for the port, not upstream): no castling out of check, nor across an attacked square.
          pseudoLegalMoves[i] = this.legalMovesIgnoreMarker;
        }
      }
    }
    return pseudoLegalMoves;
  }

  /** True when the king is in check now, or the square it crosses on the way to `target` is attacked. */
  CastlesThroughCheck(king: Piece, target: Vector2, board: Board): boolean {
    const from = king.GetVec();
    if (this.isKingInCheck(from, board.grid, board, board.PawnThatDidADoublePushLastRound, king.white)) return true;
    const crossed = new Vector2(from.x + (target.x > from.x ? 1 : -1), from.y);
    const testGrid = board.grid.slice();
    testGrid[board.GridToIndex(crossed.x, crossed.y)] = king;
    testGrid[board.GridToIndex(from.x, from.y)] = null;
    return this.isKingInCheck(crossed, testGrid, board, board.PawnThatDidADoublePushLastRound, king.white);
  }

  /**
   * Moves a piece, with capture, en passant or castling. Recomputes the legal moves: when they are at hand (a dropped
   * piece), use MoveLegalCheck. Returns 0 when not allowed, 1 for a move, 2 for a capture.
   */
  Move(movedPiece: Piece, x: number, y: number, board: Board): number {
    let result = 0;
    if (this.anarchy) {
      const targetPiece = board.GetPiece(x, y);
      result = 1;
      if (targetPiece !== null && targetPiece !== movedPiece) {
        targetPiece._Capture();
        result = 2;
      }
      movedPiece._SetPosition(x, y);
      return result;
    }
    const legalMoves = this.GetAllLegalMoves(movedPiece, board);
    return this.MoveLegalCheck(movedPiece, x, y, board, legalMoves);
  }

  /** As Move, against the legal moves given. */
  MoveLegalCheck(movedPiece: Piece, x: number, y: number, board: Board, legalMoves: Vector2[]): number {
    let result = 0;
    const targetPiece = board.GetPiece(x, y);
    const move = new Vector2(x, y);
    let legal = false;
    for (const legalMove of legalMoves) {
      if (!legalMove.equals(this.legalMovesIgnoreMarker)) {
        if (legalMove.equals(this.legalMovesEndMarker)) break;
        if (move.equals(legalMove)) {
          legal = true;
          break;
        }
      }
    }
    if (!legal) {
      movedPiece._SetPosition(movedPiece.x, movedPiece.y);
      return 0;
    }
    if (targetPiece !== null) {
      targetPiece._Capture();
      result = 2;
    } else result = 1;

    // EN PASSANT (the grid is not rebuilt by a capture, so an ordinary capture does not look like one here)
    if (movedPiece.type === "pawn" && movedPiece.x !== x && board.GetPiece(x, y) === null) {
      board.PawnThatDidADoublePushLastRound?._Capture();
      result = 2;
    }
    // CASTLING
    if (movedPiece.type === "king" && Mathf.Abs(x - movedPiece.x) === 2) {
      const dir = Mathf.Min(x, movedPiece.x) === x ? -1 : 1;
      const rookCastle = dir === 1 ? board.GetPiece(7, y) : board.GetPiece(0, y);
      rookCastle?._SetPosition(x + dir * -1, y);
    }
    if (movedPiece.type === "pawn" && Mathf.Abs(y - movedPiece.y) === 2) board.PawnThatDidADoublePushLastRound = movedPiece;
    else board.PawnThatDidADoublePushLastRound = null;
    movedPiece.hasMoved = true;
    movedPiece._SetPosition(x, y);
    return result;
  }

  /** Puts every piece on its starting square. */
  ResetBoard(board: Board): void {
    board.ReadFENString("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
  }

  /** Anarchy mode: no rule checking. */
  SetAnarchy(enabled: boolean): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.anarchy = enabled;
    this.RequestSerialization();
  }
}
