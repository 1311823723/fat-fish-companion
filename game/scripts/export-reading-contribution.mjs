import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { ROOT } from "../src/config.mjs";
const dest = path.resolve(
  process.argv[2] ||
    path.join(ROOT, "state/contributions", "reading-" + Date.now()),
);
await fs.mkdir(path.join(dest, "app/assets/extra/ds_readbook"), {
  recursive: true,
});
await fs.mkdir(path.join(dest, "docs/previews"), { recursive: true });
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sheet = path.join(ROOT, "public/assets/read-v1.webp"),
  hashes = [],
  raw = [];
for (let i = 0; i < 12; i++) {
  const frame = sharp(sheet).extract({
    left: (i % 8) * 256,
    top: Math.floor(i / 8) * 256,
    width: 256,
    height: 256,
  });
  const png = await frame.clone().png().toBuffer();
  hashes.push(sha(png));
  raw.push(await frame.clone().ensureAlpha().raw().toBuffer());
  await fs.writeFile(
    path.join(
      dest,
      "app/assets/extra/ds_readbook",
      String(i).padStart(2, "0") + ".png",
    ),
    png,
  );
}
await sharp(Buffer.concat(raw), {
  raw: { width: 256, height: 256 * 12, channels: 4, pageHeight: 256 },
})
  .gif({ loop: 0, delay: Array(12).fill(333) })
  .toFile(path.join(dest, "docs/previews/readbook.gif"));
const reference = await fs.readFile(
  path.join(ROOT, "public/assets/reference-v1.png"),
);
await fs.writeFile(
  path.join(dest, "app/assets/extra/readbook.json"),
  JSON.stringify(
    {
      sources: [
        {
          kind: "AI-assisted derivative",
          generator: "built-in imagegen",
          reference: "blue-fat-fish reference sprite",
          reference_sha256: sha(reference),
          license: "CC BY-NC-SA 4.0",
        },
      ],
      animations: {
        ds_readbook: {
          folder: "ds_readbook",
          frames: 12,
          fps: 3,
          loop: true,
          canvas: [256, 256],
          offset: [0, 0],
          baseline: 244,
          frame_sha256: hashes,
        },
      },
    },
    null,
    2,
  ),
);
await fs.writeFile(
  path.join(dest, "README.md"),
  `# 翻书动作素材贡献候选\n\n12 帧透明 PNG，256×256，3 fps 循环，脚底基线 y=244，首尾可见像素相同。预览见 docs/previews/readbook.gif。\n\n这是参照既有大肥鱼角色制作的 AI 辅助衍生动作，包含切片、透明离散噪点清理与对齐，不是原角色作者手绘或已审核的素材。角色原设计：上善无形；DeepSeek 女仆二创：ZipZipPipe；参考动画来自 tndmgzo7/blue-fat-fish-desktop-pet。按 CC BY-NC-SA 4.0，署名、非商业、相同方式共享；不以 MIT 授权角色素材。\n\n目录与原仓库逐帧素材的组织方式接近，readbook.json 包含元数据和逐帧 SHA-256。原播放器仍需注册新动作及相应加载入口；此候选包不宣称已经接入原播放器。由维护者判断风格、动作质量与 AI 辅助素材是否适合收录。请从 fork 建独立功能分支贡献，勿覆盖原 atlas 或 activities.json。\n\n小屋已经在自身 manifest 中按需加载此动作，原有角色帧未改动。\n`,
);
console.log(
  JSON.stringify({
    directory: dest,
    frames: 12,
    fps: 3,
    license: "CC BY-NC-SA 4.0",
    upstreamIntegration: "requires-review-and-registration",
  }),
);
