import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';

export async function optimizeOutfits(publicRoot) {
 const root=path.resolve(publicRoot),assets=path.join(root,'assets'),catalogPath=path.join(assets,'outfits-v1.json');
 const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
 let sourceBytes=0,runtimeBytes=0,previewBytes=0;
 const encode=async(source,targetDirectory,prefix,preview=false)=>{
  const st=await fs.lstat(source);if(!st.isFile()||st.isSymbolicLink())throw Error('Outfit source must be a regular file');
  const bytes=await fs.readFile(source),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const filename=`${prefix}-${hash}.webp`,target=path.join(targetDirectory,filename);
  try{await fs.access(target);}catch{
   let image=sharp(bytes);
   if(preview)image=image.resize({width:280,height:320,fit:'inside',withoutEnlargement:true});
   await image.webp({quality:86,alphaQuality:100,effort:5,smartSubsample:true}).toFile(target);
  }
  return {filename,source:bytes.length,bytes:(await fs.stat(target)).size};
 };
 for(const item of catalog.outfits){
  if(item.id==='original'){
   const p=await encode(path.join(assets,'reference-v1.png'),assets,'wardrobe-original',true);
   item.preview='/assets/'+p.filename;previewBytes+=p.bytes;continue;
  }
  if(!/^[a-z][a-z0-9_-]{0,39}$/.test(item.id))throw Error('Invalid outfit id');
  const directory=path.join(assets,'outfits',item.id),manifestPath=path.join(directory,'outfit.json');
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  for(const [name,a]of Object.entries(manifest.actions)){
   if(!/^[a-z][a-z0-9_]{0,39}$/.test(name))throw Error('Invalid action name');
   let source=a.file;
   if(source.includes('-runtime-'))source=source.replace(/-runtime-[a-f0-9]{12}\.webp$/,'.png');
   if(!/^[-a-zA-Z0-9_]+\.(png|webp)$/.test(source))throw Error('Invalid source filename');
   try{await fs.access(path.join(directory,source));}catch{
    // Installed optimized packs may contain only WebP; aliases may share another action's PNG.
    if(/^[a-z0-9_-]+-runtime-[a-f0-9]{12}\.webp$/.test(a.file)){const st=await fs.stat(path.join(directory,a.file));runtimeBytes+=st.size;continue;}
    throw Error('Missing outfit source: '+source);
   }
   const encoded=source.endsWith('.png')?await encode(path.join(directory,source),directory,name+'-runtime'):null;
   if(encoded){sourceBytes+=encoded.source;runtimeBytes+=encoded.bytes;a.file=encoded.filename;item.actions[name].file=`/assets/outfits/${item.id}/${encoded.filename}`;}
  }
  if(manifest.photoReference){
   if(!/^[-a-zA-Z0-9_]+\.png$/.test(manifest.photoReference))throw Error('Invalid photo reference');
   const p=await encode(path.join(directory,manifest.photoReference),directory,'preview',true);
   manifest.preview=p.filename;item.preview=`/assets/outfits/${item.id}/${p.filename}`;previewBytes+=p.bytes;
  }
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 }
 await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
 return {sourceBytes,runtimeBytes,previewBytes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await optimizeOutfits(path.resolve('public'))));
