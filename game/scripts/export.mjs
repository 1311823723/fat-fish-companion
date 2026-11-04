import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
const files = [
  "README.md",
  "DEPLOYMENT_AGENT.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "config.example.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "wrangler.jsonc",
  "start-game.bat",
];
const dirs = [
  "src",
  "scripts",
  "tests",
  "adapters",
  "deploy",
  "docs",
  "public",
];
const dest = path.join(ROOT, "release", "fatfish-game-" + Date.now());
await fs.mkdir(dest, { recursive: true });
const exported = [];
async function copy(source, relative) {
  relative = relative.replaceAll("\\", "/");
  const s = await fs.stat(source);
  if (s.isDirectory()) {
    for (const e of await fs.readdir(source))
      await copy(path.join(source, e), path.join(relative, e));
  } else {
    if (
      /\.(db|img|log|7z|zip|pth|onnx|pt|safetensors)$|config\.local|cookie|token$|backup/i.test(
        relative,
      ) &&
      relative !== "scripts/backup.mjs"
    )
      throw Error("禁止导出运行数据：" + relative);
    const b = await fs.readFile(source);
    if (/\.(mjs|ts|json|jsonc|md|html|css|txt)$/.test(relative)) {
      const text = b.toString();
      if (
        /(?:sk-[A-Za-z0-9_-]{25,}|gh[pousr]_[A-Za-z0-9_]{30,}|ngrok-free\.dev|D:[\\/]AI[\\/]qq-companion-test)/.test(
          text,
        )
      )
        throw Error("隐私扫描未通过：" + relative);
    }
    const target = path.join(dest, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, b);
    exported.push(relative.replaceAll("\\", "/"));
  }
}
for (const file of files) await copy(path.join(ROOT, file), file);
for (const dir of dirs) await copy(path.join(ROOT, dir), dir);
await copy(path.join(ROOT, ".gitignore"), ".gitignore");
await fs.writeFile(
  path.join(dest, "RELEASE-FILES.json"),
  JSON.stringify(exported.sort(), null, 2),
);
console.log(
  JSON.stringify({
    exported: true,
    files: exported.length,
    directory: dest,
    excluded: [
      "state",
      "config.local.json",
      "node_modules",
      "dist",
      "login profiles",
      "models",
      "logs",
      "backups",
      "test screenshots",
    ],
  }),
);
