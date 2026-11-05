import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../src/core/store.mjs";
import {
  commitment,
  drop,
  winningLine,
  chooseColumn,
} from "../src/core/arcade.mjs";
import { makeServer } from "../src/server.mjs";
import { installGameCore } from "../adapters/game-core-adapter.mjs";
import { removeTestDirectory } from "./helpers.mjs";
const alice = { id: "test-alice", verifiedQQ: "999990001" },
  bob = { id: "test-bob" };
let seq = 0;
const act = (a, who, body) =>
  a.act({ requestId: `arcade-request-${++seq}`, ...body }, who);
const finishRps = (a, actor, m) => {
  while (m.status === "active") {
    const secret = JSON.parse(a.row(m.id).json).secret;
    m = act(a, actor, {
      op: "move",
      id: m.id,
      version: m.version,
      choice: (secret.choice + 1) % 3,
    }).match;
  }
  return m;
};
test("failed reviews can be retried with a new job, duplicates cannot multiply requests, and interrupted reviews expire safely", () => {
  let now = Date.now();
  const s = new Store(":memory:", () => now),
    a = s.arcade;
  a.reviewAvailable = true;
  try {
    let m = act(a, alice, { op: "create", kind: "rps" }).match;
    m = finishRps(a, alice, m);
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
test("RPS locks a verifiable choice before input; two wins, idempotency and no unrevealed choice in spectator output", () => {
  const s = new Store(),
    a = s.arcade;
  try {
    let m = act(a, alice, {
      op: "create",
      kind: "rps",
      shared: true,
      nickname: "小云",
    }).match;
    const before = a.view(m.id, bob).match;
    assert.equal(before.own, false);
    assert.equal(before.secret, undefined);
    assert.ok(before.commitment);
    assert.ok(!JSON.stringify(before).includes("nonce"));
    const request = {
      requestId: "rps-retry-unique",
      op: "move",
      id: m.id,
      version: m.version,
      choice: 0,
    };
    const one = a.act(request, alice),
      two = a.act(request, alice);
    assert.deepEqual(two, one);
    assert.equal(two.match.history.length, 1);
    const turn = one.match.history[0];
    assert.equal(
      commitment(m.id, turn.round, turn.fish, turn.nonce),
      before.commitment,
    );
    assert.throws(() => a.act({ ...request, choice: 1 }, alice), /请求编号/);
    m = finishRps(a, alice, one.match);
    assert.equal(m.status, "finished");
    assert.ok(m.score.player >= 2 || m.score.fish >= 2);
    assert.equal(a.lobby(alice).stats.played, 1);
  } finally {
    s.close();
  }
});
test("concurrent players have separate matches; QQ is canonical, watch is opt-in, read-only and immediately revoked", () => {
  const s = new Store(),
    a = s.arcade;
  try {
    let m = act(a, alice, { op: "create", kind: "connect4" }).match;
    const other = act(a, bob, { op: "create", kind: "rps" }).match;
    assert.notEqual(m.id, other.id);
    assert.equal(a.lobby(bob).watch.length, 0);
    assert.throws(() => a.view(m.id, bob), /没有开放/);
    assert.equal(a.lobby({ ...alice, id: "different-browser" }).mine.id, m.id);
    assert.throws(
      () => act(a, alice, { op: "create", kind: "rps" }),
      /现有对局/,
    );
    m = act(a, alice, {
      op: "share",
      id: m.id,
      version: m.version,
      shared: true,
      nickname: "小云",
    }).match;
    const viewed = a.view(m.id, bob).match;
    assert.equal(viewed.own, false);
    assert.equal(a.lobby(bob).watch.length, 1);
    for (const op of ["move", "share", "resign", "review"])
      assert.throws(
        () => act(a, bob, { op, id: m.id, version: m.version, column: 3 }),
        /自己的对局/,
      );
    m = act(a, alice, {
      op: "share",
      id: m.id,
      version: m.version,
      shared: false,
    }).match;
    assert.throws(() => a.view(m.id, bob), /没有开放/);
    const text = JSON.stringify(a.lobby(bob));
    assert.ok(!text.includes(alice.verifiedQQ));
    assert.ok(!text.includes(a.owner(alice)));
    const next = act(a, bob, {
      op: "resign",
      id: other.id,
      version: other.version,
    }).match;
    assert.equal(next.status, "finished");
    assert.equal(a.lobby(bob).stats.lost, 1);
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
  const s = new Store();
  try {
    let m = act(s.arcade, alice, { op: "create", kind: "connect4" }).match;
    const old = m.version;
    m = act(s.arcade, alice, {
      op: "move",
      id: m.id,
      version: m.version,
      column: 3,
    }).match;
    assert.equal(m.board.filter(Boolean).length, 2);
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
test("sealed hands, QQ statistics and completed personal experiences survive restart; inactivity cannot reopen an expired match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-arcade-")),
    file = path.join(dir, "world.db");
  let now = 1000000000000,
    s = new Store(file, () => now);
  try {
    let m = act(s.arcade, alice, { op: "create", kind: "rps" }).match;
    const locked = m.commitment;
    s.close();
    s = new Store(file, () => now);
    assert.equal(s.arcade.lobby(alice).mine.commitment, locked);
    m = finishRps(s.arcade, alice, m);
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
    assert.throws(() => s.arcade.view(m.id, bob), /没有开放/);
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
          kind: "rps",
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
    let m = act(store.arcade, alice, { op: "create", kind: "rps" }).match;
    m = finishRps(store.arcade, alice, m);
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
        .some((x) => x.text.includes("猜拳")),
    );
    assert.ok(!JSON.stringify(store.snapshot()).includes(alice.verifiedQQ));
  } finally {
    core.stop();
    await new Promise((r) => server.close(r));
    store.close();
    removeTestDirectory(dir);
  }
});
