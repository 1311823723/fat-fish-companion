import crypto from "node:crypto";

const KINDS = new Set(["rps", "connect4"]);
const MOVES = ["石头", "布", "剪刀"];
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const commitment = (id, round, choice, nonce) =>
  hash(`${id}:${round}:${choice}:${nonce}`);
export function drop(board, column, player) {
  if (!Number.isInteger(column) || column < 0 || column > 6)
    throw Error("选一列再落子");
  const next = [...board];
  for (let row = 5; row >= 0; row--)
    if (!next[row * 7 + column]) {
      next[row * 7 + column] = player;
      return { board: next, cell: row * 7 + column };
    }
  throw Error("这一列已经满了");
}
export function winningLine(board) {
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 7; col++) {
      const who = board[row * 7 + col];
      if (!who) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const cells = Array.from(
          { length: 4 },
          (_, i) => (row + dy * i) * 7 + col + dx * i,
        );
        if (row + dy * 3 < 0 || row + dy * 3 > 5 || col + dx * 3 > 6) continue;
        if (cells.every((i) => board[i] === who)) return cells;
      }
    }
  return [];
}
const legal = (board) => ORDER.filter((col) => board[col] === 0);
const WINDOWS = [];
for (let r = 0; r < 6; r++)
  for (let c = 0; c < 7; c++)
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ])
      if (r + dy * 3 >= 0 && r + dy * 3 < 6 && c + dx * 3 < 7)
        WINDOWS.push(
          Array.from({ length: 4 }, (_, i) => (r + dy * i) * 7 + c + dx * i),
        );
function evaluate(board) {
  let value = 0;
  for (const cells of WINDOWS) {
    const fish = cells.filter((i) => board[i] === 2).length,
      human = cells.filter((i) => board[i] === 1).length;
    if (!human) value += [0, 1, 8, 55, 100000][fish];
    if (!fish) value -= [0, 1, 10, 65, 100000][human];
  }
  return value;
}
export function chooseColumn(
  board,
  difficulty = "normal",
  random = Math.random,
) {
  const columns = legal(board);
  if (!columns.length) throw Error("棋盘已经满了");
  for (const player of [2, 1])
    for (const col of columns)
      if (winningLine(drop(board, col, player).board).length) return col;
  let nodes = 0;
  function search(b, depth, player, alpha, beta) {
    const line = winningLine(b);
    if (line.length) return b[line[0]] === 2 ? 100000 + depth : -100000 - depth;
    const next = legal(b);
    if (!next.length) return 0;
    if (depth === 0 || ++nodes > 6500) return evaluate(b);
    let best = player === 2 ? -Infinity : Infinity;
    for (const col of next) {
      const value = search(
        drop(b, col, player).board,
        depth - 1,
        3 - player,
        alpha,
        beta,
      );
      if (player === 2) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, best);
      }
      if (alpha >= beta) break;
    }
    return best;
  }
  const scores = columns
    .map((column) => ({
      column,
      score: search(
        drop(board, column, 2).board,
        difficulty === "serious" ? 4 : 2,
        1,
        -Infinity,
        Infinity,
      ),
    }))
    .sort((a, b) => b.score - a.score);
  const choices =
    difficulty === "serious"
      ? scores.filter((x) => x.score === scores[0].score)
      : scores.filter((x) => x.score >= scores[0].score - 45).slice(0, 3);
  return choices[Math.floor(random() * choices.length) % choices.length].column;
}
const nickname = (value) => {
  const text = String(value || "")
    .replace(/[\x00-\x1f\x7f<>]/g, "")
    .trim();
  if (/\d{5,}/.test(text)) throw Error("观战昵称不要填写QQ号");
  return Array.from(text).slice(0, 12).join("") || "来访的朋友";
};

export class Arcade {
  constructor(store, { reviewAvailable = false, random = Math.random } = {}) {
    this.store = store;
    this.db = store.db;
    this.reviewAvailable = reviewAvailable;
    this.random = random;
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS arcade_matches(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,shared INTEGER NOT NULL DEFAULT 0,nickname TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,json TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS arcade_one_active ON arcade_matches(owner) WHERE status='active';
      CREATE INDEX IF NOT EXISTS arcade_owner_time ON arcade_matches(owner,updated);
      CREATE TABLE IF NOT EXISTS arcade_requests(actor TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,id));
      CREATE TABLE IF NOT EXISTS arcade_players(owner TEXT PRIMARY KEY,qq TEXT NOT NULL);`);
    this.db
      .prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)")
      .run("arcadeIdentityKey", crypto.randomBytes(32).toString("hex"));
    this.secret = this.db
      .prepare("SELECT value FROM meta WHERE key=?")
      .get("arcadeIdentityKey").value;
  }
  owner(actor) {
    return crypto
      .createHmac("sha256", this.secret)
      .update(
        /^\d{5,12}$/.test(String(actor.verifiedQQ || ""))
          ? "qq:" + actor.verifiedQQ
          : "guest:" + actor.id,
      )
      .digest("hex");
  }
  expire() {
    for (const job of this.db
      .prepare(
        "SELECT id,payload FROM outbox WHERE kind='arcade-review' AND status='attempted' AND started<?",
      )
      .all(this.store.clock() - 10 * 60000)) {
      this.finishReview(JSON.parse(job.payload).matchId, "");
      this.store.finish(job.id, "abandoned");
    }
    this.db
      .prepare(
        "UPDATE arcade_matches SET status='expired',shared=0 WHERE status='active' AND updated<?",
      )
      .run(this.store.clock() - 30 * 60000);
  }
  summary() {
    return {
      activeCount: this.db
        .prepare(
          "SELECT count(*) n FROM arcade_matches WHERE status='active' AND updated>?",
        )
        .get(this.store.clock() - 3 * 60000).n,
    };
  }
  row(id) {
    return this.db
      .prepare("SELECT * FROM arcade_matches WHERE id=?")
      .get(String(id || ""));
  }
  public(row, own = false) {
    const m = JSON.parse(row.json);
    const v = {
      id: m.id,
      kind: m.kind,
      difficulty: m.difficulty,
      version: m.version,
      status: row.status,
      shared: !!row.shared,
      nickname: row.nickname,
      round: m.round,
      score: m.score,
      history: m.history,
      board: m.board,
      line: m.line,
      lastCells: m.lastCells,
      result: m.result,
      message: m.message,
      commitment: m.commitment,
      moves: m.moves,
      updatedAt: row.updated,
      own,
    };
    if (own) {
      v.review = m.review;
      v.reviewAvailable = this.reviewAvailable;
    }
    return Object.fromEntries(
      Object.entries(v).filter(([, value]) => value !== undefined),
    );
  }
  stats(owner) {
    const values = this.db
      .prepare(
        "SELECT kind,json FROM arcade_matches WHERE owner=? AND status='finished'",
      )
      .all(owner);
    const stats = { played: values.length, won: 0, lost: 0, drawn: 0 };
    for (const { json } of values) {
      const { result } = JSON.parse(json);
      stats[
        result === "player" ? "won" : result === "fish" ? "lost" : "drawn"
      ]++;
    }
    return stats;
  }
  lobby(actor) {
    this.expire();
    const owner = this.owner(actor);
    const mine = this.db
      .prepare(
        "SELECT * FROM arcade_matches WHERE owner=? ORDER BY status='active' DESC,updated DESC LIMIT 1",
      )
      .get(owner);
    return {
      ok: true,
      mine: mine ? this.public(mine, true) : null,
      stats: this.stats(owner),
      watch: this.db
        .prepare(
          "SELECT * FROM arcade_matches WHERE shared=1 AND status='active' ORDER BY updated DESC LIMIT 20",
        )
        .all()
        .map((row) => this.public(row)),
      reviewAvailable: this.reviewAvailable,
    };
  }
  view(id, actor) {
    this.expire();
    const row = this.row(id),
      own = row?.owner === this.owner(actor);
    if (!row || (!own && (!row.shared || row.status === "expired")))
      throw Error("这局没有开放观战");
    return { ok: true, match: this.public(row, own) };
  }
  seal(m, owner) {
    const previous = this.db
      .prepare(
        "SELECT json FROM arcade_matches WHERE owner=? AND kind='rps' AND id<>? ORDER BY created DESC LIMIT 6",
      )
      .all(owner, m.id)
      .flatMap((row) => JSON.parse(row.json).history || [])
      .concat(m.history || [])
      .slice(-12);
    let choice = Math.floor(this.random() * 3) % 3;
    if (
      previous.length >= 4 &&
      this.random() < (m.difficulty === "serious" ? 0.7 : 0.25)
    ) {
      const counts = [0, 0, 0];
      for (const turn of previous) counts[turn.player]++;
      choice = (counts.indexOf(Math.max(...counts)) + 1) % 3;
    }
    m.secret = { choice, nonce: crypto.randomBytes(24).toString("hex") };
    m.commitment = commitment(m.id, m.round, choice, m.secret.nonce);
  }
  save(row, m) {
    this.db
      .prepare(
        "UPDATE arcade_matches SET status=?,shared=?,nickname=?,updated=?,json=? WHERE id=?",
      )
      .run(
        row.status === "expired" ? "expired" : m.result ? "finished" : "active",
        row.shared ? 1 : 0,
        row.nickname,
        this.store.clock(),
        JSON.stringify(m),
        m.id,
      );
  }
  act(body, actor) {
    if (!/^[\w:-]{10,120}$/.test(body.requestId || ""))
      throw Error("请求编号无效");
    const owner = this.owner(actor),
      payload = JSON.stringify(body);
    this.db.exec("BEGIN IMMEDIATE");
    let result;
    try {
      const old = this.db
        .prepare(
          "SELECT payload,result FROM arcade_requests WHERE actor=? AND id=?",
        )
        .get(owner, body.requestId);
      if (old) {
        if (old.payload !== payload) throw Error("请求编号已被其他操作使用");
        this.db.exec("COMMIT");
        return JSON.parse(old.result);
      }
      this.expire();
      let row, m;
      if (body.op === "create") {
        if (!KINDS.has(body.kind)) throw Error("没有这个游戏");
        const active = this.db
          .prepare(
            "SELECT * FROM arcade_matches WHERE owner=? AND status='active'",
          )
          .get(owner);
        if (active) throw Error("先继续或结束现有对局");
        if (
          this.db
            .prepare(
              "SELECT count(*) n FROM arcade_matches WHERE owner=? AND created>?",
            )
            .get(owner, this.store.clock() - 3600000).n >= 20
        )
          throw Error("先歇一会儿，稍后再开新局");
        m = {
          id: crypto.randomUUID(),
          kind: body.kind,
          version: 1,
          difficulty: body.difficulty === "serious" ? "serious" : "normal",
          round: 1,
          score: { player: 0, fish: 0 },
          history: [],
          moves: [],
          result: null,
          message:
            body.kind === "rps" ? "我选好了，该你了。" : "你先落，我看看。",
        };
        if (m.kind === "rps") this.seal(m, owner);
        else m.board = Array(42).fill(0);
        row = {
          shared: body.shared === true,
          nickname: nickname(body.nickname),
        };
        this.db
          .prepare("INSERT INTO arcade_matches VALUES(?,?,?,?,?,?,?,?,?)")
          .run(
            m.id,
            owner,
            m.kind,
            "active",
            row.shared ? 1 : 0,
            row.nickname,
            this.store.clock(),
            this.store.clock(),
            JSON.stringify(m),
          );
        if (/^\d{5,12}$/.test(String(actor.verifiedQQ || "")))
          this.db
            .prepare("INSERT OR REPLACE INTO arcade_players VALUES(?,?)")
            .run(owner, String(actor.verifiedQQ));
      } else {
        row = this.row(body.id);
        if (!row || row.owner !== owner) throw Error("只能操作自己的对局");
        m = JSON.parse(row.json);
        if (body.version !== m.version) throw Error("棋局已更新，请刷新后再试");
        if (body.op === "share") {
          row.shared = body.shared === true;
          row.nickname = nickname(body.nickname || row.nickname);
        } else if (body.op === "review") {
          if (!this.reviewAvailable) throw Error("复盘服务尚未连接");
          if (row.status !== "finished") throw Error("下完这一局再复盘");
          if (!m.review || m.review.status === "failed") {
            const attempt = (m.review?.attempt || 0) + 1;
            if (attempt > 3) throw Error("这盘先不复盘了，稍后再玩一盘吧");
            m.review = { status: "pending", attempt };
            this.store.enqueue(
              "arcade-review:" + m.id + ":" + attempt,
              "arcade-review",
              {
                matchId: m.id,
              },
            );
          }
        } else {
          if (row.status !== "active") throw Error("这局已经结束");
          if (body.op === "resign") {
            m.result = "fish";
            m.message = "那就先收起来，想玩了再来。";
            m.resigned = true;
          } else if (body.op === "move") {
            if (m.kind === "rps") {
              if (
                !Number.isInteger(body.choice) ||
                body.choice < 0 ||
                body.choice > 2
              )
                throw Error("请选择石头、布或剪刀");
              const fish = m.secret.choice,
                winner =
                  body.choice === fish
                    ? "draw"
                    : (body.choice - fish + 3) % 3 === 1
                      ? "player"
                      : "fish";
              m.history.push({
                round: m.round,
                player: body.choice,
                fish,
                winner,
                nonce: m.secret.nonce,
                commitment: m.commitment,
              });
              if (winner !== "draw") m.score[winner]++;
              delete m.secret;
              delete m.commitment;
              if (
                m.score.player >= 2 ||
                m.score.fish >= 2 ||
                m.history.length >= 30
              )
                m.result =
                  m.score.player === m.score.fish
                    ? "draw"
                    : m.score.player > m.score.fish
                      ? "player"
                      : "fish";
              m.message =
                winner === "draw"
                  ? "又想到一块去了。"
                  : winner === "player"
                    ? "行，这轮你赢了。"
                    : "这轮我拿下了。";
              m.round++;
              if (!m.result) this.seal(m, owner);
            } else {
              const human = drop(m.board, body.column, 1);
              m.board = human.board;
              m.lastCells = [human.cell];
              m.moves.push({ player: 1, column: body.column });
              m.line = winningLine(m.board);
              if (m.line.length) m.result = "player";
              else if (!legal(m.board).length) m.result = "draw";
              else {
                const col = chooseColumn(m.board, m.difficulty, this.random),
                  fish = drop(m.board, col, 2);
                m.board = fish.board;
                m.lastCells.push(fish.cell);
                m.moves.push({ player: 2, column: col });
                m.line = winningLine(m.board);
                if (m.line.length) m.result = "fish";
                else if (!legal(m.board).length) m.result = "draw";
              }
              m.message =
                m.result === "player"
                  ? "你这条线，我刚刚没拦住。"
                  : m.result === "fish"
                    ? "连起来了。这盘归我。"
                    : m.result === "draw"
                      ? "填满了，谁也没占到便宜。"
                      : [
                          "我放好了，轮到你。",
                          "嗯……这边。该你了。",
                          "你慢慢想，我等着。",
                        ][m.moves.length % 3];
            }
            if (m.result === "player") m.message = "这盘算你厉害，我记住了。";
          } else throw Error("操作无效");
        }
        m.version++;
        this.save(row, m);
      }
      result = {
        ok: true,
        match: this.public(this.row(m.id), true),
        stats: this.stats(owner),
      };
      this.db
        .prepare("INSERT INTO arcade_requests VALUES(?,?,?,?)")
        .run(owner, body.requestId, payload, JSON.stringify(result));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.store.emit("change", { arcadeChanged: true });
    return result;
  }
  reviewJob(id) {
    const row = this.row(id),
      m = row && JSON.parse(row.json);
    if (!row || row.status !== "finished" || m.review?.status !== "pending")
      throw Error("没有待复盘的结束对局");
    return {
      kind: m.kind,
      difficulty: m.difficulty,
      result: m.result,
      resigned: !!m.resigned,
      board: m.board,
      moves: m.moves,
      history: m.history?.map(({ player, fish, winner }) => ({
        player: MOVES[player],
        fish: MOVES[fish],
        winner,
      })),
    };
  }
  finishReview(id, text) {
    const row = this.row(id);
    if (!row) return;
    const m = JSON.parse(row.json);
    if (m.review?.status !== "pending") return;
    const clean = String(text || "")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      .trim();
    m.review = clean
      ? {
          ...m.review,
          status: "ready",
          text: Array.from(clean).slice(0, 220).join(""),
        }
      : { ...m.review, status: "failed" };
    m.version++;
    this.save(row, m);
    this.store.emit("change", { arcadeChanged: true });
  }
  personal() {
    const byQQ = {};
    for (const p of this.db
      .prepare("SELECT owner,qq FROM arcade_players")
      .all()) {
      byQQ[p.qq] = this.db
        .prepare(
          "SELECT * FROM arcade_matches WHERE owner=? AND status='finished' ORDER BY updated DESC LIMIT 3",
        )
        .all(p.owner)
        .map((row) => {
          const m = JSON.parse(row.json),
            game = m.kind === "rps" ? "猜拳" : "四子棋";
          return {
            role: "assistant",
            at: row.updated,
            text: `【已确认的小屋对局经历】你与当前这个已验证QQ的人玩了${game}（${m.difficulty === "serious" ? "认真局" : "普通局"}），${m.resigned ? "对方提前收局" : m.result === "player" ? "对方获胜" : m.result === "fish" ? "你获胜" : "平局"}。只将其作为真实共同经历，不编造其他对局。`,
          };
        });
    }
    return { byQQ };
  }
}
