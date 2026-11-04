import { drawScene } from "./drawing.mjs";
export async function drawTravelPhoto(
  scene,
  config,
  directory,
  store,
  draw = drawScene,
) {
  const primary = config.provider || "gpt";
  const fallback =
    primary === "gpt" && config.fallbackProvider === "doubao" ? "doubao" : null;
  const run = async (provider) => {
    try {
      return {
        id: await draw(scene, { ...config, provider }, directory),
        provider,
      };
    } catch (error) {
      error.provider = provider;
      throw error;
    }
  };
  const state = store.drawingState();
  if (primary === "gpt" && state.gptLimited) {
    if (fallback) return run(fallback);
    const error = new Error("GPT生图额度已用完，等待重置");
    error.code = "DRAWING_QUOTA";
    error.provider = "gpt";
    error.retryAfterMs = Math.max(60000, state.gptRetryAt - store.clock());
    throw error;
  }
  try {
    return await run(primary);
  } catch (error) {
    if (primary !== "gpt" || error.code !== "DRAWING_QUOTA") throw error;
    store.pauseDrawingProvider("gpt", error.retryAfterMs);
    if (!fallback) throw error;
    return run(fallback);
  }
}
