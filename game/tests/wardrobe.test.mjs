import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/core/store.mjs';
test('daily random setting persists and manual selection lasts through the current day',()=>{
 let now=Date.parse('2026-11-09T12:00:00+08:00');const store=new Store(':memory:',()=>now),actor={id:'visitor'};
 const command=(type,args,n)=>store.transact({type,args,requestId:'wardrobe-toggle-'+n},actor);
 try{
  command('wardrobe_auto',{enabled:false},1);now+=86400000;
  assert.equal(store.snapshot().wardrobe.auto,false);assert.equal(store.raw().wardrobe.outfit,'original');
  command('outfit_set',{id:'whale_pajamas'},2);command('wardrobe_auto',{enabled:true},3);
  now+=3600000;assert.equal(store.snapshot().wardrobe.outfit,'whale_pajamas');
  now+=86400000;const s=store.snapshot();assert.notEqual(s.wardrobe.outfit,'whale_pajamas');
  const chosen=s.wardrobe.outfit;now+=1000;assert.equal(store.snapshot().wardrobe.outfit,chosen);
 }finally{store.close();}
});
test('wardrobe saves confirmed selections and refuses invalid or away changes',()=>{
 const now=Date.parse('2026-11-09T12:00:00+08:00');
 const store=new Store(':memory:',()=>now), actor={id:'visitor'};
 try {
  const cmd={type:'outfit_set',args:{id:'whale_knit'},requestId:'wardrobe-request-0001'};
  assert.equal(store.transact(cmd,actor).wardrobe.outfit,'whale_knit');
  assert.equal(store.snapshot().wardrobe.outfit,'whale_knit');
  assert.equal(store.transact(cmd,actor).wardrobe.outfit,'whale_knit');
  assert.throws(()=>store.transact({...cmd,args:{id:'bad'},requestId:'wardrobe-request-0002'},actor),/没有这套/);
  const w=store.raw();w.travel.current={returnAt:now+60000,place:{label:'附近'}};
  store.db.prepare('UPDATE world SET json=? WHERE id=1').run(JSON.stringify(w));
  assert.throws(()=>store.transact({...cmd,args:{id:'original'},requestId:'wardrobe-request-0003'},actor),/出门/);
 }finally{store.close();}
});
test('morning selection occurs once, and waits while away',()=>{
 let now=Date.parse('2026-11-09T06:00:00+08:00');
 const store=new Store(':memory:',()=>now);
 try {
  let w=store.raw();w.travel.current={returnAt:now+4*3600000,place:{label:'附近'}};
  store.db.prepare('UPDATE world SET json=? WHERE id=1').run(JSON.stringify(w));
  now+=2*3600000;store.snapshot();assert.equal(store.raw().wardrobe.outfit,'original');
  w=store.raw();w.travel.current=null;w.activity={name:'idle',until:now+60000};
  store.db.prepare('UPDATE world SET json=? WHERE id=1').run(JSON.stringify(w));
  now+=1000;store.snapshot();assert.notEqual(store.raw().wardrobe.outfit,'original');
  const date=store.raw().wardrobe.morning;now+=1000;store.snapshot();assert.equal(store.raw().wardrobe.morning,date);
 }finally{store.close();}
});
