import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {LivingSpace} from '../src/living-space.js';import {WebRoom} from '../src/web-room.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-diary-inline-')),owner='123456789',id='a'.repeat(20),visitor='b'.repeat(64),guest='c'.repeat(64);
try{
 const l=new LivingSpace(path.join(dir,'living.json'));
 l.data.diary[id]={id,scope:'private:'+owner,createdAt:Date.now(),entry:{'时间':'2026-11-15','内容':'只给主人的日记正文。','心情':'平常'}};
 assert.ok(!Object.hasOwn(l.listDiaryArchive('private:'+owner).entries[0],'text'));
 const room=new WebRoom(path.join(dir,'room.json'),{ownerQQ:owner,roomState:()=>({room:{}}),diaryList:cursor=>l.listDiaryArchive('private:'+owner,cursor,20,{includeText:true}),diaryRead:i=>l.readDiaryArchive('private:'+owner,i)});
 room.data.visitors[visitor]={verifiedQQ:owner};room.data.visitors[guest]={claimedQQ:owner};
 const response=await room.handle('diary_list',{},visitor);assert.equal(response.entries[0].text,'只给主人的日记正文。');
 await assert.rejects(room.handle('diary_list',{},guest),/主人/);
 room.data.visitors[guest]={verifiedQQ:'987654321'};await assert.rejects(room.handle('diary_list',{},guest),/主人/);
 console.log('Inline diary page: one owner-authorized request; default metadata preserved; claimed and other identities rejected.');
}finally{const target=path.resolve(dir),base=path.resolve(os.tmpdir());if(!target.startsWith(base+path.sep)||!path.basename(target).startsWith('fatfish-diary-inline-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});}
