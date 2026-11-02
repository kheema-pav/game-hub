'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine');
const copy = value => JSON.parse(JSON.stringify(value));
const players = [{name:'Black',bot:false},{name:'White',bot:true}];
const create = (seed=7) => E.create({seed,players,options:{}});
const play = (s,a) => {const result=E.apply(s,E.actor(s),a);assert.equal(result.ok,true,result.error);return result.state;};
const empty = () => ({...create(),board:Array(64).fill(null)});

test('standard opening has two discs each, Black first and exactly C4/D3/E6/F5 legal',()=>{
  const config={seed:7,players:copy(players),options:{}},before=copy(config),s=E.create(config);
  assert.deepEqual(config,before);assert.deepEqual(s.scores,[2,2]);assert.equal(E.actor(s),0);
  assert.deepEqual(E.legal(s,0).map(a=>E.coordinate(a.square)).sort(),['C4','D3','E6','F5']);
  assert.deepEqual(E.legal(s,1),[]);
  for(const count of [0,1,3,4])assert.throws(()=>E.create({players:Array(count).fill(players[0])}),/exactly two/);
});

test('one placement flips all eight bracketed rays, without secondary chain flips',()=>{
  const s=empty(),square=27,near=[],far=[];
  for(const [dy,dx] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
    near.push((3+dy)*8+3+dx);far.push((3+dy*2)*8+3+dx*2);
  }
  near.forEach(i=>s.board[i]=1);far.forEach(i=>s.board[i]=0);
  // This white disc becomes bracketed by a flipped disc but is not on a ray from D4.
  s.board[10]=1;s.board[2]=0;
  const before=JSON.stringify(s),next=play(s,{type:'place',square});
  assert.equal(JSON.stringify(s),before);assert.deepEqual(E.flips(s.board,0,square).sort((a,b)=>a-b),near.sort((a,b)=>a-b));
  near.forEach(i=>assert.equal(next.board[i],0));assert.equal(next.board[10],1);assert.equal(next.last.flipped.length,8);
});

test('rays need a closing friendly disc, never wrap a row or skip a friendly disc',()=>{
  const s=empty();s.board[8]=1;s.board[9]=0;assert.deepEqual(E.flips(s.board,0,7),[]);
  s.board=Array(64).fill(null);s.board[1]=1;s.board[2]=1;assert.deepEqual(E.flips(s.board,0,0),[]);
  s.board[3]=0;assert.deepEqual(E.flips(s.board,0,0),[1,2]);
  s.board[1]=0;assert.deepEqual(E.flips(s.board,0,0),[]);
});

test('forged moves, occupied cells and voluntary passes never change the board',()=>{
  const s=create(),before=JSON.stringify(s);
  for(const [player,action] of [[1,{type:'place',square:19}],[0,{type:'place',square:27}],[0,{type:'place',square:0}],[0,{type:'pass'}],[0,{type:'place',square:19,flips:[0]}],[0,{type:'place',square:'19'}],[0,{type:'place',square:-1}],[0,{type:'place',square:64}],[0,null],[0,[]],['0',{type:'place',square:19}]]){
    const result=E.apply(s,player,action);assert.equal(result.ok,false);assert.strictEqual(result.state,s);assert.equal(JSON.stringify(s),before);
  }
});

test('a blocked opponent passes automatically, and the same player can finish the board',()=>{
  const s=create();s.board=[0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,1,1,0,1,null,1,0,1,1,0,1,1,1,1,0,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,null];
  const next=play(s,{type:'place',square:23});
  assert.equal(next.over,false);assert.equal(next.current,0);assert.equal(next.passed,1);assert.deepEqual(E.legal(next,1),[]);
  const finished=play(next,{type:'place',square:63});assert.equal(finished.over,true);assert.equal(E.actor(finished),-1);
});

test('no moves for either side ends the game even when an empty square remains',()=>{
  const s=create();s.board=Array(64).fill(0);s.board[0]=null;s.board[1]=1;s.board[7]=null;
  const finished=play(s,{type:'place',square:0});assert.equal(finished.over,true);assert.deepEqual(finished.scores,[63,0]);
  assert.equal(finished.board[7],null);assert.deepEqual(finished.winners,[0]);assert.equal(finished.winner,0);
  assert.deepEqual(E.legal(finished,0),[]);assert.equal(E.bot(finished,0,'expert'),null);assert.match(E.result(finished),/63 discs to 0/);
});

test('equal final disc counts are a draw, not a first-player win',()=>{
  const s=create();s.board=Array(64).fill(1);s.board[0]=null;
  const blacks=[2,8,9];for(let i=3;blacks.length<30;i++)if(!blacks.includes(i))blacks.push(i);
  blacks.forEach(i=>s.board[i]=0);
  const finished=play(s,{type:'place',square:0});assert.equal(finished.over,true);assert.deepEqual(finished.scores,[32,32]);
  assert.equal(finished.winner,null);assert.deepEqual(finished.winners,[]);assert.match(E.result(finished),/draw/);
});

function solve(state,me){
  if(state.over)return state.scores[me]-state.scores[1-me];
  const values=E.legal(state,state.current).map(a=>solve(play(state,a),me));
  return state.current===me?Math.max(...values):Math.min(...values);
}
test('Expert finds a forced endgame win that the one-ply Normal bot misses',()=>{
  const s=create();s.moves=54;s.board=[null,0,0,0,0,0,0,0,null,null,0,1,0,0,0,0,1,1,1,1,0,0,0,0,null,1,1,0,1,1,0,0,1,null,0,1,0,0,1,0,1,0,1,1,1,1,1,1,1,null,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
  const before=JSON.stringify(s),normal=E.bot(s,0,'normal'),expert=E.bot(s,0,'expert');
  assert.ok(solve(play(s,normal),0)<0);assert.ok(solve(play(s,expert),0)>0);assert.equal(JSON.stringify(s),before);
  assert.deepEqual(expert,{type:'place',square:9});
});

test('every level finishes complete legal games, preserves input and replays identically',()=>{
  for(const level of ['easy','normal','hard','expert'])for(const seed of [3,29]){
    let s=create(seed),replay=copy(s),steps=0;
    while(!s.over&&steps<60){
      const player=E.actor(s),before=JSON.stringify(s),action=E.bot(s,player,level);
      assert.ok(E.legal(s,player).some(a=>JSON.stringify(a)===JSON.stringify(action)));assert.equal(JSON.stringify(s),before);
      assert.deepEqual(E.bot(copy(s),player,level),action,'deterministic bot decision');
      s=play(s,action);replay=play(replay,action);steps++;
      assert.deepEqual(s,replay);assert.equal(s.scores.reduce((a,b)=>a+b,0),4+steps);
      assert.ok(s.board.every(cell=>cell===null||cell===0||cell===1));
      if(!s.over)assert.ok(E.legal(s,E.actor(s)).length,'automatic pass always leaves a playable turn');
    }
    assert.equal(s.over,true,level+' did not end');assert.ok(steps<=60);
  }
});

test('bot uses only the public position and never calls unseeded randomness',()=>{
  const original=Math.random;Math.random=()=>{throw new Error('Unseeded random');};
  try{for(const level of ['easy','normal','hard','expert']){const s=create();assert.deepEqual(E.bot(s,0,level),E.bot(copy(s),0,level));assert.equal(E.bot(s,1,level),null);}}
  finally{Math.random=original;}
});

test('shared online replay reproduces a complete game including repeated actors after a pass',()=>{
  const C=require('../../shared/tabletop-core');
  const room={game:'reversi',seed:17,seats:{alice:{name:'Alice'},bob:{name:'Bob'}},opts:{}};
  const ids=C.seats(room),people=ids.map(id=>({...room.seats[id],bot:false}));
  let s=E.create({seed:room.seed,players:people,options:{}}),k=0,passes=0;
  const docs=Object.fromEntries(ids.map(id=>[id,{moves:[]}]));
  while(!s.over){const p=E.actor(s),action=E.bot(s,p,'easy');docs[ids[p]].moves.push({k:k++,action});s=play(s,action);if(s.passed!==null)passes++;}
  const replay=C.replay({id:'reversi',engine:E,minPlayers:2,maxPlayers:2},room,docs);
  assert.deepEqual(replay.state,s);assert.equal(replay.k,k);assert.equal(replay.rejected,0);assert.ok(passes>0);
});
