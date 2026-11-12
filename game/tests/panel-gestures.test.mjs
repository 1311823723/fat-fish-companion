import test from 'node:test';import assert from 'node:assert/strict';
import {createPanelClickGuard} from '../src/client/panel-gestures.mjs';
test('a release which opens a panel cannot also activate the new photo or close button',()=>{
 const g=createPanelClickGuard(),menu={},photo={},close={};
 g.begin(null,0);assert.equal(g.accept(photo,1,1),false);
 g.begin(menu,1);assert.equal(g.accept(menu,1,1),true);
 assert.equal(g.accept(photo,2,1),false);assert.equal(g.accept(close,2,1),false);
});
test('real subsequent taps are immediate, cancellation blocks clicks, keyboard and routed clicks work',()=>{
 const g=createPanelClickGuard(),photo={};
 g.begin(photo,2);assert.equal(g.accept(photo,2,1),true);
 g.begin(photo,3);assert.equal(g.accept(photo,3,1),true);
 g.begin(photo,3);g.cancel();assert.equal(g.accept(photo,3,1),false);
 g.begin(photo,3);assert.equal(g.accept(photo,4,1),false);
 assert.equal(g.accept(photo,4,0),true);
});
