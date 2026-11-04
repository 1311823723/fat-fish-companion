import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function removeTestDirectory(directory) {
  const base = path.resolve(os.tmpdir());
  const target = path.resolve(directory);
  if (
    !target.startsWith(base + path.sep) ||
    !path.basename(target).startsWith("fatfish-")
  ) {
    throw new Error("Refusing cleanup outside the named test directory");
  }
  fs.rmSync(target, { recursive: true, force: true });
}
