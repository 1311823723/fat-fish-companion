# 本地短语音（2026-10-19）

## 方案与实际效果

- sherpa-onnx-node 1.13.8 + 官方 Kokoro int8 multi-lang v1_1，预置中文女声 zf_001（speakerId=3）。CPU两线程，24000Hz，不训练、不克隆声音。
- 模型压缩包约140MB；机器人运行不需要Python服务。模型与许可在models/kokoro-int8-multi-lang-v1_1。
- 首条试听约5.55秒，从加载到合成约11.48秒。属于按需短语音，不是实时通话。子进程合成后退出，释放模型内存，不增加常驻服务窗口。
- 试听已通过QQ网关发送到主人私聊，get_msg回读确认record段，verified=true。

## 使用

- 新工具qq_speak(key,token,text)：输入她想说的自然短句，1~160字，最长45秒。无需找音频文件；合成失败先打字，不反复重试。
- 默认仍打字。对方明确想听、问候/晚安、适合语气的短句才偶尔用；不要重复发同一句文字，不声称是现实真人录音。
- 只允许现有白名单，校验当前会话token、暂停、模式、静默及敏感文本；合成后再次验证权限。群聊每小时最多2条，私聊每小时最多6条；语音总闸每分钟最多1条。
- qq_send_voice/qq_list_voices仍用于已有音频；任意文件路径、URL/base64未开放给AI。
- 正常qq_speak生成的临时文件发送后清理；这次的独立试听样本保留在audio/generated供用户试听。

## 开关

config.json：socialV2.voice.enabled=true、socialV2.tools.sendVoice=true，socialV2.tts.enabled=true。
关闭语音用前两个开关；改MCP工具可见性后需重启DSH并刷新会话。speakerId由管理员配置，不让模型每轮换声音。

## 验证与回滚

- test-tts-api.mjs：文本长度/链接、令牌、工具开关、敏感文本拦截、真正语音回读、临时文件清理、合成期间令牌撤销。
- 既有语音83项、预设7项、首回复等待10项检查通过；MCP注册59个SnowLuma工具。
- 原文件和配置备份：backups/tts-20261019-095516/。回滚先停桥接，恢复bridge.js、mcp-snowluma-safe.js、config.json、人格源和生成patch、测试夹具；依赖清单也有备份。重启DSH和桥接并刷新会话。模型与新模块留在磁盘不影响旧版。
- 官方来源：https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html
