import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import sharp from 'sharp';import {checkOutfitPack} from '../scripts/check-outfit-pack.mjs';
test('cat paw outfit covers every action with transparent frames, consistent feet and no vertical clipping',async()=>{
 const root='public/assets/outfits/cat_paw',result=await checkOutfitPack(root);assert.equal(result.ok,true,result.errors.join('\n'));
 assert.equal(Object.keys(result.manifest.actions).length,16);
 for(const [name,a] of Object.entries(result.manifest.actions)){
  const {data,info}=await sharp(path.join(root,a.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),g=a.grid,bottoms=[];
  for(let f=0;f<a.frames;f++){
   const rows=[];for(let y=0;y<g.height;y++){let n=0;for(let x=5;x<g.width-5;x++)if(data[((g.offsetY+y)*info.width+Math.floor(f*g.columnStep)+x)*4+3]>220)n++;if(n>20)rows.push(y);}
   assert.ok(rows.length>0,`${name} frame ${f} empty`);assert.ok(rows[0]>2&&rows.at(-1)<g.height-2,`${name} clipped`);bottoms.push(rows.at(-1));
  }
  assert.ok(Math.max(...bottoms)-Math.min(...bottoms)<=8,`${name} feet drift`);
 }
});
