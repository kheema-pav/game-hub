'use strict';
// Exercise shipped client logic with an in-memory Firebase transport, not production credentials.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness(uid = 'host') {
  let now = 1000000, seq = 0, permissionError = null;
  const docs = new Map(), writes = [], listeners = [], timers = new Map(), events = new Map();
  const eventTarget = target => ({addEventListener(k,f){events.set(target+k,(events.get(target+k)||[]).concat(f));},removeEventListener(k,f){events.set(target+k,(events.get(target+k)||[]).filter(x=>x!==f));}});
  const clone = v => JSON.parse(JSON.stringify(v));
  const ref = (first,...parts) => ({path:[first.path||'',...parts].filter(Boolean).join('/')});
  const snapshot = r => ({exists:()=>docs.has(r.path),data:()=>clone(docs.get(r.path)),id:r.path.split('/').pop(),metadata:{fromCache:false,hasPendingWrites:false}});
  const apply = (r,d) => { if(permissionError) throw permissionError; docs.set(r.path,clone(d));writes.push({path:r.path,data:clone(d)}); };
  const transport = {
    doc:ref, collection:ref, serverTimestamp:()=>now, initializeFirestore:()=>({}),
    getDoc:async r=>snapshot(r),getDocFromServer:async r=>snapshot(r),
    setDoc:async(r,d)=>apply(r,d), updateDoc:async(r,d)=>apply(r,{...docs.get(r.path),...d}),
    runTransaction:async(db,fn)=>fn({get:async r=>snapshot(r),set:apply,update:(r,d)=>apply(r,{...docs.get(r.path),...d})}),
    onSnapshot(r,opts,cb,error) { if(typeof opts==='function'){error=cb;cb=opts;} const l={r,cb,error,active:true};listeners.push(l);return()=>{l.active=false;};},
    disableNetwork:async()=>{},enableNetwork:async()=>{}
  };
  const document = {hidden:false,...eventTarget('document')};
  const window = {HUB_FIREBASE_CONFIG:{apiKey:'test',projectId:'demo-game-hub'},...eventTarget('window')};
  const user={uid,getIdToken:async()=> 'demo'};
  const auth={currentUser:user,authStateReady:async()=>{}};
  const storage=new Map([['hub.profile',JSON.stringify({name:'Tester',color:'#e4572e'})]]);
  const context={window,document,navigator:{onLine:true},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,
    Date:class extends Date{static now(){return now;}},crypto:{getRandomValues(a){a[0]=++seq*151;return a;}},Uint32Array,
    setTimeout:(f,ms)=>{const id=++seq;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),
    __modules:{app:{initializeApp:()=>({})},auth:{getAuth:()=>auth,signInAnonymously:async()=>{}},fs:transport}};
  let source=fs.readFileSync(path.join(__dirname,'..','online.js'),'utf8');
  for(const [file,key] of [['app','app'],['auth','auth'],['firestore','fs']]) source=source.replace(`import(BASE + 'firebase-${file}.js')`,`Promise.resolve(__modules.${key})`);
  vm.runInNewContext(source,context,{filename:'shared/online.js'});
  const api=window.HubOnline;
  const seed=(code,over={})=>docs.set('rooms/'+code,{game:'isles',v:2,gameVersion:1,host:'host',seed:123,maxSeats:3,status:'playing',seats:{host:{name:'Host'},guest:{name:'Guest'}},opts:{mode:'base',target:10},...over});
  return {api,docs,writes,document,events,timers,listeners,seed,context,async flush(){for(let i=0;i<12;i++)await Promise.resolve();},advance(ms){now+=ms;},deny(){permissionError={code:'permission-denied'};},fire(target,key){(events.get(target+key)||[]).slice().forEach(f=>f({}));},emit(code,kind){const p='rooms/'+code+(kind?'/'+kind:'');for(const l of listeners.filter(l=>l.active&&l.r.path===p)){if(!kind)l.cb(snapshot(l.r));else l.cb({size:0,metadata:{fromCache:false,hasPendingWrites:false},forEach:f=>{for(const[k,v]of docs){if(k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/'))f({id:k.split('/').pop(),data:()=>v});}}});}}};
}
test('compatibility accepts known legacy rooms and current versions, rejects unknown versions/games',()=>{
  const h=harness(),c=h.api.rooms.compatibility;
  assert.equal(c({game:'isles',v:1}).ok,true);
  assert.equal(c({game:'isles',v:2,gameVersion:1}).ok,true);
  for(const room of [{game:'isles',v:3,gameVersion:1},{game:'isles',v:2},{game:'isles',v:2,gameVersion:2},{game:'x',v:1}])assert.equal(c(room).ok,false);
});
test('new rooms record fixed platform and game versions',async()=>{
  const h=harness();const r=await h.api.rooms.create({game:'isles',maxSeats:3,opts:{mode:'base'}});
  const d=h.docs.get('rooms/'+r.code);assert.equal(d.v,2);assert.equal(d.gameVersion,1);assert.equal(d.status,'open');
});
test('host cancellation/end preserves history and repeated end is idempotent',async()=>{
  for(const status of ['open','playing']){
    const h=harness();h.seed('482619',{status});h.docs.set('rooms/482619/players/host',{moves:[1,2]});
    const a=await h.api.rooms.end('482619');assert.equal(a.status,status==='open'?'cancelled':'ended');
    const d=h.docs.get('rooms/482619');assert.equal(d.endedBy,'host');assert.equal(d.endedAt,1000000);assert.equal(d.seed,123);
    assert.deepEqual(h.docs.get('rooms/482619/players/host').moves,[1,2]);
    const n=h.writes.length;await h.api.rooms.end('482619');assert.equal(h.writes.length,n);
  }
});
test('non-host cannot terminate; ended and incompatible rooms reject join before any seat write',async()=>{
  const h=harness('guest');h.seed('482619');await assert.rejects(h.api.rooms.end('482619'),e=>e.code==='host-only');
  for(const over of [{status:'ended'},{status:'cancelled'},{status:'open',v:3}]){
    h.seed('482619',over);await assert.rejects(h.api.rooms.join('482619'),e=>['ended','version'].includes(e.code));
  }
  assert.equal(h.writes.length,0);
});
test('a seated guest creates a separate replacement while original room remains untouched',async()=>{
  const h=harness('guest');h.seed('482619',{status:'ended'});const before=JSON.stringify(h.docs.get('rooms/482619'));
  const r=await h.api.rooms.replacement('482619');assert.notEqual(r.code,'482619');assert.equal(JSON.stringify(h.docs.get('rooms/482619')),before);
  const d=h.docs.get('rooms/'+r.code);assert.equal(d.host,'guest');assert.equal(d.opts.mode,'base');assert.deepEqual(Object.keys(d.seats),['guest']);
  const x=harness('stranger');x.seed('482619');await assert.rejects(x.api.rooms.replacement('482619'),e=>e.code==='denied');
});
test('presence is visible-only, throttled, reference counted, and never marks another tab away',async()=>{
  const h=harness();h.seed('482619');h.document.hidden=true;
  const stop1=h.api.rooms.trackPresence('482619');await h.flush();assert.equal(h.writes.length,0);
  h.document.hidden=false;h.fire('document','visibilitychange');await h.flush();assert.equal(h.writes.filter(w=>w.path.includes('/presence/')).length,1);
  const stop2=h.api.rooms.trackPresence('482619');await h.flush();assert.equal(h.writes.filter(w=>w.path.includes('/presence/')).length,1);
  stop1();h.advance(60000);h.fire('window','online');await h.flush();assert.equal(h.writes.filter(w=>w.path.includes('/presence/')).length,2);
  stop2();h.advance(60000);h.fire('window','online');await h.flush();assert.equal(h.writes.filter(w=>w.path.includes('/presence/')).length,2);
  assert.ok(h.writes.every(w=>!w.path.includes('/presence/')||w.data.state==='here'));
  assert.equal((h.events.get('documentvisibilitychange')||[]).length,1,'only the global room-wake listener remains');
});
test('presence feature failures are actionable and advisory',async()=>{
  const h=harness();h.seed('482619');h.deny();const errors=[];const stop=h.api.rooms.trackPresence('482619',e=>errors.push(e));await h.flush();
  assert.equal(errors[0].code,'rules-update');assert.match(errors[0].message,/rules updated/);stop();
});
test('watch emits presence separately, recovers terminal state, and unsubscribes every listener',async()=>{
  const h=harness();h.seed('482619');const out=[];const stop=h.api.rooms.watch('482619',s=>out.push(s));await h.flush();
  h.docs.set('rooms/482619/presence/guest',{at:1000000,state:'here'});h.emit('482619');h.emit('482619','players');h.emit('482619','presence');
  assert.equal(out.at(-1).presence.guest.state,'here');assert.equal(out.at(-1).error,null);
  const presence=h.listeners.find(l=>l.r.path.endsWith('/presence'));presence.error({code:'permission-denied'});
  assert.equal(out.at(-1).error,null);assert.equal(out.at(-1).presenceError.code,'rules-update');
  h.seed('482619',{status:'ended'});h.emit('482619');assert.equal(out.at(-1).room.status,'ended');stop();assert.ok(h.listeners.every(l=>!l.active));
});
