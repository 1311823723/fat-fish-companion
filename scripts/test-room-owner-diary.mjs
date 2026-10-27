import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {WebRoom} from '../src/web-room.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-diary-owner-'));const owner='123456',other='654321',entryId='a'.repeat(20);let reads=0,lists=0;
const opts={ownerQQ:owner,roomState:()=>({room:{items:[],phase:'day'},self:{}}),diaryList:()=>{lists++;return [{id:entryId,date:'fixture',hint:'private hint'}];},diaryRead:id=>{reads++;assert.equal(id,entryId);return {id,text:'PRIVATE OWNER DIARY'};}};
try{
 let room=new WebRoom(path.join(dir,'state.json'),opts);const id='1'.repeat(64),visitor='2'.repeat(64),stranger='3'.repeat(64);
 for(const [key,qq]of [[id,owner],[visitor,''],[stranger,other]])await room.handle('enter',{qq},key);
 for(const key of [id,visitor,stranger]){await assert.rejects(()=>room.handle('diary_list',{ownerQQ:owner,verified:true},key),/仅已验证的主人/);await assert.rejects(()=>room.handle('diary_read',{id:entryId},key),/仅已验证的主人/);}
 assert.equal(lists+reads,0,'unauthorized requests never invoke private diary callbacks');
 const otherCode=await room.handle('challenge',{},stranger);room.confirmQQ(other,otherCode.command);assert.equal(room.identity(stranger).verified,true);assert.equal(room.identity(stranger).canReadDiary,false);await assert.rejects(()=>room.handle('diary_list',{},stranger),/仅已验证的主人/);
 const challenge=await room.handle('challenge',{},id);room.confirmQQ(owner,challenge.command);assert.equal(room.identity(id).canReadDiary,true);
 assert.equal((await room.handle('diary_list',{},id)).entries[0].id,entryId);assert.equal((await room.handle('diary_read',{id:entryId},id)).entry.text,'PRIVATE OWNER DIARY');
 await assert.rejects(()=>room.handle('diary_read',{id:'../state/secret'},id),/编号无效/);
 assert(!JSON.stringify(await room.handle('public_state',{},visitor)).includes('PRIVATE OWNER DIARY'));
 room=new WebRoom(path.join(dir,'state.json'),{...opts,ownerQQ:other});assert.equal(room.identity(id).canReadDiary,false);await assert.rejects(()=>room.handle('diary_list',{},id),/仅已验证的主人/);
 console.log('PASS: diary denied to anonymous, claimed owner, forged role and verified non-owner; verified configured owner can read; invalid IDs and changed owner denied; no public diary leakage. Fixture only.');
}finally{const rel=path.relative(os.tmpdir(),dir);if(rel.startsWith('room-diary-owner-')&&!rel.includes(path.sep))fs.rmSync(dir,{recursive:true,force:true});}
