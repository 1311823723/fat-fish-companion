type Api = (route: string, body?: any) => Promise<any>;
type Options = {
  panel: HTMLDialogElement;
  body: HTMLElement;
  open: (title: string) => number;
  api: Api;
  enter: () => boolean;
};
const hands = ["✊", "✋", "✌"];
const names = ["石头", "布", "剪刀"];
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
    watch: any[] = [],
    busy = false,
    loading = false,
    epoch = 0,
    message = "",
    difficulty = "normal",
    shared = false,
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
        const r = await api("arcade");
        if (!currentRead()) return;
        const changed =
          JSON.stringify([stats, watch]) !== JSON.stringify([r.stats, r.watch]);
        stats = r.stats;
        watch = r.watch;
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
    nav.setAttribute("aria-label", "电视栏目");
    for (const [id, label] of [
      ["play", "挑战她"],
      ["watch", "看看对局"],
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
        tab === "watch" ? "看看她们玩到哪了" : "开电视，来一局",
        "arcade-heading",
      ),
    );
    if (tab === "watch") {
      if (!watch.length)
        surface.append(el("p", "现在没有开放观战的对局。", "arcade-muted"));
      for (const m of watch) {
        surface.append(
          button(
            `${m.nickname} · ${m.kind === "rps" ? "猜拳" : "四子棋"} →`,
            () => {
              epoch++;
              match = m;
              message = "";
              render();
              void refresh();
            },
            "arcade-watch-row",
          ),
        );
      }
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
    share.append(check, "允许观战");
    surface.append(share);
    if (shared) {
      const field = el("input");
      field.placeholder = "观战昵称（可选，不填QQ号）";
      field.maxLength = 12;
      field.value = alias;
      field.setAttribute("aria-label", "观战昵称");
      field.oninput = () => {
        alias = field.value;
      };
      surface.append(field);
    }
    const games = el("div", "", "arcade-choices");
    for (const [kind, title, desc] of [
      ["rps", "猜拳", "先赢两局 · 她先锁定出拳"],
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
              : "观战中",
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
    if (m.kind === "connect4") {
      const board = el("div", "", "arcade-board");
      board.setAttribute("role", "img");
      board.setAttribute(
        "aria-label",
        `四子棋棋盘，玩家 ${m.board.filter((x: number) => x === 1).length} 颗，鲸鱼 ${m.board.filter((x: number) => x === 2).length} 颗`,
      );
      for (let i = 0; i < 42; i++) {
        const disc = el(
          "span",
          "",
          `arcade-disc piece-${m.board[i]}${m.line?.includes(i) ? " winning" : ""}${m.lastCells?.includes(i) ? " new-piece" : ""}`,
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
    } else {
      surface.append(
        el(
          "div",
          `${own ? "你" : "玩家"} ${m.score.player} : ${m.score.fish} 大肥鱼`,
          "arcade-score",
        ),
      );
      const turn = m.history.at(-1),
        reveal = el("div", "", "arcade-reveal");
      reveal.append(
        turn ? image(`hand-${turn.player}`) : el("span", "？"),
        el("small", "VS"),
        turn ? image(`hand-${turn.fish}`) : el("span", "？"),
      );
      surface.append(reveal);
      if (turn)
        surface.append(
          el(
            "p",
            `刚才：${names[turn.player]} 对 ${names[turn.fish]} · ${turn.winner === "draw" ? "平手" : turn.winner === "player" ? "玩家胜" : "她胜"}`,
            "arcade-muted",
          ),
        );
      if (own && !ended) {
        const choices = el("div", "", "arcade-hands");
        for (let choice = 0; choice < 3; choice++)
          choices.append(
            button(names[choice], () => void send("move", { choice })),
          );
        surface.append(
          el("p", `第 ${m.round} 轮 · 她已选好`, "arcade-muted"),
          choices,
        );
      }
      const fair = el("details", "", "arcade-fair");
      fair.append(el("summary", "她先出，你后选"));
      fair.append(el("p", "每轮先保存她的出拳，揭晓后才公开。平手不计胜局。"));
      if (turn)
        fair.append(
          el(
            "code",
            `承诺 ${turn.commitment}\n校验内容 ${m.id}:${turn.round}:${turn.fish}:${turn.nonce}`,
          ),
        );
      surface.append(fair);
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
      share.append(toggle, "允许观战");
      footer.append(share);
      if (ended) {
        actions.append(
          button(
            "重新来一局",
            () =>
              void send("create", {
                kind: m.kind,
                difficulty: m.difficulty,
                shared: false,
                nickname: m.nickname,
              }),
            "arcade-primary",
          ),
        );
        if (m.reviewAvailable || reviewAvailable) {
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
                      shared: false,
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
      if (m.review?.status === "ready")
        surface.append(el("p", m.review.text, "arcade-review"));
      if (m.review?.status === "pending")
        surface.append(
          el(
            "p",
            "她会在聊天空闲时复盘；可以先关电视，稍后再来看。",
            "arcade-muted",
          ),
        );
      if (m.review?.status === "failed")
        surface.append(
          el("p", "复盘没连上，战绩已经记下，可以重试。", "arcade-muted"),
        );
    }
    actions.append(button("收起电视", () => panel.close()));
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
    badge.append(
      image("tv-mark"),
      el(
        "span",
        match
          ? `电视 · ${match.kind === "rps" ? "猜拳" : "四子棋"}`
          : "电视 · 小游戏",
      ),
    );
    surface.append(badge);
    if (match) game();
    else lobby();
    for (const label of body.querySelectorAll(".arcade-sharing")) {
      const input = label.querySelector("input")!;
      const wrap = el("span", "", "arcade-switch"),
        state = el("small", input.checked ? "ON" : "OFF");
      state.setAttribute("aria-hidden", "true");
      input.setAttribute("aria-label", "允许观战");
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
      shared = false;
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
