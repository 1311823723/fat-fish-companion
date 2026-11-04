import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export function installGameCore(room, { root }) {
  let settings;
  try {
    settings = JSON.parse(
      fs.readFileSync(path.join(root, "state/game-core-link.json"), "utf8"),
    );
  } catch {
    return null;
  }
  if (!settings.enabled) return null;
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(settings.url) ||
    String(settings.secret).length < 32
  )
    throw Error("游戏核心连接配置无效");
  let cache = null,
    inflight = null,
    ticking = false;
  const original = {};
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
    original[name] =
      typeof room[name] === "function"
        ? room[name].bind(room)
        : () => undefined;
  room.personalRecent ??= (qq) =>
    (room.data.histories["qq:" + String(qq)] || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({
        role: m.role,
        text: String(m.text || "").slice(0, 300),
        at: m.at,
      }));
  async function call(route, body = {}) {
    const r = await fetch(settings.url + "/internal/" + route, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-game-adapter": settings.secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const v = await r.json();
    if (!r.ok || !v.ok) throw Error("游戏核心暂不可用");
    return v;
  }
  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      cache = await call("snapshot");
      const rawMood = String(room.roomState?.().self?.mood || "").trim();
      if (rawMood) {
        const sourceHash = crypto
          .createHash("sha256")
          .update(rawMood)
          .digest("hex");
        if (cache.world.mood.sourceHash !== sourceHash) {
          try {
            const m = original.mood();
            const weather = room.weather?.state?.() || cache.public.weather,
              offset =
                room.weather && weather.available
                  ? weather.kind === "clear"
                    ? 2
                    : ["rain", "snow", "thunder"].includes(weather.kind)
                      ? -1
                      : 0
                  : 0;
            await call("command", {
              type: "mood",
              requestId: "mood:" + crypto.randomUUID(),
              args: {
                mood: {
                  label: m.label,
                  value: Math.max(0, Math.min(100, m.value - offset)),
                  expression: m.expression || "neutral",
                  sourceHash,
                },
              },
            });
            cache = await call("snapshot");
          } catch {}
        }
      }
      room.data.kitchen = {
        ...(room.data.kitchen || {}),
        stock: cache.world.stock,
        lastMealAt: cache.world.lastMealAt,
      };
      room.data.travel = cache.world.travel;
    })();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  }
  function current() {
    if (!cache || Date.now() - cache.public.serverTime > 15000)
      throw Error("小屋核心正在重连，暂不推测当前位置");
    return cache;
  }
  room.kitchen = () => {
    let p;
    try {
      p = current().public.kitchen;
    } catch {
      return {
        available: false,
        items: [],
        total: 0,
        capacity: 12,
        foodTotal: 0,
        foodEmptySince: 0,
        lastEvent: "小屋正在重连，暂时不知道库存",
      };
    }
    const foodTotal = p.items
      .filter((x) => x.gain === 30)
      .reduce((n, x) => n + x.count, 0);
    return {
      ...p,
      foodTotal,
      lastEvent: "库存与小屋同步",
      foodEmptySince: foodTotal
        ? 0
        : room.data.kitchen.foodEmptySince ||
          (room.data.kitchen.foodEmptySince = Date.now()),
    };
  };
  room.activity = () => {
    try {
      return current().public.activity;
    } catch {
      return { name: "unknown" };
    }
  };
  room.mood = () => {
    let p;
    try {
      p = current().public;
    } catch {
      return original.mood();
    }
    return {
      ...p.mood,
      energy: p.energy,
      expression: p.mood.expression || "neutral",
    };
  };
  room.feedingSummary = () => {
    try {
      return current().public.feeding;
    } catch {
      return { available: false, portions: 0, visitors: 0 };
    }
  };
  room.feedingRecords = (qq, { owner = false } = {}) =>
    (cache?.world.feeding || [])
      .filter(
        (x) => owner || (x.actor.type === "verified" && x.actor.qq === qq),
      )
      .slice(-20)
      .map((x) => ({
        type: x.actor.type,
        qq: x.actor.qq,
        item: x.item,
        at: x.at,
      }));
  room.travelContext = () => {
    try {
      const { world: w, public: p } = current();
      return (
        "【同一个大肥鱼·最高时效世界状态】" +
        JSON.stringify({
          version: p.revision,
          time: new Date(p.serverTime).toISOString(),
          location: p.location,
          atHome: !w.travel.current,
          activity: p.activity.name,
          hunger: p.hunger,
          energy: p.energy,
          mood: p.mood,
          weather: p.weather,
          intent: w.travel.current?.intent,
          photoEvent: w.travel.current?.photoScene,
          photoStatus: w.travel.current?.photo?.status,
          latestReturn: w.travel.lastReturnedAt,
          recentTrips: [...w.travel.history, ...w.travel.pending]
            .slice(-3)
            .map((t) => ({
              place: t.place?.label || t.place,
              intent: t.intent,
              returnedAt: t.returnedAt,
              photoEvent: t.photoScene,
              photoStatus: t.photo?.status || (t.photoId ? "ready" : "unknown"),
            })),
          souvenirs: p.souvenirs.slice(-3),
        }) +
        "。状态优先于旧聊天；已回家不要说还在路上。出门由自己的意愿决定，没有真实邀请就不要说被人丢去或安排过去。精力低也应正常回应私聊和艾特。拍照事件不代表照片已发送，发没发只按已确认的发送记录判断。"
      );
    } catch {
      return "【小屋状态暂不可用】不能推测正在出游或回家，正常回应聊天。";
    }
  };
  room.syncTravel = () => null;
  room.travelTick = () => ({ type: "none" });
  room.publicState = (now = Date.now()) => {
    const p = current().public,
      base = room.roomState().room;
    return {
      ...p,
      room: { ...base, virtual: true },
      mood: room.mood(),
      feeding: room.feedingSummary(),
      travel: { ...p.travel, photos: p.photos },
      visitorCount: Object.values(room.data.visitors).filter(
        (v) => now - v.lastSeen < 120000,
      ).length,
    };
  };
  room.handle = async (action, args, id, now) => {
    try {
      await refresh();
    } catch {
      if (["public_state", "pet_action"].includes(action))
        throw Error("小屋核心正在重连");
    }
    if (action === "pet_action") {
      const v = room.visitor(id),
        name = args.name;
      let type, values;
      if (name === "restock") {
        type = "restock";
        values = { item: args.item };
      } else if (name === "backpack_set") {
        type = "backpack_set";
        values = { items: args.items };
      } else if (name.startsWith("curtain_") || name.startsWith("light_")) {
        type = "furniture";
        values = name.startsWith("curtain_")
          ? { key: "curtainClosed", value: name === "curtain_close" }
          : { key: "lightOn", value: name === "light_on" };
      } else {
        type = "activity";
        values = { name: name === "feed" ? "eat" : name };
      }
      const result = await call("command", {
        command: {
          type,
          args: values,
          requestId: args.requestId || crypto.randomUUID(),
        },
        actor: { id, verifiedQQ: v.verifiedQQ || "" },
      });
      await refresh();
      return {
        ...result,
        furnishings: result.furnishings,
        activity: result.activity,
      };
    }
    return original.handle(action, args, id, now);
  };
  const timer = setInterval(() => refresh().catch(() => {}), 5000);
  timer.unref();
  return {
    refresh,
    context: room.travelContext,
    photoDirectory: settings.photoDirectory,
    async tick({
      generate,
      chooseTargets,
      isAllowed,
      isBusy,
      sendProgress,
      sendPhoto,
      record,
    }) {
      if (ticking) return;
      ticking = true;
      try {
        await refresh();
        const list = await call("outbox/list");
        for (const job of list.jobs) {
          if (job.kind === "decision") {
            if (isBusy()) continue;
            const claimed = (
              await call("outbox/claim", { kind: "decision", id: job.id })
            ).job;
            if (!claimed) continue;
            let intent = { action: "stay" };
            try {
              const text = await generate([
                {
                  role: "system",
                  content:
                    '你是大肥鱼，按自己当前意愿决定留家或出门。只输出JSON：{"action":"stay"} 或 {"action":"go","destination":"候选id","wish":"想做的事","reason":"自己想去的具体缘由"}。没有想做的事就留家；不要被安排或被丢去。候选地点可选doorstep（家附近5~15分）、neighborhood（附近小公园12~25分）、park（市内公园45~90分）、old_street（老街60~100分）、mountain（山间小镇150~270分）。远处需要饭，雷雨不远行。',
                },
                { role: "user", content: room.travelContext() },
              ]);
              intent = JSON.parse(
                String(text).replace(/^```(?:json)?\s*|\s*```$/g, ""),
              );
            } catch {}
            await call("command", {
              type: "travel_decision",
              requestId: job.id,
              args: { intent },
            });
            await call("outbox/finish", { id: job.id, status: "done" });
            await refresh();
            continue;
          }
          if (job.kind !== "share") continue;
          const w = current().world,
            trip = [
              w.travel.current,
              ...w.travel.pending,
              ...w.travel.history,
            ].find((t) => t?.id === job.payload.tripId);
          if (!trip) continue;
          if (
            job.payload.progress &&
            (!w.travel.current || w.travel.current.id !== trip.id)
          ) {
            await call("outbox/claim", { kind: "share", id: job.id });
            await call("outbox/finish", { id: job.id, status: "skipped" });
            continue;
          }
          if (job.payload.plan) {
            if (isBusy()) continue;
            const claimed = (
              await call("outbox/claim", { kind: "share", id: job.id })
            ).job;
            if (!claimed) continue;
            const targets = await chooseTargets(trip);
            for (const target of targets)
              if (isAllowed(target))
                await call("outbox/enqueue", {
                  id: job.id + ":" + target,
                  kind: "share",
                  payload: { ...job.payload, plan: false, target },
                  due: Date.now(),
                });
            await call("outbox/finish", { id: job.id, status: "done" });
            continue;
          }
          const key = job.payload.target;
          if (!isAllowed(key)) {
            await call("outbox/claim", { kind: "share", id: job.id });
            await call("outbox/finish", { id: job.id, status: "skipped" });
            continue;
          }
          if (isBusy(key)) continue;
          const claimed = (
            await call("outbox/claim", { kind: "share", id: job.id })
          ).job;
          if (!claimed) continue;
          try {
            let text;
            if (job.payload.progress) {
              await refresh();
              if (current().world.travel.current?.id !== trip.id)
                throw Error("旅程已结束");
              text =
                "我到" +
                trip.place.label +
                "啦，想" +
                trip.intent.wish +
                "，一会儿再回去。";
              await sendProgress(key, trip, text);
            } else {
              text =
                current().world.photos.find((x) => x.photoId === trip.id)
                  ?.caption || "我回来啦，给你看看照片。";
              await sendPhoto(key, trip, text);
            }
            record(key, text);
            await call("outbox/finish", { id: job.id, status: "done" });
          } catch {
            await call("outbox/finish", { id: job.id, status: "uncertain" });
          }
        }
      } finally {
        ticking = false;
      }
    },
    stop() {
      clearInterval(timer);
    },
  };
}
