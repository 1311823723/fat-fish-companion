import crypto from 'node:crypto';

const DAY=86400000;
const requester=(actor)=>crypto.createHash('sha256').update(actor.verifiedQQ?'qq:'+actor.verifiedQQ:'guest:'+actor.id).digest('hex');
const masked=(identity={})=>{
  const qq=String(identity.verified?identity.qq:identity.claimedQQ||'');
  if(!/^[1-9]\d{4,11}$/.test(qq))return '访客';
  return 'QQ '+qq.slice(0,2)+'****'+qq.slice(-2)+(identity.verified?'':'（自填）');
};
export class PublicBoard {
  constructor(store){
    this.store=store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS room_public_board (
      id TEXT PRIMARY KEY, author_key TEXT NOT NULL, request_id TEXT NOT NULL,
      author TEXT NOT NULL, content TEXT NOT NULL, created INTEGER NOT NULL,
      reply TEXT NOT NULL DEFAULT '', reply_status TEXT NOT NULL DEFAULT 'pending',
      attempt INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(author_key,request_id));
      CREATE INDEX IF NOT EXISTS room_public_board_created ON room_public_board(created DESC,id DESC);`);
    store.db.prepare(`UPDATE room_public_board SET reply_status='failed' WHERE deleted=0 AND reply_status IN ('pending','working') AND EXISTS (SELECT 1 FROM outbox WHERE kind='board-reply' AND status IN ('attempted','abandoned','uncertain') AND json_extract(payload,'$.postId')=room_public_board.id AND json_extract(payload,'$.attempt')=room_public_board.attempt)`).run();
  }
  list(actor,before=''){
    this.store.db.prepare(`UPDATE room_public_board SET reply_status='failed' WHERE deleted=0 AND reply_status IN ('pending','working') AND EXISTS (SELECT 1 FROM outbox WHERE kind='board-reply' AND status='attempted' AND started<? AND json_extract(payload,'$.postId')=room_public_board.id AND json_extract(payload,'$.attempt')=room_public_board.attempt)`).run(this.store.clock()-180000);
    if(before&&!/^[0-9a-f-]{36}$/.test(before))throw Error('留言位置无效');
    const db=this.store.db, key=actor?requester(actor):'', cursor=before?db.prepare('SELECT created,id FROM room_public_board WHERE id=?').get(before):null;
    if(before&&!cursor)throw Error('留言位置已变化，请重新打开');
    const rows=cursor?db.prepare('SELECT * FROM room_public_board WHERE deleted=0 AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT 21').all(cursor.created,cursor.created,cursor.id):db.prepare('SELECT * FROM room_public_board WHERE deleted=0 ORDER BY created DESC,id DESC LIMIT 21').all();
    const page=rows.slice(0,20);
    return {entries:page.map(x=>({id:x.id,author:x.author,text:x.content,at:x.created,reply:x.reply,replyStatus:x.reply_status,canManage:!!actor&&(actor.identity?.canReadDiary||x.author_key===key)})),nextCursor:rows.length>20?page.at(-1).id:null};
  }
  post(actor,body){
    if(!/^[a-zA-Z0-9-]{10,80}$/.test(String(body.requestId||'')))throw Error('留言编号无效');
    const text=String(body.text||'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim();
    if(!text||Array.from(text).length>240)throw Error('请输入 1～240 字的留言');
    const db=this.store.db,key=requester(actor),now=this.store.clock();
    db.exec('BEGIN IMMEDIATE');try{
      const existing=db.prepare('SELECT id,content FROM room_public_board WHERE author_key=? AND request_id=?').get(key,body.requestId);
      if(existing){if(existing.content!==text)throw Error('留言编号已使用');db.exec('COMMIT');return existing.id;}
      if(db.prepare('SELECT count(*) n FROM room_public_board WHERE author_key=? AND created>?').get(key,now-10*60000).n>=3)throw Error('留言有点频繁，歇一会儿再来');
      if(db.prepare('SELECT count(*) n FROM room_public_board WHERE created>?').get(now-DAY).n>=500)throw Error('今天留言较多，请稍后再来');
      const id=crypto.randomUUID();db.prepare("INSERT INTO room_public_board(id,author_key,request_id,author,content,created) VALUES(?,?,?,?,?,?)").run(id,key,body.requestId,masked(actor.identity),text,now);
      this.store.enqueue('board:'+id+':0','board-reply',{postId:id,attempt:0},now);
      db.exec('COMMIT');return id;
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  manage(actor,body){
    const row=this.store.db.prepare('SELECT * FROM room_public_board WHERE id=? AND deleted=0').get(String(body.id||''));
    if(!row||!(actor.identity?.canReadDiary||row.author_key===requester(actor)))throw Error('没有权限管理这条留言');
    if(body.op==='delete'){
      this.store.db.prepare("UPDATE room_public_board SET deleted=1,content='',reply='' WHERE id=?").run(row.id);return;
    }
    if(body.op==='retry'&&row.reply_status==='failed'){
      if(row.attempt>=2)throw Error('这条留言已经重试过两次，稍后再来');
      const attempt=row.attempt+1,db=this.store.db;db.exec('BEGIN IMMEDIATE');try{
        const changed=db.prepare("UPDATE room_public_board SET reply_status='pending',attempt=? WHERE id=? AND reply_status='failed' AND deleted=0").run(attempt,row.id);
        if(!changed.changes)throw Error('留言状态已变化');
        this.store.enqueue('board:'+row.id+':'+attempt,'board-reply',{postId:row.id,attempt},this.store.clock());db.exec('COMMIT');return;
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    throw Error('当前不能重试');
  }
  start(id,attempt){
    const db=this.store.db,row=db.prepare('SELECT content FROM room_public_board WHERE id=? AND deleted=0 AND reply_status=\'pending\' AND attempt=?').get(id,attempt);
    if(!row)return null;
    db.prepare("UPDATE room_public_board SET reply_status='working' WHERE id=? AND deleted=0 AND reply_status='pending' AND attempt=?").run(id,attempt);
    return {text:row.content};
  }
  finish(id,attempt,reply){
    const value=Array.from(String(reply||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,240).join('');
    this.store.db.prepare("UPDATE room_public_board SET reply=?,reply_status=? WHERE id=? AND deleted=0 AND (reply_status='working' OR (reply_status='pending' AND ?='')) AND attempt=?").run(value,value?'done':'failed',id,value,attempt);
  }
}
