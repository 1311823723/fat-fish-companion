// Reads only licensed static artwork; never copies runtime state or user data.
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const root = process.argv[2];
if (!root) throw Error("提供旧版项目路径");
const dest = new URL("../public/assets/", import.meta.url);
await fs.mkdir(dest, { recursive: true });
const html = await fs.readFile(
  path.join(root, "public/room-live.html"),
  "utf8",
);
const svg = html.match(/<svg class="room-art"[\s\S]*?<\/svg>/)?.[0];
if (!svg) throw Error("房间素材不存在");
const css = `<style>.outdoor-sky{fill:#bad0cc}.outdoor-hills{fill:#9eb79d}.outdoor-trees{fill:#819e89}.outdoor-moon,.outdoor-stars,.weather-clouds,.weather-rain,.weather-snow,.weather-fog,.weather-lightning,.closed-curtains,.tea-stock,.fridge-door,.warm-glow,#clockHour,#clockMinute{display:none}</style>`;
await sharp(Buffer.from(svg.replace(/<defs>/, "<defs>" + css)))
  .resize(900, 1200)
  .webp({ quality: 87 })
  .toFile(fileURLToPath(new URL("room-v1.webp", dest)));
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0],
  door = svg.match(/<g class="fridge-door">[\s\S]*?<\/g>/)[0];
await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">' +
      defs +
      '<g transform="translate(-230 110) scale(.9)">' +
      door +
      "</g></svg>",
  ),
)
  .webp()
  .toFile(fileURLToPath(new URL("fridge-door-v1.webp", dest)));
// Repack trimmed source frames into separate action sheets: idle + walk load first.
const atlas = JSON.parse(
  await fs.readFile(
    path.join(root, "public/room-assets/animations.json"),
    "utf8",
  ),
);
const raw = await fs.readFile(
  path.join(root, "public/room-assets/sprites.webp"),
);
const reference = atlas.animations.idle.frames[0];
await sharp(raw)
  .extract({
    left: reference.x,
    top: reference.y,
    width: reference.w,
    height: reference.h,
  })
  .png()
  .toFile(fileURLToPath(new URL("reference-v1.png", dest)));
const manifest = {};
for (const [name, anim] of Object.entries(atlas.animations)) {
  if (
    ![
      "idle",
      "walk_right",
      "walk_left",
      "sleep",
      "wake",
      "tea",
      "eat_taiyaki",
      "expr_smile",
      "expr_sad",
      "expr_angry",
      "expr_sleepy",
    ].includes(name)
  )
    continue;
  const n = anim.frames.length,
    cols = Math.min(8, n),
    rows = Math.ceil(n / cols),
    layers = [];
  for (let i = 0; i < n; i++) {
    const f = anim.frames[i];
    let crop = sharp(raw).extract({
      left: f.x,
      top: f.y,
      width: f.w,
      height: f.h,
    });
    if (f.flip) crop = crop.flop();
    layers.push({
      input: await crop.png().toBuffer(),
      left: (i % cols) * 256 + f.ox,
      top: Math.floor(i / cols) * 256 + f.oy,
    });
  }
  await sharp({
    create: {
      width: cols * 256,
      height: rows * 256,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(layers)
    .webp({ quality: 86 })
    .toFile(fileURLToPath(new URL(name + "-v1.webp", dest)));
  manifest[name] = {
    file: "/assets/" + name + "-v1.webp",
    fps: anim.fps,
    frames: n,
  };
}
await fs.writeFile(new URL("manifest-v1.json", dest), JSON.stringify(manifest));
for (const name of ["LICENSE.txt", "CREDITS.txt"])
  await fs.copyFile(
    path.join(root, "public/room-assets", name),
    new URL(name, dest),
  );
// Reuse existing, code-native food icons, independently from private content.
const js = await fs.readFile(path.join(root, "public/room-live.js"), "utf8");
const art = js.match(/const art=\{([\s\S]*?)\};/)?.[1] || "";
for (const m of art.matchAll(
  /(tomato|wings|pork|milk_tea|soup|lemon):'([^']+)'/g,
))
  await fs.writeFile(
    new URL(m[1] + "-v1.svg", dest),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 50">' +
      m[2] +
      "</svg>",
  );
for (const m of html.matchAll(
  /<button class="pet-action" data-action="(\w+)"[^>]*>(<svg[\s\S]*?<\/svg>)/g,
))
  await fs.writeFile(
    new URL("action-" + m[1] + "-v1.svg", dest),
    m[2].replace(
      "<svg",
      '<svg xmlns="http://www.w3.org/2000/svg" fill="#fff8e6"',
    ),
  );
console.log("仅提取房间、角色和食物静态素材，按动作拆分完成");
