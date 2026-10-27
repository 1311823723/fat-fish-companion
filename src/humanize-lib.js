// 拟人化发送节奏：打字时长 / 条间停顿 / 深夜变慢。
//
// 对照 ai-companion-kit 的 Humanizer，他贴出来的真实效果是：
//   0ms     正在输入…
//   2357ms  发出：刚看到消息。你那事我想了一下，感觉不用太急
//   12072ms 正在输入…
//   13463ms 发出：明天先问问再说吧
// 注意第二条的间隔是 10 秒——她在"想"，不是在下一条的打字时间里。
// 所以这里分两个量：**打字时长**（发出前）和**条间停顿**（两条之间），
// 条间要明显长于打字，才像"说完一句、想了想、又补一句"。

const DEFAULTS = {
  // 打字：起身成本 + 每字耗时
  typingBaseMs: 700,
  typingPerCharMs: 85,
  typingMinMs: 500,
  // 上限 6 秒：100 字算出来会到 9 秒，而这个等待是**叠在每条消息前**的，
  // 发 5 条就是 45 秒——太久会撞上回合挂起看门狗，也不像人（真人一句话不会敲 9 秒）。
  typingMaxMs: 6000,
  // 条间：说完一句到开始打下一句
  gapMinMs: 900,
  gapMaxMs: 3200,
  // 深夜（她困了，手慢）
  nightSlowFactor: 1.6,
  nightStartHour: 23,
  nightEndHour: 8,
  // 随机度：固定值会像节拍器
  jitter: 0.35
};

function cfgOf(cfg) {
  const c = cfg ?? {};
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    typingBaseMs: num(c.typingBaseMs, DEFAULTS.typingBaseMs),
    typingPerCharMs: num(c.typingPerCharMs, DEFAULTS.typingPerCharMs),
    typingMinMs: num(c.typingMinMs, DEFAULTS.typingMinMs),
    typingMaxMs: num(c.typingMaxMs, DEFAULTS.typingMaxMs),
    gapMinMs: num(c.gapMinMs, DEFAULTS.gapMinMs),
    gapMaxMs: num(c.gapMaxMs, DEFAULTS.gapMaxMs),
    nightSlowFactor: num(c.nightSlowFactor, DEFAULTS.nightSlowFactor),
    nightStartHour: num(c.nightStartHour, DEFAULTS.nightStartHour),
    nightEndHour: num(c.nightEndHour, DEFAULTS.nightEndHour),
    jitter: Math.min(1, Math.max(0, num(c.jitter, DEFAULTS.jitter)))
  };
}

export function isNight(hour, c = DEFAULTS) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return false;
  // 跨零点：23 点之后 或 早上 8 点之前
  return h >= c.nightStartHour || h < c.nightEndHour;
}

function jittered(value, jitter) {
  const f = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(value * f));
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 打一句话要多久（毫秒）。
 * 长度按"字"算：中文一字一码，英文按单词粗略折算，避免长英文被算成超长。
 */
export function typingMs(text, cfg = {}, now = new Date()) {
  const c = cfgOf(cfg);
  const raw = String(text ?? '');
  const cjk = (raw.match(/[\u4e00-\u9fa5\u3040-\u30ff]/g) ?? []).length;
  const words = (raw.replace(/[\u4e00-\u9fa5\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9']+/g) ?? []).length;
  const units = cjk + words * 1.6 + (raw.length ? 1 : 0);
  let ms = c.typingBaseMs + units * c.typingPerCharMs;
  if (isNight(now.getHours(), c)) ms *= c.nightSlowFactor;
  return clamp(jittered(ms, c.jitter), c.typingMinMs, c.typingMaxMs);
}

/** 两条消息之间隔多久。刻意比打字时间长——中间那几秒是她在想。 */
export function gapMs(cfg = {}, now = new Date()) {
  const c = cfgOf(cfg);
  const base = c.gapMinMs + Math.random() * Math.max(0, c.gapMaxMs - c.gapMinMs);
  const ms = isNight(now.getHours(), c) ? base * c.nightSlowFactor : base;
  return Math.round(ms);
}
