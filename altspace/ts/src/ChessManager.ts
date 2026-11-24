// Port of Packages/com.emymin.emychess/Runtime/Scripts/ChessManager.cs (EmyChess, GPL-3.0): game flow and the panel.
//
// Differences from upstream (PORT.md 10.1):
//   - a side is a user id (PlayerHolder); a player who leaves keeps the side for 60 seconds ("away"), then the other
//     registered player, or the referee when nobody registered is left, ends the game and frees the side (D11, D12, C2, C3);
//   - the red square for a king in check is shown, on every client (D3: upstream set it and cleared it in one call);
//   - pieces stay locked while a result shows or a promotion is open (D9); the promotion picker closes on every client
//     when the game stops (D10);
//   - "disabled" buttons are shown by colour (no DisableInteractive or Button.interactable from the page, C16);
//   - Start Game with a running automated clock stops it and starts White's (D15);
//   - a fresh table takes the snippet's settings (mode, auto-timer, clock), set by the referee: upstream reset the clock and
//     the banner when the instance master loaded the world.

import { Behaviour, Color, type ComponentRef, type DeserializationResult, type GameObject, type Player, type RendererRef, type StartKind, type TextRef } from "../portkit/src/index.ts";
import type { Board } from "./Board.ts";
import type { ClickToMove } from "./ClickToMove.ts";
import type { GameOverMessage } from "./GameOverMessage.ts";
import type { PiecePlacer } from "./PiecePlacer.ts";
import type { PlayerHolder, SideHolder } from "./PlayerHolder.ts";
import type { PromotionPicker } from "./PromotionPicker.ts";
import { MAX_TIME, type Timer } from "./Timer.ts";

/** How long a registered player who left keeps their side (decided for the port; upstream acted at once). */
export const AWAY_SECONDS = 60;

const BUTTON_ON = new Color(1, 1, 1, 1);
const BUTTON_OFF = new Color(0.45, 0.45, 0.45, 1);
const END_TURN_ON = new Color(0.95, 0.25, 0.2, 1);
const END_TURN_OFF = new Color(0.45, 0.32, 0.32, 1);

export class ChessManager extends Behaviour {
  static override synced = ["isWhiteRegistered", "isBlackRegistered", "inProgress", "currentSide", "anarchy", "whiteScore", "blackScore", "automatedTimer"];

  board!: Board;
  timer!: Timer;
  picker!: PromotionPicker;
  whitePlayerHolder!: PlayerHolder;
  blackPlayerHolder!: PlayerHolder;

  isWhiteRegistered = false;
  isBlackRegistered = false;
  inProgress = false;
  /** true: White to move. */
  currentSide = false;
  anarchy = false;
  whiteScore = 0;
  blackScore = 0;
  /** The clock switches at every end of turn, and running out of time ends the game. */
  automatedTimer = false;

  whitePlayerLabel!: TextRef;
  blackPlayerLabel!: TextRef;
  mainMenu!: GameObject;
  gameModeLabel!: TextRef;
  logText!: TextRef;
  startButton!: ComponentRef;
  whiteJoinLabel!: TextRef;
  blackJoinLabel!: TextRef;
  autoTimerCheckMark!: GameObject;
  gameMenu!: GameObject;
  currentPlayerLabel!: TextRef;
  currentSideLabel!: TextRef;
  whiteScoreLabel!: TextRef;
  blackScoreLabel!: TextRef;
  endButton!: ComponentRef;
  gameOverMessage!: GameOverMessage;
  anarchyControls_black!: GameObject;
  anarchyControl_white!: GameObject;
  endTurnButton_black!: GameObject;
  endTurnButton_white!: GameObject;
  endTurnRenderer_black: RendererRef | null = null;
  endTurnRenderer_white: RendererRef | null = null;
  anarchyButton: GameObject | null = null;
  blackPiecePlacer!: PiecePlacer;
  whitePiecePlacer!: PiecePlacer;
  clickToMove: ClickToMove | null = null;

  private consolesShown: boolean | null = null;

  // ---- settings of the snippet element ---------------------------------------------------------------------------

  private setting(name: string): string {
    return (this.Settings.get(name) ?? "").trim().toLowerCase();
  }
  /** input="click": pieces are never picked up, only clicked. Default ("auto", "grab"): both. */
  GrabInput(): boolean {
    return this.setting("input") !== "click";
  }
  SoundOff(): boolean {
    return this.setting("sound") === "false";
  }
  AnarchyAllowed(): boolean {
    return this.setting("allow-anarchy") !== "false";
  }

  /** Pieces may be picked up only while no result shows and no promotion is open (D9). */
  CanMovePieces(): boolean {
    return this.gameOverMessage.gameOverState === 0 && !this.picker.IsOpen();
  }

  // ---- the panel -----------------------------------------------------------------------------------------------

  _RefreshUI(): void {
    const localPlayer = this.Networking.LocalPlayer;
    const whitePlayer = this.GetPlayer(true);
    const blackPlayer = this.GetPlayer(false);
    const currentPlayer = this.GetPlayer(this.currentSide);
    const isPlayerWhite = same(localPlayer, whitePlayer);
    const isPlayerBlack = same(localPlayer, blackPlayer);
    const isPlayerTurn = same(localPlayer, currentPlayer);

    this.whitePlayerLabel.text = whitePlayer === null ? "-" : whitePlayer.displayName;
    this.blackPlayerLabel.text = blackPlayer === null ? "-" : blackPlayer.displayName;

    this.mainMenu.SetActive(!this.inProgress);
    this.gameModeLabel.text = this.anarchy ? "Anarchy" : "Standard";
    this.SetButtonLook(this.startButton, whitePlayer !== null && blackPlayer !== null && this.isRegistered(localPlayer));
    this.whiteJoinLabel.text = isPlayerWhite ? "Leave White" : "Join White";
    this.blackJoinLabel.text = isPlayerBlack ? "Leave Black" : "Join Black";
    this.autoTimerCheckMark.SetActive(this.automatedTimer);
    if (this.anarchyButton) this.anarchyButton.SetActive(this.AnarchyAllowed());

    this.gameMenu.SetActive(this.inProgress);
    this.currentPlayerLabel.text = currentPlayer === null ? "-" : currentPlayer.displayName;
    this.currentSideLabel.text = this.currentSide ? "(white)" : "(black)";
    this.whiteScoreLabel.text = String(this.whiteScore);
    this.blackScoreLabel.text = String(this.blackScore);
    this.SetButtonLook(this.endButton, this.isRegistered(localPlayer));

    this.anarchyControls_black.SetActive(this.anarchy);
    this.anarchyControl_white.SetActive(this.anarchy);
    if (this.anarchy && this.consolesShown !== true) {
      // the consoles were switched on: upstream's PiecePlacer.OnEnable puts each back to "pawn"
      this.blackPiecePlacer.OnEnable();
      this.whitePiecePlacer.OnEnable();
    }
    this.consolesShown = this.anarchy;
    this.endTurnRenderer_black?.SetColor(this.EndTurnAllowed(false) ? END_TURN_ON : END_TURN_OFF);
    this.endTurnRenderer_white?.SetColor(this.EndTurnAllowed(true) ? END_TURN_ON : END_TURN_OFF);
    this.blackPiecePlacer.SetEnabled(isPlayerBlack && !this.currentSide && this.inProgress);
    this.blackPiecePlacer._Refresh();
    this.whitePiecePlacer.SetEnabled(isPlayerWhite && this.currentSide && this.inProgress);
    this.whitePiecePlacer._Refresh();

    // D10: a promotion still open on this client when the game stopped (or someone else moved) closes
    if (!this.inProgress || !isPlayerTurn) this.picker._Hide();
    if (!this.inProgress || !isPlayerTurn || !this.CanMovePieces()) this.clickToMove?.Clear(false);

    this.board._ClearIndicators();
    this._RefreshCheck();
    this.board._SetPiecesGrabbable(currentPlayer, this.currentSide);
    this.clickToMove?.Reshow();
  }

  /** D3: the square of a king in check is red, for everyone, while it is that side's move. */
  _RefreshCheck(): void {
    if (!this.inProgress || this.anarchy) return;
    const king = this.currentSide ? this.board.whiteKing : this.board.blackKing;
    if (king === null || !king._active) return;
    if (this.board.currentRules.isKingInCheck(king.GetVec(), this.board.grid, this.board, this.board.PawnThatDidADoublePushLastRound, this.currentSide)) {
      this.board.SetIndicator(king.x, king.y, 2);
    }
  }

  private SetButtonLook(button: ComponentRef | null, enabled: boolean): void {
    if (button) this.Host.uiColor(button.gameObject.key, enabled ? BUTTON_ON : BUTTON_OFF);
  }

  /** The END TURN button of a side works for that side's player, on their turn, during a game. */
  EndTurnAllowed(white: boolean): boolean {
    return same(this.Networking.LocalPlayer, this.GetPlayer(white)) && this.currentSide === white && this.inProgress;
  }

  RefreshPiecePlacerPieceCount(): void {
    this.blackPiecePlacer?._Refresh();
    this.whitePiecePlacer?._Refresh();
  }

  override Start(): void {
    this.board._RegenerateGrid();
    this.board._RefreshKings();
    this._RefreshUI();
    this.SetLogText("");
  }

  override OnInstanceStart(kind: StartKind): void {
    if (kind === "fresh") this.ApplyFreshSettings();
    else if (kind === "resumed") this.SendCustomEventDelayedSeconds("_CheckAbsentPlayers", 5);
  }

  /**
   * A table nobody has used yet takes the snippet's settings: mode="anarchy", auto-timer="true", clock="<seconds>".
   * Only the referee of a fresh instance does it (upstream: the instance master reset the clock and the banner).
   */
  ApplyFreshSettings(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    const anarchy = this.setting("mode") === "anarchy" && this.AnarchyAllowed();
    this.board.currentRules.anarchy = anarchy;
    this.anarchy = anarchy;
    this.automatedTimer = this.setting("auto-timer") === "true";
    const seconds = Number(this.setting("clock"));
    this.timer._ResetTimer(Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_TIME ? seconds : 0);
    this.gameOverMessage._Reset();
    this._RefreshUI();
    this.RequestSerialization();
  }

  override OnDeserialization(_result: DeserializationResult): void {
    // the whole table arrives at once (one sync group): make sure the board's picture is current before redrawing
    this.board._RegenerateGrid();
    this.board._RefreshKings();
    this._RefreshUI();
  }

  /** The player registered for a side, an "away" record for one who left, or null. */
  GetPlayer(white: boolean): SideHolder | null {
    if (white) return this.isWhiteRegistered ? this.whitePlayerHolder.GetOwner() : null;
    return this.isBlackRegistered ? this.blackPlayerHolder.GetOwner() : null;
  }

  /** Registers the local player for a side. */
  _RegisterPlayer(white: boolean): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    const targetHolder = white ? this.whitePlayerHolder : this.blackPlayerHolder;
    targetHolder._SetOwner();
    if (white) {
      this.isWhiteRegistered = true;
      this.Debug.Log(`[ChessManager] ${this.GetPlayer(true)?.displayName} joined White`);
    } else {
      this.isBlackRegistered = true;
      this.Debug.Log(`[ChessManager] ${this.GetPlayer(false)?.displayName} joined Black`);
    }
    this._RefreshUI();
    this.RequestSerialization();
  }

  /** Registers the local player as White, or unregisters them if they already are. */
  _RegisterWhite(): void {
    if (this.inProgress) return; // (the main menu is hidden during a game upstream)
    if (this.isWhiteRegistered && same(this.GetPlayer(true), this.Networking.LocalPlayer)) this._UnRegisterPlayer(true);
    else this._RegisterPlayer(true);
  }

  _RegisterBlack(): void {
    if (this.inProgress) return;
    if (this.isBlackRegistered && same(this.GetPlayer(false), this.Networking.LocalPlayer)) this._UnRegisterPlayer(false);
    else this._RegisterPlayer(false);
  }

  isRegistered(player: { uid: string } | null): boolean {
    return (this.isWhiteRegistered && same(this.GetPlayer(true), player)) || (this.isBlackRegistered && same(this.GetPlayer(false), player));
  }

  /** Standard and Anarchy are the only modes. */
  SetGameMode(anarchy: boolean): void {
    if (this.inProgress) return;
    if (anarchy && !this.AnarchyAllowed()) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.board.currentRules.SetAnarchy(anarchy);
    this.anarchy = anarchy;
    this._RefreshUI();
    this.RequestSerialization();
  }

  _SetStandardGameMode(): void {
    this.SetGameMode(false);
  }

  _SetAnarchyGameMode(): void {
    this.SetGameMode(true);
  }

  /** Unregisters a side (upstream: the local player's own). */
  _UnRegisterPlayer(white: boolean): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    if (white) {
      this.Debug.Log(`[ChessManager] ${this.GetPlayer(true)?.displayName ?? "-"} left White`);
      this.isWhiteRegistered = false;
    } else {
      this.Debug.Log(`[ChessManager] ${this.GetPlayer(false)?.displayName ?? "-"} left black`);
      this.isBlackRegistered = false;
    }
    this._RefreshUI();
    this.RequestSerialization();
  }

  /** The panel's debugging line (unused by the game, as upstream). */
  SetLogText(text: string): void {
    this.Debug.Log(`[ChessManager] ${text}`);
    this.logText.text = text;
  }

  _EndTurn(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.currentSide = !this.currentSide;
    if (this.GetPlayer(this.currentSide) === null) this._EndGame();
    if (this.automatedTimer) this.timer._SwitchSide();
    if (!this.board.currentRules.anarchy) {
      const currentKing = this.currentSide ? this.board.whiteKing : this.board.blackKing;
      if (currentKing !== null) {
        const isKingInCheck = this.board.currentRules.isKingInCheck(currentKing.GetVec(), this.board.grid, this.board, this.board.PawnThatDidADoublePushLastRound, this.currentSide);
        if (isKingInCheck) this.Debug.Log(`[ChessManager] ${this.currentSide ? "White" : "Black"} King is in check`);
        const endState = this.board._CheckIfGameOver(this.currentSide, isKingInCheck);
        if (endState !== 0) this.gameOverMessage._SetGameOverMessage(endState, !this.currentSide);
        else this.gameOverMessage._Reset();
      }
    }
    this._RefreshUI();
    this.RequestSerialization();
  }

  AddScore(score: number, white: boolean): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    // scores are bytes upstream, and wrap at 256 (D16, kept)
    if (white) {
      this.whiteScore = (this.whiteScore + score) & 0xff;
      this.Debug.Log(`[ChessManager] White Scored: ${score}`);
    } else {
      this.blackScore = (this.blackScore + score) & 0xff;
      this.Debug.Log(`[ChessManager] Black Scored: ${score}`);
    }
  }

  _StartGame(): void {
    if (this.inProgress) return;
    const local = this.Networking.LocalPlayer;
    // (upstream: the Start Game button is only interactable for a registered player when both sides are taken)
    if (this.GetPlayer(true) === null || this.GetPlayer(false) === null || !this.isRegistered(local)) return;
    this.Networking.SetOwner(local, this.gameObject);
    this.inProgress = true;
    this.whiteScore = this.blackScore = 0;
    this.currentSide = true;
    this.board._ResetBoard();
    this.whiteScore = this.blackScore = 0; // (the board's clearing captured the pieces of the last game)
    this.gameOverMessage._Reset();
    if (this.automatedTimer) {
      if (this.timer.isStarted) this.timer._Stop(); // D15: upstream reset it to zero here, so it never started
      this.timer._StartCountDown(true);
    }
    this._RefreshUI();
    this.RequestSerialization();
    this.Debug.Log("[ChessManager] Game Started");
  }

  _EndGame(): void {
    // (upstream: the End Game button is only interactable for a registered player; the game also ends itself)
    if (!this.ending && !this.isRegistered(this.Networking.LocalPlayer)) return;
    this.Debug.Log("[ChessManager] Game Stopped");
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.inProgress = false;
    this.board._ClearBoard();
    if (this.automatedTimer) this.timer._ResetTimer(0);
    this.gameOverMessage._Reset();
    this.picker._Hide();
    this._RefreshUI();
    this.RequestSerialization();
  }

  /** Set while the game ends itself (a side left, or nobody holds the side to move): no button check. */
  private ending = false;

  private EndGameBecause(reason: string): void {
    this.Debug.Log(`[ChessManager] ${reason}`);
    this.ending = true;
    try {
      this._EndGame();
    } finally {
      this.ending = false;
    }
  }

  _ToggleAutoTimer(): void {
    if (this.inProgress) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.automatedTimer = !this.automatedTimer;
    this._RefreshUI();
    this.RequestSerialization();
  }

  // ---- players leaving and coming back ---------------------------------------------------------------------------

  override OnPlayerLeft(player: Player): void {
    // upstream acted at once; here the side waits AWAY_SECONDS for its player to come back
    if (this.isRegistered(player)) this.SendCustomEventDelayedSeconds("_CheckAbsentPlayers", AWAY_SECONDS);
    this._RefreshUI();
  }

  override OnPlayerJoined(_player: Player): void {
    this._RefreshUI();
  }

  /**
   * A registered player who is still away: the game ends (if one is on) and the side is freed. Done by the other
   * registered player if they are here (as upstream), else by the referee (D12).
   */
  _CheckAbsentPlayers(): void {
    const away = [true, false].filter((white) => (white ? this.isWhiteRegistered : this.isBlackRegistered) && this.GetPlayer(white)?.present === false);
    if (!away.length) return;
    const local = this.Networking.LocalPlayer;
    const someoneRegisteredHere = [true, false].some((white) => this.GetPlayer(white)?.present === true);
    const mine = this.isRegistered(local) || (!someoneRegisteredHere && this.Networking.IsReferee);
    if (!mine) return;
    if (this.inProgress) this.EndGameBecause("a player left: the game is over");
    for (const white of away) {
      this.Networking.SetOwner(local, this.gameObject);
      if (white) this.isWhiteRegistered = false;
      else this.isBlackRegistered = false;
    }
    this._RefreshUI();
    this.RequestSerialization();
  }

  /** The turn passed to a side nobody holds (upstream: _EndTurn ends the game then). Used by _EndTurn through GetPlayer. */
  override OnMasterTransferred(_newMaster: Player | null): void {
    this.SendCustomEventDelayedSeconds("_CheckAbsentPlayers", AWAY_SECONDS);
  }
}

/** Upstream compares VRCPlayerApi objects; here, user ids. */
export function same(a: { uid: string } | null | undefined, b: { uid: string } | null | undefined): boolean {
  return !!a && !!b && a.uid === b.uid;
}
