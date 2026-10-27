import {ReusableTts} from './reusable-tts.js';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
export function normalizeSpeech(text){
 const value=String(text||'').trim();
 if(!value||[...value].length>160)throw Error('语音请用1到160字的短句，长内容用文字');
 if(/https?:\/\/|\[CQ:|```|[\x00-\x08\x0b\x0c\x0e-\x1f]/i.test(value))throw Error('语音只读自然短句，请去掉链接、代码和控制标记');
 return value;
}
export class LocalTts {
 constructor(root,config={}){this.root=root;this.config=config;this.busy=false;this.reusable=null;}
 async synthesize(text){
  const value=normalizeSpeech(text);
  if(this.busy)throw Error('嗓子正在合成上一句话，请先用文字，不要重复重试');
  this.busy=true;
  try {
   if(this.config.engine==='qwen3-tts-serena-casual'){
    this.reusable??=new ReusableTts(this.root,this.config);
    const name='tts-'+crypto.randomUUID()+'.wav';
    const r=await this.reusable.synthesize({text:value,name,runtime:this.config.runtimeDir,output:path.join(this.root,'audio','generated')});
    return {...r,file:path.join(this.root,'audio','generated',name),voice:'generated/'+name};
   }
   return await new Promise((resolve,reject)=>{
    const name='tts-'+crypto.randomUUID()+'.wav';let output='',err='',settled=false;
    const sayu=this.config.engine==='gpt-sovits-v2-sayu';
    const paimon=this.config.engine==='gpt-sovits-v4-paimon';
    const winefox=this.config.engine==='gpt-sovits-v2pro-winefox';
    const qwen=this.config.engine==='qwen3-tts-serena-casual';
    const pythonEngine=paimon||sayu||winefox||qwen;
    const executable=pythonEngine?this.config.pythonPath:process.execPath;
    const worker=path.join(this.root,'src',qwen?'qwen-serena-worker.py':winefox?'winefox-worker.py':sayu?'sayu-worker.py':paimon?'paimon-worker.py':'tts-worker.cjs');
    const child=spawn(executable,[worker],{cwd:this.root,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe']});
    const done=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{child.kill();done(Error('本地语音合成超时，请先用文字回复'));},qwen?600000:pythonEngine?150000:90000);
    child.stdout.on('data',c=>{output=(output+c).slice(-8192);});child.stderr.on('data',c=>{err=(err+c).slice(-2048);});
    child.on('error',()=>done(Error('本地语音运行库未能启动，请先用文字回复')));
    child.on('close',code=>{try{if(code!==0)throw Error('failed');const line=output.trim().split(/\r?\n/).reverse().find(l=>l.startsWith('{'));const r=JSON.parse(line);if(!r.ok||r.name!==name)throw Error('invalid result');done(null,{...r,file:path.join(this.root,'audio','generated',name),voice:'generated/'+name});}catch{try{fs.writeFileSync(path.join(this.root,'state','tts-last-error.json'),JSON.stringify({time:new Date().toISOString(),engine:this.config.engine,code,detail:err},null,2));}catch{}done(Error(/out of memory/i.test(err)?'本地语音显存不足，请先用文字回复':'本地语音合成失败，请先用文字回复，管理员可检查模型和运行库'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({text:value,name,sid:Number(this.config.speakerId)||3,runtime:this.config.runtimeDir,output:path.join(this.root,'audio','generated')}));
   });
  }finally{this.busy=false;}
 }
}
