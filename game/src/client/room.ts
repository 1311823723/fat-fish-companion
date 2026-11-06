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
  backpackObject!: Phaser.GameObjects.Container;
  clockHands!: Phaser.GameObjects.Graphics;
  tvScreen!: Phaser.GameObjects.Graphics;
  tvLabel!: Phaser.GameObjects.Text;
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
  tapLoading = false;
  petPressPointer: number | null = null;
  groundPressPointer: number | null = null;
  lastTouchAt = 0;
  reactionAnchor: { id: string; x: number; y: number; scale: number } | null =
    null;
  playingReactionId: string | null = null;
  renderedFrames = 0;
  fpsStart = 0;
  constructor(action: Action) {
    super("room");
    this.onAction = action;
  }
  preload() {
    this.load.image("room", "/assets/room-v5.webp");
    this.load.image("television", "/assets/television-v1.webp");
    this.load.image("door", "/assets/fridge-door-v3.webp");
    this.load.image("curtain-fabric", "/assets/curtain-v3.webp");
    this.load.json("room-layout", "/assets/room-layout-v5.json");
    this.load.json("manifest", "/assets/manifest-v4.json");
    this.load.atlas(
      "food-icons-v2",
      "/assets/food-icons-v2.webp",
      "/assets/food-icons-v2.json",
    );
    for (const n of ["idle", "walk_right", "walk_left"])
      this.load.spritesheet(n, "/assets/" + n + "-v1.webp", {
        frameWidth: 256,
        frameHeight: 256,
      });
  }
  create() {
    this.manifest = this.cache.json.get("manifest");
    this.layout = this.cache.json.get("room-layout");
    this.add.image(0, 0, "room").setOrigin(0).setDisplaySize(600, 800);
    const tv = this.layout.objects.find(
      (o: any) => o.id === "television",
    ).bounds;
    this.add
      .image(tv.x, tv.y, "television")
      .setOrigin(0)
      .setDisplaySize(tv.width, tv.height);
    this.tvScreen = this.add.graphics();
    this.tvLabel = this.add
      .text(tv.x + tv.width / 2, tv.y + tv.height * 0.48, "来一局", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "12px",
        color: "#f9edcd",
      })
      .setOrigin(0.5);
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
    this.pet
      .setInteractive({
        useHandCursor: true,
        pixelPerfect: true,
        alphaTolerance: 64,
      })
      .on(
        "pointerdown",
        (
          pointer: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          this.petPressPointer = this.canInteract(pointer) ? pointer.id : null;
        },
      )
      .on(
        "pointerup",
        (
          pointer: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          const pressed = this.petPressPointer === pointer.id;
          this.petPressPointer = null;
          if (
            pressed &&
            this.canInteract(pointer) &&
            pointer.getDistance() < 12
          )
            void this.requestPetReaction();
        },
      )
      .on("pointerout", () => {
        this.petPressPointer = null;
      });
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
      .image(296, 375, "soft-light-v1")
      .setDisplaySize(190, 200)
      .setVisible(false);
    this.fridgeGlow = this.add
      .image(485, 400, "soft-light-v1")
      .setDisplaySize(150, 270)
      .setVisible(false);
    const bag = this.layout.objects.find((o: any) => o.id === "backpack").bounds;
    this.backpackObject = this.add.container(bag.x, bag.y).setDepth(2);
    const bagArt = this.add.graphics();
    bagArt.fillStyle(0x684b37, 0.14).fillEllipse(26, 61, 48, 8);
    bagArt.lineStyle(4, 0x5d7589, 0.9).strokeRoundedRect(16, 2, 20, 21, 8);
    bagArt.fillStyle(0x5e7c91).fillRoundedRect(4, 10, 44, 49, 11);
    bagArt.fillStyle(0x91acb8).fillRoundedRect(7, 11, 38, 44, 9);
    bagArt.fillStyle(0xb8ccd0, 0.8).fillRoundedRect(11, 14, 30, 13, 6);
    bagArt.lineStyle(1.5, 0x637f91).strokeRoundedRect(12, 32, 28, 16, 5);
    bagArt.fillStyle(0xe6c894).fillCircle(26, 36, 2);
    bagArt.lineStyle(1.1, 0xf3e9d2, 0.85).lineBetween(17, 51, 35, 51);
    const bagHit = this.add.zone(bag.width / 2, bag.height / 2, bag.width, bag.height).setInteractive({ useHandCursor: true });
    this.bindTap(bagHit, () => this.onAction("backpack"));
    this.backpackObject.add([bagArt, bagHit]);
    this.notePaper = this.add
      .container(this.layout.note.x, this.layout.note.y)
      .setScale(this.layout.note.scale)
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
      .setInteractive({ useHandCursor: true });
    this.bindTap(hit, () => this.onAction("note"));
    this.notePaper.add([paper, this.note, signature, hit]);
    for (const object of this.layout.objects) {
      if (object.id === "backpack") continue;
      if (!object.actions.length) continue;
      const box = object.bounds;
      const zone = this.add
        .zone(
          box.x + box.width / 2,
          box.y + box.height / 2,
          box.width,
          box.height,
        )
        .setInteractive({ useHandCursor: true });
      this.bindTap(zone, () => this.onAction(object.actions[0]));
    }
    this.input.on(
      "pointerdown",
      (p: Phaser.Input.Pointer, objects: unknown[]) => {
        this.groundPressPointer = (
          this.canInteract(p) &&
          !objects.length &&
          p.y > 620 &&
          this.world?.travel.phase !== "away"
        ) ? p.id : null;
      },
    );
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const pressed = this.groundPressPointer === p.id;
      this.groundPressPointer = null;
      if (pressed && this.canInteract(p) && p.getDistance() < 12 && this.world?.travel.phase !== "away") this.onAction("walk");
    });
    this.events.on("shutdown", () => this.loading.clear());
    this.game.events.emit("room-ready");
    this.drawEnvironment();
    this.time.delayedCall(1000, () => {
      for (const name of ["headpat", "spin"]) this.ensureAnim(name);
    });
  }
  bindTap(zone: Phaser.GameObjects.Zone, action: () => void) {
    let press: number | null = null;
    zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      press = this.canInteract(pointer) ? pointer.id : null;
    });
    zone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const tapped = press === pointer.id;
      press = null;
      if (tapped && this.canInteract(pointer) && pointer.getDistance() < 12) action();
    });
    zone.on("pointerout", () => { press = null; });
  }
  async requestPetReaction() {
    const allowed = () =>
      this.world &&
      this.world.travel.phase !== "away" &&
      !["sleep", "eat", "tea"].includes(this.world.activity.name) &&
      Date.now() + this.offset >= (this.world.petTapReadyAt || 0) &&
      !document.querySelector("dialog[open]");
    if (this.tapLoading || !allowed()) return;
    this.tapLoading = true;
    try {
      for (const name of ["headpat", "spin"]) this.ensureAnim(name);
      if (!this.textures.exists("headpat") || !this.textures.exists("spin"))
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            this.load.off("complete", finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 15000);
          this.load.once("complete", finish);
        });
      if (
        allowed() &&
        this.textures.exists("headpat") &&
        this.textures.exists("spin")
      )
        this.onAction("pet_interact");
    } finally {
      this.tapLoading = false;
    }
  }
  canInteract(pointer: Phaser.Input.Pointer) {
    // Native dialogs must not pass their clicks through to the room below.
    const type = pointer.event?.type || "";
    if (type.startsWith("touch")) this.lastTouchAt = Date.now();
    if (type === "touchcancel") return false;
    if (type.startsWith("mouse") && Date.now() - this.lastTouchAt < 800) return false;
    return (
      pointer.event?.target === this.game.canvas &&
      !document.querySelector("dialog[open]")
    );
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
    this.backpackObject.setVisible(w.travel.phase !== "away");
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
    const tv = this.layout.objects.find(
        (o: any) => o.id === "television",
      ).bounds,
      playing = (w.arcade?.activeCount || 0) > 0;
    this.tvScreen.clear().setDepth(playing ? 7 : 1);
    this.tvScreen.fillStyle(playing ? 0x294b61 : 0x111b32, 1);
    this.tvScreen.fillRoundedRect(
      tv.x + tv.width * 0.087,
      tv.y + tv.height * 0.17,
      tv.width * 0.826,
      tv.height * 0.64,
      4,
    );
    this.tvLabel
      .setText(playing ? "游戏中" : "来一局")
      .setDepth(playing ? 7 : 1)
      .setAlpha(playing ? 1 : 0.65);
    this.clockHands.clear();
    this.clockHands.lineStyle(2.8, 0x5a6c59);
    const d = new Date(now + 28800000),
      minute = d.getUTCMinutes();
    const a = (((h % 12) + minute / 60) * Math.PI) / 6 - Math.PI / 2,
      b = (minute * Math.PI) / 30 - Math.PI / 2;
    this.clockHands.lineBetween(
      this.layout.clock.x,
      this.layout.clock.y,
      this.layout.clock.x + Math.cos(a) * 9,
      this.layout.clock.y + Math.sin(a) * 9,
    );
    this.clockHands.lineStyle(2, 0x5a6c59);
    this.clockHands.lineBetween(
      this.layout.clock.x,
      this.layout.clock.y,
      this.layout.clock.x + Math.cos(b) * 13,
      this.layout.clock.y + Math.sin(b) * 13,
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
              "food-icons-v2",
              f.id,
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
        repeat: this.manifest[name].once ? 0 : -1,
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
      const bed = this.layout.objects.find(
        (o: any) => o.id === "bed",
      ).standPoint;
      tx = bed.x;
      ty = bed.y;
      scale = 0.65;
    } else if (["eat", "tea", "read"].includes(a.name)) {
      name =
        a.name === "read"
          ? "read"
          : a.name === "tea" || a.mealKind === "drink"
            ? "tea"
            : "eat_rice";
      const chair = this.layout.objects.find(
        (x: any) => x.id === "desk",
      ).standPoint;
      tx = chair.x;
      ty = chair.y;
      scale = 0.65;
    } else if (a.name === "sing") {
      name = "sing";
    } else if (a.name === "rest") {
      tx = this.layout.rest.x;
      ty = this.layout.rest.y;
    } else if (
      ["smile", "sleepy", "sad", "angry"].includes(w.mood.expression)
    ) {
      name = "expr_" + w.mood.expression;
    }
    if (
      (w.arcade?.activeCount || 0) > 0 &&
      ["idle", "rest"].includes(a.name) &&
      !a.manual
    ) {
      const point = this.layout.objects.find(
        (o: any) => o.id === "television",
      ).standPoint;
      tx = point.x;
      ty = point.y;
    }
    const reaction =
      w.petReaction && now < w.petReaction.until ? w.petReaction : null;
    if (reaction) {
      if (!this.reactionAnchor || this.reactionAnchor.id !== reaction.id)
        this.reactionAnchor = {
          id: reaction.id,
          x: this.x,
          y: this.y,
          scale: this.pet.scaleX,
        };
      name = reaction.kind;
      tx = this.reactionAnchor.x;
      ty = this.reactionAnchor.y;
      scale = this.reactionAnchor.scale;
    } else {
      this.reactionAnchor = null;
      this.playingReactionId = null;
    }
    const factor = 1 - Math.exp(-Math.min(delta, 100) / 190);
    this.x += (tx - this.x) * factor;
    this.y += (ty - this.y) * factor;
    const key = this.ensureAnim(name);
    if (
      this.pet.anims.currentAnim?.key !== key ||
      (reaction &&
        key === reaction.kind &&
        this.playingReactionId !== reaction.id)
    ) {
      if (reaction && key === reaction.kind) {
        const startFrame = Math.min(
          this.manifest[key].frames - 1,
          Math.floor(
            (Math.max(0, now - reaction.startedAt) * this.manifest[key].fps) /
              1000,
          ),
        );
        this.pet.play({ key, startFrame });
        this.playingReactionId = reaction.id;
      } else this.pet.play(key);
      document.getElementById("game")!.dataset.animation = key;
    }
    this.pet.setPosition(this.x, this.y).setScale(scale).setDepth(4);
    this.shadow.setPosition(this.x, this.y + 2).setDepth(3);
    if (Math.floor(_time / 60000) !== Number(this.lastLayout)) {
      this.lastLayout = String(Math.floor(_time / 60000));
      this.drawEnvironment();
    }
  }
}
