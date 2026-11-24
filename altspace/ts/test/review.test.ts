// Rung 1: what the independent review found (REVIEW-FINDINGS.md, chess-table), each as a test that failed before its fix:
//   1. a move must go out as one write: a spectator's clock click at the moment of a move let the mover move twice
//      (the reviewer's race2.test.ts and writes.test.ts); and the click must not undo the move either;
//   2. a reload while the promotion choice is open must not let the promoter move again (reload-promo.test.ts);
//   5. a player who comes back within the minute and leaves again gets a whole minute again;
//   6. a drop before the board's position is known leaves no tints or locks behind;
//   7. a held piece taken off the board is let go (GameObject.ReleaseGrab).

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "../portkit/src/index.ts";
import {
  board, BUTTON, fen, grabMove, manager, newWorld, pieceAt, placeSquares, playMove, press, promote, seatAndStart, settle, shown, SLUG, squareWorld, STEP, timer,
} from "./helpers.ts";
import type { Piece } from "../src/Piece.ts";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

// ---- 1. a spectator's click at the moment of a move ---------------------------------------------------------------

for (const [label, delay, method] of [
  ["+1m in the same tick as", 0, "_Add1m"],
  ["+1m 50 ms after", 50, "_Add1m"],
  ["+1m 150 ms after", 150, "_Add1m"],
  ["+1m 300 ms after", 300, "_Add1m"],
  ["RESET in the same tick as", 0, "_ResetTimerEvent"],
] as const) {
  test(`a spectator presses ${label} White's move: the move counts once, and White cannot move again`, async () => {
    const world = newWorld(40);
    const ann = world.join({ name: "Ann" });
    const bob = world.join({ name: "Bob" });
    const cat = world.join({ name: "Cat" });
    await settle(world);
    for (const c of [ann, bob, cat]) placeSquares(c);
    await seatAndStart(world, ann, bob);
    const key = pieceAt(world, ann, "e2")!.gameObject.key;
    assert.ok(ann.grab(SLUG, "0", key));
    await world.run(120);
    ann.move(SLUG, "0", key, squareWorld(4, 3).add(new Vector3(0.1, 0.3, 0)));
    ann.drop(SLUG, "0", key);
    if (delay > 0) await world.run(delay);
    assert.ok(cat.click(SLUG, "0", BUTTON[method]!), `Cat presses ${method}`);
    await world.run(3000);
    for (const c of [ann, bob, cat]) {
      assert.equal(fen(world, c), AFTER_E4, `${c.name} sees e4 played, once`);
      assert.equal(manager(world, c).currentSide, false, `${c.name}: Black to move`);
      assert.equal(timer(world, c).timeWhite, method === "_Add1m" ? 60 : 0, `${c.name}: the clock press counted too`);
    }
    // White cannot move a second time (before: the click took the table's write between the move's two writes, the turn
    // went back to White, and d2-d4 was played as well)
    assert.equal(await grabMove(world, ann, "d2d4"), false, "White's pieces are locked");
    assert.equal(fen(world, bob), AFTER_E4);
    await playMove(world, bob, "e7e5");
    assert.ok(world.agree(), "every client holds the same state");
    assert.deepEqual(world.problems(), []);
  });
}

test("with the automated clock, a spectator's RESET at the moment of a move does not undo the move", async () => {
  const world = newWorld(42);
  const ann = world.join({ name: "Ann", elements: [{ "auto-timer": "true", clock: "300" }] });
  const bob = world.join({ name: "Bob", elements: [{ "auto-timer": "true", clock: "300" }] });
  const cat = world.join({ name: "Cat", elements: [{ "auto-timer": "true", clock: "300" }] });
  await settle(world);
  for (const c of [ann, bob, cat]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  const key = pieceAt(world, ann, "e2")!.gameObject.key;
  assert.ok(ann.grab(SLUG, "0", key));
  await world.run(120);
  ann.move(SLUG, "0", key, squareWorld(4, 3).add(new Vector3(0.1, 0.3, 0)));
  ann.drop(SLUG, "0", key);
  assert.ok(cat.click(SLUG, "0", BUTTON["_ResetTimerEvent"]!));
  await world.run(3000);
  for (const c of [ann, bob, cat]) {
    assert.equal(fen(world, c), AFTER_E4, `${c.name} sees e4 played`);
    assert.equal(manager(world, c).currentSide, false, `${c.name}: Black to move`);
  }
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

test("a move is one state write, and a watcher never sees the piece moved with the turn not passed", async () => {
  const world = newWorld(41);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  const sync = world.instance(ann).sync;
  const before = sync.stats.writes;
  const seen = new Set<string>();
  const moving = playMove(world, ann, "e2e4");
  for (let t = 0; t < 40; t++) {
    await world.run(30);
    seen.add(`${pieceAt(world, bob, "e4") ? "e4" : "e2"}/${manager(world, bob).currentSide ? "White" : "Black"} to move`);
  }
  await moving;
  assert.equal(sync.stats.writes - before, 1, "one write for the move, its turn and its sound");
  assert.deepEqual([...seen], ["e2/White to move", "e4/Black to move"]);
});

// ---- 2. a reload while the promotion choice is open ------------------------------------------------------------

async function toPromotion(seed: number) {
  const world = newWorld(seed);
  const ann = world.join({ name: "Ann", uid: "ann-uid" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  for (const [i, m] of ["h2h4", "g7g5", "h4g5", "g8f6", "g5g6", "a7a6", "g6g7", "a6a5", "g7h8"].entries()) await playMove(world, i % 2 ? bob : ann, m);
  assert.equal(shown(ann, "pieces"), true, "Ann's picker is open");
  return { world, ann, bob };
}

test("a reload while the promotion choice is open brings the picker back, and the promoter cannot move another piece", async () => {
  const { world, ann, bob } = await toPromotion(30);
  assert.equal(manager(world, bob).promotionSquare, 7 * 8 + 7, "the pending promotion is shared: h8");
  world.leave(ann);
  await world.run(3000);
  const back = world.join({ name: "Ann", uid: "ann-uid" });
  await settle(world);
  placeSquares(back);
  assert.equal(shown(back, "pieces"), true, "the picker is open again on Ann's new page");
  assert.equal(shown(bob, "pieces"), false, "Bob sees no picker");
  // before the fix: the turn was still White's and nothing was locked, so b1-c3 was played with a pawn left on h8
  assert.equal(await grabMove(world, back, "b1c3"), false, "Ann cannot pick up another piece");
  assert.equal(await grabMove(world, bob, "a5a4"), false, "nor can Bob move");
  assert.equal(manager(world, bob).currentSide, true);
  await promote(world, back, "q");
  for (const c of [back, bob]) {
    assert.equal(pieceAt(world, c, "h8")?.type, "queen", `${c.name}: h8 is a queen`);
    assert.equal(manager(world, c).currentSide, false, `${c.name}: Black to move`);
    assert.equal(manager(world, c).promotionSquare, -1);
  }
  assert.equal(shown(back, "pieces"), false);
  await playMove(world, bob, "a5a4");
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

test("a late joiner during a pending promotion sees no picker; End Game clears the pending promotion", async () => {
  const { world, ann, bob } = await toPromotion(32);
  const cat = world.join({ name: "Cat" });
  await settle(world);
  assert.equal(shown(cat, "pieces"), false);
  assert.equal(manager(world, cat).promotionSquare, 63);
  await press(world, bob, "_EndGame");
  for (const c of [ann, bob, cat]) assert.equal(manager(world, c).promotionSquare, -1, c.name);
  assert.equal(shown(ann, "pieces"), false);
  // a new game starts with no promotion pending, and White moves at once
  await press(world, ann, "_StartGame");
  await playMove(world, ann, "e2e4");
  assert.ok(world.agree());
});

test("castling out of check is refused through the game flow too (D1)", async () => {
  const world = newWorld(31);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  for (const [i, m] of ["e2e4", "e7e6", "g1f3", "f8b4", "f1c4", "b4d2"].entries()) await playMove(world, i % 2 ? bob : ann, m);
  const position = "rnbqk1nr/pppp1ppp/4p3/8/2B1P3/5N2/PPPb1PPP/RNBQK2R";
  assert.equal(fen(world, bob), position);
  assert.equal(await grabMove(world, ann, "e1g1"), true, "the king can be picked up");
  assert.equal(fen(world, bob), position, "O-O in check is not made");
  assert.equal(manager(world, bob).currentSide, true, "still White to move");
  await playMove(world, ann, "e1d2");
});

// ---- 5. away, back, away again ------------------------------------------------------------------------------

test("a player who comes back within the minute and leaves again has a whole minute again", async () => {
  const world = newWorld(18);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob", uid: "bob-uid" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  await playMove(world, ann, "e2e4");
  world.leave(bob);
  await world.run(20000);
  const back = world.join({ name: "Bob", uid: "bob-uid" });
  await settle(world); // about 23 s after the first departure
  world.leave(back);
  // the first departure's minute is up 37 s from here: before the fix that check freed the side at once
  await world.run(50000);
  assert.equal(manager(world, ann).inProgress, true, "50 s after Bob's second departure the game still waits");
  assert.equal(manager(world, ann).isBlackRegistered, true, "Black is still Bob's");
  await world.run(12000);
  assert.equal(manager(world, ann).inProgress, false, "a minute after the second departure the game is over");
  assert.equal(manager(world, ann).isBlackRegistered, false, "and Black is free");
  assert.deepEqual(world.problems(), []);
});

// ---- 6. a drop before the board's position is known ------------------------------------------------------------

test("a drop before the board's position is known puts the piece back with no tints or locks left", async () => {
  const world = newWorld(43);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  placeSquares(bob); // Ann's page has not learnt where the squares are
  await seatAndStart(world, ann, bob);
  // picked up and let go in one moment: the page has not heard back where the board is (the pick-up asks)
  const key = pieceAt(world, ann, "e2")!.gameObject.key;
  assert.ok(ann.grab(SLUG, "0", key));
  assert.equal(board(world, ann).GetIndicator(4, 3), 1, "e4 shows as a legal move while the pawn is held");
  ann.drop(SLUG, "0", key);
  await world.run(STEP);
  assert.equal(fen(world, bob), START, "nothing moved");
  assert.equal(manager(world, bob).currentSide, true);
  const b = board(world, ann);
  const tints = Array.from({ length: 64 }, (_, i) => b.GetIndicator(i >> 3, i & 7)).filter((v) => v !== 0);
  assert.deepEqual(tints, [], "no tints are left");
  const locked = b.GetAllPieces().filter((p: Piece) => p.white && !p.grabbable);
  assert.deepEqual(locked.map((p: Piece) => `${p.type} ${p.x},${p.y}`), [], "every white piece can be picked up again");
  // once the squares are where the host reports them, the next move is made
  placeSquares(ann);
  await playMove(world, ann, "d2d4");
  assert.ok(world.agree());
});

// ---- 7. a held piece taken off the board is let go -------------------------------------------------------------

test("End Game while a piece is held lets go of it, and the drop does nothing", async () => {
  const world = newWorld(44);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  const key = pieceAt(world, ann, "e2")!.gameObject.key;
  assert.ok(ann.grab(SLUG, "0", key));
  await world.run(120);
  await press(world, bob, "_EndGame");
  assert.equal(ann.object(SLUG, "0", key).held, false, "Ann's hand let go of the pawn");
  const pawn = board(world, ann).allPieces.find((p: Piece) => p.gameObject.key === key)!;
  assert.equal(pawn.held, false);
  assert.equal(pawn._active, false, "the pawn went back to its pool");
  assert.equal(board(world, ann).GetPieceCount(), 0);
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});
