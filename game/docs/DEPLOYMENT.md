# 私网与公网

## 私网

默认核心只绑定 `127.0.0.1`。同机打开 `http://127.0.0.1:3103/room`。需局域网访问时，使用带身份验证的公开网关，把游戏核心保留在环回地址；按实际网关地址配置 `allowedOrigins`。不要公开 `/internal/*`、DSH 或桥接控制台。

## 保留现有固定隧道

现有固定 ngrok 入口继续连接本机公开网关。网页与 API 同源，签名会话与 QQ 验证由原网关保留。启动次序：模型代理/DSH/QQ 网关 → 游戏核心 → QQ 桥接 → 小屋公开网关 → 隧道。

## Cloudflare Workers，无需购买域名

1. 本机正常工作后运行 `npm run build`。
2. 用官方 Wrangler 登录：`npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`。亲自完成浏览器授权，不将令牌发送给助手或群聊。
3. `npx wrangler deploy` 部署静态网页，获得固定 `workers.dev` 地址。
4. `npx wrangler secret put ROOM_ORIGIN` 输入现有公开网关的 HTTPS 入口。
5. `npx wrangler secret put ROOM_RELAY_SECRET` 设置独立随机凭据，与本机链接文件的 `relaySecret` 一致。不要将其写入 `wrangler.jsonc`。
6. 在本机核心的 `allowedOrigins` 及网关链接文件的 `publicOrigins` 加入准确的 Worker origin，不加通配符。
7. 再次部署，实测目标手机网络的静态加载、API、WebSocket 和聊天。API 仍受本机网络和隧道影响，不能保证跨境链路一定更快。WebSocket 不可用时自动退回每五秒轮询。

Worker 只转发白名单的公开小屋路由；内部管理和 DSH 路由返回 404。API 和私人数据不缓存，带版本的静态素材缓存。换域名后浏览器会话独立，重新进入并验证 QQ，旧账号记忆不会因换域名而删除。

Cloudflare 速度或可达性不合格时继续用原隧道。不要为迁移网页停止 QQ 服务，也不要把本机管理端直接挂到 Worker。
