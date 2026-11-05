import { createHash } from "node:crypto";

const notes = {
  walk: [
    "这段路走得很慢。没有赶时间。",
    "走走停停，倒也没觉得无聊。",
    "没急着走完，慢慢晃了一会儿。",
    "这会儿只想散散步，别的晚点再想。",
    "走到这里，脚步就慢下来了。",
  ],
  observe: [
    "在这里看了好一会儿，没怎么说话。",
    "本来只想看一眼，结果又站了一会儿。",
    "没做什么，就这样看着。",
    "这一会儿的风景，想留一页给它。",
    "不急着往前了，先看看这里。",
  ],
  rest: [
    "坐下来才发现，歇着也挺好。",
    "在这里歇了会儿。先不赶路。",
    "肩膀松下来一点了，再坐一会儿吧。",
    "这一页留给歇脚的我。",
    "没什么特别的安排，坐一会儿也算。",
  ],
  map: [
    "摊开地图，认真看了看下一段路。",
    "下一段怎么走，得先看清楚。",
    "地图展开的时候，路也变得具体了一点。",
    "这一站先记下，下一站慢慢找。",
    "看地图的这一会儿，也留在相册里。",
  ],
  souvenir: [
    "在小物件前停了一会儿。看看也好。",
    "这些小东西，值得凑近一点看。",
    "挑东西比想的还花时间。倒也不着急。",
    "在这里看了又看，没急着决定。",
    "这一页是挑小东西时的我。",
  ],
  eat: [
    "先坐下来吃饭。路等会儿再走。",
    "饭盒打开了。先好好吃这顿饭。",
    "这一站，认真吃了点东西。",
    "走了路再坐下来吃饭，挺踏实的。",
    "把饭吃好，再慢慢逛。",
  ],
  umbrella: [
    "伞撑开了，脚步也放慢一点。",
    "在伞下面走了一段，没赶路。",
    "这一页，连伞一起收进来。",
    "撑着伞也可以慢慢走。",
    "伞下这一小段路，也记住了。",
  ],
  shelter: [
    "先在屋檐下等一会儿，赶路不急。",
    "躲到遮雨的地方了。等一等也没关系。",
    "这一站停在了屋檐里面。",
    "没往外跑，在遮蔽处歇了会儿。",
    "在这里躲了会儿雨，把赶路的事先放下。",
  ],
};

export function albumCaption(scene = {}, place = "", key = "") {
  const choices = notes[scene?.activity] || [
    "把这一刻留在这里。",
    "这一页，留给路上的片刻。",
    "路上的一小段，先夹在这里。",
  ];
  const seed = createHash("sha256")
    .update(String(key || scene?.id || `${place}:${scene?.capturedAt || ""}`))
    .digest()
    .readUInt32BE(0);
  const line = choices[seed % choices.length];
  // Only use the lighting frozen with this photograph, never the generation time.
  const detail =
    scene?.activity === "shelter" || scene?.activity === "umbrella"
      ? ""
      : {
          night: "天已经黑了。",
          dawn: "天刚蒙蒙亮。",
          morning: "是早上的一小段时间。",
          sunset: "已经是傍晚了。",
        }[scene?.phase] || "";
  return line + detail;
}

export function displayCaption(caption, place, scene = {}, key = "") {
  const text = String(caption || "").trim();
  const boilerplate =
    /想象|虚拟|AI生成|人工智能|生成的插画|旅行插画|给你看看照片|拍照给你看|拍了?照给你看/.test(
      text,
    );
  return !text || boilerplate
    ? albumCaption(scene, place, key)
    : Array.from(text).slice(0, 200).join("");
}
