import path from "node:path";
import { config, ROOT } from "../src/config.mjs";
import { Store } from "../src/core/store.mjs";
if (!process.argv.includes("--verified"))
  throw Error("请先在豆包网页亲自完成验证，再加 --verified 运行");
const c = config();
if (c.drawing?.fallbackProvider !== "doubao") throw Error("尚未启用豆包保底");
const s = new Store(path.resolve(ROOT, c.database || "state/world.db"));
try {
  s.db.exec("BEGIN IMMEDIATE");
  s.db.prepare("DELETE FROM meta WHERE key='drawingFallbackCooldown'").run();
  const r = s.db
    .prepare(
      "UPDATE outbox SET due=?,attempts=0 WHERE kind='photo' AND status='pending' AND result IN ('豆包需要网页验证','GPT生图额度已用完，等待重置','豆包生图额度暂不可用')",
    )
    .run(Date.now());
  s.db.exec("COMMIT");
  console.log(
    JSON.stringify({ resumed: r.changes, gptCooldownPreserved: true }),
  );
} catch (e) {
  s.db.exec("ROLLBACK");
  throw e;
} finally {
  s.close();
}
