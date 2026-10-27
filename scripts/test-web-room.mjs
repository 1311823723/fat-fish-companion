import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {WebRoom} from '../src/web-room.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-web-')),file=path.join(dir,'state.json');
const id=crypto.randomBytes(32).toString('hex'),other=crypto.randomBytes(32).toString('hex'),now=Date.now();let contexts=[],writes=[],calls=0;
const opts={context:async qq=>{contexts.push(qq);return qq?'only-this-person:'+qq:'guest-no-memory';},generate:async()=>{calls++;return '床软乎乎的，想坐就坐。';},remember:(...args)=>writes.push(args),roomState:()=>({room:{phase:'night',daysTogether:1,items:[],notes:[{text:'OWNER PRIVATE NOTE'}]},self:{mood:'开心',energy:62,concerns:['OWNER PRIVATE CONCERN']}})};
try{
 let room=new WebRoom(file,opts);
 const publicData=await room.handle('public_state',{},'',now);assert(!JSON.stringify(publicData).includes('OWNER PRIVATE'));assert.equal(publicData.mood.value,78);
 await room.handle('enter',{qq:'123456'},id,now);await room.handle('enter',{qq:'123456'},other,now);
 let result=await room.handle('chat',{text:'你好',requestId:'request-one-0001'},id,now+10000);assert(result.ok);assert.deepEqual(contexts,['']);
 const challenge=await room.handle('challenge',{},id,now+20000);const code=challenge.command;
 assert(room.confirmQQ('999999',code,now+21000));assert.equal(room.identity(id).verified,false);
 room.confirmQQ('123456',code,now+22000);assert.equal(room.identity(id).verified,true);assert.equal(room.identity(other).verified,false);
 room=new WebRoom(file,opts);assert.equal(room.identity(id).verified,true,'verification persists');
 const request={text:'记住：我喜欢安静的房间',requestId:'request-two-0002'};
 result=await room.handle('chat',request,id,now+30000);assert(result.ok);assert.equal(contexts.at(-1),'123456');assert.equal(writes.length,1);assert.equal(writes[0][0],'123456');
 const before=calls;await room.handle('chat',request,id,now+31000);assert.equal(calls,before,'same request never charges model twice');
 assert.equal((await room.handle('history',{},other,now+32000)).messages.length,0,'same claimed QQ cannot read verified history');
 assert.equal((await room.handle('history',{},id,now+32000)).messages.length,2);
 const state=await room.handle('pet_action',{name:'tea'},other,now+40000);assert.equal(state.activity.name,'tea');
 await room.handle('leave',{},id,now+50000);assert.equal(room.identity(id).verified,false);
 await assert.rejects(()=>room.handle('history',{},id,now+51000),/失效/);
 console.log('PASS: public/private separation, no memory before verification, exact-QQ challenge, persistent identity, per-person histories, explicit shared memory, idempotent model calls, room actions and logout.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
