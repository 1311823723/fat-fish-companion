# GitHub发布准备

当前文档和命令是发布基础，不能把正在运行的整个文件夹直接上传。需要先在独立的干净发布目录准备代码，再检查所有待提交内容；.gitignore不会清除历史提交中的秘密。

必须排除：config.json、room.config.json、state/、日志、浏览器用户目录、下载的个人音频、凭据、二维码和私人聊天/记忆/日记。模板只留空账号与示例地址。不要从运行配置复制后只改文件名。

发布包应包含：主项目运行所需源码、依赖清单和锁文件、README/RULES/LICENSE、DSH-INSTALL.md、docs/ROOM-DEPLOY.md、room.config.example.json、src/room-settings.mjs、src/web-room.mjs、src/room-public-server.mjs、public/room-live.html、room-live.js、room-assets及完整许可证/署名、scripts/room-setup.mjs和room-doctor.mjs、start-room.ps1和停止脚本。

桥接中的WebRoom构造、私有/api/room-web路由、真实QQ私聊confirmQQ入口及现有LivingSpace/CompanionMind模块必须一起存在。单独抽出房间文件不构成可运行发行包。README必须说明本扩展与当前分支集成的关系，不能承诺任意上游版本直接兼容。

发布检查：

- 在干净克隆中按DSH-INSTALL.md执行，从空状态开始测试本机/局域网/公网三种模式；没有选择公网时不能自动建隧道。
- 运行node语法检查和现有小屋身份、隔离、网关、手机布局测试。
- 用npm run privacy-scan检查工作树与准备提交的文件，逐项处理结果，不忽略真实命中；检查git diff --cached，必要时检查历史。公开角色卡需去掉私人姓名、QQ、日记内容。
- 不包含自己的room.config.json；所有路径相对仓库或来自部署人的本地配置。
- 代码遵守主项目LICENSE；角色素材另遵守public/room-assets/LICENSE.txt与CREDITS.txt（CC BY-NC-SA 4.0，含非商业限制）。页面素材署名不得删除。不要声称整个仓库素材均为MIT。
- README给出真实仓库地址后，别人才可以“把地址发给DSH”自动读取安装指南；仓库尚未发布时不能给出虚构链接。

发布时不得打包私人存档。
