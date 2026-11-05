import { removeTestDirectory } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../src/core/store.mjs";
import { makeServer } from "../src/server.mjs";
import { installGameCore } from "../adapters/game-core-adapter.mjs";
test("bridge adapter shares authoritative state, suppresses legacy writers, routes verified identity", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-adapter-"));
  fs.mkdirSync(path.join(dir, "state"));
  fs.writeFileSync(
    path.join(dir, "room.config.json"),
    JSON.stringify({ publicRoomUrl: "https://cottage.example/room" }),
  );
  const store = new Store(),
    secret = "test-only-".repeat(8),
    { server } = makeServer(
      { allowedOrigins: [], adapterSecret: secret },
      { store },
    );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  fs.writeFileSync(
    path.join(dir, "state/game-core-link.json"),
    JSON.stringify({
      enabled: true,
      url: "http://127.0.0.1:" + server.address().port,
      secret,
    }),
  );
  let legacy = 0;
  const room = {
    data: { visitors: {} },
    roomState: () => ({ room: { daysTogether: 1 } }),
    visitor: () => ({ verifiedQQ: "987654321" }),
  };
  for (const name of [
    "publicState",
    "kitchen",
    "activity",
    "mood",
    "feedingSummary",
    "feedingRecords",
    "travelContext",
    "travelTick",
    "syncTravel",
    "handle",
  ])
    room[name] = () => {
      legacy++;
    };
  const adapter = installGameCore(room, { root: dir });
  try {
    await new Promise((r) => setTimeout(r, 30));
    await adapter.refresh();
    assert.ok(room.travelContext().includes("https://cottage.example/room"));
    assert.ok(room.travelContext().includes("四子棋"));
    assert.ok(room.travelContext().includes("公开旅行相册"));
    fs.writeFileSync(
      path.join(dir, "room.config.json"),
      JSON.stringify({
        publicRoomUrl: "https://cottage.example/room?token=private-value",
      }),
    );
    assert.ok(!room.travelContext().includes("?token="));
    assert.equal(room.publicState().hunger, 80);
    assert.equal(room.travelTick().type, "none");
    await room.handle(
      "pet_action",
      { name: "restock", item: "tomato", requestId: "bridge-restock-001" },
      "guest-id",
    );
    assert.equal(store.raw().stock.tomato, 1);
    assert.equal(store.raw().feeding[0].actor.qq, "987654321");
    assert.equal(room.kitchen().total, 1);
    assert.ok(!JSON.stringify(room.publicState()).includes("987654321"));
    assert.equal(legacy, 0);
  } finally {
    adapter.stop();
    await new Promise((r) => server.close(r));
    store.close();
    removeTestDirectory(dir);
  }
});
