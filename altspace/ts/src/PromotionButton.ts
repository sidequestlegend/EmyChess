// Port of Packages/com.emymin.emychess/Runtime/Scripts/Interactions/PromotionButton.cs (EmyChess, GPL-3.0).

import { Behaviour, type TextRef } from "../portkit/src/index.ts";
import type { PromotionPicker } from "./PromotionPicker.ts";

export class PromotionButton extends Behaviour {
  picker!: PromotionPicker;
  promotionType = "";
  availableCountLabel: TextRef | null = null;

  _RefreshCounter(): void {
    if (this.availableCountLabel) this.availableCountLabel.text = String(this.picker.board.GetPiecesAvailableCount(this.promotionType));
  }

  override Interact(): void {
    this.picker.PromoteTo(this.promotionType);
  }
}
