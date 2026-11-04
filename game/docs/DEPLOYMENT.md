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

## 独立 Pages 入口（网址不包含账号子域名）

Pages 使用独立的项目名，例如 `fatfish-cottage.pages.dev`（部署其他实例时请改成自己独有的项目名），不需要更改账号共用的 workers.dev 子域名，也不会更改同账号其他项目的地址。需要 Cloudflare Pages 部署权限。

```powershell
npm run build:pages
npx wrangler pages project create fatfish-cottage --production-branch main
npx wrangler pages secret put ROOM_ORIGIN --project-name fatfish-cottage
npx wrangler pages secret put ROOM_RELAY_SECRET --project-name fatfish-cottage
npx wrangler --cwd deploy/pages pages deploy ../../state/pages-build --project-name fatfish-cottage --branch main
```

`ROOM_ORIGIN` 指向部署者自己的固定公网小屋网关，`ROOM_RELAY_SECRET` 与本机网关独立转发凭据一致；不要将凭据写进代码或文档。将实际的 Pages HTTPS 来源加入本机 `state/game-core-link.json` 的 `publicOrigins` 与游戏配置的 `allowedOrigins`。新网址按原方式重新进入、验证 QQ，原有日记和人物记忆保留。

构建脚本只从 `dist` 复制公开静态文件到独立构建目录，并加入受限的 `_worker.js` 转发器。它只转发小屋公开接口，不开放管理端、DSH 或任意目标地址。账号共用域名与其他 Worker 保持原状。切换后可单独停用旧小屋 Worker 的公开路由，保留本机和网关回退入口。
