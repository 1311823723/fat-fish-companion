import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createVisitorGateway} from '../src/room-public-server.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'visitor-gw-'));let gateway,upstream,records=[];
try{
 fs.mkdirSync(path.join(dir,'state'));fs.mkdirSync(path.join(dir,'public'));fs.writeFileSync(path.join(dir,'state/console-token'),'fixture-console');fs.writeFileSync(path.join(dir,'public/room-live.html'),'<h1>房间</h1>');
 upstream=http.createServer(async(req,res)=>{assert.equal(req.url,'/api/room-web');assert.equal(req.headers['x-console-token'],'fixture-console');let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);records.push(body);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,identity:{verified:false},action:body.action}));});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 gateway=createVisitorGateway({root:dir,secret:'fixture-long-cookie-secret-123456789',upstream:'http://127.0.0.1:'+upstream.address().port});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+gateway.address().port;
 const post=(route,body={},headers={})=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/room-state')).status,200);assert.equal((await post('/api/room-history')).status,401);assert.equal((await fetch(base+'/api/status')).status,404);
 let r=await post('/api/room-enter',{qq:'123456',verifiedQQ:'123456',visitorId:'forged'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert(cookie.includes('HttpOnly')&&cookie.includes('Secure'));const auth={cookie:cookie.split(';')[0]};assert.notEqual(records.at(-1).visitorId,'forged');assert(!records.at(-1).verifiedQQ);
 await post('/api/room-history',{visitorId:'other-person'},auth);assert.equal(records.at(-1).visitorId,records.at(-2).visitorId);
 assert.equal((await post('/api/room-chat',{text:'hello',requestId:'valid-request-123'},{...auth,origin:'https://evil.invalid'})).status,403);
 const forged=auth.cookie.replace(/.$/,'Z');assert.equal((await post('/api/room-history',{}, {cookie:forged})).status,401);
 assert.equal((await post('/api/room-login',{password:'old-password'})).status,404);
 console.log('PASS: anonymous visual room, authenticated visitor chat, signed cookies, exact route allowlist, forged actor/QQ stripping, tamper rejection, CSRF and removed password login.');
}finally{if(gateway)await new Promise(r=>gateway.close(r));if(upstream)await new Promise(r=>upstream.close(r));fs.rmSync(dir,{recursive:true,force:true});}
