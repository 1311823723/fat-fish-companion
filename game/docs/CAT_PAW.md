# 蓝莓猫爪卫衣制作记录

使用内置 Image Gen，根据用户提供的服装三视图制作立绘和16项独立动作图集。固定蓝色猫耳兜帽、米白猫脸额头及腹部贴布、猫爪袖口、蓝色短裙和毛绒猫爪靴，保留角色蓝发、鱼鳍和鲸鱼尾巴。保留角色原有署名和非商业限制。

## 提示词模板

Match reference.png exactly: blue-haired chibi whale girl, blue eyes, fin ears, whale tail, blue cat-ear hood worn up with cream cat-face forehead patch, blue zip hoodie with cream cat-face belly patch, cream paw cuffs with blue pads, navy pleated skirt, cream fur-trim blue paw boots. Exactly eight full-body frames in ONE horizontal row at eight equal column centers. Same scale, center and feet baseline. Clear transparent margins. True transparent RGBA background, no floor, shadows, labels, grid lines or extra characters. Action: [下表动作要求]。

- idle: front facing, gentle breathing and natural blink, feet stationary
- walk_left: side view facing screen LEFT, walk cycle alternating foot steps in place, fixed center
- walk_right: side view facing screen RIGHT, walk cycle alternating foot steps in place, fixed center
- sleep: eyes closed, curled up sleeping, gentle breathing, paws tucked next to cheek
- wake: front facing sleepy stretch, open eyes, raise paws, then lower paws
- tea: front facing, hold milk tea cup with paw cuffs, raise cup to sip then lower
- eat_taiyaki: front facing, hold fish-shaped taiyaki pastry, bring to mouth and take bite
- expr_smile: front facing, softly happy smile, gentle blink and breathing
- expr_sad: front facing, mildly sad eyes and mouth, small breathing, no giant tears
- expr_angry: front facing, mildly annoyed puffed cheek, gentle breathing, no symbols
- expr_sleepy: front facing, drowsy half-closed eyes, small yawn
- read: front facing hold small open book with paw cuffs, look down and turn a page
- sing: front facing softly singing with small paw gestures and mouth animation, no floating notes
- eat_rice: front facing holding WHITE RICE bowl and chopsticks, lift rice bite to mouth and lower; paw cuffs stay worn
- headpat: front facing pleased headpat reaction, eyes close and head dips gently then returns to original pose, no external hand
- spin: happy turn in place: front, three-quarter left, left side, back, right side, three-quarter right, front, front; hood and whale tail stay attached

## 检查和接入

部分初稿有白底或宽光晕，已用图像生成工具重做透明背景；吃米饭和蜷睡动作重新生成。图集原件不拉伸，通过 outfit.json 的矩形 grid 参数读取，前端按帧高度保持比例。先运行 check-outfit-pack.mjs 检查，再安装到独立小屋试穿，检查换装、行走和睡眠。矩形帧需要支持 height 与 width 不相等的检查器和加载器。生成图集仍可能存在细微的边缘或帧间差异，格式检查不能替代目视验收。
