import fs from "node:fs";
import { config, ROOT } from "../src/config.mjs";
import path from "node:path";
const c = config();
const result = {
  node24: Number(process.versions.node.split(".")[0]) >= 24,
  built: fs.existsSync(path.join(ROOT, "dist/index.html")),
  configured: fs.existsSync(path.join(ROOT, "config.local.json")),
  core: false,
  portConflict: false,
  bridgeConfigured: !!c.bridge?.enabled,
  drawingConfigured: !!c.drawing?.enabled,
};
try {
  const response = await fetch("http://127.0.0.1:" + c.port + "/health", {
    signal: AbortSignal.timeout(3000),
  });
  result.portConflict = true;
  const health = await response.json();
  result.core =
    response.ok &&
    health.ok === true &&
    health.service === "fatfish-game" &&
    health.schema === 1;
  result.portConflict = !result.core;
} catch {}
console.log(JSON.stringify(result, null, 2));
if (
  !result.node24 ||
  !result.built ||
  !result.configured ||
  result.portConflict
)
  process.exitCode = 1;
