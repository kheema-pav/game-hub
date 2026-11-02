'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../tabletop-core');
const shellSource = fs.readFileSync(path.join(__dirname, '../tabletop.js'), 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(resolve => setImmediate(resolve));
const step = {type:'step'};
const engine = {
  create({seed,players,options}) { return {seed,players:copy(players),options:copy(options),current:0,steps:0,over:false,winner:null,scores:players.map(()=>0)}; },
  actor(s) { return s.over ? -1 : s.current; },
  legal(s,p) { return !s.over && p===s.current ? [copy(step)] : []; },
  apply(s,p,a) {
    if(s.over||p!==s.current||a.type!=='step')return {ok:false,state:s,error:'Illegal'};
    const n=copy(s);n.steps++;n.current=(p+1)%n.players.length;n.over=n.steps>=4;
    if(n.over){n.winner=p;n.winners=[p];}return {ok:true,state:n};
  },
  bot() { return copy(step); }
};
const config = {id:'fixture',title:'Fixture',gameVersion:1,minPlayers:2,maxPlayers:3,engine,options:[],
  render(s,viewer,actions) { return '<div>step '+s.steps+' viewer '+viewer+'</div>'+actions.map((_,i)=>'<button data-move="'+i+'">Step</button>').join(''); }
};
const room = () => ({game:'fixture',v:2,gameVersion:1,seed:99,maxSeats:2,status:'playing',seats:{a:{name:'Alice',color:'#112233'},b:{name:'Bob',color:'#445566'}},opts:{}});
function records(k,action=step){return {k,action:copy(action)};}
function docsFor(r,moves){const ids=C.seats(r);return Object.fromEntries(ids.map((id,i)=>[id,{moves:moves[i]}]));}
function savedGame(extra={}){
 const players=[{name:'Alice',bot:false},{name:'Bot',bot:true}];
 return {v:1,game:'fixture',gameVersion:1,players,options:{},state:engine.create({seed:9,players,options:{}}),...extra};
}

test('replay is deterministic across document order and only the current author advances its step',()=>{
 const r=room(),docs=docsFor(r,[[records(0),records(2)],[records(1),records(3)]]);
 const before=JSON.stringify({r,docs});
 const a=C.replay(config,r,docs),b=C.replay(config,r,Object.fromEntries(Object.entries(docs).reverse()));
 assert.equal(C.stable(a),C.stable(b));assert.equal(a.k,4);assert.equal(a.state.over,true);assert.equal(a.rejected,0);
 assert.ok(a.state.players.every(p=>p.bot===false));assert.equal(JSON.stringify({r,docs}),before);
});

test('invalid, stale and wrong-author records never spend an applied step or block later legal moves',()=>{
 const r=room();
 const clean=C.replay(config,r,docsFor(r,[[records(0),records(2)],[records(1),records(3)]]));
 const dirty=C.replay(config,r,docsFor(r,[[null,records(-1),records(0,{type:'illegal'}),records(0),records(2)], [records(0),records(1),records(1),records(3)]]));
 assert.equal(C.stable(dirty.state),C.stable(clean.state));assert.equal(dirty.k,4);assert.equal(dirty.rejected,5);
});

test('replay waits for the actual actor even when another player has supplied a move',()=>{
 const r=room(),res=C.replay(config,r,docsFor(r,[[],[records(0),records(1)]]));
 assert.equal(res.k,0);assert.equal(res.state.steps,0);assert.equal(res.state.over,false);
});

test('own optimistic moves extend the acknowledged prefix without mutating either input',()=>{
 const a=[records(0)],b=[records(0),records(2)];
 const merged=C.mergeMine(a,b);assert.deepEqual(merged,b);merged[0].action.type='changed';assert.equal(a[0].action.type,'step');assert.equal(b[0].action.type,'step');
 assert.deepEqual(C.mergeMine(b,a),b);
 assert.throws(()=>C.mergeMine([records(0,{type:'other-tab'})],b),/another tab/);
});

test('replay rejects unsupported table sizes before constructing a game',()=>{
 const r=room();delete r.seats.b;
 assert.throws(()=>C.replay(config,r,{}),/unsupported number/);
 r.seats={a:{},b:{},c:{},d:{}};assert.throws(()=>C.replay(config,r,{}),/unsupported number/);
});

test('save validation checks game identity, settings, player kinds and turn bounds',()=>{
 assert.equal(C.validSave(savedGame(),config),true);
 for(const extra of [{v:2},{game:'other'},{options:{extra:true}},{players:[{name:'Alice',bot:'yes'},{name:'Bob',bot:false}]},{state:{over:false,current:20}}])assert.equal(C.validSave(savedGame(extra),config),false);
 const editions={...config,options:[{key:'edition',values:[{value:'usa'},{value:'europe'}]}]};
 const validEdition=savedGame({options:{edition:'usa'}});validEdition.state.options={edition:'usa'};
 assert.equal(C.validSave(validEdition,editions),true);
 assert.equal(C.validSave(savedGame({options:{edition:'unknown'}}),editions),false);
});

test('save validation rejects an engine version mismatch and a board/player count mismatch',()=>{
 assert.equal(C.validSave(savedGame({gameVersion:99}),config),false);
 const bad=savedGame();bad.state.players.push({name:'Unexpected',bot:false});
 assert.equal(C.validSave(bad,config),false);
});

function shell({search='',hash='',save,room:r=room(),onlineAvailable=true,gameConfig=config}={}){
 const storage=new Map(),writes=[],timers=new Map(),calls=[];
 if(save)storage.set('hub.fixture.save.v1',JSON.stringify(save));
 const root={innerHTML:'',listeners:{},classList:{add(){}},addEventListener(k,fn){this.listeners[k]=fn;},contains:()=>true};
 const location={search,hash,pathname:'/fixture/'};
 let watcher,onPlay,pending,uid=C.seats(r)[0];
 const rooms={compatibility:()=>({ok:true}),
  watch(code,cb){watcher=cb;return()=>calls.push('unwatch');},
  writeMine(code,data){writes.push(copy(data));return new Promise((resolve,reject)=>{pending={resolve,reject};});},
  replacement:async()=>({code:'654321'})};
 const context={console,document:{getElementById:()=>root},location,URLSearchParams,Promise,Uint32Array,
  history:{replaceState(a,b,url){location.search=url.includes('?')?'?'+url.split('?')[1]:'';location.hash='';}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  crypto:{getRandomValues(a){a[0]=123;return a;}},
  setTimeout(fn,ms){const id=timers.size+1;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  addEventListener(){},HubTabletopCore:C,HubGameVersions:{platform:2,games:{fixture:1}},
  HubOnline:{uid,available:()=>onlineAvailable,rooms},
  HubLobby:{close(){},openCreateJoin(o){calls.push(['open',o]);return {close(){}};},enter(code,o){calls.push(['enter',code]);onPlay=o.onPlay;return {close(){}};}},
  HubSession:{mount(){return {update:s=>!(s.room&&['ended','cancelled'].includes(s.room.status)),close(){}};}},
  HubKit:{init(o){calls.push(['kit',o]);},sfx(){}}
 };
 context.window=context;vm.createContext(context);vm.runInContext(shellSource,context);
 const mounted=context.HubTabletop.mount({...gameConfig});
 function click(attrs){const t={disabled:false,closest(){return this;},hasAttribute:k=>k in attrs,getAttribute:k=>attrs[k]??null};root.listeners.click({target:t});}
 return {context,root,storage,writes,timers,calls,mounted,click,
  begin(){onPlay({code:'123456'});},
  emit(snapshot){watcher(snapshot);},pending:()=>pending,room:r};
}

test('shell boots all mode intents and gives invitations/Continue precedence',()=>{
 for(const mode of ['solo','local','online']){
  const h=shell({search:'?mode='+mode});
  assert.match(h.root.innerHTML,/Choose your table/);
  const opened=h.calls.filter(c=>Array.isArray(c)&&c[0]==='open');assert.equal(opened.length,mode==='online'?1:0);
 }
 const invited=shell({search:'?room=123456&mode=solo'});assert.ok(invited.calls.some(c=>c[0]==='enter'&&c[1]==='123456'));
 const continued=shell({search:'?mode=online',hash:'#continue',save:savedGame()});
 assert.match(continued.root.innerHTML,/step 0/);assert.ok(!continued.calls.some(c=>c[0]==='open'));
});

test('same-device curtain hides a resumed human hand until Ready',()=>{
 const saved=savedGame();saved.players[1].bot=false;saved.state.players[1].bot=false;
 const h=shell({hash:'#continue',save:saved});
 assert.match(h.root.innerHTML,/Pass the device/);assert.doesNotMatch(h.root.innerHTML,/step 0/);
 h.click({'data-tt':'reveal'});assert.match(h.root.innerHTML,/step 0/);
 h.click({'data-move':'0'});assert.match(h.root.innerHTML,/Pass the device/);
});

test('online replay and optimistic moves never overwrite a saved local game',async()=>{
 const save=savedGame(),h=shell({search:'?room=123456',save});const previous=h.storage.get('hub.fixture.save.v1');
 h.begin();h.emit({room:h.room,players:{},presence:{}});
 assert.match(h.root.innerHTML,/step 0/);h.click({'data-move':'0'});
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].moves[0].k,0);assert.match(h.root.innerHTML,/step 1/);
 h.pending().resolve();await tick();
 assert.equal(h.storage.get('hub.fixture.save.v1'),previous);
});

test('terminal snapshots block further moves before replay or writes',()=>{
 const h=shell({search:'?room=123456'});h.begin();h.emit({room:h.room,players:{}});
 h.emit({room:{...h.room,status:'ended'},players:{}});h.click({'data-move':'0'});
 assert.equal(h.writes.length,0);
});

test('shared menu Game setup action uses the HubKit onSelect contract',()=>{
 const h=shell({hash:'#continue',save:savedGame()});
 const kit=h.calls.find(c=>Array.isArray(c)&&c[0]==='kit')[1];
 const setupItem=kit.items().find(item=>item.label==='Game setup');
 assert.equal(typeof setupItem.onSelect,'function');
 setupItem.onSelect();assert.match(h.root.innerHTML,/Choose your table/);
});

test('an unsynced move remains retryable and blocks a later move until acknowledged',async()=>{
 const h=shell({search:'?room=123456'});h.begin();h.emit({room:h.room,players:{}});h.click({'data-move':'0'});
 h.pending().reject({code:'offline'});await tick();
 assert.match(h.root.innerHTML,/Retry move/);
 // A later server read may reveal that the timed-out move was accepted and that
 // the other player has acted; the local retry must still settle first.
 h.emit({room:h.room,players:docsFor(h.room,[[records(0)],[records(1)]])});
 assert.match(h.root.innerHTML,/step 2/);
 h.click({'data-move':'0'});assert.equal(h.writes.length,1);
 h.click({'data-tt':'retry-write'});assert.equal(h.writes.length,2);
 assert.deepEqual(h.writes[1].moves,[records(0)]);
 h.pending().resolve();await tick();
 h.click({'data-move':'0'});assert.equal(h.writes.length,3);
 assert.deepEqual(h.writes[2].moves,[records(0),records(2)]);
});

test('a refused optimistic move is removed even after a pending snapshot echoed it',async()=>{
 const h=shell({search:'?room=123456'});h.begin();h.emit({room:h.room,players:{}});h.click({'data-move':'0'});
 h.emit({room:h.room,players:docsFor(h.room,[[records(0)],[]]),pending:true});
 h.pending().reject({code:'denied'});await tick();
 h.emit({room:h.room,players:docsFor(h.room,[[],[]]),pending:false});
 assert.match(h.root.innerHTML,/step 0/);
 assert.doesNotMatch(h.root.innerHTML,/step 1/);
});

test('a conflicting seat history blocks writes and offers reopening instead of active controls',()=>{
 const h=shell({search:'?room=123456'});h.begin();h.emit({room:h.room,players:{}});h.click({'data-move':'0'});
 h.emit({room:h.room,players:docsFor(h.room,[[records(0,{type:'other-tab-choice'})],[]]),pending:false});
 assert.match(h.root.innerHTML,/another tab/);assert.match(h.root.innerHTML,/Reopen room/);
 h.click({'data-move':'0'});assert.equal(h.writes.length,1);
 h.click({'data-tt':'reopen'});assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='enter').length,2);
});

test('write rejection cannot erase a later acknowledged prefix from the same seat',async()=>{
 const h=shell({search:'?room=123456'});h.begin();h.emit({room:h.room,players:{}});h.click({'data-move':'0'});
 // Another tab on the same seat can acknowledge our first move, then append a
 // later legal turn before this tab's older full-document write settles.
 h.emit({room:h.room,players:docsFor(h.room,[[records(0),records(2)],[records(1)]]),pending:false});
 assert.match(h.root.innerHTML,/step 3/);
 h.pending().reject({code:'denied'});await tick();
 assert.match(h.root.innerHTML,/step 3/);
 assert.doesNotMatch(h.root.innerHTML,/step 0/);
});

for(const id of ['connect4','ludo','azul','ticket'])test(`${id}: the shipped engine, renderer and shared shell can start and save a local game`,()=>{
 const gameEngine=require('../../'+id+'/engine.js');
 let registration;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../'+id+'/game.js'),'utf8'),{
  window:{HubEngines:{[id]:gameEngine}},HubTabletop:{mount:config=>{registration=config}}
 },{filename:id+'/game.js'});
 assert.ok(registration);assert.equal(registration.id,id);
 const h=shell({search:'?mode=solo',gameConfig:registration});
 h.click({'data-tt':'start'});
 assert.doesNotMatch(h.root.innerHTML,/This board could not be displayed/);
 assert.doesNotMatch(h.root.innerHTML,/Choose your table/);
 const saved=JSON.parse(h.storage.get('hub.'+id+'.save.v1'));
 assert.equal(saved.game,id);assert.equal(saved.gameVersion,1);
 assert.equal(C.validSave(saved,{...registration,gameVersion:1}),true);
});
