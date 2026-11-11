import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve('public/assets');
const definitions={room:'room-v5.webp',television:'handheld-console-v1.webp','backpack-storybook':'backpack-storybook-v1.webp','wardrobe-v1':'wardrobe-v1.png',door:'fridge-door-v3.webp','curtain-fabric':'curtain-v3.webp','food-icons-v2':'food-icons-v2.webp'};
const images={};let before=0,after=0;
async function version(filename,bytes){
 const name=path.basename(filename,path.extname(filename))+'-runtime-'+crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.webp';
 await fs.writeFile(path.join(root,name),bytes);return '/assets/'+name;
}
for(const [key,file]of Object.entries(definitions)){
 const source=await fs.readFile(path.join(root,file));before+=source.length;
 const bytes=key==='wardrobe-v1'?await sharp(source).resize({width:192,height:360,fit:'inside',withoutEnlargement:true}).webp({quality:84,alphaQuality:100,effort:5}).toBuffer():source;
 images[key]=await version(file,bytes);after+=bytes.length;
}
const actions=JSON.parse(await fs.readFile(path.join(root,'manifest-v4.json'),'utf8'));
for(const [name,a]of Object.entries(actions)){
 const bytes=await fs.readFile(path.join(root,path.basename(a.file)));
 if(['idle','walk_left','walk_right'].includes(name))before+=bytes.length;
 if(name==='idle')after+=bytes.length;
 a.file=await version(path.basename(a.file),bytes);
}
await fs.writeFile(path.join(root,'room-runtime.json'),JSON.stringify({images,actions,budget:{previousPreloadBytes:before,currentPreloadBytes:after}},null,2)+'\n');
console.log(JSON.stringify({roomPreloadBefore:before,roomPreloadAfter:after,wardrobeBytes:(await fs.stat(path.join('public',images['wardrobe-v1']))).size}));
