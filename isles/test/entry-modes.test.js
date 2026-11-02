'use strict';
// Exercise the shipped entry functions, without starting a real game or touching Firebase.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const source=game=>fs.readFileSync(path.join(root,game,'game.js'),'utf8');
function named(game,name,next){const s=source(game),a=s.indexOf('function '+name+'('),b=s.indexOf(next,a);assert.ok(a>=0&&b>a);return s.slice(a,b);}
function context(search='',hash=''){
 const calls=[];
 const x={calls,location:{search,hash,pathname:'/game/'},history:{replaceState(){}},window:{},URLSearchParams,
  clearTimeout(){calls.push('stop-timeout')},clearInterval(){calls.push('stop-interval')},teardownPlay(){calls.push('stop-drawing')},
  ui:{cfg:{},ng:null},ON:{active:false},G:null,S:null,setup:null,
  HubOnline:{rooms:{compatibility:r=>({ok:r.v!==99,message:'Update required'})}},
  normCode:c=>String(c).replace(/\D/g,''),onlineAvailable:()=>true,
  render:()=>calls.push('render'),renderModal:()=>calls.push('modal'),renderConnecting:()=>calls.push('connecting'),showView:()=>calls.push('show'),
  renderHome:()=>calls.push('home'),syncFloat(){},initKit(){},setupPanZoom(){},loadCfg:()=>({}),
  openNewGame(){x.ui.ng={players:[]}},startLocal:()=>calls.push('local'),goOnline:c=>calls.push('room:'+c),
  enterRoom:c=>calls.push('room:'+c),openOnlineLobby:()=>calls.push('online'),
  defaultSetup:()=>({count:2,seats:[{name:'You',kind:'human'},{name:'Bot',kind:'medium'}]}),
  preset:p=>calls.push('preset:'+p),resumeSave:()=>calls.push('resume'),load:()=>({}),SAVE_KEY:'saved',
  resumeSaved:()=>calls.push('resume'),scheduleBot:()=>calls.push('bot'),
  $:()=>({hidden:false}),renderStatic(){},afterAction(){},
 };
 return vm.createContext(x);
}
const entries={
 codex:named('codex','start','function startLocal('),
 gems:named('gems','start','window.claude?.hot?.ready'),
 isles:named('isles','boot','if (window.claude && window.claude.hot && window.claude.hot.snapshot)'),
};
for(const game of Object.keys(entries)){
 const fn=game==='isles'?'boot':'start';
 for(const mode of ['solo','local','online'])test(`${game}: ${mode} configures the intended entry`,()=>{
  const c=context('?mode='+mode);vm.runInContext(entries[game]+`;${fn}({})`,c);
  if(game==='codex'){
   assert.equal(c.ui.ng.tab,mode==='online'?'online':'local');assert.equal(c.ui.ng.players[1].ai,mode!=='local');
  }else if(mode==='online')assert.ok(c.calls.includes('online'));
  else if(game==='gems')assert.equal(c.setup.seats[1].kind,mode==='local'?'human':'medium');
  else assert.ok(c.calls.includes('preset:'+(mode==='local'?'couple':'solo2')));
 });
 test(`${game}: an invitation takes precedence over a conflicting mode`,()=>{
  const c=context('?room=123456&mode=solo');vm.runInContext(entries[game]+`;${fn}({})`,c);
  assert.ok(c.calls.includes('room:123456'));assert.ok(!c.calls.includes('online'));assert.ok(!c.calls.some(x=>x.startsWith('preset:')));
 });
 test(`${game}: continue takes precedence over a conflicting mode`,()=>{
  const c=context('?mode=online','#continue');vm.runInContext(entries[game]+`;${fn}({})`,c);
  assert.ok(!c.calls.includes('online'));assert.ok(game==='codex'?c.calls.includes('local'):c.calls.includes('resume'));
 });
}
for(const game of ['codex','gems','isles','sketch'])test(`${game}: terminal/version snapshots block replay and clear held drafts`,()=>{
 const text=source(game),a=text.indexOf('function roomSnapshotAllowed('),b=text.indexOf('function onSnap(',a);
 const c=context();c.ON={deferred:{old:true},session:{update:()=>false}};
 vm.runInContext(text.slice(a,b),c);
 for(const room of [{status:'ended',v:2},{status:'cancelled',v:2},{status:'playing',v:99}]){
  c.snap={room};assert.equal(vm.runInContext('roomSnapshotAllowed(snap)',c),false);assert.equal(c.ON.deferred,null);assert.equal(c.ON.blocked,true);
 }
 c.ON.session.update=()=>true;c.snap={room:{status:'playing',v:2}};
 assert.equal(vm.runInContext('roomSnapshotAllowed(snap)',c),true);assert.equal(c.ON.blocked,false);
});
for(const mode of ['local','online'])test(`sketch: ${mode} entry preserves the saved game until Start`,()=>{
 const c=context('?mode='+mode);c.S={screen:'scores'};c.startOnline=()=>false;c.restore=()=>c.calls.push('restore');
 const s=source('sketch'),entry=s.slice(s.lastIndexOf('if(!startOnline()){'));
 vm.runInContext(entry,c);assert.equal(c.S.screen,'setup');assert.ok(!c.calls.includes('restore'));
 assert.equal(c.calls.includes('online'),mode==='online');
});
test('sketch: an invitation and continue take precedence over a mode',()=>{
 const s=source('sketch'),entry=s.slice(s.lastIndexOf('if(!startOnline()){'));
 const c=context('?room=123456&mode=local');c.startOnline=()=>true;c.restore=()=>c.calls.push('restore');
 vm.runInContext(entry,c);assert.deepEqual(c.calls,[]);
 const d=context('?mode=online','#continue');d.startOnline=()=>false;d.restore=()=>d.calls.push('restore');
 vm.runInContext(entry,d);assert.ok(d.calls.includes('restore'));assert.ok(!d.calls.includes('online'));
});

for(const mode of ['local','online'])test(`sketch: ${mode} setup edits preserve the previous save until Start`,()=>{
 const text=source('sketch');
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',dataset:{},classList:{toggle(){}},focus(){}});return elements.get(id)};
 const timerButton={dataset:{secs:'90'}},roundsButton={dataset:{rounds:'5'}};
 const previous='previous in-progress game';
 const storage=new Map([['pictionary.save.v1',previous]]);
 const c=vm.createContext({
  location:{search:'?mode='+mode,hash:''},URLSearchParams,window:{},ON:{active:false},
  S:{screen:'setup',teams:['One','Two'],scores:[0,0],turn:0,secs:60,rounds:3,used:new Set(),skipsLeft:1},
  COLORS:['red','blue','green','yellow'],esc:String,$:get,
  document:{querySelector:()=>null,querySelectorAll:selector=>selector==='[data-secs]'?[timerButton]:selector==='[data-rounds]'?[roundsButton]:[]},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  startOnline:()=>false,onlineAvailable:()=>true,openOnlineLobby(){},restore(){},paint(){},onlineCardHTML:()=>'',
  HubKit:{setFloating(){}},status:()=>'',scoreList:()=>'',keepAwake(){},skip(){},beginDraw(){},
  go(screen){c.S.screen=screen;c.render()}
 });
 const render=text.slice(text.indexOf('function render(noClear){'),text.indexOf('function restore(){'));
 const bind=text.slice(text.indexOf('function on(id,fn){'),text.indexOf('document.addEventListener("visibilitychange"'));
 const start=text.slice(text.indexOf('function startGame(){'),text.indexOf('function beginDraw(){'));
 vm.runInContext(render+'\n'+bind+'\n'+start+'\n'+text.slice(text.lastIndexOf('if(!startOnline()){')),c);
 assert.equal(storage.get('pictionary.save.v1'),previous);
 get('addT').onclick();assert.equal(c.S.teams.length,3);assert.equal(storage.get('pictionary.save.v1'),previous);
 get('delT').onclick();assert.equal(c.S.teams.length,2);assert.equal(storage.get('pictionary.save.v1'),previous);
 timerButton.onclick();assert.equal(c.S.secs,90);assert.equal(storage.get('pictionary.save.v1'),previous);
 roundsButton.onclick();assert.equal(c.S.rounds,5);assert.equal(storage.get('pictionary.save.v1'),previous);
 get('start').onclick();
 const saved=JSON.parse(storage.get('pictionary.save.v1'));
 assert.equal(saved.screen,'handover');assert.equal(saved.secs,90);assert.equal(saved.rounds,5);
});
