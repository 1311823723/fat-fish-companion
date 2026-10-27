import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const ROOM_ROOT=path.resolve(process.env.ROOM_ROOT||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
export function roomSettings(root=ROOM_ROOT){
 let local={};try{local=JSON.parse(fs.readFileSync(path.join(root,'room.config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('room.config.json 无效');}
 const mode=local.mode||'local';if(!['local','lan','public'].includes(mode))throw Error('小屋访问模式无效');
 const port=Number(local.port||3102);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('小屋端口无效');
 const upstream=local.upstream||'http://127.0.0.1:3100';const u=new URL(upstream);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.protocol!=='http:')throw Error('桥接地址必须是本机HTTP地址');
 return {...local,mode,port,upstream,host:mode==='lan'?'0.0.0.0':'127.0.0.1',secureCookies:mode==='public',botQQ:String(local.botQQ||'')};
}
export async function generateRoomReply(messages,{root=ROOM_ROOT,model}={}){
 const s=roomSettings(root);let key=process.env[s.apiKeyEnv||'ROOM_API_KEY']||'';
 if(s.proxyConfigModule){const proxy=await import(pathToFileURL(path.resolve(root,s.proxyConfigModule)).href);key=proxy.primaryKey(proxy.loadConfig());}
 const base=String(s.modelBaseURL||'http://127.0.0.1:8788/v1').replace(/\/$/,'');
 const response=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({model:s.model||model||'deepseek-chat',messages,max_tokens:400,temperature:.7,stream:false}),signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('网页模型请求失败');const result=await response.json();const text=result.choices?.[0]?.message?.content;return typeof text==='string'?text:'';
}
