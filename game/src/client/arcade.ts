type Api = (route: string, body?: any) => Promise<any>;
type Options = {
  panel: HTMLDialogElement;
  body: HTMLElement;
  open: (title: string) => number;
  api: Api;
  enter: () => boolean;
};
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = cls;
  return node;
};
export function createArcadeUI({ panel, body, open, api, enter }: Options) {
  // Fetch the small state sprites before the first move so cold networks cannot hide a piece.
  for (const file of [
    "ui-disc-coral-v1.webp",
    "ui-disc-blue-v1.webp",
    "ui-disc-empty-v2.webp",
    "tv-shell-v1.webp",
  ]) {
    const preload = new Image();
    preload.src = "/assets/" + file;
  }
  let surface: HTMLElement = body;
  const image = (name: string, cls = "") => {
    const img = el("img", "", cls);
    img.src = `/assets/ui-${name}-v1.webp`;
    img.alt = "";
    img.draggable = false;
    return img;
  };
  let tab = "play",
    match: any = null,
    stats: any = {},
    records: any[] = [],
    recordScope = "mine",
    recordPage = 0,
    hasMore = false,
    replayStep: number | null = null,
    busy = false,
    loading = false,
    epoch = 0,
    message = "",
    difficulty = "normal",
    shared = true,
    alias = "",
    reviewAvailable = false,
    pending: { payload: string; request: any } | null = null;
  const active = () => panel.open && panel.classList.contains("arcade-mode");
  const button = (text: string, fn: () => void, cls = "") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.disabled = busy;
    b.onclick = fn;
    return b;
  };
  const status = () => {
    const p = el(
      "p",
      message || (busy ? "等一下，她正在落子…" : ""),
      "arcade-error",
    );
    p.setAttribute("role", "status");
    return p;
  };
  async function refresh() {
    if (!active() || busy || loading || document.hidden) return;
    loading = true;
    const current = epoch;
    const requestedId = match?.id || null;
    const currentRead = () =>
      current === epoch &&
      active() &&
      !busy &&
      requestedId === (match?.id || null);
    try {
      if (match) {
        const r = await api("arcade-view", { id: match.id });
        if (!currentRead() || r.match.version < match.version) return;
        if (
          r.match.version !== match.version ||
          r.match.status !== match.status ||
          !!r.match.shared !== !!match.shared ||
          r.match.own !== match.own
        ) {
          match = r.match;
          message = "";
          render();
        }
      } else {
        const r = await api("arcade", { scope: recordScope, page: recordPage });
        if (!currentRead()) return;
        const changed =
          JSON.stringify([stats, records, hasMore]) !==
          JSON.stringify([r.stats, r.records, r.hasMore]);
        stats = r.stats;
        records = r.records || [];
        hasMore = !!r.hasMore;
        reviewAvailable = r.reviewAvailable;
        if (tab === "play" && r.mine?.status === "active") match = r.mine;
        const hadError = !!message;
        message = "";
        if (changed || match || hadError) render();
      }
    } catch (e) {
      if (!currentRead()) return;
      message = (e as Error).message;
      if (match && !match.own) {
        match = null;
        tab = "watch";
      }
      render();
    } finally {
      loading = false;
    }
  }
  async function send(op: string, args: any = {}) {
    if (busy) return;
    const base = {
        op,
        ...(op === "create" ? {} : { id: match?.id, version: match?.version }),
        ...args,
      },
      payload = JSON.stringify(base);
    if (pending?.payload !== payload)
      pending = {
        payload,
        request: { ...base, requestId: crypto.randomUUID() },
      };
    busy = true;
    message = "";
    render();
    const current = epoch;
    try {
      const r = await api("arcade-action", pending.request);
      pending = null;
      if (current !== epoch || !active()) return;
      if (op === "create" || op === "resign") replayStep = null;
      match = r.match;
      stats = r.stats;
    } catch (e) {
      if (current !== epoch || !active()) return;
      message = (e as Error).message + "，可以重试。";
    } finally {
      busy = false;
      if (current === epoch && active()) {
        render();
        if (message) void refresh();
      }
    }
  }
  function top() {
    const nav = el("nav", "", "arcade-tabs");
    nav.setAttribute("aria-label", "游戏栏目");
    for (const [id, label] of [
      ["play", "和肥鱼来一局"],
      ["watch", "对战记录"],
    ]) {
      const b = button(label, () => {
        epoch++;
        match = null;
        tab = id;
        message = "";
        render();
        void refresh();
      });
      b.setAttribute("aria-pressed", String(tab === id));
      nav.append(b);
    }
    surface.append(nav);
  }
  function lobby() {
    surface.append(
      el(
        "h3",
        tab === "watch" ? "留在这里的棋局" : "打开游戏机，来一局",
        "arcade-heading",
      ),
    );
    if (tab === "watch") {
      const filters = el("div", "", "arcade-record-filters");
      for (const [scope, text] of [
        ["mine", "我的记录"],
        ["everyone", "大家的记录"],
      ]) {
        const filter = button(text, () => {
          epoch++;
          recordScope = scope;
          recordPage = 0;
          records = [];
          render();
          void refresh();
        });
        filter.setAttribute("aria-pressed", String(recordScope === scope));
        filters.append(filter);
      }
      surface.append(filters);
      if (!records.length)
        surface.append(
          el(
            "p",
            recordScope === "mine"
              ? "下完的棋局和复盘都会留在这里。"
              : "还没有公开的对战记录。",
            "arcade-muted",
          ),
        );
      for (const m of records) {
        const row = button(
          "",
          () => {
            epoch++;
            match = m;
            replayStep = m.moves?.length || 0;
            message = "";
            render();
            void refresh();
          },
          "arcade-watch-row arcade-record-row",
        );
        row.append(
          el(
            "strong",
            (m.own ? "我的对局" : m.nickname) +
              " · " +
              (m.status === "expired"
                ? "已收起"
                : m.resigned
                  ? "提前收局"
                  : m.result === "player"
                    ? "玩家获胜"
                    : m.result === "fish"
                      ? "肥鱼获胜"
                      : "平局"),
          ),
          el(
            "small",
            new Date(m.createdAt || m.updatedAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              hour12: false,
            }) +
              " · " +
              (m.review?.status === "ready"
                ? "有复盘"
                : m.review?.status === "pending"
                  ? "复盘排队中"
                  : "查看棋谱"),
          ),
        );
        surface.append(row);
      }
      const pages = el("div", "", "arcade-record-filters");
      const previous = button("上一页", () => {
        epoch++;
        recordPage--;
        records = [];
        render();
        void refresh();
      });
      previous.disabled ||= recordPage === 0;
      const next = button("下一页", () => {
        epoch++;
        recordPage++;
        records = [];
        render();
        void refresh();
      });
      next.disabled ||= !hasMore;
      pages.append(previous, el("span", String(recordPage + 1)), next);
      surface.append(pages);
      surface.append(status());
      return;
    }
    const mode = el("div", "", "arcade-modes");
    for (const [id, label] of [
      ["normal", "普通局"],
      ["serious", "认真局"],
    ]) {
      const b = button(label, () => {
        difficulty = id;
        render();
      });
      b.setAttribute("aria-pressed", String(difficulty === id));
      mode.append(b);
    }
    surface.append(mode);
    const share = el("label", "", "arcade-sharing"),
      check = el("input");
    check.type = "checkbox";
    check.checked = shared;
    check.onchange = () => {
      shared = check.checked;
      render();
    };
    share.append(check, "公开这局记录");
    surface.append(share);
    if (shared) {
      const field = el("input");
      field.placeholder = "展示昵称（可选，不填QQ号）";
      field.maxLength = 12;
      field.value = alias;
      field.setAttribute("aria-label", "展示昵称");
      field.oninput = () => {
        alias = field.value;
      };
      surface.append(field);
    }
    const games = el("div", "", "arcade-choices");
    for (const [kind, title, desc] of [
      ["connect4", "四子棋", "轮流落子 · 连成四颗就赢"],
    ]) {
      const b = button(
        "",
        () =>
          void send("create", { kind, difficulty, shared, nickname: alias }),
        "arcade-game-choice",
      );
      b.append(el("strong", title), el("small", desc));
      games.append(b);
    }
    surface.append(
      games,
      el(
        "p",
        `已玩 ${stats.played || 0} 局 · 赢 ${stats.won || 0} · 输 ${stats.lost || 0} · 平 ${stats.drawn || 0}`,
        "arcade-muted",
      ),
      status(),
    );
  }
  function game() {
    const footer = el("div", "", "arcade-footer");
    const m = match,
      own = m.own,
      ended = m.status !== "active",
      thinking = !ended && m.turn === "fish";
    const banner = el("div", "", "arcade-banner");
    banner.append(
      el(
        "span",
        m.difficulty === "serious" ? "认真局" : "普通局",
        "arcade-pill",
      ),
      el(
        "strong",
        ended
          ? m.status === "expired"
            ? "这局已收起"
            : m.result === "draw"
              ? "平局"
              : m.result === "player"
                ? own
                  ? "你赢了"
                  : "玩家获胜"
                : "大肥鱼获胜"
          : thinking
            ? "她在想…"
            : own
              ? "轮到你了"
              : "回看棋谱",
      ),
    );
    banner.lastElementChild?.classList.add("arcade-turn");
    banner.lastElementChild?.prepend(
      image("rays-left", "arcade-turn-ray left"),
    );
    banner.lastElementChild?.append(
      image("rays-right", "arcade-turn-ray right"),
    );
    surface.append(
      banner,
      el("p", m.message || "慢慢来，不着急。", "arcade-speech"),
    );
    if (ended) {
      const total = m.moves?.length || 0,
        step = Math.max(0, Math.min(total, replayStep ?? total));
      const nav = el("div", "", "arcade-replay");
      const select = (n: number) => {
        replayStep = n;
        render();
      };
      const first = button("回到开局", () => select(0)),
        prev = button("上一步", () => select(step - 1)),
        next = button("下一步", () => select(step + 1)),
        last = button("看终局", () => select(total));
      first.disabled ||= step === 0;
      prev.disabled ||= step === 0;
      next.disabled ||= step === total;
      last.disabled ||= step === total;
      nav.append(
        first,
        prev,
        el("span", `第 ${step} / ${total} 步`),
        next,
        last,
      );
      surface.append(nav);
    }
    if (m.kind === "connect4") {
      const step = ended
        ? Math.max(
            0,
            Math.min(m.moves?.length || 0, replayStep ?? m.moves?.length ?? 0),
          )
        : m.moves?.length || 0;
      const shownBoard: number[] = ended ? Array(42).fill(0) : m.board;
      if (ended)
        for (const move of (m.moves || []).slice(0, step)) {
          for (let row = 5; row >= 0; row--) {
            const cell = row * 7 + move.column;
            if (!shownBoard[cell]) {
              shownBoard[cell] = move.player;
              break;
            }
          }
        }
      const atEnd = step === (m.moves?.length || 0);
      const board = el("div", "", "arcade-board");
      board.setAttribute("role", "img");
      board.setAttribute(
        "aria-label",
        `四子棋棋盘，玩家 ${shownBoard.filter((x: number) => x === 1).length} 颗，鲸鱼 ${shownBoard.filter((x: number) => x === 2).length} 颗`,
      );
      for (let i = 0; i < 42; i++) {
        const disc = el(
          "span",
          "",
          `arcade-disc piece-${shownBoard[i]}${atEnd && m.line?.includes(i) ? " winning" : ""}${!ended && m.lastCells?.includes(i) ? " new-piece" : ""}`,
        );
        disc.setAttribute("aria-hidden", "true");
        if (own && !ended && !busy && !thinking)
          disc.onclick = () => void send("move", { column: i % 7 });
        board.append(disc);
      }
      const controls = el("div", "", "arcade-columns");
      if (own && !ended)
        for (let col = 0; col < 7; col++) {
          const b = button("", () => void send("move", { column: col }));
          b.setAttribute("aria-label", `第${col + 1}列落子`);
          b.append(el("span", String(col + 1)), image("arrow"));
          b.disabled ||= thinking || m.board[col] !== 0;
          controls.append(b);
        }
      surface.append(board, controls);
      const legend = el("div", "", "arcade-legend");
      legend.append(
        image("legend-coral"),
        el("span", own ? "你执珊瑚色" : "玩家执珊瑚色"),
        image("legend-blue"),
        el("span", "她执鲸鱼蓝"),
      );
      footer.append(legend);
    }
    surface.append(footer);
    const actions = el("div", "", "arcade-bottom");
    if (own) {
      const share = el("label", "", "arcade-sharing"),
        toggle = el("input");
      toggle.type = "checkbox";
      toggle.checked = m.shared;
      toggle.disabled = busy;
      toggle.onchange = () => void send("share", { shared: toggle.checked });
      share.append(toggle, "公开这局记录");
      footer.append(share);
      if (ended) {
        actions.append(
          button(
            "重新来一局",
            () =>
              void send("create", {
                kind: m.kind,
                difficulty: m.difficulty,
                shared: m.shared,
                nickname: m.nickname,
              }),
            "arcade-primary",
          ),
        );
        if (m.status === "finished" && (m.reviewAvailable || reviewAvailable)) {
          const review = button(
            m.review?.status === "pending"
              ? "复盘排队中…"
              : m.review?.status === "ready"
                ? "已复盘"
                : m.review?.status === "failed"
                  ? "重试复盘"
                  : "听她复盘",
            () => void send("review"),
          );
          review.disabled ||=
            ["pending", "ready"].includes(m.review?.status) ||
            (m.review?.attempt || 0) >= 3;
          review.classList.add("arcade-review-button");
          surface.append(review);
        }
      } else
        actions.append(
          button(
            "重新来一局",
            () => {
              const row = el("div", "", "arcade-confirm");
              row.append(
                el("p", "结束当前局会记为认输。要重新开始，还是先收起来？"),
                button("重新开局", async () => {
                  await send("resign");
                  if (match?.status === "finished")
                    void send("create", {
                      kind: m.kind,
                      difficulty: m.difficulty,
                      shared: m.shared,
                      nickname: m.nickname,
                    });
                }),
                button("只收起这局", () => void send("resign")),
                button("继续玩", () => render()),
              );
              surface.append(row);
            },
            "arcade-primary",
          ),
        );

      if (m.review?.status === "pending")
        surface.append(
          el(
            "p",
            "她会在聊天空闲时复盘；可以先收起游戏机，稍后再来看。",
            "arcade-muted",
          ),
        );
      if (m.review?.status === "failed")
        surface.append(
          el("p", "复盘没连上，战绩已经记下，可以重试。", "arcade-muted"),
        );
    }
    if (ended && m.review?.status === "ready")
      surface.append(el("p", m.review.text, "arcade-review"));
    if (ended)
      actions.prepend(
        button(
          "返回记录",
          () => {
            epoch++;
            match = null;
            tab = "watch";
            replayStep = null;
            render();
            void refresh();
          },
          "arcade-record-back",
        ),
      );
    actions.append(button("收起游戏机", () => panel.close()));
    surface.append(actions, status());
  }
  function render() {
    if (!active()) return;
    body.replaceChildren();
    body.setAttribute("aria-busy", String(busy));
    const shell = el("section", "", "arcade-shell"),
      head = el("div", "", "arcade-head");
    const title = el("h2", "", "arcade-title");
    title.append(
      image("splash", "arcade-title-splash"),
      el("span", "和大肥鱼来一局"),
      image("splash", "arcade-title-splash reverse"),
    );
    const close = button("", () => panel.close(), "arcade-close");
    close.setAttribute("aria-label", "关闭");
    head.append(title, close);
    surface = el("div", "", "arcade-content");
    shell.append(head, surface);
    body.append(shell);
    top();
    const face = el("section", "", "arcade-face");
    surface.append(face);
    surface = face;
    const badge = el("h3", "", "arcade-game-title");
    const consoleIcon = el("img", "", "handheld-title-icon");
    consoleIcon.src = "/assets/handheld-console-v1.webp";
    consoleIcon.alt = "";
    badge.append(consoleIcon, el("span", "游戏机 · 四子棋"));
    surface.append(badge);
    if (match) game();
    else lobby();
    for (const label of body.querySelectorAll(".arcade-sharing")) {
      const input = label.querySelector("input")!;
      const wrap = el("span", "", "arcade-switch"),
        state = el("small", input.checked ? "ON" : "OFF");
      state.setAttribute("aria-hidden", "true");
      input.setAttribute("aria-label", "公开这局记录");
      input.replaceWith(wrap);
      wrap.append(input, state);
    }
  }
  const timer = setInterval(() => void refresh(), 2500);
  panel.addEventListener("close", () => {
    epoch++;
    message = "";
  });
  return {
    open() {
      if (!enter()) return;
      shared = true;
      difficulty = "normal";
      epoch++;
      match = null;
      message = "";
      tab = "play";
      open("和大肥鱼来一局");
      panel.classList.add("arcade-mode");
      render();
      void refresh();
    },
    changed() {
      void refresh();
    },
    dispose() {
      clearInterval(timer);
    },
  };
}
