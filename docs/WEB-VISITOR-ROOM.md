# 动态访客小屋（2026-10-26）

入口沿用 state/room-public/public-url 中的临时HTTPS域名。公网不再使用口令。

1. 访客可以直接看角色活动和状态；输入QQ号或选“直接做客”后可聊天。
2. QQ号仅是自报信息，未验证时不读取任何QQ旧记忆，不能通过冒填号码读取他人对话。
3. 点“关联QQ记忆”获得一次性语句。用对应QQ私聊机器人（配置中的脱敏号码）发送“小屋验证 <12位随机码>”，再点“检查验证”。有效期10分钟，验证码仅保存哈希。验证消息在QQ白名单检查前处理，不自动扩大私聊白名单。
4. 验证后读取统一人账中本人印象、姓名，以及private:该QQ范围的事实记忆。网页对话仅返回给自己的签名会话，不广播给其他访客。不会导入他人的私聊、群聊原文或主人的日记。
5. 已验证本人发送“记住：……”时，将这条本人陈述写入同一private:QQ的CompanionMind事实记忆，QQ私聊可复用。模型的猜测不会自动写为事实，也不会自动覆盖全局人账印象。

## 动画与心情

采用二维原始逐帧动画，不是3D骨骼模型。角色来源：https://github.com/tndmgzo7/blue-fat-fish-desktop-pet 。角色原设上善无形；DeepSeek女仆版ZipZipPipe；动画美术CC BY-NC-SA 4.0。页面署名与LICENSE/CREDITS保留在public/room-assets。选取13个动作、128个唯一帧，重新打包lossless WebP约4MB；未重绘角色。

所有访客轮询相同服务端活动状态，包括走动、睡觉、醒来、吃零食、喝奶茶。23:00–07:00默认睡觉；访客可轻轻叫醒。页面关闭时动画停止绘制、停止轮询。

已有真实状态来自CompanionMind的mood/energy；表情按mood映射，0–100心情值仅作展示，不是关系好感度。不存在访客刷分改变核心人格的机制。公共状态不含原因、私人心绪、个人关系或日记。

## 推理与额度

网页推理复用当前本机WorkBuddy代理、当前模型和角色卡，但不加载任何工具，不经过QQ发送路径。网页访客不获得文件、控制台、浏览器或QQ操作权限。

游客每天10句、已验证用户每天40句、全网页每天200句；北京时间自然日重置；同一身份只允许一个在途请求、全局同时2个，至少间隔8秒。requestId防重。模型错误如实返回，不伪造成功。

会话Cookie采用独立visitor-signing-key HMAC签名、HttpOnly/SameSite=Strict；公网模式加Secure，有效期7天；签名密钥不返回页面。退出会删除对应验证访客记录。旧access-key不再作为网页登录凭据使用。

## 文件与运维

- src/web-room.mjs：访客、验证、私有聊天、额度和公共活动。
- src/room-public-server.mjs：仅开放固定静态资源和固定小屋路径；调用本机桥接/api/room-web。
- public/room-live.html、room-live.js、room-assets/：客户端。
- state/room-web.json：验证状态与分身份的网页历史，不供公网静态读取。
- 原有start-room-public.ps1和stop-room-public.ps1继续有效，隧道无需更换域名。

验证：test-web-room.mjs、test-visitor-gateway.mjs、test-qq-verification-hook.mjs及原有性格/聊天/主动缘由回归。生产中已实测游客网页模型回复；真实用户仍需自行在QQ发送验证码完成绑定，未通过伪造事件验证真实QQ身份。

手机竖屏与迁移部署请以 [ROOM-DEPLOY.md](ROOM-DEPLOY.md) 为准。
