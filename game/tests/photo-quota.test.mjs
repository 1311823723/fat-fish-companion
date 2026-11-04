import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/core/store.mjs";
import { imageFailureFromConversation } from "../adapters/gpt-image-result.mjs";
import { drawScene, safeDrawingFailure } from "../src/drawing.mjs";
import { fileURLToPath } from "node:url";
test("quota is read from tool errors, ignores user text and hides raw details", () => {
  const text =
    "You've hit the Free plan limit for image generations requests. You can create more images when the limit resets in 14 hours. private-provider-data";
  const message = {
    author: { role: "tool" },
    content: { content_type: "system_error", text },
  };
  const error = imageFailureFromConversation({
    mapping: { tool: { message } },
  });
  assert.equal(error.code, "image-quota");
  assert.equal(error.retryAfterMs, 14 * 3600000 + 300000);
  assert.ok(!error.message.includes("private-provider-data"));
  assert.equal(
    imageFailureFromConversation({
      mapping: { user: { message: { ...message, author: { role: "user" } } } },
    }),
    null,
  );
});
test("drawing passes quota cooldown without exposing provider replies", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      drawScene(
        {
          place: { scene: "covered park" },
          capturedAt: Date.now(),
          phase: "day",
          intent: { reason: "散步" },
        },
        {
          baseUrl: "http://localhost/api/",
          referenceFile: fileURLToPath(
            new URL("../public/assets/reference-v1.png", import.meta.url),
          ),
        },
        "unused",
        async () => ({
          ok: true,
          json: async () =>
            ++calls === 1
              ? { ok: true, attachment: {} }
              : {
                  ok: false,
                  errorCode: "image-quota",
                  retryAfterMs: 14 * 3600000 + 300000,
                  message: "quota private-provider-data",
                },
        }),
      ),
    (error) => {
      const safe = safeDrawingFailure(error);
      assert.equal(safe.rateLimited, true);
      assert.equal(safe.retryAfterMs, 14 * 3600000 + 300000);
      assert.ok(!JSON.stringify(safe).includes("private-provider-data"));
      return true;
    },
  );
});
test("quota cooldown survives restart, blocks every photo job and resumes automatically", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-quota-")),
    file = path.join(dir, "world.db");
  let now = Date.now(),
    s = new Store(file, () => now);
  try {
    s.enqueue("photo:one", "photo", {});
    s.enqueue("photo:two", "photo", {});
    s.enqueue("share:test", "share", {});
    const job = s.claim("photo");
    s.db.prepare("UPDATE outbox SET attempts=3 WHERE id=?").run(job.id);
    s.retryPhoto(job.id, {
      rateLimited: true,
      retryAfterMs: 14 * 3600000 + 300000,
      reason: "GPT生图额度已用完，等待重置",
    });
    const due = s.drawingState().retryAt;
    assert.equal(
      s.db.prepare("SELECT status FROM outbox WHERE id=?").get(job.id).status,
      "pending",
    );
    s.close();
    s = new Store(file, () => now);
    assert.equal(s.claim("photo"), null);
    assert.equal(s.claimId("photo:two"), null);
    assert.ok(s.claim("share"));
    assert.equal(s.snapshot().drawing.waiting, true);
    now = due + 1;
    assert.ok(s.claim("photo"));
    assert.equal(s.drawingState().waiting, false);
  } finally {
    s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
