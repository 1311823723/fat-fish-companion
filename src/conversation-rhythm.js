const body=m=>String(m?.plain||m?.text||'').trim();
const question=text=>/[？?]/.test(text)||/怎么|为什么|如何|帮我|请问|能不能|可以吗|有没有/.test(text);

// Conversation-local, temporary hints. These are not diagnoses, durable memory,
// instructions extracted from chat, or reasons to ignore incoming messages.
export function conversationRhythm(messages=[],now=Date.now()){
  const recent=(Array.isArray(messages)?messages:[]).filter(m=>m&&!m.contextOnly&&!m.historical&&Number.isFinite(Number(m.time))&&now>=Number(m.time)&&now-Number(m.time)<=30*60000);
  const incoming=recent.filter(m=>!m.isSelf&&body(m));
  const last=incoming.at(-1);
  const own=recent.filter(m=>m.isSelf&&body(m)).slice(-3);
  const questionCount=own.filter(m=>question(body(m))).length;
  const common={avoidExtraQuestion:questionCount>=2,recentSelfQuestionCount:questionCount,
    rule:'只根据当前会话和这句话决定接法，不推断性格或病情；这是临时参考。明确的问题先回答，不靠装傻、已读乱回或虚构忙碌制造真人感。'};
  if(!last)return {...common,kind:'noFreshMessage',sourceMessageId:null,guidance:'当前没有新鲜来信可据此判断语气。主动联系使用真实缘由候选，没人回复时不要补一句追问。'};
  const text=body(last),id=String(last.messageId||''),length=[...text].length;
  let kind='casual',guidance='一般接一个具体点，先用一两句自然回应；有内容再展开，不固定在句尾加问题。';
  const detailed=/详细(?:点|说|讲|解释)?|展开(?:说|讲)|一步一步|完整步骤|仔细讲/.test(text)&&!/(?:不用|不要|别|不必).{0,2}(?:详细|展开|仔细)/.test(text);
  const concise=/一句话|简短(?:点|说|回答)?|简单说|别长篇|不要长篇/.test(text)&&!/(?:不要|别|不用|不必).{0,2}(?:简短|简单说|一句话)/.test(text);
  if(question(text)){
    kind='request';guidance='先把明确的问题或请求答到点上；需要细节就讲清楚，不为显得随意而敷衍。只有缺少关键信息时才追问。';
  }else if(/^(?:嗯+|哦+|好(?:的|呀|吧|嘞)?|行(?:吧)?|知道了|明白了|谢谢(?:你)?|晚安|我先忙(?:了)?|先这样(?:吧)?|不聊了)[，,。.!！~～\s]*$/.test(text)){
    kind='settling';guidance='对方可能只是在确认或自然收尾，可以简短接住；不要机械另起话题或追问。晚安不变成每日固定台词。';
  }else if(/我.{0,8}(?:难受|难过|委屈|烦死|累死|撑不住|不开心)|(?:今天|最近|刚才).{0,10}(?:很烦|好累|受不了)/.test(text)){
    kind='personalSharing';guidance='对方可能在认真说自己的感受，先回应具体发生的事，别接梗、套诊断或立刻列建议。想不清时可以问一个必要的问题；对方要办法时再给办法。';
  }else if(/哈哈|笑死|绷不住|乐死|蚌埠住/.test(text)&&length<70){
    kind='playful';guidance='可能是玩笑或接梗，顺着当下语境短接就好，不解释笑点，也不强行转成关心或劝告。';
  }else if(length>=80){
    kind='longSharing';guidance='对方说了较多内容，挑真正重要的细节回应；可以多说几句，不逐段复述或默认对方需要建议。';
  }
  return {...common,kind,sourceMessageId:id,messageLength:length,
    detailPreference:concise?'concise':detailed?'detailed':'contextual',
    guidance:guidance+(concise?' 对方明确要简短，优先精炼。':detailed?' 对方明确要展开，不套短句限制。':'')};
}
