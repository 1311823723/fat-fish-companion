import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const h=await bridgeHarness();let server;
try{
 h.setMode('reserved2');server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/room-web';const id=crypto.randomBytes(32).toString('hex');
 const call=async(action,extra={})=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token'},body:JSON.stringify({action,visitorId:id,...extra})});assert.equal(r.status,200);return r.json();};
 await call('enter',{qq:'99999999'});const challenge=await call('challenge');
 const event={user_id:99999999,self_id:12345678,message:[{type:'text',data:{text:challenge.command}}],message_id:'fixture-verification-message'};
 await h.handleIncoming('private',event.user_id,event,h.cfg);
 const result=await call('identity');assert.equal(result.identity.verified,true);assert.equal(result.identity.qq,'99999999');
 console.log('PASS: real bridge HTTP challenge + actual private-message handler verifies a non-whitelisted QQ before conversation admission; fixture only.');
}finally{if(server)await new Promise(r=>server.close(r));await h.close();}
