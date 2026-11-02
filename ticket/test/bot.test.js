'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../engine');
const copy=x=>JSON.parse(JSON.stringify(x));
function make(edition='usa') { return E.create({seed:42,players:[{name:'A',bot:true},{name:'B',bot:true}],options:{edition}}); }
function clearHand(s) { s.players[0].hand=Object.fromEntries(E.allColors.map(c=>[c,0])); }

test('hard considers the combined network when choosing initial tickets',()=>{
 const s=make();clearHand(s);s.offers[0]=[0,1,14];
 assert.deepEqual(E.bot(s,0,'normal'),{type:'tickets',mask:6});
 assert.deepEqual(E.bot(s,0,'hard'),{type:'tickets',mask:3});
});
test('expert preserves a needed colour when paying for a gray route',()=>{
 const s=make();clearHand(s);s.phase='payment';s.pending={kind:'route',route:1};
 s.players[0].tickets=[6];s.players[0].hand.purple=5;s.players[0].hand.blue=3;
 assert.deepEqual(E.bot(s,0,'hard'),{type:'pay',color:'purple',wild:0});
 assert.deepEqual(E.bot(s,0,'expert'),{type:'pay',color:'blue',wild:0});
});
test('expert builds one station to rescue a completed European destination',()=>{
 const s=make('europe');s.phase='main';s.current=0;clearHand(s);s.players[0].hand.red=3;
 const get=(a,b)=>E.maps.europe.routes.find(r=>[r.a,r.b].sort().join('|')===[a,b].sort().join('|'));
 const foreign=get('Zurich','Munchen');s.claimed[foreign.id]=1;
 for(const [a,b] of [['Munchen','Venezia'],['Venezia','Roma'],['Roma','Brindisi']])s.claimed[get(a,b).id]=0;
 s.players[0].tickets=[8];
 const action=E.bot(s,0,'expert');assert.equal(action.type,'station');assert.ok(['Zurich','Munchen'].includes(action.city));
 let after=E.apply(s,0,action).state;after=E.apply(after,0,E.bot(after,0,'expert')).state;
 after.current=0;after.players[0].hand.red=3;
 assert.notEqual(E.bot(after,0,'expert').type,'station','do not buy another station for the same rescue');
});
test('route planning excludes a parallel track closed by another player',()=>{
 const s=make();s.claimed[1]=1;
 const route=E.path(s,0,'Vancouver','Seattle');
 assert.ok(!route.routes.includes(2));assert.ok(route.distance>1);
});
test('hard and expert ignore opponent hands, private tickets, future cards and random state',()=>{
 for(const edition of ['usa','europe'])for(const level of ['hard','expert']){
  let s=make(edition);
  for(let step=0;step<25&&!s.over;step++){
   const p=s.current,before=JSON.stringify(s),other=copy(s);
   other.players.forEach((pl,i)=>{if(i!==p){pl.hand=Object.fromEntries(E.allColors.map(c=>[c,99]));pl.tickets=[0];other.offers[i]=[0,1,2];}});
   other.deck.reverse();other.tickets.reverse();other.rng^=0x12345678;
   const action=E.bot(s,p,level);
   assert.deepEqual(E.bot(other,p,level),action,edition+' '+level+' '+s.phase);
   assert.deepEqual(E.bot(s,p,level),action);assert.equal(JSON.stringify(s),before);
   const next=E.apply(s,p,action);assert.equal(next.ok,true);s=next.state;
  }
 }
});
