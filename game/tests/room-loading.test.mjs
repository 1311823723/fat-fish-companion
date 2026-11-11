import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import runtime from '../public/assets/room-runtime.json' with {type:'json'};
test('first room assets stay below budget, keep transparency and use versioned URLs',async()=>{
 assert.ok(runtime.budget.currentPreloadBytes<550000);
 assert.ok(runtime.budget.currentPreloadBytes<runtime.budget.previousPreloadBytes*.25);
 for(const file of [...Object.values(runtime.images),...Object.values(runtime.actions).map(a=>a.file)]){
  assert.match(file,/^\/assets\/[a-z0-9_-]+-[a-f0-9]{12}\.webp$/);assert.ok(fs.existsSync(path.join('public',file)));
 }
 const wardrobe=path.join('public',runtime.images['wardrobe-v1']),meta=await sharp(wardrobe).metadata();
 assert.ok(meta.width<=192&&meta.height<=360);assert.equal(meta.hasAlpha,true);assert.ok(fs.statSync(wardrobe).size<16000);
});
