// chess-table: EmyChess (https://github.com/emymin/EmyChess, GPL-3.0) on the portkit runtime.
// The classes bindings.json names by `type`; the build bundles this with bindings.json into pk-chess-table.js.

import type { GameDefinition } from "../portkit/src/index.ts";
import { Board } from "./Board.ts";
import { ChessManager } from "./ChessManager.ts";
import { BoardSquare, ClickToMove } from "./ClickToMove.ts";
import { CreditsPanel } from "./CreditsPanel.ts";
import { DefaultRules } from "./DefaultRules.ts";
import { GameOverMessage } from "./GameOverMessage.ts";
import { Piece } from "./Piece.ts";
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
};

export default game;
