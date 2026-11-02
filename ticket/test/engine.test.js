'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),summary=require('./fixtures/map-summary.json');
const players=n=>Array.from({length:n},(_,i)=>({name:'P'+i,color:['#e4572e','#3b6fa8','#4f9d69','#e6ad23','#8c63af'][i],bot:true}));
const copy=x=>JSON.parse(JSON.stringify(x));
function ready(edition='usa',n=2){let s=E.create({seed:42,players:players(n),options:{edition}});while(s.phase==='initial')s=E.apply(s,s.current,E.bot(s,s.current)).state;return s;}
function play(s,props){const a=E.legal(s,s.current).find(a=>Object.keys(props).every(k=>a[k]===props[k]));assert.ok(a,'Missing legal move '+JSON.stringify(props)+' phase '+s.phase);const r=E.apply(s,s.current,a);assert.equal(r.ok,true,r.error);return r.state;}
const route=(s,a,b)=>E.maps[s.edition].routes.find(r=>[r.a,r.b].sort().join('|')===[a,b].sort().join('|'));
const grant=(s,p,c,n)=>{s.players[p].hand=Object.fromEntries(E.allColors.map(x=>[x,0]));s.players[p].hand[c]=n;};
function cardCount(s){return s.deck.length+s.discard.length+s.market.length+s.players.reduce((n,p)=>n+Object.values(p.hand).reduce((a,b)=>a+b,0),0)+(s.phase==='tunnel'?s.pending.paid.length+s.pending.revealed.length:0);}
test('full classic map datasets match audited route/ticket fixtures',()=>{
 for(const edition of ['usa','europe']){const m=E.maps[edition],f=summary[edition];assert.equal(Object.keys(m.cities).length,f.cities);assert.equal(m.routes.length,f.routes);assert.equal(m.tickets.length,f.tickets);assert.equal(m.routes.reduce((n,r)=>n+r.n,0),f.spaces);assert.equal(m.routes.filter(r=>r.t).length,f.tunnels);assert.equal(m.routes.filter(r=>r.f).length,f.ferries);assert.equal(m.routes.reduce((n,r)=>n+r.f,0),f.locomotives);assert.equal(m.tickets.filter(t=>t.long).length,f.long);for(const t of [...m.routes,...m.tickets]){assert.ok(m.cities[t.a],t.a);assert.ok(m.cities[t.b],t.b);}}
 const s=ready('europe'),a=route(s,'Amsterdam','Frankfurt'),b=route(s,'Angora','Smyrna'),c=route(s,'Brindisi','Palermo');assert.deepEqual([a.n,a.c],[2,'white']);assert.deepEqual([b.n,b.c,b.t],[3,'orange',true]);assert.deepEqual([c.n,c.f],[3,1]);
});
test('setup preserves inputs, has45 trains and110cards, and uses complete classic ticket decks',()=>{
 for(const edition of ['usa','europe']){const ps=players(5),opts={edition},before=JSON.stringify([ps,opts]);const a=E.create({seed:123,players:ps,options:opts}),b=E.create({seed:123,players:ps,options:opts});assert.deepEqual(a,b);assert.equal(JSON.stringify([ps,opts]),before);assert.equal(cardCount(a),110);assert.ok(a.players.every(p=>p.trains===45));assert.ok(a.offers.every(o=>o.length===(edition==='usa'?3:4)));if(edition==='europe')assert.ok(a.offers.every(o=>o.filter(id=>E.maps.europe.tickets[id].long).length===1));}
 assert.throws(()=>E.create({seed:1,players:players(1)}));assert.throws(()=>E.create({seed:1,players:players(6)}));assert.throws(()=>E.create({seed:1,players:players(2),options:{edition:'fake'}}));
});
test('initial ticket minimum2, later minimum1, and only newly offered tickets can be rejected',()=>{
 let s=E.create({seed:5,players:players(2),options:{edition:'europe'}});assert.ok(!E.legal(s,0).some(a=>a.mask===1));s=play(s,{type:'tickets',mask:3});assert.equal(s.players[0].tickets.length,2);s=play(s,{type:'tickets',mask:3});const old=s.players[0].tickets.slice();s=play(s,{type:'drawTickets'});assert.equal(s.pending.ids.length,3);s=play(s,{type:'tickets',mask:1});assert.equal(s.players[0].tickets.length,old.length+1);assert.ok(old.every(x=>s.players[0].tickets.includes(x)));assert.ok(!s.tickets.some(id=>E.maps.europe.tickets[id].long));
});
test('a face-up locomotive ends the draw turn; blind locomotives allow a second card',()=>{
 let s=ready();s.market=['wild','red','blue','green','orange'];s=play(s,{type:'draw',index:0});assert.equal(s.current,1);assert.equal(s.phase,'main');
 s=ready();s.deck.push('wild');s=play(s,{type:'draw',index:-1});assert.equal(s.current,0);assert.equal(s.phase,'draw');s.market[0]='wild';assert.ok(!E.legal(s,0).some(a=>a.type==='draw'&&a.index===0));s=play(s,{type:'draw',index:-1});assert.equal(s.current,1);
});
test('three visible locomotives redeal the market and keep its public composition valid',()=>{
 let s=ready();s.market=['red','wild','wild','blue','green'];s.deck.push('wild');s=play(s,{type:'draw',index:0});assert.ok(s.market.filter(c=>c==='wild').length<3);assert.equal(s.market.length,5);
});
test('discarded train cards reshuffle when the blind deck is empty',()=>{
 let s=ready();s.deck=[];s.discard=['red'];const before=s.players[0].hand.red;s=play(s,{type:'draw',index:-1});assert.equal(s.players[0].hand.red,before+1);
});
test('parallel routes close at2/3players and cannot both belong to the same player at4/5',()=>{
 for(const n of [2,3,4,5]){let s=ready('usa',n),twins=E.maps.usa.routes.filter(r=>[r.a,r.b].sort().join('|')==='Portland|Seattle');grant(s,0,'red',5);s=play(s,{type:'claim',route:twins[0].id});s=play(s,{type:'pay',color:'red',wild:0});grant(s,1,'blue',5);assert.equal(E.legal(s,1).some(a=>a.type==='claim'&&a.route===twins[1].id),n>=4);s.current=0;grant(s,0,'red',5);assert.ok(!E.legal(s,0).some(a=>a.type==='claim'&&a.route===twins[1].id));}
});
test('ferry payments enforce mandatory locomotives and sufficient trains',()=>{
 let s=ready('europe'),r=route(s,'Brindisi','Palermo');grant(s,0,'red',5);assert.ok(!E.legal(s,0).some(a=>a.type==='claim'&&a.route===r.id));s.players[0].hand.wild=1;s=play(s,{type:'claim',route:r.id});const payments=E.legal(s,0).filter(a=>a.type==='pay');assert.ok(payments.length&&payments.every(a=>a.wild>=1));s=play(s,{type:'pay',color:'red',wild:1});assert.equal(s.claimed[r.id],0);assert.equal(s.players[0].trains,42);assert.equal(s.players[0].points,4);
});
test('tunnel reveal charges matching cards and locomotives; abort returns initial payment but ends turn',()=>{
 let s=ready('europe'),r=route(s,'Angora','Smyrna');grant(s,0,'orange',5);s.players[0].hand.wild=1;s.deck=['blue','wild','orange'];s.discard=[];const hand=copy(s.players[0].hand);s=play(s,{type:'claim',route:r.id});s=play(s,{type:'pay',color:'orange',wild:0});assert.equal(s.phase,'tunnel');assert.equal(s.pending.extra,2);assert.equal(s.claimed[r.id],null);const branch=play(s,{type:'abort'});assert.deepEqual(branch.players[0].hand,hand);assert.equal(branch.current,1);assert.equal(branch.claimed[r.id],null);s=play(s,{type:'extra',wild:1});assert.equal(s.claimed[r.id],0);assert.equal(s.players[0].hand.orange,1);assert.equal(s.players[0].hand.wild,0);
});
test('all-locomotive tunnel payment is matched only by revealed locomotives',()=>{
 let s=ready('europe'),r=route(s,'Angora','Smyrna');grant(s,0,'wild',6);s.deck=['blue','orange','red'];s.discard=[];s=play(s,{type:'claim',route:r.id});s=play(s,{type:'pay',color:'wild',wild:3});assert.equal(s.pending.extra,0);s=play(s,{type:'extra',wild:0});assert.equal(s.claimed[r.id],0);assert.equal(s.players[0].hand.wild,3);
});
test('stations cost1/2/3matching cards and cannot share a city',()=>{
 let s=ready('europe',2);for(const [i,city] of ['Paris','London','Berlin'].entries()){s.current=0;grant(s,0,'red',5);s=play(s,{type:'station',city});s=play(s,{type:'pay',color:'red',wild:0});assert.equal(s.players[0].hand.red,5-i-1);assert.equal(s.stations[city],0);s.current=1;grant(s,1,'red',5);assert.ok(!E.legal(s,1).some(a=>a.type==='station'&&a.city===city));}s.current=0;assert.ok(!E.legal(s,0).some(a=>a.type==='station'));
});
test('stations borrow one opponent route for tickets only; unused stations score4each',()=>{
 let s=ready('europe'),foreign=route(s,'Zurich','Munchen'),owned=[route(s,'Munchen','Venezia'),route(s,'Venezia','Roma'),route(s,'Roma','Brindisi')];s.claimed[foreign.id]=1;owned.forEach(r=>s.claimed[r.id]=0);s.players[0].stations=[{city:'Zurich',route:null}];s.stations.Zurich=0;s.players[0].tickets=[E.maps.europe.tickets.find(t=>t.a==='Zurich'&&t.b==='Brindisi').id];assert.equal(E.connected(s,0,'Zurich','Brindisi',[]),false);assert.equal(E.connected(s,0,'Zurich','Brindisi',[foreign.id]),true);assert.equal(E.longest(s,0),6);s.phase='assign';s.current=0;s.assignIndex=0;s=play(s,{type:'assign',route:foreign.id});assert.equal(s.over,true);assert.equal(s.breakdown[0].completed,1);assert.equal(s.breakdown[0].stationBonus,8);assert.equal(s.breakdown[1].stationBonus,12);assert.equal(s.breakdown[0].longest,6);
});
test('longest path permits loops and repeated cities while never reusing a route',()=>{
 let s=ready();['Denver|Phoenix','Denver|Santa Fe','Phoenix|Santa Fe','Los Angeles|Phoenix'].forEach(k=>{const r=E.maps.usa.routes.find(r=>[r.a,r.b].sort().join('|')===k);assert.ok(r,k);s.claimed[r.id]=0;});assert.equal(E.longest(s,0),13);
 s=ready();for(const k of ['Denver|Phoenix','Denver|Helena','Denver|Kansas City']){const r=E.maps.usa.routes.find(r=>[r.a,r.b].sort().join('|')===k);s.claimed[r.id]=0;}assert.equal(E.longest(s,0),9);
});
test('the player who triggers the final round still receives one additional turn',()=>{
 let s=ready(),r=route(s,'Los Angeles','Phoenix');grant(s,0,'red',5);s.players[0].trains=5;s=play(s,{type:'claim',route:r.id});s=play(s,{type:'pay',color:'red',wild:0});assert.equal(s.finalRemaining,2);assert.equal(s.over,false);s=play(s,{type:'draw',index:-1});s=play(s,{type:'draw',index:-1});assert.equal(s.finalRemaining,1);assert.equal(s.current,0);s=play(s,{type:'draw',index:-1});s=play(s,{type:'draw',index:-1});assert.equal(s.over,true);
});
test('final ties follow completed tickets, fewer Europe stations, then longest bonus; remaining ties share victory',()=>{
 let s=ready();s.players.forEach(p=>{p.tickets=[];p.points=10;});E.finish(s);assert.deepEqual(s.winners,[0,1]);assert.equal(s.winner,null);
 s=ready('europe');s.players.forEach(p=>{p.tickets=[];p.points=10;});s.players[0].points=14;s.players[0].stations=[{city:'Paris',route:null}];E.finish(s);assert.deepEqual(s.scores,[22,22]);assert.equal(s.winner,1);
});
test('invalid actions and wrong authors never change input state',()=>{
 const s=ready(),before=JSON.stringify(s);for(const a of [null,{type:'claim',route:-1},{type:'pay',color:'red',wild:-2},{type:'draw',index:99},{type:'tickets',mask:0},{type:'station',city:'__proto__'}]){assert.equal(E.apply(s,0,a).ok,false);assert.equal(JSON.stringify(s),before);}assert.equal(E.apply(s,1,E.legal(s,0)[0]).ok,false);assert.equal(JSON.stringify(s),before);
});
for(const edition of ['usa','europe'])for(const n of [2,3,4,5])for(const level of ['easy','normal','hard','expert'])test(`${edition} ${n}players ${level}: bots finish with train/card conservation and deterministic replay`,()=>{
 const seed=level==='easy'?1:71;let s=E.create({seed,players:players(n),options:{edition}});const initial=copy(s),history=[];for(let k=0;!s.over&&k<4000;k++){const p=E.actor(s),a=E.bot(s,p,level),before=JSON.stringify(s),r=E.apply(s,p,a);assert.equal(r.ok,true,r.error);assert.equal(JSON.stringify(s),before);history.push([p,a]);s=r.state;assert.equal(cardCount(s),110);for(let i=0;i<n;i++)assert.equal(s.players[i].trains+E.maps[edition].routes.reduce((sum,r)=>sum+(s.claimed[r.id]===i?r.n:0),0),45);}
 assert.equal(s.over,true);assert.ok(s.winners.length);let replay=initial;for(const [p,a] of history)replay=E.apply(replay,p,a).state;assert.deepEqual(replay,s);
});
