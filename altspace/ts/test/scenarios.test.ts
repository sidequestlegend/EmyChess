// Rung 1: several players on the fake room (virtual time), playing through the inputs a player has: clicks on the
// panel's buttons, grabbing and letting go of pieces, clicking pieces and squares.

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafBudget, Vector3 } from "../portkit/src/index.ts";
import {
  board, clickMove, COUNTER_KEY, fen, gameOver, grabMove, manager, newWorld, pieceAt, placeSquares, press, promote, seatAndStart, shown, settle, SLUG, timer,
} from "./helpers.ts";
import game from "../src/index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

test("two players play a whole game (fool's mate); a watcher sees it all and can move nothing", async () => {
  const world = newWorld(11);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  const cat = world.join({ name: "Cat" });
  await settle(world);
  for (const c of [ann, bob, cat]) placeSquares(c);
  await seatAndStart(world, ann, bob);

  for (const c of [ann, bob, cat]) {
    assert.equal(fen(world, c), START, `${c.name} sees the start position`);
    assert.equal(manager(world, c).inProgress, true);
    assert.equal(manager(world, c).currentSide, true);
  }
  assert.equal(cat.graph(SLUG).text.get("whitePlayerLabel"), "Ann");
  assert.equal(cat.graph(SLUG).text.get("blackPlayerLabel"), "Bob");
  assert.equal(cat.graph(SLUG).text.get("currentMoveLabel"), "Ann");

  // Cat watches: nothing of the board can be picked up, and Bob cannot move White's pieces or move out of turn
  assert.equal(cat.grab(SLUG, "0", pieceAt(world, cat, "e2")!.gameObject.key), false, "a watcher cannot pick up a piece");
  assert.equal(await grabMove(world, bob, "e7e5"), false, "Black cannot move on White's turn");
  assert.equal(await grabMove(world, bob, "e2e4"), false, "Black cannot move White's pieces");

  // an illegal drop puts the piece back, and the same player goes on
  assert.equal(await grabMove(world, ann, "f2f5"), true);
  assert.equal(fen(world, cat), START);
  assert.equal(manager(world, ann).currentSide, true);

  assert.ok(await grabMove(world, ann, "f2f3"));
  assert.ok(await grabMove(world, bob, "e7e5"));
  assert.ok(await grabMove(world, ann, "g2g4"));
  assert.ok(await grabMove(world, bob, "d8h4"));
  await world.run(500);

  for (const c of [ann, bob, cat]) {
    assert.equal(fen(world, c), "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR");
    assert.equal(gameOver(world, c).gameOverState, 1, `${c.name}: checkmate`);
    assert.equal(c.graph(SLUG).text.get("gameOverText"), "CHECKMATE! Winner: Bob");
    assert.equal(shown(c, "gameOver"), true);
  }
  // the king in check is shown red on every client (D3); nothing can be moved afterwards (D9)
  const red = (c: typeof ann) => c.graph(SLUG).color.get("sq_e1/_BaseColor");
  assert.deepEqual(red(cat), ["1", "0", "0", "0.6"]);
  assert.equal(await grabMove(world, ann, "e2e3"), false, "after checkmate nothing moves");
  // sounds: one per move, heard by everyone (move, move, move, move: no capture in fool's mate)
  assert.equal(cat.graph(SLUG).events.filter((e) => e.op === "audio").length, 4);
  assert.ok(world.agree(), "every client holds the same state");
  assert.deepEqual(world.problems(), []);

  // End Game: the board clears, the menu comes back, the sides stay taken
  await press(world, bob, "_EndGame");
  for (const c of [ann, bob, cat]) {
    assert.equal(manager(world, c).inProgress, false);
    assert.equal(board(world, c).GetPieceCount(), 0);
    assert.equal(gameOver(world, c).gameOverState, 0);
  }
  assert.ok(world.agree());
});

test("click-to-move: castling both ways, en passant, promotion, check shown, a late joiner sees the position", async () => {
  const world = newWorld(12);
  const ann = world.join({ name: "Ann", elements: [{ input: "click" }] });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  // Ann plays with clicks only (input="click": nothing of hers is ever grabbable); Bob picks up and lets go in place, then clicks
  assert.equal(ann.grab(SLUG, "0", pieceAt(world, ann, "e2")!.gameObject.key), false);
  const moves = ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6", "c7d6", "g1f3", "b8c6", "f1e2", "c8g4", "e1g1", "d8a5", "d2d4", "e8c8", "b1c3"];
  for (let i = 0; i < moves.length; i++) await clickMove(world, i % 2 === 0 ? ann : bob, moves[i]!);
  const position = "2kr1bnr/1p2pppp/p1np4/q7/3P2b1/2N2N2/PPP1BPPP/R1BQ1RK1";
  assert.equal(fen(world, ann), position);
  assert.equal(fen(world, bob), position);
  // a late joiner gets the whole table, and agrees
  const dan = world.join({ name: "Dan" });
  await settle(world);
  assert.equal(fen(world, dan), position);
  assert.equal(manager(world, dan).currentSide, false);
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

test("promotion through the picker: only the promoting player sees it, every choice works, counters show the pools", async () => {
  const world = newWorld(13);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  for (const [i, m] of ["h2h4", "g7g5", "h4g5", "g8f6", "g5g6", "a7a6", "g6g7", "a6a5"].entries()) assert.ok(await grabMove(world, i % 2 ? bob : ann, m), m);
  // White pawn on g7 takes on h8 and promotes: the picker opens on Ann's page only, and the turn waits
  assert.ok(await grabMove(world, ann, "g7h8"));
  assert.equal(shown(ann, "pieces"), true, "Ann's picker is open");
  assert.equal(shown(bob, "pieces"), false, "Bob sees no picker");
  assert.equal(manager(world, bob).currentSide, true, "the turn has not passed");
  assert.equal(ann.graph(SLUG).text.get(COUNTER_KEY.queen!), "14", "the queen counter shows the queens left (D4 fixed)");
  assert.equal(ann.graph(SLUG).text.get(COUNTER_KEY.knight!), "4");
  await promote(world, ann, "n");
  assert.equal(pieceAt(world, bob, "h8")?.type, "knight");
  assert.equal(pieceAt(world, bob, "h8")?.white, true);
  assert.equal(manager(world, bob).currentSide, false);
  assert.ok(world.agree());
});

test("the referee leaves mid-game: play goes on, nothing is reset", async () => {
  const world = newWorld(14);
  const ref = world.join({ name: "Ref" });
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  assert.ok(world.instance(ref).networking.IsReferee, "the first player is the referee");
  assert.ok(await grabMove(world, ann, "e2e4"));
  world.leave(ref);
  await world.run(8000);
  assert.ok(world.instance(ann).networking.IsReferee || world.instance(bob).networking.IsReferee, "a new referee");
  assert.ok(await grabMove(world, bob, "e7e5"));
  assert.ok(await grabMove(world, ann, "g1f3"));
  assert.equal(fen(world, bob), "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R");
  assert.ok(manager(world, ann).inProgress);
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

test("two tables in one room stay separate", async () => {
  const world = newWorld(15);
  const ann = world.join({ name: "Ann", elements: [{ room: "north" }, { room: "south" }] });
  const bob = world.join({ name: "Bob", elements: [{ room: "north" }, { room: "south" }] });
  await settle(world, "north");
  await settle(world, "south");
  for (const c of [ann, bob]) {
    placeSquares(c, "north");
    placeSquares(c, "south");
  }
  await seatAndStart(world, ann, bob, "north");
  await seatAndStart(world, bob, ann, "south");
  assert.ok(await grabMove(world, ann, "e2e4", "north"));
  assert.ok(await grabMove(world, bob, "d2d4", "south"));
  assert.equal(fen(world, bob, "north"), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
  assert.equal(fen(world, ann, "south"), "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR");
  assert.equal(manager(world, ann, "north").GetPlayer(true)?.displayName, "Ann");
  assert.equal(manager(world, ann, "south").GetPlayer(true)?.displayName, "Bob");
  assert.ok(world.agree("north") && world.agree("south"));
  const keys = world.room.stateKeys("pk1.chess-table.");
  assert.ok(keys.some((k) => k.startsWith("pk1.chess-table.north.")) && keys.some((k) => k.startsWith("pk1.chess-table.south.")));
  assert.ok(keys.every((k) => k.startsWith("pk1.chess-table.north.") || k.startsWith("pk1.chess-table.south.")));
  assert.deepEqual(world.problems(), []);
});

test("automated clock: it switches with every move, and the referee calls time once", async () => {
  const world = newWorld(16);
  const ann = world.join({ name: "Ann", elements: [{ "auto-timer": "true", clock: "5" }] });
  const bob = world.join({ name: "Bob", elements: [{ "auto-timer": "true", clock: "5" }] });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  assert.equal(manager(world, bob).automatedTimer, true, "a fresh table takes the element's settings");
  assert.equal(timer(world, bob).timeWhite, 5);
  await seatAndStart(world, ann, bob);
  assert.ok(timer(world, bob).running);
  await world.run(1000);
  assert.ok(await grabMove(world, ann, "e2e4"));
  assert.equal(timer(world, bob).isCurrentSideWhite, false, "Black's clock runs");
  const whiteLeft = timer(world, bob).TimeLeft(true);
  // White's clock ran from the start until the drop was handled: 0.5 + 1.0 + 0.12 + about one second of the move
  assert.ok(whiteLeft > 2.0 && whiteLeft < 3.0, `White has ${whiteLeft} s left`);
  // the displays agree to within a tick
  const a = timer(world, ann).TimeLeft(false);
  const b = timer(world, bob).TimeLeft(false);
  assert.ok(Math.abs(a - b) < 0.1, `${a} against ${b}`);
  await world.run(6000);
  for (const c of [ann, bob]) {
    assert.equal(gameOver(world, c).gameOverState, 3);
    assert.equal(c.graph(SLUG).text.get("gameOverText"), "TIME'S UP! Winner: Ann");
    assert.equal(timer(world, c).TimeLeft(false), 0);
    assert.equal(c.graph(SLUG).text.get("leftTimer"), "00:00:00");
  }
  assert.ok(world.agree());
});

test("a registered player who leaves keeps the side for a minute, then the game ends and the side is free", async () => {
  const world = newWorld(17);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  assert.ok(await grabMove(world, ann, "e2e4"));
  world.leave(bob);
  await world.run(10000);
  assert.equal(manager(world, ann).inProgress, true, "the game waits for Bob");
  assert.equal(ann.graph(SLUG).text.get("blackPlayerLabel"), "Bob (away)");
  await world.run(60000);
  assert.equal(manager(world, ann).inProgress, false, "the game is over");
  assert.equal(manager(world, ann).isBlackRegistered, false, "Black is free");
  assert.equal(manager(world, ann).isWhiteRegistered, true);
  assert.deepEqual(world.problems(), []);
});

test("a player who comes back within the minute keeps the side", async () => {
  const world = newWorld(18);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob", uid: "bob-uid" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await seatAndStart(world, ann, bob);
  assert.ok(await grabMove(world, ann, "e2e4"));
  world.leave(bob);
  await world.run(20000);
  const back = world.join({ name: "Bob", uid: "bob-uid" });
  await settle(world);
  placeSquares(back);
  await world.run(60000);
  assert.equal(manager(world, ann).inProgress, true);
  assert.ok(await grabMove(world, back, "e7e5"), "Bob moves again");
  assert.equal(fen(world, ann), "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR");
  assert.ok(world.agree());
});

test("anarchy: free moves, placing pieces with the ghost, deleting by dropping off the board, END TURN", async () => {
  const world = newWorld(19);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  for (const c of [ann, bob]) placeSquares(c);
  await press(world, ann, "_SetAnarchyGameMode");
  assert.equal(manager(world, bob).anarchy, true);
  await seatAndStart(world, ann, bob);
  // any drop is a move: the e2 pawn to e6, taking Black's pawn on e7? no: e6 is empty
  assert.ok(await grabMove(world, ann, "e2e6"));
  assert.equal(pieceAt(world, bob, "e6")?.type, "pawn");
  // a second move in the same turn, onto an enemy piece: it is captured, White scores 1
  assert.ok(await grabMove(world, ann, "e6d7"));
  assert.equal(manager(world, bob).whiteScore, 1);
  // the turn passes only by END TURN, and only for the side to move
  assert.equal(bob.click(SLUG, "0", "endTurnButton"), true);
  await world.run(300);
  assert.equal(manager(world, ann).currentSide, true, "Black's END TURN does nothing on White's turn");
  assert.equal(ann.click(SLUG, "0", "endTurnButton2"), true);
  await world.run(300);
  assert.equal(manager(world, bob).currentSide, false);
  // Black deletes a piece by carrying it far off the board
  const rook = pieceAt(world, bob, "a8")!;
  assert.ok(bob.grab(SLUG, "0", rook.gameObject.key));
  await world.run(120);
  bob.move(SLUG, "0", rook.gameObject.key, squareOff());
  bob.drop(SLUG, "0", rook.gameObject.key);
  await world.run(300);
  assert.equal(pieceAt(world, ann, "a8"), null);
  assert.equal(manager(world, ann).whiteScore, 6, "a deleted piece scores like a capture");
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

/** Far off the board, past the a8 edge (square y about -6.5: below upstream's -3 threshold for deleting). */
function squareOff(): Vector3 {
  return new Vector3(-0.5, 0, 6);
}

test("the game's state fits the room's key budget", () => {
  const world = newWorld();
  const budget = leafBudget(world.bindings, (type) => {
    const cls = game.behaviours[type];
    return cls ? { synced: (cls.synced ?? []).length, perPlayer: cls.perPlayer === true } : null;
  });
  assert.equal(budget.slots, 1, "one sync group: the whole table is one slot");
  assert.equal(budget.spaceLeaves, 5, "ref, ack, fd, and the table's owner and value leaves");
  assert.ok(budget.userLeavesPerPlayer <= 2);
});
