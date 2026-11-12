export function createPanelClickGuard():{
 begin(target:unknown,revision:number):void;
 cancel():void;
 accept(target:unknown,revision:number,detail:number):boolean;
};
