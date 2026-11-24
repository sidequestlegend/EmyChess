// chess-table: EmyChess (https://github.com/emymin/EmyChess, GPL-3.0) on the portkit runtime.
// The classes bindings.json names by `type`; the build bundles this with bindings.json into pk-chess-table.js.

import type { GameDefinition, GameInstance } from "../portkit/src/index.ts";
import { Board } from "./Board.ts";
import { ChessManager } from "./ChessManager.ts";
import { BoardSquare, ClickToMove } from "./ClickToMove.ts";
import { CreditsPanel } from "./CreditsPanel.ts";
import { DefaultRules } from "./DefaultRules.ts";
import { GameOverMessage } from "./GameOverMessage.ts";
import { inputTrace, Piece } from "./Piece.ts";
import { PiecePlacer } from "./PiecePlacer.ts";
import { PlayerHolder } from "./PlayerHolder.ts";
import { PromotionButton } from "./PromotionButton.ts";
import { PromotionPicker } from "./PromotionPicker.ts";
import { SendEventOnInteract } from "./SendEventOnInteract.ts";
import { Spin } from "./Spin.ts";
import { Timer } from "./Timer.ts";
import { TimerButton } from "./TimerButton.ts";
import { VRCObjectPool } from "./VRCObjectPool.ts";

const game: GameDefinition = {
  slug: "chess-table",
  behaviours: {
    Board,
    ChessManager,
    DefaultRules,
    GameOverMessage,
    Piece,
    PiecePlacer,
    PlayerHolder,
    PromotionButton,
    PromotionPicker,
    SendEventOnInteract,
    Spin,
    Timer,
    TimerButton,
    VRCObjectPool,
    ClickToMove,
    BoardSquare,
    CreditsPanel,
  },
  debug: (instance: GameInstance) => debugHooks(instance),
};

/** Readers for Play-mode tests (window.__pk1.debug["chess-table:<inst>"]): the table as the page holds it. */
function debugHooks(instance: GameInstance): Record<string, unknown> {
  const board = () => instance.behaviour<Board>(instance.bindings.behaviours.find((b) => b.type === "Board")!.id);
  const manager = () => board().chessManager;
  const square = (name: string) => [name.charCodeAt(0) - 97, Number(name[1]) - 1] as const;
  return {
    /** The board as FEN piece placement. */
    fen: () => {
      const rows: string[] = [];
      const letter: Record<string, string> = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };
      for (let y = 7; y >= 0; y--) {
        let row = "";
        let gap = 0;
        for (let x = 0; x < 8; x++) {
          const p = board().GetAllPieces().find((q) => q.x === x && q.y === y);
          if (!p) gap++;
          else {
            row += (gap || "") + (p.white ? letter[p.type]!.toUpperCase() : letter[p.type]);
            gap = 0;
          }
        }
        rows.push(row + (gap || ""));
      }
      return rows.join("/");
    },
    /** The kit path of the piece on a square ("e2"), or "". */
    piecePath: (name: string) => {
      const [x, y] = square(name);
      const p = board().GetAllPieces().find((q) => q.x === x && q.y === y);
      return p ? (instance.bindings.objects[p.gameObject.key]?.path ?? "") : "";
    },
    squarePath: (name: string) => instance.bindings.objects["sq_" + name]?.path ?? "",
    pathOf: (key: string) => instance.bindings.objects[key]?.path ?? "",
    trace: () => inputTrace.slice(),
    frame: () => String(board().WorldToSquare(board().squareRenderers[0]!.gameObject.transform.position)),
    /** The local player as the instance knows them. */
    me: () => ({ sid: instance.networking.LocalPlayer.sid, uid: instance.networking.LocalPlayer.uid, name: instance.networking.LocalPlayer.displayName }),
    table: () => {
      const m = manager();
      const t = m.timer;
      return {
        inProgress: m.inProgress,
        whiteToMove: m.currentSide,
        anarchy: m.anarchy,
        white: m.GetPlayer(true)?.displayName ?? null,
        black: m.GetPlayer(false)?.displayName ?? null,
        scores: [m.whiteScore, m.blackScore],
        gameOver: m.gameOverMessage.gameOverState,
        winnerWhite: m.gameOverMessage.winningSide,
        automatedTimer: m.automatedTimer,
        clock: { running: t.running, white: t.TimeLeft(true), black: t.TimeLeft(false), moves: t.moves, whiteRunning: t.isCurrentSideWhite },
        chosen: m.clickToMove?.chosen ? String.fromCharCode(97 + m.clickToMove.chosen.x) + (m.clickToMove.chosen.y + 1) : null,
        promotionSquare: m.promotionSquare,
        pickerOpen: m.picker.IsOpen(),
      };
    },
  };
}

export default game;
