export function departureNote(trip, recent = []) {
  const place = trip.place.label;
  const notes = [
    "出去溜达啦，等我回来",
    "我去转一小圈，回见啦",
    "出门透口气，晚点回来",
    "我先溜啦，回来再聊",
    "走啦，回来带点故事",
    "去看看外面，回头见",
    "出去找点好玩的，很快回",
    "出门啦，给我留盏灯",
    "我去散散步，别担心",
    "去逛逛，回来接着说",
    "出去伸个懒腰，回见",
    "我去晃一会儿，等我哦",
    "先出去转转，晚点见",
    "溜达一下，不走太远",
    "出门看看有没有新鲜事",
    "我去吹吹风，等我回来",
    "去外面发会儿呆，回见",
    "我去" + place + "转转",
    "去" + place + "看看，晚点回",
    "我先去" + place + "溜达啦",
  ];
  const available = notes.filter((x) => !recent.includes(x));
  const pool = available.length ? available : notes;
  return pool[Math.floor(Math.random() * pool.length)];
}
