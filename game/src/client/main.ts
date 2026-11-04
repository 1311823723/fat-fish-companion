import Phaser from "phaser";
import { Room, World } from "./room";
import "./style.css";
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
  generation = 0;
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
  const v = await r.json();
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
        }[w.activity.name as string] || "发呆");
  $("weather").textContent = w.weather.available
    ? w.weather.city + " " + w.weather.label + " " + w.weather.temperature + "℃"
    : "天气暂不可用";
  $("identity").textContent = identity.verified
    ? "已验证QQ"
    : joined
      ? "访客"
      : "做客";
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
  if (name === "walk") {
    void command("activity", { name: "walk" });
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
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, limit: power ? 30 : 60, forceSetTimeOut: false },
  render: { antialias: true, pixelArt: false },
  audio: { noAudio: true },
});
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
  ws.onmessage = () => void sync();
  ws.onclose = () => {
    reconnect = setTimeout(connect, 5000);
  };
  ws.onerror = () => ws?.close();
}
connect();
void sync().then(() => {
  if (world?.entered) void history();
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
  for (const f of world.kitchen.items) {
    const box = element("div", "", "food-slot"),
      img = element("img");
    img.src = "/assets/" + f.id + "-v1.svg";
    img.alt = f.label;
    const n = element("small", "剩 " + f.count + " 份"),
      b = element("button", "放进去");
    b.disabled = world.kitchen.total >= 12;
    b.onclick = async () => {
      if (await command("restock", { item: f.id }, b)) {
        n.textContent =
          "剩 " +
          world.kitchen.items.find((x: any) => x.id === f.id).count +
          " 份";
        count.textContent = "已放 " + world.kitchen.total + " / 12 份";
        if (world.kitchen.total >= 12)
          grid.querySelectorAll("button").forEach((x) => (x.disabled = true));
      }
    };
    box.append(img, element("span", f.label), n, b);
    grid.append(box);
  }
  body.append(
    element(
      "p",
      "今天 " +
        world.feeding.visitors +
        " 位访客放了 " +
        world.feeding.portions +
        " 份",
      "subtle",
    ),
  );
};
$("backpack").onclick = () => {
  if (!world) return;
  open("准备背包");
  body.append(element("p", "最多带三件，食物另从冰箱准备。", "subtle"));
  const inputs: HTMLInputElement[] = [];
  for (const [id, label] of Object.entries(labels)) {
    const line = element("label", "", "pack-item"),
      input = element("input");
    input.type = "checkbox";
    input.value = id;
    input.checked = world.backpack.includes(id);
    inputs.push(input);
    line.append(input, element("span", label));
    body.append(line);
  }
  const b = element("button", "收好背包");
  b.onclick = async () => {
    const items = inputs.filter((x) => x.checked).map((x) => x.value);
    if (items.length > 3) {
      notice("背包最多放三件。");
      return;
    }
    if (await command("backpack_set", { items }, b)) panel.close();
  };
  body.append(b);
};
$("souvenirs").onclick = () => {
  open("带回的小东西");
  if (!world?.souvenirs.length) {
    body.append(element("p", "还没有带回小东西。"));
    return;
  }
  for (const s of [...world.souvenirs].reverse())
    body.append(
      element(
        "p",
        s.label +
          " · " +
          new Date(s.at).toLocaleDateString("zh-CN", {
            timeZone: "Asia/Shanghai",
          }),
      ),
    );
};
$("note")?.addEventListener("click", () => {});
const noteButton = element("button");
noteButton.id = "note";
noteButton.hidden = true;
document.body.append(noteButton);
noteButton.onclick = () => {
  open("桌上的便条");
  body.append(
    element("p", world?.travel.note || "她已经回家啦。", "diary-page"),
  );
};
$("album").onclick = () => {
  open("旅行相册");
  if (!world?.photos.length) {
    body.append(element("p", "还没有旅行照片。"));
    return;
  }
  const grid = element("div", "", "album-grid");
  body.append(grid);
  for (const p of [...world.photos].reverse()) {
    const b = element("button"),
      img = element("img");
    img.src = "/room-photo/" + p.photoId + "/thumb";
    img.alt = p.place;
    img.loading = "lazy";
    b.append(img, element("small", p.place));
    b.onclick = () => {
      open(p.place);
      const large = element("img", "", "photo-large");
      large.src = "/room-photo/" + p.photoId;
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
  const g = open("她的日记");
  if (!identity.canReadDiary) {
    body.append(element("p", "这本日记只给已验证的主人看。"));
    return;
  }
  body.textContent = "翻开日记…";
  try {
    const r = await api("diary-list");
    if (g !== generation) return;
    body.replaceChildren();
    for (const p of r.entries) {
      const b = element("button", p.date + " · " + (p.mood || ""));
      b.onclick = async () => {
        const g2 = open("她的日记");
        try {
          const r = await api("diary-read", { id: p.id });
          if (generation === g2)
            body.append(element("article", r.entry.text, "diary-page"));
        } catch (e) {
          notice((e as Error).message);
        }
      };
      body.append(b);
    }
    if (!r.entries.length) body.textContent = "还没有可翻看的日记。";
  } catch (e) {
    if (g === generation) body.textContent = (e as Error).message;
  }
};
async function identityPanel() {
  open("进屋坐坐");
  const input = element("input");
  input.inputMode = "numeric";
  input.placeholder = "你的 QQ 号";
  input.setAttribute("aria-label", "你的QQ号");
  const enter = element("button", "进入"),
    guest = element("button", "直接做客");
  const status = element("p", "", "subtle");
  enter.onclick = async () => {
    enter.disabled = true;
    try {
      const r = await api("enter", { qq: input.value.trim() });
      identity = r.identity;
      joined = true;
      panel.close();
      await sync();
      await history();
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      enter.disabled = false;
    }
  };
  guest.onclick = () => {
    input.value = "";
    enter.click();
  };
  body.append(input, enter, guest, status);
  if (joined) {
    const verify = element("button", "关联QQ记忆"),
      check = element("button", "检查验证"),
      out = element("button", "退出");
    verify.onclick = async () => {
      try {
        const r = await api("challenge");
        status.textContent =
          "私聊大肥鱼（" +
          String(r.botQQ || "").replace(/^(\d{3})\d+(\d{3})$/, "$1****$2") +
          "）发送：" +
          r.command;
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    };
    check.onclick = async () => {
      try {
        const r = await api("identity");
        identity = r.identity;
        if (identity.verified) {
          panel.close();
          await sync();
          await history();
        } else status.textContent = "还没有收到验证消息。";
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    };
    out.onclick = async () => {
      await api("logout");
      identity = {};
      joined = false;
      $("chatLog").replaceChildren();
      panel.close();
      await sync();
    };
    body.append(verify, check, out);
  }
}
$("identity").onclick = () => void identityPanel();
function bubble(role: string, text: string) {
  $("chatLog").append(element("div", text, "bubble " + role));
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}
async function history() {
  try {
    const r = await api("history");
    identity = r.identity;
    joined = r.entered !== false;
    $("chatLog").replaceChildren();
    for (const m of r.messages) bubble(m.role, m.text);
  } catch {
    joined = false;
  }
}
let chatPending: { text: string; id: string } | null = null;
$<HTMLFormElement>("chatForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!joined) {
    void identityPanel();
    return;
  }
  const input = $<HTMLInputElement>("chatInput"),
    text = input.value.trim();
  if (!text) return;
  const b = $<HTMLButtonElement>("chatSend");
  b.disabled = true;
  const id = chatPending?.text === text ? chatPending.id : newRequestId();
  if (!chatPending || chatPending.id !== id) bubble("user", text);
  chatPending = { text, id };
  try {
    const r = await api("chat", { text, requestId: id });
    bubble("assistant", r.message.text);
    input.value = "";
    chatPending = null;
  } catch (e) {
    notice((e as Error).message);
  } finally {
    b.disabled = false;
  }
};
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
};
