import fs from "node:fs/promises";
import path from "node:path";
import { imagePrompt } from "./core/scene.mjs";
export async function drawScene(
  scene,
  { baseUrl, referenceFile, provider = "gpt" },
  directory,
  fetcher = fetch,
) {
  const base = new URL(baseUrl);
  if (!["127.0.0.1", "localhost"].includes(base.hostname))
    throw Error("绘图地址必须是本机插件");
  async function post(name, body, timeout = 30000) {
    const r = await fetcher(new URL(name, base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) throw Error("绘图服务未就绪");
    return r;
  }
  const raw = await fs.readFile(referenceFile),
    ref = await (
      await post("import", {
        name: "fatfish-reference.png",
        dataUrl: "data:image/png;base64," + raw.toString("base64"),
      })
    ).json();
  if (!ref.ok || !ref.attachment) throw Error("参考图导入失败");
  const r = await (
    await post(
      "regenerate",
      {
        provider,
        mode: "edit",
        ratio: "1:1",
        references: [ref.attachment],
        prompt: imagePrompt(scene),
      },
      240000,
    )
  ).json();
  if (!r.ok || !r.attachment) {
    const raw = String(r.message || r.reason || "");
    const reason = /quota|rate.limit|额度|限额/i.test(raw)
      ? "服务限额"
      : /未从响应中解析到图片|no.image/i.test(raw)
        ? "绘图服务未返回图片"
        : /auth|login|登录/i.test(raw)
          ? "需要重新登录"
          : "服务暂不可用";
    const error = new Error("图片生成失败：" + reason);
    if (r.errorCode === "image-quota" || reason === "服务限额") {
      error.code = "DRAWING_QUOTA";
      error.retryAfterMs = Number.isFinite(r.retryAfterMs)
        ? Math.min(48 * 3600000 + 300000, Math.max(60000, r.retryAfterMs))
        : 24 * 3600000;
    }
    throw error;
  }
  const result = await post("image", { attachment: r.attachment }),
    buf = Buffer.from(await result.arrayBuffer());
  if (buf.length < 1024 || buf.length > 12 * 1024 * 1024)
    throw Error("图片大小异常");
  const id = scene.id.split(":")[0];
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error("图片编号错误");
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, id + ".img");
  await fs.writeFile(target + ".tmp", buf);
  await fs.rename(target + ".tmp", target);
  const sharp = (await import("sharp")).default;
  await sharp(buf)
    .resize(480, 480, { fit: "inside" })
    .webp({ quality: 80 })
    .toFile(path.join(directory, id + ".thumb.webp"));
  return id;
}

export function safeDrawingFailure(error) {
  const quota = error?.code === "DRAWING_QUOTA";
  const message = String(error?.message || "");
  return {
    rateLimited: quota,
    retryAfterMs: quota ? error.retryAfterMs : 2 * 3600000,
    reason: quota
      ? "GPT生图额度已用完，等待重置"
      : /绘图服务未返回图片/.test(message)
        ? "绘图服务未返回图片"
        : /需要重新登录/.test(message)
          ? "需要重新登录"
          : /Timeout|timed out|abort/i.test(message)
            ? "绘图请求超时"
            : "绘图服务暂不可用",
  };
}
