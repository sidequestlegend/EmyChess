// Port of Packages/com.emymin.emychess/Runtime/Scripts/Piece.cs (EmyChess, GPL-3.0).
//
// A piece's whole state is one byte, as upstream: bits 7-5 x, 4-2 y, 1 white, 0 hasMoved. The port adds whether the
// piece is on the board (`_active`), which upstream kept in VRChat's object pool. Both are synced in the "table" group
// with every other synced field of the game, so a move arrives as one change and is applied whole before anything reacts
// (upstream's D20 and D21 go away).
//
// Differences from upstream (PORT.md 10.1): pick-up is switched by moving the piece between the Grabbable and the UI layer
// (no `pickupable` here); a piece is never grabbable while a result shows or a promotion is open (D9); drops while no game
// is in progress or after the piece was captured are ignored (D23); the drop square is worked out from the world position
// (Board.WorldToSquare); and a piece let go on its own square, or clicked, is chosen for click-to-move (an addition:
// upstream lists a desktop mode as a TODO at Piece.cs:216).

import { type AudioClipRef, type AudioSourceRef, Behaviour, type DeserializationResult, Mathf, NetworkEventTarget, Quaternion, type RendererRef, Vector2, Vector3 } from "../portkit/src/index.ts";
import type { Board } from "./Board.ts";
import type { VRCObjectPool } from "./VRCObjectPool.ts";

/** The last few things players did to pieces on this page, for Play-mode tests (window.__pk1.debug[...].trace()). */
export const inputTrace: string[] = [];
export function trace(line: string): void {
  inputTrace.push(line);
  if (inputTrace.length > 40) inputTrace.shift();
}

/** Layers: Grabbable (a piece that may be picked up) and UI (clickable, hands pass through). */
export const GRAB_LAYER = 20;
export const CLICK_LAYER = 5;

export class Piece extends Behaviour {
  static override synced = ["_state", "_active"];
  /** Sent to every player by the mover (Piece.OnDrop, PiecePlacer.PlaceAt): the move and capture sounds. */
  static override networkCallable = ["PieceMovedAudio", "PieceCapturedAudio"];

  // ---- piece state ----------------------------------------------------------------------------------------------
  /** Synced state in one byte: x (3 bits), y (3 bits), white, hasMoved. Use the properties. */
  _state = 0;
  /** On the board (out of its pool). Synced. */
  _active = false;

  get x(): number {
    return this._state >> 5;
  }
  set x(value: number) {
    this._state &= 0b00011111;
    this._state |= (value << 5) & 0xff;
  }
  get y(): number {
    return (this._state & 0b00011100) >> 2;
  }
  set y(value: number) {
    this._state &= 0b11100011;
    this._state |= (value << 2) & 0xff;
  }
  get white(): boolean {
    return (this._state & 0b00000010) >> 1 === 1;
  }
  set white(value: boolean) {
    this._state &= 0b11111101;
    this._state |= (value ? 1 : 0) << 1;
  }
  get hasMoved(): boolean {
    return (this._state & 0b00000001) === 1;
  }
  set hasMoved(value: boolean) {
    this._state &= 0b11111110;
    this._state |= value ? 1 : 0;
  }

  _DebugState(): void {
    this.Debug.Log(`[ChessManager] State: ${this._state} Properties ${this.x} ${this.y} ${this.white} ${this.hasMoved} ${this.type}`);
  }

  /** The legal moves found when the piece was picked up (DefaultRules). */
  private legalMoves: Vector2[] | null = null;

  // ---- from bindings ----------------------------------------------------------------------------------------------
  pool!: VRCObjectPool;
  board!: Board;
  type = "";
  audioSource: AudioSourceRef | null = null;
  pieceRenderer: RendererRef | null = null;

  /** Whether this client lets the local player pick the piece up (upstream: pickup.pickupable). */
  grabbable = false;
  /** Held in the local player's hand. */
  held = false;
  /** The piece was picked up while it was allowed to be (PiecePicked then makes every piece ungrabbable, as upstream). */
  private pickedUp = false;
  private shownActive: boolean | null = null;

  override Start(): void {
    this.SetActiveState(this._active);
    this.SetGrabbable(false);
    // a click on a piece (UI layer: not grabbable now, or click-only input) chooses it, or captures it, for click-to-move
    this.gameObject.On("click", () => {
      trace(`click ${this.type} ${this.x},${this.y}`);
      this.board.clickToMove?.PieceClicked(this);
    });
  }

  /** Makes the object match `_active`: on the board or back in its pool. */
  SetActiveState(active: boolean): void {
    if (this.shownActive === active) return;
    this.shownActive = active;
    if (!active && this.held) {
      this.held = false;
      this.gameObject.host?.releaseGrab();
    }
    this.gameObject.SetActive(active);
  }

  _UpdateState(): void {
    // (upstream reparents the piece under pieces_parent here; the kit builder has put every piece there)
    this.SetActiveState(this._active);
    const manager = this.board.chessManager;
    if (manager.inProgress) {
      const mover = manager.GetPlayer(manager.currentSide);
      this.SetGrabbable(mover !== null && mover.uid === this.Networking.LocalPlayer.uid && manager.currentSide === this.white && manager.CanMovePieces());
    } else this.SetGrabbable(false);
    // (upstream guessed the pawn open to en passant here from "y changed by two"; the port syncs it: Board.doublePushIndex, D8)

    // the piece's place on the board
    this.transform.localPosition = new Vector3(-(this.x + 0.5), 0, -(this.y + 0.5));
    this.transform.localRotation = this.white ? Quaternion.identity : Quaternion.identity.mul(Quaternion.Euler(0, 180, 0));
    this.transform.localScale = Vector3.one;

    this.board.ApplyPieceLook(this.pieceRenderer, this.white);
    this.board._RegenerateGrid();
    this.board.chessManager.RefreshPiecePlacerPieceCount();
    this.board._RefreshKings();
  }

  override OnDeserialization(_result: DeserializationResult): void {
    this._UpdateState();
  }

  _RequestSerialization(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.RequestSerialization();
  }

  _SetPosition(posx: number, posy: number): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.x = Mathf.Clamp(posx, 0, 7);
    this.y = Mathf.Clamp(posy, 0, 7);
    this._UpdateState();
    this.RequestSerialization();
  }

  _Setup(posx: number, posy: number, isWhite: boolean): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.x = Mathf.Clamp(posx, 0, 7);
    this.y = Mathf.Clamp(posy, 0, 7);
    this.white = isWhite;
    this.hasMoved = false;
    this._UpdateState();
    // upstream delayed this sync by 20 frames as a workaround for VRChat (D20); one change set needs none
    this.RequestSerialization();
  }

  /** The piece's value in the usual relative scale. */
  GetValue(): number {
    if (this.type === "pawn") return 1;
    if (this.type === "bishop" || this.type === "knight") return 3;
    if (this.type === "rook") return 5;
    if (this.type === "queen") return 9;
    return 0;
  }

  _Capture(): void {
    if (this.held) {
      this.held = false;
      this.gameObject.host?.releaseGrab();
    }
    this._ReturnToPool();
    this.board.chessManager.AddScore(this.GetValue(), !this.white);
  }

  /** Off the board and back to its pool. */
  _ReturnToPool(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.pool);
    this.pool.Return(this.gameObject);
  }

  GetVec(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  PieceMovedAudio(): void {
    this.PlayClip(this.board.pieceMovedClip);
  }

  PieceCapturedAudio(): void {
    this.PlayClip(this.board.pieceCapturedClip);
  }

  private PlayClip(clip: unknown): void {
    if (this.board.chessManager.SoundOff()) return;
    if (this.audioSource && clip) this.audioSource.PlayOneShot(clip as AudioClipRef);
  }

  /**
   * Upstream: pickup.pickupable. A piece that may be picked up sits on the Grabbable layer, any other on the UI layer
   * (clickable, hands pass through). With input="click" no piece is ever grabbable. A held piece keeps its layer until
   * it is let go.
   */
  SetGrabbable(grabbable: boolean): void {
    this.grabbable = grabbable;
    if (this.held) return;
    this.gameObject.layer = grabbable && this.board.chessManager.GrabInput() ? GRAB_LAYER : CLICK_LAYER;
  }

  /** Finds the legal moves and shows them (orange squares) on this client. */
  PiecePicked(): void {
    if (!this.board.currentRules.anarchy) {
      this.board._AllPiecesUngrabbable();
      this.legalMoves = this.board.currentRules.GetAllLegalMoves(this, this.board);
      for (const legalMove of this.legalMoves) {
        if (!legalMove.equals(this.board.currentRules.legalMovesIgnoreMarker)) {
          if (legalMove.equals(this.board.currentRules.legalMovesEndMarker)) break;
          this.board.SetIndicator(legalMove.x, legalMove.y, 1);
        }
      }
    }
  }

  /** True when the square is one of the moves found at pick-up. */
  IsLegalTarget(x: number, y: number): boolean {
    if (!this.legalMoves) return false;
    const rules = this.board.currentRules;
    for (const move of this.legalMoves) {
      if (move.equals(rules.legalMovesEndMarker)) break;
      if (!move.equals(rules.legalMovesIgnoreMarker) && move.x === x && move.y === y) return true;
    }
    return false;
  }

  override OnPickup(): void {
    trace(`pickup ${this.type} ${this.x},${this.y} grabbable ${this.grabbable}`);
    this.held = true;
    this.pickedUp = this.grabbable;
    const manager = this.board.chessManager;
    // D23 and click-to-move: picking up anything ends a choice made by clicking
    manager.clickToMove?.Clear(false);
    void this.board.RefreshFrame();
    if (!this.grabbable) {
      // grabbed in the instant its layer was changing: let go, and the drop puts it back
      this.gameObject.host?.releaseGrab();
      return;
    }
    this.PiecePicked();
  }

  /** Called at the end of a move attempt: the move is made (or refused) against the moves found at pick-up. */
  PieceDropped(newx: number, newy: number): void {
    let moveResult = 0;
    const rules = this.board.currentRules;
    if (rules.anarchy) moveResult = rules.Move(this, newx, newy, this.board);
    else moveResult = rules.MoveLegalCheck(this, newx, newy, this.board, this.legalMoves ?? rules.GetAllLegalMoves(this, this.board));
    this.legalMoves = null;

    if (moveResult !== 0) {
      if (moveResult === 1) this.SendCustomNetworkEvent(NetworkEventTarget.All, "PieceMovedAudio");
      else if (moveResult === 2) this.SendCustomNetworkEvent(NetworkEventTarget.All, "PieceCapturedAudio");
      if (!rules.anarchy) {
        if (this.type === "pawn" && (this.white ? this.y === 7 : this.y === 0)) this.board.chessManager.picker.Setup(this);
        else this.board.chessManager._EndTurn();
      }
    } else this.board._SetPiecesGrabbable(this.Networking.LocalPlayer, this.white);
    this.board._ClearIndicators();
    this.board.chessManager._RefreshCheck();
  }

  override OnDrop(): void {
    trace(`drop ${this.type} ${this.x},${this.y} held ${this.held} picked ${this.pickedUp} at ${this.transform.position}`);
    const wasHeld = this.held && this.pickedUp;
    this.held = false;
    this.pickedUp = false;
    const manager = this.board.chessManager;
    if (!this._active) return;
    // D23: a piece let go when no game is on, or that may not move now, goes back to its square and nothing else happens
    if (!manager.inProgress || !wasHeld) {
      this._UpdateState();
      this.board._ClearIndicators();
      manager._RefreshCheck();
      return;
    }
    const at = this.board.WorldToSquare(this.transform.position);
    if (at === null) {
      this._UpdateState();
      return;
    }
    const movex = at.x;
    const movey = at.y;
    if (this.board.currentRules.anarchy) {
      if (movex < -3 || movex > 11 || movey < -3 || movey > 11) {
        this._Capture();
        manager.RequestSerialization();
        return;
      }
    }
    const newx = Mathf.RoundToInt(Mathf.Clamp(movex, 0, 7));
    const newy = Mathf.RoundToInt(Mathf.Clamp(movey, 0, 7));
    if (newx === this.x && newy === this.y && !this.board.currentRules.anarchy) {
      // let go where it was: the piece stays chosen, its moves showing, and a click on a square moves it there
      this._UpdateState();
      manager.clickToMove?.Choose(this, false);
      return;
    }
    this.PieceDropped(newx, newy);
  }
}
