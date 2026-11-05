import test from "node:test";
import assert from "node:assert/strict";
import { albumCaption, displayCaption } from "../src/core/caption.mjs";
import { initial, publicWorld } from "../src/core/world.mjs";

test("album notes vary by frozen scene, stay stable across retries and do not address a recipient", () => {
  const results = new Set();
  for (const activity of [
    "walk",
    "observe",
    "rest",
    "map",
    "souvenir",
    "eat",
    "umbrella",
    "shelter",
  ]) {
    for (let i = 0; i < 12; i++) {
      const scene = { id: `${activity}-${i}`, activity, phase: "night" };
      const caption = albumCaption(scene, "某地");
      results.add(caption);
      assert.equal(caption, albumCaption(scene, "某地"));
      assert.doesNotMatch(caption, /给你|我去了|白天|午饭|阳光|晴天/);
      if (activity === "shelter") assert.match(caption, /屋檐|遮|躲/);
      if (activity === "umbrella") assert.match(caption, /伞/);
    }
  }
  assert.ok(results.size >= 25);
  assert.doesNotMatch(albumCaption({}, "某地"), /雨|晴|风|黑|早上/);
});

test("old boilerplate is replaced in both public album views without altering original caption or metadata", () => {
  const original = "我在某地，慢慢散了会儿步。给你看看照片。";
  assert.equal(
    displayCaption("这一路记得最清楚的，是那段石阶。", "某地"),
    "这一路记得最清楚的，是那段石阶。",
  );
  const world = initial(1000);
  world.photos.push({
    photoId: "old-photo",
    place: "某地",
    capturedAt: 1000,
    caption: original,
    assetVersion: "original",
    scene: { activity: "rest", phase: "night" },
  });
  const p = publicWorld(world, 1000);
  assert.doesNotMatch(p.photos[0].caption, /给你/);
  assert.equal(p.photos[0].caption, p.travel.photos[0].caption);
  assert.equal(p.photos[0].capturedAt, 1000);
  assert.equal(world.photos[0].caption, original);
});
