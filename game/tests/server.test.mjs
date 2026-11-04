import test from "node:test";
import assert from "node:assert/strict";
import { makeServer } from "../src/server.mjs";
import { Store } from "../src/core/store.mjs";
import WebSocket from "ws";
test("public API enforces origin, guest permission and idempotent requests; websocket revision", async () => {
  const store = new Store();
  const { server } = makeServer(
    { allowedOrigins: ["http://test.local"] },
    { store },
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (r, b = {}, cookie = "", origin = "http://test.local") =>
    fetch(base + "/api/room-" + r, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(b),
    });
  try {
    assert.equal(
      (await post("state", {}, "", "http://evil.local")).status,
      403,
    );
    assert.equal((await post("action", { name: "walk" })).status, 401);
    const entry = await post("enter"),
      cookie = entry.headers.get("set-cookie").split(";")[0];
    const body = {
      command: {
        type: "restock",
        args: { item: "tomato" },
        requestId: "restock-unique-123",
      },
    };
    assert.equal(
      (await (await post("action", body, cookie)).json()).kitchen.total,
      1,
    );
    assert.equal(
      (await (await post("action", body, cookie)).json()).kitchen.total,
      1,
    );
    assert.equal(
      (await fetch(base + "/internal/snapshot", { method: "POST" })).status,
      403,
    );
    const ws = new WebSocket(base.replace("http", "ws") + "/api/room-events", {
      origin: "http://test.local",
    });
    const message = await new Promise((r, j) => {
      ws.on("message", (d) => r(JSON.parse(d)));
      ws.on("error", j);
    });
    assert.equal(message.type, "revision");
    ws.close();
    await new Promise((r) => ws.on("close", r));
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});
