import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/config.mjs";
import { MENU, GEAR } from "../src/core/catalog.mjs";
const asset = (n) => path.join(ROOT, "public/assets", n);
test("all daily catalog icons exist with alpha and every fridge atlas frame stays inside its sheet", async () => {
  const atlas = JSON.parse(
      await fs.readFile(asset("food-icons-v2.json"), "utf8"),
    ),
    sheet = await sharp(asset("food-icons-v2.webp")).metadata();
  assert.equal(Object.keys(atlas.frames).length, MENU.length);
  for (const [id] of MENU) {
    const m = await sharp(asset(`food-${id}-v2.webp`)).metadata();
    assert.equal(m.hasAlpha, true);
    assert.equal(m.exif, undefined);
    const f = atlas.frames[id].frame;
    assert.ok(
      f.x >= 0 &&
        f.y >= 0 &&
        f.x + f.w <= sheet.width &&
        f.y + f.h <= sheet.height,
    );
  }
  for (const [id] of GEAR) {
    const m = await sharp(asset(`gear-${id}-v2.webp`)).metadata();
    assert.equal(m.hasAlpha, true);
    assert.equal(m.width, 160);
    assert.equal(m.exif, undefined);
  }
});
test("reading loop has twelve nonempty aligned frames with a shared baseline and exact seamless endpoints", async () => {
  const manifest = JSON.parse(
    await fs.readFile(asset("manifest-v2.json"), "utf8"),
  );
  assert.equal(manifest.read.frames, 12);
  assert.equal(manifest.read.fps, 3);
  const frames = [];
  for (let i = 0; i < 12; i++) {
    const raw = await sharp(asset("read-v1.webp"))
      .extract({
        left: (i % 8) * 256,
        top: Math.floor(i / 8) * 256,
        width: 256,
        height: 256,
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let p = 0; p < 256 * 256; p++)
      if (raw[p * 4 + 3] === 0) {
        raw[p * 4] = 0;
        raw[p * 4 + 1] = 0;
        raw[p * 4 + 2] = 0;
      }
    frames.push(raw);
    let bottom = 0,
      pixels = 0;
    for (let p = 0; p < 256 * 256; p++)
      if (raw[p * 4 + 3] > 24) {
        pixels++;
        bottom = Math.max(bottom, Math.floor(p / 256));
      }
    assert.ok(pixels > 10000);
    assert.equal(bottom, 243);
  }
  assert.deepEqual(frames[0], frames[11]);
  assert.notDeepEqual(frames[0], frames[4]);
});
