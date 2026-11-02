'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const dock=source.slice(source.indexOf('function syncDock(){'),source.indexOf('function renderTop(){'));
function harness(){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{dataset:{},classes:new Set(),classList:{toggle(name,on){on?get(id).classes.add(name):get(id).classes.delete(name)}}});return elements.get(id)};
 const buttons=['hand','market','objectives'].map(panel=>({dataset:{panel},setAttribute(k,v){this[k]=v}}));
 const c=vm.createContext({ui:{dock:'hand',dockPhase:null},S:{phase:'place'},canAct:()=>c.active,$:get,active:true,document:{querySelectorAll:()=>buttons}});
 vm.runInContext(dock,c);
 return {c,get,buttons,update:()=>vm.runInContext('syncDock()',c)};
}
test('the market replaces the phone hand after placement, and the hand returns next turn',()=>{
 const h=harness();h.update();assert.equal(h.get('#app').dataset.dock,'hand');
 h.c.S.phase='draw';h.update();assert.equal(h.get('#app').dataset.dock,'market');
 assert.ok(h.get('#marketSec').classes.has('ready-to-draw'));
 assert.equal(h.buttons[1]['aria-pressed'],'true');
 h.c.S.phase='place';h.update();assert.equal(h.get('#app').dataset.dock,'hand');
 assert.ok(!h.get('#marketSec').classes.has('ready-to-draw'));
});
test('presence and score redraws preserve an objective being inspected',()=>{
 const h=harness();h.update();h.c.ui.dock='objectives';h.update();h.update();
 assert.equal(h.get('#app').dataset.dock,'objectives');
 assert.equal(h.buttons[2]['aria-pressed'],'true');
 assert.equal(h.buttons[0]['aria-pressed'],'false');
});
test('an opponent drawing does not expose a false actionable market state',()=>{
 const h=harness();h.update();h.c.active=false;h.c.S.phase='draw';h.update();
 assert.equal(h.get('#app').dataset.dock,'hand');
 assert.ok(!h.get('#marketSec').classes.has('ready-to-draw'));
});
test('fit centers the entire codex rather than its original starter card',()=>{
 const fit=source.slice(source.indexOf('function fitBoard(){'),source.indexOf('// ---------- Board zoom and pan ----------'));
 const sc={clientWidth:600,clientHeight:360};
 const c=vm.createContext({S:{players:[{board:{a:{x:-4,y:0},b:{x:2,y:4}}}]},ui:{view:0,zoom:9},SX:10,SY:6,PAD:2,$:()=>sc,renderBoard(){c.ui.origin={minX:-5,minY:-1}}});
 vm.runInContext(fit+';fitBoard()',c);
 assert.ok(c.ui.zoom>=4&&c.ui.zoom<=14);
 const cx=(((-4+2)/2+5)*10+2+6)*c.ui.zoom;
 const cy=(((0+4)/2+1)*6+2+4)*c.ui.zoom;
 assert.equal(sc.scrollLeft,cx-300);assert.equal(sc.scrollTop,cy-180);
});
test('fit can show a late-game codex on a phone below the normal manual zoom limit',()=>{
 const fit=source.slice(source.indexOf('function fitBoard(){'),source.indexOf('// ---------- Board zoom and pan ----------'));
 const sc={clientWidth:360,clientHeight:250};
 const c=vm.createContext({S:{players:[{board:{a:{x:-12,y:-4},b:{x:12,y:12}}}]},ui:{view:0,zoom:9},SX:10,SY:6,PAD:2,$:()=>sc,renderBoard(){c.ui.origin={minX:-13,minY:-5}}});
 vm.runInContext(fit+';fitBoard()',c);
 assert.ok(c.ui.zoom<4);
 assert.ok((24*10+12)*c.ui.zoom<=sc.clientWidth-32);
 assert.ok((16*6+8)*c.ui.zoom<=sc.clientHeight-32);
});
test('keyboard activation places a focused corner even on a touch-capable device',()=>{
 const action=source.slice(source.indexOf("    case 'spot': {"),source.indexOf("    case 'place-aim':"));
 function activate(detail){
  const events=[];
  const c=vm.createContext({S:{phase:'place'},ui:{sel:'card',ptr:'touch',aim:null},d:{x:'2',y:'3'},e:{detail},canAct:()=>true,kxy:(x,y)=>x+','+y,renderBoard:()=>events.push('preview'),renderPrompt(){},placeHuman:(x,y)=>events.push([x,y])});
  vm.runInContext("(()=>{switch('spot'){"+action+'}})()',c);return events;
 }
 assert.deepEqual(activate(0),[[2,3]]);
 assert.deepEqual(activate(1),['preview']);
});
