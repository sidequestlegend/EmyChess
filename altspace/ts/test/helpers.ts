// Test helpers: players at a chess table in the fake room, moving pieces the way a player does (grab, carry, let go;
// or click a piece and a square), and reading the table back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Vector3 } from "../portkit/src/index.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import type { Board } from "../src/Board.ts";
import type { ChessManager } from "../src/ChessManager.ts";
import type { GameOverMessage } from "../src/GameOverMessage.ts";
import game from "../src/index.ts";
import type { Piece } from "../src/Piece.ts";
import type { Timer } from "../src/Timer.ts";

export const bindings = JSON.parse(readFileSync(fileURLToPath(new URL("../bindings.json", import.meta.url)), "utf8"));
export const SLUG = game.slug;
const ids = (type: string) => (bindings.behaviours as Array<{ id: string; type: string; object: string; fields: Record<string, unknown> }>).filter((b) => b.type === type);
export const ID = {
  board: ids("Board")[0]!.id,
  manager: ids("ChessManager")[0]!.id,
  rules: ids("DefaultRules")[0]!.id,
  timer: ids("Timer")[0]!.id,
  gameOver: ids("GameOverMessage")[0]!.id,
};
/** The object key of each promotion button, by type. */
export const PROMOTION_KEY: Record<string, string> = Object.fromEntries(ids("PromotionButton").map((b) => [b.fields.promotionType as string, b.object]));
/** The object key of each promotion button's counter text, by type. */
export const COUNTER_KEY: Record<string, string> = Object.fromEntries(
  ids("PromotionButton").map((b) => [b.fields.promotionType as string, (b.fields.availableCountLabel as { $comp: string } | null)?.$comp ?? ""]),
);
/** Object keys the panel's buttons were given. */
export const BUTTON: Record<string, string> = Object.fromEntries(
  (bindings.events as Array<{ object: string; method: string }>).map((e) => [e.method, e.object]),
);

/** Time given to every action: about a round trip through the fake room and its 0.2 s write batching, and some. */
export const STEP = 1000;

/** Where the fake host puts a square's centre (the fake treats the pieces' local positions as world positions). */
export function squareWorld(x: number, y: number): Vector3 {
  return new Vector3(-(x + 0.5), 0, -(y + 0.5));
}

export function newWorld(seed = 1): TestWorld {
  return new TestWorld(game, bindings, { seed });
}

export const manager = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<ChessManager>(c, ID.manager, inst);
export const board = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<Board>(c, ID.board, inst);
export const timer = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<Timer>(c, ID.timer, inst);
export const gameOver = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<GameOverMessage>(c, ID.gameOver, inst);

/** Puts the 64 squares where the host has them, as the kit has them under pieces_parent (done once per client). */
export function placeSquares(c: FakeClient, inst = "0"): void {
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) c.move(SLUG, inst, "sq_" + "abcdefgh"[x] + (y + 1), squareWorld(x, y));
}

export function sq(name: string): [number, number] {
  return [name.charCodeAt(0) - 97, Number(name[1]) - 1];
}

export function pieceAt(world: TestWorld, c: FakeClient, name: string, inst = "0"): Piece | null {
  const [x, y] = sq(name);
  return board(world, c, inst).GetAllPieces().find((p) => p.x === x && p.y === y) ?? null;
}

/** The board as FEN piece placement, from one client's view. */
export function fen(world: TestWorld, c: FakeClient, inst = "0"): string {
  const b = board(world, c, inst);
  const letter: Record<string, string> = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };
  const rows: string[] = [];
  for (let y = 7; y >= 0; y--) {
    let row = "";
    let gap = 0;
    for (let x = 0; x < 8; x++) {
      const p = b.GetAllPieces().find((q) => q.x === x && q.y === y);
      if (!p) {
        gap++;
        continue;
      }
      if (gap) row += gap;
      gap = 0;
      row += p.white ? letter[p.type]!.toUpperCase() : letter[p.type]!;
    }
    if (gap) row += gap;
    rows.push(row);
  }
  return rows.join("/");
}

/** Picks the piece up, carries it to the square and lets go. Returns false when the piece could not be grabbed. */
export async function grabMove(world: TestWorld, c: FakeClient, uci: string, inst = "0"): Promise<boolean> {
  const piece = pieceAt(world, c, uci.slice(0, 2), inst);
  assert.ok(piece, `${c.name}: no piece on ${uci.slice(0, 2)}`);
  const key = piece.gameObject.key;
  if (!c.grab(SLUG, inst, key)) return false;
  await world.run(120);
  const [x, y] = sq(uci.slice(2, 4));
  // let go a little off the centre, as a hand would
  c.move(SLUG, inst, key, squareWorld(x, y).add(new Vector3(0.21, 0.4, -0.18)));
  c.drop(SLUG, inst, key);
  await world.run(STEP);
  if (uci.length > 4) await promote(world, c, uci[4]!, inst);
  return true;
}

/** Click-to-move: clicks the piece (or, when it sits on the Grabbable layer, picks it up and lets go in place), then the square. */
export async function clickMove(world: TestWorld, c: FakeClient, uci: string, inst = "0"): Promise<void> {
  const piece = pieceAt(world, c, uci.slice(0, 2), inst);
  assert.ok(piece, `${c.name}: no piece on ${uci.slice(0, 2)}`);
  const key = piece.gameObject.key;
  if (!c.click(SLUG, inst, key)) {
    assert.ok(c.grab(SLUG, inst, key), `${c.name}: ${uci.slice(0, 2)} can be neither clicked nor grabbed`);
    await world.run(120);
    c.drop(SLUG, inst, key);
  }
  await world.run(150);
  const target = pieceAt(world, c, uci.slice(2, 4), inst);
  if (target) assert.ok(c.click(SLUG, inst, target.gameObject.key), `${c.name}: cannot click the piece on ${uci.slice(2, 4)}`);
  else assert.ok(c.click(SLUG, inst, "sq_" + uci.slice(2, 4)), `${c.name}: cannot click ${uci.slice(2, 4)}`);
  await world.run(STEP);
  if (uci.length > 4) await promote(world, c, uci[4]!, inst);
}

export async function promote(world: TestWorld, c: FakeClient, letter: string, inst = "0"): Promise<void> {
  const type = { q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" }[letter]!;
  assert.ok(c.click(SLUG, inst, PROMOTION_KEY[type]!), `${c.name}: cannot click the ${type} of the promotion picker`);
  await world.run(STEP);
}

export async function press(world: TestWorld, c: FakeClient, method: string, inst = "0"): Promise<void> {
  assert.ok(c.click(SLUG, inst, BUTTON[method]!), `${c.name}: cannot click the button for ${method}`);
  await world.run(STEP);
}

/** Two players take White and Black; White starts the game. */
export async function seatAndStart(world: TestWorld, white: FakeClient, black: FakeClient, inst = "0"): Promise<void> {
  await press(world, white, "_RegisterWhite", inst);
  await press(world, black, "_RegisterBlack", inst);
  await press(world, white, "_StartGame", inst);
  await world.run(500);
}

/** Everyone has started; then the referee's first write (a fresh table's settings) has reached the room. */
export async function settle(world: TestWorld, inst = "0"): Promise<void> {
  await world.settle(inst);
  await world.run(2500);
}

/** Whether a kit object is switched on, on one client's host (set through the relay or by the page itself). */
export function shown(c: FakeClient, key: string, inst = "0"): boolean {
  const relayed = c.graph(SLUG, inst).active.get(key);
  return relayed ?? c.object(SLUG, inst, key).active;
}
