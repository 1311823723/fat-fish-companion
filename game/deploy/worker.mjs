const api = new Set([
  "/api/room-state",
  "/api/room-enter",
  "/api/room-identity",
  "/api/room-challenge",
  "/api/room-history",
  "/api/room-visits",
  "/api/room-messages",
  "/api/room-chat",
  "/api/room-action",
  "/api/room-logout",
  "/api/room-diary-list",
  "/api/room-diary-read",
  "/api/room-events",
  "/api/room-arcade",
  "/api/room-arcade-view",
  "/api/room-arcade-action",
]);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico")
      return new Response(null, { status: 204 });
    if (
      api.has(url.pathname) ||
      /^\/room-photo\/[0-9a-f-]{36}(\/thumb)?$/.test(url.pathname)
    ) {
      if (!env.ROOM_ORIGIN || !env.ROOM_RELAY_SECRET)
        return new Response("后台未配置", { status: 503 });
      if (
        request.method !== "POST" &&
        url.pathname !== "/api/room-events" &&
        !url.pathname.startsWith("/room-photo/")
      )
        return new Response("Method not allowed", { status: 405 });
      if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== url.origin
      )
        return new Response("Forbidden", { status: 403 });
      const target = new URL(url.pathname, env.ROOM_ORIGIN);
      target.search = url.search;
      const h = new Headers();
      for (const name of [
        "content-type",
        "cookie",
        "upgrade",
        "connection",
        "sec-websocket-key",
        "sec-websocket-version",
      ]) {
        const value = request.headers.get(name);
        if (value) h.set(name, value);
      }
      h.set("x-room-relay", env.ROOM_RELAY_SECRET);
      h.set("x-room-origin", url.origin);
      h.set("ngrok-skip-browser-warning", "true");
      const response = await fetch(
        new Request(target, {
          method: request.method,
          headers: h,
          body: request.method === "POST" ? request.body : null,
          redirect: "manual",
        }),
      );
      if (response.status === 101) return response;
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/internal/") ||
      url.pathname.startsWith("/plugins/")
    )
      return new Response("Not found", { status: 404 });
    if (["/", "/room", "/game"].includes(url.pathname))
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    return env.ASSETS.fetch(request);
  },
};
