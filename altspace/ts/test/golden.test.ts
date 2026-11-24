// Rung 1, golden vectors: the TypeScript rules against EmyChess's own C# (vectors/upstream.json, made by golden/Harness.cs
// with `npm run golden`). Both sides load the same positions with the game's own calls (_ClearBoard, _SpawnPiece) and play
// every legal move with them (PiecePicked, PieceDropped, PromoteTo). Every difference must be one the port decided on:
//   D1  castling out of check or across an attacked square is not allowed (upstream allowed it);
//   D2  dead positions (bare kings, a lone minor piece, same-coloured bishops) are a draw, state 4 (upstream: 1 for kings only);
//   D5, D6  the ghost piece lands on the square under it, and adds nothing off the board;
//   D14 the clock shows total hours (upstream wrapped them at 24).
// Anything else that differs fails the test.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Vector2, Vector3 } from "../portkit/src/index.ts";
import { RulesBench } from "../portkit/src/testing.ts";
import type { Board } from "../src/Board.ts";
import type { ChessManager } from "../src/ChessManager.ts";
import type { DefaultRules } from "../src/DefaultRules.ts";
import type { GameOverMessage } from "../src/GameOverMessage.ts";
import game from "../src/index.ts";
import type { Piece } from "../src/Piece.ts";
import { placerSquare, upstreamPlacerSquare, type PiecePlacer } from "../src/PiecePlacer.ts";
import type { PromotionPicker } from "../src/PromotionPicker.ts";
import { GetTimeString } from "../src/Timer.ts";
import { bindings } from "./helpers.ts";

interface Entry {
  legal: Record<string, string>;
  pseudo: Record<string, string>;
  moves: string[];
  check: boolean;
  over: number;
}
interface Suite {
  name: string;
  fen: string;
  root: string;
  depth: number;
  perft: number[];
  positions: Record<string, Entry>;
}
const vectors = JSON.parse(readFileSync(fileURLToPath(new URL("../vectors/upstream.json", import.meta.url)), "utf8")) as {
  stateBytes: { read: string[]; writes: number[] };
  captureFeasible: string;
  dropMapping: string[];
  placerMapping: string[];
  timeStrings: string[];
  suites: Suite[];
};

const LETTERS = "pnbrqk";
const TYPES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
const PROMOTIONS = ["queen", "rook", "bishop", "knight", "pawn"];
const square = (x: number, y: number) => String.fromCharCode(97 + x) + (y + 1);

function fnv(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The port's table on a rules bench, both sides held by the one local player. */
class Table {
  readonly bench = new RulesBench(game, bindings).start("joined");
  readonly board = this.bench.ofType<Board>("Board")[0]!;
  readonly rules = this.bench.ofType<DefaultRules>("DefaultRules")[0]!;
  readonly cm = this.bench.ofType<ChessManager>("ChessManager")[0]!;
  readonly gom = this.bench.ofType<GameOverMessage>("GameOverMessage")[0]!;
  readonly picker = this.bench.ofType<PromotionPicker>("PromotionPicker")[0]!;
  readonly whitePlacer = this.bench.ofType<PiecePlacer>("PiecePlacer").find((p) => p.white)!;

  constructor() {
    for (const holder of [this.cm.whitePlayerHolder, this.cm.blackPlayerHolder]) {
      holder.ownerUid = this.bench.local.uid;
      holder.ownerName = this.bench.local.displayName;
    }
    this.cm.isWhiteRegistered = this.cm.isBlackRegistered = true;
    // the board's frame: squares where the C# stand-ins have them (a1's centre at local (-0.5, 0, -0.5))
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) this.board.squareRenderers[x * 8 + y]!.gameObject.transform.position = new Vector3(-(x + 0.5), 0, -(y + 0.5));
  }

  load(key: string): void {
    const [squares, side, moved, ep] = key.split("|") as [string, string, string, string];
    this.board._ClearBoard();
    this.picker._Hide();
    this.board.whiteKing = this.board.blackKing = null;
    for (let i = 0; i < 64; i++) {
      const c = squares[i]!;
      if (c === ".") continue;
      const piece = this.board._SpawnPiece(Math.floor(i / 8), i % 8, c !== c.toLowerCase(), TYPES[LETTERS.indexOf(c.toLowerCase())]!);
      assert.ok(piece, `pool empty for ${c}`);
      piece.hasMoved = moved[i] === "1";
    }
    this.board._RegenerateGrid();
    this.board._RefreshKings();
    this.board.PawnThatDidADoublePushLastRound = ep === "-" ? null : this.board.GetPiece(Math.floor(Number(ep) / 8), Number(ep) % 8);
    this.cm.currentSide = side === "w";
    this.cm.inProgress = true;
    this.cm.promotionSquare = -1;
    this.cm.anarchy = this.rules.anarchy = false;
    this.cm.whiteScore = this.cm.blackScore = 0;
    this.gom.gameOverState = 0;
  }

  key(): string {
    const grid = this.board.GetBoardGrid();
    let squares = "";
    let moved = "";
    for (let i = 0; i < 64; i++) {
      const p = grid[i];
      const letter = p ? LETTERS[TYPES.indexOf(p.type)]! : ".";
      squares += p ? (p.white ? letter.toUpperCase() : letter) : ".";
      moved += p && p.hasMoved ? "1" : "0";
    }
    const ep = this.board.PawnThatDidADoublePushLastRound;
    return `${squares}|${this.cm.currentSide ? "w" : "b"}|${moved}|${ep && ep._active ? ep.x * 8 + ep.y : "-"}`;
  }

  moves(list: Vector2[]): string {
    const out: string[] = [];
    for (const m of list) {
      if (m.equals(this.rules.legalMovesEndMarker)) break;
      out.push(m.equals(this.rules.legalMovesIgnoreMarker) ? "x" : square(m.x, m.y));
    }
    return out.join(",");
  }

  pieces(): Piece[] {
    return this.board.GetAllPieces().slice().sort((a: Piece, b: Piece) => a.x * 8 + a.y - (b.x * 8 + b.y));
  }

  /** One move from `key` with the game's own calls; the vector's move text. */
  play(key: string, fx: number, fy: number, tx: number, ty: number, promotion: string | null): { text: string; child: string } {
    this.load(key);
    const piece = this.board.GetPiece(fx, fy)!;
    const before = this.board.GetPieceCount();
    piece.PiecePicked();
    piece.PieceDropped(tx, ty);
    const captured = before - this.board.GetPieceCount();
    if (this.picker.IsOpen() && promotion) this.picker.PromoteTo(promotion);
    const over = this.gom.gameOverState;
    const child = this.key();
    const move = square(fx, fy) + square(tx, ty) + (promotion ? (promotion === "knight" ? "n" : promotion[0]) : "");
    return { text: `${move}:${captured}:${over}:${over !== 0 ? (this.gom.winningSide ? "w" : "b") : "-"}:${fnv(child)}`, child };
  }

  /** The port's own entry for a position, as the harness writes one. */
  entry(key: string): { entry: Entry; children: string[] } {
    this.load(key);
    const white = this.cm.currentSide;
    const king = white ? this.board.whiteKing : this.board.blackKing;
    const check = king !== null && this.rules.isKingInCheck(king.GetVec(), this.board.grid, this.board, this.board.PawnThatDidADoublePushLastRound, white);
    const entry: Entry = { legal: {}, pseudo: {}, moves: [], check, over: this.board._CheckIfGameOver(white, check) };
    const targets: Array<[number, number, number, number, boolean]> = [];
    for (const p of this.pieces()) {
      const at = square(p.x, p.y);
      entry.pseudo[at] = this.moves(this.rules.GetAllPseudoLegalMoves(p, this.board));
      const legal = this.rules.GetAllLegalMoves(p, this.board);
      entry.legal[at] = this.moves(legal);
      if (p.white !== white) continue;
      for (const m of legal) {
        if (m.equals(this.rules.legalMovesEndMarker)) break;
        if (m.equals(this.rules.legalMovesIgnoreMarker)) continue;
        targets.push([p.x, p.y, m.x, m.y, p.type === "pawn" && m.y === (white ? 7 : 0)]);
      }
    }
    const children: string[] = [];
    for (const [fx, fy, tx, ty, promo] of targets) {
      for (const choice of promo ? PROMOTIONS : [null]) {
        const r = this.play(key, fx, fy, tx, ty, choice);
        entry.moves.push(r.text);
        if (choice !== "pawn") children.push(r.child);
      }
    }
    return { entry, children };
  }
}

const table = new Table();

/**
 * A castling move the port refuses and upstream allows (D1): a king on its own rank moving two files, while it is in
 * check or across an attacked square. Worked out here from the position key alone, with an attack test of the test's
 * own, so the excuse does not rest on the port's rules (it used to call the port's own CastlesThroughCheck).
 */
function refusedCastle(key: string, at: string, upstreamMove: string): boolean {
  const squares = key.split("|")[0]!;
  const kx = at.charCodeAt(0) - 97;
  const ky = Number(at[1]) - 1;
  const tx = upstreamMove.charCodeAt(0) - 97;
  const ty = Number(upstreamMove[1]) - 1;
  const king = squares[kx * 8 + ky]!;
  if (king.toLowerCase() !== "k" || ty !== ky || Math.abs(tx - kx) !== 2) return false;
  const white = king === "K";
  if (ky !== (white ? 0 : 7) || kx !== 4) return false;
  return attacked(squares, kx, ky, !white) || attacked(squares, kx + Math.sign(tx - kx), ky, !white);
}

/** Whether a piece of colour `byWhite` attacks square (x, y), from the position key's 64 squares (index x * 8 + y). */
function attacked(squares: string, x: number, y: number, byWhite: boolean): boolean {
  const at = (i: number, j: number) => (i >= 0 && i < 8 && j >= 0 && j < 8 ? squares[i * 8 + j]! : null);
  const mine = (c: string | null, letter: string) => c !== null && c !== "." && c.toLowerCase() === letter && (c === c.toUpperCase()) === byWhite;
  const forward = byWhite ? 1 : -1;
  if (mine(at(x - 1, y - forward), "p") || mine(at(x + 1, y - forward), "p")) return true;
  for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] as const) if (mine(at(x + dx, y + dy), "n")) return true;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && mine(at(x + dx, y + dy), "k")) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const sliders = dx && dy ? ["b", "q"] : ["r", "q"];
    for (let i = x + dx, j = y + dy; at(i, j) !== null; i += dx, j += dy) {
      const c = at(i, j)!;
      if (c === ".") continue;
      if (sliders.some((s) => mine(c, s))) return true;
      break;
    }
  }
  return false;
}

test("the state byte reads and writes as upstream's", () => {
  const piece = table.board.allPieces[0]!;
  let w = 0;
  for (let s = 0; s < 256; s++) {
    piece._state = s;
    assert.equal(`${piece.x},${piece.y},${piece.white ? 1 : 0},${piece.hasMoved ? 1 : 0}`, vectors.stateBytes.read[s]);
    for (let v = 0; v < 8; v++) {
      piece._state = s;
      piece.x = v;
      assert.equal(piece._state, vectors.stateBytes.writes[w++]);
      piece._state = s;
      piece.y = v;
      assert.equal(piece._state, vectors.stateBytes.writes[w++]);
    }
    for (const set of [(p: Piece) => (p.white = true), (p: Piece) => (p.white = false), (p: Piece) => (p.hasMoved = true), (p: Piece) => (p.hasMoved = false)]) {
      piece._state = s;
      set(piece);
      assert.equal(piece._state, vectors.stateBytes.writes[w++]);
    }
  }
  piece._state = 0;
});

test("isCaptureFeasible agrees for 6 types x 64 x 64 squares", () => {
  let text = "";
  for (const type of ["pawn", "knight", "bishop", "rook", "queen", "king"])
    for (let a = 0; a < 64; a++) for (let b = 0; b < 64; b++) text += table.rules.isCaptureFeasible(new Vector2(Math.floor(a / 8), a % 8), new Vector2(Math.floor(b / 8), b % 8), type) ? "1" : "0";
  assert.equal(text, vectors.captureFeasible);
});

for (const suite of vectors.suites) {
  test(`positions and moves agree with upstream: ${suite.name}`, () => {
    let castles = 0;
    let deadDraws = 0;
    for (const [key, up] of Object.entries(suite.positions)) {
      // the castlings this position's refusals excuse (per position: one excused elsewhere excuses nothing here)
      const expected = new Set<string>();
      const { entry: mine } = table.entry(key);
      assert.equal(mine.check, up.check, `${key}: check`);
      assert.deepEqual(mine.pseudo, up.pseudo, `${key}: pseudo-legal moves`);
      table.load(key);
      const dead = table.board.IsDeadPosition(table.board.GetAllPieces());
      if (dead) {
        assert.equal(mine.over, 4, `${key}: a dead position is a draw (D2)`);
        if (up.over !== 4) deadDraws++;
      } else assert.equal(mine.over, up.over, `${key}: game over state`);
      for (const at of Object.keys(up.legal)) {
        const a = mine.legal[at]!.split(",");
        const b = up.legal[at]!.split(",");
        assert.equal(a.length, b.length, `${key} ${at}: legal list length`);
        for (let i = 0; i < a.length; i++) {
          if (a[i] === b[i]) continue;
          assert.ok(a[i] === "x" && refusedCastle(key, at, b[i]!), `${key} ${at}: the port gives ${a[i]} where upstream gives ${b[i]}`);
          castles++;
          expected.add(`${at}${b[i]}`);
        }
      }
      const mineMoves = new Map(mine.moves.map((m) => [m.split(":")[0]!, m]));
      assert.equal(mineMoves.size, mine.moves.length, `${key}: the port lists a move twice`);
      const upNames = new Set(up.moves.map((m) => m.split(":")[0]!));
      for (const name of mineMoves.keys()) assert.ok(upNames.has(name), `${key}: the port plays ${name}, upstream does not`);
      let skipped = 0;
      for (const move of up.moves) {
        const name = move.split(":")[0]!;
        const ours = mineMoves.get(name);
        if (ours === undefined) {
          assert.ok(expected.has(name), `${key}: upstream plays ${name}, the port does not`);
          skipped++;
          continue;
        }
        if (ours === move) continue;
        // the only other difference allowed: the position after the move is dead, so the port calls a draw (D2)
        const [, capU, overU, , hashU] = move.split(":");
        const [, capM, overM, , hashM] = ours.split(":");
        assert.ok(capU === capM && hashU === hashM && overM === "4" && overU !== "4", `${key}: ${move} against ${ours}`);
        deadDraws++;
      }
      assert.equal(mine.moves.length, up.moves.length - skipped, `${key}: the port's moves are upstream's less the refused castlings`);
    }
    if (castles || deadDraws) console.log(`# ${suite.name}: ${castles} castling moves refused by the port (D1), ${deadDraws} results that are draws by dead position (D2)`);
  });
}

/** Perft from the port's own move generation and moves (promotions counted four ways, as standard perft does). */
function perft(key: string, depth: number): number {
  if (depth === 0) return 1;
  const { children } = table.entry(key);
  if (depth === 1) return children.length;
  let n = 0;
  for (const child of children) n += perft(child, depth - 1);
  return n;
}

const STANDARD: Record<string, number[]> = {
  start: [20, 400, 8902],
  kiwipete: [48, 2039],
  position3: [14, 191, 2812],
  position4: [6, 264],
  position5: [44, 1486],
};

test("perft: the port gives the published counts; upstream too, but for castling through check in Kiwipete (D1)", () => {
  for (const suite of vectors.suites) {
    const want = STANDARD[suite.name];
    if (!want) continue;
    const mine = want.map((_, d) => perft(suite.root, d + 1));
    assert.deepEqual(mine, want, `${suite.name}: the port's perft`);
    const upstream = suite.perft.slice(1);
    if (suite.name === "kiwipete") assert.deepEqual(upstream, [48, 2043], "upstream's Kiwipete perft(2) has 4 castlings through check");
    else assert.deepEqual(upstream, want, `${suite.name}: upstream's perft`);
    console.log(`# perft ${suite.name}: port ${mine.join(", ")}; upstream ${upstream.join(", ")}`);
  }
});

test("a dropped piece lands where upstream's Piece.OnDrop puts it (Anarchy, rounding halves to even, deleting far off)", () => {
  let i = 0;
  for (let n = 0; n <= 340; n++) {
    for (const alongX of [true, false]) {
      const [value, want] = vectors.dropMapping[i]!.split("=") as [string, string];
      const local = Math.fround(Number(value));
      table.load("...........................R....................................|w|0000000000000000000000000000000000000000000000000000000000000000|-");
      table.cm.anarchy = table.rules.anarchy = true;
      const rook = table.board.GetPiece(3, 3)!;
      rook.OnPickup();
      rook.transform.position = alongX ? new Vector3(local, 0, -3.5) : new Vector3(-3.5, 0, local);
      rook.OnDrop();
      const got = !rook._active ? "D" : square(rook.x, rook.y);
      assert.equal(got, want, `local ${local} along ${alongX ? "x" : "z"}`);
      i++;
    }
  }
});

test("the ghost piece: upstream lands one square toward a1 and clamps onto the board (D5, D6); the port uses the square under it", () => {
  let i = 0;
  let differ = 0;
  for (let n = 0; n <= 340; n++) {
    for (const alongX of [true, false]) {
      const [value, up] = vectors.placerMapping[i++]!.split("=") as [string, string];
      const local = Math.fround(Number(value));
      // upstream, as the vectors show it: (int)pos * -1 - 1 on each axis, clamped by _Setup
      const other = Math.trunc(-3.5) * -1 - 1;
      const ux = Math.min(7, Math.max(0, upstreamPlacerSquare(alongX ? local : -3.5)));
      const uy = Math.min(7, Math.max(0, upstreamPlacerSquare(alongX ? -3.5 : local)));
      assert.equal(up, square(ux, uy), `upstream mapping at ${local}`);
      assert.equal(other, 2);
      // the port, through PiecePlacer.OnDrop
      table.load("................................................................|w|0000000000000000000000000000000000000000000000000000000000000000|-");
      table.cm.anarchy = table.rules.anarchy = true;
      table.whitePlacer._Setup();
      table.whitePlacer.enabled = true;
      table.whitePlacer.transform.position = alongX ? new Vector3(local, 0, -3.5) : new Vector3(-3.5, 0, local);
      table.whitePlacer.OnDrop();
      const placed = table.board.GetAllPieces()[0];
      const at = (v: number) => placerSquare(-v - 0.5);
      const px = at(alongX ? local : -3.5);
      const py = at(alongX ? -3.5 : local);
      assert.equal(placed ? square(placed.x, placed.y) : "-", px === null || py === null ? "-" : square(px, py), `port at ${local}`);
      if ((placed ? square(placed.x, placed.y) : "-") !== up) differ++;
    }
  }
  console.log(`# ghost piece: ${differ} of ${vectors.placerMapping.length} drops land elsewhere than upstream's (D5, D6)`);
});

test("clock text: upstream's (24-hour wrap) exactly; the port shows total hours (D14)", () => {
  for (const line of vectors.timeStrings) {
    const [value, text] = line.split("=") as [string, string];
    const time = Math.fround(Number(value));
    assert.equal(GetTimeString(time, true), text, `${value} s`);
    const hours = Math.floor(Math.floor(time * 1000 + 0.5) / 3600000);
    if (hours < 24) assert.equal(GetTimeString(time), text);
    else assert.equal(GetTimeString(time).slice(0, 2), String(hours).padStart(2, "0"));
  }
});
