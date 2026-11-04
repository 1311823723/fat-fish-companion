import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";
async function walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(js|css|html|json|svg)$/.test(p)) {
      const b = await fs.readFile(p);
      await fs.writeFile(p + ".gz", gzipSync(b, { level: 9 }));
      await fs.writeFile(p + ".br", brotliCompressSync(b));
    }
  }
}
await walk(fileURLToPath(new URL("../dist/", import.meta.url)));
