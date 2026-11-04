import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { ROOT } from "../src/config.mjs";
if (Number(process.versions.node.split(".")[0]) < 24)
  throw Error("需要 Node.js 24 或更新版本");
const file = path.join(ROOT, "config.local.json");
if (fs.existsSync(file)) {
  console.log("已有本机配置，未覆盖。");
  process.exit(0);
}
const c = JSON.parse(
  fs.readFileSync(path.join(ROOT, "config.example.json"), "utf8"),
);
c.adapterSecret = crypto.randomBytes(32).toString("hex");
c.relaySecret = crypto.randomBytes(32).toString("hex");
if (!process.argv.includes("--defaults")) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const city = (await rl.question("天气城市名称（留空关闭天气）：")).trim();
  if (city) {
    const latitude = Number(await rl.question("纬度：")),
      longitude = Number(await rl.question("经度："));
    if (
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      throw Error("坐标无效");
    c.weather = { city, latitude, longitude };
  } else delete c.weather;
  rl.close();
} else delete c.weather;
fs.writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 });
console.log("本机配置已生成，凭据不会输出到终端。");
