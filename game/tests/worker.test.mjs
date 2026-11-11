import test from "node:test";
import assert from "node:assert/strict";
import worker from "../deploy/worker.mjs";
test("Worker never proxies management APIs, DSH or arbitrary paths", async () => {
  for (const route of [
    "/internal/snapshot",
    "/api/status",
    "/plugins/a",
    "/api/session/refresh",
  ]) {
    const r = await worker.fetch(
      new Request("https://game.example" + route),
      {},
    );
    assert.equal(r.status, 404);
  }
  const r = await worker.fetch(
    new Request("https://game.example/api/room-state", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
    {
      ROOM_ORIGIN: "https://backend.example",
      ROOM_RELAY_SECRET: "not-a-real-token",
    },
  );
  assert.equal(r.status, 403);
});
test('only content-versioned outfit images receive immutable caching',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('image',{headers:{'cache-control':'public,max-age=0','content-type':'image/webp'}})}};
 const r=await worker.fetch(new Request('https://game.example/assets/outfits/sample/preview-abcdef123456.webp'),env);
 assert.match(r.headers.get('cache-control'),/immutable/);
 const unchanged=await worker.fetch(new Request('https://game.example/assets/outfits/sample/reference.png'),env);
 assert.equal(unchanged.headers.get('cache-control'),'public,max-age=0');
});
test('hashed scripts and CSS cache while unversioned URLs still revalidate',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('asset',{headers:{'cache-control':'public,max-age=0'}})}};
 for(const file of ['index-Abcd1234.js','phaser-C831z-fk.js','index-DNnnWhiR.css'])assert.match((await worker.fetch(new Request('https://game.example/assets/'+file),env)).headers.get('cache-control'),/immutable/);
 for(const file of ['main.js','main.css','outfits-v1.json','room-v5.webp'])assert.equal((await worker.fetch(new Request('https://game.example/assets/'+file),env)).headers.get('cache-control'),'public,max-age=0');
});
