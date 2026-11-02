'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8');
const {replayOnline,normGuess}=new Function(engine+'\nreturn {replayOnline,normGuess};')();
const room={game:'sketch',seed:42,opts:{secs:60,rounds:1},seats:{alice:{name:'Alice'},bob:{name:'Bob'}}};
test('matching remains case/accent/article/punctuation insensitive',()=>{
 assert.equal(normGuess(' The Café! '),'cafe');assert.equal(normGuess('a Snow-globe'),'snowglobe');
});
test('separate viewers replay the same game while the current word stays drawer-only',()=>{
 const lists={alice:[],bob:[]}, read=uid=>lists[uid];
 let state=replayOnline(room,read,'alice');
 for(let turn=0;turn<2;turn++){
  const drawer=state.cur.drawer,guesser=drawer==='alice'?'bob':'alice';
  lists[drawer].push({a:'start',turn,at:1000+turn*10000});
  const d=replayOnline(room,read,drawer),g=replayOnline(room,read,guesser);
  assert.ok(d.cur.word);assert.equal(g.cur.word,null);assert.equal(d.cur.key,g.cur.key);
  const gi=lists[guesser].length;
  lists[guesser].push({a:'guess',turn,at:2000+turn*10000,text:d.cur.word.w});
  lists[drawer].push({a:'correct',turn,uid:guesser,gi});
  state=replayOnline(room,read,drawer);
 }
 const a=replayOnline(room,read,'alice'),b=replayOnline(room,read,'bob');
 assert.equal(a.over,true);assert.equal(b.over,true);assert.deepEqual(a.scores,b.scores);assert.deepEqual(a.scores,{alice:3,bob:3});assert.deepEqual(a.done,b.done);
});
