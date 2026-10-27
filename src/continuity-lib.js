// Pure continuity policies, shared by the bridge and regression tests.
const DAY = 86400000;
export function dueThoughts(thoughts, now = Date.now()) {
  return (thoughts || []).filter(t => t?.text && !t.closedAt && (!t.expiresAt || now < t.expiresAt)
    && now >= (Number(t.dueAt) || 0) && (Number(t.offerCount) || 0) < 2
    && (!t.lastOfferedAt || now - t.lastOfferedAt >= DAY));
}
export function rememberThought(thoughts, text, extra = {}, now = Date.now()) {
  const old = thoughts.find(t => t.text === text);
  // Re-saving the same thought must not reset its cooldown or extend it forever.
  if (old) return old;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const lifetime = Math.min(7 * DAY, Math.max(60000, finite(extra.expiresAtMs, 3 * DAY)));
  const thought = { text: text.slice(0, 200), createdAt: now, expiresAt: now + lifetime,
    dueAt: now + Math.min(lifetime, Math.max(0, finite(extra.nextCheckInMs, 0))),
    motivation: String(extra.motivation || 'curiosity').slice(0, 50),
    sourceMessageId: String(extra.sourceMessageId || '').slice(0, 80), offerCount: 0, lastOfferedAt: 0 };
  thoughts.push(thought);
  return thought;
}
export function historyContext(messages, recent, selfId, now = Date.now()) {
  const seen = new Set(recent.map(m => String(m.messageId || '')).filter(Boolean));
  return (Array.isArray(messages) ? messages : []).map(m => {
    const id = String(m.message_id ?? '');
    const time = Number(m.time) * 1000;
    const text = Array.isArray(m.message) ? m.message.map(s => s.type === 'text' ? String(s.data?.text || '') : `[${s.type}]`).join('') : String(m.raw_message || m.message || '');
    return { messageId: id, time, userId: String(m.user_id || m.sender?.user_id || ''),
      sender: String(m.sender?.card || m.sender?.nickname || m.user_id || '未知'),
      text: text.slice(0, 200), plain: text.slice(0, 200), isSelf: String(m.user_id || m.sender?.user_id) === String(selfId),
      historical: true, contextOnly: true };
  }).filter(m => {
    if (!m.messageId || seen.has(m.messageId) || !Number.isFinite(m.time) || m.time > now || now - m.time > DAY || !m.text) return false;
    seen.add(m.messageId); return true;
  }).sort((a, b) => a.time - b.time).slice(-30);
}


// A due thought is an opportunity for one natural follow-up, not a mandatory message.
export function nextThoughtCheckAt(thoughts, now = Date.now()) {
  const candidates = (thoughts || []).filter(t => t?.text && t.sourceMessageId && !t.closedAt && (Number(t.offerCount)||0) < 2)
    .map(t => ({ thought:t, at:Math.max(now, Number(t.dueAt)||now, t.lastOfferedAt ? Number(t.lastOfferedAt)+86400000 : 0) }))
    .filter(x => !x.thought.expiresAt || x.at < Number(x.thought.expiresAt));
  if (!candidates.length) return null;
  let at = Math.min(...candidates.map(x=>x.at));
  const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date(at)));
  if (hour >= 23 || hour < 8) {
    const day = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
    at = new Date(day+'T08:00:00+08:00').getTime() + (hour >= 23 ? 86400000 : 0);
  }
  return candidates.some(x => x.at <= at && (!x.thought.expiresAt || at < Number(x.thought.expiresAt))) ? at : null;
}
export function offerThoughts(thoughts, now = Date.now()) {
  for (const thought of dueThoughts(thoughts, now)) {
    thought.lastOfferedAt = now;
    thought.offerCount = (Number(thought.offerCount)||0) + 1;
  }
}
