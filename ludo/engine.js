/* Original Game Hub Ludo engine. House rules are documented in README.md. */
(function (root) {
  'use strict';
  const TRACK = [[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14]];
  const SAFE = [0,8,13,21,26,34,39,47];
  const FINISH = 56;
  const COLOURS = ['#db564c','#28865c','#3f70c5','#c88b18'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function nextRandom(s) {
    s.rng = (s.rng + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s.rng ^ s.rng >>> 15, 1 | s.rng);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function create(config) {
    config = config || {};
    if (!Array.isArray(config.players) || config.players.length < 2 || config.players.length > 4) throw new Error('Ludo needs 2 to 4 players.');
    const players = config.players.map((p,i) => ({name: String(p.name || 'Player '+(i+1)).slice(0,40), color: COLOURS[config.players.length === 2 ? i*2 : i], bot: !!p.bot}));
    return {v:1,game:'ludo',rng:(Number(config.seed) || 1)>>>0,players,options:{},slots:players.length===2?[0,2]:players.map((_,i)=>i),tokens:players.map(()=>[-1,-1,-1,-1]),current:0,phase:'roll',die:null,lastDie:null,lastRoller:null,sixStreak:0,turnNo:1,rolls:0,over:false,winner:null,winners:[],scores:players.map(()=>0),notice:'Roll a six to bring a token onto the board.'};
  }
  function actor(s) { return s && !s.over ? s.current : -1; }
  function trackIndex(s,p,t) {
    const progress=s.tokens[p] && s.tokens[p][t];
    return Number.isInteger(progress) && progress>=0 && progress<=50 ? (s.slots[p]*13+progress)%52 : null;
  }
  function canMove(progress,die) { return progress===-1 ? die===6 : progress>=0 && progress<FINISH && progress+die<=FINISH; }
  function legal(s,p) {
    if (!s || s.over || p!==s.current) return [];
    if (s.phase==='roll') return [{type:'roll'}];
    if (s.phase!=='move' || !Number.isInteger(s.die) || s.die<1 || s.die>6) return [];
    return s.tokens[p].flatMap((progress,t)=>canMove(progress,s.die)?[{type:'move',token:t}]:[]);
  }
  function advance(s) { s.current=(s.current+1)%s.players.length;s.phase='roll';s.die=null;s.sixStreak=0;s.turnNo++; }
  function sameKeys(a,keys) { return a && typeof a==='object' && !Array.isArray(a) && Object.keys(a).length===keys.length && Object.keys(a).every(k=>keys.includes(k)); }
  function apply(state,p,action) {
    const reject=message=>({ok:false,state,error:message});
    if (!state || state.over || p!==state.current || !Number.isInteger(p)) return reject('It is not your turn.');
    if (!(sameKeys(action,['type']) && action.type==='roll') && !(sameKeys(action,['type','token']) && action.type==='move' && Number.isInteger(action.token))) return reject('Choose a roll or one of your legal tokens.');
    if (!legal(state,p).some(a=>a.type===action.type && a.token===action.token)) return reject('That token cannot make this move.');
    const s=clone(state);
    if (action.type==='roll') {
      s.die=1+Math.floor(nextRandom(s)*6);s.lastDie=s.die;s.lastRoller=p;s.rolls++;
      if(s.die===6)s.sixStreak++;else s.sixStreak=0;
      if(s.sixStreak===3){s.notice=s.players[p].name+' rolled a third six: that roll is forfeited.';advance(s);return {ok:true,state:s};}
      s.phase='move';
      if(!legal(s,p).length){s.notice=s.players[p].name+' rolled '+s.die+' with no legal move.';if(s.die===6){s.phase='roll';s.die=null;}else advance(s);}
      else s.notice=s.players[p].name+' rolled '+s.die+'. Choose a token.';
      return {ok:true,state:s};
    }
    const before=s.tokens[p][action.token];
    const progress=before===-1?0:before+s.die;
    s.tokens[p][action.token]=progress;
    const square=trackIndex(s,p,action.token),captured=[];
    if(square!==null && !SAFE.includes(square))s.tokens.forEach((tokens,other)=>{if(other===p)return;tokens.forEach((_,t)=>{if(trackIndex(s,other,t)===square){tokens[t]=-1;captured.push(s.players[other].name);}});});
    s.scores=s.tokens.map(tokens=>tokens.filter(n=>n===FINISH).length);
    s.notice=s.players[p].name+' moved token '+(action.token+1)+(progress===FINISH?' home':before===-1?' out of the yard':' '+s.die+' spaces')+(captured.length?' and captured '+captured.length+' token'+(captured.length===1?'':'s'):'')+'.';
    if(s.scores[p]===4){s.over=true;s.winner=p;s.winners=[p];s.phase='over';s.die=null;return {ok:true,state:s};}
    if(s.die===6){s.phase='roll';s.die=null;s.notice+=' Roll again for the six.';}else advance(s);
    return {ok:true,state:s};
  }
  function moveValue(s,p,action,level) {
    if(action.type!=='move')return 0;
    const before=s.tokens[p][action.token],after=before===-1?0:before+s.die;
    if(level==='easy')return -action.token;
    let value=after===FINISH?1000:after+1;
    if(before===-1)value+=level==='hard'?17:10;
    const square=after<=50?(s.slots[p]*13+after)%52:null;
    if(square!==null){
      let captured=0;
      s.tokens.forEach((tokens,o)=>{if(o!==p)tokens.forEach((_,t)=>{if(trackIndex(s,o,t)===square)captured++;});});
      if(!SAFE.includes(square))value+=captured*(level==='hard'?180:90);
      if(level==='hard'){
        if(SAFE.includes(square))value+=22;
        else s.tokens.forEach((tokens,o)=>{if(o===p)return;tokens.forEach((_,t)=>{const from=trackIndex(s,o,t);if(from===null)return;const distance=(square-from+52)%52;if(distance>=1&&distance<=6&&s.tokens[o][t]+distance<=50)value-=12;});});
      }
    }else if(after<FINISH)value+=30;
    return value;
  }
  // Estimate danger from visible pieces and all six equally likely next dice.
  // Never read the RNG state or simulate a future roll to choose a token.
  function exposedValue(s,p) {
    return s.tokens[p].reduce((total,progress,t)=>{
      const square=trackIndex(s,p,t);
      if(square===null||SAFE.includes(square))return total;
      let survives=1;
      s.tokens.forEach((tokens,o)=>{
        if(o===p)return;
        const rolls=new Set();
        tokens.forEach((other,j)=>{
          const from=trackIndex(s,o,j);if(from===null)return;
          const distance=(square-from+52)%52;
          if(distance>=1&&distance<=6&&other+distance<=50)rolls.add(distance);
        });
        survives*=1-rolls.size/6;
      });
      return total+(1-survives)*(18+progress*1.6);
    },0);
  }
  function expertValue(s,p,action) {
    if(action.type!=='move')return 0;
    const before=s.tokens[p][action.token],after=before===-1?0:before+s.die;
    const next=apply(s,p,action).state;
    if(next.over)return 100000;
    let value=after===FINISH?1000:before===-1?24:s.die*2;
    if(before<=50&&after>50)value+=35;
    // Removing an advanced opponent is worth more than sending a fresh piece back.
    s.tokens.forEach((tokens,o)=>{
      if(o===p)return;
      const urgency=1+tokens.filter(t=>t===FINISH).length*.2;
      tokens.forEach((progress,t)=>{if(progress>=0&&next.tokens[o][t]===-1)value+=(18+progress*.9)*urgency;});
    });
    const riskWeight=s.die===6?.65:1;
    value+=1.7*(exposedValue(s,p)-riskWeight*exposedValue(next,p));
    const square=trackIndex(next,p,action.token);
    if(square!==null&&SAFE.includes(square))value+=5;
    return value+after*.08;
  }
  function bot(s,p,level) {
    const actions=legal(s,p);if(!actions.length)return null;
    level=['easy','normal','hard','expert'].includes(level)?level:'normal';
    if(level==='expert')return actions.reduce((best,a)=>expertValue(s,p,a)>expertValue(s,p,best)?a:best,actions[0]);
    return actions.reduce((best,a)=>moveValue(s,p,a,level)>moveValue(s,p,best,level)?a:best,actions[0]);
  }
  function result(s) { return s.over?s.players[s.winner].name+' brought all four tokens home.':s.notice; }
  const engine={create,actor,legal,apply,bot,result,trackIndex,TRACK,SAFE,FINISH,COLOURS};
  if(typeof module!=='undefined'&&module.exports)module.exports=engine;
  if(root){root.HubEngines=root.HubEngines||{};root.HubEngines.ludo=engine;}
})(typeof window!=='undefined'?window:null);
