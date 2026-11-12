// A pointer click belongs to the control and panel revision where it began.
export function createPanelClickGuard(){
 let press=null;
 return {
  begin(target,revision){press=target?{target,revision}:null;},
  cancel(){press=null;},
  accept(target,revision,detail){
   // Keyboard activation and intentional .click() routing have no pointer detail.
   if(detail===0)return true;
   const previous=press;press=null;
   return !!target&&previous?.target===target&&previous.revision===revision;
  }
 };
}
