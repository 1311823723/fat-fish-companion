import {spawn} from 'node:child_process';
import path from 'node:path';

// One bounded request at a time; release the large model after five idle minutes.
export class ReusableTts {
  constructor(root,config){this.root=root;this.config=config;this.child=null;this.pending=null;this.idle=null;}
  async synthesize(request){
    if(this.pending)throw Error('语音正在合成，请先用文字回复');
    clearTimeout(this.idle);
    if(!this.child)this.start();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.finish(Error('本地语音合成超时，请先用文字回复'));
        this.child?.kill();this.child=null;
      },600000);
      this.pending={name:request.name,resolve,reject,timer};
      this.child.stdin.write(JSON.stringify(request)+'\n',error=>{
        if(error)this.finish(Error('语音引擎连接已断开，请先用文字回复'));
      });
    });
  }
  start(){
    const child=spawn(this.config.pythonPath,[path.join(this.root,'src/qwen-serena-worker.py'),'--serve'],{
      cwd:this.root,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe'],
    });
    this.child=child;let output='',detail='';
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      if(output.length>16384){this.finish(Error('语音引擎返回异常'));child.kill();return;}
      let newline;
      while((newline=output.indexOf('\n'))>=0){
        const line=output.slice(0,newline).trim();output=output.slice(newline+1);
        if(!line)continue;
        try{
          const result=JSON.parse(line);
          if(!result.ok||!this.pending||result.name!==this.pending.name)throw Error('unexpected result');
          this.finish(null,result);
          this.idle=setTimeout(()=>{if(this.child===child&&!this.pending){this.child=null;child.stdin.end();}},300000);
          this.idle.unref();
        }catch{this.finish(Error('语音引擎返回异常'));child.kill();}
      }
    });
    child.stderr.on('data',chunk=>{detail=(detail+chunk.toString()).slice(-2048);});
    child.stdin.on('error',()=>{});
    child.on('error',()=>{if(this.child===child)this.child=null;this.finish(Error('本地语音引擎未能启动'));});
    child.on('close',()=>{
      if(this.child===child){this.child=null;this.finish(Error(/out of memory/i.test(detail)?'本地语音显存不足，请先用文字回复':'本地语音合成失败，请先用文字回复'));}
    });
  }
  finish(error,result){const pending=this.pending;if(!pending)return;this.pending=null;clearTimeout(pending.timer);error?pending.reject(error):pending.resolve(result);}
  close(){clearTimeout(this.idle);const child=this.child;this.child=null;this.finish(Error('语音引擎已关闭'));child?.stdin.end();}
}
