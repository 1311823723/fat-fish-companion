// node scripts/prepare-home-actions.mjs <sing-sheet.png> <rice-sheet.png>
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/config.mjs";
import { extractSheet } from "./sprite-sheet.mjs";
const [sing, rice] = process.argv.slice(2);
if (!sing || !rice) throw Error("需要哼歌与吃饭的原始透明图集");
const dest = path.join(ROOT, "public/assets"),
  sequence = [0, 0, 1, 2, 3, 4, 4, 5, 0];
const manifest = JSON.parse(
  await fs.readFile(path.join(dest, "manifest-v2.json"), "utf8"),
);
for (const [name, file] of [
  ["sing", sing],
  ["eat_rice", rice],
]) {
  const frames = await extractSheet(file, 3, 2),
    bounds = await Promise.all(frames.map((b) => sharp(b).metadata()));
  const factor = 204 / Math.max(...bounds.map((b) => b.height)),
    layers = [];
  for (let i = 0; i < sequence.length; i++) {
    const n = sequence[i],
      width = Math.round(bounds[n].width * factor),
      height = Math.round(bounds[n].height * factor);
    layers.push({
      input: await sharp(frames[n]).resize(width, height).png().toBuffer(),
      left: (i % 8) * 256 + Math.floor((256 - width) / 2),
      top: Math.floor(i / 8) * 256 + 244 - height,
    });
  }
  await sharp({
    create: { width: 2048, height: 512, channels: 4, background: "#00000000" },
  })
    .composite(layers)
    .webp({ lossless: true })
    .toFile(path.join(dest, name + "-v1.webp"));
  manifest[name] = {
    file: "/assets/" + name + "-v1.webp",
    frames: sequence.length,
    fps: 3,
  };
}
await fs.writeFile(
  path.join(dest, "manifest-v3.json"),
  JSON.stringify(manifest),
);
console.log(
  JSON.stringify({
    actions: ["sing", "eat_rice"],
    frames: sequence.length,
    fps: 3,
    frameSize: 256,
  }),
);
