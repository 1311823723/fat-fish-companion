# 橙星奶油卫衣制作记录

使用内置 Image Gen 制作；未使用 CLI 或付费 API 备用路径。参考图为用户提供的角色服装设计，保留角色原有署名与非商业限制。

## 固定造型提示

Blue-haired chibi whale girl, blue eyes, whale fin ears, blue whale tail and ahoge. Claude-girl COS: cream hood-down zip hoodie, orange ASTERISK hair clip and sleeve emblems, orange bow, wood-edge badge reading exactly Claude, small tan lion face patch, caramel pleated skirt with white ruffle, cream leg warmers and tan shoes. True transparent RGBA background. No text except Claude badge.

## 图集提示模板

Use reference.png as exact character and costume reference. Eight full-body animation frames in one horizontal row at eight equal-width column centers. Identical scale, foot baseline and center throughout, clear margins, all hair, feet and tails inside each frame. True transparent background, no floor, no shadows, no labels, no grid lines. Action: [替换为下表动作要求]。

- idle: front facing, gentle breathing and a natural blink, stationary
- walk_left: walking to screen LEFT, side view facing left, alternating left and right foot gait, stationary frame centers
- walk_right: walking to screen RIGHT, side view facing right, alternating left and right foot gait, stationary frame centers
- sleep: eyes closed, lying curled up sleeping, small breathing cycle, consistent body dimensions throughout
- wake: front facing, sleepy eyes opening, raising arms stretching then returning arms down
- tea: front facing, holding a small milk tea cup, raise cup to sip then lower, same cup in every frame
- eat_taiyaki: front facing, eating a little fish-shaped taiyaki pastry, bring it to mouth and take a bite
- expr_smile: front facing, smiling, small blink and gentle breathing only
- expr_sad: front facing, mild sad expression, gentle breathing only, no giant tears
- expr_angry: front facing, mildly annoyed puffed cheek expression, gentle breathing only
- expr_sleepy: front facing, drowsy half-closed eyes and tiny yawn, gentle breathing
- read: front facing, holding and reading small open book, looking down and turning one page
- sing: front facing, singing softly, opening and closing mouth rhythmically, small hand movement, no musical notes floating outside character
- eat_rice: front facing holding a small WHITE RICE bowl and chopsticks, lift a bite of rice to mouth and lower
- headpat: front facing, pleased reaction to being patted on head, slightly close eyes and dip head then return to first pose, no external hand
- spin: happy full body turn in place: front, three-quarter left, side left, back, side right, three-quarter right, front, front. Same hairstyle viewed from each angle, whale tail stays attached to lower back

## 接入与检查

图集原文件保持不变，使用矩形 grid 定位帧。根据每帧实际人物边界测量 offsetY 和 height，脚底靠近帧高度的244/256处；检查脚底漂移、透明背景、头发鞋子是否被裁掉、左右列是否串帧。width与height可以不同，前端按height归一化保持长宽比。先运行 check-outfit-pack.mjs，再安装到独立试验小屋试穿。headpat初稿残留白底，已通过图像工具重新移除背景后才入包。生成式图集仍可能存在微小边缘与帧间细节变化。


服装来源：用户提供的 Claude 娘造型；此前的“奶油橙花”是错误的临时命名。角色穿着的是该服装COS，固定ID仍为cream_hoodie，以兼容既有存档。

第二版外观：依据原参考重新生成立绘和全部16项动作，补正星芒发夹、Claude名牌和袖口标识；ID保留不变。由内置 Image Gen 生成，透明背景异常用同一工具清理，再测量帧边界、检查脚底对齐。运行版使用带内容哈希的WebP，预览单独生成，避免旧缓存与新动作混用。
