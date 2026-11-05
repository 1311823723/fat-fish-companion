import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/core/store.mjs";
import { makeServer } from "../src/server.mjs";
import { removeTestDirectory } from "./helpers.mjs";

test("standalone guest keeps records across restart, never stores the bearer token and logout revokes access", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-guest-")),
    file = path.join(dir, "world.db");
  let now = Date.now(),
    store,
    server,
    base;
  const start = async () => {
    store = new Store(file, () => now);
    ({ server } = makeServer(
      { allowedOrigins: ["http://guest.test"] },
      { store },
    ));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = "http://127.0.0.1:" + server.address().port;
  };
  const stop = async () => {
    await new Promise((r) => server.close(r));
    store.close();
    server = null;
  };
  const post = (route, body = {}, cookie = "") =>
    fetch(base + "/api/room-" + route, {
      method: "POST",
      headers: {
        origin: "http://guest.test",
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify(body),
    });
  try {
    await start();
    const entered = await post("enter"),
      cookie = entered.headers.get("set-cookie").split(";")[0],
      token = cookie.split("=")[1];
    const created = await (
      await post(
        "arcade-action",
        {
          op: "create",
          kind: "connect4",
          shared: false,
          requestId: "guest-create-request",
        },
        cookie,
      )
    ).json();
    const id = created.match.id;
    await post(
      "arcade-action",
      {
        op: "resign",
        id,
        version: created.match.version,
        requestId: "guest-resign-request",
      },
      cookie,
    );
    assert.ok(
      !JSON.stringify(
        store.db.prepare("SELECT * FROM game_guest_sessions").all(),
      ).includes(token),
    );
    assert.equal(
      (await post("enter", {}, cookie)).headers.get("set-cookie"),
      null,
    );
    await stop();
    await start();
    assert.equal(
      (await (await post("identity", {}, cookie)).json()).entered,
      true,
    );
    assert.equal(
      (await (await post("arcade", { scope: "mine" }, cookie)).json())
        .records[0].id,
      id,
    );
    const other = (await post("enter")).headers.get("set-cookie").split(";")[0];
    assert.equal((await post("arcade-view", { id }, other)).status, 400);
    await post("logout", {}, cookie);
    assert.equal((await post("arcade", {}, cookie)).status, 401);
    now += 31 * 86400000;
    assert.equal((await post("arcade", {}, other)).status, 401);
  } finally {
    if (server) await stop();
    removeTestDirectory(dir);
  }
});
