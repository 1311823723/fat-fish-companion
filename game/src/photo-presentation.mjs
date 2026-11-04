import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
export const DOUBAO_BOTTOM_RATIO = 0.035;
export function providerPhotoPrompt(scenePrompt, provider) {
  return provider === "doubao"
    ? scenePrompt +
        "\n构图安全边距：在画面底部额外预留约18%高度的自然地面或景色延伸区。人物全身、鞋、尾巴、背包和重要物体都放在底部18%区域以上；底部延伸区不要人物或重要细节。保持原来的拍照时间、天气、动作和角色参考，不要缩短或裁断人物。"
    : scenePrompt;
}
export async function saveTravelImage(
  bytes,
  id,
  provider,
  directory,
  { bottomRatio = DOUBAO_BOTTOM_RATIO } = {},
) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("图片编号错误");
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw Error("图片无法读取");
  let published = bytes,
    trimBottomPixels = 0;
  if (provider === "doubao") {
    if (!Number.isFinite(bottomRatio) || bottomRatio <= 0 || bottomRatio > 0.08)
      throw Error("底边裁剪比例无效");
    if (metadata.width < 512 || metadata.height < 512)
      throw Error("图片太小，未自动裁剪");
    trimBottomPixels = Math.ceil(metadata.height * bottomRatio);
    published = await sharp(bytes)
      .extract({
        left: 0,
        top: 0,
        width: metadata.width,
        height: metadata.height - trimBottomPixels,
      })
      .png()
      .toBuffer();
  }
  if (published.length > 12 * 1024 * 1024) throw Error("处理后图片过大");
  const thumb = await sharp(published)
    .resize(480, 480, { fit: "inside" })
    .webp({ quality: 80 })
    .toBuffer();
  const sourceHash = createHash("sha256")
      .update(bytes)
      .digest("hex")
      .slice(0, 16),
    assetVersion = createHash("sha256")
      .update(published)
      .digest("hex")
      .slice(0, 16);
  const info = {
    provider,
    assetVersion,
    sourceFile: id + ".source-" + sourceHash + ".img",
    processing: provider === "doubao" ? "doubao-bottom-crop-v1" : "original-v1",
    width: metadata.width,
    originalHeight: metadata.height,
    height: metadata.height - trimBottomPixels,
    trimBottomPixels,
  };
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(path.join(directory, info.sourceFile), bytes, {
      flag: "wx",
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  for (const [suffix, data] of [
    [".img", published],
    [".thumb.webp", thumb],
    [".meta.json", JSON.stringify(info)],
  ]) {
    const file = path.join(directory, id + suffix);
    await fs.writeFile(file + ".tmp", data);
    await fs.rename(file + ".tmp", file);
  }
  return info;
}
