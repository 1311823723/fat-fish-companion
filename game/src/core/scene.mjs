import { createHash } from "node:crypto";
export const phaseAt = (at) => {
  const h = new Date(at + 28800000).getUTCHours();
  return h < 5 || h >= 19
    ? "night"
    : h < 7
      ? "dawn"
      : h < 11
        ? "morning"
        : h < 17
          ? "day"
          : "sunset";
};
const lighting = {
  night:
    "night after dark, dark sky, warm street lamps; NO daylight or sunlight",
  dawn: "blue and pink dawn before sunrise",
  morning: "soft morning light",
  day: "natural daytime light",
  sunset: "orange sunset, low sun",
};
const actions = {
  walk: ["walking slowly", "one foot forward", "wide environmental view"],
  observe: [
    "observing the scenery",
    "looking sideways, hands relaxed",
    "three-quarter view",
  ],
  rest: ["resting on a bench", "sitting with relaxed shoulders", "medium view"],
  map: [
    "reading a map",
    "standing, holding a small folded map",
    "over-the-shoulder view",
  ],
  souvenir: [
    "choosing a small souvenir in a shop",
    "leaning toward the display",
    "close environmental portrait",
  ],
  eat: [
    "eating a packed meal at a sheltered table",
    "sitting, holding the lunchbox",
    "table-level view",
  ],
  umbrella: [
    "walking under an OPEN umbrella",
    "holding umbrella ABOVE her head",
    "full body view",
  ],
  shelter: [
    "waiting for rain to pass under a roof",
    "standing safely inside a pavilion or shop",
    "view from inside the shelter",
  ],
};
export function freezeScene(
  trip,
  weather,
  recent = [],
  capturedAt = Date.now(),
  forced,
) {
  const valid =
    weather?.available &&
    !weather.stale &&
    (!weather.updatedAt || Date.now() - weather.updatedAt <= 6 * 3600000) &&
    trip.place?.local !== false;
  const wet = valid && ["rain", "snow", "thunder"].includes(weather.kind);
  let choices = wet
    ? trip.backpack?.includes("umbrella")
      ? ["umbrella", "shelter"]
      : ["shelter"]
    : [
        "walk",
        "observe",
        "rest",
        "map",
        "souvenir",
        ...(trip.food?.id && trip.food.id !== "none" ? ["eat"] : []),
      ];
  if (!valid) choices = ["souvenir", "rest"];
  choices = choices.filter(
    (x) => x !== "map" || trip.backpack?.includes("map"),
  );
  const used = new Set(recent.slice(-5).map((x) => x.combination));
  const seed = parseInt(
    createHash("sha256").update(String(trip.id)).digest("hex").slice(0, 8),
    16,
  );
  const rotated = choices.map((_, i) => choices[(i + seed) % choices.length]);
  const activity =
    forced && actions[forced]
      ? forced
      : rotated.find(
          (x) => !used.has(x + "|" + actions[x].slice(1).join("|")),
        ) || rotated[0];
  const [description, pose, composition] = actions[activity];
  return {
    id: trip.id + ":photo",
    capturedAt,
    place: trip.place,
    weather: valid ? { kind: weather.kind, label: weather.label } : null,
    phase: phaseAt(capturedAt),
    intent: trip.intent,
    activity,
    description,
    pose,
    expression: "relaxed and curious",
    props: trip.backpack || [],
    composition,
    referenceVersion: "original-v1",
    combination: activity + "|" + [pose, composition].join("|"),
  };
}
export function imagePrompt(scene) {
  const weather = scene.weather
    ? "Weather: " + scene.weather.kind + "."
    : "Weather unknown: sheltered indoor or covered scene, no claims about outdoor weather.";
  return [
    "请直接调用图像生成功能，编辑所附参考图并输出一张新的图片，不要只写描述、不要询问确认。Use the attached reference as the ONLY character identity. Same blue-haired chibi whale maid, blue eyes, ahoge, fin ornaments, bows, white whale apron, blue whale tail; identical outfit and proportions. No costume changes.",
    "Warm hand-painted storybook travel photograph. Location: " +
      scene.place.scene +
      ".",
    "Capture time: " +
      new Date(scene.capturedAt).toISOString() +
      ", Beijing phase: " +
      scene.phase +
      ". Mandatory lighting: " +
      lighting[scene.phase] +
      ". " +
      weather,
    "Her own wish: " +
      scene.intent?.reason +
      ". Activity: " +
      scene.description +
      ". Pose: " +
      scene.pose +
      ". Expression: " +
      scene.expression +
      ". Composition: " +
      scene.composition +
      ".",
    scene.activity === "eat"
      ? "Lunchbox open on table ONLY while eating."
      : "Any packed food stays INSIDE the backpack, NO lunchbox in hands.",
    scene.activity === "umbrella"
      ? "Open umbrella above her head, sheltering her from rain."
      : scene.activity === "shelter"
        ? "She remains DRY under a substantial roof; visible rain OUTSIDE, no exposed walking in rain."
        : "Use only props required by the activity.",
    "Do NOT copy the reference pose. For full body or wide compositions, show her entire body and keep her under half of the image height; let the place fill the remaining scene. " +
      "No text, watermark, collage, extra characters or contradictory daylight at night. Preserve her identity; vary natural gestures.",
  ].join("\n");
}
