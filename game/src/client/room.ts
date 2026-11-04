import Phaser from "phaser";
export type World = any;
type Action = (name: string) => void;
export class Room extends Phaser.Scene {
  world: World = null;
  pet!: Phaser.GameObjects.Sprite;
  shadow!: Phaser.GameObjects.Ellipse;
  sky!: Phaser.GameObjects.Graphics;
  curtain!: Phaser.GameObjects.Graphics;
  dark!: Phaser.GameObjects.Rectangle;
  glow!: Phaser.GameObjects.Image;
  fridgeGlow!: Phaser.GameObjects.Image;
  door!: Phaser.GameObjects.Image;
  foods!: Phaser.GameObjects.Group;
  note!: Phaser.GameObjects.Text;
  clockHands!: Phaser.GameObjects.Graphics;
  manifest: any;
  offset = 0;
  x = 300;
  y = 710;
  fridgeOpen = false;
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
    this.load.image("room", "/assets/room-v1.webp");
    this.load.image("door", "/assets/fridge-door-v1.webp");
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
    this.add.image(0, 0, "room").setOrigin(0).setDisplaySize(600, 800);
    this.sky = this.add.graphics();
    this.curtain = this.add.graphics();
    this.clockHands = this.add.graphics();
    this.foods = this.add.group();
    this.door = this.add
      .image(0, 0, "door")
      .setOrigin(0)
      .setDisplaySize(600, 800);
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
    this.note = this.add
      .text(240, 568, "", {
        fontFamily: "Microsoft YaHei",
        fontSize: "12px",
        color: "#715e49",
        backgroundColor: "#fff5d6",
        padding: { x: 6, y: 8 },
        wordWrap: { width: 65 },
      })
      .setRotation(0.06)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onAction("note"));
    for (const [name, x, y, w, h] of [
      ["curtain", 300, 143, 160, 200],
      ["light", 299, 389, 64, 50],
      ["fridge", 498, 429, 112, 220],
      ["diary", 140, 570, 72, 60],
      ["album", 217, 570, 64, 60],
    ] as [string, number, number, number, number][]) {
      this.add
        .zone(x, y, w, h)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.onAction(name));
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
    this.world = w;
    this.offset = w.serverTime - Date.now();
    if (this.pet) this.drawEnvironment();
  }
  toggleFridge() {
    this.fridgeOpen = !this.fridgeOpen;
    this.drawEnvironment();
  }
  drawEnvironment() {
    if (!this.world || !this.sky) return;
    const w = this.world,
      now = Date.now() + this.offset,
      h = new Date(now + 28800000).getUTCHours(),
      night = h < 5 || h >= 19;
    const weather = w.weather.available ? w.weather.kind : "unknown",
      rain = ["rain", "thunder"].includes(weather);
    const g = this.sky;
    g.clear();
    const color = night
      ? 0x283d59
      : h < 7
        ? 0xa1adb9
        : h >= 17
          ? 0xe0b48e
          : h < 11
            ? 0xc7d8cc
            : weather === "clear"
              ? 0xb9d7d5
              : 0xaabdc0;
    g.fillStyle(color);
    g.fillRoundedRect(223, 37, 148, 197, { tl: 74, tr: 74, bl: 0, br: 0 });
    g.fillStyle(night ? 0xeae7c9 : 0xffedb9);
    if (night && ["clear", "cloudy"].includes(weather)) {
      g.fillCircle(267, 91, 13);
      for (let i = 0; i < 7; i++)
        g.fillCircle(245 + i * 16, 60 + (i % 3) * 20, 1);
    } else if (!night && h >= 7 && ["clear", "cloudy"].includes(weather))
      g.fillCircle(h < 11 ? 265 : 325, h < 11 || h >= 17 ? 178 : 110, 20);
    g.fillStyle(night ? 0x49635c : 0x9cb39b);
    g.fillEllipse(270, 210, 96, 58);
    g.fillEllipse(335, 204, 75, 60);
    g.fillStyle(night ? 0x3b5554 : 0x839c88);
    g.fillRect(223, 220, 148, 14);
    if (["cloudy", "overcast", "rain", "thunder"].includes(weather)) {
      g.fillStyle(0xd7dddb, 0.8);
      g.fillEllipse(277, 105, 78, 25);
      g.fillEllipse(340, 143, 56, 17);
    }
    if (rain) {
      g.lineStyle(2, 0xb8dbe1, 0.85);
      for (let i = 0; i < 20; i++)
        g.lineBetween(
          232 + (i % 8) * 18,
          110 + Math.floor(i / 8) * 40,
          228 + (i % 8) * 18,
          122 + Math.floor(i / 8) * 40,
        );
    }
    if (weather === "snow") {
      g.fillStyle(0xfffdf5);
      for (let i = 0; i < 20; i++)
        g.fillCircle(230 + (i % 8) * 19, 105 + Math.floor(i / 8) * 45, 2.5);
    }
    if (weather === "fog") {
      g.fillStyle(0xf5f5eb, 0.35);
      g.fillRect(223, 120, 148, 104);
    }
    if (weather === "thunder") {
      g.fillStyle(0xfff0ba);
      g.fillTriangle(300, 125, 291, 146, 311, 146);
    }
    g.lineStyle(7, 0xfff8e6);
    g.lineBetween(296, 49, 296, 231);
    g.lineBetween(224, 151, 370, 151);
    this.curtain.clear();
    if (w.furnishings.curtainClosed) {
      this.curtain.fillStyle(0xd8c5ad);
      this.curtain.fillRoundedRect(221, 36, 152, 199, {
        tl: 72,
        tr: 72,
        bl: 0,
        br: 0,
      });
      this.curtain.lineStyle(2, 0xbeaa93, 0.5);
      for (let i = 0; i < 8; i++)
        this.curtain.lineBetween(233 + i * 18, 77, 233 + i * 18, 233);
    }
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
    this.door.setVisible(!this.fridgeOpen);
    this.foods.clear(true, true);
    let i = 0;
    for (const f of w.kitchen.items)
      for (let n = 0; n < f.count; n++, i++)
        this.foods.add(
          this.add
            .image(
              469 + (i % 3) * 30,
              370 + Math.floor(i / 3) * 46,
              "food-" + f.id,
            )
            .setDisplaySize(29, 25)
            .setDepth(1),
        );
    this.door.setDepth(2);
    this.dark
      .setDepth(6)
      .setAlpha(
        night
          ? w.furnishings.lightOn
            ? 0.16
            : w.furnishings.curtainClosed
              ? 0.78
              : 0.48
          : w.furnishings.lightOn
            ? 0
            : 0.12,
      );
    this.glow.setDepth(7).setVisible(w.furnishings.lightOn);
    this.fridgeGlow.setDepth(7).setVisible(this.fridgeOpen);
    this.note
      .setText(w.travel.note || "")
      .setVisible(w.travel.phase === "away")
      .setDepth(5);
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
    const w = this.world,
      away = w.travel.phase === "away";
    this.pet.setVisible(!away);
    this.shadow.setVisible(!away);
    if (away) return;
    const a = w.activity;
    let name = "idle",
      tx = 300,
      ty = 710,
      scale = 0.82;
    const now = Date.now() + this.offset;
    if (a.name === "walk") {
      tx = 300 + Math.sin((now - a.startedAt) / 4200) * 160;
      name = tx > this.x ? "walk_right" : "walk_left";
    } else if (a.name === "sleep") {
      name = "sleep";
      tx = 125;
      ty = 430;
      scale = 0.65;
    } else if (["eat", "tea"].includes(a.name)) {
      name = a.name === "tea" ? "tea" : "eat_taiyaki";
      tx = 430;
      ty = 610;
    } else if (a.name === "rest") {
      tx = 300;
      ty = 690;
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
