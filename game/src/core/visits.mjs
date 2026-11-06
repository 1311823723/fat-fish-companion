import crypto from 'node:crypto';
const GAP = 30 * 60 * 1000;
const localDay = at => new Date(at + 8 * 3600000).toISOString().slice(0,10);
export class Visits {
  constructor(store) {
    this.store=store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS room_visits(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, day TEXT NOT NULL, qq TEXT, verified INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS room_visits_day ON room_visits(day,at);
      CREATE INDEX IF NOT EXISTS room_visits_qq ON room_visits(qq,at);
      CREATE TABLE IF NOT EXISTS room_visit_presence(actor TEXT PRIMARY KEY,last_seen INTEGER NOT NULL, day TEXT NOT NULL);`);
  }
  record(actor, identity={}, now=this.store.clock()) {
    if (!actor) return;
    const db=this.store.db, day=localDay(now), hash=crypto.createHash('sha256').update(actor).digest('hex');
    const qq=/^[1-9]\d{4,11}$/.test(String(identity.claimedQQ||identity.qq||'')) ? String(identity.claimedQQ||identity.qq) : null;
    db.exec('BEGIN IMMEDIATE');
    try {
      const prior=db.prepare('SELECT last_seen,day FROM room_visit_presence WHERE actor=?').get(hash);
      if (!prior || prior.day!==day || now-prior.last_seen>=GAP) db.prepare('INSERT INTO room_visits(at,day,qq,verified) VALUES(?,?,?,?)').run(now,day,qq,qq && identity.verified && String(identity.qq)===qq ? 1 : 0);
      db.prepare('INSERT INTO room_visit_presence VALUES(?,?,?) ON CONFLICT(actor) DO UPDATE SET last_seen=excluded.last_seen,day=excluded.day').run(hash,now,day);
      db.prepare('DELETE FROM room_visit_presence WHERE last_seen<?').run(now-GAP);
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK');throw e; }
  }
  recent(now=this.store.clock()) {
    const db=this.store.db, day=localDay(now);
    const today=db.prepare('SELECT count(*) AS total, sum(CASE WHEN qq IS NULL THEN 1 ELSE 0 END) AS guests FROM room_visits WHERE day=?').get(day);
    const rows=db.prepare('SELECT at,qq,verified FROM room_visits ORDER BY at DESC LIMIT 500').all();
    return {day,total:today.total,guests:today.guests||0,records:rows.map(x=>({at:x.at,qq:x.qq||'',verified:!!x.verified}))};
  }
}
