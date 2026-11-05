import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Store } from "../src/core/store.mjs";
import { ROOT } from "../src/config.mjs";
import { removeTestDirectory } from "./helpers.mjs";
const actor = { id: "pet-guest", verifiedQQ: "999990001" };
function idle(s, now) {
  const w = s.raw();
  w.activity = {
    name: "idle",
    manual: true,
    startedAt: now,
    until: now + 3600000,
  };
  s.db.prepare("UPDATE world SET json=? WHERE id=1").run(JSON.stringify(w));
}
test("server chooses probabilistic reactions, idempotency and a shared cooldown stop rerolls without changing personality or activity", (t) => {
  let now = Date.parse("2026-11-05T12:00:00+08:00"),
    s = new Store(":memory:", () => now),
    roll = 0.1,
    calls = 0;
  t.mock.method(Math, "random", () => {
    calls++;
    return roll;
  });
  try {
    idle(s, now);
    const original = s.raw(),
      cmd = {
        type: "pet_interact",
        args: { kind: "spin" },
        requestId: "touch-first-request-001",
      };
    const one = s.transact(cmd, actor);
    assert.equal(one.petReaction.kind, "headpat");
    assert.equal(one.petTapReadyAt, now + 12000);
    s.transact(cmd, actor);
    s.transact(
      { ...cmd, requestId: "touch-other-guest-001" },
      { id: "someone-else" },
    );
    assert.equal(calls, 1);
    assert.deepEqual(s.raw().activity, original.activity);
    assert.deepEqual(s.raw().mood, original.mood);
    assert.ok(!JSON.stringify(one).includes(actor.verifiedQQ));
    now += 13000;
    roll = 0.45;
    assert.equal(
      s.transact({ ...cmd, requestId: "touch-spin-request-001" }, actor)
        .petReaction.kind,
      "spin",
    );
    s.transact(
      {
        type: "activity",
        args: { name: "sleep" },
        requestId: "manual-sleep-wins-001",
      },
      actor,
    );
    assert.equal(s.snapshot().petReaction, null);
    assert.equal(s.raw().activity.name, "sleep");
  } finally {
    s.close();
  }
});
test("misses have a short cooldown; meals, sleep and low mood do not force a happy spin", (t) => {
  const now = Date.parse("2026-11-05T12:00:00+08:00");
  let roll = 0.9,
    calls = 0;
  t.mock.method(Math, "random", () => {
    calls++;
    return roll;
  });
  for (const name of ["idle", "sleep", "eat", "tea", "read"]) {
    const s = new Store(":memory:", () => now);
    try {
      idle(s, now);
      const w = s.raw();
      w.activity.name = name;
      s.db.prepare("UPDATE world SET json=? WHERE id=1").run(JSON.stringify(w));
      roll = name === "read" ? 0.45 : 0.9;
      const before = calls,
        r = s.transact(
          { type: "pet_interact", args: {}, requestId: "miss-or-busy-" + name },
          actor,
        );
      assert.equal(r.petReaction, null);
      if (["sleep", "eat", "tea"].includes(name)) assert.equal(calls, before);
      else assert.equal(r.petTapReadyAt, now + 3000);
    } finally {
      s.close();
    }
  }
  const s = new Store(":memory:", () => now);
  try {
    idle(s, now);
    const w = s.raw();
    w.mood.value = 20;
    s.db.prepare("UPDATE world SET json=? WHERE id=1").run(JSON.stringify(w));
    roll = 0.45;
    assert.equal(
      s.transact(
        { type: "pet_interact", args: {}, requestId: "low-mood-spin-request" },
        actor,
      ).petReaction,
      null,
    );
    assert.equal(s.raw().mood.value, 20);
  } finally {
    s.close();
  }
});
test("reaction and cooldown survive restart; expired reactions do not replay", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-taps-")),
    file = path.join(dir, "world.db");
  let now = Date.now(),
    s = new Store(file, () => now);
  t.mock.method(Math, "random", () => 0.1);
  try {
    idle(s, now);
    s.transact(
      { type: "pet_interact", args: {}, requestId: "persistent-tap-request" },
      actor,
    );
    s.close();
    now += 1000;
    s = new Store(file, () => now);
    assert.equal(s.snapshot().petReaction.kind, "headpat");
    const ready = s.snapshot().petTapReadyAt;
    now += 2000;
    assert.equal(s.snapshot().petReaction, null);
    assert.equal(s.snapshot().petTapReadyAt, ready);
  } finally {
    s.close();
    removeTestDirectory(dir);
  }
});
test("reaction sprite sheets are finite, aligned and end in the starting pose", async () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public/assets/manifest-v4.json"), "utf8"),
  );
  for (const [name, count] of [
    ["headpat", 7],
    ["spin", 9],
  ]) {
    const spec = manifest[name];
    assert.equal(spec.once, true);
    assert.equal(spec.frames, count);
    const frames = [];
    for (let i = 0; i < count; i++) {
      const b = await sharp(
        path.join(ROOT, "public", spec.file.replace(/^\//, "")),
      )
        .extract({
          left: (i % 8) * 256,
          top: Math.floor(i / 8) * 256,
          width: 256,
          height: 256,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
      let bottom = 0,
        area = 0;
      for (let p = 0; p < 256 * 256; p++) {
        if (b[p * 4 + 3] > 24) {
          area++;
          bottom = Math.max(bottom, Math.floor(p / 256));
        }
        if (b[p * 4 + 3] === 0) b.fill(0, p * 4, p * 4 + 3);
      }
      assert.ok(area > 8000);
      assert.equal(bottom, 243);
      frames.push(b);
    }
    assert.deepEqual(frames[0], frames.at(-1));
    assert.notDeepEqual(frames[0], frames[3]);
  }
});
