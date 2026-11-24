// Port of Packages/com.emymin.emychess/Runtime/Scripts/Misc/GameOverMessage.cs (EmyChess, GPL-3.0).
//
// Differences (PORT.md 10.1): state 4 is a draw by dead position (D2: upstream reported king against king as a
// checkmate); a missing winner reads "-" (D22); with the automated clock the clock is stopped as the result is set, so
// every client shows the same frozen times (upstream simply stopped counting on the clock's owner); the reset that
// upstream did when the instance master loaded the world is done by ChessManager for a fresh table only.

import { Behaviour, type GameObject, type TextRef } from "../portkit/src/index.ts";
import type { ChessManager } from "./ChessManager.ts";

export class GameOverMessage extends Behaviour {
  static override synced = ["gameOverState", "winningSide"];

  /** 0 not over, 1 checkmate, 2 stalemate, 3 time over, 4 draw (dead position: the port's). */
  gameOverState = 0;
  winningSide = false;

  chessManager!: ChessManager;
  statusMessage!: TextRef;
  uiParent!: GameObject;

  _Refresh(): void {
    const isGameOver = this.gameOverState !== 0;
    this.uiParent.SetActive(isGameOver);
    if (isGameOver) {
      const winner = this.chessManager.GetPlayer(this.winningSide);
      const winningPlayerName = winner ? winner.displayName : "-";
      let message = "";
      switch (this.gameOverState) {
        case 1:
          message = "CHECKMATE! Winner: " + winningPlayerName;
          break;
        case 2:
          message = "STALEMATE, nobody wins";
          break;
        case 3:
          message = "TIME'S UP! Winner: " + winningPlayerName;
          break;
        case 4:
          message = "DRAW! Neither side can checkmate";
          break;
        default:
          message = "ERROR, invalid game over state";
          break;
      }
      this.statusMessage.text = message;
      this.chessManager.board._AllPiecesUngrabbable();
    }
  }

  override OnDeserialization(): void {
    this._Refresh();
  }

  _SetGameOverMessage(type: number, winningSide: boolean): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.gameOverState = type & 0xff;
    this.winningSide = winningSide;
    if (this.chessManager.automatedTimer) this.chessManager.timer._Freeze();
    this._Refresh();
    this.RequestSerialization();
  }

  _Reset(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.gameOverState = 0;
    this._Refresh();
    this.RequestSerialization();
  }

  override Start(): void {
    this._Refresh();
  }
}
