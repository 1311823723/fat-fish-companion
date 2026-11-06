import { removeTestDirectory } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../src/core/store.mjs";
import { makeServer } from "../src/server.mjs";
import { installGameCore } from "../adapters/game-core-adapter.mjs";
test("bridge adapter shares authoritative state, suppresses legacy writers, routes verified identity", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fatfish-adapter-"));
  fs.mkdirSync(path.join(dir, "state"));
  fs.writeFileSync(
    path.join(dir, "room.config.json"),
    JSON.stringify({ publicRoomUrl: "https://cottage.example/room" }),
  );
  const store = new Store(),
    secret = "test-only-".repeat(8),
    { server } = makeServer(
      { allowedOrigins: [], adapterSecret: secret },
      { store },
    );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  fs.writeFileSync(
    path.join(dir, "state/game-core-link.json"),
    JSON.stringify({
      enabled: true,
      url: "http://127.0.0.1:" + server.address().port,
      secret,
    }),
  );
  let legacy = 0;
  const room = {
    data: { visitors: {} },
    roomState: () => ({ room: { daysTogether: 1 } }),
    visitor: () => ({ verifiedQQ: "987654321" }),
  };
  for (const name of [
    "publicState",
    "kitchen",
    "activity",
    "mood",
    "feedingSummary",
    "feedingRecords",
    "travelContext",
    "travelTick",
    "syncTravel",
    "handle",
  ])
    room[name] = () => {
      legacy++;
    };
  const adapter = installGameCore(room, { root: dir });
  try {
    await new Promise((r) => setTimeout(r, 30));
    await adapter.refresh();
    assert.ok(room.travelContext().includes("https://cottage.example/room"));
    assert.ok(room.travelContext().includes("四子棋"));
    assert.ok(room.travelContext().includes("公开旅行相册"));
    fs.writeFileSync(
      path.join(dir, "room.config.json"),
      JSON.stringify({
        publicRoomUrl: "https://cottage.example/room?token=private-value",
      }),
    );
    assert.ok(!room.travelContext().includes("?token="));
    assert.equal(room.publicState().hunger, 80);
    assert.equal(room.travelTick().type, "none");
    await room.handle(
      "pet_action",
      { name: "restock", item: "tomato", requestId: "bridge-restock-001" },
      "guest-id",
    );
    assert.equal(store.raw().stock.tomato, 1);
    assert.equal(store.raw().feeding[0].actor.qq, "987654321");
    assert.equal(room.kitchen().total, 1);
    assert.ok(!JSON.stringify(room.publicState()).includes("987654321"));
    assert.equal(legacy, 0);
  } finally {
    adapter.stop();
    await new Promise((r) => server.close(r));
    store.close();
    removeTestDirectory(dir);
  }
});
test('return care only considers verified feeding while away, rechecks allowlist and can send once',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fatfish-care-'));fs.mkdirSync(path.join(dir,'state'));
  const store=new Store(), secret='test-only-'.repeat(8), {server}=makeServer({allowedOrigins:[],adapterSecret:secret},{store});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  fs.writeFileSync(path.join(dir,'state/game-core-link.json'),JSON.stringify({enabled:true,url:'http://127.0.0.1:'+server.address().port,secret}));
  const room={data:{visitors:{}},roomState:()=>({room:{daysTogether:1}})};const adapter=installGameCore(room,{root:dir});
  const now=Date.now(),trip={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',place:{label:'公园'},departedAt:now-60000,returnedAt:now-1000};
  const world=store.raw();world.travel.pending.push(trip);world.feeding.push({at:now-30000,item:'tomato',actor:{type:'verified',qq:'123456789'}},{at:now-30000,item:'wings',actor:{type:'guest',visitor:'x'}});
  store.db.prepare('UPDATE world SET json=? WHERE id=1').run(JSON.stringify(world));store.enqueue('return-care:'+trip.id,'return-care-plan',{tripId:trip.id},now);
  const sent=[], opts={generate:async()=> '番茄炒蛋我看到啦，谢谢你。',chooseTargets:async()=>[],isAllowed:key=>key==='private:123456789',isBusy:()=>false,sendProgress:async()=>{},sendPhoto:async()=>{},sendNotice:async(key,text)=>sent.push({key,text}),record:()=>{}};
  try {await adapter.refresh();await adapter.tick(opts);await adapter.tick(opts);await adapter.tick(opts);assert.equal(sent.length,1);assert.equal(sent[0].key,'private:123456789');}
  finally{adapter.stop();await new Promise(r=>server.close(r));store.close();removeTestDirectory(dir);}
});
