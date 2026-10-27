import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {ROOM_ROOT,roomSettings} from '../src/room-settings.mjs';
const args=process.argv.slice(2),modeArg=args.indexOf('--mode');const mode=modeArg>=0?args[modeArg+1]:undefined;
if(mode&&!['local','lan','public'].includes(mode))throw Error('--mode 必须是 local / lan / public');
const configFile=path.join(ROOM_ROOT,'room.config.json');let config={};try{config=JSON.parse(fs.readFileSync(configFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!fs.existsSync(configFile)){config=JSON.parse(fs.readFileSync(path.join(ROOM_ROOT,'room.config.example.json'),'utf8'));}
if(mode)config.mode=mode;
fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
const state=path.join(ROOM_ROOT,'state','room-public');fs.mkdirSync(state,{recursive:true});const keyFile=path.join(state,'visitor-signing-key');if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(48).toString('base64url'),{mode:0o600});
const s=roomSettings();console.log('小屋配置已就绪：'+s.mode+'，监听 '+s.host+':'+s.port+'。现有密钥和聊天存档已保留。');
console.log('启动：npm run room:start；检查：npm run room:doctor。公网模式还需启动HTTPS反向代理或隧道。');
