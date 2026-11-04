import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT, config } from "../src/config.mjs";
const c = config(),
  database = path.resolve(ROOT, c.database || "state/world.db"),
  dir = path.join(
    ROOT,
    "state/backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
await fs.mkdir(dir, { recursive: true });
const db = new DatabaseSync(database);
await backup(db, path.join(dir, "world.db"));
db.close();
try {
  await fs.cp(path.join(ROOT, "state/photos"), path.join(dir, "photos"), {
    recursive: true,
  });
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
console.log("已在本机 state/backups 保存一致性数据库和照片备份。");
