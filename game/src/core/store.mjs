import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { initial, settle, apply, publicWorld } from "./world.mjs";
export class Store extends EventEmitter {
  constructor(file = ":memory:", clock = Date.now) {
    super();
    this.clock = clock;
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS world(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(actor TEXT NOT NULL,id TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,id));
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL,started INTEGER,result TEXT);
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    this.db
      .prepare("INSERT OR IGNORE INTO world VALUES(1,?)")
      .run(JSON.stringify(initial(clock())));
    if (this.raw().schema !== 1) throw Error("不支持的存档版本，禁止自动重建");
  }
  raw() {
    return JSON.parse(
      this.db.prepare("SELECT json FROM world WHERE id=1").get().json,
    );
  }
  transact(command, actor = { id: "clock", system: true }) {
    const now = this.clock(),
      events = [];
    let result;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (command) {
        if (!/^[a-zA-Z0-9:_-]{10,120}$/.test(command.requestId || ""))
          throw Error("请求编号无效");
        const found = this.db
          .prepare("SELECT result FROM requests WHERE actor=? AND id=?")
          .get(actor.id, command.requestId);
        if (found) {
          this.db.exec("COMMIT");
          return JSON.parse(found.result);
        }
      }
      const w = this.raw(),
        before = JSON.stringify(w);
      if (command || now - w.settledAt >= 1000) settle(w, now, events);
      if (command) apply(w, command, actor, now, events);
      if (JSON.stringify(w) !== before) {
        w.revision++;
        w.updatedAt = now;
        this.db
          .prepare("UPDATE world SET json=? WHERE id=1")
          .run(JSON.stringify(w));
        for (const e of events) {
          this.db
            .prepare("INSERT INTO events VALUES(?,?,?)")
            .run(e.id, w.revision, JSON.stringify(e));
          if (e.type === "returned") {
            const trip = w.travel.pending.find((t) => t.id === e.data.tripId);
            this.enqueue("photo:" + trip.id, "photo", { tripId: trip.id }, now);
          }
        }
      }
      result = {
        ok: true,
        ...publicWorld(w, now),
        drawing: this.drawingState(),
      };
      if (command)
        this.db
          .prepare("INSERT INTO requests VALUES(?,?,?)")
          .run(actor.id, command.requestId, JSON.stringify(result));
      this.db.exec("COMMIT");
      if (w.revision !== JSON.parse(before).revision)
        this.emit("change", { revision: w.revision });
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  snapshot() {
    return this.transact();
  }
  enqueue(id, kind, payload, due = this.clock()) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO outbox(id,kind,payload,due) VALUES(?,?,?,?)",
      )
      .run(id, kind, JSON.stringify(payload), due);
  }
  // Claim before external effects. A crash or ambiguous send is never retried automatically.
  claim(kind) {
    if (kind === "photo" && this.drawingState().waiting) return null;
    const now = this.clock();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          "SELECT * FROM outbox WHERE kind=? AND status='pending' AND due<=? ORDER BY due LIMIT 1",
        )
        .get(kind, now);
      if (row)
        this.db
          .prepare(
            "UPDATE outbox SET status='attempted',attempts=attempts+1,started=? WHERE id=?",
          )
          .run(now, row.id);
      this.db.exec("COMMIT");
      return row ? { ...row, payload: JSON.parse(row.payload) } : null;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  claimId(id) {
    const row = this.db
      .prepare(
        "SELECT * FROM outbox WHERE id=? AND status='pending' AND due<=?",
      )
      .get(id, this.clock());
    if (!row || (row.kind === "photo" && this.drawingState().waiting))
      return null;
    const r = this.db
      .prepare(
        "UPDATE outbox SET status='attempted',attempts=attempts+1,started=? WHERE id=? AND status='pending'",
      )
      .run(this.clock(), id);
    return r.changes ? { ...row, payload: JSON.parse(row.payload) } : null;
  }
  finish(id, status = "done", result = "") {
    this.db
      .prepare("UPDATE outbox SET status=?,result=? WHERE id=?")
      .run(status, String(result).slice(0, 300), id);
  }
  drawingState() {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key='drawingCooldown'")
      .get();
    const saved = row ? JSON.parse(row.value) : null;
    return saved?.retryAt > this.clock()
      ? {
          waiting: true,
          retryAt: saved.retryAt,
          reason: "GPT生图额度已用完，等待重置",
        }
      : { waiting: false };
  }
  retryPhoto(
    id,
    {
      reason = "绘图任务未完成",
      retryAfterMs = 2 * 3600000,
      rateLimited = false,
    } = {},
  ) {
    const due =
      this.clock() +
      Math.min(
        48 * 3600000 + 300000,
        Math.max(
          60000,
          Number.isFinite(retryAfterMs) ? retryAfterMs : 2 * 3600000,
        ),
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE outbox SET status=CASE WHEN ? OR attempts<3 THEN 'pending' ELSE 'abandoned' END,due=?,result=? WHERE id=? AND kind='photo'",
        )
        .run(rateLimited ? 1 : 0, due, reason, id);
      if (rateLimited)
        this.db
          .prepare(
            "INSERT INTO meta(key,value) VALUES('drawingCooldown',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(JSON.stringify({ retryAt: due }));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
