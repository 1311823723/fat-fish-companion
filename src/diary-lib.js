// 日记本：她自己想说话的地方。
//
// 设计完全照 ai-companion-kit 作者的《进阶篇·让她自己写日记》，那三条规矩是精髓：
//   ① 别替她写 —— 只能限"一天最多几条、每条多长"，绝不能规定"今天要写什么"
//   ② 别固定时间 —— 每天 23:00 准时写一条叫打卡，不叫日记
//   ③ 别写成汇报 —— 工具描述里不能出现"你应该记录今天发生的事"
//
// 存储为什么是纯文本 .jsonl：
//   · 你能直接双击打开看
//   · 你能 grep（搜"梨"就翻出所有提到梨的日子）
//   · 你能手改（她写歪了你能修）
//   · 备份就是复制一个文件
//
// 只给两个动作：写一条、看最近几条。**删除和修改故意不提供**——
// 那是你的活，不是她的；给了她就会开始"整理"，那就不是日记了。

import fs from 'node:fs';
import path from 'node:path';

export const DIARY_VERSION = 1;

/** 把用户/模型给的自由文本压成单行（换行会破坏 jsonl 一行一条的结构）。 */
export function oneLine(value, max = 500) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, Number(max) || 500));
}

/** 本地时间戳：2026-10-17 03:20 —— 用本地时区，她写的是"她的晚上几点"。 */
export function stampNow(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function normalizeEntry(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  // 中英字段名都要认：文件里存的是中文键（给人看的），
  // 而调用方可能按英文键传进来。只认一边会导致"写进去是空的"——
  // 她第一次写日记就直接失败，而且看不出为什么。
  const content = oneLine(e.content ?? e.text ?? e['内容'] ?? '');
  if (!content) return null;
  return {
    时间: oneLine(e['时间'] ?? e.time ?? '', 30) || stampNow(),
    心情: oneLine(e['心情'] ?? e.mood ?? '', 20),
    内容: content,
    ...(e.scope ? { scope: oneLine(e.scope,40) } : {}),
    ...(e.sourceMessageId ? { sourceMessageId: oneLine(e.sourceMessageId,80) } : {})
  };
}

/**
 * 读日记。文件不存在是正常的（她还没写过），不算错误。
 * 文件坏了则抛错，交给调用方——不能悄悄当空文件，否则会把已有内容覆盖掉。
 */
export function loadDiary(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`日记读取失败（${error?.message ?? error}）`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out = [];
  let broken = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = normalizeEntry(JSON.parse(line));
      if (entry) out.push(entry);
      else broken += 1;
    } catch {
      broken += 1; // 单行坏了跳过，不连累整本
    }
  }
  if (broken) out.brokenLines = broken;
  return out;
}

/** 追加一条。用 appendFileSync 保证"只增不改"。 */
export function appendDiary(file, { content, mood = '', time = '', scope = '', sourceMessageId = '' }) {
  const entry = normalizeEntry({ 内容: content, 心情: mood, 时间: time, scope, sourceMessageId });
  if (!entry) throw new Error('内容是空的，没写');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  return entry;
}

/** 今天已经写了几条（用于"一天最多几条"的软限制）。 */
export function countToday(entries, date = new Date()) {
  const day = stampNow(date).slice(0, 10);
  return entries.filter((e) => String(e['时间'] ?? '').slice(0, 10) === day).length;
}

/** 格式化给她看：最近的在前，她一眼能看到自己上次写了什么。 */
export function formatEntries(entries, count) {
  const max = Math.max(1, Math.min(50, Number(count) || 5));
  const recent = entries.slice(-max).reverse();
  if (!recent.length) return '';
  return recent
    .map((e, i) => `${i + 1}. ${e['时间']}${e['心情'] ? `（${e['心情']}）` : ''} ${e['内容']}`)
    .join('\n');
}
