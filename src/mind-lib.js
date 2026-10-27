import { settleInterests } from './personality-continuity.js';
import fs from 'node:fs';
import path from 'node:path';
const DAY = 86400000;
const clean = (v, n = 200) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, n);
const bounded = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
const visible = (scope, key) => scope === key; // No private/group memory sharing by implication.

export class CompanionMind {
  constructor(file) {
    this.file = file;
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (this.data.version !== 1 || !Array.isArray(this.data.memories) || !this.data.selves || typeof this.data.selves !== 'object') throw Error('格式不正确');
    } catch (e) {
      if (e.code === 'ENOENT') this.data = { version: 1, memories: [], selves: {} };
      else { this.error = '连续记忆读取失败，请检查存档'; this.data = { version: 1, memories: [], selves: {} }; }
    }
  }
  save(next) {
    if (this.error) throw Error(this.error);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    this.data = next;
  }
  revise({ key, person, slot, value, kind, source, supersedes = [], ttlMs }, now = Date.now()) {
    if (!/^\d{5,12}$/.test(String(person)) || !clean(slot, 40)) throw Error('需要真实QQ号和记忆主题');
    if (!['fact', 'temporary', 'inference', 'forget'].includes(kind)) throw Error('记忆类别无效');
    if (!source?.messageId || !source.userId || source.isSelf) throw Error('需要当前会话真实收到的来源消息');
    if (kind !== 'inference' && String(source.userId) !== String(person)) throw Error('确认、修正或忘记事实须依据当事人自己的消息；转述只能记为推测');
    const next = structuredClone(this.data);
    const index = next.memories.findIndex(m => m.scope === key && m.person === String(person) && m.slot === clean(slot, 40));
    const previous = next.memories[index];
    if (previous?.sourceTime && source.time && Number(source.time) < previous.sourceTime) throw Error('这条依据早于已有记忆，不能用旧消息覆盖新情况');
    if (previous && previous.kind !== 'inference' && kind === 'inference') throw Error('推测不能覆盖当事人明确说过的事实');
    if (kind !== 'forget' && !clean(value)) throw Error('记忆内容不能为空');
    if (previous?.sourceMessageId === String(source.messageId) && previous.kind === kind && previous.value === clean(value)) return previous;
    const defaultTtl = kind === 'fact' ? 365 * DAY : kind === 'temporary' ? 7 * DAY : 14 * DAY;
    const row = { person: String(person), slot: clean(slot, 40), value: clean(value), kind, scope: key,
      sourceMessageId: String(source.messageId), sourceTime: Number(source.time) || now, evidence: clean(source.plain || source.text),
      updatedAt: now, expiresAt: now + bounded(ttlMs, defaultTtl, 3600000, defaultTtl),
      supersedes: [...new Set([...(previous?.supersedes || []), ...supersedes.map(v => clean(v)).filter(Boolean)])].slice(-12),
      history: previous ? [...(previous.history || []), { value: previous.value, kind: previous.kind, updatedAt: previous.updatedAt, sourceMessageId: previous.sourceMessageId }].slice(-3) : [] };
    if (index >= 0) next.memories[index] = row; else next.memories.push(row);
    if (next.memories.length > 300) throw Error('记忆已达300条上限，请先整理到期记录');
    this.save(next); return row;
  }
  exclusions(key, person) {
    return this.data.memories.filter(m => visible(m.scope, key) && m.person === String(person)).flatMap(m => m.supersedes || []);
  }
  memories(key, ids, now = Date.now()) {
    return this.data.memories.filter(m => visible(m.scope, key) && ids.map(String).includes(m.person) && m.kind !== 'forget' && m.expiresAt > now)
      .sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 12).map(m => ({ person:m.person, slot:m.slot, value:m.value, kind:m.kind,
        sourceMessageId:m.sourceMessageId, updatedAt:m.updatedAt, expiresAt:m.expiresAt, stale:now - m.updatedAt > 90 * DAY }));
  }
  self(key, now = Date.now()) {
    const raw = this.data.selves[key];
    if (!raw) return { mood: '平常', energy: 50, interests: [], concerns: [] };
    const age = Math.max(0, now - raw.updatedAt);
    return { mood: age < 12 * 3600000 ? raw.mood : '平常',
      energy: Math.round(50 + (raw.energy - 50) * Math.exp(-age / (12 * 3600000))),
      interests: (raw.interests || []).filter(i => i.expiresAt > now),
      concerns: (raw.concerns || []).filter(i => i.expiresAt > now), updatedAt: raw.updatedAt };
  }
  updateSelf(key, patch, source, now = Date.now()) {
    if (!source?.messageId || !source.userId || source.isSelf || source.contextOnly || source.historical) throw Error('状态变化需要当前会话真实收到的互动，不能用自己说的话或历史补课');
    if (source.time && (now - Number(source.time) > 2 * 3600000 || Number(source.time) > now + 300000)) throw Error('状态依据已过时或时间无效');
    const old = this.self(key, now), saved = this.data.selves[key];
    if (saved && now - saved.updatedAt < 10 * 60000) throw Error('状态刚更新过，先保持一会儿，不必每轮改写');
    if (saved?.sourceMessageId === String(source.messageId)) throw Error('同一条消息不能反复推动状态变化');
    const next = structuredClone(this.data);
    const interestChange = settleInterests(old.interests, patch.interests, saved?.interestsChangedAt ?? saved?.updatedAt ?? 0, now);
    const row = { mood: patch.mood ? clean(patch.mood, 16) : old.mood,
      energy: bounded(patch.energy, old.energy, Math.max(0,old.energy - 15), Math.min(100,old.energy + 15)),
      interests: interestChange.items, interestsChangedAt: interestChange.changedAt,
      concerns: patch.concerns === undefined ? old.concerns : [...new Set(patch.concerns.map(v => clean(v, 80)).filter(Boolean))].slice(0,2).map(text => old.concerns.find(i=>i.text===text) || ({ text, expiresAt: now + 3 * DAY })),
      updatedAt: now, sourceMessageId: String(source.messageId), evidence: clean(source.plain || source.text) };
    next.selves[key] = row; this.save(next); return this.self(key,now);
  }
}

export function relatedDiary(entries, key, ownerKey, query, count = 2) {
  const q = clean(query, 200).replace(/\[.*?\]|https?:\/\/\S+|@\S+/g, '').replace(/今天|明天|昨天|现在|这个|那个|什么|怎么|你好|我们|你们|自己/g, '');
  const chars = q.replace(/[^\p{L}\p{N}]/gu, '');
  if (chars.length < 3) return [];
  const grams = new Set(Array.from({ length: chars.length - 1 }, (_,i) => chars.slice(i,i+2)));
  return entries.slice(-200).filter(e => (e.scope || ownerKey) === key).map(e => {
    const text = String(e['内容'] || '');
    return { entry: e, score: [...grams].filter(g => text.includes(g)).length };
  }).filter(e => e.score >= 2).sort((a,b) => b.score - a.score).slice(0,Math.min(2,count)).map(e=>e.entry);
}
