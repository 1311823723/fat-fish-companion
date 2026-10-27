import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {ROOM_ROOT,roomSettings} from './room-settings.mjs';
const ROOT=ROOM_ROOT;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const ROUTES={'/api/room-state':'public_state','/api/room-enter':'enter','/api/room-challenge':'challenge','/api/room-identity':'identity','/api/room-history':'history','/api/room-chat':'chat','/api/room-action':'pet_action','/api/room-logout':'leave','/api/room-diary-list':'diary_list','/api/room-diary-read':'diary_read'};
export function createVisitorGateway({root=ROOT,secret,upstream='http://127.0.0.1:3100',secureCookies=true}={}){
 if(!secret||secret.length<24)throw Error('Cookie签名密钥缺失');
 const limits=new Map(),TTL=7*86400000;
 const headers={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=86400'};
 const signature=x=>crypto.createHmac('sha256',secret).update(x).digest('base64url');
 function session(req){const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('room_visitor='))?.slice(13)||'';const parts=cookie.split('.');if(parts.length!==3||!equal(signature(parts[0]+'.'+parts[1]),parts[2])||Number(parts[1])<=Date.now()||Number(parts[1])>Date.now()+TTL+60000)return '';return hash(parts[0]);}
 async function call(action,body,id){
  const key=fs.readFileSync(path.join(root,'state/console-token'),'utf8').trim();
  const response=await fetch(upstream+'/api/room-web',{method:'POST',headers:{'content-type':'application/json','x-console-token':key},body:JSON.stringify({...body,action,visitorId:id}),redirect:'error',signal:AbortSignal.timeout(action==='chat'?100000:15000)});
  return {status:response.status,data:await response.json()};
 }
 const server=http.createServer(async(req,res)=>{
  const send=(value,status=200,extra={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8',...headers,...extra});res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&['/','/room'].includes(url.pathname)){res.writeHead(200,{'content-type':'text/html; charset=utf-8',...headers});res.end(fs.readFileSync(path.join(root,'public/room-live.html'),'utf8'));return;}
   const files={'/room-live.js':['room-live.js','text/javascript; charset=utf-8'],'/room-assets/sprites.webp':['room-assets/sprites.webp','image/webp'],'/room-assets/animations.json':['room-assets/animations.json','application/json'],'/room-assets/LICENSE.txt':['room-assets/LICENSE.txt','text/plain; charset=utf-8'],'/room-assets/CREDITS.txt':['room-assets/CREDITS.txt','text/plain; charset=utf-8']};
   if(req.method==='GET'&&files[url.pathname]){const [file,type]=files[url.pathname];res.writeHead(200,{'content-type':type,...headers,'Cache-Control':file==='room-live.js'?'no-store':'public, max-age=3600'});res.end(fs.readFileSync(path.join(root,'public',file)));return;}
   if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204,headers);res.end();return;}
   if(req.method!=='POST'||!ROUTES[url.pathname]){send({ok:false,error:'页面不存在'},404);return;}
   if(req.headers.origin){let host;try{host=new URL(req.headers.origin).host;}catch{send({ok:false,error:'无效来源'},403);return;}if(host!==req.headers.host){send({ok:false,error:'跨站请求被拒绝'},403);return;}}
   if(!String(req.headers['content-type']||'').startsWith('application/json')){send({ok:false,error:'需要JSON'},415);return;}
   let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>4096){send({ok:false,error:'请求过大'},413);return;}chunks.push(c);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{send({ok:false,error:'格式错误'},400);return;}
   const now=Date.now(),ip=hash(String(req.headers['cf-connecting-ip']||req.socket.remoteAddress));
   for(const [key,bucket]of limits)if(now-bucket.at>60000)limits.delete(key);
   const bucket=limits.get(ip)||{at:now,count:0};bucket.count++;limits.set(ip,bucket);if(bucket.count>90||limits.size>10000){send({ok:false,error:'请求太快，请稍后'},429);return;}
   const action=ROUTES[url.pathname];let id=session(req),cookie;
   if(action==='enter'){
    if(typeof body.qq!=='string'||(body.qq&&!/^\d{5,12}$/.test(body.qq))){send({ok:false,error:'QQ号格式无效'},400);return;}
    const random=crypto.randomBytes(32).toString('base64url'),base=random+'.'+(now+TTL);id=hash(random);cookie=`room_visitor=${base}.${signature(base)}; HttpOnly; ${secureCookies?'Secure; ':''}SameSite=Strict; Path=/; Max-Age=${TTL/1000}`;
   }else if(action!=='public_state'&&!id){send({ok:false,error:'请先输入QQ号进入，或选择游客'},401);return;}
   const clean={};
   if(action==='enter')clean.qq=body.qq;
   if(action==='chat'){
    if(typeof body.text!=='string'||body.text.length<1||body.text.length>500||! /^[a-zA-Z0-9-]{10,80}$/.test(String(body.requestId||''))){send({ok:false,error:'消息格式无效'},400);return;}clean.text=body.text;clean.requestId=body.requestId;
   }
   if(action==='diary_read'){if(!/^[a-f0-9]{20}$/.test(String(body.id||''))){send({ok:false,error:'日记编号无效'},400);return;}clean.id=body.id;}
   if(action==='pet_action')clean.name=typeof body.name==='string'?body.name:'';
   const result=await call(action,clean,id);
   const extra={};if(cookie&&result.data.ok)extra['Set-Cookie']=cookie;if(action==='leave')extra['Set-Cookie']=`room_visitor=; HttpOnly; ${secureCookies?'Secure; ':''}SameSite=Strict; Path=/; Max-Age=0`;
   send(result.data,result.status,extra);
  }catch{if(!res.headersSent)send({ok:false,error:'小屋暂时连不上，请稍后再试'},502);else res.end();}
 });server.requestTimeout=25000;server.headersTimeout=10000;return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const key=fs.readFileSync(path.join(ROOT,'state/room-public/visitor-signing-key'),'utf8').trim();
 const settings=roomSettings(ROOT);
 createVisitorGateway({secret:key,upstream:settings.upstream,secureCookies:settings.secureCookies}).listen(settings.port,settings.host,()=>console.log('Visitor room ready: '+settings.mode+' '+settings.host+':'+settings.port));
}
