'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const G=new Function(read('gems/engine.js')+';return {newGame,botChoose,applyMove,botDiscard,eligibleNobles,claimNoble,endTurn,standings,legalMoves,rng,simulate,CARDS,TOKEN_LIMIT};')();
const {E,Bot}=new Function(read('isles/engine.js')+read('isles/bot.js')+';return {E:Engine,Bot};')();
function seedRandom(seed,fn){const prev=Math.random;Math.random=G.rng(seed);try{return fn();}finally{Math.random=prev;}}
function gemStep(s){const pi=s.cur,before=JSON.stringify(s),m=G.botChoose(s,pi);assert.equal(JSON.stringify(s),before);assert.ok(m.t==='pass'||G.legalMoves(s,pi).some(a=>JSON.stringify(a)===JSON.stringify(m)));G.applyMove(s,pi,m);G.botDiscard(s,pi);const ns=G.eligibleNobles(s,s.players[pi]);if(ns.length)G.claimNoble(s,pi,ns[0]);G.endTurn(s);return m;}
const source=read('codex/game.js');
const C=new Function(read('codex/engine.js')+';let S;const esc=String;const slog=()=>{};'+source.slice(source.indexOf('const nm=p=>'),source.indexOf('function doPlace('))+source.slice(source.indexOf('function placeStarter('),source.indexOf('function setupNext('))+';const drawOptions=()=>drawOptionsOf(S);'+source.slice(source.indexOf('const LEVELS={'),source.indexOf('function aiStep(){'))+`;return {CARDS,RES_IDS,GOLD_IDS,START_IDS,OBJECTIVES,OBJ_BY_ID,validSpots,counts,meetsReq,pointsFor,objTimes,placeOn,drawOn,advance,finishResults,passOn,choose:(s,p)=>(S=s,aiChoose(p)),draw:(s,p)=>(S=s,aiDraw(p)),setup:(s,p)=>(S=s,aiSetup(p))};`)();
function codexGame(level,n=2,seed=12){
 const rnd=G.rng(seed);function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 const res=shuffle(C.RES_IDS),gold=shuffle(C.GOLD_IDS),st=shuffle(C.START_IDS),obj=shuffle(C.OBJECTIVES.map(o=>o.id));
 const s={resDeck:res,goldDeck:gold,market:{R:[res.pop(),res.pop()],G:[gold.pop(),gold.pop()]},common:[obj.pop(),obj.pop()],players:[],turn:0,round:1,turnsLeft:0,passStreak:0,endTriggered:false};
 for(let i=0;i<n;i++)s.players.push({name:'P'+i,ai:true,level,board:{},placedN:0,hand:[res.pop(),res.pop(),gold.pop()],score:0,starter:st.pop(),secretChoices:[obj.pop(),obj.pop()]});
 s.players.forEach(p=>C.setup(s,p));return s;
}
function codexStep(s){
 const p=s.players[s.turn],before=JSON.stringify(s),m=C.choose(s,p);assert.equal(JSON.stringify(s),before);
 if(m){assert.ok(p.hand.includes(m.id));assert.ok(C.validSpots(p.board).some(([x,y])=>x===m.x&&y===m.y));if(m.face==='front')assert.ok(C.meetsReq(C.counts(p.board),C.CARDS[m.id]));C.placeOn(s,s.turn,m.id,m.face,m.x,m.y);const saved=JSON.stringify(s),src=C.draw(s,p);assert.equal(JSON.stringify(s),saved);if(src)assert.ok(C.drawOn(s,s.turn,src));}else C.passOn(s,p);
 C.advance(s);return m;
}

test('Splendor Hard retains its previous opening choices',()=>{
 const s=G.newGame([{name:'A',type:'bot',level:'hard'},{name:'B',type:'bot',level:'hard'}],G.rng(12));
 const moves=Array.from({length:8},()=>gemStep(s));
 assert.deepEqual(moves,[{t:'take',gems:['u','g','r']},{t:'take',gems:['u','g','r']},{t:'take',gems:['w','g','r']},{t:'take',gems:['u','g','r']},{t:'take',gems:['w','u','k']},{t:'reserve',lv:1,i:2},{t:'buy',lv:0,i:3},{t:'take',gems:['w','u','k']}]);
});
test('Splendor Expert ignores deck order and opponent face-down card identities',()=>{
 const s=G.newGame([{name:'A',type:'bot',level:'expert'},{name:'B',type:'bot',level:'expert'}],G.rng(34));
 for(let i=0;i<12;i++)gemStep(s);
 const pi=s.cur,other=(pi+1)%2;s.players[other].reserved=[{id:0,hidden:true}];
 const altered=clone(s);altered.players[other].reserved[0].id=80;altered.decks.forEach(d=>d.reverse());
 assert.deepEqual(G.botChoose(s,pi),G.botChoose(altered,pi));
});
test('Splendor Expert finishes a winning purchase instead of investing on the final seat',()=>{
 const s=G.newGame([{name:'A',type:'bot',level:'expert'},{name:'B',type:'bot',level:'expert'}],G.rng(3));s.cur=1;s.players[1].pts=14;
 const card=G.CARDS.find(c=>c.points===1);s.market=[[card.id],[],[]];s.decks=[[],[],[]];s.nobles=[];s.players[1].tokens={...card.cost,o:0};
 assert.deepEqual(G.botChoose(s,1),{t:'buy',lv:0,i:0});gemStep(s);assert.ok(s.over);assert.ok(G.standings(s).find(r=>r.i===1).winner);
});
test('all four Splendor levels complete legal 2-, 3- and 4-player games',()=>seedRandom(7,()=>{
 for(const n of [2,3,4])for(const level of ['easy','medium','hard','expert']){
 const s=G.newGame(Array.from({length:n},(_,i)=>({name:'P'+i,type:'bot',level})),G.rng(12));
 let k=0;for(;!s.over&&k<600;k++){gemStep(s);for(const p of s.players){assert.ok(Object.values(p.tokens).every(v=>v>=0));assert.ok(Object.values(p.tokens).reduce((a,b)=>a+b,0)<=G.TOKEN_LIMIT);}}
 assert.ok(s.over,`${n}p ${level} did not finish`);assert.ok(G.standings(s).some(r=>r.winner));
 }
}));
test('all four Codex levels complete legal 2-, 3- and 4-player games',()=>seedRandom(12,()=>{
 for(const n of [2,3,4])for(const level of ['easy','normal','hard','expert']){
 const s=codexGame(level,n);let k=0;for(;s.phase!=='over'&&k<180;k++)codexStep(s);
 assert.equal(s.phase,'over',`${n}p ${level} did not finish`);assert.equal(s.results.length,n);
 }
}));
test('Codex Expert ignores opponent hands/objectives and unseen deck identities',()=>{
 const s=codexGame('expert'),p=s.players[0],other=clone(s);other.players[1].hand=['GA1','GI4','RP8'];other.players[1].secret='OQ';other.resDeck.reverse();other.goldDeck.reverse();
 assert.deepEqual(C.choose(s,p),C.choose(other,other.players[0]));assert.equal(C.draw(s,p),C.draw(other,other.players[0]));
});
test('Codex Expert scores its final personal turn by actual final objectives',()=>{
 const s=codexGame('expert');for(let i=0;i<8;i++)codexStep(s);s.endTriggered=true;s.turnsLeft=1;
 const p=s.players[s.turn],m=C.choose(s,p),score=move=>{const b={...p.board,[move.x+','+move.y]:{id:move.id,face:move.face,x:move.x,y:move.y,order:p.placedN}};const n=C.counts(b);return C.pointsFor(b,move.id,move.face,move.x,move.y)+[...s.common,p.secret].reduce((sum,id)=>sum+C.objTimes(C.OBJ_BY_ID[id],b,n)*C.OBJ_BY_ID[id].pts,0);};
 let best=-Infinity;for(const id of p.hand)for(const face of ['front','back']){if(face==='front'&&!C.meetsReq(C.counts(p.board),C.CARDS[id]))continue;for(const [x,y]of C.validSpots(p.board))best=Math.max(best,score({id,face,x,y}));}
 assert.equal(score(m),best);
});
test('Catan Expert is retained by new-game validation and can claim a route award',()=>{
 const s=E.newGame({mode:'base',level:'expert',seed:4,players:[{name:'A',bot:true},{name:'B',bot:true}]});assert.equal(s.level,'expert');
 s.phase='main';s.current=0;s.players[0].hand={wood:1,brick:1,sheep:0,wheat:0,ore:0};
 const start=E.validSettlements(s,0,true)[0];s.vb[start]={p:0,t:'settlement'};
 function path(v,used){if(used.length===4)return used;for(const e of s.board.vertices[v].e){if(used.includes(e)||!s.board.edges[e].land)continue;const next=s.board.edges[e].v.find(x=>x!==v),answer=path(next,used.concat(e));if(answer)return answer;}return null;}
 const edges=path(start,[]);assert.ok(edges);edges.forEach(e=>s.eb[e]={p:0,t:'road'});s.players[0].pieces.road-=4;
 const before=JSON.stringify(s),move=Bot.awardRoute(s,0);assert.equal(JSON.stringify(s),before);assert.ok(move);assert.ok(E.doBuild(s,move.kind,move.e).ok);assert.equal(s.longest.p,0);assert.ok(E.roadLength(s,0)>=5);
});
test('Catan Expert goal funding ignores opponent private cards and deck order',()=>{
 const s=E.newGame({mode:'base',level:'expert',seed:3,players:[{name:'A',bot:true},{name:'B',bot:true}]});
 seedRandom(3,()=>{while(s.phase==='setup')assert.ok(Bot.step(s).ok);});s.phase='main';s.players[0].hand={wood:0,brick:1,sheep:2,wheat:2,ore:2};
 const other=clone(s);other.players[1].hand={wood:7,brick:0,sheep:0,wheat:0,ore:0};other.players[1].dev=[{type:'vp',turn:0}];other.deck.reverse();
 assert.deepEqual(Bot.pickGoal(s,0),Bot.pickGoal(other,0));
});
test('all four Catan levels complete both editions at 2, 3 and 4 players',()=>seedRandom(23,()=>{
 for(const mode of ['base','seafarers'])for(const n of [2,3,4])for(const level of ['easy','normal','hard','expert']){
 const s=E.newGame({mode,level,seed:4,players:Array.from({length:n},(_,i)=>({name:'P'+i,bot:true}))});
 let k=0;for(;s.phase!=='gameover'&&k<7000;k++){const r=Bot.step(s);assert.ok(r.ok,`${mode} ${n}p ${level} ${s.phase}: ${r.err}`);}
 assert.equal(s.phase,'gameover',`${mode} ${n}p ${level} did not finish`);assert.ok(s.winner!==null);
 }
}));
