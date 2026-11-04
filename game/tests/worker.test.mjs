import test from "node:test";
import assert from "node:assert/strict";
import worker from "../deploy/worker.mjs";
test("Worker never proxies management APIs, DSH or arbitrary paths", async () => {
  for (const route of [
    "/internal/snapshot",
    "/api/status",
    "/plugins/a",
    "/api/session/refresh",
  ]) {
    const r = await worker.fetch(
      new Request("https://game.example" + route),
      {},
    );
    assert.equal(r.status, 404);
  }
  const r = await worker.fetch(
    new Request("https://game.example/api/room-state", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
    {
      ROOM_ORIGIN: "https://backend.example",
      ROOM_RELAY_SECRET: "not-a-real-token",
    },
  );
  assert.equal(r.status, 403);
});
