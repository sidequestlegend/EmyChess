// Port of Packages/com.emymin.emychess/Runtime/Scripts/Misc/PlayerHolder.cs (EmyChess, GPL-3.0).
//
// Upstream: "the owner is the data": a side belongs to whoever owns this object, and when that player leaves VRChat hands
// the object to someone else, who then holds the side without having joined (D11). Here a side is a user id (and the
// name it had, to show while that user is away). A user who is not in the room is never anyone's player: GetOwner
// returns an "away" stand-in, so the game waits for them, until ChessManager frees the side (OnPlayerLeft).

import { Behaviour, type Player } from "../portkit/src/index.ts";

/** Who holds a side: a player in the room, or the record of one who is away. */
export interface SideHolder {
  readonly uid: string;
  readonly displayName: string;
  /** False for a user who is not in the room now. */
  readonly present: boolean;
}

export class PlayerHolder extends Behaviour {
  static override synced = ["ownerUid", "ownerName"];

  /** The user id of the side's player ("" when nobody has taken it yet). */
  ownerUid = "";
  /** That player's name when they took the side. */
  ownerName = "";

  _SetOwner(): void {
    const me = this.Networking.LocalPlayer;
    this.Networking.SetOwner(me, this.gameObject);
    this.ownerUid = me.uid;
    this.ownerName = me.displayName;
  }

  /** The player holding the side: the one in the room with that user id, else an "away" record, else null. */
  GetOwner(): SideHolder | null {
    if (this.ownerUid === "") return null;
    const here = this.PresentOwner();
    if (here) return { uid: here.uid, displayName: here.displayName, present: true };
    return { uid: this.ownerUid, displayName: `${this.ownerName || "?"} (away)`, present: false };
  }

  /** The owner when they are in the room. */
  PresentOwner(): Player | null {
    if (this.ownerUid === "") return null;
    return this.Networking.GetPlayers().find((p) => p.uid === this.ownerUid) ?? null;
  }
}
