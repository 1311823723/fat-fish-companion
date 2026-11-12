import test from 'node:test';import assert from 'node:assert/strict';
import {spriteScale} from '../src/client/sprite-scale.mjs';
import catalog from '../public/assets/outfits-v1.json' with {type:'json'};
test('all poses use the same outfit reference scale irrespective of crop height',()=>{
 for(const outfit of catalog.outfits.filter(x=>x.actions)){
  const manifest=Object.fromEntries(Object.entries(outfit.actions).map(([k,v])=>[outfit.id+'--'+k,v]));
  const idle=spriteScale(manifest,outfit.id+'--idle',.82);
  for(const name of Object.keys(outfit.actions))assert.equal(spriteScale(manifest,outfit.id+'--'+name,.82),idle,outfit.id+' '+name);
 }
});
test('higher resolution frames preserve size and classic square sprites preserve scale',()=>{
 const m={'x--idle':{grid:{width:200,height:500}},'x--sleep':{grid:{width:400,height:600}}};
 assert.equal(spriteScale(m,'x--sleep',.82)*2,spriteScale(m,'x--idle',.82));
 assert.equal(spriteScale({idle:{},spin:{}},'spin',.82),.82);
});
