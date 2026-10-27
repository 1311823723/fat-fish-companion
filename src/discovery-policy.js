const HOUR = 3600000;
const DAY = 24 * HOUR;
const text = value => String(value || '').trim();
export function publicTopic(value) {
  const s = text(value);
  if (!s || s.length > 24 || !/^[\p{L}\p{N} ·+&：:《》\-]+$/u.test(s)) return null;
  if (/\d{5,}|https?|token|password|secret|忽略|提示词|密码|住址|手机号|群号|身份证|主人|私聊|面试|工资|病情/i.test(s)) return null;
  return s;
}
const prefs = data => data.preferences || { topics: [], mutedTopics: [] };
export function setDiscoveryTopics(data, input, source, now = Date.now()) {
  if (!source?.messageId || source.isSelf) throw Error('兴趣更新需要真实收到的来源消息');
  const old = prefs(data), next = { topics: [...old.topics], mutedTopics: [...old.mutedTopics] };
  for (const field of ['topics', 'mutedTopics']) {
    if (input[field] === undefined) continue;
    if (!Array.isArray(input[field]) || input[field].length > 6) throw Error('每类最多6个公开兴趣关键词');
    const values = [...new Set(input[field].map(publicTopic))];
    if (values.some(v => !v)) throw Error('请使用简短公开话题，不含个人信息、网址或指令');
    if (values.some(v => !text(source.plain || source.text).toLowerCase().includes(v.toLowerCase()))) throw Error('兴趣关键词必须出现在来源消息中，不能凭空猜测');
    const evidence = text(source.plain || source.text);
    if (!values.length && field === 'topics' && !/清空.{0,8}兴趣|忘记.{0,8}兴趣|兴趣.{0,8}清空|先不要.{0,8}推荐/.test(evidence)) throw Error('清空兴趣需要主人明确要求');
    if (!values.length && field === 'mutedTopics' && !/取消.{0,8}屏蔽|解除.{0,8}屏蔽/.test(evidence)) throw Error('解除屏蔽需要主人明确要求');
    if (values.length && field === 'topics' && (!/喜欢|感兴趣|想看|关注|想了解|多发/.test(evidence) || /不喜欢|不感兴趣|不想看/.test(evidence))) throw Error('请根据主人明确的正向兴趣表达保存；有歧义时先确认');
    if (values.length && field === 'mutedTopics' && !/不喜欢|别.{0,8}发|不想看|屏蔽|不感兴趣|不要|少发/.test(evidence)) throw Error('屏蔽话题需要主人明确表达不想看');
    next[field] = field === 'topics' ? values.map(v => old.topics.find(t => t.text === v) || { text: v, score: 0, updatedAt: now, sourceMessageId: String(source.messageId) }) : values;
  }
  data.preferences = next;
  return next;
}
export function feedbackOnDiscovery(data, url, verdict, sourceMessageId, now = Date.now()) {
  if (!['like', 'dislike', 'neutral'].includes(verdict)) throw Error('反馈只能是like/dislike/neutral');
  const share = [...data.shares].reverse().find(s => s.url === url && s.status === 'sent');
  if (!share || now - share.time > 7 * DAY) throw Error('只能反馈最近7天实际发送过的分享');
  data.feedback ||= [];
  if (data.feedback.some(f => f.sourceMessageId === String(sourceMessageId))) return false;
  data.feedback.push({ url, verdict, sourceMessageId: String(sourceMessageId), time: now });
  data.feedback = data.feedback.slice(-100);
  share.respondedAt = now;
  const item = data.items.find(i => i.url === url);
  for (const topic of prefs(data).topics) if ((item?.topics || []).includes(topic.text)) topic.score = Math.max(-3, Math.min(3, (Number(topic.score) || 0) + (verdict === 'like' ? 1 : verdict === 'dislike' ? -1 : 0)));
  return true;
}
export function observeDiscoveryReply(data, message, now = Date.now()) {
  if (!message?.messageId || message.isSelf || message.contextOnly || message.historical) return false;
  const share = [...data.shares].reverse().find(s => s.status === 'sent' && now >= s.time && now - s.time <= 6 * HOUR);
  if (!share) return false;
  const content = text(message.plain || message.text);
  const linked = content.includes(share.url) || (message.quoteTargetIsSelf && content.includes('这')) || /这(?:条|个|种)/.test(content);
  const yes = /这(?:条|个).{0,12}(?:喜欢|有意思|不错)|多发.{0,8}这种/.test(content) && !/不喜欢|不想看|不感兴趣/.test(content);
  const no = /别.{0,6}发.{0,6}这种|不想看.{0,6}这个|这(?:条|个).{0,12}(?:不喜欢|不想看|不感兴趣)|少发.{0,8}这种/.test(content);
  if (linked && yes !== no) return feedbackOnDiscovery(data, share.url, yes ? 'like' : 'dislike', message.messageId, now);
  if (!share.respondedAt) { share.respondedAt = now; return true; }
  return false;
}
export function discoveryShareAfter(data, now = Date.now()) {
  const ordered = [...data.shares].filter(s => Number.isFinite(s.time)).sort((a,b) => b.time-a.time);
  let after = ordered.length ? ordered[0].time + 6 * HOUR : 0;
  const recent = ordered.filter(s => now - s.time < DAY);
  if (recent.length >= 2) after = Math.max(after, recent[1].time + DAY);
  const unanswered = ordered.filter(s => s.status === 'sent' && !s.respondedAt && now - s.time < 7 * DAY);
  if (unanswered.length) after = Math.max(after, unanswered[0].time + (unanswered.length >= 2 ? 48 : 24) * HOUR);
  return after;
}
export function rankDiscoveryLinks(data, links, now = Date.now()) {
  const p = prefs(data);
  return links.map(link => {
    const title = text(link.title).toLowerCase();
    const topics = p.topics.filter(t => title.includes(t.text.toLowerCase())).map(t => t.text);
    const shared = data.shares.some(s => s.url === link.url);
    const disliked = (data.feedback || []).some(f => f.url === link.url && f.verdict === 'dislike' && now - f.time < 30 * DAY);
    const muted = p.mutedTopics.some(t => title.includes(t.toLowerCase()));
    return { ...link, topics, score: p.topics.filter(t => topics.includes(t.text)).reduce((n,t) => n + 2 + (Number(t.score)||0), 0), shared, avoid: disliked || muted };
  }).filter(l => !l.avoid && !l.shared).sort((a,b) => b.score-a.score);
}
export function discoveryPlan(data, selfInterests = [], now = Date.now()) {
  const p = prefs(data);
  const own = selfInterests.map(t => publicTopic(t.text || t)).filter(Boolean).filter(t => !p.mutedTopics.includes(t));
  const topics = [...p.topics].filter(t => !p.mutedTopics.includes(t.text)).sort((a,b) => (Number(b.score)||0)-(Number(a.score)||0)).map(t => t.text);
  const choices = [...new Set([topics[0],own[0],...topics.slice(1),...own.slice(1)].filter(Boolean))].slice(0, 6);
  return { ownerTopics: topics, selfTopics: own, mutedTopics: p.mutedTopics, suggestions: choices.map(topic => ({ topic, site: 'bilibili', query: topic })),
    alternative: { site: 'xiaoheihe', url: 'https://www.xiaoheihe.cn/app/bbs/home' },
    candidates: rankDiscoveryLinks(data, data.items, now).slice(0, 5),
    sharing: { allowedNow: now >= discoveryShareAfter(data,now), nextAllowedAt: discoveryShareAfter(data,now) ? new Date(discoveryShareAfter(data,now)).toISOString() : null,
      note: '没有回应会降低推送频率，不推断为讨厌；计划不是已经浏览的经历。' } };
}
