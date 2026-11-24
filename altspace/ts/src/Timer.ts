// Port of Packages/com.emymin.emychess/Runtime/Scripts/Timer.cs (EmyChess, GPL-3.0). The one file that is
// restructured rather than translated (PORT.md C1, D13).
//
// Upstream syncs both times continuously from one client, which counts them down from its own Time.time every frame;
// when that client leaves, the next owner counts from stale private fields and can call TIME'S UP at once. Here the
// running side's time is stored together with the shared-clock moment it started counting (`startedAt`): every client
// works the remaining time out for itself from the synced clock, nothing is written while a clock runs, and the referee
// alone declares a time-out. Hours show as total hours, 00 to 99 (D14: upstream wrapped them at 24).

import { Behaviour, type TextRef } from "../portkit/src/index.ts";
import type { ChessManager } from "./ChessManager.ts";
import type { TimerButton } from "./TimerButton.ts";

/** Largest time a side may be given, in seconds (upstream: 99 hours). */
export const MAX_TIME = 60 * 60 * 99;

/**
 * The time as "HH:MM:SS mmm". Milliseconds are rounded as Unity's TimeSpan.FromSeconds (.NET Framework) rounds them,
 * to the nearest millisecond. `wrapHours` gives upstream's 24-hour wrap (TimeSpan.Hours), kept for the golden vectors.
 */
export function GetTimeString(time: number, wrapHours = false): string {
  const total = Math.floor(time * 1000 + (time >= 0 ? 0.5 : -0.5));
  const ms = Math.max(0, total);
  let hours = Math.floor(ms / 3600000);
  if (wrapHours) hours %= 24;
  const minutes = Math.floor(ms / 60000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const millis = ms % 1000;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(hours)}:${two(minutes)}:${two(seconds)} ${String(millis).padStart(3, "0")}`;
}

export class Timer extends Behaviour {
  static override synced = ["timeBlack", "timeWhite", "isStarted", "isCurrentSideWhite", "moves", "startedAt"];

  /** Seconds left for each side; for the running side, as at `startedAt`. */
  timeBlack = 0;
  timeWhite = 0;
  isStarted = false;
  isCurrentSideWhite = true;
  moves = 0;
  /** Shared-clock seconds at which the running side started counting down; 0 when nothing counts (stopped or frozen). */
  startedAt = 0;

  chessManager!: ChessManager;
  displayBlack!: TextRef;
  millisecondsDisplayBlack!: TextRef;
  displayWhite!: TextRef;
  millisecondsDisplayWhite!: TextRef;
  displayMoves!: TextRef;
  whiteButton!: TimerButton;
  blackButton!: TimerButton;

  private now(): number {
    return this.Networking.GetServerTimeInSeconds();
  }

  /** True while one side's time is counting down. */
  get running(): boolean {
    return this.isStarted && this.startedAt > 0;
  }

  /** A side's time as it stands now. */
  TimeLeft(white: boolean): number {
    const stored = white ? this.timeWhite : this.timeBlack;
    if (!this.running || white !== this.isCurrentSideWhite) return stored;
    return Math.max(0, stored - (this.now() - this.startedAt));
  }

  GetTimeString(time: number): string {
    return GetTimeString(time);
  }

  _RefreshDisplay(): void {
    const timeBlackStrings = GetTimeString(this.TimeLeft(false)).split(" ");
    const timeWhiteStrings = GetTimeString(this.TimeLeft(true)).split(" ");
    this.displayBlack.text = timeBlackStrings[0]!;
    this.displayWhite.text = timeWhiteStrings[0]!;
    this.millisecondsDisplayBlack.text = timeBlackStrings[1]!;
    this.millisecondsDisplayWhite.text = timeWhiteStrings[1]!;
    this.displayMoves.text = String(this.moves).padStart(3, "0");
    this.whiteButton.SetRaised(this.isCurrentSideWhite);
    this.blackButton.SetRaised(!this.isCurrentSideWhite);
  }

  override OnDeserialization(): void {
    this._RefreshDisplay();
  }

  /** Sets one side's time, in seconds (at most 99 hours). */
  _SetTime(time: number, white: boolean): boolean {
    if (time <= MAX_TIME && time >= 0) {
      this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
      if (white) this.timeWhite = time;
      else this.timeBlack = time;
      this._RefreshDisplay();
      return true;
    }
    return false;
  }

  _SetTimeBothSides(time: number): boolean {
    const successwhite = this._SetTime(time, true);
    const successblack = this._SetTime(time, false);
    return successwhite && successblack;
  }

  _AddTime(time: number): void {
    if (!this.isStarted) {
      if (this._SetTimeBothSides(this.timeWhite + time)) this.RequestSerialization();
    }
  }

  _Add30s(): void {
    this._AddTime(30);
  }
  _Add1m(): void {
    this._AddTime(60);
  }
  _Add15m(): void {
    this._AddTime(60 * 15);
  }

  /** Writes the running side's time as it stands now into its field, and restarts the count from now. */
  private Commit(): void {
    if (!this.running) return;
    const left = this.TimeLeft(this.isCurrentSideWhite);
    if (this.isCurrentSideWhite) this.timeWhite = left;
    else this.timeBlack = left;
    this.startedAt = this.now();
  }

  /** Starts the countdown of one side, if both sides have time. */
  _StartCountDown(white: boolean): void {
    if (this.TimeLeft(false) > 0 && this.TimeLeft(true) > 0) {
      this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
      this.Commit();
      this.isCurrentSideWhite = white;
      this.startedAt = this.now();
      if (this.moves < 255) this.moves++;
      this.isStarted = true;
      this.RequestSerialization();
    }
    this._RefreshDisplay();
  }

  _ResetTimer(time: number): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this._SetTimeBothSides(time);
    this.isStarted = false;
    this.startedAt = 0;
    this.moves = 0;
    this.isCurrentSideWhite = true;
    this._RefreshDisplay();
    this.RequestSerialization();
  }

  _ResetTimerEvent(): void {
    this._ResetTimer(0);
  }

  /** Switches the side counting down. */
  _SwitchSide(): void {
    this._StartCountDown(!this.isCurrentSideWhite);
  }

  /**
   * Stops the count where it stands, keeping both times, while a result shows with the automated clock (upstream's
   * Update stopped counting then). The clock stays "started" until it is reset, as upstream's does.
   */
  _Freeze(): void {
    if (!this.running) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.Commit();
    this.startedAt = 0;
    this.RequestSerialization();
  }

  /**
   * Stops a running clock, keeping both times, and makes White the side to run (the port's: upstream's Start Game reset
   * a running automated clock to zero, so it never started, D15).
   */
  _Stop(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.Commit();
    this.isStarted = false;
    this.startedAt = 0;
    this.moves = 0;
    this.isCurrentSideWhite = true;
    this.RequestSerialization();
  }

  override Update(): void {
    const manager = this.chessManager;
    // the referee calls time: one decision, whoever started the clock
    if (this.Networking.IsReferee && this.running && manager.automatedTimer && manager.inProgress && manager.gameOverMessage.gameOverState === 0) {
      if (this.TimeLeft(this.isCurrentSideWhite) <= 0) manager.gameOverMessage._SetGameOverMessage(3, !this.isCurrentSideWhite);
    }
    this._RefreshDisplay();
  }

  override Start(): void {
    this._RefreshDisplay();
  }
}
