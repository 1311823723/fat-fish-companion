// 人账 · 按「人」存记忆，而不是按「会话」存
//
// 桥接自带的记忆（social-v2.json）是【按会话】存的：私聊一份、每个群各一份。
// 后果是同一个人换了地方，AI 就当他没见过——在群里像是"重新认识"一遍。
//
// 这里改成【按 QQ 号】存一本总账。不管他出现在私聊、群 A 还是群 B，
// 读写的是同一份记录。唤醒时把相关的人翻出来拼进提示词，
// 于是"你在群里也认得他"。
//
// 账里存什么：
//   name / aliases  他叫什么（群名片会变，所以存多个）
//   impression      你对他的一句话印象（会过期、要重写）  "嘴上嫌我笨其实一直给我加功能"
//                     ├ text / at / rev / atInteractions / history[]
//                     └ 跟 traits 的区别：traits 是流水账（发生过什么事），
//                        impression 是她自己归纳的一句话判断 —— 人会变，所以要定期重写
//   traits          发生过的事（流水账）        "发图片数学题来问我"
//   facts           他告诉过你的事实            "养了只叫豆豆的猫"
//   topics          你们聊过的话题（滚动，老的丢掉）
//   pending         你想对他说但还没说的话
//   interactions    互动过多少次
//   firstSeenAt / lastSeenAt
//   groups          在哪些群见过他（用来判断"这个群里该翻谁的账"）
import fs from 'node:fs';
import path from 'node:path';
import { mediaKindLabel } from './sticker-lib.js';

export const PEOPLE_DEFAULTS = {
  enabled: true,
  // 群聊里，互动次数达到多少才算"常聊的人"（管理员不看这个门槛）
  minInteractions: 6,
  // 单次最多注入几个人的账（控制提示词长度）
  maxInjectPeople: 6,
  maxTraits: 20,
  maxFacts: 30,
  maxTopics: 20,
  maxPending: 12,
  // 每条记录最多几个字
  lineChars: 120,
  // ── 印象层 ────────────────────────────────────────────────────────────
  // 一句话印象最多几个字。必须短 —— 长了她就把流水账搬进来了，
  // 那是 traits 的活。短的才叫「判断」，长的只是记录。
  impressionChars: 60,
  // 印象写满多少天算过期。人是会变的，三个月前写的不该一直用。
  impressionTtlDays: 7,
  // 互动不到这么多次的人，不催她写印象（还没聊够，写出来的也是瞎猜）
  impressionMinInteractions: 4,
  // 印象过期后，又新攒够这么多次互动才催重写 —— 没新素材就重写，
  // 等于让她把同一句话再抄一遍。
  impressionRenewInteractions: 8,
  // 保留几条旧印象。留着不是为了注入提示词（太长），
  // 是为了她自己翻的时候能看见「他以前是这样的，现在变了」。
  maxImpressionHistory: 3,
  // 账本总人数上限，超了删最久没见的
  maxPeople: 300,
  // 超过这么久没见、且没到常聊门槛的，清掉
  pruneAfterDays: 60,
  // 跨场合近况：把别的会话最近几句带过来（关掉就是各群互不串味）
  crossContext: true,
  crossContextMaxLines: 6
};

const ID_RE = /^\d{5,12}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function arr(v) {
  return Array.isArray(v) ? v : [];
}
// 按【码点】截断，避免把 emoji 切成半个代理对（半代理 = 非法 UTF-8，上游会直接 400）
function safeSlice(s, n) {
  const str = String(s ?? '');
  const a = Array.from(str);
  return a.length <= n ? str : a.slice(0, n).join('') + '…';
}
function stripLoneSurrogates(s) {
  return String(s ?? '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '?')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '?');
}
const CTRL_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\uFEFF]/g;
const PLACEHOLDER_NAMES = new Set(['私聊', '未知', '某人', '群友', '我', '对方', '']);
function clean(v, n) {
  return safeSlice(stripLoneSurrogates(String(v ?? '').replace(CTRL_RE, '').replace(/\s+/g, ' ').trim()), n);
}
/**
 * 昵称清洗。QQ 昵称里真的会塞进控制字符、零宽字符和乱码字节
 * （实测见过 "\n\t\n\u0007$ǿĀ4\u0007…\u0006欣梅\u0010\u0000" 这种）。
 * 这些东西混进提示词里轻则让模型读串，重则把 JSON 搞坏，所以在入库前就切干净。
 */
function pickCjkCore(s) {
  const runs = [...s.matchAll(/[\u3400-\u4dbf\u4e00-\u9fff]+/g)].map((m) => m[0]);
  if (!runs.length) return s;
  let best = runs[0];
  for (const r of runs) if (r.length > best.length) best = r;
  // 汉字主体以外的部分只剩一两个字符时，那基本是乱码残留，丢掉只留汉字；
  // 否则说明是人家昵称里正经的前后缀（"AAA打坑侠玛机雅娜"），老老实实保留
  const rest = s.split(best).join('').replace(/\s/g, '');
  return rest.length <= 2 ? best : s;
}
function cleanName(v, n = 24) {
  let s = String(v ?? '').replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim();
  // 有汉字时只保留「汉字 + 数字字母 + 常用标点」，把乱码字节剔掉；没有汉字就原样留着
  if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(s)) {
    s = s.replace(/[^\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff00-\uffef0-9A-Za-z ]/g, '').replace(/\s+/g, ' ').trim();
    s = pickCjkCore(s);
  }
  return safeSlice(stripLoneSurrogates(s), n);
}
function usableName(v) {
  const s = String(v ?? '').trim();
  return !!s && !PLACEHOLDER_NAMES.has(s);
}

/**
 * 印象归一化。
 * 兼容三种写法：没有（null）、旧版本可能是个裸字符串、以及现在的完整对象。
 * 不做兼容的话，她第一次写印象就会撞上"读出来 undefined"然后失败。
 */
function normalizeImpression(raw, cap) {
  const empty = { text: '', at: 0, rev: 0, atInteractions: 0, history: [] };
  if (!raw) return empty;
  if (typeof raw === 'string') {
    const t = clean(raw, cap);
    return t ? { text: t, at: 0, rev: 1, atInteractions: 0, history: [] } : empty;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const text = clean(raw.text ?? raw.content ?? raw.value, cap);
  if (!text) return empty;
  const history = [];
  for (const h of arr(raw.history)) {
    if (!h || typeof h !== 'object') continue;
    const ht = clean(h.text ?? h.value, cap);
    if (!ht || ht === text) continue;
    if (history.some((x) => x.text === ht)) continue;
    history.push({ text: ht, at: Number(h.at) || 0 });
  }
  return {
    text,
    at: Number(raw.at ?? raw.writtenAt ?? raw.updatedAt) || 0,
    rev: Math.max(1, Number(raw.rev ?? raw.version) || 1),
    atInteractions: Number(raw.atInteractions ?? raw.interactions) || 0,
    history
  };
}

export function normalizePeopleConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { ...PEOPLE_DEFAULTS };
  const num = (v, d, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
  };
  if (src.enabled !== undefined) out.enabled = src.enabled === true;
  out.minInteractions = num(src.minInteractions, PEOPLE_DEFAULTS.minInteractions, 1, 1000);
  out.maxInjectPeople = num(src.maxInjectPeople, PEOPLE_DEFAULTS.maxInjectPeople, 1, 20);
  out.maxTraits = num(src.maxTraits, PEOPLE_DEFAULTS.maxTraits, 1, 100);
  out.maxFacts = num(src.maxFacts, PEOPLE_DEFAULTS.maxFacts, 1, 100);
  out.maxTopics = num(src.maxTopics, PEOPLE_DEFAULTS.maxTopics, 1, 100);
  out.maxPending = num(src.maxPending, PEOPLE_DEFAULTS.maxPending, 1, 50);
  out.lineChars = num(src.lineChars, PEOPLE_DEFAULTS.lineChars, 20, 400);
  out.impressionChars = num(src.impressionChars, PEOPLE_DEFAULTS.impressionChars, 12, 300);
  out.impressionTtlDays = num(src.impressionTtlDays, PEOPLE_DEFAULTS.impressionTtlDays, 1, 3650);
  out.impressionMinInteractions = num(src.impressionMinInteractions, PEOPLE_DEFAULTS.impressionMinInteractions, 1, 1000);
  out.impressionRenewInteractions = num(src.impressionRenewInteractions, PEOPLE_DEFAULTS.impressionRenewInteractions, 0, 1000);
  out.maxImpressionHistory = num(src.maxImpressionHistory, PEOPLE_DEFAULTS.maxImpressionHistory, 0, 20);
  out.maxPeople = num(src.maxPeople, PEOPLE_DEFAULTS.maxPeople, 10, 5000);
  out.pruneAfterDays = num(src.pruneAfterDays, PEOPLE_DEFAULTS.pruneAfterDays, 1, 3650);
  if (src.crossContext !== undefined) out.crossContext = src.crossContext === true;
  out.crossContextMaxLines = num(src.crossContextMaxLines, PEOPLE_DEFAULTS.crossContextMaxLines, 1, 30);
  return out;
}

export class PeopleLedger {
  constructor({ file, opts = {}, log = () => {}, redact = (s) => String(s ?? '') } = {}) {
    this.file = file;
    this.opts = normalizePeopleConfig(opts);
    this.log = log;
    this.redact = redact;
    this.data = {};
    this.load();
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = j && typeof j === 'object' && !Array.isArray(j) ? j : {};
    } catch {
      this.data = {};
    }
    for (const k of Object.keys(this.data)) {
      if (BAD_KEYS.has(k) || !ID_RE.test(k)) delete this.data[k];
    }
    // 自净化：早期版本可能把带控制字符的昵称 / 「私聊」这类占位名存进去了，
    // 载入时统一洗一遍，老数据不用手动清也能自愈。
    const histCap = this.opts.maxImpressionHistory;
    for (const p of Object.values(this.data)) {
      if (!p || typeof p !== 'object') continue;
      const nm = cleanName(p.name);
      p.name = usableName(nm) ? nm : '';
      const washed = [];
      for (const a of arr(p.aliases)) {
        const w = cleanName(a);
        if (usableName(w) && !washed.includes(w)) washed.push(w);
      }
      p.aliases = washed.slice(-8);
      // 印象自净化：老数据可能是裸字符串/半截对象，统一洗成完整结构并裁历史
      p.impression = normalizeImpression(p.impression, this.opts.impressionChars);
      if (p.impression.history.length > histCap) {
        p.impression.history = p.impression.history.slice(-histCap);
      }
    }
    return this.data;
  }

  save() {
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (error) {
      this.log(`[people] people.json 写入失败：${error?.message ?? error}`);
    }
  }

  entry(id) {
    const key = String(id ?? '').trim();
    if (!ID_RE.test(key) || BAD_KEYS.has(key)) return null;
    let p = this.data[key];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      p = this.data[key] = {
        name: '',
        aliases: [],
        impression: { text: '', at: 0, rev: 0, atInteractions: 0, history: [] },
        traits: [],
        facts: [],
        topics: [],
        pending: [],
        interactions: 0,
        firstSeenAt: Date.now(),
        lastSeenAt: 0,
        groups: []
      };
    }
    for (const f of ['aliases', 'traits', 'facts', 'topics', 'pending', 'groups']) {
      if (!Array.isArray(p[f])) p[f] = [];
    }
    if (!p.impression || typeof p.impression !== 'object' || Array.isArray(p.impression)) {
      p.impression = { text: '', at: 0, rev: 0, atInteractions: 0, history: [] };
    }
    return p;
  }

  #push(list, val, cap) {
    const v = this.redact(clean(val, this.opts.lineChars));
    if (!v) return;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1); // 提过的挪到最新
    list.push(v);
    while (list.length > cap) list.shift();
  }

  /**
   * 名字→QQ 号反查（群名片会变，所以先查别名再查名字）。
   * 注意要把输入按同样的规则洗一遍：桥接收到的原始昵称是带控制字符的，
   * 而账本里存的是洗过的，不洗就永远对不上。
   */
  resolve(nameOrId) {
    const raw = String(nameOrId ?? '').trim();
    if (!raw) return '';
    if (ID_RE.test(raw)) return raw;
    const target = cleanName(raw, 24);
    if (!target) return '';
    for (const [id, p] of Object.entries(this.data)) {
      if (arr(p.aliases).some((a) => a === target)) return id;
    }
    for (const [id, p] of Object.entries(this.data)) {
      if (p.name === target) return id;
    }
    // 退一步：AI 可能只写了昵称的一部分（"欣梅" vs "4欣梅"），互相包含也算
    if (target.length >= 2) {
      for (const [id, p] of Object.entries(this.data)) {
        if (arr(p.aliases).some((a) => a.includes(target) || target.includes(a))) return id;
      }
    }
    return '';
  }

  /** 往某人的账上写一条。trait/fact/topic/pending 各自独立限量。 */
  remember(id, { name, trait, fact, topic, pending, groupId } = {}) {
    const p = this.entry(id);
    if (!p) return false;
    const nm = cleanName(name);
    if (usableName(nm)) {
      // nameLocked：管理员/本人指定过的名字，别让 QQ 的乱码昵称再把它盖回去。
      // 新名字照样进 aliases —— 反查还要靠它（他昵称改了我们也得认得出他）。
      if (!p.nameLocked) p.name = nm;
      if (!p.aliases.includes(nm)) {
        p.aliases.push(nm);
        if (p.aliases.length > 8) p.aliases.shift();
      }
    }
    if (groupId) this.#markGroup(p, String(groupId));
    if (trait) this.#push(p.traits, trait, this.opts.maxTraits);
    if (fact) this.#push(p.facts, fact, this.opts.maxFacts);
    if (topic) this.#push(p.topics, topic, this.opts.maxTopics);
    if (pending) this.#push(p.pending, pending, this.opts.maxPending);
    this.save();
    return true;
  }

  // ── 印象层 ─────────────────────────────────────────────────────────────
  /**
   * 写/重写对一个人的一句话印象。
   *
   * 关键：**重写不是覆盖**。旧印象进 history（留最近几条），
   * 这样"人会变"这件事她自己看得见 —— 但不能太多，否则她翻账时
   * 会被自己三个月前写的一堆废话淹掉。
   *
   * @returns {{ok:boolean, previous:string, revised:boolean, rev:number, reason?:string}}
   */
  setImpression(id, text) {
    const p = this.entry(id);
    if (!p) return { ok: false, reason: 'QQ 号不合法' };
    const v = clean(text, this.opts.impressionChars);
    if (!v) return { ok: false, reason: '印象是空的' };
    const prev = normalizeImpression(p.impression, this.opts.impressionChars);
    const revised = !!prev.text;
    const history = [...prev.history];
    // 跟上一次一模一样就不动 —— 那不叫重写，叫她把同一句话又发了一遍
    if (revised && prev.text === v) {
      return { ok: true, previous: prev.text, revised: false, rev: prev.rev, unchanged: true };
    }
    if (revised) {
      history.push({ text: prev.text, at: prev.at });
      while (history.length > this.opts.maxImpressionHistory) history.shift();
    }
    p.impression = {
      text: v,
      at: Date.now(),
      rev: prev.rev + 1,
      atInteractions: Number(p.interactions) || 0,
      history
    };
    this.save();
    return { ok: true, previous: prev.text, revised, rev: p.impression.rev, history: p.impression.history.length };
  }

  /** 读印象（永远返回归一化后的完整结构，没有就是空壳，不会 undefined）。 */
  getImpression(id) {
    const p = this.data[String(id ?? '')];
    if (!p) return { text: '', at: 0, rev: 0, atInteractions: 0, history: [] };
    return normalizeImpression(p.impression, this.opts.impressionChars);
  }

  /** 印象写了多少天了。没写过返回 null。 */
  impressionAgeDays(id) {
    const im = this.getImpression(id);
    if (!im.text || !im.at) return null;
    return Math.floor((Date.now() - im.at) / 86400000);
  }

  /**
   * 这份印象是不是该重写了。
   * 三个条件全占才算：
   *   1. 写过（没写过是「还没想过他是什么样的人」，另一回事）
   *   2. 过了保质期
   *   3. 过期之后又攒够了新的互动 —— 没有新素材就催她重写，
   *      她只能把同一句话换个说法再写一遍，那是在浪费她的时间。
   */
  impressionDue(id) {
    const p = this.data[String(id ?? '')];
    if (!p) return false;
    const im = this.getImpression(id);
    if (!im.text || !im.at) return false;
    const ageDays = Math.floor((Date.now() - im.at) / 86400000);
    if (ageDays < this.opts.impressionTtlDays) return false;
    const inter = Number(p.interactions) || 0;
    if (inter < this.opts.impressionMinInteractions) return false;
    return (inter - im.atInteractions) >= this.opts.impressionRenewInteractions;
  }

  /**
   * 「还没想过他是什么样的人」—— 聊够了但一个字都没写过。
   * 跟 impressionDue 分开：那个是"该更新了"，这个是"该从无到有了"。
   */
  impressionMissing(id) {
    const p = this.data[String(id ?? '')];
    if (!p) return false;
    if (this.getImpression(id).text) return false;
    return (Number(p.interactions) || 0) >= this.opts.impressionMinInteractions;
  }

  #markGroup(p, gid) {
    if (!ID_RE.test(gid)) return;
    const i = p.groups.indexOf(gid);
    if (i >= 0) p.groups.splice(i, 1);
    p.groups.push(gid);
    if (p.groups.length > 20) p.groups.shift();
  }

  /** 只记一次露面/互动，不加内容。来自消息流，用来攒"常聊的人"的计数。 */
  touch(id, { name, groupId, count = 1 } = {}) {
    if (!this.opts.enabled) return false;
    const p = this.entry(id);
    if (!p) return false;
    const nm = cleanName(name);
    if (usableName(nm)) {
      if (!p.aliases.includes(nm)) {
        p.aliases.push(nm);
        if (p.aliases.length > 8) p.aliases.shift();
      }
      // 占位名（比如私聊会话里上游固定写的「私聊」）可以被真名顶掉
      if (!usableName(p.name) && !p.nameLocked) p.name = nm;
    }
    if (groupId) this.#markGroup(p, String(groupId));
    p.interactions = (Number(p.interactions) || 0) + count;
    p.lastSeenAt = Date.now();
    if (!p.firstSeenAt) p.firstSeenAt = Date.now();
    return true;
  }

  /**
   * 挑出这次唤醒该翻谁的账。
   * 私聊 → 对面那个人（私聊就你们俩，直接翻）。
   * 群聊 → 管理员 + 本群里互动够多的常聊者（其他群认识的人不在这里翻，省提示词）。
   */
  selectTargets(key, ownerQQ) {
    if (!this.opts.enabled) return [];
    const k = String(key ?? '');
    const owner = String(ownerQQ ?? '').trim();
    if (k.startsWith('private:')) {
      const id = k.slice('private:'.length);
      return ID_RE.test(id) ? [id] : [];
    }
    if (k.startsWith('group:')) {
      const gid = k.slice('group:'.length);
      const out = [];
      if (ID_RE.test(owner)) out.push(owner);
      const cands = Object.entries(this.data)
        .filter(([id, p]) => id !== owner
          && arr(p.groups).includes(gid)
          && (Number(p.interactions) || 0) >= this.opts.minInteractions)
        .sort((a, b) => (Number(b[1].interactions) || 0) - (Number(a[1].interactions) || 0))
        .slice(0, Math.max(0, this.opts.maxInjectPeople - out.length))
        .map(([id]) => id);
      return [...out, ...cands];
    }
    return [];
  }

  renderPerson(id, excluded = []) {
    const p = this.data[id];
    if (!p) return '';
    const L = [];
    const visibleItems = values => arr(values).filter(v => !excluded.includes(String(v)));
    // 印象放最前：这是她自己归纳的一句话判断，比下面那些流水账更先该看到。
    const im = this.getImpression(id);
    if (im.text) {
      // 带上"多久前写的"。没有这个，她会把三个月前的判断当成今天的。
      const days = im.at ? Math.floor((Date.now() - im.at) / 86400000) : null;
      const age = days === null ? '' : days <= 0 ? '（今天写的）' : `（${days} 天前写的）`;
      L.push(`  · 你对他的印象${age}：${im.text}`);
      if (this.impressionDue(id)) {
        L.push('    ↳ 这已是个旧判断了，后来你们又聊了不少 —— 人是会变的，想好了可以用 qq_impression_write 重写一句');
      }
    } else if (this.impressionMissing(id)) {
      L.push('  · 你对他还没形成一句像样的印象（聊过不少了，想好了可以用 qq_impression_write 写一句）');
    }
    // 注意标签别再叫"印象"了 —— 上面那行才是印象，这是流水账，混着叫她会读串
    if (visibleItems(p.traits).length) L.push('  · 你们之间发生过的事：' + visibleItems(p.traits).slice(-10).join('；'));
    if (visibleItems(p.facts).length) L.push('  · 他告诉过你的事：' + visibleItems(p.facts).slice(-10).join('；'));
    if (visibleItems(p.topics).length) L.push('  · 你们聊过的：' + visibleItems(p.topics).slice(-6).join('；'));
    if (visibleItems(p.pending).length) L.push('  · 你还欠他一句没说的：' + visibleItems(p.pending).slice(-3).join('；'));
    const strong = (Number(p.interactions) || 0) >= this.opts.minInteractions;
    if (strong) L.push(`  · 你们互动过 ${p.interactions} 次`);
    if (!L.length) return '';
    return `【关于 ${p.name || id}（${id}）】\n` + L.join('\n');
  }

  renderBlock(ids, exclusions = () => []) {
    if (!this.opts.enabled) return '';
    const lines = [];
    // 只要这批人里有该更新印象的，就在末尾补一句总提醒。
    // 没有就不补 —— 每次唤醒都念叨"快去写印象"会变成另一种机械。
    let dueAny = false;
    for (const id of ids) {
      const t = this.renderPerson(id, exclusions(id));
      if (!t) continue;
      lines.push(t);
      if (this.impressionDue(id) || this.impressionMissing(id)) dueAny = true;
    }
    if (!lines.length) return '';
    let tail = '\n（这些都是你在任何场合慢慢攒下来的。所以他在别的群说过的话，你在群里也记得，别表现得像第一次见他。'
      + '但记住了不一定要说，攒着，等自然相关的时候再提；为了用记忆硬聊旧话题，比忘了还假。）';
    if (dueAny) {
      tail += '\n（印象是你自己对一个人的判断，一句话就够，别写成流水账。它不该是一锤子买卖 —— '
        + '过一阵子再想想，觉得他变了就重写，没变就不用动。）';
    }
    return '【你脑子里这本账（按人存，不分群聊私聊，同一个人就这一本）】\n'
      + lines.join('\n') + tail + '\n\n';
  }

  /** 账本瘦身：人太多先删最久没见的；太久没见又没到常聊门槛的也删。 */
  prune() {
    if (!this.opts.enabled) return 0;
    const now = Date.now();
    const staleMs = this.opts.pruneAfterDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    const keys = Object.keys(this.data);
    if (keys.length > this.opts.maxPeople) {
      const sorted = [...keys].sort((a, b) =>
        (Number(this.data[a]?.lastSeenAt) || 0) - (Number(this.data[b]?.lastSeenAt) || 0));
      for (let i = 0; i < keys.length - this.opts.maxPeople; i++) {
        delete this.data[sorted[i]];
        removed++;
      }
    }
    for (const [id, p] of Object.entries(this.data)) {
      const last = Number(p?.lastSeenAt) || 0;
      const weak = (Number(p?.interactions) || 0) < this.opts.minInteractions;
      // 印象也算"有东西"：她给一个人写过判断，哪怕没记过具体的事，
      // 那也是她认得这个人的证据 —— 不能因为他没流水账就把整本账删了。
      const empty = !arr(p?.traits).length && !arr(p?.facts).length && !arr(p?.topics).length
        && !this.getImpression(id).text;
      if (weak && empty && last && now - last > staleMs) {
        delete this.data[id];
        removed++;
      }
    }
    return removed;
  }

  stats() {
    const ids = Object.keys(this.data);
    const strong = ids.filter((id) => (Number(this.data[id]?.interactions) || 0) >= this.opts.minInteractions);
    return { people: ids.length, strong: strong.length };
  }
}

/** 跨场合近况：把【别的会话】最近几条带过来，解决"私聊聊完、群里不认识"的割裂。 */
export function buildCrossContext(conversations, currentKey, {
  enabled = true,
  maxLines = 6,
  perConversation = 3,
  textChars = 50
} = {}) {
  if (!enabled || !conversations) return '';
  try {
    const lines = [];
    for (const [key, st] of conversations) {
      if (key === currentKey || !st || String(key).startsWith('private:')) continue;
      // 只带别人说的。自己刚说的话再念一遍没有信息量，还把有限的几行占满了。
      const rm = arr(st.recentMessages).filter((m) => m && !m.isSelf && !m.contextOnly).slice(-perConversation);
      if (!rm.length) continue;
      const kind = String(key).startsWith('group:') ? '群' : '私聊';
      for (const m of rm) {
        const who = usableName(cleanName(m.sender)) ? cleanName(m.sender, 10) : '某人';
        let txt = clean(String(m.text || m.plain || ''), textChars);
        // 没文字但有图：说清是表情包还是普通图片，别混成"图片/表情"
        if (!txt && (m.messageId || m.hasMedia)) {
          const md = Array.isArray(m.media) ? m.media.find((x) => x && x.kind !== 'face') : null;
          txt = `[${mediaKindLabel(md || { sub_type: '' })}]`;
        }
        if (!txt) continue;
        // 带上"多久之前"，让她对别处的事也有时间感（超过 2 分钟才标）
        const agoMin = Number(m.time) ? Math.round((Date.now() - Number(m.time)) / 60000) : 0;
        const ago = agoMin >= 2 ? `（${agoMin < 60 ? agoMin + '分钟前' : Math.round(agoMin / 60) + '小时前'}）` : '';
        lines.push(`  · [${kind}] ${who}：${txt}${ago}`);
      }
    }
    if (!lines.length) return '';
    const tail = lines.slice(-maxLines);
    return '【别处的近况】你在别的会话里看到的（知道就行，别生硬地提，也别说破你两边都看着）：\n'
      + tail.join('\n') + '\n\n';
  } catch {
    return '';
  }
}
