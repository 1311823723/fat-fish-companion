// 图库：她自己的相册。
//
// 和「QQ 收藏表情」是两回事，别混：
//   · qq_collect_sticker = 存进 QQ 官方收藏表情，**只能收表情包**（sub_type=1），
//     照片/截图塞进去就是污染，用户手动删过两次（见 sticker-lib.js 里的注释）。
//   · qq_gallery_save    = 存进**她自己的本地相册**，什么图都行，重点是她给每张写的理由。
//
// 这一条的意义不在"图"，在于**她挑**（ai-companion-kit 进阶篇原话）：
//   你给她看一百张，她自己挑了三张 —— 那三张就是她的了。
// 所以工具只给"存她指定的那一张"，不做自动批量收集。
//
// 存储为什么是「图片文件 + index.jsonl」：
//   · 目录能直接双击翻（这是相册，不是数据库）
//   · 元数据是纯文本，能 grep 她写的理由
//   · 备份就是复制整个文件夹

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp'
};

export function oneLineText(value, max = 120) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, Number(max) || 120));
}

export function stampNow(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function extForMime(mime) {
  return EXT_BY_MIME[String(mime ?? '').toLowerCase()] || '.jpg';
}

export function makeId(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

export function normalizeItem(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const id = String(e.id ?? e['编号'] ?? '').trim();
  const file = String(e.file ?? e['文件名'] ?? '').trim();
  if (!id || !file) return null;
  return {
    id,
    file,
    时间: oneLineText(e['时间'] ?? e.time ?? '', 30) || stampNow(),
    理由: oneLineText(e['理由'] ?? e.note ?? '', 120),
    来源人: oneLineText(e['来源人'] ?? e.sender ?? '', 40),
    来源会话: oneLineText(e['来源会话'] ?? e.key ?? '', 40),
    原消息: String(e['原消息'] ?? e.messageId ?? '').trim(),
    是否表情包: e['是否表情包'] ?? e.isSticker === true,
    类型: oneLineText(e['类型'] ?? e.mime ?? '', 30),
    大小: Math.max(0, Number(e['大小'] ?? e.size) || 0)
  };
}

/** 读索引。文件不存在 = 相册还空着（正常），坏了则抛错交给调用方。 */
export function loadGallery(indexFile) {
  let text;
  try {
    text = fs.readFileSync(indexFile, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`图库索引读取失败（${error?.message ?? error}）`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out = [];
  let broken = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = normalizeItem(JSON.parse(line));
      if (item) out.push(item);
      else broken += 1;
    } catch {
      broken += 1;
    }
  }
  if (broken) out.brokenLines = broken;
  return out;
}

function writeIndex(indexFile, items) {
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  const tmp = `${indexFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, items.map((i) => JSON.stringify(i)).join('\n') + '\n', { encoding: 'utf8' });
    fs.renameSync(tmp, indexFile);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch {}
    throw error;
  }
}

/**
 * 存一张图。
 *
 * 先落图片文件再写索引：反过来的话，索引说有这张图、文件却没有，
 * 她以后"翻相册"会翻到一张打不开的死图。
 */
export function saveToGallery({ dir, indexFile, buffer, mime, note, sender, key, messageId, isSticker, date = new Date() }) {
  if (!buffer?.length) throw new Error('没拿到图片数据，没存成');
  const id = makeId(date);
  const name = `${id}${extForMime(mime)}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buffer);
  const item = normalizeItem({
    id,
    file: name,
    时间: stampNow(date),
    理由: note,
    来源人: sender,
    来源会话: key,
    原消息: messageId,
    是否表情包: Boolean(isSticker),
    类型: mime,
    大小: buffer.length
  });
  const items = loadGallery(indexFile);
  items.push(item);
  writeIndex(indexFile, items);
  return item;
}

/** 删一条（含图片文件）。返回是否真的删掉了。 */
export function removeFromGallery({ dir, indexFile, id }) {
  const items = loadGallery(indexFile);
  const idx = items.findIndex((i) => i.id === String(id).trim());
  if (idx < 0) return false;
  const [removed] = items.splice(idx, 1);
  writeIndex(indexFile, items);
  try {
    fs.unlinkSync(path.join(dir, String(removed.file)));
  } catch {
    // 图片文件已经不在了也要删掉索引条目，否则她会一直翻到一张不存在的图
  }
  return true;
}

export function countToday(items, date = new Date()) {
  const day = stampNow(date).slice(0, 10);
  return items.filter((i) => String(i['时间'] ?? '').slice(0, 10) === day).length;
}

/** 最近存入的在前——她刚放进去的那张应该第一眼就能看到。 */
export function formatItems(items, count) {
  const max = Math.max(1, Math.min(60, Number(count) || 8));
  if (!items.length) return '';
  const recent = items.slice(-max).reverse();
  return recent.map((i, n) => {
    const who = i['来源人'] ? `${i['来源人']}发的` : '来源不明';
    const kind = i['是否表情包'] ? '表情包' : '图';
    const size = i['大小'] ? `${Math.round(i['大小'] / 1024)}KB` : '';
    return `${n + 1}. [${i.id}] ${i['理由'] || '（没写理由）'} —— ${who}${kind}${size ? ` ${size}` : ''} ${i['时间']}`;
  }).join('\n');
}
