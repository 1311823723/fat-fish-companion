import Phaser from "phaser";
export type World = any;
type Action = (name: string) => void;
export class Room extends Phaser.Scene {
  world: World = null;
  pet!: Phaser.GameObjects.Sprite;
  shadow!: Phaser.GameObjects.Ellipse;
  sky!: Phaser.GameObjects.Image;
  windowPanes!: Path2D;
  layout: any;
  dark!: Phaser.GameObjects.Rectangle;
  glow!: Phaser.GameObjects.Image;
  fridgeGlow!: Phaser.GameObjects.Image;
  door!: Phaser.GameObjects.Image;
  foods!: Phaser.GameObjects.Group;
  note!: Phaser.GameObjects.Text;
  notePaper!: Phaser.GameObjects.Container;
  clockHands!: Phaser.GameObjects.Graphics;
  manifest: any;
  offset = 0;
  x = 300;
  y = 710;
  fridgeOpen = false;
  fridgeProgress = 0;
  curtainProgress = 0;
  curtainTarget = 0;
  furnishingsInitialized = false;
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  onAction: Action;
  lastLayout = "";
  loading = new Set<string>();
  renderedFrames = 0;
  fpsStart = 0;
  constructor(action: Action) {
    super("room");
    this.onAction = action;
  }
  preload() {
    this.load.image("room", "/assets/room-v4.webp");
    this.load.image("door", "/assets/fridge-door-v3.webp");
    this.load.image("curtain-fabric", "/assets/curtain-v3.webp");
    this.load.json("room-layout", "/assets/room-layout-v2.json");
    this.load.json("manifest", "/assets/manifest-v1.json");
    for (const n of ["idle", "walk_right", "walk_left"])
      this.load.spritesheet(n, "/assets/" + n + "-v1.webp", {
        frameWidth: 256,
        frameHeight: 256,
      });
    for (const n of ["tomato", "wings", "pork", "soup", "milk_tea", "lemon"])
      this.load.svg("food-" + n, "/assets/" + n + "-v1.svg", {
        width: 64,
        height: 50,
      });
  }
  create() {
    this.manifest = this.cache.json.get("manifest");
    this.layout = this.cache.json.get("room-layout");
    this.add.image(0, 0, "room").setOrigin(0).setDisplaySize(600, 800);
    this.textures.createCanvas("window-state-v2", 600, 800);
    this.sky = this.add.image(0, 0, "window-state-v2").setOrigin(0);
    const clip = new Path2D();
    const polygon = (points: { x: number; y: number }[]) => {
      clip.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) clip.lineTo(p.x, p.y);
      clip.closePath();
    };
    const left = [
      { x: 223, y: 146 },
      { x: 223, y: 130 },
    ];
    for (let i = 0; i <= 20; i++) {
      const angle = Math.PI + (i * Math.PI) / 40;
      left.push({
        x: 296 + 73 * Math.cos(angle),
        y: 130 + 78 * Math.sin(angle),
      });
    }
    left.push({ x: 292, y: 53 }, { x: 292, y: 146 });
    polygon(left);
    const right = [{ x: 302, y: 53 }];
    for (let i = 0; i <= 20; i++) {
      const angle = 1.5 * Math.PI + (i * Math.PI) / 40;
      right.push({
        x: 296 + 73 * Math.cos(angle),
        y: 130 + 78 * Math.sin(angle),
      });
    }
    right.push({ x: 370, y: 146 }, { x: 302, y: 146 });
    polygon(right);
    polygon([
      { x: 223, y: 156 },
      { x: 292, y: 156 },
      { x: 292, y: 227 },
      { x: 276, y: 227 },
      { x: 269, y: 215 },
      { x: 253, y: 211 },
      { x: 237, y: 214 },
      { x: 223, y: 213 },
    ]);
    polygon([
      { x: 302, y: 156 },
      { x: 370, y: 156 },
      { x: 370, y: 177 },
      { x: 361, y: 170 },
      { x: 349, y: 171 },
      { x: 341, y: 180 },
      { x: 330, y: 180 },
      { x: 328, y: 191 },
      { x: 337, y: 201 },
      { x: 339, y: 218 },
      { x: 345, y: 229 },
      { x: 302, y: 229 },
    ]);
    this.windowPanes = clip;
    this.clockHands = this.add.graphics();
    this.foods = this.add.group();
    this.door = this.add
      .image(
        this.layout.fridgeDoor.x + this.layout.fridgeDoor.width,
        this.layout.fridgeDoor.y,
        "door",
      )
      .setOrigin(1, 0)
      .setDisplaySize(
        this.layout.fridgeDoor.width,
        this.layout.fridgeDoor.height,
      );
    this.shadow = this.add.ellipse(300, 710, 68, 16, 0x41372a, 0.13);
    this.pet = this.add
      .sprite(300, 710, "idle")
      .setOrigin(0.5, 244 / 256)
      .setScale(0.82);
    this.dark = this.add
      .rectangle(0, 0, 600, 800, 0x142438, 1)
      .setOrigin(0)
      .setAlpha(0);
    const lightTexture = this.textures.createCanvas("soft-light-v1", 256, 256)!;
    const context = lightTexture.context,
      gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255,245,190,.4)");
    gradient.addColorStop(0.45, "rgba(255,245,190,.18)");
    gradient.addColorStop(1, "rgba(255,245,190,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    lightTexture.refresh();
    this.glow = this.add
      .image(300, 400, "soft-light-v1")
      .setDisplaySize(190, 200)
      .setVisible(false);
    this.fridgeGlow = this.add
      .image(490, 435, "soft-light-v1")
      .setDisplaySize(150, 270)
      .setVisible(false);
    this.notePaper = this.add
      .container(252, 588)
      .setScale(0.68)
      .setRotation(0.075)
      .setDepth(5);
    const paper = this.add.graphics();
    paper.fillStyle(0x604f36, 0.18).fillRoundedRect(3, 4, 78, 65, 2);
    paper.fillStyle(0xfff2c9).fillRoundedRect(0, 0, 78, 65, 2);
    paper.lineStyle(1, 0xe5d5a9).strokeRoundedRect(0, 0, 78, 65, 2);
    paper.lineStyle(1, 0xe9dcb9, 0.65);
    for (let y = 22; y < 61; y += 14) paper.lineBetween(7, y, 70, y);
    paper.fillStyle(0xe5cf9e).fillTriangle(66, 65, 78, 53, 78, 65);
    paper.fillStyle(0xe3b39b, 0.65).fillRect(23, -5, 31, 10);
    this.note = this.add.text(7, 12, "", {
      fontFamily: "KaiTi, STKaiti, Microsoft YaHei",
      fontSize: "12px",
      color: "#78624d",
      lineSpacing: 0,
      wordWrap: { width: 64 },
    });
    const signature = this.add.text(47, 56, "小鱼", {
      fontFamily: "KaiTi, STKaiti, serif",
      fontSize: "8px",
      color: "#a58c6a",
    });
    const hit = this.add
      .zone(39, 30, 88, 78)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onAction("note"));
    this.notePaper.add([paper, this.note, signature, hit]);
    for (const object of this.layout.objects) {
      if (!object.actions.length) continue;
      const box = object.bounds;
      this.add
        .zone(
          box.x + box.width / 2,
          box.y + box.height / 2,
          box.width,
          box.height,
        )
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.onAction(object.actions[0]));
    }
    this.input.on(
      "pointerdown",
      (p: Phaser.Input.Pointer, objects: unknown[]) => {
        if (!objects.length && p.y > 620 && this.world?.travel.phase !== "away")
          this.onAction("walk");
      },
    );
    this.events.on("shutdown", () => this.loading.clear());
    this.game.events.emit("room-ready");
    this.drawEnvironment();
  }
  sync(w: World) {
    if (this.world && w.revision < this.world.revision) return;
    this.curtainTarget = w.furnishings.curtainClosed ? 1 : 0;
    if (!this.furnishingsInitialized) {
      this.curtainProgress = this.curtainTarget;
      this.furnishingsInitialized = true;
    }
    this.world = w;
    this.offset = w.serverTime - Date.now();
    if (this.pet) this.drawEnvironment();
  }
  toggleFridge() {
    this.fridgeOpen = !this.fridgeOpen;
    this.drawEnvironment();
  }
  drawWindow() {
    if (!this.world || !this.sky) return;
    const w = this.world,
      now = Date.now() + this.offset,
      h = new Date(now + 28800000).getUTCHours(),
      night = h < 5 || h >= 19;
    const weather = w.weather.available ? w.weather.kind : "unknown",
      rain = ["rain", "thunder"].includes(weather);
    const canvas = this.textures.get(
        "window-state-v2",
      ) as Phaser.Textures.CanvasTexture,
      ctx = canvas.context;
    ctx.clearRect(0, 0, 600, 800);
    ctx.save();
    ctx.clip(this.windowPanes);
    const gradient = ctx.createLinearGradient(0, 50, 0, 235);
    gradient.addColorStop(
      0,
      night ? "#213449" : h < 7 ? "#aab7c4" : h >= 17 ? "#eab88e" : "#b8d4da",
    );
    gradient.addColorStop(
      1,
      night ? "#41565e" : h >= 17 ? "#f4d7ac" : "#edf0d3",
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(220, 48, 155, 190);
    ctx.save();
    ctx.beginPath();
    ctx.rect(220, 156, 155, 80);
    ctx.clip();
    ctx.drawImage(
      this.textures.get("room").getSourceImage() as HTMLImageElement,
      0,
      0,
      600,
      800,
    );
    ctx.restore();
    if (night) {
      ctx.fillStyle = "rgba(18,37,55,.8)";
      ctx.fillRect(220, 156, 155, 80);
    } else if (h >= 17) {
      ctx.fillStyle = "rgba(229,151,91,.24)";
      ctx.fillRect(220, 156, 155, 80);
    }
    if (["clear", "cloudy"].includes(weather)) {
      ctx.fillStyle = night ? "#eee6c8" : "#fff0c5";
      ctx.beginPath();
      ctx.arc(
        night ? 267 : h < 11 ? 265 : 325,
        night ? 91 : h < 11 || h >= 17 ? 119 : 108,
        night ? 12 : 18,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (night) {
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.arc(238 + i * 17, 68 + (i % 3) * 18, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (["cloudy", "overcast", "rain", "thunder"].includes(weather)) {
      ctx.fillStyle = night ? "rgba(157,177,185,.22)" : "rgba(226,233,227,.7)";
      for (const [x, y, rx] of [
        [266, 106, 36],
        [340, 137, 28],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (rain) {
      ctx.fillStyle = "rgba(66,91,110,.26)";
      ctx.fillRect(220, 48, 155, 190);
      ctx.strokeStyle = "rgba(185,214,226,.8)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 28; i++) {
        const x = 226 + (i % 9) * 17,
          y = 77 + Math.floor(i / 9) * 43;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 11);
        ctx.stroke();
      }
    }
    if (weather === "snow") {
      ctx.fillStyle = "#f6f8f2";
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.arc(
          226 + (i % 9) * 17,
          80 + Math.floor(i / 9) * 48,
          1.6,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    if (weather === "fog") {
      ctx.fillStyle = "rgba(235,239,230,.55)";
      ctx.fillRect(220, 48, 155, 190);
    }
    if (weather === "thunder") {
      ctx.fillStyle = "#ffe8ae";
      ctx.beginPath();
      ctx.moveTo(315, 108);
      ctx.lineTo(304, 133);
      ctx.lineTo(314, 130);
      ctx.lineTo(309, 149);
      ctx.lineTo(326, 121);
      ctx.lineTo(316, 125);
      ctx.closePath();
      ctx.fill();
    }
    const progress = this.curtainProgress;
    if (progress > 0) {
      const fabric = this.textures
        .get("curtain-fabric")
        .getSourceImage() as HTMLImageElement;
      const fw = fabric.width,
        fh = fabric.height;
      ctx.drawImage(fabric, 0, 0, fw / 2, fh, 222, 51, 75 * progress, 183);
      ctx.drawImage(
        fabric,
        fw / 2,
        0,
        fw / 2,
        fh,
        372 - 75 * progress,
        51,
        75 * progress,
        183,
      );
    }
    ctx.restore();
    canvas.refresh();
  }
  drawEnvironment() {
    if (!this.world || !this.sky) return;
    const w = this.world,
      now = Date.now() + this.offset,
      h = new Date(now + 28800000).getUTCHours(),
      night = h < 5 || h >= 19;
    this.drawWindow();
    this.clockHands.clear();
    this.clockHands.lineStyle(2.8, 0x5a6c59);
    const d = new Date(now + 28800000),
      minute = d.getUTCMinutes();
    const a = (((h % 12) + minute / 60) * Math.PI) / 6 - Math.PI / 2,
      b = (minute * Math.PI) / 30 - Math.PI / 2;
    this.clockHands.lineBetween(
      300,
      28,
      300 + Math.cos(a) * 9,
      28 + Math.sin(a) * 9,
    );
    this.clockHands.lineStyle(2, 0x5a6c59);
    this.clockHands.lineBetween(
      300,
      28,
      300 + Math.cos(b) * 13,
      28 + Math.sin(b) * 13,
    );
    this.door.setVisible(true);
    this.foods.clear(true, true);
    let i = 0;
    for (const f of w.kitchen.items)
      for (let n = 0; n < f.count; n++, i++)
        this.foods.add(
          this.add
            .image(
              this.layout.foodGrid.x +
                (i % 3) * this.layout.foodGrid.columnStep,
              this.layout.foodGrid.y +
                Math.floor(i / 3) * this.layout.foodGrid.rowStep,
              "food-" + f.id,
            )
            .setDisplaySize(29, 25)
            .setDepth(1),
        );
    this.door.setDepth(2);
    this.updateFurniturePresentation();
    const noteText = Array.from(w.travel.note || "出门转转，很快回来。");
    const preview =
      noteText.slice(0, 13).join("") + (noteText.length > 13 ? "…" : "");
    this.note.setText(
      Array.from(preview)
        .reduce((lines: string[], char, i) => {
          if (i % 5 === 0) lines.push("");
          lines[lines.length - 1] += char;
          return lines;
        }, [])
        .join("\n"),
    );
    this.notePaper.setVisible(w.travel.phase === "away");
  }
  updateFurniturePresentation() {
    if (!this.world || !this.door || !this.dark) return;
    const p = this.fridgeProgress,
      ease = p * p * (3 - 2 * p),
      angle = ease * Math.PI * 0.475,
      box = this.layout.fridgeDoor;
    this.door
      .setDisplaySize(
        Math.max(3, box.width * Math.cos(angle)),
        box.height + Math.sin(angle) * 5,
      )
      .setY(box.y - Math.sin(angle) * 2.5)
      .setTint(
        Phaser.Display.Color.GetColor(
          255 - ease * 24,
          255 - ease * 20,
          255 - ease * 14,
        ),
      );
    const h = new Date(Date.now() + this.offset + 28800000).getUTCHours(),
      night = h < 5 || h >= 19,
      closed = this.curtainProgress;
    this.dark
      .setDepth(6)
      .setAlpha(
        night
          ? this.world.furnishings.lightOn
            ? 0.16
            : 0.48 + 0.3 * closed
          : this.world.furnishings.lightOn
            ? 0.035 * closed
            : 0.12 + 0.12 * closed,
      );
    this.glow.setDepth(7).setVisible(this.world.furnishings.lightOn);
    this.fridgeGlow
      .setDepth(7)
      .setVisible(p > 0.005)
      .setAlpha(ease);
    const container = document.getElementById("game");
    if (container) {
      container.dataset.fridgeProgress = p.toFixed(3);
      container.dataset.curtainProgress = closed.toFixed(3);
    }
  }
  animateFurniture(delta: number) {
    const step = Math.min(delta, 80) / 650,
      approach = (value: number, target: number) =>
        this.reducedMotion
          ? target
          : value +
            Math.sign(target - value) *
              Math.min(Math.abs(target - value), step);
    const curtain = approach(this.curtainProgress, this.curtainTarget),
      fridge = approach(this.fridgeProgress, this.fridgeOpen ? 1 : 0),
      changed =
        curtain !== this.curtainProgress || fridge !== this.fridgeProgress;
    if (curtain !== this.curtainProgress) {
      this.curtainProgress = curtain;
      this.drawWindow();
    }
    this.fridgeProgress = fridge;
    if (changed) this.updateFurniturePresentation();
  }
  ensureAnim(name: string) {
    if (!this.manifest[name]) name = "idle";
    if (!this.textures.exists(name)) {
      if (!this.loading.has(name)) {
        this.loading.add(name);
        this.load.spritesheet(name, this.manifest[name].file, {
          frameWidth: 256,
          frameHeight: 256,
        });
        this.load.once("complete", () => this.loading.delete(name));
        this.load.start();
      }
      return "idle";
    }
    if (!this.anims.exists(name))
      this.anims.create({
        key: name,
        frames: this.anims.generateFrameNumbers(name, {
          start: 0,
          end: this.manifest[name].frames - 1,
        }),
        frameRate: this.manifest[name].fps,
        repeat: -1,
      });
    return name;
  }
  update(_time: number, delta: number) {
    this.renderedFrames++;
    if (_time - this.fpsStart >= 2000) {
      document.getElementById("game")!.dataset.fps = String(
        Math.round((this.renderedFrames * 1000) / (_time - this.fpsStart)),
      );
      this.renderedFrames = 0;
      this.fpsStart = _time;
    }
    if (!this.world || !this.pet) return;
    this.animateFurniture(delta);
    const w = this.world,
      away = w.travel.phase === "away";
    this.pet.setVisible(!away);
    this.shadow.setVisible(!away);
    if (away) return;
    const a = w.activity;
    let name = "idle",
      tx = this.layout.idle.x,
      ty = this.layout.idle.y,
      scale = 0.82;
    const now = Date.now() + this.offset;
    if (a.name === "walk") {
      const path = this.layout.walkPath,
        progress = ((now - a.startedAt) / 4200) % path.length,
        i = Math.floor(progress),
        f = progress - i,
        from = path[i],
        to = path[(i + 1) % path.length];
      tx = from.x + (to.x - from.x) * f;
      ty = from.y + (to.y - from.y) * f;
      name = tx > this.x ? "walk_right" : "walk_left";
    } else if (a.name === "sleep") {
      name = "sleep";
      tx = 125;
      ty = 430;
      scale = 0.65;
    } else if (["eat", "tea"].includes(a.name)) {
      name = a.name === "tea" ? "tea" : "eat_taiyaki";
      const chair = this.layout.objects.find(
        (x: any) => x.id === "desk",
      ).standPoint;
      tx = chair.x;
      ty = chair.y;
      scale = 0.65;
    } else if (a.name === "rest") {
      tx = this.layout.rest.x;
      ty = this.layout.rest.y;
    } else if (
      ["smile", "sleepy", "sad", "angry"].includes(w.mood.expression)
    ) {
      name = "expr_" + w.mood.expression;
    }
    const factor = 1 - Math.exp(-Math.min(delta, 100) / 190);
    this.x += (tx - this.x) * factor;
    this.y += (ty - this.y) * factor;
    const key = this.ensureAnim(name);
    if (this.pet.anims.currentAnim?.key !== key) this.pet.play(key);
    this.pet.setPosition(this.x, this.y).setScale(scale).setDepth(4);
    this.shadow.setPosition(this.x, this.y + 2).setDepth(3);
    if (Math.floor(_time / 60000) !== Number(this.lastLayout)) {
      this.lastLayout = String(Math.floor(_time / 60000));
      this.drawEnvironment();
    }
  }
}
