// The credits panel: an addition of the port (no upstream file). A small button on the menu panel opens the licence
// notices (GPL-3.0 code, CC BY-SA 4.0 art, the CC0 wood and sounds, the OFL fonts, where the source is); a click on the
// panel closes it. Each viewer opens it for themselves: nothing is shared.

import { Behaviour, type GameObject } from "../portkit/src/index.ts";

export class CreditsPanel extends Behaviour {
  panel!: GameObject;
  private open = false;

  override Start(): void {
    this.panel.SetActive(false);
  }

  override Interact(): void {
    this.Toggle();
  }

  Toggle(): void {
    this.open = !this.open;
    this.panel.SetActive(this.open);
  }

  get IsOpen(): boolean {
    return this.open;
  }
}
