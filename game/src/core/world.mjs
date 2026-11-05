import roomLayout from "../../public/assets/room-layout-v3.json" with { type: "json" };
import { randomUUID } from "node:crypto";
import { freezeScene } from "./scene.mjs";
import { departureNote } from "./note.mjs";
import { displayCaption } from "./caption.mjs";
export const MENU = [
  ["tomato", "番茄炒蛋", 30],
  ["wings", "可乐鸡翅", 30],
  ["pork", "小酥肉", 30],
  ["soup", "紫菜蛋花汤", 10],
  ["milk_tea", "奶茶", 5],
  ["lemon", "柠檬水", 0],
];
export const PACK = ["camera", "umbrella", "map", "blanket"];
export const PLACES = [
  {
    id: "doorstep",
    label: "家附近",
    scene: "a quiet lane near home",
    min: 5,
    max: 15,
    local: true,
  },
  {
    id: "neighborhood",
    label: "附近小公园",
    scene: "a small leafy neighborhood park",
    min: 12,
    max: 25,
    local: true,
  },
  {
    id: "park",
    label: "市内公园",
    scene: "a leafy city park with a sheltered pavilion",
    min: 45,
    max: 90,
    local: true,
  },
  {
    id: "old_street",
    label: "老街",
    scene: "a traditional old street with shops and lanterns",
    min: 60,
    max: 100,
    local: true,
  },
  {
    id: "mountain",
    label: "山间小镇",
    scene: "a wooded mountain town with covered shops",
    min: 150,
    max: 270,
    local: false,
  },
];
const clamp = (n) => Math.max(0, Math.min(100, n));
export function initial(now = Date.now()) {
  return {
    schema: 1,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    settledAt: now,
    hunger: 80,
    energy: 70,
    mood: { value: 60, label: "平常" },
    location: "home",
    activity: { name: "idle", startedAt: now, until: now },
    furnishings: { curtainClosed: false, lightOn: true },
    stock: Object.fromEntries(MENU.map(([id]) => [id, 0])),
    capacity: 12,
    backpack: ["camera", "map"],
    souvenirs: [],
    travel: {
      current: null,
      pending: [],
      history: [],
      lastReturnedAt: 0,
      nextDecisionAt: now,
    },
    photos: [],
    feeding: [],
    weather: { available: false, stale: true },
    recentScenes: [],
  };
}
export function event(events, type, data, at) {
  events.push({ id: randomUUID(), type, at, data });
}
function consume(w, item, events, at, automatic = false) {
  const entry = MENU.find((x) => x[0] === item);
  if (!entry || !w.stock[item]) throw Error("没有可用的食物");
  w.stock[item]--;
  w.hunger = clamp(w.hunger + entry[2]);
  w.lastMealAt = at;
  event(events, "meal", { item, label: entry[1], automatic }, at);
}
function arrive(w, events, at) {
  const trip = w.travel.current;
  if (!trip) return;
  trip.phase = "returned";
  trip.returnedAt = at;
  if (!trip.photoScene) {
    trip.photoScene = freezeScene(
      trip,
      w.weather,
      w.recentScenes,
      Math.min(at, trip.returnAt),
    );
    w.recentScenes = [...w.recentScenes, trip.photoScene].slice(-5);
  }
  if (trip.souvenir) {
    const s = { ...trip.souvenir, tripId: trip.id, at };
    if (!w.souvenirs.some((x) => x.tripId === trip.id)) w.souvenirs.push(s);
  }
  w.travel.pending.push(trip);
  w.travel.current = null;
  w.travel.lastReturnedAt = at;
  w.travel.nextDecisionAt = at + 20 * 60000;
  w.location = "home";
  w.activity = { name: "rest", startedAt: at, until: at + 20 * 60000 };
  event(events, "returned", { tripId: trip.id, place: trip.place.label }, at);
}
export function settle(w, now, events) {
  const begin = Math.max(w.settledAt, now - 8 * 3600000);
  let cursor = begin;
  while (cursor < now) {
    let next = Math.min(now, cursor + 60000);
    const trip = w.travel.current;
    if (trip && trip.returnAt > cursor) next = Math.min(next, trip.returnAt);
    if (trip && trip.returnAt <= cursor) {
      arrive(w, events, trip.returnAt);
      continue;
    }
    const hours = (next - cursor) / 3600000,
      h = new Date(cursor + 28800000).getUTCHours();
    const manual = w.activity?.until > cursor;
    const sleep =
      !trip && (manual ? w.activity.name === "sleep" : h >= 23 || h < 7);
    const rest = !trip && (sleep || (w.activity?.name === "rest" && manual));
    w.hunger = clamp(w.hunger - 3 * hours);
    w.energy = clamp(
      w.energy + (rest ? (sleep ? 12 : 6) : trip ? -5 : -2) * hours,
    );
    if (
      trip &&
      trip.food &&
      trip.food.id !== "none" &&
      !trip.food?.consumedAt &&
      next >= trip.departedAt + (trip.returnAt - trip.departedAt) * 0.5
    ) {
      trip.food.consumedAt = next;
      w.hunger = clamp(w.hunger + 30);
      event(
        events,
        "travel_meal",
        { tripId: trip.id, item: trip.food.id },
        next,
      );
    }
    if (
      !trip &&
      !sleep &&
      !(w.activity.manual && w.activity.until > cursor) &&
      w.hunger < 35
    ) {
      const food = MENU.find(([id, , gain]) => gain >= 10 && w.stock[id] > 0);
      if (food) {
        consume(w, food[0], events, next, true);
        w.activity = {
          name: "eat",
          startedAt: next,
          until: next + 18000,
          automatic: true,
        };
      }
    }
    if (trip && next >= trip.returnAt) arrive(w, events, trip.returnAt);
    cursor = next;
  }
  w.settledAt = Math.max(now, w.settledAt);
  // A trip that ended during a long offline gap is still returned immediately.
  if (w.travel.current?.returnAt <= now)
    arrive(w, events, w.travel.current.returnAt);
  if (w.travel.current) {
    w.location = w.travel.current.place.label;
  } else if (w.activity.until <= now) {
    const h = new Date(now + 28800000).getUTCHours();
    const sleep = h >= 23 || h < 7 || w.energy < 20;
    const stretch =
      !sleep && w.energy >= 45 && Math.floor(now / 300000) % 4 === 1;
    const wet =
      w.weather.available &&
      ["rain", "snow", "thunder"].includes(w.weather.kind);
    w.activity = {
      name: sleep
        ? "sleep"
        : w.energy < 45 || (stretch && wet)
          ? "rest"
          : stretch
            ? "walk"
            : "idle",
      startedAt: now,
      until: now + (sleep ? 30 : stretch && !wet ? 0.5 : 5) * 60000,
    };
  }
}
export function apply(w, command, actor, now, events) {
  const { type, args = {} } = command;
  if (type === "restock") {
    if (!MENU.some((x) => x[0] === args.item)) throw Error("没有这种食物");
    if (Object.values(w.stock).reduce((a, b) => a + b, 0) >= 12)
      throw Error("冰箱已经放满啦");
    w.stock[args.item]++;
    w.feeding.push({
      id: command.requestId,
      at: now,
      item: args.item,
      actor: {
        type: actor.verifiedQQ ? "verified" : "guest",
        ...(actor.verifiedQQ
          ? { qq: actor.verifiedQQ }
          : { visitor: actor.id }),
      },
    });
    event(
      events,
      "restocked",
      { item: args.item, actor: actor.verifiedQQ ? "verified" : "guest" },
      now,
    );
  } else if (type === "backpack_set") {
    if (
      !Array.isArray(args.items) ||
      args.items.length > 3 ||
      new Set(args.items).size !== args.items.length ||
      args.items.some((x) => !PACK.includes(x))
    )
      throw Error("背包最多三件不同的物品");
    if (w.travel.current) throw Error("出门后不能修改随身背包");
    w.backpack = [...args.items];
    event(events, "backpack_changed", {}, now);
  } else if (type === "furniture") {
    if (
      !["curtainClosed", "lightOn"].includes(args.key) ||
      typeof args.value !== "boolean"
    )
      throw Error("家具设置无效");
    w.furnishings[args.key] = args.value;
    event(events, "furniture_changed", args, now);
  } else if (type === "activity") {
    if (w.travel.current) throw Error("她还在外面");
    if (
      !["walk", "sleep", "wake", "rest", "eat", "tea", "idle"].includes(
        args.name,
      )
    )
      throw Error("动作无效");
    if (["eat", "tea"].includes(args.name)) {
      const food = MENU.find(
        ([id, , gain]) =>
          w.stock[id] > 0 && (args.name === "eat" ? gain >= 10 : gain < 10),
      );
      if (!food) throw Error("冰箱里没有合适的食物");
      consume(w, food[0], events, now);
    }
    w.activity = {
      name: args.name === "wake" ? "idle" : args.name,
      startedAt: now,
      until:
        args.name === "sleep" &&
        (new Date(now + 28800000).getUTCHours() >= 19 ||
          new Date(now + 28800000).getUTCHours() < 7)
          ? Date.parse(
              new Date(now + 28800000).toISOString().slice(0, 10) +
                "T07:00:00+08:00",
            ) + (new Date(now + 28800000).getUTCHours() >= 19 ? 86400000 : 0)
          : now + (args.name === "sleep" ? 30 * 60000 : 30000),
      manual: true,
    };
    event(events, "activity_started", { name: args.name }, now);
  } else if (type === "travel_decision") {
    if (!actor.system) throw Error("仅内部意愿适配器可决定出游");
    w.travel.nextDecisionAt = now + 30 * 60000;
    const d = args.intent;
    if (!d || d.action === "stay") return;
    if (
      w.travel.current ||
      now - w.travel.lastReturnedAt < 20 * 60000 ||
      (w.activity.manual && w.activity.until > now)
    )
      return;
    const place = PLACES.find((x) => x.id === d.destination);
    if (
      !place ||
      typeof d.reason !== "string" ||
      d.reason.trim().length < 4 ||
      d.reason.length > 100 ||
      typeof d.wish !== "string" ||
      d.wish.length < 2 ||
      d.wish.length > 80
    )
      return;
    if (
      w.energy < 25 ||
      w.hunger < 30 ||
      /被.{0,8}(丢|安排|扔)|系统.{0,8}(分配|安排)/.test(d.reason + d.wish)
    )
      return;
    if (w.weather.available && w.weather.kind === "thunder" && place.min >= 45)
      return;
    const packed =
      place.min >= 45
        ? MENU.find(([id, , gain]) => gain === 30 && w.stock[id] > 0)
        : null;
    if (place.min >= 45 && !packed) return;
    if (packed) w.stock[packed[0]]--;
    const id = randomUUID(),
      backpack = [...w.backpack];
    if (
      w.weather.available &&
      ["rain", "snow"].includes(w.weather.kind) &&
      !backpack.includes("umbrella") &&
      backpack.length < 3
    )
      backpack.push("umbrella");
    const duration =
      (place.min + Math.floor(Math.random() * (place.max - place.min + 1))) *
      60000;
    const trip = {
      id,
      phase: "away",
      place,
      intent: {
        reason: d.reason,
        wish: d.wish,
        action: "go",
        destination: place.id,
        prepared: backpack,
      },
      backpack,
      food: packed
        ? { id: packed[0], label: packed[1] }
        : { id: "none", label: "没有带饭" },
      departedAt: now,
      returnAt: now + duration,
      note: "",
      photo: { status: "pending", attempts: 0 },
      share: {},
      souvenir:
        Math.random() < 0.65
          ? { id: "postcard", label: place.label + "的小明信片" }
          : null,
    };
    if (trip.souvenir) {
      const choices =
        place.id === "mountain"
          ? [
              ["ticket", "山间的小票根"],
              ["charm", "山间的小挂饰"],
            ]
          : place.id === "old_street"
            ? [
                ["bookmark", "老街的书签"],
                ["ribbon", "老街的丝带"],
                ["postcard", "老街明信片"],
              ]
            : [
                ["sticker", place.label + "的小贴纸"],
                ["postcard", place.label + "的明信片"],
              ];
      const [sid, label] = choices[Math.floor(Math.random() * choices.length)];
      trip.souvenir = { id: sid, label };
    }
    trip.note = departureNote(trip, w.travel.recentNotes || []);
    w.travel.recentNotes = [...(w.travel.recentNotes || []), trip.note].slice(
      -20,
    );
    w.travel.current = trip;
    w.location = place.label;
    event(events, "departed", { tripId: id, intent: trip.intent }, now);
  } else if (type === "photo_capture") {
    if (!actor.system) throw Error("内部操作");
    const t = w.travel.current;
    if (t && !t.photoScene) {
      t.photoScene = freezeScene(t, w.weather, w.recentScenes, now);
      w.recentScenes = [...w.recentScenes, t.photoScene].slice(-5);
      event(
        events,
        "photo_captured",
        { tripId: t.id, scene: t.photoScene },
        now,
      );
    }
  } else if (type === "weather") {
    if (!actor.system) throw Error("内部操作");
    w.weather = args.weather;
  } else if (type === "mood") {
    if (!actor.system) throw Error("内部操作");
    const m = args.mood;
    if (
      !m ||
      !["平常", "轻松", "有些困", "有点低落", "有点烦"].includes(m.label) ||
      !Number.isFinite(m.value) ||
      m.value < 0 ||
      m.value > 100 ||
      !["neutral", "smile", "sleepy", "sad", "angry"].includes(m.expression) ||
      !/^[a-f0-9]{64}$/.test(m.sourceHash)
    )
      throw Error("心情格式无效");
    w.mood = {
      label: m.label,
      value: m.value,
      expression: m.expression,
      sourceHash: m.sourceHash,
    };
    event(events, "mood_changed", { label: m.label, value: m.value }, now);
  } else if (type === "photo_ready") {
    if (!actor.system) throw Error("内部操作");
    const t = w.travel.pending.find((x) => x.id === args.tripId);
    if (!t) return;
    t.photo = { status: "ready", id: t.id };
    if (!w.photos.some((x) => x.photoId === t.id))
      w.photos.push({
        photoId: t.id,
        assetVersion: args.assetVersion || "original",
        place: t.place.label,
        capturedAt: t.photoScene.capturedAt,
        caption: args.caption,
        scene: t.photoScene,
      });
    event(events, "photo_ready", { tripId: t.id }, now);
  } else if (type === "photo_processed") {
    if (!actor.system) throw Error("内部操作");
    if (!/^[a-f0-9]{16}$/.test(args.assetVersion || ""))
      throw Error("图片版本无效");
    const photo = w.photos.find((x) => x.photoId === args.photoId);
    if (photo && photo.assetVersion !== args.assetVersion) {
      photo.assetVersion = args.assetVersion;
      event(events, "photo_processed", { photoId: args.photoId }, now);
    }
  } else if (type === "trip_archive") {
    if (!actor.system) throw Error("内部操作");
    const i = w.travel.pending.findIndex((x) => x.id === args.tripId);
    if (i >= 0) {
      const [t] = w.travel.pending.splice(i, 1);
      if (!w.travel.history.some((x) => x.id === t.id))
        w.travel.history.push(t);
    }
  } else throw Error("未知操作");
}
export function publicWorld(w, now) {
  const today = new Date(now + 28800000).toISOString().slice(0, 10);
  const feeds = w.feeding.filter(
    (x) => new Date(x.at + 28800000).toISOString().slice(0, 10) === today,
  );
  const trip = w.travel.current;
  return {
    revision: w.revision,
    serverTime: now,
    room: {
      phase: trip ? "away" : "home",
      daysTogether: Math.max(
        1,
        Math.floor((now - (w.createdAt || now)) / 86400000) + 1,
      ),
      items: [],
      virtual: true,
    },
    hunger: Math.round(w.hunger),
    energy: Math.round(w.energy),
    mood: {
      label: w.mood.label,
      energy: Math.round(w.energy),
      expression: w.mood.expression || "neutral",
      value: clamp(
        w.mood.value +
          (w.weather.available
            ? w.weather.kind === "clear"
              ? 2
              : ["rain", "snow", "thunder"].includes(w.weather.kind)
                ? -1
                : 0
            : 0),
      ),
    },
    room: roomLayout,
    location: w.location,
    activity: { fromX: 0.25, toX: 0.75, ...w.activity },
    furnishings: w.furnishings,
    weather: w.weather,
    backpack: w.backpack,
    souvenirs: w.souvenirs,
    photos: w.photos.map(
      ({ photoId, place, capturedAt, caption, assetVersion }) => ({
        photoId,
        assetVersion: assetVersion || "original",
        place,
        capturedAt,
        caption: displayCaption(caption, place),
      }),
    ),
    travel: {
      photos: w.photos.map(
        ({ photoId, place, capturedAt, caption, assetVersion }) => ({
          photoId,
          assetVersion: assetVersion || "original",
          place,
          capturedAt,
          caption: displayCaption(caption, place),
        }),
      ),
      phase: trip ? "away" : "home",
      destination: trip?.place.label,
      note: trip?.note,
      returnAt: trip?.returnAt,
    },
    kitchen: {
      capacity: 12,
      total: Object.values(w.stock).reduce((a, b) => a + b, 0),
      items: MENU.map(([id, label, gain]) => ({
        id,
        label,
        gain,
        kind: gain === 30 ? "food" : "drink",
        count: w.stock[id],
      })),
    },
    feeding: {
      portions: feeds.length,
      visitors: new Set(feeds.map((x) => x.actor.qq || x.actor.visitor)).size,
    },
  };
}
