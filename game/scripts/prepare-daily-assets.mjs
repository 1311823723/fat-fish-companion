// Usage: node scripts/prepare-daily-assets.mjs <food-sheet.png> <gear-sheet.png> <reading-sheet.png>
// Deterministic atlas extraction; generated originals stay outside the public repository.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { extractSheet as extract } from "./sprite-sheet.mjs";
import { ROOT } from "../src/config.mjs";
import { MENU, GEAR } from "../src/core/catalog.mjs";
const [foodFile, gearFile, readFile] = process.argv.slice(2);
if (!foodFile || !gearFile || !readFile)
  throw Error("需要食物、小物、翻书三份原始图集");
const dest = path.join(ROOT, "public/assets");

const food = await extract(foodFile, 4, 4),
  gear = await extract(gearFile, 3, 3),
  reading = await extract(readFile, 4, 2);
const frames = {},
  layers = [];
for (let i = 0; i < MENU.length; i++) {
  const id = MENU[i][0],
    png = await sharp(food[i])
      .resize(144, 144, { fit: "contain", background: "#00000000" })
      .png()
      .toBuffer();
  await sharp(png)
    .webp({ quality: 90 })
    .toFile(path.join(dest, `food-${id}-v2.webp`));
  const x = (i % 4) * 160,
    y = Math.floor(i / 4) * 160;
  layers.push({ input: png, left: x + 8, top: y + 8 });
  frames[id] = {
    frame: { x, y, w: 160, h: 160 },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 160, h: 160 },
    sourceSize: { w: 160, h: 160 },
  };
}
await sharp({
  create: { width: 640, height: 640, channels: 4, background: "#00000000" },
})
  .composite(layers)
  .webp({ quality: 90 })
  .toFile(path.join(dest, "food-icons-v2.webp"));
await fs.writeFile(
  path.join(dest, "food-icons-v2.json"),
  JSON.stringify({
    frames,
    meta: { image: "food-icons-v2.webp", size: { w: 640, h: 640 }, scale: "1" },
  }),
);
for (let i = 0; i < GEAR.length; i++)
  await sharp(gear[i])
    .resize(160, 160, { fit: "contain", background: "#00000000" })
    .webp({ quality: 90 })
    .toFile(path.join(dest, `gear-${GEAR[i][0]}-v2.webp`));
const bounds = await Promise.all(reading.map((x) => sharp(x).metadata()));
const scale = 204 / Math.max(...bounds.map((b) => b.height));
const sequence = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 0],
  readLayers = [];
for (let i = 0; i < sequence.length; i++) {
  const n = sequence[i],
    width = Math.round(bounds[n].width * scale),
    height = Math.round(bounds[n].height * scale);
  readLayers.push({
    input: await sharp(reading[n]).resize(width, height).png().toBuffer(),
    left: (i % 8) * 256 + Math.floor((256 - width) / 2),
    top: Math.floor(i / 8) * 256 + 244 - height,
  });
}
await sharp({
  create: { width: 2048, height: 512, channels: 4, background: "#00000000" },
})
  .composite(readLayers)
  .webp({ lossless: true })
  .toFile(path.join(dest, "read-v1.webp"));
const manifest = JSON.parse(
  await fs.readFile(path.join(dest, "manifest-v1.json"), "utf8"),
);
manifest.read = {
  file: "/assets/read-v1.webp",
  fps: 3,
  frames: sequence.length,
};
await fs.writeFile(
  path.join(dest, "manifest-v2.json"),
  JSON.stringify(manifest),
);
console.log(
  JSON.stringify({
    foodIcons: MENU.length,
    gearIcons: GEAR.length,
    readingFrames: sequence.length,
    frameSize: 256,
  }),
);
