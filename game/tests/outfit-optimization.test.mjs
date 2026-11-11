import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {optimizeOutfits} from '../scripts/optimize-outfits.mjs';import {installOutfitPack} from '../scripts/install-outfit-pack.mjs';import {checkOutfitPack,ACTIONS} from '../scripts/check-outfit-pack.mjs';import {removeTestDirectory} from './helpers.mjs';
test('outfit optimization creates small separate previews, preserves frame geometry and survives optimized-only install and repeat build',async()=>{
 sharp.cache(false);
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fatfish-optimized-')),root=path.join(temp,'public'),assets=path.join(root,'assets'),dir=path.join(assets,'outfits','sample');
 try{
  await fs.mkdir(dir,{recursive:true});
  const patch=await sharp({create:{width:128,height:128,channels:4,background:{r:90,g:140,b:180,alpha:0.5}}}).png().toBuffer();
  await sharp({create:{width:256,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:patch,left:64,top:64}]).png().toFile(path.join(dir,'frame.png'));
  await sharp({create:{width:600,height:900,channels:4,background:{r:80,g:120,b:160,alpha:1}}}).png().toFile(path.join(dir,'reference.png'));
  const manifest={id:'sample',name:'sample',photoReference:'reference.png',actions:Object.fromEntries(ACTIONS.map(n=>[n,{file:'frame.png',frames:1,fps:4}]))};
  await fs.writeFile(path.join(dir,'outfit.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(assets,'outfits-v1.json'),JSON.stringify({outfits:[{...manifest,photoReference:'/assets/outfits/sample/reference.png',actions:Object.fromEntries(ACTIONS.map(n=>[n,{...manifest.actions[n],file:'/assets/outfits/sample/frame.png'}]))}]}));
  await optimizeOutfits(root);
  const first=await fs.readFile(path.join(assets,'outfits-v1.json'),'utf8'),pack=JSON.parse(await fs.readFile(path.join(dir,'outfit.json'),'utf8'));
  assert.match(pack.preview,/^preview-[a-f0-9]{12}\.webp$/);
  const preview=await sharp(path.join(dir,pack.preview)).metadata();assert.ok(preview.width<=280&&preview.height<=320);
  const runtime=await sharp(path.join(dir,pack.actions.idle.file)).metadata();assert.equal(runtime.width,256);assert.equal(runtime.height,256);assert.ok(runtime.hasAlpha);
  const originalAlpha=await sharp(path.join(dir,'frame.png')).extractChannel('alpha').raw().toBuffer();
  const runtimeAlpha=await sharp(path.join(dir,pack.actions.idle.file)).extractChannel('alpha').raw().toBuffer();assert.deepEqual(runtimeAlpha,originalAlpha);
  await optimizeOutfits(root);assert.equal(await fs.readFile(path.join(assets,'outfits-v1.json'),'utf8'),first);
  const dest=path.join(temp,'installed');await fs.mkdir(path.join(dest,'assets'),{recursive:true});await fs.writeFile(path.join(dest,'assets','outfits-v1.json'),'{"outfits":[]}');
  await installOutfitPack(dir,dest);await optimizeOutfits(dest);
  assert.ok((await fs.stat(path.join(dest,'assets','outfits','sample',pack.preview))).isFile());
  pack.preview='../outside.webp';await fs.writeFile(path.join(dir,'outfit.json'),JSON.stringify(pack));assert.ok((await checkOutfitPack(dir)).errors.some(x=>x.startsWith('preview')));
 }finally{
  const base=path.resolve(os.tmpdir()),target=path.resolve(temp);
  if(!target.startsWith(base+path.sep)||!path.basename(target).startsWith('fatfish-optimized-'))throw Error('Invalid test cleanup target');
  await fs.rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});
