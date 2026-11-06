import { openDiary } from "./diary";
import { createArcadeUI } from "./arcade";
import Phaser from "phaser";
import { Room, World } from "./room";
import "./style.css";
import "./arcade.css";
const newRequestId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("");
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let world: World = null,
  identity: any = {},
  joined = false,
  syncing = false,
  ws: WebSocket | null = null,
  reconnect: ReturnType<typeof setTimeout>,
  generation = 0,
  entryPrompted = false;
const panel = $<HTMLDialogElement>("panel"),
  body = $("panelBody"),
  notice = (text: string) => {
    $("notice").textContent = text;
  };
const labels: Record<string, string> = {
  camera: "相机",
  umbrella: "雨伞",
  map: "小地图",
  blanket: "小毯子",
};
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) {
  const e = document.createElement(tag);
  e.textContent = text;
  e.className = className;
  return e;
}
function open(title: string) {
  panel.classList.remove("diary-mode", "arcade-mode");
  generation++;
  $("panelTitle").textContent = title;
  body.replaceChildren();
  if (!panel.open) panel.showModal();
  return generation;
}
$("closePanel").onclick = () => panel.close();
panel.addEventListener("close", () => generation++);
async function api(route: string, args: any = {}) {
  const r = await fetch("/api/room-" + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(route === "chat" ? 105000 : 16000),
  });
  let v;
  try {
    v = await r.json();
  } catch {
    throw Error("小屋暂时连不上，请稍后再试");
  }
  if (!r.ok || !v.ok) throw Error(v.error || "连接暂时断开");
  return v;
}
function render(w: World) {
  if (world && w.revision < world.revision) return;
  world = w;
  room.sync(w);
  if (w.identity) identity = w.identity;
  for (const key of ["hunger", "energy", "mood"]) {
    const n = key === "mood" ? w.mood.value : w[key];
    $<HTMLMeterElement>(key).value = n;
    $(key + "Value").textContent = String(n);
  }
  $("place").textContent =
    w.travel.phase === "away"
      ? "出门了 · " + w.travel.destination
      : "在家 · " +
        ({
          sleep: "睡觉",
          walk: "走一走",
          rest: "歇一会儿",
          eat: "吃饭",
          tea: "喝奶茶",
          read: "翻书",
          sing: "哼歌",
        }[w.activity.name as string] || "发呆");
  $("weather").textContent = w.weather.available
    ? w.weather.city + " " + w.weather.label + " " + w.weather.temperature + "℃"
    : "天气暂不可用";
  $("identity").textContent = identity.verified
    ? "已验证QQ"
    : joined
      ? "访客 · 验证QQ"
      : "做客";
  $("notifyChoice").hidden = !(identity.verified && w.travel.phase === "away");
  const souvenir = w.souvenirs?.at(-1), photo = souvenir ? w.photos?.find((p:any)=>p.photoId===souvenir.tripId) : w.photos?.at(-1);
  $("memoryCorner").hidden = !souvenir && !photo;
  $("memoryCornerLabel").textContent = souvenir?.label || "旅行留影";
  const cornerImage = $<HTMLImageElement>("memoryCornerPhoto");
  cornerImage.onerror = () => { cornerImage.hidden = true; };
  cornerImage.hidden = !photo;
  if (photo) {
    const src = `/room-photo/${photo.photoId}/thumb?v=${encodeURIComponent(photo.assetVersion || "original")}`;
    if (cornerImage.getAttribute("src") !== src) cornerImage.src = src;
  }
  $("curtain").setAttribute(
    "aria-pressed",
    String(w.furnishings.curtainClosed),
  );
  $("light").setAttribute("aria-pressed", String(w.furnishings.lightOn));
}
async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    render(await api("state"));
    if (world && !entryPrompted) {
      entryPrompted = true;
      if (!world.entered) void identityPanel();
    }
    $("connection").textContent = ws?.readyState === 1 ? "已同步" : "定时同步";
  } catch {
    $("connection").textContent = "连接中断 · 正在重连";
  } finally {
    syncing = false;
  }
}
const pending = new WeakMap<
  HTMLButtonElement,
  { id: string; payload: string }
>();
async function command(type: string, args: any, button?: HTMLButtonElement) {
  if (!joined) {
    identityPanel();
    notice("先进入小屋，再来互动。");
    return;
  }
  const payload = JSON.stringify({ type, args }),
    old = button && pending.get(button);
  const id = old?.payload === payload ? old.id : newRequestId();
  if (button) {
    pending.set(button, { id, payload });
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    render(await api("action", { command: { type, args, requestId: id } }));
    if (button) pending.delete(button);
    notice("");
    return true;
  } catch (e) {
    notice((e as Error).message + "，可以重试。");
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}
const sceneAction = (name: string) => {
  if (name === "pet_interact") {
    void command("pet_interact", {});
    return;
  }
  if (["walk", "sleep", "wake", "rest"].includes(name)) {
    void command("activity", { name });
    return;
  }
  $(name)?.click();
};
const room = new Room(sceneAction),
  mobile = matchMedia("(max-width:700px)").matches,
  savedPower = localStorage.getItem("powerSave"),
  power = savedPower === null ? mobile : savedPower === "true";
for (const b of document.querySelectorAll<HTMLButtonElement>(
  ".actions button",
)) {
  const name = b.dataset.activity || (b.id === "feed" ? "eat" : "tea"),
    icon = element("img");
  icon.src = "/assets/action-" + name + "-v1.svg";
  icon.alt = "";
  icon.width = 26;
  icon.height = 26;
  b.prepend(icon);
}
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 600,
  height: 800,
  backgroundColor: "#eaddc9",
  scene: room,
  input: { touch: { capture: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, limit: power ? 30 : 60, forceSetTimeOut: false },
  render: { antialias: true, pixelArt: false },
  audio: { noAudio: true },
});
const arcadeUI = createArcadeUI({
  panel,
  body,
  open,
  api,
  enter: () => {
    if (joined) return true;
    void identityPanel();
    notice("先进入小屋，再来玩。");
    return false;
  },
});
$("television").onclick = () => {
  if (world?.travel.phase === "away") {
    notice("肥鱼出门玩啦，等她回来再一起玩。");
    showRoomReply("出门玩啦，回来再一起玩！", 8000);
    return;
  }
  arcadeUI.open();
};
game.events.once("room-ready", () => {
  document.querySelector(".loading")?.remove();
  if (world) room.sync(world);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.loop.sleep();
    ws?.close();
    clearTimeout(reconnect);
  } else {
    game.loop.wake();
    void sync();
    connect();
  }
});
function connect() {
  if (document.hidden || (ws && ws.readyState < 2)) return;
  ws = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      "/api/room-events",
  );
  ws.onmessage = () => {
    void sync();
    arcadeUI.changed();
  };
  ws.onclose = () => {
    reconnect = setTimeout(connect, 5000);
  };
  ws.onerror = () => ws?.close();
}
connect();
void sync().then(() => {
  if (world?.entered) {
    joined = true;
    void history().then(() => render(world));
  } else if (world && !entryPrompted) {
    entryPrompted = true;
    void identityPanel();
  }
});
setInterval(() => {
  if (!document.hidden) void sync();
}, 5000);
const clockTick = () => {
  $("clock").textContent =
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(Date.now() + (world?.serverTime ? room.offset : 0))) +
    " 北京时间";
};
setInterval(clockTick, 1000);
clockTick();
document
  .querySelectorAll<HTMLButtonElement>("[data-activity]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        void command("activity", { name: b.dataset.activity }, b)),
  );
$("tea").onclick = (e) =>
  void command(
    "activity",
    { name: "tea" },
    e.currentTarget as HTMLButtonElement,
  );
$("curtain").onclick = (e) =>
  world &&
  void command(
    "furniture",
    { key: "curtainClosed", value: !world.furnishings.curtainClosed },
    e.currentTarget as HTMLButtonElement,
  );
$("light").onclick = (e) =>
  world &&
  void command(
    "furniture",
    { key: "lightOn", value: !world.furnishings.lightOn },
    e.currentTarget as HTMLButtonElement,
  );
$("fridge").onclick = () => {
  room.toggleFridge();
  $("fridge").setAttribute("aria-expanded", String(room.fridgeOpen));
};
$("feed").onclick = () => {
  if (!world) return;
  open("给她放点吃的");
  const count = element(
      "p",
      "已放 " + world.kitchen.total + " / 12 份",
      "subtle",
    ),
    grid = element("div", "", "food-grid");
  body.append(count, grid);
  body.prepend(element("p", "今日菜单 · " + world.kitchen.menuDay, "subtle"));
  const feedingCount = element("p", "", "subtle");
  const updateFeedingCount = () => {
    feedingCount.textContent = `今天 ${world.feeding.visitors} 位访客放了 ${world.feeding.portions} 份`;
  };
  updateFeedingCount();
  for (const f of world.kitchen.items
    .filter((f: any) => f.availableToday !== false)
    .sort((a: any, b: any) => Number(b.gain === 30) - Number(a.gain === 30))) {
    const box = element("div", "", "food-slot"),
      img = element("img");
    img.src = f.icon || "/assets/" + f.id + "-v1.svg";
    img.alt = f.label;
    const n = element("small", "剩 " + f.count + " 份"),
      b = element("button", "放进去");
    b.disabled = world.kitchen.total >= 12;
    b.onclick = async () => {
      if (
        await command(
          "restock",
          { item: f.id, menuDay: world.kitchen.menuDay },
          b,
        )
      ) {
        n.textContent =
          "剩 " +
          world.kitchen.items.find((x: any) => x.id === f.id).count +
          " 份";
        count.textContent = "已放 " + world.kitchen.total + " / 12 份";
        updateFeedingCount();
        if (world.kitchen.total >= 12)
          grid.querySelectorAll("button").forEach((x) => (x.disabled = true));
      }
    };
    box.append(img, element("span", f.label), n, b);
    grid.append(box);
  }
  body.append(feedingCount);
};
$("backpack").onclick = () => {
  if (!world) return;
  open("准备背包");
  body.append(element("p", "最多带三件，食物另从冰箱准备。", "subtle"));
  const inputs: HTMLInputElement[] = [];
  const packing = world.packing;
  if (packing)
    body.append(element("p", "今日随身小物 · " + packing.day, "subtle"));
  const packGrid = element("div", "", "pack-grid");
  body.append(packGrid);
  for (const item of (
    packing?.items ||
    Object.entries(labels).map(([id, label]) => ({
      id,
      label,
      availableToday: true,
      packed: false,
    }))
  ).filter((x: any) => x.availableToday || x.packed)) {
    const { id, label } = item;
    const line = element("label", "", "pack-item"),
      input = element("input");
    input.type = "checkbox";
    input.value = id;
    input.checked = world.backpack.includes(id);
    inputs.push(input);
    if (item.icon) {
      const img = element("img");
      img.src = item.icon;
      img.alt = "";
      img.width = 64;
      img.height = 64;
      line.append(img);
    }
    line.append(
      input,
      element("span", label),
      ...(!item.availableToday ? [element("small", "已收好")] : []),
    );
    packGrid.append(line);
  }
  const b = element("button", "收好背包");
  b.onclick = async () => {
    const items = inputs.filter((x) => x.checked).map((x) => x.value);
    if (items.length > 3) {
      notice("背包最多放三件。");
      return;
    }
    if (
      await command("backpack_set", { items, menuDay: world.packing?.day }, b)
    )
      panel.close();
  };
  body.append(b);
};
$("souvenirs").onclick = () => {
  open("带回的小东西");
  if (!world?.souvenirs.length) {
    body.append(element("p", "还没有带回小东西。"));
    return;
  }
  for (const s of [...world.souvenirs].reverse()) {
    const card = element("article", "", "message-entry"), photo=world.photos?.find((p:any)=>p.photoId===s.tripId);
    card.append(element("p", s.label), element("small", (s.place ? s.place+" · " : "")+new Date(s.at).toLocaleDateString("zh-CN", {timeZone:"Asia/Shanghai"}), "subtle"));
    if (photo) { const image=element("img"); image.src=`/room-photo/${photo.photoId}/thumb?v=${encodeURIComponent(photo.assetVersion||"original")}`; image.alt="旅行照片"; image.loading="lazy"; image.className="souvenir-photo"; image.onerror=()=>{image.hidden=true;}; card.append(image,element("p",photo.caption||"")); }
    body.append(card);
  }
};
$("memoryCorner").onclick = () => {
  if (world?.souvenirs?.length) $("souvenirs").click(); else $("album").click();
};
$("note")?.addEventListener("click", () => {});
const noteButton = element("button");
noteButton.id = "note";
noteButton.hidden = true;
document.body.append(noteButton);
noteButton.onclick = () => {
  open("桌上的便条");
  const paper = element("article", "", "travel-note-paper");
  paper.append(
    element("p", world?.travel.note || "她已经回家啦。", "travel-note-body"),
    element("div", "— 大肥鱼", "travel-note-sign"),
  );
  body.append(paper);
};
$("album").onclick = () => {
  open("旅行相册");
  if (world?.drawing?.verificationRequired)
    body.append(
      element(
        "p",
        "GPT额度等待恢复，豆包需要完成网页验证。照片记录已保留。",
        "subtle",
      ),
    );
  else if (world?.drawing?.fallbackProvider === "doubao")
    body.append(
      element("p", "GPT额度等待恢复，这段时间由豆包补拍照片。", "subtle"),
    );
  else if (world?.drawing?.waiting)
    body.append(
      element(
        "p",
        "照片还在等生图额度恢复，预计 " +
          new Date(world.drawing.retryAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }) +
          " 后补试。旅行和拍照记录都已保留。",
        "subtle",
      ),
    );
  if (!world?.photos.length) {
    body.append(element("p", "还没有旅行照片。"));
    return;
  }
  const grid = element("div", "", "album-grid");
  body.append(grid);
  for (const p of [...world.photos].reverse()) {
    const b = element("button"),
      img = element("img");
    img.src =
      "/room-photo/" +
      p.photoId +
      "/thumb?v=" +
      encodeURIComponent(p.assetVersion || "original");
    img.alt = p.place;
    img.loading = "lazy";
    b.append(img, element("small", p.place));
    b.onclick = () => {
      open(p.place);
      const large = element("img", "", "photo-large");
      large.src =
        "/room-photo/" +
        p.photoId +
        "?v=" +
        encodeURIComponent(p.assetVersion || "original");
      large.alt = p.place;
      body.append(
        large,
        element(
          "p",
          new Date(p.capturedAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          }),
          "subtle",
        ),
        element("p", p.caption || ""),
      );
    };
    grid.append(b);
  }
};
$("diary").onclick = async () => {
  const g = open("肥鱼的日记 ✿");
  await openDiary({
    panel,
    body,
    api,
    canRead: !!identity.canReadDiary,
    isCurrent: () => g === generation && panel.open,
  });
};
async function copyVerification(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  const area = element("textarea");
  area.value = text;
  area.className = "copy-fallback";
  body.append(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw Error("请长按验证语句复制");
}
async function identityPanel() {
  const g = open(identity.verified ? "已关联QQ" : "进屋坐坐");
  if (identity.verified) {
    body.append(element("p", "QQ记忆已关联。", "subtle"));
    const out = element("button", "退出当前身份");
    out.onclick = async () => {
      try {
        await api("logout");
        identity = {};
        joined = false;
        $("chatLog").replaceChildren();
        await sync();
        void identityPanel();
      } catch (e) {
        notice((e as Error).message);
      }
    };
    body.append(out);
    return;
  }
  const choices = element("div", "", "entry-choices"),
    register = element("button", "登记QQ进入", "entry-primary"),
    verify = element("button", "QQ验证", "entry-primary"),
    guest = element("button", "访客进入");
  choices.append(register, verify, guest);
  body.append(
    element("p", "登记QQ可记录来访；验证后才能关联QQ的私人记忆。", "subtle"),
    choices,
  );
  const form = element("form", "", "verify-form"),
    input = element("input");
  form.hidden = true;
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.placeholder = "输入你的 QQ 号";
  input.setAttribute("aria-label", "你的QQ号");
  input.pattern = "[1-9][0-9]{4,11}";
  input.required = true;
  const enter = element("button", "获取验证语句");
  let registerOnly = false;
  enter.type = "submit";
  form.append(input, enter);
  const status = element("p", "", "subtle");
  status.setAttribute("role", "status");
  const instructions = element("div", "", "verification-result");
  instructions.hidden = true;
  body.append(form, instructions, status);
  verify.onclick = () => {
    registerOnly = false;
    enter.textContent = "获取验证语句";
    form.hidden = false;
    verify.setAttribute("aria-pressed", "true");
    input.focus();
  };
  register.onclick = () => {
    registerOnly = true;
    enter.textContent = "登记并进入";
    form.hidden = false;
    register.setAttribute("aria-pressed", "true");
    input.focus();
  };
  guest.onclick = async () => {
    guest.disabled = true;
    try {
      const r = await api("enter", { qq: "" });
      if (g !== generation) return;
      identity = r.identity;
      joined = true;
      panel.close();
      await sync();
      await history();
      render(world);
    } catch (e) {
      if (g === generation) status.textContent = (e as Error).message;
    } finally {
      guest.disabled = false;
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    enter.disabled = true;
    status.textContent = "正在准备验证…";
    try {
      const r = await api("enter", { qq: input.value.trim() });
      if (g !== generation) return;
      identity = r.identity;
      joined = true;
      if (registerOnly) {
        panel.close();
        await sync();
        await history();
        render(world);
        notice("已登记来访；QQ私人记忆仍需验证。 ");
        return;
      }
      const challenge = await api("challenge");
      if (g !== generation) return;
      instructions.replaceChildren();
      instructions.hidden = false;
      const masked = String(challenge.botQQ || "").replace(
        /^(\d{3})\d+(\d{3})$/,
        "$1****$2",
      );
      const command = element("pre", challenge.command, "verification-command");
      const copy = element("button", "一键复制验证语句"),
        check = element("button", "我已发送，检查验证");
      copy.type = check.type = "button";
      copy.onclick = async () => {
        try {
          await copyVerification(challenge.command);
          copy.textContent = "已复制";
        } catch (e) {
          status.textContent = (e as Error).message;
        }
      };
      check.onclick = async () => {
        check.disabled = true;
        try {
          const result = await api("identity");
          if (g !== generation) return;
          identity = result.identity;
          if (identity.verified) {
            panel.close();
            await sync();
            await history();
            render(world);
            notice("QQ记忆已关联。");
          } else status.textContent = "还没有收到验证消息，请发送后再检查。";
        } catch (e) {
          if (g === generation) status.textContent = (e as Error).message;
        } finally {
          check.disabled = false;
        }
      };
      instructions.append(
        element(
          "p",
          "私聊大肥鱼" +
            (masked ? "（" + masked + "）" : "") +
            "，发送下面这句话：",
        ),
        command,
        copy,
        check,
      );
      status.textContent = "验证成功后，才会关联这个QQ号的记忆。";
    } catch (e) {
      if (g === generation) status.textContent = (e as Error).message;
    } finally {
      enter.disabled = false;
    }
  };
}
$("identity").onclick = () => void identityPanel();
$("messageBoard").onclick = async () => {
  if (!joined) { void identityPanel(); return; }
  const g = open("我的留言");
  const draw = async () => {
    const data = await api("messages");
    if (g !== generation) return;
    body.replaceChildren();
    if (!data.entries.length) body.append(element("p", "还没有留过言。", "subtle"));
    for (const item of data.entries) {
      const card=element("article", "", "message-entry");
      const status: Record<string,string> = {pending:"等她回家",working:"她正在读",done:"已回复",failed:"回复失败",uncertain:"回复状态待确认"};
      card.append(element("small", `${new Date(item.at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})} · ${status[item.status] || "处理中"}`, "subtle"), element("p",item.text));
      if (item.answer) card.append(element("p", "肥鱼：" + item.answer));
      if (item.status === "failed") {
        const retry=element("button","再试一次");
        retry.onclick=async()=>{retry.disabled=true;try{await api("messages",{retryId:item.id});await draw();}catch(e){notice((e as Error).message);retry.disabled=false;}};
        card.append(retry);
      }
      if (item.status === "uncertain") card.append(element("small", "回复可能已经送达，请先查看聊天记录。", "subtle"));
      body.append(card);
    }
  };
  try { await draw(); } catch(e) { if(g===generation) body.replaceChildren(element("p",(e as Error).message,"subtle")); }
};
function bubble(role: string, text: string) {
  $("chatLog").append(element("div", text, "bubble " + role));
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}
let hasQueuedMessages = false;
let lastHistoryAnswer = "";
let historyRefreshing = false;
async function history() {
  try {
    const r = await api("history");
    identity = r.identity;
    joined = r.entered !== false;
    $("chatLog").replaceChildren();
    const latestAnswer = [...r.messages].reverse().find((m: any) => m.role === "assistant");
    if (hasQueuedMessages && latestAnswer?.id && latestAnswer.id !== lastHistoryAnswer) showRoomReply(latestAnswer.text, 20000);
    lastHistoryAnswer = latestAnswer?.id || "";
    hasQueuedMessages = r.messages.some((m: any) => m.pending === "pending" || m.pending === "working");
    for (const m of r.messages) bubble(m.role, m.text + (m.pending === "pending" || m.pending === "working" ? "（留言，等她回来）" : m.pending === "uncertain" ? "（暂未确认回复，请稍后查看）" : ""));
  } catch {
    joined = false;
  }
}
setInterval(() => {
  if (!document.hidden && joined && hasQueuedMessages && world?.travel.phase !== "away" && !historyRefreshing) {
    historyRefreshing = true;
    void history().finally(() => { historyRefreshing = false; });
  }
}, 6000);
let chatPending: { text: string; id: string } | null = null;
let chatBusy = false;
let replyTimer: ReturnType<typeof setTimeout> | undefined;
const roomReply = $("roomReply");
function positionReply() {
  if (roomReply.hidden) return;
  const gameBox = $("game");
  const bounds = room.pet?.visible ? room.pet.getBounds() : null;
  const x = bounds ? (bounds.centerX / 600) * gameBox.clientWidth : gameBox.clientWidth / 2;
  const y = bounds ? (bounds.top / 800) * gameBox.clientHeight - 8 : gameBox.clientHeight * 0.2;
  const half = roomReply.offsetWidth / 2 + 8;
  roomReply.style.left = `${Math.max(half, Math.min(gameBox.clientWidth - half, x))}px`;
  roomReply.style.top = `${Math.max(roomReply.offsetHeight + 8, y)}px`;
  requestAnimationFrame(positionReply);
}
function showRoomReply(text: string, duration = 0) {
  clearTimeout(replyTimer);
  const wasHidden = roomReply.hidden;
  roomReply.textContent = text;
  roomReply.hidden = false;
  if (wasHidden) requestAnimationFrame(positionReply);
  if (duration) replyTimer = setTimeout(() => { roomReply.hidden = true; }, duration);
}
async function sendChat(input: HTMLInputElement) {
  if (chatBusy) return;
  if (!joined) {
    void identityPanel();
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  chatBusy = true;
  const buttons = [$<HTMLButtonElement>("chatSend"), $<HTMLButtonElement>("quickChatSend")];
  buttons.forEach((b) => { b.disabled = true; });
  const id = chatPending?.text === text ? chatPending.id : newRequestId();
  if (!chatPending || chatPending.id !== id) bubble("user", text);
  chatPending = { text, id };
  showRoomReply(world?.travel.phase === "away" ? "正在放好留言…" : "让我想想…");
  try {
    const r = await api("chat", { text, requestId: id, notifyMe: !!identity.verified && !$<HTMLElement>("notifyChoice").hidden && $<HTMLInputElement>("notifyMe").checked });
    if (r.queued) {
      hasQueuedMessages = true;
      showRoomReply("留言放好了，等肥鱼回来再回复。", 10000);
      void history();
    } else {
      bubble("assistant", r.message.text);
      lastHistoryAnswer = r.message.id || lastHistoryAnswer;
      showRoomReply(r.message.text, Math.max(12000, Math.min(45000, r.message.text.length * 500)));
    }
    if (input.value.trim() === text) input.value = "";
    chatPending = null;
  } catch (e) {
    notice((e as Error).message);
    showRoomReply("刚才没听清，再发一次试试？", 10000);
  } finally {
    chatBusy = false;
    buttons.forEach((b) => { b.disabled = false; });
  }
}
for (const [form, input] of [["chatForm", "chatInput"], ["quickChatForm", "quickChatInput"]]) {
  $<HTMLFormElement>(form).onsubmit = (e) => { e.preventDefault(); void sendChat($<HTMLInputElement>(input)); };
}
$("settings").onclick = () => {
  open("小屋设置");
  const line = element("label", "", "settings-row"),
    input = element("input");
  input.type = "checkbox";
  input.checked =
    localStorage.getItem("powerSave") === null
      ? mobile
      : localStorage.getItem("powerSave") === "true";
  input.onchange = () => {
    localStorage.setItem("powerSave", String(input.checked));
    game.loop.setFPSLimit(input.checked ? 30 : 60);
  };
  line.append(input, element("span", "30 FPS 节能模式"));
  body.append(line);
  if (identity.canReadDiary) {
    const visitButton = element("button", "来访记录");
    visitButton.onclick = async () => {
      const g = open("来访记录");
      body.append(element("p", "正在翻找…", "subtle"));
      try {
        const data = await api("visits");
        if (g !== generation) return;
        body.replaceChildren(element("p", `今天 ${data.total} 次来访，其中 ${data.guests} 次访客`, "subtle"));
        const list = element("div", "", "visit-list");
        for (const visit of data.records) {
          const time = new Date(visit.at).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai",hour12:false});
          list.append(element("p", `${time} · ${visit.qq ? `QQ ${visit.qq}${visit.verified ? "（已验证）" : "（自填，未验证）"}` : "访客"}`));
        }
        if (!data.records.length) list.append(element("p", "还没有来访记录。", "subtle"));
        body.append(list);
      } catch (e) { if (g === generation) body.replaceChildren(element("p", (e as Error).message, "subtle")); }
    };
    body.append(visitButton);
  }
};
