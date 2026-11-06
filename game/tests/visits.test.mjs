import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/core/store.mjs';
import {Visits} from '../src/core/visits.mjs';
import {makeServer} from '../src/server.mjs';

test('counts independent visits, deduplicates refreshes, distinguishes unverified and verified QQ, and rolls over in Beijing',()=>{
  let now=Date.parse('2026-11-05T15:50:00Z'); const store=new Store(':memory:',()=>now), visits=new Visits(store);
  try {
    visits.record('guest-a',{},now); visits.record('guest-a',{},now+1000);
    visits.record('guest-b',{},now); visits.record('qq-a',{claimedQQ:'123456789',verified:false},now);
    visits.record('qq-b',{claimedQQ:'987654321',qq:'987654321',verified:true},now);
    let value=visits.recent(now); assert.equal(value.total,4);assert.equal(value.guests,2);
    assert.equal(value.records.find(x=>x.qq==='123456789').verified,false);
    assert.equal(value.records.find(x=>x.qq==='987654321').verified,true);
    assert.ok(value.records.filter(x=>!x.qq).every(x=>!Object.hasOwn(x,'actor')));
    now+=11*60000; visits.record('guest-a',{},now);
    value=visits.recent(now);assert.equal(value.day,'2026-11-06');assert.equal(value.total,1);
    now+=31*60000;visits.record('guest-a',{},now);assert.equal(visits.recent(now).total,2);
  } finally {store.close();}
});

test('visit list requires verified owner; public state never includes visit identities',async()=>{
  const store=new Store(':memory:');
  const fetcher=async (_url,opts)=>new Response(JSON.stringify({ok:true,identity:opts.headers.cookie==='owner=1'?{verified:true,qq:'987654321',claimedQQ:'987654321',canReadDiary:true}:{verified:false,claimedQQ:'123456789'}}),{headers:{'content-type':'application/json'}});
  const {server}=makeServer({bridge:{enabled:true},adapterSecret:'a'.repeat(64),relaySecret:'b'.repeat(64)}, {store,fetcher});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const post=(route,cookie)=>fetch(base+'/api/room-'+route,{method:'POST',headers:{'content-type':'application/json',cookie},body:'{}'});
  try {
    const state=await (await post('state','guest=1')).json();assert.equal(state.identity.claimedQQ,'123456789');delete state.identity;assert.ok(!JSON.stringify(state).includes('123456789'));
    assert.equal((await post('visits','guest=1')).status,403);
    const owner=await (await post('visits','owner=1')).json();assert.equal(owner.records[0].qq,'123456789');assert.equal(owner.records[0].verified,false);
  } finally {await new Promise(r=>server.close(r));store.close();}
});
