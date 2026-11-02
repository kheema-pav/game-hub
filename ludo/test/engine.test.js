'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine');
const clone=x=>JSON.parse(JSON.stringify(x));
const players=n=>Array.from({length:n},(_,i)=>({name:['Asha','Bram','Cleo','Dev'][i],bot:i>0,color:'red'}));
const game=(n=2,seed=7)=>E.create({seed,players:players(n),options:{}});
const moveState=(over={})=>Object.assign(game(),{phase:'move',die:1,lastDie:1},over);
const apply=(s,p,a)=>{const r=E.apply(s,p,a);assert.equal(r.ok,true,r.error);return r.state;};
function seedFor(n){for(let seed=1;seed<100;seed++){const s=game(2,seed);if(E.apply(s,0,{type:'roll'}).state.lastDie===n)return seed;}throw Error('No seed');}
test('creation validates player count, uses opposite seats for two and does not mutate configuration',()=>{
  const config={seed:7,players:players(2),options:{example:'ignored'}},before=clone(config),s=E.create(config);
  assert.deepEqual(config,before);assert.deepEqual(s.slots,[0,2]);assert.deepEqual(s.tokens,[[-1,-1,-1,-1],[-1,-1,-1,-1]]);
  for(const n of [0,1,5])assert.throws(()=>game(n));
  assert.equal(E.TRACK.length,52);assert.equal(new Set(E.TRACK.map(x=>x.join(','))).size,52);assert.equal(E.SAFE.length,8);
});
test('only a six permits yard entry and six grants an extra roll',()=>{
  const s=E.apply(game(2,seedFor(6)),0,{type:'roll'}).state;
  assert.equal(s.phase,'move');assert.equal(s.sixStreak,1);assert.equal(E.legal(s,0).length,4);
  const after=apply(s,0,{type:'move',token:0});assert.equal(after.tokens[0][0],0);assert.equal(after.current,0);assert.equal(after.phase,'roll');
  const noSix=apply(game(2,seedFor(3)),0,{type:'roll'});assert.equal(noSix.current,1);assert.equal(noSix.phase,'roll');assert.equal(noSix.lastDie,3);
});
test('wrong authors, wrong phases, forged dice, bad indices and extra fields are rejected without mutation',()=>{
  const s=game(),before=JSON.stringify(s);
  for(const [p,a]of [[1,{type:'roll'}],[0,{type:'move',token:0}],[0,{type:'roll',die:6}],[0,{type:'roll',__proto__:{evil:1}}],[0,{type:'move',token:9}],[0,{type:'move',token:'0'}],[0,null],[0,[]]]){
    // Prototype-only changes do not add an own action field, but must not influence engine behaviour.
    if(a&&a.type==='roll'&&Object.keys(a).length===1&&p===0)continue;
    const r=E.apply(s,p,a);assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.equal(JSON.stringify(s),before);
  }
  const r=E.apply(s,0,JSON.parse('{"type":"roll","__proto__":{"evil":1}}'));assert.equal(r.ok,false);
  assert.deepEqual(E.legal(s,1),[]);assert.equal(E.bot(s,1,'hard'),null);
});
test('a third consecutive six forfeits only that roll, with no token movement',()=>{
  const s=game(2,seedFor(6));s.sixStreak=2;s.tokens[0]=[12,6,-1,-1];
  const after=apply(s,0,{type:'roll'});assert.equal(after.current,1);assert.equal(after.sixStreak,0);assert.deepEqual(after.tokens,s.tokens);assert.match(after.notice,/third six/);
});
test('unsafe landing captures all opposing stacked tokens and capture grants no extra turn',()=>{
  const s=moveState();s.tokens[0][0]=0;s.tokens[1]=[27,27,-1,-1];
  assert.equal(E.trackIndex(s,1,0),1);
  const after=apply(s,0,{type:'move',token:0});assert.deepEqual(after.tokens[1],[-1,-1,-1,-1]);assert.equal(after.current,1);assert.match(after.notice,/captured 2 tokens/);
  assert.deepEqual(s.tokens[1],[27,27,-1,-1]);
});
test('star squares are safe, pieces may pass and share squares, private columns cannot be captured',()=>{
  const s=moveState({die:2});s.tokens[0]=[6,7,-1,-1];s.tokens[1][0]=34;
  assert.equal(E.trackIndex(s,1,0),8);
  const after=apply(s,0,{type:'move',token:0});assert.equal(after.tokens[0][0],8);assert.equal(after.tokens[1][0],34);
  const stacked=moveState();stacked.tokens[0]=[4,5,-1,-1];assert.equal(apply(stacked,0,{type:'move',token:0}).tokens[0][0],5);
  const home=moveState();home.tokens[0][0]=51;home.tokens[1][0]=25;assert.equal(E.trackIndex(home,0,0),null);
});
test('home needs an exact roll; finished tokens cannot move; all four home ends the game',()=>{
  const s=moveState({die:2});s.tokens[0]=[55,56,56,56];assert.deepEqual(E.legal(s,0),[]);assert.equal(E.apply(s,0,{type:'move',token:0}).ok,false);
  s.die=1;const before=JSON.stringify(s),after=apply(s,0,{type:'move',token:0});assert.equal(JSON.stringify(s),before);
  assert.equal(after.over,true);assert.equal(after.winner,0);assert.deepEqual(after.winners,[0]);assert.deepEqual(after.scores,[4,0]);assert.deepEqual(E.legal(after,0),[]);assert.equal(E.actor(after),-1);assert.match(E.result(after),/all four tokens home/);
});
test('the home turn leaves the main track after progress 50',()=>{
  const s=moveState();s.tokens[0][0]=50;assert.equal(E.trackIndex(s,0,0),50);
  const after=apply(s,0,{type:'move',token:0});assert.equal(after.tokens[0][0],51);assert.equal(E.trackIndex(after,0,0),null);
});
test('seeded roll sequences are repeatable and independent of Math.random',()=>{
  const original=Math.random;Math.random=()=>{throw Error('Unseeded randomness used');};
  try{
    let a=game(3,991),b=game(3,991);
    for(let i=0;i<200;i++){const p=E.actor(a),action=E.bot(a,p,'hard');a=apply(a,p,action);b=apply(b,p,action);assert.deepEqual(a,b);if(a.over)break;}
  }finally{Math.random=original;}
});
test('all bot levels finish complete 2-, 3- and 4-player games with token invariants',()=>{
  let count=0,maxActions=0;
  for(const n of [2,3,4])for(const level of ['easy','normal','hard','expert'])for(const seed of [1,12,345]){
    let s=game(n,seed),steps=0;
    for(;steps<30000&&!s.over;steps++){
      const p=E.actor(s),action=E.bot(s,p,level);assert.ok(action,'no legal bot action at '+JSON.stringify(s));
      const before=JSON.stringify(s);const after=apply(s,p,action);assert.equal(JSON.stringify(s),before,'successful apply mutated input');s=after;
      s.tokens.flat().forEach(t=>assert.ok(Number.isInteger(t)&&t>=-1&&t<=E.FINISH));assert.equal(s.tokens.flat().length,n*4);
      s.scores.forEach((score,i)=>assert.equal(score,s.tokens[i].filter(t=>t===E.FINISH).length));
    }
    assert.equal(s.over,true,n+' players '+level+' seed '+seed+' did not finish');assert.equal(s.tokens[s.winner].filter(t=>t===E.FINISH).length,4);count++;maxActions=Math.max(maxActions,steps);
  }
  assert.equal(count,36);console.log('36 complete bot games; maximum '+maxActions+' actions.');
});

test('expert avoids exposing a safe advanced token when another token can progress',()=>{
  const s=moveState();s.tokens=[[47,30,-1,-1],[16,-1,-1,-1]];
  // The first token would leave a star for square 48. The opponent on square
  // 42 can capture it with a six, losing nearly a whole lap of progress.
  assert.equal(E.bot(s,0,'hard').token,0);
  const before=JSON.stringify(s);
  assert.equal(E.bot(s,0,'expert').token,1);
  assert.equal(JSON.stringify(s),before);
});
test('expert values capturing advanced opponents and takes an exact finish',()=>{
  const s=moveState();s.tokens=[[0,10,-1,-1],[27,37,-1,-1]];
  // Both choices capture, but the second removes more opposing progress.
  assert.equal(E.bot(s,0,'expert').token,1);
  s.tokens[0]=[55,10,-1,-1];
  assert.equal(E.bot(s,0,'expert').token,0);
  s.tokens[0]=[55,56,56,56];
  assert.equal(apply(s,0,E.bot(s,0,'expert')).over,true);
});
test('expert does not peek at future dice or consume randomness',()=>{
  const s=moveState({die:6,sixStreak:1});s.tokens=[[38,8,-1,51],[14,30,2,-1]];
  const before=JSON.stringify(s),action=E.bot(s,0,'expert');
  for(const seed of [1,12,345,987654321]){
    const other=clone(s);other.rng=seed;
    assert.deepEqual(E.bot(other,0,'expert'),action);
  }
  assert.equal(JSON.stringify(s),before);
  const rolling=game();
  assert.deepEqual(E.bot(rolling,0,'expert'),{type:'roll'});
});
