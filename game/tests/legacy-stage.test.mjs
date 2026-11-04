import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../src/config.mjs";
import { removeTestDirectory } from "./helpers.mjs";
test("published basic bridge stages without requiring travel-only functions", (t) => {
  const base = process.env.BRIDGE_FIXTURE_ROOT || path.resolve(ROOT, "..");
  if (!fs.existsSync(path.join(base, "src/bridge.js"))) {
    t.skip("integration fixture is not installed");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-stage-"));
  try {
    execFileSync(process.execPath, [
      path.join(ROOT, "scripts/stage-bridge.mjs"),
      base,
      dir,
    ]);
    for (const file of [
      "bridge.js",
      "room-public-server.mjs",
      "game-core-adapter.mjs",
      "game-bridge-hooks.mjs",
      "game-public-adapter.mjs",
    ])
      execFileSync(process.execPath, ["--check", path.join(dir, "src", file)]);
    const s = fs.readFileSync(path.join(dir, "src/bridge.js"), "utf8");
    assert.ok(
      s.includes("startGameBridge(gameCore,webRoom") ||
        s.includes("startGameBridge(gameCore, webRoom"),
    );
    assert.ok(s.includes("gameRecent"));
    assert.ok(
      s.indexOf("const gameCore=") > s.indexOf("async function main()"),
    );
  } finally {
    removeTestDirectory(dir);
  }
});
