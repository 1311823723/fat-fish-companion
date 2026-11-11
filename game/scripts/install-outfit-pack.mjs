import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkOutfitPack,ACTIONS} from './check-outfit-pack.mjs';

// Files are copied only after the entire source pack passes validation.
export async function installOutfitPack(source,publicRoot) {
  const checked=await checkOutfitPack(source);
  if(!checked.ok) throw Error('素材检查未通过：\n'+checked.errors.join('\n'));
  const {id,name,actions}=checked.manifest;
  const root=path.resolve(publicRoot), catalogPath=path.join(root,'assets','outfits-v1.json');
  const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
  if(!Array.isArray(catalog.outfits)||catalog.outfits.some(x=>x.id===id)) throw Error('套装清单无效或 ID 已存在');
  const packRoot=path.join(root,'assets','outfits');
  await fs.mkdir(packRoot,{recursive:true});
  const target=path.join(packRoot,id);
  await fs.mkdir(target); // Reject an existing folder; do not overwrite any installed assets.
  const files=[...new Set([...ACTIONS.map(a=>actions[a].file),...(checked.manifest.photoReference?[checked.manifest.photoReference]:[])])];
  for(const file of files) await fs.copyFile(path.join(source,file),path.join(target,file));
  const installed={id,name,actions:Object.fromEntries(ACTIONS.map(a=>[a,{...actions[a],file:`/assets/outfits/${id}/${actions[a].file}`}]))};
  if(checked.manifest.photoDescription) installed.photoDescription=checked.manifest.photoDescription;
  if(checked.manifest.photoReference) installed.photoReference=`/assets/outfits/${id}/${checked.manifest.photoReference}`;
  await fs.writeFile(path.join(target,'outfit.json'),JSON.stringify(checked.manifest,null,2));
  const tmp=catalogPath+'.new';
  await fs.writeFile(tmp,JSON.stringify({...catalog,outfits:[...catalog.outfits,installed]},null,2)+'\n',{flag:'wx'});
  await fs.rename(tmp,catalogPath);
  return installed;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=process.argv[2];
  if(!source){console.error('用法：node scripts/install-outfit-pack.mjs <素材包目录>');process.exitCode=2;}
  else try{const result=await installOutfitPack(path.resolve(source),path.resolve('public'));console.log(`已安装 ${result.name} (${result.id})；游戏接入完成后还需重新构建。`)}catch(e){console.error(e.message);process.exitCode=1;}
}
