import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { ROOT } from "../src/config.mjs";
const dest = path.resolve(
  process.argv[2] ||
    path.join(ROOT, "state/contributions", "home-actions-" + Date.now()),
);
const manifest = JSON.parse(
    await fs.readFile(
      path.join(ROOT, "public/assets/manifest-v3.json"),
      "utf8",
    ),
  ),
  animations = {},
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
await fs.mkdir(path.join(dest, "docs/previews"), { recursive: true });
for (const name of ["sing", "eat_rice"]) {
  const spec = manifest[name],
    folder = "ds_" + name,
    dir = path.join(dest, "app/assets/extra", folder);
  await fs.mkdir(dir, { recursive: true });
  const hashes = [],
    raw = [];
  for (let i = 0; i < spec.frames; i++) {
    const img = sharp(
        path.join(ROOT, "public", spec.file.replace(/^\//, "")),
      ).extract({
        left: (i % 8) * 256,
        top: Math.floor(i / 8) * 256,
        width: 256,
        height: 256,
      }),
      png = await img.clone().png().toBuffer();
    await fs.writeFile(
      path.join(dir, String(i).padStart(2, "0") + ".png"),
      png,
    );
    hashes.push(sha(png));
    raw.push(await img.clone().ensureAlpha().raw().toBuffer());
  }
  await sharp(Buffer.concat(raw), {
    raw: {
      width: 256,
      height: 256 * spec.frames,
      channels: 4,
      pageHeight: 256,
    },
  })
    .gif({
      loop: 0,
      delay: Array(spec.frames).fill(Math.round(1000 / spec.fps)),
    })
    .toFile(path.join(dest, "docs/previews", name + ".gif"));
  animations[folder] = {
    folder,
    frames: spec.frames,
    fps: spec.fps,
    loop: true,
    canvas: [256, 256],
    offset: [0, 0],
    baseline: 244,
    frame_sha256: hashes,
  };
}
await fs.writeFile(
  path.join(dest, "app/assets/extra/home-actions.json"),
  JSON.stringify(
    {
      sources: [
        {
          kind: "AI-assisted derivative",
          generator: "built-in imagegen",
          reference_sha256: sha(
            await fs.readFile(
              path.join(ROOT, "public/assets/reference-v1.png"),
            ),
          ),
          license: "CC BY-NC-SA 4.0",
        },
      ],
      animations,
    },
    null,
    2,
  ),
);
await fs.writeFile(
  path.join(dest, "README.md"),
  "# 哼歌与端碗吃米饭：动作贡献候选\n\n各 9 帧透明 PNG，256×256，3 fps，脚底基线 y=244，首尾可见像素一致。预览在 docs/previews。\n\n使用内置 imagegen 参照既有大肥鱼形象生成并整理，不是原作者绘制或已审核的素材。角色原设计：上善无形；DeepSeek 女仆二创：ZipZipPipe；参考动画来自 tndmgzo7/blue-fat-fish-desktop-pet。按 CC BY-NC-SA 4.0，署名、非商业、相同方式共享。\n\n哼歌只有动作，无音频；吃饭动作为正餐表现，扣库存与动画帧分离。元数据带逐帧 SHA-256。原播放器仍需注册加载入口，此包不宣称已接入其运行时，由维护者审核风格与适用性。不得覆盖原 atlas 或冒称原作者审核。\n",
);
console.log(
  JSON.stringify({
    dest,
    actions: Object.keys(animations),
    license: "CC BY-NC-SA 4.0",
  }),
);
