import test from "node:test";
import assert from "node:assert/strict";
import layout from "../public/assets/room-layout-v4.json" with { type: "json" };
import { Store } from "../src/core/store.mjs";
test("fine room exposes the same machine-readable landmarks used by the renderer and keeps walking clear of furniture", () => {
  const store = new Store();
  try {
    const room = store.snapshot().room;
    assert.equal(room.version, "storybook-v4");
    assert.deepEqual(room, layout);
    for (const object of room.objects) {
      const b = object.bounds;
      assert.ok(
        b.x >= 0 && b.y >= 0 && b.x + b.width <= 600 && b.y + b.height <= 800,
      );
      assert.ok(object.name);
      assert.ok(Array.isArray(object.actions));
    }
    for (const id of ["bed", "light", "fridge", "diary", "album", "curtain"])
      assert.ok(room.objects.find((o) => o.id === id)?.actions.length);
    for (const p of room.walkPath)
      for (const o of room.objects.filter((o) =>
        ["bed", "fridge", "desk"].includes(o.id),
      )) {
        const b = o.bounds;
        assert.ok(
          !(
            p.x > b.x &&
            p.x < b.x + b.width &&
            p.y > b.y &&
            p.y < b.y + b.height
          ),
          "path crosses " + o.id,
        );
      }
  } finally {
    store.close();
  }
});
