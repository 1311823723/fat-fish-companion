// QQ 空间（说说）能力层：限流 + 文本清洗 + 列表格式化。
//
// 来源：核心限流参数与模型文案复用自 pinganbbOvO/ai-companion-kit（MIT）
// 的 packages/phone-mcp/src/phone-mcp.js。那套数字是他真机踩坑调出来的
// （他被腾讯限速过：20 条/分钟发了一整天，服务端直接不回包），不要为了
// "响应更快"去调大。本文件只做了两处本地化：
//   1) 限流状态**落盘**——博主是内存态，重启即清零；我们的桥接会频繁重启，
//      内存态等于"重启就能绕过当天配额"，对"发出去撤不回"的操作不可接受。
//   2) 底层调用换成桥接自己的 onebot()，不另起 MCP server。
//
// 设计红线（沿用博主）：**删除与拉黑故意不提供**。她只创作，不销毁。

import fs from 'node:fs';
import path from 'node:path';

// ── 限流：三档，各自独立 ────────────────────────────────────────────────
// 点赞/发说说：可撤回（有删除接口），宽一点
// 评论：撤不回（QQ 空间没有删评论接口），最严
// 逛别人空间：查询通道本身会被 QQ 限流，翻太快会被 WARN
export const QZONE_LIMIT = { perMinute: 3, perDay: 20 };
export const COMMENT_LIMIT = { perTenMin: 2, perDay: 10 };
export const VISIT_LIMIT = { perThreeMin: 5, perDay: 40 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function htmlToText(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 一个落盘的滑动窗口限流器。
 *
 * 为什么必须落盘：桥接没有守护进程，重启很常见（改配置就要重启）。
 * 内存态的计数器重启归零，等于给她一条"重启就能重刷当天配额"的捷径——
 * 而这类操作（评论）是发出去撤不回的。
 */
export class RateLimiter {
  constructor(file, { windowMs, windowMax, dayMax, label }) {
    this.file = file;
    this.windowMs = windowMs;
    this.windowMax = windowMax;
    this.dayMax = dayMax;
    this.label = label;
    this.hits = [];
    this.load();
  }

  load() {
    try {
      const text = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.hits)) this.hits = parsed.hits.filter((t) => Number.isFinite(t));
    } catch {
      this.hits = []; // 没文件或坏了 = 从零开始，不阻塞
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ hits: this.hits }), { encoding: 'utf8' });
      fs.renameSync(tmp, this.file);
    } catch {
      // 落盘失败不能变成"放行"或"卡死"：内存态继续工作即可
    }
  }

  /** @returns {string|null} 命中上限时返回给模型的人话，否则 null 并记一次 */
  check() {
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < DAY_MS);
    const inWindow = this.hits.filter((t) => now - t < this.windowMs).length;
    const winText = this.windowMs >= 60000
      ? `${Math.round(this.windowMs / 60000)} 分钟`
      : `${Math.round(this.windowMs / 1000)} 秒`;
    if (inWindow >= this.windowMax) {
      return `【限流】${this.label} ${winText}最多 ${this.windowMax} 次，稍后再来`;
    }
    if (this.hits.length >= this.dayMax) {
      return `【限流】${this.label} 每天最多 ${this.dayMax} 次，今天用完了`;
    }
    this.hits.push(now);
    this.save();
    return null;
  }

  status() {
    const now = Date.now();
    const today = this.hits.filter((t) => now - t < DAY_MS);
    return { used: today.length, max: this.dayMax, left: Math.max(0, this.dayMax - today.length) };
  }
}

// 归一化 SnowLuma 返回的说说列表：不同端点给的字段名不一样。
export function normalizeFeedList(data) {
  if (Array.isArray(data)) return data;
  return data?.msglist ?? data?.list ?? data?.feeds ?? [];
}

export function formatMyPosts(list, num) {
  return list.slice(0, num).map((x, i) => {
    const t = x.content || x.summary || x.text || '';
    return `${i + 1}. [tid=${x.tid ?? x.id ?? '?'}] ${String(t).slice(0, 70)}  赞${x.like_count ?? x.likenum ?? 0} 评${x.comment_count ?? x.cmtenum ?? 0}`;
  });
}

export function formatFeeds(list, count) {
  return list.slice(0, count).map((x, i) => {
    const who = x.nickname || x.name || x.uin || x.user_id || '?';
    const txt = htmlToText(x.html ?? x.content ?? x.summary ?? x.text ?? '').slice(0, 60);
    const pics = (x.pic || x.images || []).length;
    return `${i + 1}. [tid=${x.key ?? x.tid ?? x.id ?? '?'}] [uin=${x.uin ?? x.user_id ?? '?'}] ${who}: ${txt}${pics ? ` (${pics}图)` : ''}  赞${x.like_count ?? x.likenum ?? 0} 评${x.comment_count ?? x.cmtenum ?? 0}`;
  });
}

export function formatUserPosts(list, num) {
  return list.slice(0, num).map((x, i) => {
    const txt = htmlToText(x.content ?? x.summary ?? x.html ?? '').slice(0, 70);
    return `${i + 1}. [tid=${x.tid ?? x.key ?? '?'}] ${txt || '(无文字，可能是图片说说)'}  赞${x.like_count ?? x.likenum ?? 0} 评${x.comment_count ?? x.cmtenum ?? 0}`;
  });
}

// 把 SnowLuma/QQ 的报错翻译成她看得懂、且知道该怎么办的话。
export function explainQzoneError(error, action) {
  const msg = String(error?.message ?? error);
  if (/-10031|保密|没有权限/.test(msg)) {
    return `对方的空间设了权限（QQ 提示「主人设置了保密」），看不了 —— 这是正常的，换个目标，别提这事、别反复试同一个`;
  }
  if (/rate-limited|限流|频繁/.test(msg)) {
    return `查得太快被 QQ 限流了，歇几分钟再看（别一口气翻一群人）`;
  }
  return `${action}失败：${msg.slice(0, 160)}`;
}
