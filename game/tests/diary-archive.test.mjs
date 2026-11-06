import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../src/config.mjs';
import {removeTestDirectory} from './helpers.mjs';
import http from 'node:http';
test('owner archive pages through old and shelved entries without changing memory or exposing another scope',async(t)=>{
  const base=process.env.BRIDGE_FIXTURE_ROOT||path.resolve(ROOT,'..');
  const file=path.join(base,'src/living-space.js');if(!fs.existsSync(file)){t.skip('bridge fixture is not installed');return;}
  const {LivingSpace}=await import(pathToFileURL(file));const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-diary-archive-'));
  try{
    const book=new LivingSpace(path.join(dir,'book.json')),owner='private:11111',now=Date.parse('2026-11-06T12:00:00+08:00');
    const entries=Array.from({length:45},(_,i)=>({'时间':`2026-09-${String(1+Math.floor(i/2)).padStart(2,'0')} ${String(i%24).padStart(2,'0')}:00`,'心情':'平常','内容':`记录 ${i}`,scope:owner}));
    book.syncDiary(entries,owner,now);book.syncDiary([{'时间':'2026-09-02 00:00','内容':'other',scope:'private:22222'}],owner,now);
    const all=Object.values(book.data.diary).filter(x=>x.scope===owner);all[0].shelved={reason:'avoid',at:now-1000};all[1].deletedAt=now;
    assert.equal(book.listDiary(owner,'',now,10).length,0);
    let cursor='',seen=[];do{const p=book.listDiaryArchive(owner,cursor,10);seen.push(...p.entries);cursor=p.nextCursor||'';}while(cursor);
    assert.equal(seen.length,44);assert.equal(new Set(seen.map(x=>x.id)).size,44);assert.ok(seen.some(x=>x.id===all[0].id));
    const before=JSON.stringify(book.data);assert.equal(book.readDiaryArchive(owner,all[0].id).内容,all[0].entry.内容);assert.equal(JSON.stringify(book.data),before);
    assert.throws(()=>book.readDiaryArchive('private:22222',all[0].id));assert.throws(()=>book.readDiaryArchive(owner,all[1].id));
    assert.throws(()=>book.listDiaryArchive(owner,'invalid'));
  }finally{removeTestDirectory(dir);}
});
test('visitor gateway forwards validated diary pagination cursor',async(t)=>{
  const base=process.env.BRIDGE_FIXTURE_ROOT||path.resolve(ROOT,'..'),file=path.join(base,'src/room-public-server.mjs');
  if(!fs.existsSync(file)){t.skip('bridge fixture is not installed');return;}
  const {createVisitorGateway}=await import(pathToFileURL(file)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-diary-gateway-'));
  fs.mkdirSync(path.join(dir,'state'),{recursive:true});fs.writeFileSync(path.join(dir,'state/console-token'),'fixture-token');let received;
  const upstream=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received=JSON.parse(raw);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,entries:[],nextCursor:null}));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const gateway=createVisitorGateway({root:dir,secret:'fixture-secret-'.repeat(4),upstream:'http://127.0.0.1:'+upstream.address().port,secureCookies:false});
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+gateway.address().port;
  try{
    const enter=await fetch(url+'/api/room-enter',{method:'POST',headers:{'content-type':'application/json'},body:'{"qq":""}'});const cookie=enter.headers.get('set-cookie').split(';')[0],cursor='a'.repeat(20);
    const page=await fetch(url+'/api/room-diary-list',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({cursor})});assert.equal(page.status,200);assert.equal(received.cursor,cursor);
    const bad=await fetch(url+'/api/room-diary-list',{method:'POST',headers:{'content-type':'application/json',cookie},body:'{"cursor":"bad"}'});assert.equal(bad.status,400);
  }finally{await new Promise(r=>gateway.close(r));await new Promise(r=>upstream.close(r));removeTestDirectory(dir);}
});
test('archive pages and original text remain restricted to verified owner',async(t)=>{
  const base=process.env.BRIDGE_FIXTURE_ROOT||path.resolve(ROOT,'..'),file=path.join(base,'src/web-room.mjs');
  if(!fs.existsSync(file)){t.skip('bridge fixture is not installed');return;}
  const {WebRoom}=await import(pathToFileURL(file)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-diary-auth-'));
  try{
    const room=new WebRoom(path.join(dir,'room.json'),{ownerQQ:'11111',context:()=>'',generate:()=>'',remember:()=>{},roomState:()=>({room:{},self:{}}),diaryList:cursor=>({entries:[{id:'a'.repeat(20)}],nextCursor:cursor?'':'a'.repeat(20)}),diaryRead:()=>({text:'private fixture'})});
    const id='a'.repeat(64);await room.handle('enter',{qq:'11111'},id);
    await assert.rejects(()=>room.handle('diary_list',{},id),/已验证/);
    room.data.visitors[id].verifiedQQ='11111';const first=await room.handle('diary_list',{},id);assert.equal(first.nextCursor,'a'.repeat(20));
    const second=await room.handle('diary_list',{cursor:first.nextCursor},id);assert.equal(second.entries.length,1);
    assert.equal((await room.handle('diary_read',{id:'a'.repeat(20)},id)).entry.text,'private fixture');
    await assert.rejects(()=>room.handle('diary_list',{cursor:'bad'},id),/无效/);
  }finally{removeTestDirectory(dir);}
});
