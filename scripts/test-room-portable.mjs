import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {roomSettings,generateRoomReply} from '../src/room-settings.mjs';
import {createVisitorGateway} from '../src/room-public-server.mjs';
import {WebRoom} from '../src/web-room.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'room-portable-'));let server;const originalFetch=globalThis.fetch;
try{
 fs.copyFileSync(path.join(root,'room.config.example.json'),path.join(temp,'room.config.example.json'));
 let signingKey;
 for(const mode of ['local','lan','public']){
  const run=spawnSync(process.execPath,[path.join(root,'scripts/room-setup.mjs'),'--mode',mode],{env:{...process.env,ROOM_ROOT:temp},encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const s=roomSettings(temp);assert.equal(s.mode,mode);assert.equal(s.host,mode==='lan'?'0.0.0.0':'127.0.0.1');assert.equal(s.secureCookies,mode==='public');
  const key=fs.readFileSync(path.join(temp,'state/room-public/visitor-signing-key'),'utf8');if(signingKey)assert.equal(key,signingKey);signingKey=key;
 }
 const persist=spawnSync(process.execPath,[path.join(root,'scripts/room-setup.mjs')],{env:{...process.env,ROOM_ROOT:temp}});assert.equal(persist.status,0);assert.equal(roomSettings(temp).mode,'public');
 const config={mode:'local',port:3902,upstream:'http://127.0.0.1:3100',botQQ:'123456789',model:'fixture',modelBaseURL:'http://127.0.0.1:9999/v1'};
 fs.writeFileSync(path.join(temp,'room.config.json'),JSON.stringify(config));
 const room=new WebRoom(path.join(temp,'web.json'),{botQQ:config.botQQ});const id='a'.repeat(64);await room.handle('enter',{qq:'987654321'},id);const challenge=await room.handle('challenge',{},id);assert.equal(challenge.botQQ,'123****789');assert(!JSON.stringify(challenge).includes(config.botQQ));
 let request;globalThis.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({choices:[{message:{content:'fixture reply'}}]})};};
 assert.equal(await generateRoomReply([{role:'user',content:'fixture'}],{root:temp}),'fixture reply');assert.equal(request.url,'http://127.0.0.1:9999/v1/chat/completions');assert.equal(request.body.model,'fixture');assert(!request.body.tools);
 globalThis.fetch=originalFetch;
 fs.writeFileSync(path.join(temp,'room.config.json'),JSON.stringify({...config,upstream:'http://external.example'}));assert.throws(()=>roomSettings(temp));
 // Exercise LAN cookies through the actual gateway with a local fixture upstream.
 const http=await import('node:http');const upstream=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end('{"ok":true}');});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 try{
  fs.writeFileSync(path.join(temp,'state/console-token'),'fixture');
  for(const secureCookies of [false,true]){
   server=createVisitorGateway({root:temp,secret:signingKey,upstream:'http://127.0.0.1:'+upstream.address().port,secureCookies});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/room-enter',{method:'POST',headers:{'content-type':'application/json'},body:'{"qq":""}'});assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie').includes('; Secure;'),secureCookies);await new Promise(r=>server.close(r));server=null;
  }
 }finally{await new Promise(r=>upstream.close(r));}
 console.log('PASS: portable root, all access modes, idempotent setup, masked QQ, configurable model without tools, local-only upstream and LAN/public cookie policy. No live model/QQ calls.');
}finally{
 globalThis.fetch=originalFetch;if(server)await new Promise(r=>server.close(r));
 const relative=path.relative(path.resolve(os.tmpdir()),path.resolve(temp));if(relative.startsWith('room-portable-')&&!relative.includes(path.sep))fs.rmSync(temp,{recursive:true,force:true});
}
