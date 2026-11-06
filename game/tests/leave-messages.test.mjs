import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/core/store.mjs';
import { LeaveMessages } from '../src/core/leave-messages.mjs';
import { makeServer } from '../src/server.mjs';

test('away messages persist, are private and deliver once after return', async () => {
  const store = new Store(':memory:');
  let away = true, calls = 0;
  store.snapshot = () => ({travel:{phase:away ? 'away' : 'home'}});
  const send = async (cookie, body) => { calls++; assert.equal(cookie, 'room=secret'); assert.equal(body.text, '回来一起玩'); return {ok:true}; };
  let queue = new LeaveMessages(store, 'x'.repeat(64), send);
  queue.add('guest:a', 'room=secret', {requestId:'request-12345',text:'回来一起玩'});
  queue.add('guest:a', 'room=secret', {requestId:'request-12345',text:'回来一起玩'});
  assert.equal(queue.waiting('guest:a').length, 1);
  assert.equal(queue.waiting('guest:b').length, 0);
  assert.ok(!JSON.stringify(store.db.prepare('SELECT * FROM room_leave_messages').all()).includes('room=secret'));
  await queue.process(); assert.equal(calls, 0);
  queue = new LeaveMessages(store, 'x'.repeat(64), send);
  away = false; await queue.process(); await queue.process();
  assert.equal(calls, 1); assert.equal(queue.waiting('guest:a').length, 0);
  store.db.close();
});

test('ambiguous delivery does not resend after restart', async () => {
  const store = new Store(':memory:'); store.snapshot = () => ({travel:{phase:'home'}});
  let calls = 0;
  const send = async () => { calls++; throw Error('network'); };
  let queue = new LeaveMessages(store, 'x'.repeat(64), send);
  queue.add('guest:a', 'secret', {requestId:'request-12345',text:'你好'});
  await queue.process(); queue = new LeaveMessages(store, 'x'.repeat(64), send); await queue.process();
  assert.equal(calls, 1); assert.equal(queue.waiting('guest:a')[0].pending, 'uncertain');
  store.db.close();
});
test('only confirmed failures can be retried and only verified opt-in creates one reminder', async () => {
  const store=new Store(':memory:');store.snapshot=()=>({travel:{phase:'home'}});
  let calls=0;
  const queue=new LeaveMessages(store,'x'.repeat(64),async(_cookie,body)=>{calls++;return calls===1?{ok:false}:{ok:true,message:{text:'欢迎回来'}};});
  try {
    queue.add('qq:123456789','room=secret',{requestId:'request-54321',text:'吃饭了吗',notifyMe:true},'123456789');
    await queue.process();assert.equal(queue.list('qq:123456789')[0].status,'failed');
    assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='leave-notify'").get().n,0);
    queue.retry('qq:123456789','request-54321'); queue.nextDeliveryAt=0; await queue.process();
    const item=queue.list('qq:123456789')[0];assert.equal(item.status,'done');assert.equal(item.answer,'欢迎回来');
    assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='leave-notify'").get().n,1);
    assert.throws(()=>queue.retry('qq:123456789','request-54321'));
    queue.add('guest:b','guest=secret',{requestId:'request-guest1',text:'你好',notifyMe:true},'');queue.nextDeliveryAt=0;await queue.process();
    assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='leave-notify'").get().n,1);
  }finally{store.close();}
});

test('web route queues while away and adds the message to only its own history', async () => {
  const store = new Store(':memory:');
  store.snapshot = () => ({ok:true, travel:{phase:'away'}});
  let chatCalls=0;
  const fetcher=async (url, opts) => {
    const route=String(url).split('room-').at(-1);
    if(route==='chat') chatCalls++;
    const body=route==='identity' ? {ok:true,identity:{verified:false}} : {ok:true,messages:[]};
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  };
  const {server}=makeServer({bridge:{enabled:true},adapterSecret:'a'.repeat(64),relaySecret:'b'.repeat(64)}, {store,fetcher});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(route,cookie,body={})=>fetch(base+'/api/room-'+route,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)}).then(r=>r.json());
  try {
    const sent=await post('chat','room=a',{requestId:'request-12345',text:'回来一起玩'});
    assert.equal(sent.queued,true); assert.equal(chatCalls,0);
    assert.equal((await post('history','room=a')).messages[0].pending,'pending');
    assert.equal((await post('history','room=b')).messages.length,0);
  } finally {await new Promise(r=>server.close(r));store.close();}
});
