import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Store } from "../src/core/store.mjs";
import { initial, MENU } from "../src/core/world.mjs";
import { freezeScene } from "../src/core/scene.mjs";
import { ROOT } from "../src/config.mjs";
export function convert(old, now = Date.now()) {
  const w = initial(now);
  w.stock = { ...w.stock, ...old.kitchen?.stock };
  if (!old.kitchen?.stock) {
    w.stock.tomato = Number(old.kitchen?.rice) || 0;
    w.stock.milk_tea = Number(old.kitchen?.tea) || 0;
  }
  if (
    Object.keys(w.stock).some((id) => !MENU.some((x) => x[0] === id)) ||
    Object.values(w.stock).some((n) => !Number.isInteger(n) || n < 0) ||
    Object.values(w.stock).reduce((a, b) => a + b, 0) > 12
  )
    throw Error("旧库存需要人工核对，迁移已停止，未删减");
  w.furnishings = { ...w.furnishings, ...old.furnishings };
  w.lastMealAt = old.kitchen?.lastMealAt || now;
  w.activity =
    old.activity?.until > now ? { ...old.activity, manual: true } : w.activity;
  w.backpack =
    old.travel?.backpack
      ?.filter((x) => ["camera", "map", "umbrella", "blanket"].includes(x))
      .slice(0, 3) || w.backpack;
  w.souvenirs = old.travel?.souvenirs || [];
  w.travel = {
    ...w.travel,
    ...old.travel,
    lastReturnedAt: old.travel?.lastReturned?.returnedAt || 0,
    pending: old.travel?.pending || [],
    history: old.travel?.history || [],
  };
  for (const t of [w.travel.current, ...w.travel.pending].filter(Boolean)) {
    t.intent ??= {
      reason: "接着之前已经决定的行程",
      wish: t.place?.detail || "慢慢逛逛",
    };
    t.backpack ??= w.backpack;
    if (t !== w.travel.current)
      t.photoScene ??= freezeScene(
        t,
        null,
        [],
        Math.min(t.returnAt || now, now),
      );
    if (t.place) t.place.local = false;
  }
  const photos = new Map();
  for (const t of [
    ...w.travel.history,
    ...w.travel.pending,
    w.travel.current,
  ].filter(Boolean)) {
    const id = t.photoId || (t.photo?.status === "ready" && t.photo.id);
    if (id && /^[a-f0-9-]{36}$/.test(id))
      photos.set(id, {
        photoId: id,
        place: typeof t.place === "string" ? t.place : t.place?.label || "",
        capturedAt:
          t.photoScene?.capturedAt || t.returnedAt || t.returnAt || now,
        caption: t.caption || "",
        legacy: true,
      });
  }
  w.photos = [...photos.values()];
  w.feeding = (old.feedingEvents || []).map((x, i) => ({
    id: "legacy:" + i,
    at: x.at,
    item: x.item,
    actor: {
      type: x.type,
      ...(x.type === "verified"
        ? { qq: x.qq }
        : { visitor: x.visitor || crypto.randomUUID() }),
    },
  }));
  return {
    world: w,
    counts: {
      inventory: Object.values(w.stock).reduce((a, b) => a + b, 0),
      trips:
        w.travel.history.length +
        w.travel.pending.length +
        (w.travel.current ? 1 : 0),
      photos: w.photos.length,
      souvenirs: w.souvenirs.length,
      identities: Object.keys(old.visitors || {}).length,
      historyThreads: Object.keys(old.histories || {}).length,
      feeding: w.feeding.length,
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.join(ROOT, "scripts/migrate.mjs")
) {
  const args = process.argv.slice(2),
    source = args[args.indexOf("--source") + 1];
  if (!args.includes("--source") || !source)
    throw Error("使用 --source 旧项目路径 [--apply]");
  const raw = fs.readFileSync(path.join(source, "state/room-web.json"), "utf8"),
    { world, counts } = convert(JSON.parse(raw));
  if (!args.includes("--apply")) {
    console.log(
      JSON.stringify({
        dryRun: true,
        counts,
        privateMemoryRetainedInOriginal: true,
      }),
    );
  } else {
    const target = args.includes("--db")
      ? path.resolve(args[args.indexOf("--db") + 1])
      : path.join(ROOT, "state/world.db");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) throw Error("目标数据库已存在，拒绝覆盖");
    const backup = path.join(
      ROOT,
      "state/backups",
      "before-migration-" + Date.now(),
    );
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(path.join(backup, "room-web.json"), raw, { mode: 0o600 });
    const s = new Store(target);
    s.db
      .prepare("UPDATE world SET json=? WHERE id=1")
      .run(JSON.stringify(world));
    s.db
      .prepare("INSERT INTO meta VALUES(?,?)")
      .run(
        "migration",
        JSON.stringify({
          at: Date.now(),
          counts,
          sourceHash: crypto.createHash("sha256").update(raw).digest("hex"),
        }),
      );
    for (const t of world.travel.pending)
      if (t.photo?.status !== "ready")
        s.enqueue("photo:" + t.id, "photo", { tripId: t.id });
    s.close();
    for (const p of world.photos) {
      const original = path.join(
        source,
        "state/travel-photos",
        p.photoId + ".img",
      );
      if (!fs.existsSync(original)) throw Error("旧照片原件缺失，禁止切换");
      const dir = path.join(ROOT, "state/photos");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(original, path.join(dir, p.photoId + ".img"));
      const sharp = (await import("sharp")).default;
      await sharp(original)
        .resize(480, 480, { fit: "inside" })
        .webp({ quality: 80 })
        .toFile(path.join(dir, p.photoId + ".thumb.webp"));
    }
    console.log(
      JSON.stringify({
        migrated: true,
        counts,
        privateMemoryRetainedInOriginal: true,
      }),
    );
  }
}
