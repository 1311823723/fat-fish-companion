import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

export const ACTIONS=['idle','walk_left','walk_right','sleep','wake','tea','eat_taiyaki','expr_smile','expr_sad','expr_angry','expr_sleepy','read','sing','eat_rice','headpat','spin'];
export async function checkOutfitPack(directory) {
  const dir=path.resolve(directory), errors=[];
  let manifest;
  try { manifest=JSON.parse(await fs.readFile(path.join(dir,'outfit.json'),'utf8')); }
  catch { return {ok:false,errors:['无法读取有效的 outfit.json']}; }
  if(!/^[a-z][a-z0-9_-]{0,39}$/.test(manifest.id||'')) errors.push('id 应为 1～40 位小写字母、数字、下划线或短横线，且以字母开头');
  if(typeof manifest.name!=='string'||!manifest.name.trim()||manifest.name.length>40) errors.push('name 应为 1～40 个字符');
  if(manifest.photoDescription !== undefined && (typeof manifest.photoDescription !== 'string' || manifest.photoDescription.length > 300)) errors.push('photoDescription 应为 300 字以内的文字');
  if(manifest.photoReference !== undefined) {
    if(typeof manifest.photoReference!=='string'||!/^[-a-zA-Z0-9_]+\.png$/.test(manifest.photoReference)) errors.push('photoReference 必须是包内 PNG 文件名');
    else try {const p=path.join(dir,manifest.photoReference),st=await fs.lstat(p),meta=await sharp(p,{limitInputPixels:16000000}).metadata();if(!st.isFile()||st.isSymbolicLink()||meta.format!=='png')throw Error();} catch {errors.push('photoReference 不是有效的包内 PNG 文件');}
  }
  if(!manifest.actions || typeof manifest.actions!=='object' || Array.isArray(manifest.actions)) return {ok:false,errors:[...errors,'actions 必须是动作映射']};
  for(const action of ACTIONS){
    const item=manifest.actions[action];
    if(!item || typeof item!=='object'){errors.push(`${action}: 缺少动作`);continue;}
    const {file,frames,fps,grid}=item;
    if(typeof file!=='string'||!/^[-a-zA-Z0-9_]+\.(png|webp)$/.test(file)){errors.push(`${action}: 文件名不合法`);continue;}
    if(!Number.isInteger(frames)||frames<1||frames>60||!Number.isFinite(fps)||fps<1||fps>60){errors.push(`${action}: frames 或 fps 不合法`);continue;}
    try {
      const full=path.join(dir,file), stat=await fs.lstat(full);
      if(!stat.isFile()||stat.isSymbolicLink()){errors.push(`${action}: 文件必须是素材包内的普通文件`);continue;}
      const image=await sharp(full,{limitInputPixels:256*256*60}).metadata();
      if(grid){
        const {columns,columnStep,offsetY,rowStep,width,height}=grid;
        const valid=Number.isInteger(columns)&&columns>=1&&columns<=16&&Number.isFinite(columnStep)&&columnStep>=1&&Number.isInteger(offsetY)&&offsetY>=0&&Number.isInteger(rowStep)&&rowStep>=1&&Number.isInteger(width)&&width>=32&&width<=512&&Number.isInteger(height)&&height>=32&&height<=1024;
        if(!valid||Math.floor((columns-1)*columnStep)+width>image.width||offsetY+Math.floor((frames-1)/columns)*rowStep+height>image.height) errors.push(`${action}: grid 区域超出图片或参数无效`);
      } else {
        const columns=Math.min(8,frames), rows=Math.ceil(frames/columns);
        if(![256*columns,2048].includes(image.width)||image.height!==256*rows) errors.push(`${action}: 应为 ${256*columns} 或 2048 像素宽，${256*rows} 像素高（每行最多8帧）`);
      }
      if(!image.hasAlpha) errors.push(`${action}: 图片需要透明通道`);
      else for(const [left,top] of [[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]]){
        const alpha=await sharp(full).extract({left,top,width:1,height:1}).extractChannel('alpha').raw().toBuffer();
        if(alpha[0]>8){errors.push(`${action}: 角落不是透明背景`);break;}
      }
    }catch{errors.push(`${action}: 不能读取图片 ${file}`)}
  }
  return {ok:errors.length===0,errors,manifest};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=process.argv[2];
  if(!dir){console.error('用法：node scripts/check-outfit-pack.mjs <素材包目录>');process.exitCode=2;}
  else {const result=await checkOutfitPack(dir);if(result.ok)console.log(`套装检查通过：${result.manifest.name} (${result.manifest.id})`);else {console.error(result.errors.join('\n'));process.exitCode=1;}}
}
