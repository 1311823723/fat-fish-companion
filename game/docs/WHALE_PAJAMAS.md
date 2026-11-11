# 浅蓝鲸鱼睡衣与衣柜加载优化

## 睡衣造型与生成提示

使用内置 Image Gen 制作立绘和16项独立动作。角色使用既有大肥鱼参考，服装为浅蓝色纽扣睡衣、白色滚边、鲸鱼胸口口袋和稀疏鲸鱼图案长裤、奶油色毛绒鲸鱼拖鞋。保留蓝发、蓝眼睛、鱼鳍、尾巴和蓝色蝴蝶结。不戴帽子或兜帽，不穿裙子。

Sprite prompt: Match reference.png exactly. Blue-haired chibi whale girl with blue eyes, fin ears, whale tail, ahoge and blue bow hair clip. Pale powder-blue button-up pajama shirt with white piping and small whale chest pocket motif, matching loose full-length whale print trousers, cream plush whale slippers. Exactly eight full-body frames in ONE horizontal row, same scale, center and feet baseline, complete hair, tail and slippers inside separate cells. True transparent RGBA background; no haze, floor, shadows, labels or grid. Action: [下表动作要求]。

- idle: front facing stationary with gentle breathing and natural blink
- walk_left: side view facing screen LEFT, walking in place alternating foot steps, fixed center
- walk_right: side view facing screen RIGHT, walking in place alternating foot steps, fixed center
- sleep: LYING DOWN curled on her side, eyes closed, head resting on hands, knees bent, gentle breathing; NOT standing or sitting
- wake: front facing sleepy stretch then opening eyes and lowering arms
- tea: front facing holding milk tea cup, raise cup to sip then lower
- eat_taiyaki: front facing holding fish-shaped taiyaki pastry, raise to mouth and take bite
- expr_smile: front facing gentle happy smile, small blink and breathing
- expr_sad: front facing mildly sad expression, gentle breathing, no floating symbols
- expr_angry: front facing mildly annoyed puffed cheeks, gentle breathing, no symbols
- expr_sleepy: front facing drowsy half-closed eyes, tiny yawn
- read: front facing reading a small open book, look down and turn one page
- sing: front facing softly humming, small hand gestures and mouth movement, no floating musical notes
- eat_rice: front facing holding bowl full of WHITE RICE and wooden chopsticks, lift rice to mouth and lower
- headpat: front facing pleased headpat reaction, close eyes and dip head slightly then return; no external hand
- spin: happy turn in place, front, three-quarter left, left profile, back, right profile, three-quarter right, front, front; tail attached lower back

## 运行素材和预览

原始PNG及旅行参考图保留；运行图使用同尺寸WebP，alphaQuality=100，彩色质量86。每套服装生成独立的最大280×320预览图，衣柜使用img的lazy加载和异步解码，不再把原始立绘或动画图集当预览。运行图与预览文件名包含源文件内容哈希，Worker只为这些带版本的图片设置长期缓存。

npm run build 会先运行 scripts/optimize-outfits.mjs。命令可重复运行；只包含优化后WebP的第三方包也可安装及重新构建。outfit.json 可提供 preview 字段（包内PNG或WebP文件名），安装器会一起复制。原始参考仍由 photoReference 提供，不作为衣柜卡片请求。

前端只预热站立与走路动作；换装先加载站立和当前活动所需动作，其余按需加载。动作暂未准备好时保持同服装站立，避免闪回默认套装。换装处理期间暂时锁定选择，防止连续选择导致准备A却确认B。状态接口只发送服装选择所需信息，动作清单由前端静态资源提供。

在独立小屋验证了六张缩略图均正常显示、重复打开衣柜和睡眠中换装；未取得公网端到端耗时，不把体积缩减当作加载时间测量。生成图集仍可能存在细微帧间差异，素材尺寸检查不能代替实际试穿。
