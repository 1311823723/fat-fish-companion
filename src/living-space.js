import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const DAY=86400000;
const text=(v,n=150)=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n);
const day=now=>new Date(now+8*3600000).toISOString().slice(0,10);
const LIFE={ordinary:7,important:21,treasured:90};
const EXTRA={ordinary:3,important:7,treasured:30};
function evidence(source,now){
  if(!source?.messageId||!source.userId||source.isSelf||source.historical||source.contextOnly)throw Error('需要本会话真实收到的消息依据');
  if(!source.time||now-Number(source.time)>2*3600000||Number(source.time)>now+300000)throw Error('需要两小时内的真实消息');
  return String(source.messageId);
}
export class LivingSpace {
  constructor(file){
    this.file=file;
    try{this.data=JSON.parse(fs.readFileSync(file,'utf8'));if(this.data.version!==1||!this.data.diary||!this.data.hearts||!this.data.room)throw Error('格式异常');}
    catch(e){if(e.code!=='ENOENT'){this.error='小屋存档读取失败，已停止写入';}this.data={version:1,diary:{},hearts:{},room:{createdAt:Date.now(),items:[],notes:[]}};if(!this.error)this.save();}
  }
  save(){if(this.error)throw Error(this.error);fs.mkdirSync(path.dirname(this.file),{recursive:true});const p=this.file+'.tmp';fs.writeFileSync(p,JSON.stringify(this.data,null,2),'utf8');fs.renameSync(p,this.file);}
  heart(key,now=Date.now()){
    const h=this.data.hearts[key]||{};
    return {relationship:h.relationship?{text:h.relationship.text,updatedAt:h.relationship.updatedAt,subjective:true}:null,
      feelings:(h.feelings||[]).filter(x=>x.at>now-3*DAY).map(x=>({id:x.id,text:x.text,tag:x.tag,at:x.at,subjective:true})),
      hint:'心绪是短期主观感受，不是对方动机或性格的事实；不自动改变人设、回复速度或关系。'};
  }
  reflect(key,action,args,source,now=Date.now()){
    if(this.error)throw Error(this.error);
    const sourceId=evidence(source,now),h=this.data.hearts[key]||{feelings:[]};
    const content=text(args.text,action==='feeling'?40:150);if(!content)throw Error('内容不能为空');
    if(action==='feeling'){
      h.feelings=(h.feelings||[]).filter(x=>x.at>now-3*DAY);
      if(h.feelings.some(x=>day(x.at)===day(now)))throw Error('今天已有一条心绪，不必反复结算');
      h.feelings.push({id:crypto.randomUUID(),text:content,tag:text(args.tag,12),at:now,sourceId});
    }else if(action==='relationship'){
      const ids=[...new Set(args.sourceMessageIds||[])];
      const sources=args.sources||[];
      if(ids.length<2||sources.length<2)throw Error('关系变化需要至少两条独立真实互动依据');
      if(sources.some(x=>!x||x.isSelf||x.historical||x.contextOnly||String(x.userId)!==String(source.userId)||!Number.isFinite(Number(x.time))||now-Number(x.time)>7*DAY||Number(x.time)>now+300000))throw Error('关系依据无效或不属于同一个人');
      const times=sources.map(x=>Number(x.time));if(Math.max(...times)-Math.min(...times)<DAY)throw Error('关系印象须基于跨至少一天的互动，不能一轮改写');
      if(h.relationship&&now-h.relationship.updatedAt<7*DAY)throw Error('关系印象更新不足七天，先保持');
      const previous=h.relationship;
      h.relationship={text:content,updatedAt:now,sourceIds:ids,history:previous?[...(previous.history||[]),{text:previous.text,updatedAt:previous.updatedAt}].slice(-3):[]};
    }else throw Error('未知心绪动作');
    this.data.hearts[key]=h;this.save();return this.heart(key,now);
  }
  syncDiary(entries,ownerKey,now=Date.now()){
    if(this.error)throw Error(this.error);
    let changed=false;
    entries.forEach((entry,index)=>{
      const scope=entry.scope||ownerKey;
      const id=crypto.createHash('sha256').update(JSON.stringify([scope,entry['时间'],entry['内容'],index])).digest('hex').slice(0,20);
      if(!this.data.diary[id]){
        const parsed=Date.parse(String(entry['时间']).replace(' ','T')+':00+08:00');
        const createdAt=Number.isFinite(parsed)?Math.min(now,parsed):now;
        this.data.diary[id]={id,scope,createdAt,tier:'ordinary',expiresAt:createdAt+7*DAY,entry};changed=true;
      }
    });
    if(changed)this.save();
  }
  effectiveExpiry(row,now){return row.shelved?.reason==='avoid'?row.expiresAt+Math.max(0,now-row.shelved.at):row.expiresAt;}
  listDiary(key,query='',now=Date.now(),count=5){
    const words=text(query,100).replace(/[^\p{L}\p{N}]/gu,'');
    const grams=Array.from({length:Math.max(0,words.length-1)},(_,i)=>words.slice(i,i+2));
    return Object.values(this.data.diary).filter(r=>r.scope===key&&!r.deletedAt&&!r.shelved&&this.effectiveExpiry(r,now)>now)
      .map(r=>{const score=grams.length?grams.filter(g=>r.entry['内容'].includes(g)).length:0;return {r,score};})
      .filter(x=>!grams.length||x.score>=2).sort((a,b)=>b.score-a.score||b.r.createdAt-a.r.createdAt).slice(0,Math.min(10,count))
      .map(({r})=>{const remaining=this.effectiveExpiry(r,now)-now,ratio=remaining/((r.expiresAt-r.createdAt)||1);return {id:r.id,tier:r.tier,date:r.entry['时间'],mood:r.entry['心情']||'',hint:ratio>.5?text(r.entry['内容'].split(/[。！？]/)[0],16):'',remainingDays:Math.ceil(remaining/DAY),fuzzy:true};});
  }
  diaryAction(key,action,args,now=Date.now()){
    if(this.error)throw Error(this.error);
    const r=this.data.diary[String(args.id)];if(!r||r.scope!==key)throw Error('日记不属于当前会话或不存在');
    if(action==='diary_open'){
      if(r.deletedAt||r.shelved||this.effectiveExpiry(r,now)<=now)throw Error('日记已淡出或搁置；需要明确恢复后才能展开');
      return {id:r.id,...r.entry,subjective:true};
    }
    if(action==='diary_extend'){
      if(r.deletedAt)throw Error('划掉的日记需先恢复');
      if(r.extendedDay===day(now))throw Error('同一天只能延长一次');
      r.expiresAt+=EXTRA[r.tier]*DAY;r.extendedDay=day(now);
    }else if(action==='diary_tier'){
      if(!LIFE[args.tier])throw Error('日记档位无效');
      if(r.deletedAt||r.shelved)throw Error('先恢复日记再调整档位');
      if(r.tier!==args.tier){r.tier=args.tier;r.expiresAt=now+LIFE[args.tier]*DAY;}
    }else if(action==='diary_shelve'){
      if(!['avoid','uninterested'].includes(args.reason))throw Error('搁置理由应为avoid或uninterested');
      if(r.shelved?.reason==='avoid')r.expiresAt+=Math.max(0,now-r.shelved.at);
      r.shelved={reason:args.reason,at:now};
    }else if(action==='diary_restore'){
      if(r.shelved?.reason==='avoid')r.expiresAt+=Math.max(0,now-r.shelved.at);
      delete r.shelved;delete r.deletedAt;
      if(r.expiresAt<=now)r.expiresAt=now+LIFE[r.tier]*DAY;
    }else if(action==='diary_forget'){r.deletedAt=now;}
    else throw Error('未知日记动作');
    this.save();return {id:r.id,tier:r.tier,expiresAt:r.expiresAt,shelved:r.shelved||null,deleted:!!r.deletedAt,originalPreserved:true};
  }
  room(now=Date.now()){
    const room=this.data.room;
    const hour=new Date(now+8*3600000).getUTCHours();
    return {createdAt:room.createdAt,daysTogether:Math.max(1,Math.floor((now-room.createdAt)/DAY)+1),phase:hour>=7&&hour<18?'day':'night',items:room.items,notes:room.notes,virtual:true};
  }
  roomAction(action,args,actor,now=Date.now()){
    if(this.error)throw Error(this.error);
    const room=this.data.room;
    if(action==='room_note'){
      const content=text(args.text,240);if(!content)throw Error('便签不能为空');
      const note={id:crypto.randomUUID(),text:content,actor,at:now,pinned:false};
      room.notes.push(note);
      while(room.notes.filter(x=>!x.pinned).length>5){room.notes.splice(room.notes.findIndex(x=>!x.pinned),1);}
    }else if(action==='room_pin'){
      const note=room.notes.find(x=>x.id===args.id);if(!note)throw Error('便签不存在');
      if(!note.pinned&&room.notes.filter(x=>x.pinned).length>=2)throw Error('最多钉住两条便签');note.pinned=!note.pinned;
    }else if(action==='room_item'){
      const name=text(args.name,30),description=text(args.text,120),place=text(args.place,20);
      if(!name||!description)throw Error('需要物品名和描述');
      const old=room.items.find(x=>x.name===name);if(!old&&room.items.length>=10)throw Error('小屋最多放10件物品');
      const item={id:old?.id||crypto.randomUUID(),name,description,place:place||'桌边',updatedAt:now,virtual:true};
      if(old)Object.assign(old,item);else room.items.push(item);
    }else if(action==='room_remove'){
      if(!room.items.some(x=>x.id===args.id))throw Error('物品不存在');room.items=room.items.filter(x=>x.id!==args.id);
    }else throw Error('未知小屋动作');
    this.save();return this.room(now);
  }
  summary(key,ownerKey,now=Date.now()){
    return {heart:this.heart(key,now),diaryHints:this.listDiary(key,'',now,2),...(key===ownerKey?{room:this.room(now)}:{})};
  }
}
