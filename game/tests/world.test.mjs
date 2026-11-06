import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.mjs";
import { initial, settle, apply, publicWorld } from "../src/core/world.mjs";
import { freezeScene, imagePrompt } from "../src/core/scene.mjs";
const noon = Date.parse("2026-11-04T12:00:00+08:00");
const system = { id: "system", system: true };
test("transaction request deduplication is actor scoped, persists and cannot overfill", () => {
  const s = new Store(":memory:", () => noon);
  const c = {
    type: "restock",
    args: { item: "tomato" },
    requestId: "request-000001",
  };
  s.transact(c, { id: "guest-a" });
  s.transact(c, { id: "guest-a" });
  assert.equal(s.raw().stock.tomato, 1);
  s.transact(c, { id: "guest-b" });
  assert.equal(s.raw().stock.tomato, 2);
  for (let i = 0; i < 10; i++)
    s.transact({ ...c, requestId: "new-request-" + i }, { id: "guest-a" });
  assert.throws(() =>
    s.transact({ ...c, requestId: "overfill-00001" }, { id: "guest-a" }),
  );
  assert.equal(s.raw().stock.tomato, 12);
  assert.equal(s.db.prepare("SELECT count(*) n FROM events").get().n, 12);
  s.close();
});
test("offline settlement is capped to 8h, food restores hunger, no relation changes", () => {
  const w = initial(noon);
  w.stock.tomato = 2;
  settle(w, noon + 3 * 86400000, []);
  assert.ok(Math.abs(w.hunger - 56) < 0.001);
  w.hunger = 34;
  settle(w, noon + 3 * 86400000 + 3600000, []);
  assert.equal(w.stock.tomato, 1);
  assert.ok(w.hunger > 60 && w.hunger < 62);
  assert.equal(w.feeding.length, 0);
});
test('old stock is not falsely attributed and new food retains its verified contributor',()=>{
  const w=initial(noon), events=[];w.stock.tomato=1;
  apply(w,{type:'restock',requestId:'food-request-1',args:{item:'tomato'}},{id:'v',verifiedQQ:'123456789'},noon,events);
  apply(w,{type:'activity',args:{name:'eat'}},{id:'v'},noon+1,events);
  assert.equal(w.mealHistory.at(-1).giver,undefined);
  apply(w,{type:'activity',args:{name:'eat'}},{id:'v'},noon+2,events);
  assert.equal(w.mealHistory.at(-1).giver.qq,'123456789');
  assert.equal(w.foodPreferences.tomato,2);
  assert.ok(!JSON.stringify(publicWorld(w,noon+3)).includes('123456789'));
});
test("invalid/missing intent stays home; travel needs food and has own intent", () => {
  const w = initial(noon),
    ev = [];
  apply(w, { type: "travel_decision", args: {} }, system, noon, ev);
  assert.equal(w.travel.current, null);
  apply(
    w,
    {
      type: "travel_decision",
      args: {
        intent: { destination: "park", reason: "想去看看树叶", wish: "坐一会" },
      },
    },
    system,
    noon,
    ev,
  );
  assert.equal(w.travel.current, null);
  w.stock.tomato = 1;
  apply(
    w,
    {
      type: "travel_decision",
      args: {
        intent: { destination: "park", reason: "想去看看树叶", wish: "坐一会" },
      },
    },
    system,
    noon,
    ev,
  );
  assert.equal(w.stock.tomato, 0);
  assert.equal(w.travel.current.intent.reason, "想去看看树叶");
  assert.throws(() =>
    apply(w, { type: "travel_decision", args: {} }, { id: "guest" }, noon, ev),
  );
});
test("return authoritative independent of pictures; reward once, keeps manual activity", () => {
  const w = initial(noon);
  w.backpack = ["camera", "umbrella"];
  apply(
    w,
    {
      type: "travel_decision",
      args: {
        intent: {
          destination: "doorstep",
          reason: "想去透透气呀",
          wish: "散散步",
        },
      },
    },
    system,
    noon,
    [],
  );
  const t = w.travel.current;
  t.souvenir = { id: "ticket", label: "小票" };
  settle(w, t.returnAt + 1000, []);
  assert.equal(w.location, "home");
  assert.equal(w.travel.current, null);
  assert.equal(w.souvenirs.length, 1);
  settle(w, t.returnAt + 5000, []);
  assert.equal(w.souvenirs.length, 1);
  apply(
    w,
    { type: "activity", args: { name: "sleep" } },
    { id: "g" },
    t.returnAt + 6000,
    [],
  );
  apply(
    w,
    {
      type: "travel_decision",
      args: {
        intent: {
          destination: "doorstep",
          reason: "想再走走看看",
          wish: "散步",
        },
      },
    },
    system,
    t.returnAt + 6000,
    [],
  );
  assert.equal(w.activity.name, "sleep");
  assert.equal(w.travel.current, null);
});
test("backpack validation and public state never reveal feeder QQ or visitor id", () => {
  const w = initial(noon);
  assert.throws(() =>
    apply(
      w,
      {
        type: "backpack_set",
        args: { items: ["camera", "map", "umbrella", "blanket"] },
      },
      { id: "g" },
      noon,
      [],
    ),
  );
  apply(
    w,
    { type: "restock", requestId: "xxxx", args: { item: "soup" } },
    { id: "guest-secret", verifiedQQ: "987654321" },
    noon,
    [],
  );
  assert.ok(!JSON.stringify(publicWorld(w, noon)).includes("987654321"));
  assert.ok(!JSON.stringify(publicWorld(w, noon)).includes("guest-secret"));
});
test("photo event frozen at capture time, not generation; umbrella/shelter and food relation", () => {
  const t = {
    id: "fixed-id",
    place: { scene: "city park", local: true },
    intent: { reason: "想散步" },
    backpack: [],
    food: { id: "tomato" },
  };
  const night = Date.parse("2026-11-04T22:00:00+08:00");
  const scene = freezeScene(t, { available: true, kind: "rain" }, [], night);
  assert.equal(scene.phase, "night");
  assert.equal(scene.activity, "shelter");
  assert.match(imagePrompt(scene), /NO daylight/);
  assert.match(imagePrompt(scene), /NO lunchbox in hands/);
  assert.match(imagePrompt(scene), /DRY under/);
  t.backpack = ["umbrella"];
  assert.equal(
    freezeScene(t, { available: true, kind: "rain" }, [], night, "umbrella")
      .activity,
    "umbrella",
  );
  assert.equal(
    freezeScene(
      { ...t, place: { local: false } },
      { available: true, kind: "rain" },
      [],
      noon,
    ).weather,
    null,
  );
});
test("outbox reserves once including ambiguous transmission and restart claims", () => {
  const s = new Store(":memory:", () => noon);
  s.enqueue("s:trip:recipient", "share", {});
  s.enqueue("s:trip:recipient", "share", {});
  assert.ok(s.claim("share"));
  assert.equal(s.claim("share"), null);
  s.finish("s:trip:recipient", "uncertain");
  assert.equal(s.claim("share"), null);
  s.close();
});
