// Golden vectors for chess-table: EmyChess's own Board, Piece, DefaultRules, ChessManager, Timer, PromotionPicker and
// PiecePlacer, unchanged, driven through their public methods on a table built from portkit's stand-ins
// (ts/portkit/golden/UdonStubs.cs). Writes ../vectors/upstream.json; test/golden.test.ts compares the TypeScript with it.
//
//   dotnet run --project golden -c Release -- ../vectors/upstream.json      (npm run golden)
//
// A position is written as one string: 64 squares in the upstream grid order (index x * 8 + y: a1, a2, ... h8), each a
// FEN letter or '.', then the side to move (w or b), then 64 "has moved" flags (0 or 1, same order), then the square
// index of the pawn open to en passant or '-'.  "<board>|<side>|<moved>|<ep>"
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Emychess;
using Emychess.GameRules;
using Emychess.Interactions;
using Emychess.Misc;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Components;
using VRC.SDKBase;

namespace Emychess
{
    /// <summary>
    /// Shadows System.TimeSpan for Timer.cs (C# looks in the enclosing namespace before the usings). Unity 2019's Mono uses
    /// the .NET Framework's FromSeconds, which rounds to the nearest millisecond; .NET Core 3.0 and later do not.
    /// </summary>
    public struct TimeSpan
    {
        readonly long ms;
        TimeSpan(long ms) { this.ms = ms; }
        public static TimeSpan FromSeconds(double value) => new TimeSpan((long)(value * 1000 + (value >= 0 ? 0.5 : -0.5)));
        public int Hours => (int)(ms / 3600000 % 24);
        public int Minutes => (int)(ms / 60000 % 60);
        public int Seconds => (int)(ms / 1000 % 60);
        public int Milliseconds => (int)(ms % 1000);
    }
}

namespace GoldenChess
{
    sealed class Table
    {
        public Board board;
        public DefaultRules rules;
        public ChessManager cm;
        public Emychess.Timer timer;
        public GameOverMessage gom;
        public PromotionPicker picker;
        public PiecePlacer whitePlacer, blackPlacer;
        public readonly List<Piece> pieces = new List<Piece>();
        static readonly string[] PoolTypes = { "pawn", "bishop", "king", "knight", "queen", "rook" };
        static readonly int[] PoolSizes = { 20, 8, 8, 8, 16, 8 };

        static GameObject GO(string name, Transform parent = null)
        {
            var go = new GameObject(name);
            if (parent != null) go.transform.SetParent(parent);
            return go;
        }

        static Text Label(string name) => GO(name).AddComponent<Text>();

        public Table()
        {
            Golden.Hooks.Enabled = c => c.GetType().GetMethod("OnEnable", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.Invoke(c, null);
            var root = GO("EmyChess");
            rules = GO("DefaultRules", root.transform).AddComponent<DefaultRules>();
            var boardGo = GO("Board", root.transform);
            board = boardGo.AddComponent<Board>();
            board.board_renderer = boardGo.AddComponent<MeshRenderer>();
            board.pieces_parent = GO("pieces_parent", boardGo.transform).transform;
            board.whitePieceMaterial = new Material { name = "WhitePiece" };
            board.blackPieceMaterial = new Material { name = "BlackPiece" };
            board.pieceMovedClip = new AudioClip { name = "Move" };
            board.pieceCapturedClip = new AudioClip { name = "Capture" };
            board.currentRules = rules;
            var pools = GO("pieces_pools", boardGo.transform);
            board.piece_pools = new VRCObjectPool[PoolTypes.Length];
            for (int t = 0; t < PoolTypes.Length; t++)
            {
                var poolGo = GO(PoolTypes[t], pools.transform);
                var pool = poolGo.AddComponent<VRCObjectPool>();
                pool.Pool = new GameObject[PoolSizes[t]];
                for (int i = 0; i < PoolSizes[t]; i++)
                {
                    var go = GO(PoolTypes[t] + i, poolGo.transform);
                    go.AddComponent<MeshRenderer>();
                    go.AddComponent<VRC_Pickup>();
                    go.AddComponent<AudioSource>();
                    var piece = go.AddComponent<Piece>();
                    piece.board = board;
                    piece.pool = pool;
                    piece.type = PoolTypes[t];
                    go.SetActive(false);
                    pool.Pool[i] = go;
                    pieces.Add(piece);
                }
                board.piece_pools[t] = pool;
            }

            cm = GO("ChessManager", root.transform).AddComponent<ChessManager>();
            board.chessManager = cm;
            cm.board = board;
            cm.whitePlayerHolder = GO("whitePlayerObject", root.transform).AddComponent<PlayerHolder>();
            cm.blackPlayerHolder = GO("blackPlayerObject", root.transform).AddComponent<PlayerHolder>();
            cm.whitePlayerLabel = Label("WhitePlayerLabel");
            cm.blackPlayerLabel = Label("BlackPlayerLabel");
            cm.mainMenu = GO("MainMenu");
            cm.gameMenu = GO("GameMenu");
            cm.gameModeLabel = Label("GameModeText");
            cm.logText = Label("logText");
            cm.startButton = GO("StartButton").AddComponent<Button>();
            cm.endButton = GO("endGame").AddComponent<Button>();
            cm.whiteJoinLabel = Label("WhiteJoin");
            cm.blackJoinLabel = Label("BlackJoin");
            cm.autoTimerCheckMark = GO("Checkmark");
            cm.currentPlayerLabel = Label("CurrentMoveLabel");
            cm.currentSideLabel = Label("CurrentSideLabel");
            cm.whiteScoreLabel = Label("whiteScoreLabel");
            cm.blackScoreLabel = Label("blackScoreLabel");

            gom = GO("GameOverMessage", root.transform).AddComponent<GameOverMessage>();
            gom.chessManager = cm;
            gom.statusMessage = Label("GameOverText");
            gom.uiParent = GO("GameOver");
            cm.gameOverMessage = gom;

            timer = GO("Timer", root.transform).AddComponent<Emychess.Timer>();
            timer.chessManager = cm;
            timer.displayBlack = Label("LeftTimer");
            timer.millisecondsDisplayBlack = Label("LeftMilliseconds");
            timer.displayWhite = Label("RightTimer");
            timer.millisecondsDisplayWhite = Label("RightMilliseconds");
            timer.displayMoves = Label("MovesCounter");
            timer.whiteButton = GO("TimerButton_Right").AddComponent<TimerButton>();
            timer.blackButton = GO("TimerButton_Left").AddComponent<TimerButton>();
            timer.whiteButton.timer = timer;
            timer.blackButton.timer = timer;
            cm.timer = timer;

            var pickerGo = GO("PromotionPicker", root.transform);
            picker = pickerGo.AddComponent<PromotionPicker>();
            picker.board = board;
            picker.piecesButtonsParent = GO("Pieces", pickerGo.transform);
            foreach (var type in new[] { "pawn", "queen", "knight", "bishop", "rook" })
            {
                var button = GO(type, picker.piecesButtonsParent.transform).AddComponent<PromotionButton>();
                button.picker = picker;
                button.promotionType = type;
                button.availableCountLabel = Label("AvailableCount");
            }
            picker.piecesButtonsParent.SetActive(false);
            cm.picker = picker;

            PiecePlacer Console(string name, bool white, out GameObject console, out SendEventOnInteract endTurn)
            {
                console = GO(name, root.transform);
                endTurn = GO("EndTurnButton", console.transform).AddComponent<SendEventOnInteract>();
                endTurn.targetBehaviour = cm;
                endTurn.eventName = "_EndTurn";
                var placerGo = GO("PiecePlacer", console.transform);
                placerGo.AddComponent<VRC_Pickup>();
                var placer = placerGo.AddComponent<PiecePlacer>();
                placer.board = board;
                placer.white = white;
                placer.pieceMeshParent = GO("Pieces", placerGo.transform).transform;
                foreach (var type in new[] { "bishop", "king", "knight", "pawn", "queen", "rook" }) GO(type, placer.pieceMeshParent);
                placer.availableText = Label("AvailableText");
                placer.pieceCount = Label("PieceCount");
                return placer;
            }
            blackPlacer = Console("AnarchyControls_Black", false, out var blackConsole, out var blackEnd);
            whitePlacer = Console("AnarchyControls_White", true, out var whiteConsole, out var whiteEnd);
            cm.anarchyControls_black = blackConsole;
            cm.anarchyControl_white = whiteConsole;
            cm.endTurnButton_black = blackEnd;
            cm.endTurnButton_white = whiteEnd;
            cm.blackPiecePlacer = blackPlacer;
            cm.whitePiecePlacer = whitePlacer;

            // Start, in an order where nothing reads what is not set up yet
            rules.Start();
            board.Start();
            picker.Start();
            timer.Start();
            gom.Start();
            cm.Start();
            // both sides are the local player (the holders' owner is the local player by default)
            cm.isWhiteRegistered = true;
            cm.isBlackRegistered = true;
        }

        // ---- positions ----------------------------------------------------------------------------------------

        public static readonly string Letters = "pnbrqk";
        static readonly string[] TypeOf = { "pawn", "knight", "bishop", "rook", "queen", "king" };

        public static char Letter(Piece p) { char c = "pnbrqk"[Array.IndexOf(TypeOf, p.type)]; return p.white ? char.ToUpperInvariant(c) : c; }

        /// <summary>Puts a position on the board with upstream's own calls (_ClearBoard, _SpawnPiece), then the flags.</summary>
        public void Load(string key)
        {
            var parts = key.Split('|');
            board._ClearBoard();
            picker._Hide();
            // A fresh client's references: upstream keeps a king reference while that object is active whatever its colour,
            // which a reload that hands the pooled kings out in another order would turn stale (never in a real game).
            board.whiteKing = board.blackKing = null;
            for (int i = 0; i < 64; i++)
            {
                char c = parts[0][i];
                if (c == '.') continue;
                var piece = board._SpawnPiece(i / 8, i % 8, char.IsUpper(c), TypeOf[Letters.IndexOf(char.ToLowerInvariant(c))]);
                if (piece == null) throw new Exception("pool empty for " + c);
                piece.hasMoved = parts[2][i] == '1';
            }
            board._RegenerateGrid();
            board.PawnThatDidADoublePushLastRound = parts[3] == "-" ? null : board.GetPiece(int.Parse(parts[3]) / 8, int.Parse(parts[3]) % 8);
            cm.currentSide = parts[1] == "w";
            cm.inProgress = true;
            cm.anarchy = rules.anarchy = false;
            cm.whiteScore = cm.blackScore = 0;
            gom.gameOverState = 0;
            Golden.Record.Clear();
        }

        public string Key()
        {
            var grid = board.GetBoardGrid();
            var squares = new StringBuilder();
            var moved = new StringBuilder();
            for (int i = 0; i < 64; i++)
            {
                var p = grid[i];
                squares.Append(p == null ? '.' : Letter(p));
                moved.Append(p != null && p.hasMoved ? '1' : '0');
            }
            var ep = board.PawnThatDidADoublePushLastRound;
            string epText = ep != null && ep.gameObject.activeSelf ? (ep.x * 8 + ep.y).ToString(CultureInfo.InvariantCulture) : "-";
            return $"{squares}|{(cm.currentSide ? "w" : "b")}|{moved}|{epText}";
        }

        public string Moves(Vector2[] list)
        {
            var text = new StringBuilder();
            foreach (var m in list)
            {
                if (m == rules.legalMovesEndMarker) break;
                if (text.Length > 0) text.Append(',');
                text.Append(m == rules.legalMovesIgnoreMarker ? "x" : Square((int)m.x, (int)m.y));
            }
            return text.ToString();
        }

        public static string Square(int x, int y) => ((char)('a' + x)).ToString() + (y + 1).ToString(CultureInfo.InvariantCulture);

        /// <summary>From a FEN: castling rights leave king and rook unmoved, pawns on their home rank are unmoved, all else moved.</summary>
        public static string FromFen(string fen)
        {
            var f = fen.Split(' ');
            var squares = Enumerable.Repeat('.', 64).ToArray();
            var moved = Enumerable.Repeat('0', 64).ToArray();
            int x = 0, y = 7;
            foreach (char c in f[0])
            {
                if (c == '/') { x = 0; y--; }
                else if (char.IsDigit(c)) x += c - '0';
                else { squares[x * 8 + y] = c; x++; }
            }
            string rights = f.Length > 2 ? f[2] : "-";
            for (int i = 0; i < 64; i++)
            {
                char c = squares[i];
                if (c == '.') continue;
                int px = i / 8, py = i % 8;
                bool unmoved = c == 'P' ? py == 1 : c == 'p' ? py == 6
                    : c == 'K' ? px == 4 && py == 0 && (rights.Contains('K') || rights.Contains('Q'))
                    : c == 'k' ? px == 4 && py == 7 && (rights.Contains('k') || rights.Contains('q'))
                    : c == 'R' ? py == 0 && ((px == 7 && rights.Contains('K')) || (px == 0 && rights.Contains('Q')))
                    : c == 'r' ? py == 7 && ((px == 7 && rights.Contains('k')) || (px == 0 && rights.Contains('q')))
                    : false;
                moved[i] = unmoved ? '0' : '1';
            }
            string ep = "-";
            if (f.Length > 3 && f[3] != "-")
            {
                int ex = f[3][0] - 'a', ey = f[3][1] - '1';
                int pawnY = ey == 5 ? 4 : 3;
                ep = (ex * 8 + pawnY).ToString(CultureInfo.InvariantCulture);
            }
            return $"{new string(squares)}|{(f.Length > 1 ? f[1] : "w")}|{new string(moved)}|{ep}";
        }
    }

    static class Program
    {
        static readonly string[] Promotions = { "queen", "rook", "bishop", "knight", "pawn" };

        static uint Fnv(string text)
        {
            uint h = 2166136261;
            foreach (char c in text) { h ^= c; h *= 16777619; }
            return h;
        }

        sealed class Result
        {
            public string key;
            public string child;
            public int captured;
            public bool picker;
            public int over;
            public bool winner;
        }

        /// <summary>Plays one move with upstream's calls (PiecePicked, PieceDropped, PromoteTo) from position `key`.</summary>
        static Result Play(Table t, string key, int fx, int fy, int tx, int ty, string promotion)
        {
            t.Load(key);
            var piece = t.board.GetPiece(fx, fy);
            int before = t.board.GetPieceCount();
            piece.PiecePicked();
            piece.PieceDropped(tx, ty);
            var r = new Result { captured = before - t.board.GetPieceCount(), picker = t.picker.targetPiece != null && t.picker.piecesButtonsParent.activeSelf };
            if (r.picker && promotion != null)
            {
                t.picker.PromoteTo(promotion);
                r.picker = false;
            }
            r.over = t.gom.gameOverState;
            r.winner = t.gom.winningSide;
            r.child = t.Key();
            return r;
        }

        sealed class Entry
        {
            public Dictionary<string, string> legal = new Dictionary<string, string>();
            public Dictionary<string, string> pseudo = new Dictionary<string, string>();
            public List<string> moves = new List<string>();
            public bool check;
            public int over;
        }

        static void Explore(Table t, string key, int depth, Dictionary<string, Entry> entries, long[] perft, int ply)
        {
            var e = new Entry();
            t.Load(key);
            bool white = t.cm.currentSide;
            var king = white ? t.board.whiteKing : t.board.blackKing;
            e.check = king != null && t.rules.isKingInCheck(king.GetVec(), t.board.grid, t.board, t.board.PawnThatDidADoublePushLastRound, white);
            e.over = t.board._CheckIfGameOver(white, e.check);
            var targets = new List<(int fx, int fy, int tx, int ty, bool promo)>();
            foreach (var p in t.board.GetAllPieces().OrderBy(p => p.x * 8 + p.y))
            {
                string at = Table.Square(p.x, p.y);
                e.pseudo[at] = t.Moves(t.rules.GetAllPseudoLegalMoves(p, t.board));
                var legal = t.rules.GetAllLegalMoves(p, t.board);
                e.legal[at] = t.Moves(legal);
                if (p.white != white) continue;
                foreach (var m in legal)
                {
                    if (m == t.rules.legalMovesEndMarker) break;
                    if (m == t.rules.legalMovesIgnoreMarker) continue;
                    bool promo = p.type == "pawn" && (int)m.y == (white ? 7 : 0);
                    targets.Add((p.x, p.y, (int)m.x, (int)m.y, promo));
                }
            }
            var children = new List<string>();
            foreach (var (fx, fy, tx, ty, promo) in targets)
            {
                foreach (var choice in promo ? Promotions : new string[] { null })
                {
                    var r = Play(t, key, fx, fy, tx, ty, choice);
                    string move = Table.Square(fx, fy) + Table.Square(tx, ty) + (choice == null ? "" : choice.Substring(0, 1).Replace("k", "n"));
                    if (choice == "knight") move = move.Substring(0, 4) + "n";
                    e.moves.Add($"{move}:{r.captured}:{r.over}:{(r.over != 0 ? (r.winner ? "w" : "b") : "-")}:{Fnv(r.child):x8}");
                    if (choice != "pawn") perft[ply + 1]++;
                    if (choice != "pawn" && depth > 1) children.Add(r.child);
                }
            }
            entries[key] = e;
            foreach (var child in children)
                if (depth > 1) Explore(t, child, depth - 1, entries, perft, ply + 1);
        }

        static object StateBytes()
        {
            var table = new Table();
            var piece = table.pieces[0];
            var field = typeof(Piece).GetField("_state", BindingFlags.Instance | BindingFlags.NonPublic);
            var read = new List<string>();
            var writes = new List<int>();
            for (int s = 0; s < 256; s++)
            {
                field.SetValue(piece, (byte)s);
                read.Add($"{piece.x},{piece.y},{(piece.white ? 1 : 0)},{(piece.hasMoved ? 1 : 0)}");
                for (byte v = 0; v < 8; v++)
                {
                    field.SetValue(piece, (byte)s); piece.x = v; writes.Add((byte)field.GetValue(piece));
                    field.SetValue(piece, (byte)s); piece.y = v; writes.Add((byte)field.GetValue(piece));
                }
                field.SetValue(piece, (byte)s); piece.white = true; writes.Add((byte)field.GetValue(piece));
                field.SetValue(piece, (byte)s); piece.white = false; writes.Add((byte)field.GetValue(piece));
                field.SetValue(piece, (byte)s); piece.hasMoved = true; writes.Add((byte)field.GetValue(piece));
                field.SetValue(piece, (byte)s); piece.hasMoved = false; writes.Add((byte)field.GetValue(piece));
            }
            return new { read, writes };
        }

        static string CaptureFeasible(Table t)
        {
            var text = new StringBuilder();
            foreach (var type in new[] { "pawn", "knight", "bishop", "rook", "queen", "king" })
                for (int a = 0; a < 64; a++)
                    for (int b = 0; b < 64; b++)
                        text.Append(t.rules.isCaptureFeasible(new Vector2(a / 8, a % 8), new Vector2(b / 8, b % 8), type) ? '1' : '0');
            return text.ToString();
        }

        /// <summary>Piece.OnDrop in Anarchy, for a rook alone on the board, let go at a local position: the square it lands on, or "D" (deleted).</summary>
        static List<string> DropMapping(Table t)
        {
            var outcome = new List<string>();
            for (int i = 0; i <= 340; i++)
            {
                float local = -12f + i * 0.05f;
                foreach (bool alongX in new[] { true, false })
                {
                    t.Load(Table.FromFen("8/8/8/8/3R4/8/8/8 w - -"));
                    t.cm.anarchy = t.rules.anarchy = true;
                    var rook = t.board.GetPiece(3, 3);
                    rook.transform.localPosition = alongX ? new Vector3(local, 0, -3.5f) : new Vector3(-3.5f, 0, local);
                    rook.OnDrop();
                    outcome.Add(local.ToString("R", CultureInfo.InvariantCulture) + "=" + (!rook.gameObject.activeSelf ? "D" : Table.Square(rook.x, rook.y)));
                }
            }
            return outcome;
        }

        /// <summary>PiecePlacer.OnDrop in Anarchy on an empty board, the ghost let go at a local position: where a piece appears.</summary>
        static List<string> PlacerMapping(Table t)
        {
            var outcome = new List<string>();
            for (int i = 0; i <= 340; i++)
            {
                float local = -12f + i * 0.05f;
                foreach (bool alongX in new[] { true, false })
                {
                    t.Load("................................................................|w|0000000000000000000000000000000000000000000000000000000000000000|-");
                    t.cm.anarchy = t.rules.anarchy = true;
                    t.whitePlacer._Setup();
                    t.whitePlacer.transform.position = alongX ? new Vector3(local, 0, -3.5f) : new Vector3(-3.5f, 0, local);
                    t.whitePlacer.OnDrop();
                    var placed = t.board.GetAllPieces().FirstOrDefault();
                    outcome.Add(local.ToString("R", CultureInfo.InvariantCulture) + "=" + (placed == null ? "-" : Table.Square(placed.x, placed.y)));
                }
            }
            return outcome;
        }

        static List<string> TimeStrings(Table t)
        {
            var values = new List<float> { 0f, 0.0004f, 0.0005f, 0.001f, 0.0015f, 1.2345f, 59.9995f, 59.999f, 3599.999f, 3600f, 86399.9995f, 86400f, 90000f, 356400f, 12345.678f };
            return values.Select(v => v.ToString("R", CultureInfo.InvariantCulture) + "=" + t.timer.GetTimeString(v)).ToList();
        }

        static int Main(string[] args)
        {
            string output = args.Length > 0 ? args[0] : "../vectors/upstream.json";
            var t = new Table();
            var started = DateTime.UtcNow;

            var suites = new List<object>();
            var named = new (string name, string fen, int depth)[]
            {
                ("start", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -", 3),
                ("kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -", 2),
                ("position3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -", 3),
                ("position4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -", 2),
                ("position5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -", 2),
                ("castle out of check", "r3k2r/8/8/8/8/8/4q3/R3K2R w KQkq -", 1),
                ("castle through attack", "r3k2r/8/8/8/8/8/3q4/R3K2R w KQkq -", 1),
                ("castle into attack", "r3k2r/8/8/8/8/8/6q1/R3K2R w KQkq -", 1),
                ("black castles through attack", "r3k2r/8/8/8/8/8/8/R2QK2R b KQkq -", 1),
                ("en passant uncovers a rank attack", "8/8/8/K2pP2r/8/8/8/7k w - d6", 1),
                ("en passant", "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6", 1),
                ("pawn loaded off its home rank", "4k3/8/8/8/8/4P3/8/4K3 w - -", 1),
                ("fool's mate", "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq -", 1),
                ("back-rank mate", "6k1/5ppp/8/8/8/8/8/R5K1 w - -", 2),
                ("stalemate 1", "7k/5Q2/6K1/8/8/8/8/8 b - -", 1),
                ("stalemate 2", "k7/2Q5/1K6/8/8/8/8/8 b - -", 1),
                ("stalemate 3", "8/8/8/8/8/5k2/5p2/5K2 w - -", 1),
                ("kings only", "8/8/4k3/8/8/4K3/8/8 w - -", 1),
                ("king takes the last piece", "8/8/4k3/8/8/4K3/4r3/8 w - -", 1),
                ("king and bishop", "8/8/4k3/8/8/4KB2/8/8 b - -", 1),
                ("promotion", "8/P6k/8/8/8/8/6Kp/8 w - -", 2),
                ("promotion with capture", "1n5k/P7/8/8/8/8/8/7K w - -", 1),
            };
            foreach (var (name, fen, depth) in named)
            {
                var entries = new Dictionary<string, Entry>();
                var perft = new long[depth + 1];
                perft[0] = 1;
                string root = Table.FromFen(fen);
                Explore(t, root, depth, entries, perft, 0);
                suites.Add(new { name, fen, root, depth, perft, positions = entries });
                Console.Error.WriteLine($"{name}: perft {string.Join(", ", perft.Skip(1))}; {entries.Count} positions");
            }

            var vectors = new
            {
                source = "EmyChess 428aae7 (Packages/com.emymin.emychess/Runtime/Scripts), compiled with dotnet " + Environment.Version + " against portkit's stand-ins",
                format = "position: 64 squares (a1, a2, ... h8; FEN letters, '.' empty) | side | 64 has-moved flags | en passant pawn's square index or -; move: <from><to>[promotion]:<pieces captured>:<game over state>:<winner w|b|->:<fnv1a-32 of the position after>",
                stateBytes = StateBytes(),
                captureFeasible = CaptureFeasible(t),
                dropMapping = DropMapping(t),
                placerMapping = PlacerMapping(t),
                timeStrings = TimeStrings(t),
                suites,
            };
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));
            File.WriteAllText(output, JsonSerializer.Serialize(vectors, new JsonSerializerOptions { IncludeFields = true }));
            Console.Error.WriteLine($"wrote {output} in {(DateTime.UtcNow - started).TotalSeconds:F1} s");
            return 0;
        }
    }
}
