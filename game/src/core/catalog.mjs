import { createHash } from "node:crypto";

export const MENU = [
  ["tomato", "番茄炒蛋", 30],
  ["wings", "可乐鸡翅", 30],
  ["pork", "小酥肉", 30],
  ["soup", "紫菜蛋花汤", 10],
  ["milk_tea", "奶茶", 5],
  ["lemon", "柠檬水", 0],
  ["omelet_rice", "蛋包饭", 30],
  ["curry_rice", "咖喱鸡饭", 30],
  ["noodles", "番茄牛肉面", 30],
  ["buns", "鲜肉小笼包", 30],
  ["fried_rice", "扬州炒饭", 30],
  ["rice_ball", "海苔饭团", 30],
  ["corn_soup", "玉米浓汤", 10],
  ["hot_cocoa", "热可可", 5],
  ["orange_juice", "橙汁", 3],
  ["yogurt", "草莓酸奶", 5],
];
export const GEAR = [
  ["camera", "相机"],
  ["umbrella", "雨伞"],
  ["map", "小地图"],
  ["blanket", "小毯子"],
  ["water_bottle", "小水壶"],
  ["notebook", "随手本"],
  ["binoculars", "望远镜"],
  ["flashlight", "小手电"],
  ["lucky_charm", "鲸鱼挂件"],
];
export const PACK = GEAR.map(([id]) => id);
export const beijingDay = (now) =>
  new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const order = (list, salt) =>
  [...list].sort((a, b) =>
    createHash("sha256")
      .update(salt + a)
      .digest("hex")
      .localeCompare(
        createHash("sha256")
          .update(salt + b)
          .digest("hex"),
      ),
  );
function rotate(list, count, dayNumber, salt) {
  const pool = order(list, salt);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let step = count;
  while (gcd(step, pool.length) !== 1) step++;
  const start =
    (((dayNumber * step) % pool.length) + pool.length) % pool.length;
  return Array.from(
    { length: count },
    (_, i) => pool[(start + i) % pool.length],
  );
}
export function dailySupply(now) {
  const dayNumber = Math.floor((now + 8 * 3600000) / 86400000);
  return {
    day: beijingDay(now),
    food: [
      ...rotate(
        MENU.filter((x) => x[2] === 30).map((x) => x[0]),
        4,
        dayNumber,
        "mains-v2:",
      ),
      ...rotate(
        MENU.filter((x) => x[2] !== 30).map((x) => x[0]),
        2,
        dayNumber,
        "drinks-v2:",
      ),
    ],
    gear: [
      "camera",
      "umbrella",
      "map",
      ...rotate(
        PACK.filter((id) => !["camera", "umbrella", "map"].includes(id)),
        3,
        dayNumber,
        "gear-v2:",
      ),
    ],
  };
}
