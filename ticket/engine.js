/* Original deterministic Ticket to Ride classic engine. Rules and data provenance: README.md. */
(function(root){
'use strict';
const MAPS=typeof module!=='undefined'&&module.exports?require('./data.js'):root.HubTicketMaps;
const COLORS=['purple','blue','orange','white','green','yellow','black','red'];
const ALL=COLORS.concat('wild'), POINTS={1:1,2:2,3:4,4:7,5:10,6:15,8:21};
const clone=x=>JSON.parse(JSON.stringify(x));
function random(s){let x=s.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function shuffle(s,a){for(let i=a.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const map=s=>MAPS[s.edition], actor=s=>s.over?-1:s.current;
const pair=r=>[r.a,r.b].sort().join('|');
function draw(s){if(!s.deck.length&&s.discard.length){s.deck=shuffle(s,s.discard);s.discard=[];}return s.deck.length?s.deck.pop():null;}
function refill(s){
 let attempts=0;
 while(true){
  while(s.market.length<5){const c=draw(s);if(c===null)break;s.market.push(c);}
  if(s.market.filter(c=>c==='wild').length<3||s.market.length<5)break;
  // If the drawable stock cannot produce a valid market, leave it face down for blind draws.
  const stock=s.deck.concat(s.discard,s.market);
  if(stock.filter(c=>c!=='wild').length<3){s.discard.push(...s.market);s.market=[];break;}
  s.discard.push(...s.market);s.market=[];
  if(++attempts>250){ // deterministic safety against a pathological shuffle cycle
   s.deck=shuffle(s,s.deck.concat(s.discard));s.discard=[];
   const regular=s.deck.filter(c=>c!=='wild');s.market=regular.slice(0,3);
   for(const c of s.market)s.deck.splice(s.deck.indexOf(c),1);
   while(s.market.length<5){const c=draw(s);if(c===null)break;s.market.push(c);}break;
  }
 }
}
function create({seed,players,options={}}){
 if(!Array.isArray(players)||players.length<2||players.length>5)throw Error('Ticket to Ride needs 2 to 5 players');
 if(options.edition!==undefined&&!['usa','europe'].includes(options.edition))throw Error('Unsupported Ticket to Ride edition');
 const edition=options.edition==='europe'?'europe':'usa';
 const s={v:1,edition,rng:(seed>>>0)||0x6d2b79f5,players:players.map((p,i)=>({name:String(p.name||`Player ${i+1}`).slice(0,24),color:(typeof p.color==='string'&&/^#[0-9a-f]{6}$/i.test(p.color)?p.color:null)||['#e4572e','#3b6fa8','#4f9d69','#e6ad23','#8c63af'][i],bot:!!p.bot,hand:Object.fromEntries(ALL.map(c=>[c,0])),tickets:[],trains:45,points:0,stations:[]})),
  current:0,phase:'initial',initial:0,offers:[],tickets:[],deck:[],discard:[],market:[],claimed:Array(MAPS[edition].routes.length).fill(null),stations:{},pending:null,finalRemaining:null,turn:0,passes:0,over:false,winner:null,winners:[],scores:null,log:[]};
 s.deck=shuffle(s,COLORS.flatMap(c=>Array(12).fill(c)).concat(Array(14).fill('wild')));
 for(const p of s.players)for(let i=0;i<4;i++)p.hand[draw(s)]++;
 refill(s);
 const short=shuffle(s,map(s).tickets.filter(t=>!t.long).map(t=>t.id));const long=shuffle(s,map(s).tickets.filter(t=>t.long).map(t=>t.id));
 s.tickets=short;
 for(let i=0;i<s.players.length;i++){const o=s.tickets.splice(0,3);if(edition==='europe')o.push(long.pop());s.offers.push(o);}
 return s;
}
function available(s,i,p){const r=map(s).routes[i];if(!r||s.claimed[i]!==null||s.players[p].trains<r.n)return false;
 const twins=map(s).routes.filter(x=>x.id!==i&&pair(x)===pair(r));
 return !twins.some(x=>s.claimed[x.id]===p||(s.players.length<4&&s.claimed[x.id]!==null));
}
function payments(hand,n,color,ferry=0){
 const out=[];const choices=color==='gray'?COLORS:[color];
 for(const c of choices)for(let wild=ferry;wild<=Math.min(n,hand.wild);wild++){
  const regular=n-wild;if(regular<=hand[c]&&regular>0)out.push({color:c,wild});
 }
 if(hand.wild>=n&&n>=ferry)out.push({color:'wild',wild:n});return out;
}
function selections(ids,min){const out=[];for(let mask=1;mask<(1<<ids.length);mask++){let n=0;for(let i=0;i<ids.length;i++)if(mask&(1<<i))n++;if(n>=min)out.push({type:'tickets',mask});}return out;}
function legal(s,p){
 if(s.over||p!==s.current||!s.players[p])return[];
 const pl=s.players[p];
 if(s.phase==='initial')return selections(s.offers[p],2);
 if(s.phase==='tickets')return selections(s.pending.ids,1);
 if(s.phase==='payment'){
  const q=s.pending,r=q.kind==='route'?map(s).routes[q.route]:null;
  const opts=payments(pl.hand,r?r.n:pl.stations.length+1,r?r.c:'gray',r?r.f:0).map(x=>Object.assign({type:'pay'},x));
  return [{type:'cancel'}].concat(opts);
 }
 if(s.phase==='tunnel'){
  const q=s.pending,out=[{type:'abort'}];
  for(let wild=0;wild<=Math.min(q.extra,pl.hand.wild);wild++)if((q.color==='wild'?wild===q.extra:q.extra-wild<=pl.hand[q.color]))out.push({type:'extra',wild});
  return out;
 }
 if(s.phase==='assign'){
  const city=pl.stations[s.assignIndex].city;
  return [{type:'assign',route:null}].concat(map(s).routes.filter(r=>(r.a===city||r.b===city)&&s.claimed[r.id]!==null&&s.claimed[r.id]!==p).map(r=>({type:'assign',route:r.id})));
 }
 const out=[];
 if(s.phase==='main'||s.phase==='draw'){
  if(s.deck.length||s.discard.length)out.push({type:'draw',index:-1});
  s.market.forEach((c,i)=>{if(s.phase!=='draw'||c!=='wild')out.push({type:'draw',index:i});});
 }
 if(s.phase==='draw')return out.length?out:[{type:'finishDraw'}];
 if(s.tickets.length)out.push({type:'drawTickets'});
 for(const r of map(s).routes)if(available(s,r.id,p)&&payments(pl.hand,r.n,r.c,r.f).length)out.push({type:'claim',route:r.id});
 if(s.edition==='europe'&&pl.stations.length<3&&payments(pl.hand,pl.stations.length+1,'gray').length)for(const city of Object.keys(map(s).cities))if(!(city in s.stations))out.push({type:'station',city});
 return out.length?out:[{type:'pass'}];
}
function note(s,text){s.log.unshift(text);s.log=s.log.slice(0,12);}
function spend(pl,color,wild,n){pl.hand.wild-=wild;if(color!=='wild')pl.hand[color]-=n-wild;return Array(n-wild).fill(color).concat(Array(wild).fill('wild'));}
function claim(s,route){const r=map(s).routes[route],pl=s.players[s.current];s.claimed[route]=s.current;pl.trains-=r.n;pl.points+=POINTS[r.n];note(s,`${pl.name} claimed ${r.a} to ${r.b} (${POINTS[r.n]} points).`);}
function endTurn(s,passed=false){
 s.pending=null;s.phase='main';refill(s);s.turn++;s.passes=passed?s.passes+1:0;
 if(s.finalRemaining!==null){s.finalRemaining--;if(s.finalRemaining===0)return beginFinal(s);}
 else if(s.players[s.current].trains<=2){s.finalRemaining=s.players.length;note(s,'Final round: every player gets one more turn.');}
 if(s.passes>=s.players.length){note(s,'No player has a legal move. Scoring the stranded game.');return beginFinal(s);}
 s.current=(s.current+1)%s.players.length;
}
function beginFinal(s){
 if(s.edition==='europe'){
  const p=s.players.findIndex(x=>x.stations.length);
  if(p>=0){s.phase='assign';s.current=p;s.assignIndex=0;return;}
 }
 finish(s);
}
function connected(s,p,a,b,borrowed){
 const adj={};for(const r of map(s).routes)if(s.claimed[r.id]===p||(borrowed&&borrowed.includes(r.id))){(adj[r.a]||(adj[r.a]=[])).push(r.b);(adj[r.b]||(adj[r.b]=[])).push(r.a);}
 const seen=new Set([a]),q=[a];while(q.length){const x=q.pop();if(x===b)return true;for(const y of adj[x]||[])if(!seen.has(y)){seen.add(y);q.push(y);}}return false;
}
function longest(s,p){
 const edges=map(s).routes.filter(r=>s.claimed[r.id]===p),adj={};
 edges.forEach((r,i)=>{(adj[r.a]||(adj[r.a]=[])).push([i,r.b,r.n]);(adj[r.b]||(adj[r.b]=[])).push([i,r.a,r.n]);});
 const memo=new Map();
 function dfs(v,used){const k=v+'|'+used;const hit=memo.get(k);if(hit!==undefined)return hit;let best=0;for(const [i,w,n] of adj[v]||[]){const bit=1n<<BigInt(i);if(!(used&bit))best=Math.max(best,n+dfs(w,used|bit));}memo.set(k,best);return best;}
 return Math.max(0,...Object.keys(adj).map(v=>dfs(v,0n)));
}
function finish(s){
 const lengths=s.players.map((_,p)=>longest(s,p)),maxLength=Math.max(...lengths);
 s.breakdown=s.players.map((pl,p)=>{
  const borrowed=pl.stations.map(x=>x.route).filter(x=>x!==null),tickets=pl.tickets.map(id=>{const t=map(s).tickets[id];return {id,done:connected(s,p,t.a,t.b,borrowed),points:t.points};});
  const ticketPoints=tickets.reduce((n,t)=>n+(t.done?t.points:-t.points),0),bonus=lengths[p]===maxLength&&maxLength>0?10:0,stationBonus=s.edition==='europe'?(3-pl.stations.length)*4:0;
  return {routes:pl.points,tickets,ticketPoints,completed:tickets.filter(t=>t.done).length,longest:lengths[p],bonus,stationBonus,total:pl.points+ticketPoints+bonus+stationBonus};
 });
 s.scores=s.breakdown.map(b=>b.total);let candidates=s.scores.map((v,i)=>i).filter(i=>s.scores[i]===Math.max(...s.scores));
 for(const value of [p=>s.breakdown[p].completed,...(s.edition==='europe'?[p=>3-s.players[p].stations.length]:[]),p=>s.breakdown[p].bonus]){const best=Math.max(...candidates.map(value));candidates=candidates.filter(p=>value(p)===best);}
 s.over=true;s.phase='over';s.winners=candidates;s.winner=candidates.length===1?candidates[0]:null;s.current=candidates[0];
}
function apply(state,p,action){
 if(!action||typeof action!=='object'||Array.isArray(action))return {ok:false,state,error:'Invalid action'};
 const key=JSON.stringify(action),match=legal(state,p).find(a=>JSON.stringify(a)===key);
 if(!match)return {ok:false,state,error:'That move is not legal'};
 const s=clone(state),pl=s.players[p],a=match;
 if(a.type==='tickets'){
  const initial=s.phase==='initial',ids=initial?s.offers[p]:s.pending.ids,kept=ids.filter((_,i)=>a.mask&(1<<i)),rejected=ids.filter((_,i)=>!(a.mask&(1<<i)));
  pl.tickets.push(...kept);if(!initial||s.edition==='usa')s.tickets.push(...rejected);
  if(initial){s.offers[p]=[];s.initial++;if(s.initial===s.players.length){s.current=0;s.phase='main';}else s.current=s.initial;}
  else endTurn(s);
 }else if(a.type==='drawTickets'){s.pending={ids:s.tickets.splice(0,3)};s.phase='tickets';}
 else if(a.type==='claim'){s.pending={kind:'route',route:a.route};s.phase='payment';}
 else if(a.type==='station'){s.pending={kind:'station',city:a.city};s.phase='payment';}
 else if(a.type==='cancel'){s.pending=null;s.phase='main';}
 else if(a.type==='pay'){
  const q=s.pending;
  if(q.kind==='station'){
   s.discard.push(...spend(pl,a.color,a.wild,pl.stations.length+1));pl.stations.push({city:q.city,route:null});s.stations[q.city]=p;note(s,`${pl.name} built a station in ${q.city}.`);endTurn(s);
  }else{
   const r=map(s).routes[q.route],paid=spend(pl,a.color,a.wild,r.n);
   if(r.t){
    const revealed=[];for(let i=0;i<3;i++){const c=draw(s);if(c!==null)revealed.push(c);}
    const extra=revealed.filter(c=>c==='wild'||(a.color!=='wild'&&c===a.color)).length;
    s.pending={route:q.route,color:a.color,paid,revealed,extra};s.phase='tunnel';
   }else{s.discard.push(...paid);claim(s,q.route);endTurn(s);}
  }
 }else if(a.type==='abort'||a.type==='extra'){
  const q=s.pending;s.discard.push(...q.revealed);
  if(a.type==='abort'){for(const c of q.paid)pl.hand[c]++;note(s,`${pl.name} abandoned the tunnel attempt.`);}
  else{s.discard.push(...q.paid,...spend(pl,q.color,a.wild,q.extra));claim(s,q.route);}
  endTurn(s);
 }else if(a.type==='draw'){
  const second=s.phase==='draw',c=a.index===-1?draw(s):s.market.splice(a.index,1)[0];pl.hand[c]++;refill(s);
  if(second||(a.index!==-1&&c==='wild'))endTurn(s);else s.phase='draw';
 }else if(a.type==='finishDraw')endTurn(s);
 else if(a.type==='pass')endTurn(s,true);
 else if(a.type==='assign'){
  pl.stations[s.assignIndex].route=a.route;s.assignIndex++;
  if(s.assignIndex>=pl.stations.length){const n=s.players.findIndex((x,i)=>i>p&&x.stations.length);if(n<0)finish(s);else{s.current=n;s.assignIndex=0;}}
 }
 return {ok:true,state:s};
}
// Weighted shortest route through public claims; no opposing private hand is inspected.
function path(s,p,a,b){
 const cities=Object.keys(map(s).cities),dist=Object.fromEntries(cities.map(c=>[c,Infinity])),prev={};dist[a]=0;const todo=new Set(cities);
 while(todo.size){let v=null;for(const c of todo)if(v===null||dist[c]<dist[v])v=c;if(dist[v]===Infinity||v===b)break;todo.delete(v);
  for(const r of map(s).routes){if(r.a!==v&&r.b!==v)continue;if(s.claimed[r.id]!==null&&s.claimed[r.id]!==p)continue;const w=r.a===v?r.b:r.a,cost=s.claimed[r.id]===p?0:r.n;if(dist[v]+cost<dist[w]){dist[w]=dist[v]+cost;prev[w]=[v,r.id];}}
 }
 const routes=[];let c=b;while(prev[c]){routes.push(prev[c][1]);c=prev[c][0];}return {distance:dist[b],routes:c===a?routes:[]};
}
function bot(s,p,level='normal'){
 const actions=legal(s,p),pl=s.players[p];if(!actions.length)return null;
 if(s.phase==='initial'||s.phase==='tickets'){
  const ids=s.phase==='initial'?s.offers[p]:s.pending.ids,min=s.phase==='initial'?2:1;
  const ranked=ids.map((id,i)=>({i,cost:path(s,p,map(s).tickets[id].a,map(s).tickets[id].b).distance,points:map(s).tickets[id].points})).sort((a,b)=>(a.cost-a.points*.25)-(b.cost-b.points*.25)||a.i-b.i);
  const mask=ranked.slice(0,min).reduce((m,x)=>m|(1<<x.i),0);return actions.find(a=>a.mask===mask)||actions[0];
 }
 if(s.phase==='payment')return actions.filter(a=>a.type==='pay').sort((a,b)=>a.wild-b.wild||COLORS.indexOf(a.color)-COLORS.indexOf(b.color))[0]||actions[0];
 if(s.phase==='tunnel')return actions.filter(a=>a.type==='extra').sort((a,b)=>a.wild-b.wild)[0]||actions[0];
 if(s.phase==='assign'){
  const ranked=actions.map(a=>{const borrowed=pl.stations.map(x=>x.route).filter(x=>x!==null).concat(a.route===null?[]:[a.route]);return {a,value:pl.tickets.reduce((n,id)=>{const t=map(s).tickets[id];return n+(connected(s,p,t.a,t.b,borrowed)?t.points:0);},0)};});
  ranked.sort((a,b)=>b.value-a.value);return ranked[0].a;
 }
 const goals=pl.tickets.map(id=>map(s).tickets[id]).filter(t=>!connected(s,p,t.a,t.b,pl.stations.map(x=>x.route).filter(x=>x!==null))),wanted=new Set();
 for(const t of goals)for(const i of path(s,p,t.a,t.b).routes)if(s.claimed[i]===null)wanted.add(i);
 const claims=actions.filter(a=>a.type==='claim').map(a=>({a,value:POINTS[map(s).routes[a.route].n]+(wanted.has(a.route)?18:0)})).sort((a,b)=>b.value-a.value||a.a.route-b.a.route);
 if(claims.length)return claims[level==='easy'?(s.turn+p)%Math.min(3,claims.length):0].a;
 const targets=map(s).routes.filter(r=>s.claimed[r.id]===null&&r.n<=pl.trains&&(wanted.has(r.id)||!wanted.size));
 const need={};for(const r of targets){if(r.c!=='gray')need[r.c]=(need[r.c]||0)+Math.max(0,r.n-pl.hand[r.c]-pl.hand.wild);}
 const draws=actions.filter(a=>a.type==='draw');
 if(draws.length){let best=draws[0],val=-Infinity;for(const a of draws){const c=a.index<0?'blind':s.market[a.index],v=c==='wild'?4:c==='blind'?1.5:(need[c]||0)+1;if(v>val){val=v;best=a;}}return best;}
 return actions.find(a=>a.type!=='station')||actions[0];
}
const api={create,actor,legal,apply,bot,maps:MAPS,colors:COLORS,allColors:ALL,connected,longest,path,finish,result:s=>s.over?(s.winners.length>1?'Shared victory':`${s.players[s.winner].name} wins`):'',score:(s,p)=>s.scores?s.scores[p]:s.players[p].points};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else{root.HubEngines=root.HubEngines||{};root.HubEngines.ticket=api;}
})(typeof window!=='undefined'?window:globalThis);
