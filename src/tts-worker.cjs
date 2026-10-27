const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{raw+=c;if(raw.length>8192)process.exit(2);});
process.stdin.on('end',async()=>{
 try {
  const input=JSON.parse(raw),text=String(input.text||'').trim();
  if(!text||[...text].length>160)throw Error('text length');
  if(!/^tts-[a-f0-9-]+\.wav$/.test(input.name))throw Error('invalid output name');
  const sid=Number.isInteger(input.sid)&&input.sid>=3&&input.sid<=57?input.sid:3;
  const dir=path.join(root,'models','kokoro-int8-multi-lang-v1_1'),outDir=path.join(root,'audio','generated');
  const s=require('sherpa-onnx-node'),start=Date.now();
  const tts=await s.OfflineTts.createAsync({model:{kokoro:{model:path.join(dir,'model.int8.onnx'),voices:path.join(dir,'voices.bin'),tokens:path.join(dir,'tokens.txt'),
   dataDir:path.join(dir,'espeak-ng-data'),lexicon:path.join(dir,'lexicon-us-en.txt')+','+path.join(dir,'lexicon-zh.txt'),lang:'zh'},numThreads:2,provider:'cpu',debug:0},maxNumSentences:1});
  const audio=await tts.generateAsync({text,sid,speed:1.0});
  const duration=audio.samples.length/audio.sampleRate;
  if(!Number.isFinite(duration)||duration<=0||duration>45)throw Error('audio duration');
  fs.mkdirSync(outDir,{recursive:true});
  const file=path.join(outDir,input.name);
  if(!s.writeWave(file,{samples:audio.samples,sampleRate:audio.sampleRate}))throw Error('write wave');
  console.log(JSON.stringify({ok:true,name:input.name,duration,elapsedMs:Date.now()-start,sampleRate:audio.sampleRate}));
 }catch(e){console.error('TTS worker failed: '+e.message);process.exitCode=1;}
});
