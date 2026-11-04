import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export function config() {
  let c = {};
  try {
    c = JSON.parse(
      fs.readFileSync(path.join(ROOT, "config.local.json"), "utf8"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw Error("本机配置格式错误");
  }
  return {
    port: 3103,
    host: "127.0.0.1",
    allowedOrigins: ["http://127.0.0.1:3103", "http://127.0.0.1:5174"],
    ...c,
  };
}
