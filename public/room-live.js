const $=id=>document.getElementById(id);
let identity={verified:false},joined=false,state=null,chatBusy=false,atlas=null,image=null,privateBubble='';
async function api(route,args={}){const r=await fetch('/api/room-'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)});const v=await r.json();if(!r.ok||v.ok===false)throw Error(v.error||'暂时没接上');return v;}
function status(message){$('message').textContent=message;}
function el(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
function showIdentity(value){identity=value||{};joined=!!identity.claimedQQ||identity.verified||joined;$('identityText').textContent=identity.verified?'已验证 QQ '+identity.qq:joined?'访客 · 未关联记忆':'验证QQ后关联记忆';$('verifyPanel').hidden=identity.verified||!identity.claimedQQ;$('auth').hidden=joined;$('leaveRoom').hidden=!joined;}
function render(data){state=data;$('subtitle').textContent='搬进来第 '+data.room.daysTogether+' 天 · '+(data.room.phase==='day'?'白天':'夜晚');$('scene').classList.toggle('night',data.room.phase==='night');$('phase').textContent='大肥鱼在家 · '+(data.room.phase==='day'?'白天':'夜晚');$('items').replaceChildren();$('moodText').textContent=data.mood.label;$('moodValue').textContent=data.mood.value;$('energyValue').textContent=data.mood.energy;$('moodMeter').value=data.mood.value;$('energyMeter').value=data.mood.energy;$('visitorCount').textContent=data.visitorCount||0;const labels={idle:'发呆',walk:'散步',sleep:'睡觉',wake:'醒来',tea:'喝奶茶',eat:'吃零食'};$('activityText').textContent=labels[data.activity.name]||labels.idle;showIdentity(data.identity);}
async function poll(){try{render(await api('state'));}catch(e){status(e.message);}}
function showHistory(messages){$('chatLog').replaceChildren(...messages.map(m=>{const box=el('div',m.text,'chat-line '+m.role);box.prepend(el('small',m.role==='user'?'你':'大肥鱼'));return box;}));$('chatLog').scrollTop=$('chatLog').scrollHeight;}
async function history(){try{const v=await api('history');showIdentity(v.identity);showHistory(v.messages);joined=true;$('auth').hidden=true;$('leaveRoom').hidden=false;}catch{joined=false;}}
async function enter(qq){try{const v=await api('enter',{qq});joined=true;showIdentity(v.identity);$('access').value='';$('verificationCommand').textContent='';status('');await history();await poll();}catch(e){status(e.message);}}
$('auth').onsubmit=e=>{e.preventDefault();enter($('access').value.trim());};$('guestEnter').onclick=()=>enter('');
$('requestVerify').onclick=async()=>{try{const v=await api('challenge');$('verificationCommand').textContent='用所填QQ私聊大肥鱼（'+String(v.botQQ||'').replace(/^(\d{3})\d+(\d{3})$/, '$1****$2')+'）发送：\n'+v.command+'\n10分钟内有效，发送后点“检查验证”。';$('copyCode').hidden=false;$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(v.command);status('已复制，请私聊大肥鱼发送。');}catch{status('请手动复制验证语句。');}};}catch(e){status(e.message);}};
$('checkVerify').onclick=async()=>{try{const v=await api('identity');showIdentity(v.identity);if(v.identity.verified){status('已验证，记忆已关联。');await history();}else status('尚未收到验证，请用所填QQ发送完整语句。');}catch(e){status(e.message);}};
$('leaveRoom').onclick=async()=>{try{await api('logout');location.reload();}catch(e){status(e.message);}};
$('refresh').onclick=poll;
$('chatForm').onsubmit=async e=>{e.preventDefault();if(!joined){status('先填QQ号进屋，或点“直接做客”。');return;}if(chatBusy)return;const text=$('chatInput').value.trim();if(!text)return;chatBusy=true;$('chatSend').disabled=true;$('chatSend').textContent='她在想…';$('chatInput').value='';const box=el('div',text,'chat-line user');box.prepend(el('small','你'));$('chatLog').append(box);$('chatLog').scrollTop=$('chatLog').scrollHeight;try{const v=await api('chat',{text,requestId:typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')});const answer=el('div',v.message.text,'chat-line assistant');answer.prepend(el('small','大肥鱼'));$('chatLog').append(answer);privateBubble=v.message.text;$('petSpeech').textContent=privateBubble;$('petSpeech').hidden=false;setTimeout(()=>{$('petSpeech').hidden=true;},12000);status('');}catch(e){status(e.message);}finally{chatBusy=false;$('chatSend').disabled=false;$('chatSend').textContent='发送';$('chatLog').scrollTop=$('chatLog').scrollHeight;}};
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{if(!joined){status('先进入房间再和她互动吧。');return;}try{await api('action',{name:button.dataset.action});await poll();status('');}catch(e){status(e.message);}});
$('fridgeToggle').onclick=()=>{const open=$('scene').classList.toggle('fridge-open');$('fridgeToggle').setAttribute('aria-expanded',String(open));$('fridgeToggle').textContent=open?'关上冰箱':'打开冰箱';};
async function loadPet(){try{atlas=await fetch('/room-assets/animations.json').then(r=>r.json());image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src='/room-assets/sprites.webp';});$('petLoading').hidden=true;requestAnimationFrame(draw);}catch{status('角色素材暂时未加载，请刷新试试。');}}
const canvas=$('petCanvas'),ctx=canvas.getContext('2d');canvas.width=600;canvas.height=800;let lastDraw=0;
function draw(time){requestAnimationFrame(draw);if(document.hidden||!state||!image||time-lastDraw<80)return;lastDraw=time;const a=state.activity,now=Date.now(),progress=Math.max(0,Math.min(1,(now-a.startedAt)/Math.max(1,a.until-a.startedAt)));let action='idle',x=300,y=710,scale=.95;
 if(a.name==='walk'){action=a.toX>a.fromX?'walk_right':'walk_left';x=(a.fromX+(a.toX-a.fromX)*progress)*600;}
 else if(a.name==='sleep'){action='sleep';x=170;y=430;scale=.8;}
 else if(a.name==='wake'){action=now-a.startedAt<2500?'wake':'idle';x=260;}
 else if(a.name==='tea'||a.name==='eat'){action=a.name==='tea'?'tea':'eat_taiyaki';x=435;y=610;}
 else if(state.mood.expression!=='neutral'){action='expr_'+state.mood.expression;}
 const anim=atlas.animations[action]||atlas.animations.idle;const index=Math.floor(Math.max(0,(now-a.startedAt))/1000*anim.fps)%anim.frames.length;const f=anim.frames[index];ctx.clearRect(0,0,600,800);ctx.save();ctx.fillStyle='rgba(65,55,42,.13)';ctx.beginPath();ctx.ellipse(x,y+2,action==='sleep'?58:34,8,0,0,Math.PI*2);ctx.fill();ctx.translate(x-128*scale,y-244*scale);ctx.scale(scale,scale);if(f.flip){ctx.translate(f.ox+f.w,f.oy);ctx.scale(-1,1);ctx.drawImage(image,f.x,f.y,f.w,f.h,0,0,f.w,f.h);}else ctx.drawImage(image,f.x,f.y,f.w,f.h,f.ox,f.oy,f.w,f.h);ctx.restore();$('petSpeech').style.left=Math.max(10,Math.min(68,x/600*100-10))+'%';$('petSpeech').style.top=Math.max(7,(y-215*scale)/800*100-8)+'%';
}
await history();await poll();loadPet();setInterval(()=>{if(!document.hidden)poll();},5000);

$('diaryClose').onclick=()=>$('diaryDialog').close();
$('diaryHotspot').onclick=async()=>{
 const dialog=$('diaryDialog');$('diaryEntries').replaceChildren();$('diaryNotice').textContent='';dialog.showModal();
 if(!joined||!identity.verified){$('diaryNotice').textContent='请先验证主人QQ，再来翻日记。';return;}
 if(!identity.canReadDiary){$('diaryNotice').textContent='这本日记只给主人看。';return;}
 $('diaryNotice').textContent='翻开日记…';
 try{
  const result=await api('diary-list');if(!dialog.open)return;
  $('diaryNotice').textContent=result.entries.length?'':'暂时没有可翻看的日记。';
  for(const entry of result.entries){
   const details=el('details','','diary-entry'),summary=el('summary',[entry.date,entry.mood,entry.hint].filter(Boolean).join(' · '));details.append(summary);
   const body=el('div','','diary-body');details.append(body);let loaded=false,busy=false;
   details.ontoggle=async()=>{if(!details.open||loaded||busy)return;busy=true;body.textContent='读取中…';try{const value=await api('diary-read',{id:entry.id});body.textContent=value.entry.text;loaded=true;}catch(e){body.textContent=e.message;const retry=el('button','重试','secondary');retry.onclick=()=>{details.open=false;details.open=true;};body.append(document.createElement('br'),retry);}finally{busy=false;}};
   $('diaryEntries').append(details);
  }
 }catch(e){$('diaryNotice').textContent=e.message;}
};
$('diaryDialog').addEventListener('close',()=>{$('diaryEntries').replaceChildren();$('diaryNotice').textContent='';});
