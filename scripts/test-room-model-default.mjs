import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { generateRoomReply } from '../src/room-settings.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-room-model-'));
let seen='';
const server=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;seen=JSON.parse(body).model;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'收到'}}]}));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 fs.writeFileSync(path.join(dir,'proxy.mjs'),"export const loadConfig=()=>({defaultModel:'fixture-default'});export const primaryKey=()=> 'fixture-key';");
 const c={modelBaseURL:'http://127.0.0.1:'+server.address().port,proxyConfigModule:'proxy.mjs'};
 const save=()=>fs.writeFileSync(path.join(dir,'room.config.json'),JSON.stringify(c));save();
 assert.equal(await generateRoomReply([{role:'user',content:'测试'}],{root:dir}),'收到');assert.equal(seen,'fixture-default');
 await generateRoomReply([],{root:dir,model:'fixture-caller'});assert.equal(seen,'fixture-caller');
 c.model='fixture-explicit';save();await generateRoomReply([],{root:dir,model:'fixture-caller'});assert.equal(seen,'fixture-explicit');
 console.log('PASS: room model uses explicit choice, caller, then proxy default without stale fallback');
}finally{await new Promise(r=>server.close(r));if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('fatfish-room-model-'))throw Error('Unexpected cleanup path');fs.rmSync(dir,{recursive:true,force:true});}
