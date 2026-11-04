import test from "node:test";
import assert from "node:assert/strict";
import { startGameBridge } from "../adapters/game-bridge-hooks.mjs";
test("queued QQ transport rechecks whitelist after asynchronous state refresh", async () => {
  let revoked = false,
    revokeOnRefresh = false,
    sent = 0;
  const trip = {
    id: "11111111-1111-4111-8111-111111111111",
    place: { label: "附近" },
    returnAt: Date.now() + 60000,
  };
  const room = { weather: {}, data: { travel: { current: trip } } };
  const core = {
    refresh: async () => {
      if (revokeOnRefresh) revoked = true;
    },
    tick: async (cb) => {
      const targets = await cb.chooseTargets(trip);
      assert.deepEqual(targets, ["private:11111"]);
      await cb.sendProgress(targets[0], trip, "路上看见了树影");
    },
  };
  const hooks = startGameBridge(core, room, {
    cfg: { ownerQQ: "11111", allow: { private: ["11111"], groups: [] } },
    active: () => true,
    isAllowed: () => !revoked,
    isBusy: () => false,
    lastIncomingAt: () => 0,
    generate: () => "",
    enqueue: (fn) => fn(),
    captureGuard: () => () => {
      if (revoked) throw Error("revoked");
    },
    record: () => {},
    fetcher: async (_url, options) => {
      const data = JSON.parse(options.body);
      assert.equal(data.user_id, 11111);
      sent++;
      return { ok: true, json: async () => ({ status: "ok", retcode: 0 }) };
    },
  });
  try {
    await hooks.tick();
    assert.equal(sent, 1);
    revokeOnRefresh = true;
    await hooks.tick();
    assert.equal(sent, 1);
  } finally {
    hooks.stop();
  }
});
