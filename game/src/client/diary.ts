export async function openDiary({
  panel,
  body,
  api,
  canRead,
  isCurrent,
}: {
  panel: HTMLDialogElement;
  body: HTMLElement;
  api: (route: string, args?: any) => Promise<any>;
  canRead: boolean;
  isCurrent: () => boolean;
}) {
  panel.classList.add("diary-mode");
  const el = (tag: string, text = "", cls = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = cls;
    return e;
  };
  const paper = el("section", "", "diary-paper"),
    rings = el("span", "", "diary-rings");
  rings.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i++) rings.append(el("i"));
  const meta = el("div", "", "diary-page-meta"),
    date = el("time"),
    mood = el("span", "", "diary-mood");
  meta.append(date, mood);
  const copy = el("article", "", "diary-copy"),
    nav = el("nav", "", "diary-navigation"),
    prev = el("button", "← 上一页") as HTMLButtonElement,
    next = el("button", "下一页 →") as HTMLButtonElement,
    count = el("span", "", "diary-count");
  nav.setAttribute("aria-label", "日记翻页");
  nav.append(prev, count, next);
  paper.append(rings, meta, copy, nav, el("div", "✧  ·  ✧", "diary-footer"));
  body.replaceChildren(paper);
  let entries: any[] = [],
    entryIndex = 0,
    pageIndex = 0,
    pages: string[] = [""],
    busy = false,
    nextCursor: string | null = null,
    loadError = "",
    allText = "",
    lastSize = "";
  const cache = new Map<string, any>();
  const update = () => {
    copy.textContent = pages[pageIndex] || "";
    count.textContent = loadError || (entries.length
      ? entryIndex +
        1 +
        " / " +
        entries.length + (nextCursor ? "+" : "") +
        (pages.length > 1 ? " · " + (pageIndex + 1) + "/" + pages.length : "")
      : "");
    count.setAttribute(
      "aria-label",
      "第" +
        (entryIndex + 1) +
        "篇，第" +
        (pageIndex + 1) +
        "页，共" +
        pages.length +
        "页",
    );
    prev.disabled = busy || (entryIndex === 0 && pageIndex === 0);
    next.disabled =
      busy ||
      (entryIndex === entries.length - 1 && pageIndex === pages.length - 1 && !nextCursor) ||
      !entries.length;
  };
  const paginate = (text: string) => {
    const chars = Array.from(text);
    if (!chars.length) return [""];
    const result: string[] = [];
    let from = 0;
    while (from < chars.length) {
      let lo = 1,
        hi = chars.length - from,
        best = 0;
      while (lo <= hi) {
        const n = (lo + hi) >> 1;
        copy.textContent = chars.slice(from, from + n).join("");
        if (copy.scrollHeight <= copy.clientHeight + 1) {
          best = n;
          lo = n + 1;
        } else hi = n - 1;
      }
      if (best === 0) best = 1;
      if (from + best < chars.length) {
        for (let i = best - 1; i >= Math.floor(best * 0.82); i--) {
          if (/[。！？\n]/.test(chars[from + i])) {
            best = i + 1;
            break;
          }
        }
      }
      result.push(chars.slice(from, from + best).join(""));
      from += best;
    }
    return result;
  };
  const load = async (index: number, last = false) => {
    busy = true;
    prev.disabled = next.disabled = true;
    copy.textContent = "翻一页…";
    try {
      const item = entries[index];
      let entry = cache.get(String(item.id));
      if (!entry) {
        const r = await api("diary-read", { id: item.id });
        entry = r.entry;
        cache.set(String(item.id), entry);
      }
      if (!isCurrent()) return;
      entryIndex = index;
      date.textContent = entry.date || item.date || "";
      mood.textContent = entry.mood || item.mood || "";
      allText = String(entry.text || "");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (!isCurrent()) return;
      pages = paginate(allText);
      pageIndex = last ? pages.length - 1 : 0;
    } catch (e) {
      if (isCurrent()) {
        pages = [(e as Error).message];
        pageIndex = 0;
      }
    } finally {
      busy = false;
      if (isCurrent()) update();
    }
  };
  const turn = async (direction: number) => {
    if (busy || !isCurrent() || !entries.length) return;
    const n = pageIndex + direction;
    if (n >= 0 && n < pages.length) {
      pageIndex = n;
      update();
    } else if (
      entryIndex + direction >= 0 &&
      entryIndex + direction < entries.length
    )
      await load(entryIndex + direction, direction < 0);
    else if (direction > 0 && nextCursor) {
      busy = true;
      loadError = "";
      update();
      try {
        const r = await api("diary-list", { cursor: nextCursor });
        if (!isCurrent()) return;
        const known = new Set(entries.map((e) => String(e.id)));
        const more = (r.entries || []).filter((e: any) => !known.has(String(e.id)));
        if (!more.length && r.nextCursor) throw Error("加载失败，点下一页重试");
        nextCursor = r.nextCursor || null;
        entries.push(...more);
        busy = false;
        if (more.length) await load(entryIndex + 1);
      } catch {
        if (isCurrent()) loadError = "加载失败，点下一页重试";
      } finally {
        busy = false;
        if (isCurrent()) update();
      }
    }
  };
  prev.onclick = () => void turn(-1);
  next.onclick = () => void turn(1);
  const keys = (e: KeyboardEvent) => {
    if (!isCurrent()) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      void turn(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      void turn(1);
    }
  };
  panel.addEventListener("keydown", keys);
  const observer = new ResizeObserver(() => {
    if (!isCurrent()) {
      observer.disconnect();
      return;
    }
    const size = copy.clientWidth + ":" + copy.clientHeight;
    if (size === lastSize || busy || !allText) return;
    lastSize = size;
    const offset = pages.slice(0, pageIndex).reduce((n, x) => n + x.length, 0);
    pages = paginate(allText);
    let at = 0;
    pageIndex = 0;
    for (let i = 0; i < pages.length; i++) {
      if (at + pages[i].length > offset) {
        pageIndex = i;
        break;
      }
      at += pages[i].length;
    }
    update();
  });
  observer.observe(copy);
  panel.addEventListener(
    "close",
    () => {
      observer.disconnect();
      panel.removeEventListener("keydown", keys);
      cache.clear();
    },
    { once: true },
  );
  if (!canRead) {
    copy.textContent = "这本日记只给已验证的主人看。";
    prev.disabled = next.disabled = true;
    return;
  }
  copy.textContent = "翻开日记…";
  prev.disabled = next.disabled = true;
  try {
    const r = await api("diary-list");
    if (!isCurrent()) return;
    entries = r.entries || [];
    nextCursor = r.nextCursor || null;
    if (!entries.length) {
      copy.textContent = "还没有可翻看的日记。";
      return;
    }
    await document.fonts.ready;
    await load(0);
  } catch (e) {
    if (isCurrent()) copy.textContent = (e as Error).message;
  }
}
