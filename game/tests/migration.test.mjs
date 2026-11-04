import { publicWorld } from "../src/core/world.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { convert } from "../scripts/migrate.mjs";
test("legacy import preserves counts, history remains in original, no stock truncation", () => {
  const old = {
    kitchen: {
      stock: { tomato: 2, wings: 3, pork: 0, soup: 1, milk_tea: 2, lemon: 1 },
    },
    visitors: { a: { verifiedQQ: "987654321" } },
    histories: { "qq:987654321": [{ text: "secret" }] },
    travel: {
      history: [
        {
          id: "old",
          photoId: "11111111-1111-4111-8111-111111111111",
          place: "公园",
          returnedAt: 1000,
        },
      ],
      pending: [],
    },
  };
  old.travel.history[0].caption = "想象中的旅行，AI生成插画";
  const { world, counts } = convert(old);
  assert.match(world.photos[0].caption, /想象/);
  assert.ok(!publicWorld(world, Date.now()).photos[0].caption.includes("想象"));
  assert.equal(counts.inventory, 9);
  assert.equal(counts.photos, 1);
  assert.equal(counts.identities, 1);
  assert.equal(counts.historyThreads, 1);
  assert.ok(!JSON.stringify(world).includes("secret"));
  old.kitchen.stock.tomato = 20;
  assert.throws(() => convert(old));
});
