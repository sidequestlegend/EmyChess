// A stand-in for VRChat's VRCObjectPool (an SDK component, not part of EmyChess's code): a fixed array of objects, of
// which TryToSpawn switches on the first one that is off, in array order, and Return switches one off. Which pieces are
// on is each Piece's synced `_active`, so the pool itself holds nothing and costs no state.

import { Behaviour, type GameObject } from "../portkit/src/index.ts";
import type { Piece } from "./Piece.ts";

export class VRCObjectPool extends Behaviour {
  /** The pool's name (upstream: the pool object's name, which Board.GetPool matches against a piece type). */
  poolName = "";
  /** The pooled objects, in order (kit builder). */
  Pool: GameObject[] = [];
  private found: Piece[] | null = null;

  /** The Piece on each pooled object, in the same order (looked up once; other behaviours ask before this one starts). */
  get pieces(): Piece[] {
    if (this.found === null) {
      const byObject = new Map<GameObject, Piece>();
      for (const piece of this.FindBehavioursOfType<Piece>("Piece")) byObject.set(piece.gameObject, piece);
      this.found = this.Pool.map((go) => byObject.get(go)).filter((p): p is Piece => p !== undefined);
    }
    return this.found;
  }

  /** Switches on the first object that is off and returns its piece; null when every one is in use. */
  TryToSpawn(): Piece | null {
    const piece = this.pieces.find((p) => !p._active) ?? null;
    if (piece === null) return null;
    this.Networking.SetOwner(this.Networking.LocalPlayer, piece);
    piece._active = true;
    piece.SetActiveState(true);
    piece.RequestSerialization();
    return piece;
  }

  /** Switches an object off again. */
  Return(go: GameObject): void {
    const piece = this.pieces.find((p) => p.gameObject === go);
    if (!piece || !piece._active) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, piece);
    piece._active = false;
    piece.SetActiveState(false);
    piece.RequestSerialization();
  }
}
