import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

test('knit idle, sleep and tea frames keep the same vertical anchoring across rows',async()=>{
 const pack=JSON.parse(await fs.readFile('public/assets/outfits/whale_knit/outfit.json','utf8'));
 for(const name of ['idle','sleep','tea','expr_smile','expr_sad','expr_angry','expr_sleepy','read','eat_rice','spin']){
  const a=pack.actions[name],g=a.grid,img=await sharp(path.join('public/assets/outfits/whale_knit',a.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),bounds=[];
  for(let frame=0;frame<a.frames;frame++){
   const left=Math.floor(frame%g.columns*g.columnStep),top=g.offsetY+Math.floor(frame/g.columns)*g.rowStep,rows=[];
   for(let y=0;y<g.height;y++){
    let count=0;for(let x=20;x<g.width-20;x++)if(img.data[((top+y)*img.info.width+left+x)*4+3]>220)count++;
    if(count>20)rows.push(y);
   }
   assert.ok(rows.length>0,`${name} frame ${frame} is empty`);
   bounds.push([rows[0],rows.at(-1)]);
  }
  const bottoms=bounds.map(x=>x[1]);
  assert.ok(Math.max(...bottoms)-Math.min(...bottoms)<=8,`${name} foot anchors drift: ${bottoms}`);
  assert.ok(Math.max(...bottoms)<g.height-2,`${name} has a clipped lower edge`);
 }
});
