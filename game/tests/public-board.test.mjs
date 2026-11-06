import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/core/store.mjs';import {PublicBoard} from '../src/core/public-board.mjs';import {makeServer} from '../src/server.mjs';import {installGameCore} from '../adapters/game-core-adapter.mjs';import {removeTestDirectory} from './helpers.mjs';
const guest={id:'guest-a',identity:{verified:false}},other={id:'guest-b',identity:{verified:false}},claimed={id:'guest-c',identity:{verified:false,claimedQQ:'123456789'}},owner={id:'owner',verifiedQQ:'987654321',identity:{verified:true,qq:'987654321',canReadDiary:true}};
test('public posts mask QQ, deduplicate, paginate, and enforce management permissions',()=>{
 const store=new Store(),board=new PublicBoard(store);
 try{
  const id=board.post(claimed,{text:'你好，小屋',requestId:'request-00001'});assert.equal(board.post(claimed,{text:'你好，小屋',requestId:'request-00001'}),id);
  const post=board.list(other).entries[0];assert.equal(post.author,'QQ 12****89（自填）');assert.ok(!JSON.stringify(post).includes('123456789'));assert.equal(post.canManage,false);
  assert.throws(()=>board.manage(other,{op:'delete',id}),/权限/);
  assert.equal(board.list(claimed).entries[0].canManage,true);
  board.manage(owner,{op:'delete',id});assert.equal(board.list(guest).entries.length,0);
  const raw=store.db.prepare('SELECT content,reply FROM room_public_board WHERE id=?').get(id);assert.equal(raw.content,'');assert.equal(raw.reply,'');
  board.post(owner,{text:'主人留言',requestId:'owner-request-1'});board.post(guest,{text:'访客留言',requestId:'guest-request-1'});
  const authors=board.list(other).entries.map(x=>x.author);assert.ok(authors.includes('QQ 98****21'));assert.ok(authors.includes('访客'));assert.ok(!JSON.stringify(authors).includes('987654321'));
 }finally{store.close();}
});
test('interrupted work can be retried explicitly and deletion prevents late replies',()=>{
 const store=new Store(),board=new PublicBoard(store);
 try{
  const id=board.post(guest,{text:'留言',requestId:'request-00002'});const job=store.claim('board-reply');assert.ok(job);assert.equal(board.start(id,0).text,'留言');
  const resumed=new PublicBoard(store);assert.equal(resumed.list(guest).entries[0].replyStatus,'failed');
  resumed.manage(guest,{op:'retry',id});assert.equal(resumed.start(id,1).text,'留言');resumed.manage(guest,{op:'delete',id});resumed.finish(id,1,'不应显示');assert.equal(resumed.list(guest).entries.length,0);
 }finally{store.close();}
});
test('stalled claimed replies become retryable without automatically regenerating',()=>{
 let now=Date.now();const store=new Store(':memory:',()=>now),board=new PublicBoard(store);
 try{
  const id=board.post(guest,{text:'留言',requestId:'request-stall1'});store.claim('board-reply');
  now+=181000;assert.equal(board.list(guest).entries[0].replyStatus,'failed');
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='board-reply'").get().n,1);
  board.manage(guest,{op:'retry',id});assert.equal(board.list(guest).entries[0].replyStatus,'pending');
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='board-reply'").get().n,2);
 }finally{store.close();}
});
test('public feed persists across restart and can page beyond twenty posts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-board-db-')),file=path.join(dir,'world.db');let store=new Store(file);
 try{
  let board=new PublicBoard(store);for(let i=0;i<25;i++)board.post({id:'guest-'+i,identity:{}},{text:'公开留言 '+i,requestId:'request-'+String(i).padStart(5,'0')});
  const first=board.list(guest);assert.equal(first.entries.length,20);assert.ok(first.nextCursor);store.close();
  store=new Store(file);board=new PublicBoard(store);const second=board.list(guest,first.nextCursor);assert.equal(second.entries.length,5);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.entries,...second.entries].map(x=>x.id)).size,25);
 }finally{store.close();removeTestDirectory(dir);}
});
test('isolated public reply gets only public text and never private identity or session',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-board-'));fs.mkdirSync(path.join(dir,'state'));const store=new Store(),secret='fixture-secret-'.repeat(4),{server}=makeServer({allowedOrigins:[],adapterSecret:secret},{store});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 fs.writeFileSync(path.join(dir,'state/game-core-link.json'),JSON.stringify({enabled:true,url:'http://127.0.0.1:'+server.address().port,secret}));
 const room={data:{visitors:{}},roomState:()=>({room:{daysTogether:1}})}, adapter=installGameCore(room,{root:dir}),board=new PublicBoard(store),captured=[];
 try{
  board.post(claimed,{text:'今天的风景不错。',requestId:'request-00003'});
  await adapter.tick({generate:async messages=>{captured.push(messages);return '嗯，听起来挺舒服。';},chooseTargets:async()=>[],isAllowed:()=>true,isBusy:()=>false,sendProgress:async()=>{},sendPhoto:async()=>{},record:()=>{}});
  const result=board.list(guest).entries[0];assert.equal(result.replyStatus,'done');assert.equal(result.reply,'嗯，听起来挺舒服。');
  assert.equal(captured.length,1);assert.equal(captured[0][1].content,'今天的风景不错。');assert.ok(!JSON.stringify(captured).includes('123456789'));
 }finally{adapter.stop();await new Promise(r=>server.close(r));store.close();removeTestDirectory(dir);}
});
