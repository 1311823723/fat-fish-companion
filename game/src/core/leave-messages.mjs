import crypto from 'node:crypto';

// The session cookie is needed by the existing chat service. Encrypt it at rest.
export class LeaveMessages {
  constructor(store, secret, deliver) {
    if (String(secret || '').length < 32) throw Error('留言服务缺少加密密钥');
    this.store = store;
    this.key = crypto.createHash('sha256').update(secret).digest();
    this.deliver = deliver;
    this.running = false;
    this.nextDeliveryAt = 0;
    store.db.exec(`CREATE TABLE IF NOT EXISTS room_leave_messages (
      actor TEXT NOT NULL, id TEXT NOT NULL, text TEXT NOT NULL, cookie TEXT NOT NULL,
      created INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY(actor,id))`);
    const columns = new Set(store.db.prepare('PRAGMA table_info(room_leave_messages)').all().map(x=>x.name));
    for (const [name, type] of [['answer','TEXT'],['notify_qq','TEXT'],['updated','INTEGER'],['attempts','INTEGER NOT NULL DEFAULT 0']])
      if (!columns.has(name)) store.db.exec(`ALTER TABLE room_leave_messages ADD COLUMN ${name} ${type}`);
    // An interrupted upstream call may already have succeeded. Do not send it twice.
    store.db.prepare("UPDATE room_leave_messages SET status='uncertain' WHERE status='working'").run();
  }
  seal(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  unseal(value) {
    const b = Buffer.from(value, 'base64'), decipher = crypto.createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8');
  }
  add(actor, cookie, body, verifiedQQ = '') {
    const text = String(body.text || '').trim();
    if (!text || text.length > 500 || !/^[a-zA-Z0-9-]{10,80}$/.test(String(body.requestId || ''))) throw Error('留言内容或编号无效');
    const old = this.store.db.prepare('SELECT text,status FROM room_leave_messages WHERE actor=? AND id=?').get(actor, body.requestId);
    if (old) { if (old.text !== text) throw Error('留言编号已使用'); return; }
    if (this.store.db.prepare("SELECT count(*) n FROM room_leave_messages WHERE actor=? AND status IN ('pending','working')").get(actor).n >= 10) throw Error('留言有点多，等她回来再说吧');
    const qq = body.notifyMe === true && /^[1-9]\d{4,11}$/.test(verifiedQQ) ? verifiedQQ : '';
    this.store.db.prepare("INSERT INTO room_leave_messages(actor,id,text,cookie,created,status,notify_qq,updated) VALUES(?,?,?,?,?,'pending',?,?)").run(actor, body.requestId, text, this.seal(cookie), Date.now(), qq, Date.now());
  }
  waiting(actor) {
    return this.store.db.prepare("SELECT id,text,created,status FROM room_leave_messages WHERE actor=? AND status!='done' ORDER BY created").all(actor).map(x => ({ id:x.id, role:'user', text:x.text, at:x.created, pending:x.status, source:'web' }));
  }
  list(actor) {
    return this.store.db.prepare('SELECT id,text,created,status,answer,updated FROM room_leave_messages WHERE actor=? ORDER BY created DESC LIMIT 100').all(actor).map(x=>({id:x.id,text:x.text,at:x.created,status:x.status,answer:x.answer||'',updated:x.updated||x.created}));
  }
  retry(actor,id) {
    const row=this.store.db.prepare('SELECT status,cookie FROM room_leave_messages WHERE actor=? AND id=?').get(actor,id);
    if (!row || row.status !== 'failed' || !row.cookie) throw Error('这条留言暂时不能重试');
    this.store.db.prepare("UPDATE room_leave_messages SET status='pending',updated=? WHERE actor=? AND id=? AND status='failed'").run(Date.now(),actor,id);
  }
  async process() {
    if (this.running || Date.now() < this.nextDeliveryAt || this.store.snapshot().travel.phase === 'away') return;
    const row = this.store.db.prepare("SELECT * FROM room_leave_messages WHERE status='pending' ORDER BY created LIMIT 1").get();
    if (!row) return;
    this.running = true;
    this.store.db.prepare("UPDATE room_leave_messages SET status='working',updated=?,attempts=attempts+1 WHERE actor=? AND id=?").run(Date.now(),row.actor,row.id);
    try {
      const deliveryId = row.attempts ? row.id.slice(0,60)+'-retry-'+row.attempts : row.id;
      const result = await this.deliver(this.unseal(row.cookie), { text:row.text, requestId:deliveryId });
      if (!result.ok) {
        this.store.db.prepare("UPDATE room_leave_messages SET status='failed',updated=? WHERE actor=? AND id=?").run(Date.now(),row.actor,row.id);
        return;
      }
      this.store.db.exec('BEGIN IMMEDIATE');
      try {
        this.store.db.prepare("UPDATE room_leave_messages SET status='done',answer=?,cookie='',updated=? WHERE actor=? AND id=?").run(String(result.message?.text||'').slice(0,900),Date.now(),row.actor,row.id);
        if (row.notify_qq) this.store.enqueue('leave-notify:'+crypto.createHash('sha256').update(row.actor+':'+row.id).digest('hex'),'leave-notify',{target:'private:'+row.notify_qq},Date.now());
        this.store.db.exec('COMMIT');
      } catch(e) { this.store.db.exec('ROLLBACK'); throw e; }
    } catch {
      this.store.db.prepare("UPDATE room_leave_messages SET status='uncertain',updated=? WHERE actor=? AND id=?").run(Date.now(),row.actor,row.id);
    } finally { this.running = false; this.nextDeliveryAt = Date.now() + 10000; }
  }
}
