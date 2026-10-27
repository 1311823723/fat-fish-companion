# 手机小屋：安装与访问

本小屋随当前QQ Bridge运行，使用现有QQ身份验证、人账和私有记忆。它不是纯静态网站，不能只放到GitHub Pages后获得聊天功能。GitHub负责分发代码；聊天仍需部署人的后端与模型额度。

## 让 DSH 帮你装

把仓库地址和下面的话发给DSH（发布后把地址换成你的真实仓库地址）：

> 请先读仓库根目录 DSH-INSTALL.md，再按照 docs/ROOM-DEPLOY.md 安装手机小屋。访问方式选择【仅本机 / 同一Wi-Fi / 公网】中的一个。先检查我已有的QQ Bridge和DSH配置，保留原来的存档、角色和密钥。依赖与服务检查通过后启动，给我实际地址和验收结果。缺少模型凭据时指导我在本机配置，不要让我贴密钥。不要在我没有选择公网时开隧道。

DSH能读取仓库、运行终端命令才可自动安装。扫码登录、已有管理密码、本人QQ验证码仍由用户完成，无法凭仓库地址自动获得账号权限。

## 依赖和初始化

先按主README接通QQ Bridge、DSH和SnowLuma，并准备一个支持Chat Completions的模型接口。Node要求沿用package.json的engines（至少22.13）。网页聊天直接请求配置的模型接口，不向访客开放DSH工具。

在项目根目录执行：

```sh
npm install
npm run room:setup -- --mode local
```

编辑生成的 `room.config.json`：

| 字段 | 填写内容 |
| --- | --- |
| mode | local、lan 或 public |
| port | 小屋网关端口，默认3102 |
| upstream | 本机桥接HTTP地址，默认 http://127.0.0.1:3100 |
| botQQ | 部署人的机器人QQ，页面只显示脱敏号码 |
| modelBaseURL | 模型接口的v1根地址，不含/chat/completions |
| model | 对应提供方的真实模型名称；空值沿用桥接模型 |
| apiKeyEnv | 保存密钥的环境变量名，默认ROOM_API_KEY |
| proxyConfigModule | 可选，本机代理配置模块路径，需导出loadConfig/primaryKey；普通API保持空 |

密钥放服务进程继承的环境变量。PowerShell当前终端可用 `$env:ROOM_API_KEY = Read-Host 'API key' -MaskInput`（PowerShell 7）；其他系统用其安全的本地环境配置。修改环境变量后需要重新启动桥接进程。配置和签名密钥均留在本地，不加入Git。代理模块与环境变量二选一，配置了模块时以模块凭据为准。

初始化幂等：已有存档、签名密钥不被覆盖；没有--mode时保留当前模式。修改mode/port后需重启小屋网关；修改模型或botQQ后重启桥接。

## 仅本机：默认

```sh
npm run room:setup -- --mode local
npm run room:start
```

打开 http://127.0.0.1:3102/room 。仅监听回环地址，其他设备不可访问。Windows后台启动可用 `powershell -File .\start-room.ps1 -Mode local`。

## 同一Wi-Fi / 私网

```sh
npm run room:setup -- --mode lan
npm run room:start
```

查部署电脑的局域网IPv4（Windows执行ipconfig），手机连同一Wi-Fi，打开 `http://电脑局域网IP:3102/room`。网关监听0.0.0.0；只为小屋端口设置系统防火墙的专用网络入站规则，别开放路由器端口映射。Windows后台启动用 `powershell -File .\start-room.ps1 -Mode lan`。已有网关先停止再切模式。

LAN HTTP是可信私网便利模式，Cookie不设置Secure；聊天传输未加密。敏感使用应在私网前加HTTPS，或选择下面的HTTPS公网入口。手机浏览器在HTTP局域网可能禁用剪贴板按钮，手动复制验证码即可。随机请求ID自带非安全上下文兼容，不依赖HTTPS的randomUUID。

## 公网：不需要公网IP的临时方式

部署电脑安装官方cloudflared；访客只用浏览器，不需要安装软件。

```sh
npm run room:setup -- --mode public
npm run room:start
# 另一常驻终端
cloudflared tunnel --url http://127.0.0.1:3102 --protocol http2
```

使用cloudflared输出的 `https://…trycloudflare.com/room`。公网模式网关仍只监听127.0.0.1，Cookie设Secure，访客必须走HTTPS地址。不要再用局域网HTTP地址登录。

Windows后台：`powershell -File .\start-room.ps1 -Mode public -Cloudflared "你的cloudflared.exe路径"`；日志在state/room-public/tunnel-error.log。兼容入口start-room-public.ps1也接受-Cloudflared。临时域名每次新建隧道可能变化，断开隧道即失效，适合测试。官方说明：[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

长期使用可选自己的域名与正式Cloudflare Tunnel，将唯一公开服务指向 `http://127.0.0.1:3102`；或者在自己的服务器上使用HTTPS反向代理。按[官方Tunnel文档](https://developers.cloudflare.com/tunnel/get-started/)完成域名/账户配置。不要把3100、3080、8788、SnowLuma管理端口转发到公网。小屋没有管理员控制面板，访问URL的人可以做客；本人记忆仍需QQ验证。

## 停止、检查和验收

Windows：`powershell -File .\stop-room-public.ps1` 停止小屋网关和该脚本管理的隧道，不停止QQ机器人。其他系统前台运行时Ctrl+C，后台进程用自己的服务管理器停止。

```sh
npm run room:doctor
```

doctor仅检查文件、桥接在线、页面和管理路径隔离，不测试付费推理或伪造本人身份。完整验收：

1. 手机360/390像素宽无横向滚动；竖屏房间家具完整，角色走动、睡觉、吃喝位置正确。
2. 游客进入可见自己的消息；另一个浏览器不能读取聊天。
3. 用户自行发一条网页消息测试模型；身份未验证不加载QQ旧记忆。
4. 用自己的QQ私聊机器人发送网页生成的完整验证码，再点检查验证；号码脱敏，错误QQ不能绑定。
5. 小屋域名/api/status、/api/room-web、/config.json、/state/console-token均不可访问。

页面无反应：查网关日志和桥接状态；能看不能聊：查本地模型配置、环境变量和额度；QQ验证无效：确认真实私聊事件抵达桥接及验证码有效期。不要把日志中的私人聊天或凭据贴到公开issue。

## 桌上的日记本

点击桌面“日记”本子打开。主人身份使用主项目config.json中的ownerQQ，不单独设一套网页登录主人。访客必须先用对应QQ给机器人发送一次性验证码；仅填写主人号码、已验证的其他QQ都不能读日记。配置更换ownerQQ并重启桥接后，旧主人失去日记权限。公开页面和公共状态不包含日记正文；列表和展开均由服务端检查已验证主人身份。

读取现有日记库，仅列出主人作用域内仍在保留期、未搁置、未划掉的最近10篇。逐篇展开读取正文，不会续期、改写或新生成日记；没有条目时显示空状态。它是只读入口，不提供删除或修改操作。

小黑盒功能使用Python环境；若系统默认python不含相应依赖，可用环境变量XHH_PYTHON指定该环境的Python可执行文件。仓库不包含账号登录信息。
