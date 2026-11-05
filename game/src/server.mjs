import { drawTravelPhoto } from "./photo-router.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { Store } from "./core/store.mjs";
import { config, ROOT } from "./config.mjs";
import { Weather } from "./weather.mjs";
import { safeDrawingFailure } from "./drawing.mjs";
export function makeServer(c = config(), { store, fetcher = fetch } = {}) {
  fs.mkdirSync(path.join(ROOT, "state"), { recursive: true });
  store ??= new Store(path.resolve(ROOT, c.database || "state/world.db"));
  store.arcade.reviewAvailable = !!c.bridge?.enabled;
  store.drawingFallback =
    (c.drawing?.provider || "gpt") === "gpt" &&
    c.drawing?.fallbackProvider === "doubao";
  const sessions = new Map(),
    limits = new Map();
  const allowed = new Set(c.allowedOrigins || []);
  const internal = (req) => {
    const a = Buffer.from(String(req.headers["x-game-adapter"] || "")),
      b = Buffer.from(c.adapterSecret || "");
    return (
      b.length >= 32 && a.length === b.length && crypto.timingSafeEqual(a, b)
    );
  };
  const originOK = (req) =>
    !req.headers.origin || allowed.has(req.headers.origin);
  async function legacy(req, route, body) {
    const r = await fetcher("http://127.0.0.1:3102/api/room-" + route, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: req.headers.cookie || "",
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(route === "chat" ? 100000 : 10000),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie"),
    };
  }
  async function actor(req) {
    if (c.bridge?.enabled) {
      let r;
      try {
        r = await legacy(req, "identity", {});
      } catch {
        return null;
      }
      if (!r.body.ok) return null;
      const identity = r.body.identity || {};
      return {
        id: crypto
          .createHash("sha256")
          .update(req.headers.cookie || "")
          .digest("hex"),
        verifiedQQ: identity.verified ? identity.qq : "",
        identity,
      };
    }
    const id = String(req.headers.cookie || "").match(
      /game_guest=([a-f0-9]{64})/,
    )?.[1];
    return id && sessions.has(id)
      ? { id, identity: { verified: false } }
      : null;
  }
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };
  const server = http.createServer(async (req, res) => {
    const json = (v, status = 200, extra = {}) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        ...headers,
        ...extra,
      });
      res.end(JSON.stringify(v));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        json({ ok: true, service: "fatfish-game", schema: 1 });
        return;
      }
      if (req.method === "GET" && url.pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "POST" && url.pathname.startsWith("/internal/")) {
        if (!internal(req)) {
          json({ ok: false, error: "拒绝访问" }, 403);
          return;
        }
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 65536) throw Error("请求过大");
        }
        const b = JSON.parse(raw || "{}");
        if (url.pathname === "/internal/snapshot") {
          const publicState = store.snapshot();
          json({
            ok: true,
            world: { ...store.raw(), drawing: store.drawingState() },
            public: publicState,
            arcade: store.arcade.personal(),
          });
          return;
        }
        if (url.pathname === "/internal/command") {
          json(
            store.transact(
              b.command || b,
              b.actor
                ? {
                    id: String(b.actor.id),
                    verifiedQQ: b.actor.verifiedQQ || "",
                  }
                : { id: "adapter", system: true },
            ),
          );
          return;
        }
        if (url.pathname === "/internal/outbox/list") {
          json({
            ok: true,
            jobs: store.db
              .prepare(
                "SELECT id,kind,payload,due FROM outbox WHERE status='pending' AND due<=? ORDER BY kind='arcade-review',due LIMIT 30",
              )
              .all(Date.now())
              .map((x) => ({ ...x, payload: JSON.parse(x.payload) })),
          });
          return;
        }
        if (url.pathname === "/internal/outbox/enqueue") {
          const last = b.payload?.target
            ? store.db
                .prepare(
                  "SELECT max(started) at FROM outbox WHERE kind='share' AND json_extract(payload,'$.target')=?",
                )
                .get(b.payload.target).at
            : 0;
          store.enqueue(
            b.id,
            b.kind,
            b.payload,
            Math.max(b.due || Date.now(), last ? last + 45 * 60000 : 0),
          );
          json({ ok: true });
          return;
        }
        if (url.pathname === "/internal/outbox/claim") {
          if (!["share", "decision", "photo", "arcade-review"].includes(b.kind))
            throw Error("类型错误");
          json({
            ok: true,
            job: b.id ? store.claimId(b.id) : store.claim(b.kind),
          });
          return;
        }
        if (url.pathname === "/internal/outbox/finish") {
          store.finish(b.id, b.status, b.result);
          json({ ok: true });
          return;
        }
        if (url.pathname === "/internal/arcade/review-job") {
          json({ ok: true, game: store.arcade.reviewJob(b.matchId) });
          return;
        }
        if (url.pathname === "/internal/arcade/review-finish") {
          store.arcade.finishReview(b.matchId, b.text);
          json({ ok: true });
          return;
        }
        json({ ok: false }, 404);
        return;
      }
      if (url.pathname.startsWith("/api/room-")) {
        if (req.method !== "POST" || !originOK(req)) {
          json({ ok: false, error: "来源或方法无效" }, 403);
          return;
        }
        if (
          !String(req.headers["content-type"]).startsWith("application/json")
        ) {
          json({ ok: false, error: "需要JSON" }, 415);
          return;
        }
        const key = crypto
            .createHash("sha256")
            .update(req.headers.cookie || req.socket.remoteAddress)
            .digest("hex"),
          limit = limits.get(key) || { at: Date.now(), n: 0 };
        if (Date.now() - limit.at > 60000) {
          limit.at = Date.now();
          limit.n = 0;
        }
        if (++limit.n > 240) {
          json({ ok: false, error: "请稍后" }, 429);
          return;
        }
        limits.set(key, limit);
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 4096) throw Error("请求过大");
        }
        const body = JSON.parse(raw || "{}");
        const route = url.pathname.slice("/api/room-".length);
        if (["arcade", "arcade-view", "arcade-action"].includes(route)) {
          const a = await actor(req);
          if (!a) {
            json({ ok: false, error: "先进入小屋，再来玩。" }, 401);
            return;
          }
          json(
            route === "arcade"
              ? store.arcade.lobby(a)
              : route === "arcade-view"
                ? store.arcade.view(body.id, a)
                : store.arcade.act(body, a),
          );
          return;
        }
        if (
          [
            "enter",
            "identity",
            "challenge",
            "history",
            "chat",
            "logout",
            "diary-list",
            "diary-read",
          ].includes(route)
        ) {
          if (c.bridge?.enabled) {
            if (
              ["history", "identity"].includes(route) &&
              !(await actor(req))
            ) {
              json({
                ok: true,
                entered: false,
                identity: { verified: false },
                messages: [],
              });
              return;
            }
            const r = await legacy(req, route, body);
            json(r.body, r.status, r.cookie ? { "set-cookie": r.cookie } : {});
            return;
          }
          if (route === "enter") {
            const id = crypto.randomBytes(32).toString("hex");
            sessions.set(id, true);
            json({ ok: true, identity: { verified: false } }, 200, {
              "set-cookie": `game_guest=${id}; HttpOnly; SameSite=Strict; Path=/`,
            });
            return;
          }
          if (route === "logout") {
            const a = await actor(req);
            if (a) sessions.delete(a.id);
            json({ ok: true }, 200, {
              "set-cookie":
                "game_guest=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            });
            return;
          }
          if (route === "identity" || route === "history") {
            const a = await actor(req);
            json({
              ok: true,
              entered: !!a,
              identity: a?.identity || { verified: false },
              messages: [],
            });
            return;
          }
          json({ ok: false, error: "尚未连接QQ；当前可独立游玩" }, 503);
          return;
        }
        if (route === "state") {
          const a = await actor(req);
          json({
            ...store.snapshot(),
            entered: !!a,
            identity: a?.identity || { verified: false },
          });
          return;
        }
        if (route === "action") {
          const a = await actor(req);
          if (!a) {
            json({ ok: false, error: "先进入小屋" }, 401);
            return;
          }
          let command = body.command;
          if (!command) {
            const name = body.name;
            command = {
              requestId: body.requestId || crypto.randomUUID(),
              type:
                name === "restock"
                  ? "restock"
                  : name === "backpack_set"
                    ? "backpack_set"
                    : name?.startsWith("curtain_") || name?.startsWith("light_")
                      ? "furniture"
                      : "activity",
              args:
                name === "restock"
                  ? { item: body.item }
                  : name === "backpack_set"
                    ? { items: body.items }
                    : name?.startsWith("curtain_")
                      ? {
                          key: "curtainClosed",
                          value: name === "curtain_close",
                        }
                      : name?.startsWith("light_")
                        ? { key: "lightOn", value: name === "light_on" }
                        : { name },
            };
          }
          if (
            !["activity", "furniture", "restock", "backpack_set"].includes(
              command.type,
            )
          )
            throw Error("操作无效");
          json(store.transact(command, a));
          return;
        }
        json({ ok: false, error: "未知接口" }, 404);
        return;
      }
      if (
        req.method === "GET" &&
        /^\/room-photo\/[a-f0-9-]{36}(\/thumb)?$/.test(url.pathname)
      ) {
        const parts = url.pathname.split("/"),
          id = parts[2];
        if (!store.raw().photos.some((x) => x.photoId === id)) {
          json({ ok: false }, 404);
          return;
        }
        const file = path.join(
          ROOT,
          "state/photos",
          id + (parts[3] ? ".thumb.webp" : ".img"),
        );
        if (!fs.existsSync(file)) {
          json({ ok: false }, 404);
          return;
        }
        const b = fs.readFileSync(file),
          type = parts[3]
            ? "image/webp"
            : b[0] === 137
              ? "image/png"
              : b[0] === 255
                ? "image/jpeg"
                : "image/webp";
        res.writeHead(200, {
          ...headers,
          "content-type": type,
          "cache-control": "public, max-age=86400",
        });
        res.end(b);
        return;
      }
      if (req.method === "GET") {
        const rel = ["/", "/room", "/game"].includes(url.pathname)
            ? "index.html"
            : decodeURIComponent(url.pathname).replace(/^\/+/, ""),
          base = path.join(ROOT, "dist"),
          file = path.resolve(base, rel);
        if (
          !file.startsWith(base + path.sep) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          json({ ok: false, error: "页面不存在" }, 404);
          return;
        }
        const mime =
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".json": "application/json",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
          }[path.extname(file)] || "application/octet-stream";
        const enc = String(req.headers["accept-encoding"] || ""),
          compressed =
            enc.includes("br") && fs.existsSync(file + ".br")
              ? "br"
              : enc.includes("gzip") && fs.existsSync(file + ".gz")
                ? "gzip"
                : null;
        res.writeHead(200, {
          ...headers,
          "content-type": mime,
          "cache-control":
            rel === "index.html"
              ? "no-store"
              : "public, max-age=31536000, immutable",
          vary: "Accept-Encoding",
          ...(compressed ? { "content-encoding": compressed } : {}),
        });
        fs.createReadStream(
          compressed ? file + (compressed === "br" ? ".br" : ".gz") : file,
        ).pipe(res);
        return;
      }
      json({ ok: false }, 404);
    } catch (e) {
      json({ ok: false, error: String(e.message).slice(0, 100) }, 400);
    }
  });
  const ws = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/api/room-events" ||
      !req.headers.origin ||
      !originOK(req)
    ) {
      socket.destroy();
      return;
    }
    ws.handleUpgrade(req, socket, head, (s) => {
      ws.emit("connection", s, req);
      s.send(
        JSON.stringify({
          type: "revision",
          revision: store.snapshot().revision,
        }),
      );
    });
  });
  const changed = (e) => {
    for (const client of ws.clients)
      if (client.readyState === 1)
        client.send(JSON.stringify({ type: "revision", ...e }));
  };
  store.on("change", changed);
  const tick = setInterval(() => {
    store.snapshot();
    const w = store.raw(),
      now = Date.now(),
      trip = w.travel.current;
    if (
      trip &&
      now >= trip.departedAt + (trip.returnAt - trip.departedAt) * 0.5 &&
      !trip.photoScene
    ) {
      store.transact({
        type: "photo_capture",
        requestId: "capture:" + trip.id,
        args: {},
      });
      store.enqueue("progress-plan:" + trip.id, "share", {
        tripId: trip.id,
        progress: true,
        plan: true,
      });
    }
    const h = new Date(now + 28800000).getUTCHours();
    if (!trip && h >= 7 && h < 23 && now >= w.travel.nextDecisionAt)
      store.enqueue(
        "decision:" + Math.floor(now / 1800000),
        "decision",
        {},
        now,
      );
    for (const t of w.travel.pending) {
      if (
        t.photo?.status === "ready" &&
        !store.db
          .prepare(
            "SELECT id FROM outbox WHERE kind='share' AND status='pending' AND json_extract(payload,'$.tripId')=?",
          )
          .get(t.id)
      )
        store.transact({
          type: "trip_archive",
          requestId: "archive:" + t.id,
          args: { tripId: t.id },
        });
    }
  }, 5000);
  tick.unref();
  const weather = new Weather(c.weather, store);
  const arcadeTimer = setInterval(() => {
    try {
      store.arcade.settleDue();
    } catch {
      console.warn("[arcade] 回合恢复稍后重试");
    }
  }, 250);
  arcadeTimer.unref();
  weather.start();
  let drawing = false;
  const photoTimer = setInterval(async () => {
    if (drawing || !c.drawing?.enabled) return;
    store.db
      .prepare(
        "UPDATE outbox SET status=CASE WHEN attempts<3 THEN 'pending' ELSE 'abandoned' END WHERE kind='photo' AND status='attempted' AND started<?",
      )
      .run(Date.now() - 15 * 60000);
    const job = store.claim("photo");
    if (!job) return;
    drawing = true;
    try {
      const t = store
        .raw()
        .travel.pending.find((t) => t.id === job.payload.tripId);
      if (!t) throw Error("旅程不存在");
      await drawTravelPhoto(
        t.photoScene,
        {
          ...c.drawing,
          referenceFile: path.resolve(ROOT, c.drawing.referenceFile),
        },
        path.join(ROOT, "state/photos"),
        store,
      );
      let assetVersion;
      try {
        assetVersion = JSON.parse(
          fs.readFileSync(
            path.join(ROOT, "state/photos", t.id + ".meta.json"),
            "utf8",
          ),
        ).assetVersion;
      } catch {}
      store.transact({
        type: "photo_ready",
        requestId: "photo-ready:" + t.id,
        args: {
          tripId: t.id,
          assetVersion,
          caption:
            "我在" +
            t.place.label +
            "，" +
            ({
              walk: "慢慢散了会儿步",
              observe: "看了会儿风景",
              rest: "歇了一会儿",
              map: "看着地图找路",
              souvenir: "挑了点小东西",
              eat: "坐下来吃了点饭",
              umbrella: "打着伞走了走",
              shelter: "在屋檐下躲了会儿雨",
            }[t.photoScene.activity] || "慢慢逛了逛") +
            "。给你看看照片。",
        },
      });
      store.enqueue("share-plan:" + t.id, "share", {
        tripId: t.id,
        plan: true,
      });
      store.finish(job.id);
    } catch (error) {
      store.retryPhoto(job.id, safeDrawingFailure(error));
    } finally {
      drawing = false;
    }
  }, 10000);
  photoTimer.unref();
  server.on("close", () => {
    clearInterval(arcadeTimer);
    clearInterval(tick);
    clearInterval(photoTimer);
    weather.stop();
    store.off("change", changed);
    ws.close();
  });
  return { server, store };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.join(ROOT, "src/server.mjs")
) {
  const c = config(),
    { server } = makeServer(c);
  server.listen(c.port, c.host, () =>
    console.log("小屋核心已启动：http://" + c.host + ":" + c.port + "/room"),
  );
}
