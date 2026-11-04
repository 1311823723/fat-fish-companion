import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  saveTravelImage,
  providerPhotoPrompt,
  DOUBAO_BOTTOM_RATIO,
} from "../src/photo-presentation.mjs";
import { Store } from "../src/core/store.mjs";
const id = "11111111-1111-4111-8111-111111111111";
test("Doubao crops only the reserved bottom edge and preserves the original; GPT remains byte identical", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fatfish-photo-"));
  try {
    const bytes = await sharp({
      create: { width: 600, height: 800, channels: 3, background: "#224466" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 600,
              height: 15,
              channels: 3,
              background: "#ffffff",
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 785,
        },
        {
          input: await sharp({
            create: {
              width: 50,
              height: 50,
              channels: 3,
              background: "#ff0000",
            },
          })
            .png()
            .toBuffer(),
          left: 100,
          top: 690,
        },
      ])
      .png()
      .toBuffer();
    const m = await saveTravelImage(bytes, id, "doubao", dir);
    assert.equal(m.height, 800 - Math.ceil(800 * DOUBAO_BOTTOM_RATIO));
    assert.deepEqual(await fs.readFile(path.join(dir, m.sourceFile)), bytes);
    const published = await fs.readFile(path.join(dir, id + ".img")),
      meta = await sharp(published).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, m.height);
    const sample = await sharp(published)
      .extract({ left: 110, top: 700, width: 1, height: 1 })
      .raw()
      .toBuffer();
    assert.equal(sample[0], 255);
    assert.equal(sample[1], 0);
    assert.ok(!published.equals(bytes));
    const other = id.replace(/^1/, "2");
    await saveTravelImage(bytes, other, "gpt", dir);
    assert.deepEqual(await fs.readFile(path.join(dir, other + ".img")), bytes);
    assert.match(providerPhotoPrompt("frozen scene", "doubao"), /18%/);
    assert.equal(providerPhotoPrompt("frozen scene", "gpt"), "frozen scene");
    await assert.rejects(
      () => saveTravelImage(bytes, id, "doubao", dir, { bottomRatio: 0.5 }),
      /比例无效/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("processed photo changes its asset version without changing capture time or album count; guests cannot process", () => {
  const s = new Store();
  try {
    const w = s.raw();
    w.photos.push({
      photoId: id,
      place: "公园",
      capturedAt: 123456,
      caption: "看看风景",
      scene: {},
    });
    s.db.prepare("UPDATE world SET json=? WHERE id=1").run(JSON.stringify(w));
    const cmd = {
      type: "photo_processed",
      requestId: "process-photo-test-0001",
      args: { photoId: id, assetVersion: "0123456789abcdef" },
    };
    assert.throws(() => s.transact(cmd, { id: "guest" }), /内部操作/);
    const result = s.transact(cmd);
    assert.equal(result.photos.length, 1);
    assert.equal(result.photos[0].capturedAt, 123456);
    assert.equal(result.photos[0].assetVersion, "0123456789abcdef");
    assert.equal(s.transact(cmd).photos.length, 1);
  } finally {
    s.close();
  }
});
