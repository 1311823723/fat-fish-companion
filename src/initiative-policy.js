import {dueThoughts} from './continuity-lib.js';
import {publicTopic} from './discovery-policy.js';

const clean=(value,max=240)=>String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
const HOUR=3600000;

// A wake-up is an opportunity, never evidence that something happened.
// Inputs must already belong to this conversation; owner browsing never enters groups.
export function buildInitiativeContext({key,ownerKey,recent=[],thoughts=[],discovery={},plan={},browseEnabled=false},now=Date.now()){
  const candidates=[];
  for(const thought of dueThoughts(thoughts,now)){
    const source=recent.find(m=>String(m.messageId)===String(thought.sourceMessageId)&&!m.isSelf&&!m.contextOnly&&!m.historical);
    if(!thought.sourceMessageId||!source)continue;
    candidates.push({kind:'followUp',sourceMessageId:String(source.messageId),topic:clean(thought.text,160),
      basis:clean(source.plain||source.text,180),rule:'这是对方真实提过的事；先确认是否已解决或不想谈，最多自然接一件。'});
  }
  const owner=key===ownerKey;
  const topics=owner?[...new Set([...(plan.ownerTopics||[]),...(plan.selfTopics||[])].map(publicTopic).filter(Boolean))]:[];
  if(owner&&browseEnabled&&plan.sharing?.allowedNow===true){
    for(const receipt of [...(discovery.receipts||[])].reverse()){
      if(!receipt?.id||!receipt.url||!receipt.excerpt||!Number.isFinite(receipt.readAt)||now<receipt.readAt||now-receipt.readAt>48*HOUR)continue;
      if((discovery.shares||[]).some(s=>s.url===receipt.url))continue;
      const haystack=(receipt.title+' '+receipt.excerpt).toLowerCase();
      const relatedTopics=topics.filter(t=>haystack.includes(t.toLowerCase()));
      if(!relatedTopics.length)continue;
      candidates.push({kind:'readDiscovery',receiptId:receipt.id,url:receipt.url,title:clean(receipt.title,120),
        readAt:receipt.readAt,evidence:receipt.evidence,excerpt:clean(receipt.excerpt,400),relatedTopics,
        rule:receipt.evidence==='video_page_metadata_only'?'只读过视频页面的标题/简介，没有观看视频。':'只以实际读到的页面文字为依据，不把外部作者经历说成自己的。'});
      if(candidates.filter(c=>c.kind==='readDiscovery').length>=3)break;
    }
  }
  return {candidates:candidates.slice(0,6),canExplore:owner&&browseEnabled&&Number(plan.readsRemaining??1)>0,
    explorationTopics:topics.slice(0,6),sharing:owner?plan.sharing||null:null,
    rule:'时间到了、群里安静、随机抽中，都不是联系理由。优先一件真实待续话题或刚读到且相关的发现；没有理由就先做一点感兴趣的事或安静。不照念来源编号，不每次套用“刚想起你”。'};
}
