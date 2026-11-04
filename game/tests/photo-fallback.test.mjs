import test from "node:test";
import assert from "node:assert/strict";
import { drawTravelPhoto } from "../src/photo-router.mjs";
import { drawScene, safeDrawingFailure } from "../src/drawing.mjs";
import { Store } from "../src/core/store.mjs";
import { fileURLToPath } from "node:url";
const scene = {
  id: "11111111-1111-4111-8111-111111111111:photo",
  place: { scene: "covered park" },
  capturedAt: Date.now(),
  phase: "day",
  intent: { reason: "散步" },
};
const cfg = {
  provider: "gpt",
  fallbackProvider: "doubao",
  referenceFile: "fixed-reference.png",
};
test("GPT quota switches to Doubao with the identical frozen scene and reference, then resumes GPT", async () => {
  let now = Date.now();
  const store = new Store(":memory:", () => now);
  store.drawingFallback = true;
  const calls = [];
  const draw = async (s, c) => {
    calls.push(c.provider);
    assert.equal(s, scene);
    assert.equal(c.referenceFile, cfg.referenceFile);
    if (c.provider === "gpt" && calls.length === 1) {
      const e = new Error("quota");
      e.code = "DRAWING_QUOTA";
      e.retryAfterMs = 3600000;
      throw e;
    }
    return "photo-id";
  };
  try {
    assert.equal(
      (await drawTravelPhoto(scene, cfg, "unused", store, draw)).provider,
      "doubao",
    );
    assert.equal(store.drawingState().waiting, false);
    assert.equal(store.drawingState().gptLimited, true);
    assert.equal(
      (await drawTravelPhoto(scene, cfg, "unused", store, draw)).provider,
      "doubao",
    );
    assert.deepEqual(calls, ["gpt", "doubao", "doubao"]);
    now += 3600001;
    assert.equal(
      (await drawTravelPhoto(scene, cfg, "unused", store, draw)).provider,
      "gpt",
    );
  } finally {
    store.close();
  }
});
test("ambiguous GPT timeouts do not trigger duplicate generation in fallback", async () => {
  const store = new Store();
  const providers = [];
  try {
    await assert.rejects(() =>
      drawTravelPhoto(scene, cfg, "unused", store, async (s, c) => {
        providers.push(c.provider);
        throw Error("TimeoutError");
      }),
    );
    assert.deepEqual(providers, ["gpt"]);
    assert.equal(store.drawingState().waiting, false);
  } finally {
    store.close();
  }
});
test("Doubao verification is not misclassified as quota and pauses fallback until manual verification or GPT recovery", async () => {
  const store = new Store();
  store.drawingFallback = true;
  try {
    store.pauseDrawingProvider("gpt", 14 * 3600000);
    let n = 0;
    await assert.rejects(
      () =>
        drawScene(
          scene,
          {
            baseUrl: "http://localhost/api/",
            provider: "doubao",
            referenceFile: fileURLToPath(
              new URL("../public/assets/reference-v1.png", import.meta.url),
            ),
          },
          "unused",
          async () => ({
            ok: true,
            json: async () =>
              ++n === 1
                ? { ok: true, attachment: {} }
                : {
                    ok: false,
                    message:
                      "豆包 gateway error 710022004 rate limited needs verification",
                  },
          }),
        ),
      (e) => {
        const failure = safeDrawingFailure(e);
        assert.equal(e.code, "DRAWING_VERIFICATION");
        assert.equal(failure.provider, "doubao");
        assert.equal(failure.rateLimited, false);
        assert.equal(failure.verificationRequired, true);
        store.enqueue("photo:verification", "photo", {});
        store.retryPhoto("photo:verification", failure);
        return true;
      },
    );
    assert.equal(store.drawingState().verificationRequired, true);
    assert.equal(store.claim("photo"), null);
    assert.equal(store.snapshot().drawing.waiting, true);
  } finally {
    store.close();
  }
});
