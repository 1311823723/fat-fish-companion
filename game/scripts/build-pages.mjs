import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
const dest = path.resolve(ROOT, "state/pages-build");
if (dest !== path.join(ROOT, "state", "pages-build"))
  throw Error("构建目标异常");
const previous = await fs.lstat(dest).catch(() => null);
if (previous?.isSymbolicLink()) throw Error("构建目标不能是符号链接");
await fs.rm(dest, { recursive: true, force: true });
await fs.mkdir(dest, { recursive: true });
await fs.cp(path.join(ROOT, "dist"), dest, { recursive: true });
await fs.copyFile(
  path.join(ROOT, "deploy/worker.mjs"),
  path.join(dest, "_worker.js"),
);
await fs.writeFile(
  path.join(dest, "_routes.json"),
  JSON.stringify({ version: 1, include: ["/*"], exclude: [] }),
);
console.log(
  JSON.stringify({ pagesBuild: true, directory: "state/pages-build" }),
);
