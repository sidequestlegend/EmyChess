// Port of Packages/com.emymin.emychess/Runtime/Scripts/Interactions/SendEventOnInteract.cs (EmyChess, GPL-3.0).
//
// The END TURN buttons of the Anarchy consoles. Upstream switched a button off with DisableInteractive unless it was its
// side's player's turn; here the click is ignored then (and the button is drawn darker, ChessManager._RefreshUI).

import { Behaviour } from "../portkit/src/index.ts";
import type { ChessManager } from "./ChessManager.ts";

export class SendEventOnInteract extends Behaviour {
  targetBehaviour!: Behaviour;
  eventName = "";

  override Interact(): void {
    const manager = this.targetBehaviour as ChessManager;
    const white = this.gameObject === manager.endTurnButton_white;
    const black = this.gameObject === manager.endTurnButton_black;
    if ((white || black) && !manager.EndTurnAllowed(white)) return;
    this.targetBehaviour.SendCustomEvent(this.eventName);
  }
}
