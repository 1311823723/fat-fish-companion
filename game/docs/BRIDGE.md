# 旧版 QQ 桥接适配

独立游戏监听 `127.0.0.1:3103`，旧桥接 `3100`，公开网关 `3102`。内核不直接访问 QQ：分享仍经过原来的白名单、会话忙碌判断和发送队列。天气地点只保存在本机配置。

1. 备份旧桥接文件和存档，停止旧生活调度器前核对正在处理的会话。
2. 用 `node scripts/stage-bridge.mjs <旧项目> <独立暂存目录>` 生成补丁。它对源码锚点严格检查，旧版结构不同就停止，禁止整包覆盖。
3. 检查暂存的 `bridge.js`、`room-public-server.mjs` 及两个 adapter 模块。补丁仅在存在启用的 `state/game-core-link.json` 时接管；禁用后使用旧实现。
4. 链接文件结构：`enabled`、本机 `url`、与核心 `adapterSecret` 相同的 `secret`、`photoDirectory`、独立 `relaySecret` 和 `publicOrigins`。实际密钥通过本机配置生成，不在文档里提供。
5. 核心配置 `bridge.enabled=true`。旧网关继续负责原有签名 cookie、QQ 验证、聊天和主人日记。新界面使用同源接口，因此 QQ 和网页仍按同一人号读取记忆。
6. 先启动核心并验证 `/health`，会话空闲时启用补丁并重启桥接和网关。核对两端库存、位置、生活版本一致；保留旧 `/room-legacy` 画面作为回滚入口。

`game-core-link.json` 属于私密运行配置，不进入仓库。桥接失去核心时停止推测和生活写入，正常 QQ 消息处理路径仍保留；不会启动第二套随机出游逻辑。

新增 QQ 功能无需刷新 MCP 会话；若另外改动 MCP 工具定义，仍按原项目流程重启 DSH 并刷新会话。
