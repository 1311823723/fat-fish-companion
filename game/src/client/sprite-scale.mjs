// Crop height describes a pose, not the character's physical size.
export function spriteScale(manifest,key,sceneScale){
 const frame=manifest[key]?.grid;
 const idleKey=key.includes('--')?key.split('--')[0]+'--idle':'idle';
 const idle=manifest[idleKey]?.grid;
 const idleHeight=idle?.height||256,idleWidth=idle?.width||256,frameWidth=frame?.width||256;
 return sceneScale*256/idleHeight*idleWidth/frameWidth;
}
