import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/core/store.mjs";
test("restart preserves request id and does not retry uncertain QQ outbox", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-restart-")),
    file = path.join(dir, "world.db");
  let now = Date.now();
  let s = new Store(file, () => now);
  const command = {
    type: "restock",
    requestId: "restart-command-001",
    args: { item: "wings" },
  };
  s.transact(command, { id: "guest" });
  s.enqueue("share-unique", "share", { target: "example" });
  s.claim("share");
  s.close();
  now += 86400000;
  s = new Store(file, () => now);
  s.transact(command, { id: "guest" });
  assert.equal(s.raw().stock.wings, 1);
  assert.equal(s.claim("share"), null);
  s.snapshot();
  assert.ok(s.raw().hunger >= 55.99);
  s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
