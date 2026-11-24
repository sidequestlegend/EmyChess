// Port of Packages/com.emymin.emychess/Runtime/Scripts/Board.cs (EmyChess, GPL-3.0).
//
// The board holds no positions of its own: each Piece does. `grid` is a derived picture, rebuilt when a piece updates
// (and deliberately stale between a capture and the move that caused it, which DefaultRules.MoveLegalCheck relies on).
//
// Differences from upstream, each in PORT.md 10.1:
//   - the pools are the VRCObjectPool shim (first inactive piece in array order, as VRChat's pool does);
//   - GetAllPieces lists the active pieces in pool order (upstream: the order in which pieces were first reparented on
//     this client, which differs between clients and only matters when two pieces share a square in Anarchy);
//   - the pawn open to en passant is synced (D8): upstream guessed it on each client;
//   - square tints are the kit's 64 square quads, not a float array in the board shader;
//   - _CheckIfGameOver reports dead positions (bare kings, a lone minor piece, same-coloured bishops) as a draw (4);
//     upstream called king against king a checkmate won by the last mover (D2).

import { Behaviour, Color, Mathf, type RendererRef, Vector2, Vector3 } from "../portkit/src/index.ts";
import type { ChessManager } from "./ChessManager.ts";
import type { ClickToMove } from "./ClickToMove.ts";
import type { DefaultRules } from "./DefaultRules.ts";
import type { Piece } from "./Piece.ts";
import type { VRCObjectPool } from "./VRCObjectPool.ts";

/** Indicator values: 0 none, 1 a legal move, 2 a king in check, 3 debug, 4 the piece chosen for click-to-move. */
const TINTS: Color[] = [new Color(0, 0, 0, 0), new Color(1, 0.5, 0, 0.6), new Color(1, 0, 0, 0.6), new Color(0, 0.4, 1, 0.5), new Color(0.2, 0.9, 0.2, 0.55)];

export class Board extends Behaviour {
  static override synced = ["doublePushIndex"];

  piece_pools: VRCObjectPool[] = [];
  currentRules!: DefaultRules;
  chessManager!: ChessManager;
  /** Clip 0 and 1 of the board's own clip list, played through each piece's audio source. */
  pieceMovedClip: unknown = null;
  pieceCapturedClip: unknown = null;
  /** The 64 square quads' renderers, index x * 8 + y (kit builder). */
  squareRenderers: RendererRef[] = [];
  whiteColor = new Color(1, 1, 1, 1);
  blackColor = new Color(0.189, 0.189, 0.189, 1);
  whiteSmoothness = 0.5;
  blackSmoothness = 0.162;

  grid: Array<Piece | null> = new Array<Piece | null>(64).fill(null);
  private IndicatorArray: number[] = new Array<number>(64).fill(0);
  whiteKing: Piece | null = null;
  blackKing: Piece | null = null;
  /** D8: which piece (index in `allPieces`) made a two-square move last turn, -1 for none. Synced. */
  doublePushIndex = -1;
  /** Every piece of the kit, in pool order (pawns, bishops, kings, knights, queens, rooks). */
  allPieces: Piece[] = [];
  /** Click-to-move state (an addition of the port). */
  clickToMove: ClickToMove | null = null;

  /** Where the board is, for drops: the world centres of a1, h1 and a8, read from the host. */
  private frame: { a1: Vector3; ux: Vector3; uy: Vector3 } | null = null;

  get PawnThatDidADoublePushLastRound(): Piece | null {
    return this.doublePushIndex >= 0 ? (this.allPieces[this.doublePushIndex] ?? null) : null;
  }
  set PawnThatDidADoublePushLastRound(piece: Piece | null) {
    this.doublePushIndex = piece ? this.allPieces.indexOf(piece) : -1;
  }

  /** The pool of pieces of one type. */
  GetPool(type: string): VRCObjectPool | null {
    let foundPool: VRCObjectPool | null = null;
    for (const pool of this.piece_pools) if (pool.poolName === type) foundPool = pool;
    return foundPool;
  }

  /** How many pieces of a type can still be spawned. */
  GetPiecesAvailableCount(type: string): number {
    const pool = this.GetPool(type);
    let count = 0;
    if (pool === null) this.Debug.LogError("[ChessManager] Couldn't find pool for type " + type);
    else for (const piece of pool.pieces) if (!piece._active) count++;
    return count;
  }

  _SpawnPiece(x: number, y: number, white: boolean, type: string): Piece | null {
    const pool = this.GetPool(type);
    if (pool === null) return null;
    this.Networking.SetOwner(this.Networking.LocalPlayer, pool);
    const spawned = pool.TryToSpawn();
    if (spawned !== null) {
      this.Networking.SetOwner(this.Networking.LocalPlayer, spawned);
      spawned._Setup(x, y, white);
      return spawned;
    }
    return null;
  }

  /**
   * Whether the game is over: 0 not over, 1 checkmate, 2 stalemate, 4 a draw by dead position (the port's; upstream
   * returned 1 for king against king).
   */
  _CheckIfGameOver(white: boolean, isKingInCheck: boolean): number {
    let hasNoLegalMoves = true;
    const pieces = this.GetAllPieces();
    if (this.IsDeadPosition(pieces)) return 4;
    for (const piece of pieces) {
      if (piece.white === white) {
        const legalMoves = this.currentRules.GetAllLegalMoves(piece, this);
        let moveCount = 0;
        for (const move of legalMoves) {
          if (!move.equals(this.currentRules.legalMovesIgnoreMarker) && !move.equals(this.currentRules.legalMovesEndMarker)) moveCount++;
          if (move.equals(this.currentRules.legalMovesEndMarker)) break;
        }
        if (moveCount !== 0) {
          hasNoLegalMoves = false;
          break;
        }
      }
    }
    if (hasNoLegalMoves) return isKingInCheck ? 1 : 2;
    return 0;
  }

  /**
   * No sequence of legal moves can end in checkmate (FIDE 5.2.2), in the cases that are told by material alone: king
   * against king, king and one bishop or knight against king, kings and bishops all on squares of one colour.
   */
  IsDeadPosition(pieces: Piece[]): boolean {
    const others = pieces.filter((p) => p.type !== "king");
    if (pieces.length - others.length !== 2) return false;
    if (others.length === 0) return true;
    if (others.length === 1) return others[0]!.type === "bishop" || others[0]!.type === "knight";
    if (others.every((p) => p.type === "bishop")) {
      const colour = (p: Piece) => (p.x + p.y) % 2;
      return others.every((p) => colour(p) === colour(others[0]!));
    }
    return false;
  }

  /** Pieces of side `white` can be picked up if the local player is `player`; nothing can otherwise. */
  _SetPiecesGrabbable(player: { uid: string } | null, white: boolean): void {
    if (player !== null && this.Networking.LocalPlayer.uid === player.uid) {
      for (const piece of this.GetAllPieces()) piece.SetGrabbable(white === piece.white && this.chessManager.inProgress && this.chessManager.CanMovePieces());
    } else this._AllPiecesUngrabbable();
  }

  _AllPiecesUngrabbable(): void {
    for (const piece of this.GetAllPieces()) piece.SetGrabbable(false);
  }

  /** Captures every piece, clearing the board. */
  _ClearBoard(): void {
    this.Debug.Log("[ChessManager] Clearing Board");
    for (const piece of this.GetAllPieces()) piece._Capture();
  }

  /** Sets the board from the piece-placement part of a FEN string. */
  ReadFENString(FEN: string): void {
    this._ClearBoard();
    let x = 0;
    let y = 7;
    const boardString = FEN.split(" ")[0] ?? "";
    const types: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
    for (const character of boardString) {
      const type = types[character.toLowerCase()];
      if (type) {
        this._SpawnPiece(x, y, character !== character.toLowerCase(), type);
        x++;
      } else if (character === "/") {
        x = 0;
        y--;
      } else if (character >= "0" && character <= "9") x += Number(character);
    }
  }

  GetPieceCount(): number {
    let count = 0;
    for (const piece of this.allPieces) if (piece._active) count++;
    return count;
  }

  /** The pieces on the board, in pool order. */
  GetAllPieces(): Piece[] {
    return this.allPieces.filter((piece) => piece._active);
  }

  GridToIndex(x: number, y: number): number {
    return x * 8 + y;
  }

  VecToIndex(vec: Vector2): number {
    return this.GridToIndex(vec.x, vec.y);
  }

  isValidCoordinate(x: number, y: number): boolean {
    return x >= 0 && x <= 7 && y >= 0 && y <= 7;
  }

  SetGridPiece(x: number, y: number, piece: Piece | null, grid: Array<Piece | null>): void {
    grid[this.GridToIndex(x, y)] = piece;
  }

  GetBoardGrid(): Array<Piece | null> {
    const grid = new Array<Piece | null>(64).fill(null);
    for (const piece of this.GetAllPieces()) this.SetGridPiece(piece.x, piece.y, piece, grid);
    return grid;
  }

  GetGridPiece(x: number, y: number, grid: Array<Piece | null>): Piece | null {
    if (!this.isValidCoordinate(x, y)) return null;
    return grid[this.GridToIndex(x, y)] ?? null;
  }

  GetPiece(x: number, y: number): Piece | null {
    return this.GetGridPiece(x, y, this.grid);
  }

  /** Plays a move on a grid, with capture, en passant and castling. */
  MoveGridPiece(ox: number, oy: number, tx: number, ty: number, grid: Array<Piece | null>): void {
    const piece = this.GetGridPiece(ox, oy, grid);
    if (piece === null) return;
    if (piece.type === "pawn" && ox !== tx && this.GetGridPiece(tx, ty, grid) === null) {
      // EN PASSANT
      const dir = piece.white ? -1 : 1;
      this.SetGridPiece(tx, ty + dir, null, grid);
    }
    if (piece.type === "king" && Mathf.Abs(tx - ox) === 2) {
      const dir = Mathf.Min(tx, ox) === tx ? -1 : 1;
      const rox = dir === 1 ? 7 : 0;
      this.MoveGridPiece(rox, oy, tx + dir * -1, ty, grid);
    }
    this.SetGridPiece(tx, ty, piece, grid);
    this.SetGridPiece(ox, oy, null, grid);
  }

  MoveGridPieceVec(original: Vector2, target: Vector2, grid: Array<Piece | null>): void {
    this.MoveGridPiece(original.x, original.y, target.x, target.y, grid);
  }

  GetPieceVec(pos: Vector2): Piece | null {
    return this.GetPiece(pos.x, pos.y);
  }

  _RegenerateGrid(): void {
    this.grid = this.GetBoardGrid();
  }

  /**
   * The kings, which upstream sets as each piece updates ("the first king of that colour whose reference is empty or
   * inactive"). Kept as long as they stand; otherwise the first in pool order, so every client names the same one.
   */
  _RefreshKings(): void {
    const keep = (current: Piece | null, white: boolean) =>
      current !== null && current._active && current.type === "king" && current.white === white ? current : (this.GetAllPieces().find((p) => p.type === "king" && p.white === white) ?? current);
    this.whiteKing = keep(this.whiteKing, true);
    this.blackKing = keep(this.blackKing, false);
  }

  _ResetBoard(): void {
    this.currentRules.ResetBoard(this);
    this._ClearIndicators();
  }

  private _RefreshIndicators(): void {
    for (let i = 0; i < 64; i++) this.squareRenderers[i]?.SetColor(TINTS[this.IndicatorArray[i]!] ?? TINTS[0]!);
  }

  /** 0 no indicator, 1 a move, 2 check, 3 debug, 4 chosen (click-to-move). Only this client sees it. */
  SetIndicator(x: number, y: number, indicatorValue: number): void {
    this.IndicatorArray[x * 8 + y] = indicatorValue;
    this._RefreshIndicators();
  }

  GetIndicator(x: number, y: number): number {
    return this.IndicatorArray[x * 8 + y] ?? 0;
  }

  _ClearIndicators(): void {
    this.IndicatorArray = new Array<number>(64).fill(0);
    this._RefreshIndicators();
  }

  /** Shows debug indicators for every occupied square of `grid`. */
  _DebugGrid(grid: Array<Piece | null>): void {
    for (let i = 0; i < 64; i++) this.IndicatorArray[i] = grid[i] === null ? 0 : 3;
    this._RefreshIndicators();
  }

  /** Material of a piece: white or black (a colour and a smoothness on the piece's own renderer). */
  ApplyPieceLook(renderer: RendererRef | null, white: boolean): void {
    if (!renderer) return;
    renderer.SetColor(white ? this.whiteColor : this.blackColor);
    renderer.SetFloat("_Smoothness", white ? this.whiteSmoothness : this.blackSmoothness);
  }

  // ---- where a dropped object is, in squares ----------------------------------------------------------------

  /** Reads where the board is now (the squares a1, h1 and a8), for the next drop. */
  async RefreshFrame(): Promise<void> {
    const corners = [0, 7 * 8, 7].map((i) => this.squareRenderers[i]?.gameObject.transform);
    await Promise.all(corners.map((t) => t?.Refresh()));
    this.ReadFrame();
  }

  private ReadFrame(): void {
    const [a1, h1, a8] = [0, 7 * 8, 7].map((i) => this.squareRenderers[i]?.gameObject.transform);
    if (!a1?.known || !h1?.known || !a8?.known) return;
    const ux = h1.position.sub(a1.position).scale(1 / 7);
    const uy = a8.position.sub(a1.position).scale(1 / 7);
    // squares reported on top of each other (a host that has no pose yet answers zeros): not a frame; a drop then finds
    // no square (Piece.OnDrop) rather than NaN
    if (ux.sqrMagnitude < 1e-12 || uy.sqrMagnitude < 1e-12) return;
    this.frame = { a1: a1.position, ux, uy };
  }

  /**
   * A world position in square units: a1's centre is (0, 0), h8's (7, 7). This is upstream's `-localPosition - 0.5` on
   * each axis under pieces_parent, worked out from where the squares are (the page cannot read a local position).
   */
  WorldToSquare(world: Vector3): Vector2 | null {
    if (!this.frame) this.ReadFrame();
    const f = this.frame;
    if (!f) return null;
    const d = world.sub(f.a1);
    return new Vector2(Vector3.Dot(d, f.ux) / f.ux.sqrMagnitude, Vector3.Dot(d, f.uy) / f.uy.sqrMagnitude);
  }

  override Start(): void {
    this.allPieces = this.FindBehavioursOfType<Piece>("Piece");
    this.piece_pools = this.FindBehavioursOfType<VRCObjectPool>("VRCObjectPool");
    this.grid = new Array<Piece | null>(64).fill(null);
    this._ClearIndicators();
    this._RegenerateGrid();
    this.ReadFrame();
  }
}
