# 制作和安装新套装

衣柜以整套服装为单位。每套服装有独立的动作图集和 `outfit.json`，小屋状态会保存当前穿着；QQ 和旅行照片可读取同一状态。请先确认参考图、角色和素材的使用授权，保留原作者署名与原有非商业等限制。

## 制作素材

1. 先准备角色正面、侧面和背面的设计参考，并固定头发、眼睛、尾巴、服装与配饰。
2. 根据既有动画逐动作制作同服装版本，保留原动作、角色比例和透明背景。至少覆盖 `idle`、`walk_left`、`walk_right`、`sleep`、`wake`、`tea`、`eat_taiyaki`、`expr_smile`、`expr_sad`、`expr_angry`、`expr_sleepy`、`read`、`sing`、`eat_rice`、`headpat`、`spin`。
3. 图片支持透明 PNG 或 WebP。标准图集每帧为 256×256，每行最多八帧，顺序从左到右、从上到下；最后一行允许空格。也可用 `grid` 描述非标准网格，例子见现有 `public/assets/outfits/whale_knit/outfit.json`。生成式工具可能改变帧数、服装或产生残留背景，请逐帧人工核验，不能只靠文件格式检查。
4. 准备一张 PNG 服装参考图和一段准确的服装描述，供旅行绘图使用。生成图片仍可能出现服装细节偏差。

例如使用图像生成工具时，可以把现有动作图集和新服装三视图作为参考，要求保留动作顺序、姿势、角色身份与道具，只更换服装，并生成透明背景。不同工具的输出尺寸和行距可能不同，需要在清单中按实际测量填写，尤其要检查每排帧的脚底位置、裁切和循环接缝。

## 清单和安装

将每套衣服放在单独目录，创建 `outfit.json`：

```json
{
  "id": "my_outfit",
  "name": "我的套装",
  "photoReference": "reference.png",
  "photoDescription": "A blue coat with a white scarf",
  "actions": {
    "idle": { "file": "idle.webp", "frames": 12, "fps": 6 }
  }
}
```

示例只展示一个动作；实际清单必须写全 16 个动作。`id` 使用小写字母、数字、下划线或短横线；文件名不能含目录。`once: true` 用于摸头、转圈等单次动作。`grid` 支持 `columns`、`columnStep`、`offsetY`、`rowStep`、`width`、`height`，定义每帧在原图中的矩形；不写 `grid` 时按标准图集切帧。

在 `game` 目录运行：

```sh
node scripts/check-outfit-pack.mjs /path/to/your-outfit
node scripts/install-outfit-pack.mjs /path/to/your-outfit
npm run build
```

Windows 可以将 `/path/to/your-outfit` 换成素材目录的实际路径并加引号。安装器检查清单、文件、尺寸、路径和透明通道，拒绝重复 ID；请另外检查每帧是否有背景残留、人物是否截断或跳动。安装后按部署方式更新网页及后台，确保两个进程使用同一套清单；公网静态网页也需要重新部署。衣柜只能在完成后台确认后改变穿着。

`photoReference` 和 `photoDescription` 可为旅行照片提供第二张参考图及服装描述。若不提供，旅行绘图会沿用原始角色参考；不同绘图服务不保证完全遵循参考图。

## 矩形动作帧

奶油橙花连帽衫使用矩形帧示例。grid.width 为每帧宽度（32～512），grid.height 为高度（32～1024），可以不相等；加载器按帧高度归一化显示，避免拉伸和裁切。仍须逐帧核对脚底位置、左右分隔和循环接缝。矩形帧包需要同时更新检查脚本和前端加载器，旧版不支持。示例见 public/assets/outfits/cream_hoodie/outfit.json。立绘和16项动作由内置 Image Gen 生成，所有动作均为独立图集。

## 轻量预览与运行图

清单可增加 preview，填写包内PNG或WebP文件名。衣柜使用专用缩略图，不使用原始立绘。npm run build 自动生成保留原帧尺寸和透明通道的WebP运行版及最大280×320预览，原始PNG与旅行参考保留；文件名含内容版本，可长期缓存。安装器兼容已有preview和仅WebP的优化素材包。详细原理与睡衣示例见 WHALE_PAJAMAS.md。
