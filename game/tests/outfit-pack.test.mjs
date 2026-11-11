import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ACTIONS,checkOutfitPack} from '../scripts/check-outfit-pack.mjs';
import {installOutfitPack} from '../scripts/install-outfit-pack.mjs';

test('validates all actions, image dimensions and unsafe paths',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'outfit-pack-'));
 try{
  await sharp({create:{width:256,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toFile(path.join(dir,'frame.png'));
  const manifest={id:'sample',name:'样例',actions:Object.fromEntries(ACTIONS.map(a=>[a,{file:'frame.png',frames:1,fps:6}]))};
  await fs.writeFile(path.join(dir,'outfit.json'),JSON.stringify(manifest));
  assert.equal((await checkOutfitPack(dir)).ok,true);
  manifest.actions.walk_left.file='../frame.png';delete manifest.actions.sleep;
  await fs.writeFile(path.join(dir,'outfit.json'),JSON.stringify(manifest));
  const bad=await checkOutfitPack(dir);
  assert.equal(bad.ok,false);assert.ok(bad.errors.some(x=>x.startsWith('walk_left:')));assert.ok(bad.errors.some(x=>x.startsWith('sleep:')));
  manifest.actions.walk_left={file:'frame.png',frames:1,fps:6,grid:{columns:1,columnStep:256,offsetY:0,rowStep:256,width:256,height:256}};
  manifest.actions.sleep={file:'frame.png',frames:1,fps:6};
  await fs.writeFile(path.join(dir,'outfit.json'),JSON.stringify(manifest));assert.equal((await checkOutfitPack(dir)).ok,true);
  manifest.actions.walk_left.grid.offsetY=3;
  await fs.writeFile(path.join(dir,'outfit.json'),JSON.stringify(manifest));assert.ok((await checkOutfitPack(dir)).errors.some(x=>x.startsWith('walk_left:')));
 } finally {await fs.unlink(path.join(dir,'frame.png')).catch(()=>{});await fs.unlink(path.join(dir,'outfit.json')).catch(()=>{});await fs.rmdir(dir);}
});
test('installer requires complete packs and refuses duplicate IDs',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fatfish-outfit-'));
 const source=path.join(dir,'source'),publicRoot=path.join(dir,'public');
 try{
  await fs.mkdir(source);await fs.mkdir(path.join(publicRoot,'assets'),{recursive:true});
  await fs.writeFile(path.join(publicRoot,'assets','outfits-v1.json'),'{"outfits":[]}');
  await sharp({create:{width:256,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toFile(path.join(source,'frame.png'));
  const manifest={id:'sample',name:'样例',actions:Object.fromEntries(ACTIONS.map(a=>[a,{file:'frame.png',frames:1,fps:6}]))};
  await fs.writeFile(path.join(source,'outfit.json'),JSON.stringify(manifest));
  manifest.inspiration='参考服装 COS';
  await fs.writeFile(path.join(source,'outfit.json'),JSON.stringify(manifest));
  await installOutfitPack(source,publicRoot);
  const catalog=JSON.parse(await fs.readFile(path.join(publicRoot,'assets','outfits-v1.json'),'utf8'));
  assert.equal(catalog.outfits[0].actions.idle.file,'/assets/outfits/sample/frame.png');
  assert.equal(catalog.outfits[0].inspiration,'参考服装 COS');
  await assert.rejects(installOutfitPack(source,publicRoot),/ID 已存在/);
 }finally{
  const {removeTestDirectory}=await import('./helpers.mjs');removeTestDirectory(dir);
 }
});
