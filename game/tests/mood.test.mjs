import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/core/store.mjs";
import { makeServer } from "../src/server.mjs";
import { installGameCore } from "../adapters/game-core-adapter.mjs";
import { removeTestDirectory } from "./helpers.mjs";
test("QQ and web share existing mood with at most two weather points and no private cause", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-mood-"));
  fs.mkdirSync(path.join(dir, "state"));
  const store = new Store();
  store.transact({
    type: "weather",
    requestId: "weather-mood-test",
    args: { weather: { available: true, kind: "clear" } },
  });
  const secret = "mood-fixture-key-".repeat(4),
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
  let raw = "开心 PRIVATE_MOOD_CAUSE",
    legacyKind = "clear";
  const room = {
    data: { visitors: {}, histories: {} },
    weather: { state: () => ({ available: true, kind: legacyKind }) },
    roomState: () => ({ room: { daysTogether: 1 }, self: { mood: raw } }),
    mood: () =>
      raw.includes("开心")
        ? {
            value: 78 + (legacyKind === "clear" ? 2 : -1),
            label: "轻松",
            expression: "smile",
          }
        : {
            value: 38 + (legacyKind === "clear" ? 2 : -1),
            label: "有点低落",
            expression: "sad",
          },
  };
  for (const name of [
    "publicState",
    "kitchen",
    "activity",
    "feedingSummary",
    "feedingRecords",
    "travelContext",
    "travelTick",
    "syncTravel",
    "handle",
  ])
    room[name] = () => {};
  const core = installGameCore(room, { root: dir });
  try {
    await core.refresh();
    assert.equal(store.raw().mood.value, 78);
    assert.equal(room.mood().value, 80);
    assert.equal(store.snapshot().mood.value, room.mood().value);
    assert.equal(store.snapshot().energy, 70);
    assert.equal(room.mood().expression, "smile");
    assert.ok(!JSON.stringify(store.snapshot()).includes("sourceHash"));
    assert.ok(!JSON.stringify(store.snapshot()).includes("PRIVATE_MOOD_CAUSE"));
    legacyKind = "rain";
    raw = "开心 PRIVATE_MOOD_CAUSE_CHANGED";
    await core.refresh();
    assert.equal(room.mood().value, 80);
    legacyKind = "clear";
    raw = "难过 PRIVATE_MOOD_CAUSE";
    await core.refresh();
    assert.equal(room.mood().value, 40);
    raw = "开心 PRIVATE_MOOD_CAUSE";
    await core.refresh();
    assert.equal(room.mood().value, 80);
  } finally {
    core.stop();
    await new Promise((r) => server.close(r));
    store.close();
    removeTestDirectory(dir);
  }
});
