import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/config.mjs";
import { extractSheet } from "./sprite-sheet.mjs";
const [patFile, spinFile] = process.argv.slice(2);
if (!patFile || !spinFile) throw Error("需要摸头与转圈两份图集");
const dest = path.join(ROOT, "public/assets"),
  manifest = JSON.parse(
    await fs.readFile(path.join(dest, "manifest-v3.json"), "utf8"),
  );
for (const [name, file, columns, rows, sequence, fps] of [
  ["headpat", patFile, 3, 2, [0, 1, 2, 3, 4, 5, 0], 4],
  ["spin", spinFile, 3, 3, [0, 1, 2, 3, 4, -3, -2, -1, 0], 8],
]) {
  const frames = await extractSheet(file, columns, rows),
    bounds = await Promise.all(frames.map((b) => sharp(b).metadata())),
    factor =
      204 /
      Math.max(
        ...bounds.slice(0, name === "spin" ? 5 : 6).map((b) => b.height),
      ),
    layers = [];
  for (let i = 0; i < sequence.length; i++) {
    const index = Math.abs(sequence[i]),
      width = Math.round(bounds[index].width * factor),
      height = Math.round(bounds[index].height * factor);
    let frame = sharp(frames[index]);
    if (sequence[i] < 0) frame = frame.flop();
    layers.push({
      input: await frame.resize(width, height).png().toBuffer(),
      left: (i % 8) * 256 + Math.floor((256 - width) / 2),
      top: Math.floor(i / 8) * 256 + 244 - height,
    });
  }
  await sharp({
    create: {
      width: 2048,
      height: Math.ceil(sequence.length / 8) * 256,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(layers)
    .webp({ lossless: true })
    .toFile(path.join(dest, name + "-v1.webp"));
  manifest[name] = {
    file: "/assets/" + name + "-v1.webp",
    frames: sequence.length,
    fps,
    once: true,
  };
}
await fs.writeFile(
  path.join(dest, "manifest-v4.json"),
  JSON.stringify(manifest),
);
console.log(JSON.stringify({ headpatFrames: 7, spinFrames: 9, once: true }));
