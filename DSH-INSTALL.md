# 给DSH：安装手机小屋

先读README.md、RULES.md和docs/ROOM-DEPLOY.md。这是集成在当前QQ Bridge中的扩展，不是独立静态网页。用户只给仓库地址时，检查系统、Node版本、已有DSH、QQ Bridge、SnowLuma、模型接口，再执行安装。

默认仅本机。只有部署人明确选择后才用lan或public；没说时询问“仅本机 / 同一Wi-Fi / 公网”，同时继续检查依赖。不要覆盖config.json、角色、state、登录目录或现有密钥。不重置有修改的仓库。

1. 按主README安装依赖、接通基础机器人。本扩展要求bridge.js已包含WebRoom、私有/api/room-web路由和真实QQ私聊confirmQQ入口；不兼容时明确报告，不能伪造成功。
2. 执行npm run room:setup -- --mode local。重复执行保留存档和密钥；没有--mode时保留模式。
3. 由部署人配置自己的botQQ、模型Base URL和模型名称。密钥留在本机环境变量ROOM_API_KEY，不要求贴到聊天中。room.config.json不入Git。
4. 按访问方式启动。Windows使用start-room.ps1独立后台进程；其他系统在持久终端或服务管理器运行npm run room:start。不能让常驻服务依赖短命的工具窗口。公网只转发小屋网关，不转发控制台、DSH、模型代理或SnowLuma。
5. 运行npm run room:doctor，再检查360/390像素竖屏，无横向滚动，角色/家具位置正确，游客进入、冰箱和活动按钮可用。
6. 用户自行发一条网页消息验收模型；本人从真实QQ发送验证码验收记忆关联。未完成时说明待验收，不能伪造QQ事件替代真实验证。不要擅自发QQ消息或调用付费模型验收。
7. 返回实际访问地址、启动/停止命令、模式和未通过检查，不返回完整QQ号、凭据或私人记忆。

静态页面修改刷新即可；后端模块修改重启桥接；只有MCP工具变更才按主项目要求重启DSH并刷新会话。发布前读docs/ROOM-RELEASE.md。扫码与管理密码由用户本人完成，DSH不能凭仓库地址自动取得账号权限。
