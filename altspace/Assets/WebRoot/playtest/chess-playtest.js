// Rung 3 and 4: the chess table in editor Play mode, driven through the SDK's desktop player with the port kit's input
// (InputSim: a mouse of the test's own; the SDK casts its own rays and raises click, grab and drop itself), and checked
// in Unity with the kit's probe command. Not part of the snippet: the test page loads it before the snippet.
//
// window.__chessPlan: "single" (one player holds both sides and plays fool's mate) or "multi" (two Local Multiplayer
// players; the main editor takes White, Player 2 Black; late join by reload).
(function () {
  "use strict";
  const KEY = "chess-table:0";
  const HOLDER = "pk1:chess-table:0";
  const say = (kind, what, detail) => console.log("PKTEST " + kind + " " + what + (detail !== undefined ? ": " + detail : ""));
  let passed = 0;
  let failed = 0;
  const check = (ok, what, detail) => {
    if (ok) passed++;
    else failed++;
    say(ok ? "PASS" : "FAIL", what, detail);
    return ok;
  };
  const replies = new Map();
  let count = 0;
  window.__pktest = Object.assign(window.__pktest || {}, {
    reply(id, text) {
      const resolve = replies.get(id);
      if (resolve) {
        replies.delete(id);
        resolve(text);
      }
    },
  });
  const cmd = (line, ms) =>
    new Promise((resolve) => {
      const id = "k" + ++count;
      replies.set(id, resolve);
      console.log("PKTEST CMD " + id + " " + line);
      setTimeout(() => {
        if (replies.delete(id)) resolve("error: no reply");
      }, ms || 30000);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms, step) {
    const end = Date.now() + ms;
    for (;;) {
      let value = false;
      try {
        value = test();
      } catch (e) {
        value = false;
      }
      if (value) return value;
      if (Date.now() > end) return false;
      await sleep(step || 100);
    }
  }
  const debug = () => window.__pk1 && window.__pk1.debug && window.__pk1.debug[KEY];
  const table = () => debug().table();
  const fen = () => debug().fen();
  const probe = (what, path, extra) => cmd("probe " + HOLDER + " " + what + " " + path.replace(/ /g, "%20") + (extra ? " " + extra : ""));
  const add = (p, dy) => {
    const v = p.split(" ").map(Number);
    return v[0] + " " + (v[1] + dy) + " " + v[2];
  };

  async function clickObject(key, what) {
    const path = debug().pathOf(key);
    const pos = await probe("pos", path);
    await cmd("look " + pos);
    const r = await cmd("click " + pos);
    say("INFO", "click " + what, r);
    return r.startsWith("ok");
  }

  /** Listens to a kit object's own page events (grab, drop, click), as raw as the page has them. */
  const rawSeen = [];
  const t0 = Date.now();
  const stamp = () => "@" + (Date.now() - t0);
  function listenRaw(path) {
    try {
      const name = path.slice(path.lastIndexOf("/") + 1);
      const scene = window.BS.Scene.GetInstance();
      const go = Object.values(scene.objects).find((o) => o.name === name && !o.destroyed);
      if (!go) return "not known to the page";
      if (!go.__chessRaw) {
        go.__chessRaw = true;
        for (const kind of ["grab", "drop", "click"]) go.On(kind, () => rawSeen.push(kind + " " + name + " @" + (Date.now() - t0)));
      }
      return "listening (layer " + go.layer + ")";
    } catch (e) {
      return "error " + e;
    }
  }

  /** Where to point at a piece: a little above its foot (a pointer aimed at the foot meets the piece in front first). */
  async function pieceAim(square) {
    const p = (await probe("pos", debug().piecePath(square))).split(" ").map(Number);
    const s = (await probe("pos", debug().squarePath(square))).split(" ").map(Number);
    // the collider's centre is half way up the piece: aim at four fifths of its height
    const y = s[1] + 1.6 * Math.max(p[1] - s[1], 0.02);
    return p[0] + " " + y + " " + p[2];
  }

  /** A move through the desktop grab: press on the piece, carry it over the target square, let go. */
  async function grabMove(uci, label) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const before = fen();
    const piecePos = await pieceAim(from);
    say("INFO", label + " raw", listenRaw(debug().piecePath(from)));
    const fromSquare = await probe("pos", debug().squarePath(from));
    const toSquare = await probe("pos", debug().squarePath(to));
    // aim at the target square at the height the piece is held by (the held piece keeps its distance along the ray)
    const lift = Number(piecePos.split(" ")[1]) - Number(fromSquare.split(" ")[1]);
    await cmd("look " + toSquare);
    say("INFO", label + " press " + stamp());
    const pressed = await cmd("press " + piecePos);
    await cmd("wait 20");
    say("INFO", label + " carry " + stamp());
    const moved = await cmd("pointer " + add(toSquare, lift));
    await cmd("wait 20");
    say("INFO", label + " held at " + (await probe("pos", debug().piecePath(from))) + " " + stamp());
    await cmd("release");
    say("INFO", label + " released " + stamp());
    await until(() => fen() !== before, 3000);
    say("INFO", label + " raw events", JSON.stringify(rawSeen.splice(0)));
    say("INFO", label + " trace", JSON.stringify(debug().trace().slice(-4)) + " frame a1 " + debug().frame());
    if (fen() === before && table().chosen !== null) {
      // the grab let go at once (the first grab of a Play session does, RESULTS.md S6) or where it was: the piece is
      // chosen, and a click on the square finishes the move (click-to-move)
      say("INFO", label + ": the piece came down on its own square and is chosen; finishing by clicking " + to);
      await cmd("click " + toSquare);
      await until(() => fen() !== before, 3000);
    }
    say("INFO", label + " (grab)", "press " + pressed + "; carry " + moved);
    return fen() !== before;
  }

  /** Click-to-move: click the piece (on the Grabbable layer a click is a grab let go in place: it chooses), then the square. */
  async function clickMove(uci, label) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const before = fen();
    const piecePos = await pieceAim(from);
    await cmd("look " + piecePos);
    say("INFO", label + " click piece", await cmd("click " + piecePos) + " raw " + listenRaw(debug().piecePath(from)));
    let chosen = await until(() => table().chosen === from, 3000);
    if (!chosen) {
      // seen in Play mode: a quick click on a piece on the Grabbable layer sometimes reaches the page as nothing at all;
      // a player then holds the button a moment and lets go in place, which chooses the piece
      say("INFO", label + ": the quick click on " + from + " registered nothing; holding it and letting go in place");
      await cmd("press " + piecePos);
      await cmd("wait 20");
      await cmd("release");
      chosen = await until(() => table().chosen === from, 3000);
    }
    const targetPos = debug().piecePath(to) ? await pieceAim(to) : await probe("pos", debug().squarePath(to));
    await cmd("click " + targetPos);
    await until(() => fen() !== before, 3000);
    say("INFO", label + " (click)", "chosen " + !!chosen + "; trace " + JSON.stringify(debug().trace().slice(-4)));
    return fen() !== before;
  }

  async function waitStarted(inGame) {
    const ok = await until(() => debug() && debug().table, 120000, 250);
    check(!!ok, "the kit loads from a hand-written bs-snippet and the instance starts", ok ? "" : "no debug hooks after 120 s");
    if (!ok) return false;
    const exists = await probe("exists", ".");
    const pieces = await probe("active", debug().pathOf("pawn0"));
    const menu = await probe("active", debug().pathOf("mainMenu"));
    if (inGame) check(exists === "True", "the kit is in the scene again", `holder ${exists}, pawn0 active ${pieces}, main menu ${menu}`);
    else check(exists === "True" && pieces === "False" && menu === "True", "the kit is in the scene: pieces in their pools, the main menu showing", `holder ${exists}, pawn0 active ${pieces}, main menu ${menu}`);
    return true;
  }

  async function single() {
    if (!(await waitStarted())) return;
    await sleep(3000); // the referee's first write (a fresh table's settings)
    const t0 = table();
    check(t0.automatedTimer === true && Math.abs(t0.clock.white - 600) < 0.01, "a fresh table takes the element's settings", `auto-timer ${t0.automatedTimer}, clock ${t0.clock.white}`);

    // one player may hold both sides (F7): Join White, Join Black, Start Game, through the panel's buttons
    await clickObject("whiteJoin", "Join White");
    await until(() => table().white !== null, 4000);
    await clickObject("blackJoin", "Join Black");
    await until(() => table().black !== null, 4000);
    check(table().white !== null && table().black !== null, "Join White and Join Black reach the script (UI colliders, real mouse)", `white ${table().white}, black ${table().black}`);
    const label = await probe("text", debug().pathOf("whitePlayerLabel"));
    check(label === table().white, "the panel's name text reached Unity (relay op text)", label);
    await clickObject("startButton", "Start Game");
    await until(() => table().inProgress && fen() === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", 6000);
    check(fen() === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", "Start Game sets up the 32 pieces", fen());
    const e2 = await probe("pos", debug().squarePath("e2"));
    const e2piece = await probe("pos", debug().piecePath("e2"));
    const d = e2.split(" ").map(Number);
    const p = e2piece.split(" ").map(Number);
    check(Math.hypot(d[0] - p[0], d[2] - p[2]) < 0.01, "the e2 pawn stands on e2 (positions read back from Unity)", `square ${e2}, piece ${e2piece}`);
    check((await probe("layer", debug().piecePath("e2"))) === "20" && (await probe("layer", debug().piecePath("e7"))) === "5",
      "White's pieces are on the Grabbable layer, Black's on the UI layer", "");
    const clockRunning = table().clock.running && table().clock.whiteRunning;
    check(clockRunning, "the automated clock starts with White's time", JSON.stringify(table().clock));

    // fool's mate: grab, grab, click, grab
    const plan = [
      ["f2f3", grabMove],
      ["e7e5", grabMove],
      ["g2g4", clickMove],
      ["d8h4", grabMove],
    ];
    const expect = ["rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR", "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR", "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR", "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR"];
    for (let i = 0; i < plan.length; i++) {
      const [uci, how] = plan[i];
      const ok = await how(uci, uci);
      check(ok && fen() === expect[i], `${uci} is played (${how === grabMove ? "grabbed and let go (in place, then the square clicked: see TESTS.md)" : "click a piece, click a square"})`, fen());
      await sleep(800);
    }
    await until(() => table().gameOver !== 0, 5000);
    const t = table();
    check(t.gameOver === 1 && t.winnerWhite === false, "fool's mate is checkmate, Black wins", `state ${t.gameOver}`);
    const banner = await probe("text", debug().pathOf("gameOverText"));
    check(banner === "CHECKMATE! Winner: " + t.black, "the banner's text reached Unity", banner);
    check((await probe("active", debug().pathOf("gameOver"))) === "True", "the banner shows", "");
    const red = await probe("color", debug().squarePath("e1"), "_BaseColor");
    check(red === "1.000 0.000 0.000 0.600", "the checked king's square is red (D3 fixed)", red);
    check((await probe("layer", debug().piecePath("e2"))) === "5", "nothing can be picked up after the result (D9)", "");
    const moves = await probe("text", debug().pathOf("movesCounter"));
    check(moves === "005", "the clock switched at every move: MOVES 005", moves);
    const a = await probe("text", debug().pathOf("rightTimer"));
    const am = await probe("text", debug().pathOf("rightMilliseconds"));
    await sleep(1500);
    const b = await probe("text", debug().pathOf("rightTimer"));
    const bm = await probe("text", debug().pathOf("rightMilliseconds"));
    check(a + am === b + bm && /^00:0[89]:\d\d$/.test(a), "the clock is frozen at the result and shows HH:MM:SS (LCD digits)", `${a} ${am}, then ${b} ${bm}`);
    await cmd("shot mate 0.35 1.05 0.1 0 0.47 0.75 60");

    // End Game clears the board
    await clickObject("endGame", "End Game");
    await until(() => !table().inProgress, 4000);
    let pawn0 = "";
    for (let i = 0; i < 20 && pawn0 !== "False"; i++) {
      pawn0 = await probe("active", debug().pathOf("pawn0"));
      if (pawn0 !== "False") await sleep(150);
    }
    check(!table().inProgress && fen() === "8/8/8/8/8/8/8/8" && pawn0 === "False", "End Game clears the board (the pieces are switched off in Unity)", `${fen()}, pawn0 active ${pawn0}`);
    // the credits panel opens and closes for this viewer
    await clickObject("creditsButton", "Credits");
    const open = await probe("active", debug().pathOf("creditsPanel"));
    await clickObject("creditsPanel", "the credits panel");
    const closed = await probe("active", debug().pathOf("creditsPanel"));
    check(open === "True" && closed === "False", "the credits panel opens and closes", `${open}, ${closed}`);
  }

  // ---- two players -------------------------------------------------------------------------------------------
  // Both pages run this. The page whose session id sorts first plays White, the other Black. They follow each other
  // through the table's own state; checkpoints (each page's state digest) go between them as one-shots, which the
  // runtime ignores (not its envelope). Black reloads its page after the fourth move and must come back to the same game.
  const PLY = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"];
  const AFTER = [
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R",
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R",
  ];
  const heard = [];
  function channel() {
    const scene = window.BS.Scene.GetInstance();
    scene.On("one-shot", (e) => {
      const data = e && e.detail && e.detail.data;
      if (typeof data !== "string" || data.indexOf("chessTest") < 0) return;
      try {
        heard.push(JSON.parse(data));
      } catch (x) {
        /* not ours */
      }
    });
    return (message) => scene.OneShot(JSON.stringify(Object.assign({ chessTest: 1 }, message)));
  }
  const reloaded = () => {
    try {
      return sessionStorage.getItem("chessTestReloaded") === "1";
    } catch (e) {
      return false;
    }
  };

  async function multi() {
    if (!(await waitStarted(reloaded()))) return;
    const send = channel();
    const two = await until(() => debug().players().length >= 2, 90000, 500);
    check(!!two, "two players in the room", JSON.stringify(debug().players()));
    if (!two) return;
    await sleep(3000);
    const me = debug().me();
    const back = reloaded();
    // White: the player who is not coming back from a reload, and whose session sorts first otherwise
    const others = debug().players().filter((p) => p.sid !== me.sid);
    const white = back ? false : me.sid < others[0].sid;
    say("INFO", (white ? "White" : "Black") + " is " + me.name + (back ? " (back after a reload)" : ""));
    const mine = (i) => (i % 2 === 0) === white;
    let start = 0;
    if (!back) {
      if (white) {
        await clickObject("whiteJoin", "Join White");
        await until(() => table().black !== null, 60000, 250);
        await clickObject("startButton", "Start Game");
      } else {
        await until(() => table().white !== null, 60000, 250);
        await clickObject("blackJoin", "Join Black");
      }
      const started = await until(() => table().inProgress && table().white && table().black, 60000, 250);
      check(!!started && table().white !== table().black, "one player holds White, the other Black, and the game starts", `white ${table().white}, black ${table().black}`);
      if (!white) {
        // a bystander to White's move: White's pieces are not grabbable here, and a click on one does nothing
        const layer = await probe("layer", debug().piecePath("e2"));
        const pos = await probe("pos", debug().piecePath("e2"));
        await cmd("look " + pos);
        await cmd("press " + pos);
        await cmd("wait 10");
        await cmd("release");
        await sleep(1500);
        check(layer === "5" && fen() === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" && table().chosen === null, "Black cannot pick up or choose White's pieces", `layer ${layer}, ${fen()}`);
      }
    } else {
      // after the reload: the same game, the same side (a side is a user id), the same digest as White's
      const rejoined = await until(() => table().inProgress && fen() === AFTER[3], 30000, 250);
      check(!!rejoined, "after reloading its page Black sees the position (late join)", fen());
      check(table().black === me.name, "Black is still Black after the reload (sides are user ids)", `${table().black} / ${me.name}`);
      send({ kind: "back", digest: debug().digest() });
      start = 4;
    }
    for (let i = start; i < PLY.length; i++) {
      if (mine(i)) {
        await until(() => fen() === (i === 0 ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" : AFTER[i - 1]) && table().whiteToMove === white, 60000, 250);
        await sleep(500);
        const ok = i % 4 < 2 ? await grabMove(PLY[i], PLY[i]) : await clickMove(PLY[i], PLY[i]);
        check(ok && fen() === AFTER[i], `${PLY[i]} played by ${white ? "White" : "Black"}`, fen());
      } else {
        const seen = await until(() => fen() === AFTER[i], 60000, 250);
        check(!!seen, `${PLY[i]} arrives at the other player`, fen());
        await sleep(1000);
        send({ kind: "digest", ply: i, digest: debug().digest() });
      }
      if (i === 3 && !white && !back) {
        // Black leaves the page and comes back
        await until(() => heard.some((m) => m.kind === "digest" && m.ply === 3), 10000, 100);
        try {
          sessionStorage.setItem("chessTestReloaded", "1");
        } catch (e) {
          /* no storage: the reload test cannot run */
        }
        say("INFO", "Black reloads its page");
        await sleep(500);
        location.reload();
        await sleep(60000);
        return;
      }
      if (i === 3 && white) {
        const back = await until(() => heard.find((m) => m.kind === "back"), 90000, 250);
        check(!!back && back.digest === debug().digest(), "Black's page, reloaded, holds the same state as White's (digest)", back ? `${back.digest} / ${debug().digest()}` : "no word from Black");
      }
    }
    await sleep(1500);
    const last = PLY.length - 1;
    if (mine(last)) {
      const theirs = await until(() => heard.find((m) => m.kind === "digest" && m.ply === last), 20000, 250);
      check(!!theirs && theirs.digest === debug().digest(), "both pages reach the same state digest after the last move", theirs ? `${theirs.digest} / ${debug().digest()}` : "no digest heard");
    }
    try {
      sessionStorage.removeItem("chessTestReloaded");
    } catch (e) {
      /* nothing */
    }
  }

  window.__chessRun = async function (plan) {
    try {
      if (plan === "single") await single();
      else if (plan === "multi") await multi();
    } catch (e) {
      check(false, "the test ran to its end", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
    }
    say("INFO", "page result " + passed + " passed, " + failed + " failed");
    console.log("PKTEST DONE");
  };
  if (window.__chessPlan) window.__chessRun(window.__chessPlan);
})();
