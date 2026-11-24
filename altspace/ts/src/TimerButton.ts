// Port of Packages/com.emymin.emychess/Runtime/Scripts/Interactions/TimerButton.cs (EmyChess, GPL-3.0).
//
// The raised button of the clock switches the side counting down (manual clock only). Upstream made the other button
// unclickable with DisableInteractive; the page has no such switch, so a click on a lowered button is ignored here.

import { Behaviour, Quaternion, Vector3 } from "../portkit/src/index.ts";
import type { Timer } from "./Timer.ts";

export class TimerButton extends Behaviour {
  allowPush = false;
  isRaised = false;
  raiseAngle = 0;
  timer!: Timer;
  /** The button's local rotation in the kit, in Euler degrees (the page only knows local values it set itself). */
  baseEuler = new Vector3(0, 0, 0);
  private shown: boolean | null = null;

  SetRaised(raised: boolean): void {
    this.isRaised = raised;
    if (this.shown === raised) return;
    this.shown = raised;
    this.transform.localRotation = Quaternion.Euler(raised ? this.raiseAngle : 0, this.baseEuler.y, this.baseEuler.z);
  }

  override Interact(): void {
    if (!this.isRaised || this.timer.chessManager.automatedTimer) return; // (DisableInteractive upstream)
    if (!this.allowPush) this.timer._SwitchSide();
  }
}
