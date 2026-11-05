import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { Store } from "../src/core/store.mjs";
import { initial, settle } from "../src/core/world.mjs";
import { ROOT } from "../src/config.mjs";
test("singing does not consume food; meal animation keeps one authoritative consumption and soup remains a drink", () => {
  const now = Date.parse("2026-11-05T12:00:00+08:00"),
    s = new Store(":memory:", () => now),
    actor = { id: "home-actions-guest" };
  try {
    const w = s.raw();
    w.hunger = 40;
    w.stock.tomato = 1;
    s.db.prepare("UPDATE world SET json=? WHERE id=1").run(JSON.stringify(w));
    s.transact(
      {
        type: "activity",
        args: { name: "sing" },
        requestId: "hum-activity-request-001",
      },
      actor,
    );
    assert.equal(s.raw().stock.tomato, 1);
    assert.equal(s.raw().activity.name, "sing");
    const cmd = {
      type: "activity",
      args: { name: "eat" },
      requestId: "eat-rice-request-00001",
    };
    s.transact(cmd, actor);
    s.transact(cmd, actor);
    assert.equal(s.raw().stock.tomato, 0);
    assert.equal(s.raw().hunger, 70);
    assert.equal(s.raw().activity.mealKind, "meal");
    const next = s.raw();
    next.stock.soup = 1;
    s.db
      .prepare("UPDATE world SET json=? WHERE id=1")
      .run(JSON.stringify(next));
    s.transact({ ...cmd, requestId: "soup-request-000001" }, actor);
    assert.equal(s.raw().activity.mealKind, "drink");
    assert.equal(s.raw().stock.soup, 0);
    assert.throws(
      () => s.transact({ ...cmd, requestId: "empty-request-000001" }, actor),
      /没有合适/,
    );
  } finally {
    s.close();
  }
});
test("autonomous humming is short, daytime and rate limited, with manual sleep taking precedence", () => {
  let now = Date.parse("2026-11-05T12:10:00+08:00");
  const w = initial(now - 5000);
  settle(w, now, []);
  assert.equal(w.activity.name, "sing");
  assert.equal(w.activity.until - now, 45000);
  now += 45001;
  settle(w, now, []);
  assert.notEqual(w.activity.name, "sing");
  const n = initial(Date.parse("2026-11-05T23:10:00+08:00") - 1000);
  settle(n, Date.parse("2026-11-05T23:10:00+08:00"), []);
  assert.equal(n.activity.name, "sleep");
  const manual = initial(now);
  manual.activity = {
    name: "sleep",
    manual: true,
    startedAt: now,
    until: now + 3600000,
  };
  settle(manual, now + 1000, []);
  assert.equal(manual.activity.name, "sleep");
});
test("new sprite loops have nine aligned transparent frames and seamless visible endpoints", async () => {
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(ROOT, "public/assets/manifest-v3.json"),
      "utf8",
    ),
  );
  for (const action of ["sing", "eat_rice"]) {
    assert.equal(manifest[action].frames, 9);
    const file = path.join(
        ROOT,
        "public",
        manifest[action].file.replace(/^\//, ""),
      ),
      frames = [];
    for (let i = 0; i < 9; i++) {
      const b = await sharp(file)
        .extract({
          left: (i % 8) * 256,
          top: Math.floor(i / 8) * 256,
          width: 256,
          height: 256,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
      let pixels = 0,
        bottom = 0;
      for (let p = 0; p < 256 * 256; p++) {
        if (b[p * 4 + 3] > 24) {
          pixels++;
          bottom = Math.max(bottom, Math.floor(p / 256));
        }
        if (b[p * 4 + 3] === 0) b.fill(0, p * 4, p * 4 + 3);
      }
      assert.ok(pixels > 8000);
      assert.equal(bottom, 243);
      frames.push(b);
    }
    assert.deepEqual(frames[0], frames[8]);
    assert.notDeepEqual(frames[0], frames[3]);
  }
});
