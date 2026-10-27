# 连续相处改进（2026-10-17）

## 已部署行为

- 空 collector 不再等同于活跃回合，真实 turn/start 才计为忙；重建的在途回合有6分钟租约。
- 唤醒阻塞超过3分钟且没有有效消息等待时，退役旧会话、撤销旧agent token，再重建唤醒，防止旧回合复活重复发送。
- SnowLuma连接成功、DSH模式就绪时补课；仅白名单会话，最多最近30条且在24小时内，按消息ID去重。只加入近期背景，不加入未读，不更新活跃时间，不触发回复。网关失败只记录日志，不阻塞聊天。可用 socialV2.historySync.enabled=false 关闭。
- 待续话题复用 qq_memory_append 的 pendingThought 类别：extra.nextCheckInMs=多久后考虑；sourceMessageId=当前会话真实收到的消息ID；expiresAtMs=有效期，默认3天、上限7天。
- 主动机会每次最多自然接一件事。每条最多提供2次机会，两次至少间隔24小时；相同内容重存不会重置冷却。完成、不想谈、已经问过时用 qq_memory_remove 删除。机会次数不等于实际发送次数，这是保守的防骚扰上限。
- 新的待续话题不复制到没有到期/来源语义的全局人账。跨会话近况不再把私聊或历史补课带出去；既有全局事实/印象仍沿用原来的人账配置，并非完整的隐私记忆迁移。

## 验证

- node test-continuity.mjs：真实busy判断、冷却/到期、历史去重及只补背景。
- node scripts/test-reply-wait.mjs：10项全部通过。修复旧测试夹具遗漏的人账、图库、拟人节奏及连续性模块依赖。
- node scripts/test-mcp-servers-stdio.mjs：三个MCP server接入通过。
- 实机重启后QQ在线、DSH就绪；首次补入52条背景，第二次0条。没有为验证主动向群里发送测试消息。

## 来源与回滚

对照 https://github.com/pinganbbOvO/ai-companion-kit ，版本 24a9a0c6896b5bfe85d046c2ed245fd61cf9e090。
复用现有按人账本/轻量记忆；参考并采用 patches/01-bridge.patch 的 perConversation 主动检查覆盖形式。没有找到可直接复用的完整历史补课与死会话恢复实现，本次按当前桥接补齐。上游MIT许可另附。

原文件备份：backups/continuity-20261017-152031/。
回滚前停桥接，恢复同名源文件即可；新文件continuity-lib.js留在目录里不影响旧版。重启DSH、桥接并刷新会话映射后生效。记忆、人账未清空。
