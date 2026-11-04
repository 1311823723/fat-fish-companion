export function imageFailureFromConversation(conversation) {
  const messages = Object.values(conversation?.mapping || {})
    .map((n) => n?.message)
    .filter((m) => m && ["assistant", "tool"].includes(m.author?.role));
  const text = messages
    .filter(
      (m) =>
        m.content?.content_type === "system_error" ||
        (m.author?.role === "assistant" && m.content?.content_type === "text"),
    )
    .flatMap((m) => [m.content?.text, ...(m.content?.parts || [])])
    .filter((x) => typeof x === "string")
    .join("\n");
  if (
    /(?:hit|reached)\s+(?:the\s+)?(?:Free\s+plan\s+)?limit\s+for\s+image\s+generation|image\s+generation(?:s)?\s+(?:requests?\s+)?(?:limit|quota)|生图额度.{0,10}(?:用完|耗尽)|(?:图片|图像)生成.{0,10}(?:限额|上限)/i.test(
      text,
    )
  ) {
    const match =
      /reset(?:s)?\s+in\s+(\d+(?:\.\d+)?)\s*(hours?|minutes?|seconds?)/i.exec(
        text,
      );
    const delay = match
      ? Number(match[1]) *
        (/^hour/i.test(match[2])
          ? 3600000
          : /^minute/i.test(match[2])
            ? 60000
            : 1000)
      : 24 * 3600000;
    const error = new Error("GPT 生图额度已用完，等待额度重置后自动重试");
    error.code = "image-quota";
    error.retryAfterMs =
      Math.min(48 * 3600000, Math.max(60000, delay)) + 5 * 60000;
    return error;
  }
  if (
    messages.some(
      (m) =>
        m.author?.role === "tool" && m.content?.content_type === "system_error",
    )
  ) {
    const error = new Error("GPT 绘图工具执行失败，未生成图片");
    error.code = "image-service";
    return error;
  }
  return null;
}
