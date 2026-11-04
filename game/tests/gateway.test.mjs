import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {
  routeGame,
  installGameEvents,
} from "../adapters/game-public-adapter.mjs";
import { makeServer } from "../src/server.mjs";
import { Store } from "../src/core/store.mjs";
import WebSocket from "ws";
test("public gateway validates relay, proxies state and upgrades websocket", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-gateway-"));
  fs.mkdirSync(path.join(dir, "state"));
  const store = new Store(),
    { server: core } = makeServer(
      { allowedOrigins: ["https://game.example"] },
      { store },
    );
  await new Promise((r) => core.listen(0, "127.0.0.1", r));
  const secret = "relay-for-test-".repeat(4);
  fs.writeFileSync(
    path.join(dir, "state/game-core-link.json"),
    JSON.stringify({
      enabled: true,
      url: "http://127.0.0.1:" + core.address().port,
      relaySecret: secret,
      publicOrigins: ["https://game.example"],
    }),
  );
  const gateway = http.createServer(async (req, res) => {
    if (await routeGame(req, res, { root: dir })) return;
    res.end("legacy");
  });
  installGameEvents(gateway, { root: dir });
  await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + gateway.address().port;
  try {
    const bad = await fetch(base + "/api/room-state", {
      method: "POST",
      headers: {
        "x-room-relay": "wrong",
        "x-room-origin": "https://game.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(bad.status, 403);
    const good = await fetch(base + "/api/room-state", {
      method: "POST",
      headers: {
        "x-room-relay": secret,
        "x-room-origin": "https://game.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal((await good.json()).hunger, 80);
    assert.equal(await (await fetch(base + "/room-legacy")).text(), "legacy");
    const ws = new WebSocket(base.replace("http", "ws") + "/api/room-events", {
      headers: {
        "x-room-relay": secret,
        "x-room-origin": "https://game.example",
      },
    });
    const message = await new Promise((r, j) => {
      ws.once("message", (d) => r(JSON.parse(d)));
      ws.once("error", j);
    });
    assert.equal(message.type, "revision");
    ws.close();
    await new Promise((r) => ws.on("close", r));
  } finally {
    await new Promise((r) => gateway.close(r));
    await new Promise((r) => core.close(r));
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
