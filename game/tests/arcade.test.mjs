import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../src/core/store.mjs";
import { drop, winningLine, chooseColumn } from "../src/core/arcade.mjs";
import { makeServer } from "../src/server.mjs";
import { installGameCore } from "../adapters/game-core-adapter.mjs";
import { removeTestDirectory } from "./helpers.mjs";
const alice = { id: "test-alice", verifiedQQ: "999990001" },
  bob = { id: "test-bob" };
let seq = 0;
const act = (a, who, body) =>
  a.act({ requestId: `arcade-request-${++seq}`, ...body }, who);
const finishGame = (a, actor, m) =>
  act(a, actor, { op: "resign", id: m.id, version: m.version }).match;
test("archives keep private reviews for their owner, publish only completed opt-in boards and revoke sharing", () => {
  const s = new Store(),
    a = s.arcade;
  a.reviewAvailable = true;
  try {
    assert.throws(
      () => act(a, alice, { op: "create", kind: "rps" }),
      /没有这个游戏/,
    );
    let m = act(a, alice, {
      op: "create",
      kind: "connect4",
      shared: false,
    }).match;
    assert.throws(() => a.view(m.id, bob), /没有公开/);
    m = finishGame(a, alice, m);
    m = act(a, alice, { op: "review", id: m.id, version: m.version }).match;
    a.finishReview(m.id, "这盘收得早。下次再慢慢下。");
    assert.equal(
      a.lobby(alice, { scope: "mine" }).records[0].review.status,
      "ready",
    );
    assert.equal(a.lobby(bob).records.length, 0);
    m = a.view(m.id, alice).match;
    m = act(a, alice, {
      op: "share",
      id: m.id,
      version: m.version,
      shared: true,
      nickname: "小云",
    }).match;
    const publicRecord = a.lobby(bob).records[0];
    assert.equal(publicRecord.id, m.id);
    assert.equal(publicRecord.review.text, "这盘收得早。下次再慢慢下。");
    assert.equal(publicRecord.own, false);
    assert.equal(a.lobby(bob, { scope: "mine" }).records.length, 0);
    for (const op of ["move", "share", "resign", "review"])
      assert.throws(
        () => act(a, bob, { op, id: m.id, version: m.version, column: 0 }),
        /自己的对局/,
      );
    assert.ok(!JSON.stringify(publicRecord).includes(alice.verifiedQQ));
    assert.ok(!JSON.stringify(publicRecord).includes(a.owner(alice)));
    m = act(a, alice, {
      op: "share",
      id: m.id,
      version: m.version,
      shared: false,
    }).match;
    assert.equal(a.lobby(bob).records.length, 0);
    assert.throws(() => a.view(m.id, bob), /没有公开/);
    const active = act(a, alice, {
      op: "create",
      kind: "connect4",
      shared: true,
    }).match;
    assert.equal(a.lobby(bob).records.length, 0);
    assert.throws(() => a.view(active.id, bob), /没有公开/);
  } finally {
    s.close();
  }
});
test("archives paginate and old completed reviews remain reachable after restart and a new match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-records-")),
    file = path.join(dir, "world.db");
  let now = Date.now(),
    s = new Store(file, () => now),
    first;
  try {
    for (let i = 0; i < 23; i++) {
      now += 3600001;
      let m = act(s.arcade, alice, {
        op: "create",
        kind: "connect4",
        shared: true,
      }).match;
      m = finishGame(s.arcade, alice, m);
      if (i === 0) {
        first = m.id;
        s.arcade.reviewAvailable = true;
        m = act(s.arcade, alice, {
          op: "review",
          id: m.id,
          version: m.version,
        }).match;
        s.arcade.finishReview(m.id, "旧局的复盘还在。");
      }
    }
    s.close();
    s = new Store(file, () => now);
    act(s.arcade, alice, { op: "create", kind: "connect4" });
    const one = s.arcade.lobby(alice, { scope: "mine", page: 0 }),
      two = s.arcade.lobby(alice, { scope: "mine", page: 1 });
    assert.equal(one.records.length, 20);
    assert.equal(one.hasMore, true);
    assert.equal(two.records.length, 3);
    assert.equal(two.hasMore, false);
    assert.equal(
      new Set([...one.records, ...two.records].map((m) => m.id)).size,
      23,
    );
    assert.equal(
      s.arcade.view(first, alice).match.review.text,
      "旧局的复盘还在。",
    );
    assert.equal(
      s.arcade.view(first, bob).match.review.text,
      "旧局的复盘还在。",
    );
  } finally {
    s.close();
    removeTestDirectory(dir);
  }
});
test("thinking persists, hides future moves, prevents extra input and resolves only once after restart", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-thinking-")),
    file = path.join(dir, "world.db");
  let now = Date.now(),
    s = new Store(file, () => now);
  try {
    s.arcade.thinkingDelay = () => 3000;
    let m = act(s.arcade, alice, {
      op: "create",
      kind: "connect4",
      shared: true,
    }).match;
    const request = {
      op: "move",
      id: m.id,
      version: m.version,
      column: 3,
      requestId: "thinking-dedupe-001",
    };
    m = s.arcade.act(request, alice).match;
    assert.equal(m.thinkingUntil, now + 3000);
    assert.equal(m.moves.length, 1);
    assert.throws(() => s.arcade.view(m.id, bob), /没有公开/);
    assert.deepEqual(s.arcade.act(request, alice).match, m);
    const deadline = m.thinkingUntil;
    s.close();
    s = new Store(file, () => now);
    now = deadline - 1;
    assert.equal(
      s.arcade.view(m.id, alice).match.board.filter(Boolean).length,
      1,
    );
    now = deadline;
    const done = s.arcade.view(m.id, alice).match;
    assert.equal(done.board.filter(Boolean).length, 2);
    assert.equal(done.turn, "player");
    assert.ok(done.version > m.version);
    s.arcade.settleDue();
    assert.deepEqual(s.arcade.view(m.id, alice).match, done);
    m = act(s.arcade, alice, {
      op: "move",
      id: m.id,
      version: done.version,
      column: 4,
    }).match;
    m = act(s.arcade, alice, {
      op: "resign",
      id: m.id,
      version: m.version,
    }).match;
    now += 10000;
    s.arcade.settleDue();
    assert.equal(s.arcade.view(m.id, alice).match.moves.length, 3);
    assert.equal(s.arcade.view(m.id, alice).match.status, "finished");
  } finally {
    s.close();
    removeTestDirectory(dir);
  }
});
test("failed reviews can be retried with a new job, duplicates cannot multiply requests, and interrupted reviews expire safely", () => {
  let now = Date.now();
  const s = new Store(":memory:", () => now),
    a = s.arcade;
  a.reviewAvailable = true;
  try {
    let m = act(a, alice, { op: "create", kind: "connect4" }).match;
    m = finishGame(a, alice, m);
    m = act(a, alice, { op: "review", id: m.id, version: m.version }).match;
    s.db
      .prepare(
        "UPDATE outbox SET status='attempted',started=? WHERE kind='arcade-review'",
      )
      .run(now);
    now += 11 * 60000;
    a.expire();
    m = a.view(m.id, alice).match;
    assert.equal(m.review.status, "failed");
    assert.equal(m.review.attempt, 1);
    m = act(a, alice, { op: "review", id: m.id, version: m.version }).match;
    assert.equal(m.review.status, "pending");
    assert.equal(m.review.attempt, 2);
    assert.equal(
      s.db
        .prepare("SELECT count(*) n FROM outbox WHERE kind='arcade-review'")
        .get().n,
      2,
    );
    a.finishReview(m.id, "这盘你赢了。");
    assert.equal(a.view(m.id, alice).match.review.status, "ready");
  } finally {
    s.close();
  }
});
test("four-in-a-row detects all directions; gravity, immediate win and blocking remain correct at both levels", () => {
  for (const cells of [
    [35, 36, 37, 38],
    [14, 21, 28, 35],
    [14, 22, 30, 38],
    [35, 29, 23, 17],
  ]) {
    const b = Array(42).fill(0);
    for (const i of cells) b[i] = 2;
    assert.equal(winningLine(b).length, 4);
  }
  let b = Array(42).fill(0);
  for (const c of [0, 1, 2]) b = drop(b, c, 2).board;
  assert.equal(chooseColumn(b, "normal"), 3);
  assert.equal(chooseColumn(b, "serious"), 3);
  b = Array(42).fill(0);
  for (const c of [0, 1, 2]) b = drop(b, c, 1).board;
  assert.equal(chooseColumn(b, "normal"), 3);
  for (let i = 0; i < 6; i++) b = drop(b, 6, 1).board;
  assert.throws(() => drop(b, 6, 2), /满了/);
  assert.throws(() => drop(b, -1, 2), /选一列/);
  let now = Date.now();
  const s = new Store(":memory:", () => now);
  try {
    let m = act(s.arcade, alice, { op: "create", kind: "connect4" }).match;
    const old = m.version;
    m = act(s.arcade, alice, {
      op: "move",
      id: m.id,
      version: m.version,
      column: 3,
    }).match;
    assert.equal(m.board.filter(Boolean).length, 1);
    assert.equal(m.turn, "fish");
    assert.throws(
      () =>
        act(s.arcade, alice, {
          op: "move",
          id: m.id,
          version: m.version,
          column: 4,
        }),
      /等她/,
    );
    now = m.thinkingUntil + 1;
    m = s.arcade.view(m.id, alice).match;
    assert.equal(m.board.filter(Boolean).length, 2);
    assert.equal(m.turn, "player");
    assert.equal(m.board[38], 1);
    assert.throws(
      () =>
        act(s.arcade, alice, { op: "move", id: m.id, version: old, column: 4 }),
      /更新/,
    );
  } finally {
    s.close();
  }
});
test("board, QQ statistics and completed personal experiences survive restart; inactivity cannot reopen an expired match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-arcade-")),
    file = path.join(dir, "world.db");
  let now = 1000000000000,
    s = new Store(file, () => now);
  try {
    let m = act(s.arcade, alice, { op: "create", kind: "connect4" }).match;
    const locked = m.board;
    s.close();
    s = new Store(file, () => now);
    assert.deepEqual(s.arcade.lobby(alice).mine.board, locked);
    m = finishGame(s.arcade, alice, m);
    assert.equal(s.arcade.personal().byQQ[alice.verifiedQQ].length, 1);
    m = act(s.arcade, alice, { op: "create", kind: "connect4" }).match;
    now += 31 * 60000;
    s.arcade.lobby(alice);
    act(s.arcade, alice, {
      op: "share",
      id: m.id,
      version: m.version,
      shared: true,
    });
    assert.equal(s.arcade.row(m.id).status, "expired");
    assert.throws(() => s.arcade.view(m.id, bob), /没有公开/);
    assert.equal(s.arcade.lobby(alice).stats.played, 1);
  } finally {
    s.close();
    removeTestDirectory(dir);
  }
});
test("arcade HTTP authenticates owners, rejects cross-site actions, ignores supplied QQ and hides internal review endpoints", async () => {
  const s = new Store(),
    { server } = makeServer(
      { allowedOrigins: ["http://arcade.test"] },
      { store: s },
    );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    post = (route, body = {}, cookie = "", origin = "http://arcade.test") =>
      fetch(base + "/api/room-" + route, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin },
        body: JSON.stringify(body),
      });
  try {
    assert.equal((await post("arcade")).status, 401);
    const cookies = [];
    for (let i = 0; i < 2; i++)
      cookies.push(
        (await post("enter")).headers.get("set-cookie").split(";")[0],
      );
    const created = await (
      await post(
        "arcade-action",
        {
          op: "create",
          kind: "connect4",
          requestId: "http-arcade-create",
          verifiedQQ: alice.verifiedQQ,
        },
        cookies[0],
      )
    ).json();
    assert.equal(created.ok, true);
    assert.equal(
      (
        await post(
          "arcade-action",
          {
            op: "move",
            id: created.match.id,
            version: 1,
            choice: 0,
            requestId: "http-arcade-forged",
          },
          cookies[1],
        )
      ).status,
      400,
    );
    assert.equal(
      (await post("arcade", {}, cookies[0], "http://evil.test")).status,
      403,
    );
    assert.equal(
      s.db.prepare("SELECT count(*) n FROM arcade_players").get().n,
      0,
    );
    assert.equal(
      (
        await fetch(base + "/internal/arcade/review-job", {
          method: "POST",
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (await (await post("arcade", {}, cookies[1])).json()).mine,
      null,
    );
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
});
test("model review waits for QQ idle, is requested once, and verified personal context does not reach guests", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-arcade-review-"));
  fs.mkdirSync(path.join(dir, "state"));
  const store = new Store(),
    secret = "arcade-test-adapter-".repeat(3),
    { server } = makeServer({ adapterSecret: secret }, { store });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  store.arcade.reviewAvailable = true;
  fs.writeFileSync(
    path.join(dir, "state/game-core-link.json"),
    JSON.stringify({
      enabled: true,
      url: "http://127.0.0.1:" + server.address().port,
      secret,
    }),
  );
  const room = {
    data: { visitors: {}, histories: {} },
    roomState: () => ({ room: {} }),
    context: async (qq) => (qq ? "verified context" : "guest context"),
  };
  const core = installGameCore(room, { root: dir });
  try {
    let m = act(store.arcade, alice, { op: "create", kind: "connect4" }).match;
    m = finishGame(store.arcade, alice, m);
    m = act(store.arcade, alice, {
      op: "review",
      id: m.id,
      version: m.version,
    }).match;
    act(store.arcade, alice, { op: "review", id: m.id, version: m.version });
    assert.equal(
      store.db
        .prepare("SELECT count(*) n FROM outbox WHERE kind='arcade-review'")
        .get().n,
      1,
    );
    let calls = 0,
      busy = true;
    const options = {
      isBusy: () => busy,
      generate: async (messages) => {
        calls++;
        assert.ok(!JSON.stringify(messages).includes(alice.verifiedQQ));
        return "你刚才连赢两轮，这盘是你拿下了。";
      },
    };
    await core.tick(options);
    assert.equal(calls, 0);
    busy = false;
    await core.tick(options);
    assert.equal(calls, 1);
    const v = store.arcade.view(m.id, alice).match;
    assert.equal(v.review.status, "ready");
    await core.refresh();
    assert.ok((await room.context(alice.verifiedQQ)).includes("小屋对局"));
    assert.ok(!(await room.context("")).includes("对方获胜"));
    assert.ok(
      room
        .personalRecent(alice.verifiedQQ)
        .some((x) => x.text.includes("四子棋")),
    );
    assert.ok(!JSON.stringify(store.snapshot()).includes(alice.verifiedQQ));
  } finally {
    core.stop();
    await new Promise((r) => server.close(r));
    store.close();
    removeTestDirectory(dir);
  }
});

test("removed game is retired on restart without deleting its save or blocking a new connect4 match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-retired-")),
    file = path.join(dir, "world.db");
  let s = new Store(file);
  try {
    const m = act(s.arcade, alice, { op: "create", kind: "connect4" }).match;
    const old = JSON.parse(s.arcade.row(m.id).json);
    old.kind = "rps";
    s.db
      .prepare("UPDATE arcade_matches SET kind='rps',json=? WHERE id=?")
      .run(JSON.stringify(old), m.id);
    s.close();
    s = new Store(file);
    assert.equal(s.arcade.row(m.id).status, "expired");
    assert.equal(s.arcade.lobby(alice).records.length, 0);
    assert.throws(() => s.arcade.view(m.id, alice), /没有公开/);
    assert.equal(
      act(s.arcade, alice, { op: "create", kind: "connect4" }).match.status,
      "active",
    );
  } finally {
    s.close();
    removeTestDirectory(dir);
  }
});
