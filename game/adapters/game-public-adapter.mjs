import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
function settings(root) {
  try {
    const c = JSON.parse(
      fs.readFileSync(path.join(root, "state/game-core-link.json"), "utf8"),
    );
    return c.enabled ? c : null;
  } catch {
    return null;
  }
}
function origin(req, c) {
  const relay = req.headers["x-room-relay"];
  if (relay) {
    const a = Buffer.from(String(relay)),
      b = Buffer.from(c.relaySecret || "");
    if (b.length < 32 || a.length !== b.length || !crypto.timingSafeEqual(a, b))
      throw Error("转发凭据无效");
    const o = String(req.headers["x-room-origin"] || "");
    if (!(c.publicOrigins || []).includes(o)) throw Error("转发来源无效");
    return o;
  }
  const o = req.headers.origin;
  if (o) {
    const u = new URL(o);
    if (u.host !== req.headers.host) throw Error("跨站请求被拒绝");
  }
  return o;
}
export async function routeGame(req, res, { root }) {
  const c = settings(root);
  if (!c) return false;
  const u = new URL(req.url, "http://localhost");
  if (['/api/room-chat', '/api/room-history'].includes(u.pathname) && req.headers['x-game-legacy']) {
    const a = Buffer.from(String(req.headers['x-game-legacy'])), b = Buffer.from(c.relaySecret || '');
    if (b.length >= 32 && a.length === b.length && crypto.timingSafeEqual(a, b)) return false;
  }
  if (u.pathname === "/room-legacy") {
    req.url = "/room";
    return false;
  }
  const publicRoutes = new Set([
    "/",
    "/room",
    "/game",
    "/favicon.ico",
    "/api/room-state",
    "/api/room-action",
    "/api/room-chat",
    "/api/room-history",
    "/api/room-visits",
    "/api/room-messages",
    "/api/room-board",
    "/api/room-arcade",
    "/api/room-arcade-view",
    "/api/room-arcade-action",
  ]);
  const game =
    publicRoutes.has(u.pathname) ||
    /^\/assets\/[a-zA-Z0-9_.-]+$/.test(u.pathname) ||
    /^\/room-photo\/[a-f0-9-]{36}(\/thumb)?$/.test(u.pathname);
  let from;
  try {
    from = origin(req, c);
  } catch {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "来源验证失败" }));
    return true;
  }
  // Legacy identity, chat and diary keep their existing signed cookie and QQ verification.
  if (!game) {
    if (req.headers["x-room-relay"]) {
      req.headers.origin = from;
      req.headers.host = new URL(from).host;
    }
    return false;
  }
  await new Promise((resolve) => {
    const proxy = http.request(
      new URL(req.url, c.url),
      {
        method: req.method,
        headers: {
          "content-type": req.headers["content-type"] || "application/json",
          cookie: req.headers.cookie || "",
          ...(from ? { origin: from } : {}),
          "accept-encoding": req.headers["accept-encoding"] || "",
        },
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
        r.on("end", resolve);
      },
    );
    proxy.setTimeout(110000, () => proxy.destroy());
    proxy.on("error", () => {
      if (!res.headersSent)
        res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "小屋核心正在重连" }));
      resolve();
    });
    req.pipe(proxy);
  });
  return true;
}
export function installGameEvents(server, { root }) {
  server.on("upgrade", (req, socket, head) => {
    const c = settings(root);
    if (!c || req.url !== "/api/room-events") {
      socket.destroy();
      return;
    }
    let from;
    try {
      from = origin(req, c);
      if (!from) throw Error();
    } catch {
      socket.destroy();
      return;
    }
    const proxy = http.request(new URL(req.url, c.url), {
      headers: {
        upgrade: "websocket",
        connection: "Upgrade",
        "sec-websocket-key": req.headers["sec-websocket-key"],
        "sec-websocket-version": "13",
        origin: from,
      },
    });
    proxy.on("upgrade", (res, upstream, upHead) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          Object.entries(res.headers)
            .map(([k, v]) => k + ": " + v)
            .join("\r\n") +
          "\r\n\r\n",
      );
      if (upHead.length) socket.write(upHead);
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
      socket.on("error", () => upstream.destroy());
      upstream.on("error", () => socket.destroy());
    });
    proxy.on("error", () => socket.destroy());
    proxy.end();
  });
}
