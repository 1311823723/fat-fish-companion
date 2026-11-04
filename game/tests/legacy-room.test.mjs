import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../src/config.mjs";
import { Store } from "../src/core/store.mjs";
import { makeServer } from "../src/server.mjs";
import { installGameCore } from "../adapters/game-core-adapter.mjs";
import { startGameBridge } from "../adapters/game-bridge-hooks.mjs";
import { removeTestDirectory } from "./helpers.mjs";
test("legacy guest chat uses a public persona and core with missing kitchen/travel methods", async (t) => {
  const base = process.env.BRIDGE_FIXTURE_ROOT || path.resolve(ROOT, ".."),
    file = path.join(base, "src/web-room.mjs");
  if (!fs.existsSync(file)) {
    t.skip("legacy integration fixture is not installed");
    return;
  }
  const { WebRoom } = await import(pathToFileURL(file));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-legacy-room-"));
  fs.mkdirSync(path.join(dir, "state"));
  const store = new Store(),
    secret = "local-fixture-key-".repeat(4),
    { server } = makeServer(
      { adapterSecret: secret, allowedOrigins: [] },
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
  let messages;
  const room = new WebRoom(path.join(dir, "room.json"), {
    context: () => "PRIVATE_ROLE_SENTINEL",
    generate: async (m) => {
      messages = m;
      return "你好";
    },
    remember: () => {},
    roomState: () => ({ room: { daysTogether: 1 }, self: {} }),
  });
  const core = installGameCore(room, { root: dir });
  const hooks = startGameBridge(core, room, {
    cfg: {},
    active: () => false,
    contextForQQ: () => {
      throw Error("guest must not load private context");
    },
  });
  try {
    await core.refresh();
    const visitor = "a".repeat(64);
    await room.handle("enter", { qq: "" }, visitor);
    await room.handle(
      "pet_action",
      { name: "restock", item: "tomato", requestId: "legacy-food-request" },
      visitor,
    );
    assert.equal(store.raw().stock.tomato, 1);
    const reply = await room.handle(
      "chat",
      { text: "你好", requestId: "legacy-chat-request" },
      visitor,
    );
    assert.equal(reply.ok, true);
    assert.ok(!JSON.stringify(messages).includes("PRIVATE_ROLE_SENTINEL"));
    assert.ok(JSON.stringify(messages).includes("同一个大肥鱼"));
  } finally {
    hooks.stop();
    core.stop();
    await new Promise((r) => server.close(r));
    store.close();
    removeTestDirectory(dir);
  }
});
