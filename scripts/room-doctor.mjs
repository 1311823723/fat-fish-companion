import fs from 'node:fs';import path from 'node:path';import {ROOM_ROOT,roomSettings} from '../src/room-settings.mjs';
const s=roomSettings();let bad=false;
function check(name,ok){console.log((ok?'OK ':'FAIL ')+name);if(!ok)bad=true;}
for(const file of ['public/room-live.html','public/room-live.js','public/room-assets/sprites.webp','public/room-assets/animations.json','state/room-public/visitor-signing-key','state/console-token'])check(file,fs.existsSync(path.join(ROOM_ROOT,file)));
const source=fs.readFileSync(path.join(ROOM_ROOT,'src/bridge.js'),'utf8');check('桥接包含WebRoom与QQ验证码处理入口',source.includes('new WebRoom(')&&source.includes('confirmQQ('));
try{const response=await fetch(s.upstream+'/api/status',{headers:{'x-console-token':fs.readFileSync(path.join(ROOM_ROOT,'state/console-token'),'utf8').trim()},signal:AbortSignal.timeout(5000)});check('桥接在线',response.ok);}catch{check('桥接在线',false);}
try{const response=await fetch('http://127.0.0.1:'+s.port+'/room',{signal:AbortSignal.timeout(5000)});check('小屋入口在线',response.ok);const forbidden=await fetch('http://127.0.0.1:'+s.port+'/api/status');check('管理接口未开放到小屋',forbidden.status===404);}catch{check('小屋入口在线',false);}
check('机器人QQ已配置（不回显号码）',/^\d{5,12}$/.test(s.botQQ));
console.log('模型端到端与本人QQ验证需按 docs/ROOM-DEPLOY.md 验收；此检查不会调用付费模型或发送QQ消息。');process.exitCode=bad?1:0;
