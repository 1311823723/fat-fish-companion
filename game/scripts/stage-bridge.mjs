import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
const source = process.argv[2],
  output = process.argv[3];
if (!source || !output) throw Error("提供旧项目和独立暂存路径");
fs.mkdirSync(path.join(output, "src"), { recursive: true });
function replace(s, old, next) {
  if (!s.includes(old))
    throw Error("接口已改变，禁止盲目修改：" + old.slice(0, 50));
  return s.replace(old, next);
}
function replaceAfter(s, old, next, after) {
  const start = s.indexOf(after),
    pos = s.indexOf(old, start);
  if (start < 0 || pos < 0) throw Error("找不到 WebRoom 初始化位置");
  return s.slice(0, pos) + next + s.slice(pos + old.length);
}
let s = fs
  .readFileSync(path.join(source, "src/bridge.js"), "utf8")
  .replace(/\r\n/g, "\n");
s = "import {installGameCore} from './game-core-adapter.mjs';\n" + s;
s = replaceAfter(
  s,
  "  fs.mkdirSync(STATE_DIR, { recursive: true });",
  "  const gameCore=installGameCore(webRoom,{root:ROOT});\n  if(gameCore){try{await gameCore.refresh();}catch{log('[game-core] 核心重连中，QQ继续运行');}roomWeather.state=()=>{try{return webRoom.publicState().weather;}catch{return {available:false,stale:true};}};roomWeather.prompt=()=> '【统一小屋天气】'+JSON.stringify(roomWeather.state());}\n\n  fs.mkdirSync(STATE_DIR, { recursive: true });",
  "  const webRoom =",
);
s = replace(
  s,
  "    const bytes=fs.readFileSync(path.join(STATE_DIR,'travel-photos',trip.photo.id+'.img'));",
  "    const bytes=fs.readFileSync(path.join(gameCore?.photoDirectory||path.join(STATE_DIR,'travel-photos'),trip.photo.id+'.img'));",
);
s = replace(
  s,
  "guard();webRoom.syncTravel(Date.now());const c=",
  "guard();if(gameCore)await gameCore.refresh();webRoom.syncTravel(Date.now());const c=",
);
s = replace(
  s,
  "  async function checkTravel(){",
  `  async function checkTravel(){
    if(gameCore){
      if(currentMode!=='reserved2'||socialV2.paused||!snowlumaHealth.connected||cfg.socialV2?.proactive?.enabled===false)return;
      try{await gameCore.tick({
        generate:messages=>generateRoomReply(messages,{root:ROOT}),
        chooseTargets:async trip=>{await chooseTravelTargets(trip,Date.now());return trip.share.targets||[];},
        isAllowed:key=>isSessionAllowedInCurrentMode(key)&&!shouldBlockSilentReply(key),
        isBusy:key=>{const h=new Date(Date.now()+28800000).getUTCHours();if(h<8||h>=23)return true;return [...socialV2.conversations].some(([k,st])=>(!key||key===k)&&(isConversationBusyV2(k,st)||Date.now()-(st.lastIncomingAt||0)<15*60000));},
        sendProgress:sendTravelProgress,sendPhoto:sendTravelPhoto,
        record:(key,text)=>recordSentMessagesV2(key,[text])
      });}catch(error){log('[game-core] 连接暂不可用，停止生活写入');}return;
    }`,
);
s = replace(
  s,
  "  async function sendWakePromptV2(key, reason) {",
  "  async function sendWakePromptV2(key, reason) {\n    if(gameCore){try{await gameCore.refresh();}catch{}}",
);
fs.writeFileSync(path.join(output, "src/bridge.js"), s);
s = fs
  .readFileSync(path.join(source, "src/room-public-server.mjs"), "utf8")
  .replace(/\r\n/g, "\n");
s =
  "import {routeGame,installGameEvents} from './game-public-adapter.mjs';\n" +
  s;
s = replace(
  s,
  "  try{\n   const url=new URL(req.url,'http://localhost');",
  "  try{\n   if(await routeGame(req,res,{root}))return;\n   const url=new URL(req.url,'http://localhost');",
);
s = replace(
  s,
  "clean.name=typeof body.name==='string'?body.name:'';",
  "clean.requestId=body.requestId;clean.name=typeof body.name==='string'?body.name:'';",
);
s = replace(
  s,
  "server.requestTimeout=25000;server.headersTimeout=10000;return server;",
  "server.requestTimeout=110000;server.headersTimeout=10000;installGameEvents(server,{root});return server;",
);
fs.writeFileSync(path.join(output, "src/room-public-server.mjs"), s);
for (const name of ["game-core-adapter.mjs", "game-public-adapter.mjs"])
  fs.copyFileSync(
    path.join(ROOT, "adapters", name),
    path.join(output, "src", name),
  );
console.log("兼容适配已暂存；尚未修改运行项目。");
