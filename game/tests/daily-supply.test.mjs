import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.mjs";
import { MENU, GEAR, dailySupply } from "../src/core/catalog.mjs";
const actor = { id: "daily-guest" };
test("Beijing-day supply is stable across visits and rotates at midnight, with four meals and two drinks", () => {
  const before = Date.parse("2026-11-05T23:59:59+08:00"),
    after = before + 1000;
  const a = dailySupply(before),
    b = dailySupply(after);
  assert.equal(a.day, "2026-11-05");
  assert.equal(b.day, "2026-11-06");
  assert.deepEqual(a, dailySupply(before - 3600000));
  assert.notDeepEqual(a.food, b.food);
  assert.notDeepEqual(a.gear, b.gear);
  for (const s of [a, b]) {
    assert.equal(s.food.length, 6);
    assert.equal(new Set(s.food).size, 6);
    assert.equal(
      s.food.filter((id) => MENU.find((x) => x[0] === id)[2] === 30).length,
      4,
    );
    assert.equal(s.gear.length, 6);
    for (const id of ["camera", "umbrella", "map"])
      assert.ok(s.gear.includes(id));
  }
});
test("old inventory and packed items survive a new day; unavailable menu submissions fail without decrementing anything", () => {
  let now = Date.parse("2026-11-05T23:59:59+08:00");
  const store = new Store(":memory:", () => now);
  const doCommand = (type, args, id) =>
    store.transact({ type, args, requestId: id }, actor);
  try {
    const today = dailySupply(now),
      tomorrow = dailySupply(now + 1000),
      oldItem = today.food.find((id) => !tomorrow.food.includes(id));
    doCommand(
      "restock",
      { item: oldItem, menuDay: today.day },
      "daily-food-before-midnight",
    );
    const original = store.raw().stock[oldItem];
    now += 1000;
    assert.equal(
      store.snapshot().kitchen.items.find((x) => x.id === oldItem).count,
      original,
    );
    assert.throws(
      () =>
        doCommand(
          "restock",
          { item: oldItem, menuDay: today.day },
          "daily-stale-selection-001",
        ),
      /已更新/,
    );
    assert.throws(
      () =>
        doCommand(
          "restock",
          { item: oldItem, menuDay: tomorrow.day },
          "daily-hidden-selection-01",
        ),
      /没有供应/,
    );
    assert.equal(store.raw().stock[oldItem], original);
    const allowed = tomorrow.food[0],
      cmd = {
        type: "restock",
        args: { item: allowed, menuDay: tomorrow.day },
        requestId: "daily-repeated-food-001",
      };
    store.transact(cmd, actor);
    store.transact(cmd, actor);
    assert.equal(store.raw().stock[allowed], 1);
    const retained = today.gear.find((id) => !tomorrow.gear.includes(id));
    const raw = store.raw();
    raw.backpack = ["camera", retained];
    store.db
      .prepare("UPDATE world SET json=? WHERE id=1")
      .run(JSON.stringify(raw));
    doCommand(
      "backpack_set",
      { items: ["camera", retained], menuDay: tomorrow.day },
      "daily-retain-existing-001",
    );
    assert.ok(
      store.snapshot().packing.items.find((x) => x.id === retained)
        .packed,
    );
    const unavailable = GEAR.map((x) => x[0]).find(
      (id) => !tomorrow.gear.includes(id) && !store.raw().backpack.includes(id),
    );
    if (unavailable)
      assert.throws(
        () =>
          doCommand(
            "backpack_set",
            { items: [unavailable], menuDay: tomorrow.day },
            "daily-unavailable-gear-01",
          ),
        /没有供应/,
      );
  } finally {
    store.close();
  }
});
test("new meal ids work on a six-item legacy save and reading remains a manual activity", () => {
  let now = Date.parse("2026-11-05T12:00:00+08:00");
  const s = new Store(":memory:", () => now);
  try {
    const raw = s.raw();
    raw.stock = {
      tomato: 1,
      wings: 0,
      pork: 0,
      soup: 0,
      milk_tea: 0,
      lemon: 0,
    };
    s.db.prepare("UPDATE world SET json=? WHERE id=1").run(JSON.stringify(raw));
    s.transact(
      {
        type: "restock",
        args: { item: "curry_rice" },
        requestId: "legacy-new-recipe-0001",
      },
      actor,
    );
    assert.equal(s.raw().stock.curry_rice, 1);
    assert.equal(s.raw().stock.tomato, 1);
    s.transact(
      {
        type: "activity",
        args: { name: "read" },
        requestId: "new-reading-activity-001",
      },
      actor,
    );
    now += 60000;
    assert.equal(s.snapshot().activity.name, "read");
    assert.equal(s.snapshot().activity.manual, true);
  } finally {
    s.close();
  }
});
