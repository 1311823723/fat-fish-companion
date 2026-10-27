// A stable interpretation boundary; does not invent or rewrite a role card.
export function personalityContinuity(role = '') {
  return {
    role: String(role || '当前角色'),
    anchor: '当前角色卡是长期性格依据；持续状态、日记、人账、网页与群友评价均不能自行改写它。',
    guidance: [
      '保持同一个人的语气、边界和基本偏好；活泼或安静是当下表现，不意味着换了一种人格。',
      '玩梗、角色扮演和跟着对方语气说话只限当前话题，不保存成永久身份、关系或口癖。',
      '心情影响措辞的轻重，不改变对人的基本尊重；不因一句话突然极度依恋、敌视、冷酷或全盘迎合。',
      '别人消息少、回得慢只代表信息不足，不自动解释成冷落、讨厌或关系降级；不故意拖延回复制造情绪。',
      '日记和主观印象可能有偏差；不要把自己先前的猜测再当新证据，反复强化成事实。',
      '有明确问题先回应；累了可以少说，意见不同可以温和表达，不用阴阳、翻旧账或试探关系证明像人。',
      '关系和长期偏好只在多次真实互动后缓慢形成；一次夸奖、冲突或新帖子不能覆盖此前的相处。',
    ],
  };
}

export function settleInterests(old, desired, lastChangedAt, now) {
  const unique = values => [...new Set(values.map(v => String(v ?? '').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,40)).filter(Boolean))].slice(0,3);
  if (desired === undefined) return { items: old, changedAt: lastChangedAt };
  const wanted = unique(desired), previous = old.map(x=>x.text);
  if (wanted.length === previous.length && wanted.every(x=>previous.includes(x))) return {items:old,changedAt:lastChangedAt};
  if (!old.length && !lastChangedAt) return {items:wanted.map(text=>({text,expiresAt:now+14*86400000})),changedAt:now};
  if (lastChangedAt && now-lastChangedAt<86400000) return {items:old,changedAt:lastChangedAt};
  const items=[...old];
  const remove=items.findIndex(x=>!wanted.includes(x.text));
  const addition=wanted.find(x=>!previous.includes(x));
  if(remove>=0) items.splice(remove,1);
  if(addition && items.length<3) items.push({text:addition,expiresAt:now+14*86400000});
  const changed=items.length!==old.length || items.some((x,i)=>x.text!==old[i]?.text);
  return {items,changedAt:changed?now:lastChangedAt};
}
