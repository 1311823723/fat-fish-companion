import test from "node:test";
import assert from "node:assert/strict";
import { departureNote } from "../src/core/note.mjs";
import { initial, settle, apply } from "../src/core/world.mjs";
test("home routine moves naturally, overnight manual sleep wins and notes vary", () => {
  let now = Date.parse("2026-11-04T12:00:00+08:00");
  while (Math.floor(now / 300000) % 4 !== 1) now += 300000;
  const w = initial(now - 5000);
  settle(w, now, []);
  assert.equal(w.activity.name, "walk");
  const night = Date.parse("2026-11-04T22:00:00+08:00"),
    sleep = initial(night);
  apply(
    sleep,
    { type: "activity", args: { name: "sleep" } },
    { id: "visitor" },
    night,
    [],
  );
  assert.equal(sleep.activity.until, Date.parse("2026-11-05T07:00:00+08:00"));
  sleep.hunger = 25;
  sleep.stock.tomato = 1;
  settle(sleep, night + 3600000, []);
  assert.equal(sleep.activity.name, "sleep");
  assert.equal(sleep.stock.tomato, 1);
  const notes = [];
  for (let i = 0; i < 20; i++)
    notes.push(departureNote({ place: { label: "附近小公园" } }, notes));
  assert.equal(new Set(notes).size, 20);
});
