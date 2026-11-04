import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(process.argv[2] || "");
if (
  !process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).name !==
    "dsh-doubao-image-free"
)
  throw Error("请指定 dsh-doubao-image-free 插件目录");
const file = path.join(root, "lib/gpt-free.mjs"),
  index = path.join(root, "index.js");
let source = fs.readFileSync(file, "utf8"),
  host = fs.readFileSync(index, "utf8");
if (!source.includes("imageFailureFromConversation")) {
  const anchor =
    "      images = extractImagesFromConversation(conversation, conversationId);";
  if (
    !source.includes(anchor) ||
    !source.includes("  let async = parsed.asyncStatus > 0;")
  )
    throw Error("插件版本不兼容，未修改");
  source =
    'import {imageFailureFromConversation} from "./gpt-result.mjs";\n' + source;
  source = source.replace(
    "  let async = parsed.asyncStatus > 0;",
    "  let async = parsed.asyncStatus > 0 || (images.length === 0 && !!conversationId && !parsed.blocked && parsed.toolInvoked !== false);",
  );
  source = source.replace(
    anchor,
    "      const failure = imageFailureFromConversation(conversation);\n      if (failure) throw failure;\n" +
      anchor,
  );
}
const old =
    'return sendJson(res, 200, { ok: false, reason: "generate-failed", message: errText(error) });',
  next =
    'return sendJson(res, 200, { ok: false, reason: "generate-failed", message: errText(error), ...(error?.code === "image-quota" ? { errorCode: "image-quota", retryAfterMs: error.retryAfterMs } : {}) });';
if (host.includes(old)) host = host.replaceAll(old, next);
else if (!host.includes('errorCode: "image-quota"'))
  throw Error("错误返回接口不兼容，未修改");
const stamp = Date.now();
fs.copyFileSync(file, file + ".backup-" + stamp);
fs.copyFileSync(index, index + ".backup-" + stamp);
fs.copyFileSync(
  fileURLToPath(new URL("../adapters/gpt-image-result.mjs", import.meta.url)),
  path.join(root, "lib/gpt-result.mjs"),
);
fs.writeFileSync(file, source);
fs.writeFileSync(index, host);
console.log("绘图结果与额度识别补丁已应用，请在空闲时重启 DSH。");
