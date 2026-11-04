import test from "node:test";
import assert from "node:assert/strict";
import { drawScene } from "../src/drawing.mjs";
import { freezeScene } from "../src/core/scene.mjs";
import { fileURLToPath } from "node:url";

test("drawing always attaches identity reference and hides raw provider diagnostics", async () => {
  const scene = freezeScene(
    {
      id: "11111111-1111-4111-8111-111111111111",
      place: { scene: "covered city park" },
      intent: { reason: "想去看看树叶" },
      backpack: [],
      food: { id: "none" },
    },
    null,
    [],
    Date.now(),
  );
  const calls = [];
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ route: new URL(url).pathname, body });
    return {
      ok: true,
      json: async () =>
        String(url).endsWith("import")
          ? { ok: true, attachment: { attachmentId: "test-reference" } }
          : {
              ok: false,
              message: "未从响应中解析到图片 SSE token=private-provider-data",
            },
    };
  };
  await assert.rejects(
    () =>
      drawScene(
        scene,
        {
          baseUrl: "http://127.0.0.1:3080/api/",
          referenceFile: fileURLToPath(
            new URL("../public/assets/reference-v1.png", import.meta.url),
          ),
        },
        "unused-output",
        fetcher,
      ),
    (e) =>
      e.message === "图片生成失败：绘图服务未返回图片" &&
      !e.message.includes("private-provider-data"),
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.mode, "edit");
  assert.equal(calls[1].body.provider, "gpt");
  assert.equal(calls[1].body.references.length, 1);
  assert.match(calls[1].body.prompt, /NO lunchbox in hands/);
});
