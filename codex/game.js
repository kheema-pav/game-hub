// ---------- State ----------
const KEY='naturalists-codex-v1';
let S=null;
const ui={view:0,sel:null,faces:{},zoom:window.innerWidth<700?7:9,setup:{face:null,obj:null},modal:null,ng:null,origin:null,aiToken:0,fresh:null,gateOpen:-1,dismissOver:false,undo:null,aim:null,hover:null,hlObj:null,flight:null,refill:null,ptr:matchMedia('(hover: hover)').matches?'mouse':'touch'};
const $=s=>document.querySelector(s);
// sounds go through HubKit.sfx (looked up at call time); bots play quieter
const sfx=(name,quiet)=>{try{HubKit.sfx(name,quiet?{volume:.6}:undefined);}catch(e){}};
// bot speed: multiplies the delays in aiStep
const PACES=['slow','normal','fast'], PACE_MULT={slow:1.6,normal:1,fast:.5};
let pace='normal';
try{const v=localStorage.getItem('codex.pace');if(PACE_MULT[v]) pace=v;}catch(e){}
const cyclePace=()=>{pace=PACES[(PACES.indexOf(pace)+1)%PACES.length];try{localStorage.setItem('codex.pace',pace);}catch(e){}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ic=(s,cls='')=>`<svg class="ic ic-${s} ${cls}" aria-hidden="true"><use href="#i-${s}"/></svg>`;
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const cur=()=>S.players[S.turn];
const humans=()=>S.players.map((p,i)=>p.ai?-1:i).filter(i=>i>=0);
const canAct=()=>S&&(S.phase==='place'||S.phase==='draw')&&(S.online?(S.me>=0&&S.turn===S.me):!cur().ai);
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
function slog(s,msg){s.log.unshift(msg);s.log.length=Math.min(s.log.length,80);}
function log(msg){slog(S,msg);}
function handOwner(){
  if(S&&S.online) return S.me>=0&&S.players[S.me].ready?S.me:null; // online: only ever your own hand
  if(!S||S.phase==='setup') return null;
  const h=humans();
  if(S.phase==='over') return h.length===1?h[0]:null;
  if(!cur().ai) return S.phase==='handoff'?null:S.turn;
  return h.length===1?h[0]:null;
}

function newGame(cfg){
  ui.aiToken++;ui.prevPlayer=null;
  const res=shuffle(RES_IDS), gold=shuffle(GOLD_IDS), st=shuffle(START_IDS), objs=shuffle(OBJECTIVES.map(o=>o.id));
  S={v:1,gid:'L'+Date.now().toString(36)+Math.floor(Math.random()*1e9).toString(36),first:0,phase:'setup',turn:0,round:1,setupIdx:0,endTriggered:false,turnsLeft:0,passStreak:0,lastHuman:-1,log:[],
     resDeck:res,goldDeck:gold,market:{R:[],G:[]},common:[objs.pop(),objs.pop()],results:null,
     players:cfg.map((c,i)=>({name:c.name,ai:c.ai,level:c.level||'normal',board:{},placedN:0,hand:[],score:0,starter:st[i],secretChoices:[objs.pop(),objs.pop()],secret:null,ready:false}))};
  S.market.R=[res.pop(),res.pop()]; S.market.G=[gold.pop(),gold.pop()];
  S.players.forEach(p=>{
    p.hand=[res.pop(),res.pop(),gold.pop()];
    if(p.ai){placeStarter(p,Math.random()<.5?'front':'back');p.secret=p.secretChoices[Math.random()<.5?0:1];p.ready=true;}
  });
  log('A new codex is opened.');
  ui.sel=null;ui.faces={};ui.undo=null;ui.aim=null;ui.hover=null;ui.hlObj=null;ui.origin=null;ui.gateOpen=-1;ui.dismissOver=false;ui.modal=null;
  setupNext();
}
function placeStarter(p,face){p.board={[kxy(0,0)]:{id:p.starter,face,x:0,y:0,order:0}};p.placedN=1;}
function setupNext(){
  const i=S.players.findIndex(p=>!p.ready);
  if(i<0){
    S.phase='place';S.turn=0;S.round=1;
    log(`Round 1. <b>${esc(S.players[0].name)}</b> plays first.`);
    save();startTurn();return;
  }
  S.setupIdx=i;ui.view=i;ui.setup={face:null,obj:null};save();render();
}

function startTurn(){
  const p=cur();
  ui.sel=null;ui.undo=null;ui.aim=null;ui.hover=null;
  if(!p.hand.length||!validSpots(p.board).length){
    passOn(S,p);S.phase='pass';
    render();
    return setTimeout(endTurn,300);
  }
  S.passStreak=0;
  S.phase='place';
  if(!p.ai&&humans().length>1&&S.lastHuman!==S.turn) S.phase='handoff';
  // control passed from a different player to a human (in pass-and-play this is when the pass-the-device screen appears)
  if(!p.ai&&ui.prevPlayer!=null&&ui.prevPlayer!==S.turn) sfx('chime');
  ui.view=S.turn;
  save();render();
  if(p.ai) aiStep();
}
// ---- Shared engine: local play and the online replay both play moves through these ----
const nm=p=>`<b>${esc(p.name)}</b>`;
function placeOn(s,i,id,face,x,y){
  const p=s.players[i], card=CARDS[id];
  p.board[kxy(x,y)]={id,face,x,y,order:p.placedN++};
  const pts=pointsFor(p.board,id,face,x,y);
  p.score+=pts;
  p.hand=p.hand.filter(h=>h!==id);
  slog(s,`${nm(p)} played a ${NAMES[card.k]} ${card.type==='G'?'gold':'resource'} card${face==='back'?' face down':''}${pts?` for ${pts} point${pts>1?'s':''}`:''}.`);
  return pts;
}
function drawOptionsOf(s){
  const o=[];
  if(s.resDeck.length) o.push({src:'RD'});
  if(s.goldDeck.length) o.push({src:'GD'});
  ['R','G'].forEach(t=>s.market[t].forEach((id,i)=>{if(id) o.push({src:t+i,id});}));
  return o;
}
function drawOn(s,i,src){
  let id, from;
  if(src==='RD'){id=s.resDeck.pop();from='the resource deck';}
  else if(src==='GD'){id=s.goldDeck.pop();from='the gold deck';}
  else{
    const t=src[0], k=+src[1], m=s.market[t];
    id=m[k];
    if(!id) return null;
    const own=t==='R'?s.resDeck:s.goldDeck, other=t==='R'?s.goldDeck:s.resDeck;
    m[k]=own.pop()??other.pop()??null;
    from=`the market (${NAMES[CARDS[id].k]} ${t==='R'?'resource':'gold'})`;
  }
  if(!id) return null;
  s.players[i].hand.push(id);
  slog(s,`${nm(s.players[i])} drew from ${from}.`);
  return id;
}
function passOn(s,p){
  slog(s,`${nm(p)} cannot play and passes.`);
  if(++s.passStreak>=s.players.length*2&&!s.endTriggered){s.endTriggered=true;s.turnsLeft=1;}
}
// end the current turn: trigger the final rounds, finish the game, or move to the next seat. True when the game is over.
function advance(s){
  const n=s.players.length, i=s.turn, p=s.players[i], first=s.first||0;
  if(!s.endTriggered){
    if(p.score>=20||(!s.resDeck.length&&!s.goldDeck.length)){
      s.endTriggered=true;s.turnsLeft=(n-1-(i-first+n)%n)+n;
      slog(s,p.score>=20?`${nm(p)} reached 20 points. Finish this round, then play one more.`:'Both decks are empty. Finish this round, then play one more.');
    }
  } else s.turnsLeft--;
  if(s.endTriggered&&s.turnsLeft<=0){finishResults(s);return true;}
  s.turn=(i+1)%n;
  if(s.turn===first){s.round++;slog(s,`Round ${s.round}.`);}
  return false;
}
function finishResults(s){
  s.phase='over';
  s.results=s.players.map((p,i)=>{
    const n=counts(p.board);
    const objs=[...s.common,p.secret].map(oid=>{const o=OBJ_BY_ID[oid],t=objTimes(o,p.board,n);return {oid,times:t,pts:t*o.pts};});
    const objPts=objs.reduce((a,b)=>a+b.pts,0);
    return {i,board:p.score,objs,objPts,total:p.score+objPts,done:objs.reduce((a,b)=>a+b.times,0)};
  }).sort((a,b)=>b.total-a.total||b.done-a.done);
  const top=s.results[0];
  const winners=s.results.filter(r=>r.total===top.total&&r.done===top.done).map(r=>s.players[r.i].name);
  slog(s,`Game over. ${winners.map(esc).join(' and ')} ${winners.length>1?'share the win':'wins'} with ${top.total} points.`);
}

function doPlace(id,face,x,y){
  const p=cur(), card=CARDS[id];
  const pts=placeOn(S,S.turn,id,face,x,y);
  delete ui.faces[id];
  ui.fresh={view:S.turn,key:kxy(x,y),pts};
  ui.sel=null;
  sfx('place',p.ai);
  if(pts>0) setTimeout(()=>sfx('score',p.ai),120);
  S.phase='draw';
  if(!drawOptions().length){save();render();return setTimeout(endTurn,p.ai?500:200);}
  save();render();
  if(p.ai) aiStep();
  else if(window.innerWidth<=860) $('#marketSec').scrollIntoView({behavior:'smooth',block:'nearest'});
}
const drawOptions=()=>drawOptionsOf(S);
function placeHuman(x,y){
  if(S.online) return placeOnline(x,y);
  const face=ui.faces[ui.sel]||'front';
  ui.undo={state:JSON.stringify(S),id:ui.sel,face};
  ui.aim=null;ui.hover=null;
  doPlace(ui.sel,face,x,y);
}
// Take back a human placement, allowed only before drawing
function undoPlace(){
  if(S&&S.online) return undoOnline();
  const u=ui.undo;
  if(!u||!canAct()||S.phase!=='draw') return;
  S=JSON.parse(u.state);
  ui.undo=null;ui.sel=u.id;ui.faces[u.id]=u.face;ui.view=S.turn;
  sfx('swish');
  save();render();
}
function doDraw(src){
  const p=cur();
  ui.undo=null;
  const srcEl=document.querySelector(`[data-src="${src}"]`), fromRect=srcEl&&srcEl.getBoundingClientRect();
  const id=drawOn(S,S.turn,src);
  if(!id) return;
  sfx('draw',p.ai);
  ui.flight={id,face:src[1]==='D'?'back':'front',from:fromRect,drawer:S.turn};
  if(src[1]!=='D') ui.refill=src;
  endTurn();
}
function endTurn(){
  ui.prevPlayer=S.turn;
  if(advance(S)) return finishGame();
  startTurn();
}
function finishGame(){
  ui.aiToken++;
  finishResults(S);
  const top=S.results[0];
  ui.dismissOver=false;
  const humanWon=S.results.some(r=>r.total===top.total&&r.done===top.done&&!S.players[r.i].ai);
  setTimeout(()=>sfx(humanWon?'win':'end'),300);
  // stats: a game against bots (one human) counts toward the profile on this device
  if(S.gid&&humans().length===1){const h=humans()[0],r=S.results.find(x=>x.i===h);try{if(r&&HubKit.recordResult) HubKit.recordResult('codex',S.gid,{won:r.total===top.total&&r.done===top.done,score:r.total});}catch(e){}}
  save();render();
}

// ---------- Bots ----------
// weights found by simulating bot-vs-bot games: hard leans less on hoarding for gold cards
const LEVELS={
  easy:{obj:.4,partial:.5,secret:1,noise:2.5,gb:1.4,gp:.3,gm:.35,mkt:0},
  normal:{obj:1,partial:1,secret:1,noise:.15,gb:1.4,gp:.3,gm:.35,mkt:0},
  hard:{obj:1,partial:.5,secret:1,noise:0,gb:.6,gp:.15,gm:.15,mkt:.4},
};
function potential(p,board,playedId,w=LEVELS.normal){
  const n=counts(board); let v=0;
  for(const oid of [...S.common,p.secret]){
    const o=OBJ_BY_ID[oid], k=w.obj*(oid===p.secret?w.secret:1), t=objTimes(o,board,n);
    v+=k*t*o.pts;
    if(o.kind==='set'){
      const entries=Object.entries(o.need);
      v+=k*w.partial*o.pts*.45*entries.reduce((a,[s,need])=>a+Math.min(1,Math.max(0,n[s]-t*need)/need),0)/entries.length;
    } else v+=k*w.partial*.3*o.pts/2*Math.min(patternPartial(o,board),3);
  }
  for(const hid of p.hand){
    if(hid===playedId) continue;
    const hc=CARDS[hid];
    if(hc.type==='G'){const m=missing(hc,n);v+=m===0?w.gb+hc.points*w.gp:-w.gm*m;}
  }
  // gold cards on offer that this codex could already pay for
  if(w.mkt) for(const gid of S.market.G) if(gid&&meetsReq(n,CARDS[gid])) v+=w.mkt*CARDS[gid].points;
  return v+.04*validSpots(board).length;
}
function aiChoose(p){
  const L=p.level||'normal', spots=validSpots(p.board), n=counts(p.board), moves=[];
  for(const id of p.hand) for(const face of ['front','back']){
    if(face==='front'&&!meetsReq(n,CARDS[id])) continue;
    for(const [x,y] of spots) moves.push({id,face,x,y});
  }
  if(!moves.length) return null;
  if(L==='easy'&&Math.random()<.35){const f=moves.filter(m=>m.face==='front'),pool=f.length?f:moves;return pool[Math.floor(Math.random()*pool.length)];}
  const w=LEVELS[L]||LEVELS.normal, base=potential(p,p.board,null,w);
  let best=null;
  for(const m of moves){
    const card=CARDS[m.id], board=Object.assign({},p.board);
    board[kxy(m.x,m.y)]={id:m.id,face:m.face,x:m.x,y:m.y,order:p.placedN};
    let v=pointsFor(board,m.id,m.face,m.x,m.y)+(potential(p,board,m.id,w)-base);
    if(m.face==='back') v-=card.type==='G'?2.5:.6;
    v+=Math.random()*w.noise;
    if(!best||v>best.v) best={...m,v};
  }
  return best;
}
function kingdomInterest(p,k){
  return [...S.common,p.secret].some(oid=>{const o=OBJ_BY_ID[oid];return o.kind==='set'?o.need[k]:o.cells.some(c=>c[2]===k);})
    ||p.hand.some(h=>CARDS[h].type==='G'&&CARDS[h].req[k]);
}
function aiDraw(p){
  const L=p.level||'normal', opts=drawOptions();
  if(!opts.length) return null;
  if(L==='easy'&&Math.random()<.5) return opts[Math.floor(Math.random()*opts.length)].src;
  const n=counts(p.board), golds=p.hand.filter(id=>CARDS[id].type==='G').length;
  let best=null;
  for(const o of opts){
    let v;
    if(o.id){
      const c=CARDS[o.id];
      if(c.type==='G'){const exp=c.cond==='C'?3.5:c.cond?1+n[c.cond]:c.points;v=exp-1.3*missing(c,n)-golds*1.2;}
      else v=.8+c.points*1.2+(kingdomInterest(p,c.k)?.5:0);
    } else v=o.src==='RD'?1:1.6-golds*1.2;
    v+=Math.random()*(L==='hard'?0:.3);
    if(!best||v>best.v) best={...o,v};
  }
  return best.src;
}
function aiStep(){
  const token=ui.aiToken, p=cur();
  const live=()=>token===ui.aiToken&&S&&cur()===p&&p.ai, pm=PACE_MULT[pace]||1;
  setTimeout(()=>{
    if(!live()) return;
    if(S.phase==='place'){
      const m=aiChoose(p);
      if(!m){log(`<b>${esc(p.name)}</b> cannot play and passes.`);return endTurn();}
      // show the chosen card hovering over its spot, then drop it in
      ui.preview={view:S.turn,key:kxy(m.x,m.y),id:m.id,face:m.face};
      renderBoard();
      setTimeout(()=>{
        ui.preview=null;
        if(live()) doPlace(m.id,m.face,m.x,m.y);
      },Math.round(1000*pm));
    } else if(S.phase==='draw'){
      const src=aiDraw(p);
      if(src) doDraw(src); else endTurn();
    }
  },Math.round((S.phase==='place'?1100:1500)*pm));
}

// ---------- Rendering ----------
const SX=9.2, SY=5, PAD=2;
function cardTitle(c,face){
  if(c.type==='S') return `Starter card, ${face==='front'?'centre side':'corner side'}`;
  const t=`${NAMES[c.k]} ${c.type==='G'?'gold':'resource'} card`;
  if(face==='back') return `${t}, back: 1 permanent ${NAMES[c.k]}`;
  let s=t;
  if(c.points) s+=`, ${c.points} point${c.points>1?'s':''}${c.cond==='C'?' per covered corner':c.cond?' per visible '+NAMES[c.cond]:''}`;
  if(c.type==='G') s+=`. Needs ${reqText(c)} visible`;
  return s;
}
const reqText=c=>Object.entries(c.req).map(([s,v])=>`${v} ${v>1?PLURAL[s]:NAMES[s]}`).join(' + ');
function cardHTML(id,face,cls='',style=''){
  const c=CARDS[id];
  let h=`<span class="card ${c.type==='S'?'starter':'k-'+c.k} ${c.type==='G'?'gold':''} ${cls}" style="${style}" title="${esc(cardTitle(c,face))}"><span class="deco"></span>`;
  sideCorners(c,face).forEach((s,i)=>{if(s!==null) h+=`<span class="corner c${i}">${s==='E'?'':ic(s)}</span>`;});
  if(c.type==='S'){const cen=sideCenter(c,face);if(cen.length) h+=`<span class="center-box">${cen.map(s=>ic(s)).join('')}</span>`;}
  else if(face==='back') h+=`<span class="center-res">${ic(c.k)}</span>`;
  else{
    h+=`<span class="kmark">${ic(c.k)}</span>`;
    if(c.points) h+=`<span class="pts"><b>${c.points}</b>${c.cond?'<i>×</i>'+ic(c.cond):''}</span>`;
    if(c.type==='G') h+=`<span class="req">${Object.entries(c.req).flatMap(([s,v])=>Array(v).fill(ic(s))).join('')}</span>`;
  }
  return h+'</span>';
}
function objHTML(oid,prog=null){
  const o=OBJ_BY_ID[oid]; let g;
  if(o.kind==='pattern'){
    const xs=o.cells.map(c=>c[0]), ys=o.cells.map(c=>c[1]), mx=Math.min(...xs), my=Math.min(...ys);
    const w=(Math.max(...xs)-mx)*1.25+1.6, h=(Math.max(...ys)-my)*.75+1.1;
    g=`<span class="pat" style="width:${w}em;height:${h}em">${o.cells.map(([x,y,k])=>`<span class="pc k-${k}" style="left:${(x-mx)*1.25}em;top:${(y-my)*.75}em"></span>`).join('')}</span>`;
  } else g=`<span class="setic">${Object.entries(o.need).flatMap(([s,v])=>Array(v).fill(ic(s))).join('')}</span>`;
  return `<span class="ocard"><span class="opts" title="${o.pts} points each time">${o.pts}</span>${g}<span class="olabel">${esc(o.label)}${prog?`<span class="oprog">${prog.txt}</span>`:''}</span>${prog?`<span class="oearn" title="Points so far">${prog.earned}</span>`:''}</span>`;
}

function render(){
  if(!S){if(ON.active) renderShell();return;}
  if(ui.view>=S.players.length) ui.view=0;
  renderTop();renderBoard();renderHand();renderSide();renderModal();
  if(ui.flight){const f=ui.flight;ui.flight=null;launchFlight(f);}
}
function renderTop(){
  const live=S.phase!=='setup'&&S.phase!=='over';
  $('#players').dataset.n=S.players.length;
  $('#players').innerHTML=S.players.map((p,i)=>`<button class="pchip ${live&&i===S.turn?'turn':''} ${i===ui.view?'viewing':''}" data-act="view" data-i="${i}" style="--pc:${pcol(i)}" title="View ${esc(p.name)}'s codex">
    <span class="dot"></span><span class="pname">${esc(p.name)}${p.ai?`<small>${p.level==='hard'?'hard bot':p.level==='easy'?'easy bot':'bot'}</small>`:''}${S.online&&i===S.me?'<small>you</small>':''}</span><span class="pscore">${p.score}</span>
    <span class="bar"><span style="width:${Math.min(100,p.score*5)}%"></span></span></button>`).join('');
  $('#roundInfo').textContent=S.phase==='setup'?'Setting up':S.phase==='over'?`Finished after round ${S.round}`:`Round ${S.round} · first to 20 triggers the end`;
}
function renderBoard(){
  const el=$('#board'), sc=$('#boardScroll'), p=S.players[ui.view], b=p.board;
  const owner=handOwner();
  $('#boardTitle').textContent=ui.view===owner||p.name==='You'?'Your codex':`${p.name}'s codex`;
  const n=counts(b);
  $('#resStrip').innerHTML=SYMS.map(s=>`<span class="rc ${n[s]?'':'zero'}" title="${n[s]} visible ${n[s]===1?NAMES[s]:PLURAL[s]}">${ic(s)}${n[s]}</span>`).join('');
  const cards=Object.values(b).sort((a,c)=>a.order-c.order);
  let spots=[], selFace='front';
  if(canAct()&&S.phase==='place'&&ui.view===S.turn&&ui.sel){
    selFace=ui.faces[ui.sel]||'front';
    const card=CARDS[ui.sel];
    if(!(selFace==='front'&&!meetsReq(n,card))) spots=validSpots(b);
  }
  const xs=[0],ys=[0];
  cards.forEach(c=>{xs.push(c.x-1,c.x+1);ys.push(c.y-1,c.y+1);});
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  el.style.fontSize=ui.zoom+'px';
  el.style.width=((maxX-minX)*SX+12+PAD*2)+'em';
  el.style.height=((maxY-minY)*SY+8+PAD*2)+'em';
  const pos=(x,y)=>`left:${(x-minX)*SX+PAD}em;top:${(y-minY)*SY+PAD}em`;
  const fresh=ui.fresh&&ui.fresh.view===ui.view?ui.fresh:null;
  const hl=ui.hlObj?objCards(OBJ_BY_ID[ui.hlObj],b):null;
  el.classList.toggle('focus',!!hl);
  let h='';
  cards.forEach((c,i)=>{
    const key=kxy(c.x,c.y);
    const cls=(i===cards.length-1&&cards.length>1?'last ':'')+(fresh&&fresh.key===key?'fresh ':'')+(hl&&hl.has(key)?'scored':'');
    h+=cardHTML(c.id,c.face,cls,`${pos(c.x,c.y)};z-index:${c.order+1}`);
  });
  spots.forEach(([x,y])=>{
    const key=kxy(x,y), b2=Object.assign({},b);
    b2[key]={id:ui.sel,face:selFace,x,y,order:p.placedN};
    const sp=pointsFor(b2,ui.sel,selFace,x,y);
    h+=`<button class="spot ${ui.aim===key?'aimed':''}" data-act="spot" data-x="${x}" data-y="${y}" style="${pos(x,y)}" aria-label="Place card here${sp?`, scores ${sp}`:''}">${cardHTML(ui.sel,selFace,'ghost')}${sp?`<span class="spts">+${sp}</span>`:''}</button>`;
  });
  const pv=ui.preview&&ui.preview.view===ui.view?ui.preview:null;
  if(pv){const [px,py]=pv.key.split(',').map(Number);h+=`<span class="aim" style="${pos(px,py)}"></span>`+cardHTML(pv.id,pv.face,'incoming',`${pos(px,py)};z-index:960`);}
  if(fresh&&fresh.pts){const [fx,fy]=fresh.key.split(',').map(Number);h+=`<span class="gain" style="left:${(fx-minX)*SX+PAD+4.5}em;top:${(fy-minY)*SY+PAD+1}em"><b>+${fresh.pts}</b></span>`;}
  if(!cards.length) h=`<span class="board-empty">The codex is still blank</span>`;
  el.innerHTML=h;
  ui.fresh=null;
  const o=ui.origin, fs=ui.zoom;
  if(o&&o.view===ui.view&&o.zoom===fs){sc.scrollLeft+=(o.minX-minX)*SX*fs;sc.scrollTop+=(o.minY-minY)*SY*fs;}
  else{sc.scrollLeft=((0-minX)*SX+PAD+6)*fs-sc.clientWidth/2;sc.scrollTop=((0-minY)*SY+PAD+4)*fs-sc.clientHeight/2;}
  ui.origin={view:ui.view,minX,minY,zoom:fs};
}
function previewInfo(p,id,face,x,y){
  const board=Object.assign({},p.board);
  board[kxy(x,y)]={id,face,x,y,order:p.placedN};
  const n0=counts(p.board), n1=counts(board);
  return {
    pts:pointsFor(board,id,face,x,y),
    deltas:SYMS.map(s=>[s,n1[s]-n0[s]]).filter(d=>d[1]),
    objs:[...S.common,p.secret].map(oid=>{const o=OBJ_BY_ID[oid];return {o,d:(objTimes(o,board,n1)-objTimes(o,p.board,n0))*o.pts};}).filter(x=>x.d),
    golds:p.hand.filter(h=>h!==id&&CARDS[h].type==='G').map(h=>({c:CARDS[h],before:meetsReq(n0,CARDS[h]),after:meetsReq(n1,CARDS[h])})).filter(g=>g.before!==g.after),
  };
}
function previewHTML(f){
  const parts=[`<strong>${f.pts?`+${f.pts} point${f.pts>1?'s':''} here`:'No points here'}</strong>`];
  if(f.deltas.length) parts.push(f.deltas.map(([s,d])=>`<span class="${d>0?'up':'down'}">${d>0?'+':'−'}${Math.abs(d)} ${ic(s,'inl')}</span>`).join(' '));
  f.objs.forEach(x=>parts.push(`<span class="${x.d>0?'up':'down'}">Objective ${x.d>0?'+':'−'}${Math.abs(x.d)}: ${esc(x.o.label)}</span>`));
  f.golds.forEach(g=>parts.push(`<span class="${g.after?'up':'down'}">${g.after?'Unlocks':'Locks'} your ${NAMES[g.c.k]} gold card</span>`));
  return parts.join(' <span class="sep">·</span> ');
}
function renderPrompt(){
  const p=cur(), touch=ui.ptr!=='mouse', on=S.online, me=S.me;
  let msg='';
  if(S.phase==='setup'){
    if(!on) msg='<strong>Preparing the codices</strong>';
    else if(me>=0&&!S.players[me].ready) msg='<strong>Choose your starter side and secret objective.</strong>';
    else msg=`<strong>Waiting for ${S.players.filter(q=>!q.ready).map(q=>esc(q.name)).join(', ')} to set up.</strong>`;
  }
  else if(S.phase==='over'){const w=S.results[0];msg=`<strong>Game over.</strong> ${esc(S.players[w.i].name)} ${on&&w.i===me?'lead':'leads'} with ${w.total} points. <button class="btn" data-act="results">See scores</button> <span class="hint">Tap an objective to light up the cards that scored it.</span>`;}
  else if(on&&S.turn!==me) msg=`<strong>Waiting for ${esc(p.name)}.</strong> You can close this page. The game waits until you come back.`;
  else if(S.phase==='handoff') msg=`<strong>Pass the device to ${esc(p.name)}</strong>`;
  else if(p.ai) msg=`<strong>${esc(p.name)} is ${S.phase==='place'?'choosing a card':'drawing'}…</strong>`;
  else if(S.phase==='place'){
    const sel=ui.sel&&CARDS[ui.sel], face=ui.sel&&(ui.faces[ui.sel]||'front');
    if(sel&&face==='front'&&!meetsReq(counts(p.board),sel)) msg=`<strong>This gold card needs ${reqText(sel)} visible.</strong> Flip it to play the back, or choose another card.`;
    else if(sel){
      const k=ui.aim||ui.hover, ok=k&&validSpots(p.board).some(([x,y])=>kxy(x,y)===k);
      if(ok){const [x,y]=k.split(',').map(Number);msg=previewHTML(previewInfo(p,ui.sel,face,x,y))+(ui.aim===k?' <button class="btn primary" data-act="place-aim">Place here</button>':'');}
      else msg=`<strong>Pick a highlighted spot</strong> in your codex. ${touch?'Tap a spot to preview it, then tap again to place.':'Hover a spot to preview what it does.'}`;
    }
    else msg='<strong>Your turn.</strong> Choose a card from your hand.';
  }
  else if(S.phase==='draw') msg=(on?'<strong>Draw a card</strong> to finish your turn. Your move is sent when you draw.':'<strong>Draw a card</strong> from the market: a face-up card or the top of a deck.')+(ui.undo?' <button class="btn" data-act="undo">↶ Undo placement</button>':'');
  if(on&&(ON.sending>0||ON.pending)) msg+=' <span class="hint">Sending…</span>';
  if(on&&ON.saveErr==='denied') msg+=' <span class="down">That move couldn\'t be saved. Try again.</span>';
  if(on&&ON.err) msg+=' <span class="down">Lost the connection to the game. Reload the page to reconnect.</span>';
  if(S.endTriggered&&S.phase!=='over') msg+=` <span class="final">Final rounds · ${S.turnsLeft} turn${S.turnsLeft===1?'':'s'} left after this</span>`;
  $('#prompt').innerHTML=msg;
}
function renderHand(){
  renderPrompt();
  const owner=handOwner(), hd=$('#hand');
  if(owner==null){hd.innerHTML=`<span class="hand-note">${S.phase==='handoff'?'Hands stay hidden until the next player is ready.':'No hand to show.'}</span>`;return;}
  const hp=S.players[owner], n=counts(hp.board);
  const active=owner===S.turn&&S.phase==='place';
  hd.innerHTML=hp.hand.map(id=>{
    const face=ui.faces[id]||'front', card=CARDS[id];
    const unmet=card.type==='G'&&face==='front'&&!meetsReq(n,card);
    return `<div class="hslot ${ui.sel===id?'sel':''} ${unmet?'unmet':''}">
      <button class="hcard" data-act="sel" data-id="${id}" ${active?'':'disabled'} aria-pressed="${ui.sel===id}" aria-label="${esc(cardTitle(card,face))}">${cardHTML(id,face,'inhand')}</button>
      <div class="hrow"><button class="btn flip" data-act="flip" data-id="${id}">Flip ↻</button></div>
      ${unmet?`<span class="warn">Needs ${reqText(card)}</span>`:''}</div>`;
  }).join('')||'<span class="hand-note">Your hand is empty.</span>';
}
function renderSide(){
  const live=canAct()&&S.phase==='draw';
  const row=(t,label)=>{
    const d=t==='R'?S.resDeck:S.goldDeck;
    const deck=d.length?`<button class="mk live" data-act="draw" data-src="${t}D" ${live?'':'disabled'} aria-label="Draw the top of the ${label} deck">${cardHTML(d[d.length-1],'back','inhand')}<span class="cnt">${d.length}</span></button>`:`<span class="mslot-empty">Deck empty</span>`;
    return `<h3>${label}: deck and face-up cards</h3><div class="mrow">${deck}${S.market[t].map((id,i)=>id?`<button class="mk live ${ui.refill===t+i?'refill':''}" data-act="draw" data-src="${t}${i}" ${live?'':'disabled'} aria-label="Take ${esc(cardTitle(CARDS[id],'front'))}">${cardHTML(id,'front','inhand')}</button>`:`<span class="mslot-empty">Empty</span>`).join('')}</div>`;
  };
  $('#market').innerHTML=row('R','Resource')+row('G','Gold');
  ui.refill=null;
  $('#deckInfo').textContent=`${S.resDeck.length+S.goldDeck.length} cards left`;
  const owner=handOwner(), vp=S.players[ui.view];
  const objBtn=(oid,pl)=>`<button class="obtn ${ui.hlObj===oid?'on':''}" data-act="hlobj" data-o="${oid}" data-p="${pl}" aria-pressed="${ui.hlObj===oid}">${objHTML(oid,objProgress(OBJ_BY_ID[oid],S.players[pl].board))}</button>`;
  const secP=S.phase==='over'?ui.view:owner;
  const sec=secP!=null&&S.players[secP].secret?objBtn(S.players[secP].secret,secP):`<span class="secret-hidden">${S.phase==='setup'?'Chosen during setup.':'Hidden from view.'}</span>`;
  const who=ui.view===owner?'you':esc(vp.name);
  $('#objectives').innerHTML=`<p class="ohint">Progress for ${who}. Tap an objective to light up the cards that count for it.</p><h3>Common</h3><div class="olist">${S.common.map(o=>objBtn(o,ui.view)).join('')}</div><h3>${secP!=null&&secP!==owner?esc(S.players[secP].name)+"'s secret":'Your secret'}</h3><div class="olist">${sec}</div>`;
  $('#log').innerHTML=S.log.slice(0,40).map(l=>`<li>${l}</li>`).join('');
}

// ---------- Modals ----------
function renderModal(){
  const m=$('#modal'), body=$('#modalBody');
  let h='';
  if(ui.modal==='rules') h=rulesHTML();
  else if(ui.modal==='new') h=newGameHTML();
  else if(!S) h=ON.active?onlineHTML():'';
  else if(S.phase==='setup') h=S.online&&S.players[S.me]&&S.players[S.me].ready?'':setupHTML();
  else if(S.phase==='handoff') h=`<h2>${esc(cur().name)}, your turn</h2><p class="lede">Pass the device to ${esc(cur().name)}. Other players look away while the hand is shown.</p><div class="mfoot"><button class="btn primary" data-act="handoff-ok">Show my hand</button></div>`;
  else if(S.phase==='over'&&!ui.dismissOver) h=resultsHTML();
  m.hidden=!h;
  try{HubKit.setFloating(!m.hidden);}catch(e){}
  if(h&&body.dataset.sig!==h){body.innerHTML=h;body.dataset.sig=h;}
}
function setupHTML(){
  const on=S.online, p=S.players[on?S.me:S.setupIdx];
  if(!on&&humans().length>1&&ui.gateOpen!==S.setupIdx)
    return `<h2>${esc(p.name)}, prepare your codex</h2><p class="lede">Pass the device to ${esc(p.name)}. Other players look away: the next screen shows a secret objective.</p><div class="mfoot"><button class="btn" data-act="new">Change players</button><button class="btn primary" data-act="gate-ok">I'm ${esc(p.name)}</button></div>`;
  const s=ui.setup;
  return `<h2>${esc(p.name)}, prepare your codex</h2>
  <p class="lede">Choose which side of your starter card goes face up, then keep one of two secret objectives. Your opening hand is shown so you can plan.${on?' Everyone sets up on their own device.':''}</p>
  <h3>Starter card</h3><div class="choices">${['front','back'].map(f=>`<button class="choice ${s.face===f?'on':''}" data-act="su-face" data-face="${f}" aria-pressed="${s.face===f}"><span class="cw">${cardHTML(p.starter,f,'inhand')}</span><span class="cap">${f==='front'?'Centre resources':'Four corner resources'}</span></button>`).join('')}</div>
  <h3>Secret objective (keep one)</h3><div class="choices">${p.secretChoices.map(o=>`<button class="choice ${s.obj===o?'on':''}" data-act="su-obj" data-o="${o}" aria-pressed="${s.obj===o}">${objHTML(o)}</button>`).join('')}</div>
  <h3>Common objectives</h3><div class="olist">${S.common.map(o=>objHTML(o)).join('')}</div>
  <h3>Your opening hand</h3><div class="mini-hand">${p.hand.map(id=>cardHTML(id,'front','inhand')).join('')}</div>
  <div class="mfoot"><button class="btn" data-act="rules">Rules</button>${on?'':'<button class="btn" data-act="new">Change players</button>'}<button class="btn primary" data-act="su-ok" ${s.face&&s.obj?'':'disabled'}>Begin</button></div>`;
}
function newGameHTML(){
  const ng=ui.ng, tab=ng.tab==='online'?'online':'local', canCancel=!!(S||ON.active);
  const tabs=`<div class="tabs" role="tablist"><button class="tab ${tab==='local'?'on':''}" role="tab" aria-selected="${tab==='local'}" data-act="ng-tab" data-tab="local">On this device</button><button class="tab ${tab==='online'?'on':''}" role="tab" aria-selected="${tab==='online'}" data-act="ng-tab" data-tab="online">Online</button></div>`;
  const cancel=canCancel?'<button class="btn" data-act="close">Cancel</button>':'';
  if(tab==='online') return `<h2>New game</h2>${tabs}${onlineTabHTML(cancel)}`;
  return `<h2>New game</h2>${tabs}<p class="lede">Two to four naturalists. Bots play on their own; humans take turns on this device.</p>
  <h3>Players</h3><div class="seg">${[2,3,4].map(k=>`<button class="segb ${ng.n===k?'on':''}" data-act="ng-n" data-n="${k}">${k} players</button>`).join('')}</div>
  <div class="ngrows">${ng.players.slice(0,ng.n).map((p,i)=>`<div class="ngrow"><span class="dot" style="--pc:var(--p${i})"></span><label class="sr" for="ng-name-${i}">Player ${i+1} name</label><input id="ng-name-${i}" value="${esc(p.name)}" maxlength="16" autocomplete="off">
    <span class="seg"><button class="segb ${!p.ai?'on':''}" data-act="ng-ai" data-i="${i}" data-v="0">Human</button><button class="segb ${p.ai?'on':''}" data-act="ng-ai" data-i="${i}" data-v="1">Bot</button></span>${p.ai?`<span class="seg" aria-label="Bot level">${['easy','normal','hard'].map(l=>`<button class="segb ${(p.level||'normal')===l?'on':''}" data-act="ng-lvl" data-i="${i}" data-v="${l}">${l[0].toUpperCase()+l.slice(1)}</button>`).join('')}</span>`:''}</div>`).join('')}</div>
  <p class="lede" style="margin-top:14px">Seat 1 plays first. ${ON.active?'Starting a game on this device leaves the online game; you can come back to it from the hub.':'Starting a new game replaces the one in progress.'}</p>
  <div class="mfoot">${cancel}<button class="btn primary" data-act="ng-go">Start game</button></div>`;
}
function onlineTabHTML(cancel){
  const ng=ui.ng;
  if(!hubOK()) return `<h3>Online play is unavailable</h3><p class="lede">Online games need the game server, and it can't be reached from here right now. Playing on this device still works.</p><div class="mfoot">${cancel}<button class="btn primary" data-act="ng-tab" data-tab="local">Play on this device</button></div>`;
  const prof=!!(window.HubKit&&HubKit.profile&&HubKit.setProfile), dis=ng.busy?'disabled':'';
  return `<p class="lede">Play with friends on their own phones. Share a six-digit code to bring them in.</p>
  ${prof?`<h3>Your name</h3><div class="onrow"><label class="sr" for="ng-myname">Your name</label><input id="ng-myname" value="${esc(ng.myName)}" maxlength="16" autocomplete="nickname" placeholder="Name"></div>`:''}
  <h3>Create a game</h3><div class="onrow"><span class="seg" role="group" aria-label="Seats">${[2,3,4].map(k=>`<button class="segb ${ng.seats===k?'on':''}" data-act="ng-seats" data-n="${k}">${k} seats</button>`).join('')}</span><button class="btn primary" data-act="on-create" ${dis}>${ng.busy==='create'?'Creating…':'Create game'}</button></div>
  <h3>Join with a code</h3><div class="onrow"><label class="sr" for="ng-code">Game code</label><input id="ng-code" value="${esc(ng.code)}" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="off" placeholder="000 000"><button class="btn primary" data-act="on-join" ${dis}>${ng.busy==='join'?'Joining…':'Join'}</button></div>
  ${ng.err?`<p class="errline" role="alert">${esc(ng.err)}</p>`:''}
  <div class="mfoot">${cancel}</div>`;
}
function rulesHTML(){
  return `<h2>How to play</h2><p class="lede">Grow your codex one card at a time. Score points from cards as you play them, then from objectives when the game ends.</p>
  <div class="rules">
  <section><h4>Your turn</h4><p>1. Play one card from your hand into your codex. It must cover at least one visible corner of a card already there. It can never sit on a missing corner (a spot where a card shows no corner square).</p><p>2. Draw one card: a face-up card from the market or the top card of either deck. The colour of each deck's top card is visible.</p></section>
  <section><h4>Fronts and backs</h4><p>Card fronts show corner symbols and sometimes points. Every back gives one permanent resource in its centre and four empty corners. Use Flip to play a back, which has no requirement and scores nothing.</p></section>
  <section><h4>Visible symbols</h4><p>A corner symbol counts while no card covers it. Centre symbols always count. The strip above the board shows your totals: ${ic('F','inl')} Fungi, ${ic('P','inl')} Plant, ${ic('A','inl')} Animal, ${ic('I','inl')} Insect, ${ic('Q','inl')} Quill, ${ic('K','inl')} Inkwell, ${ic('M','inl')} Manuscript.</p></section>
  <section><h4>Gold cards</h4><p>To play a gold card face up, your codex must already show the resources along its bottom edge. Gold cards score a flat amount, one point per matching object visible after placing (the card's own counts), or two points per corner the card covers.</p></section>
  <section><h4>Objectives</h4><p>Two common objectives apply to everyone, and each player keeps one secret objective. Each one scores every time you complete it. In a pattern, a card can only be used once per objective.</p></section>
  <section><h4>Playing online</h4><p>Create a game to get a six-digit code and share the link. Each player sets up and plays on their own device. Your move is sent when you draw, so you can undo a placement until then. Every screen checks every move against these rules, and you can close the page between turns: the game waits for you.</p></section>
  <section><h4>Ending</h4><p>When someone reaches 20 points or both decks run out, finish the round, then play one more full round. Add objective points. Most points wins; a tie goes to whoever completed more objectives.</p></section>
  </div><div class="mfoot"><button class="btn primary" data-act="close">Back to the game</button></div>`;
}
function resultsHTML(){
  const R=S.results, top=R[0];
  const head=`<tr><th>Player</th><th>Codex</th>${S.common.map(o=>`<th>${esc(OBJ_BY_ID[o].label)}</th>`).join('')}<th>Secret</th><th>Total</th></tr>`;
  const rows=R.map(r=>{
    const p=S.players[r.i], win=r.total===top.total&&r.done===top.done;
    const cell=x=>`${x.pts}${x.times?` <span class="sub">${x.times}×</span>`:''}`;
    return `<tr class="${win?'win':''}"><td>${esc(p.name)}${win?'<span class="crown">Winner</span>':''}</td><td>${r.board}</td><td>${cell(r.objs[0])}</td><td>${cell(r.objs[1])}</td><td>${r.objs[2].pts}<span class="sub">${esc(OBJ_BY_ID[r.objs[2].oid].label)}${r.objs[2].times?` · ${r.objs[2].times}×`:''}</span></td><td class="tot">${r.total}</td></tr>`;
  }).join('');
  const wn=R.filter(r=>r.total===top.total&&r.done===top.done).map(r=>S.players[r.i].name);
  const title=wn.length>1?`${wn.map(esc).join(' and ')} share the finest codex`:`${esc(wn[0])} ${wn[0]==='You'?'complete':'completes'} the finest codex`;
  return `<h2>${title}</h2><p class="lede">Board points plus objectives. Ties go to the player who completed more objectives.</p>
  <div class="tablewrap"><table class="scores"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
  <div class="mfoot"><button class="btn" data-act="close-over">View the codices</button>${S.online?'<a class="btn" href="../">Back to the hub</a>':''}<button class="btn primary" data-act="new">New game</button></div>`;
}
function syncNg(){
  const ng=ui.ng;
  ng.players.slice(0,ng.n).forEach((p,i)=>{const el=document.getElementById('ng-name-'+i);if(el) p.name=el.value.trim()||`Player ${i+1}`;});
  const mn=document.getElementById('ng-myname'), cd=document.getElementById('ng-code');
  if(mn) ng.myName=mn.value;
  if(cd) ng.code=cd.value;
}
function openNewGame(){
  const base=[{name:'You',ai:false,level:'normal'},{name:'Moss',ai:true,level:'normal'},{name:'Fern',ai:true,level:'normal'},{name:'Lichen',ai:true,level:'normal'}];
  if(S&&!S.online) S.players.forEach((p,i)=>{base[i]={name:p.name,ai:p.ai,level:p.level||'normal'};});
  let myName='';try{myName=(HubKit.profile&&HubKit.profile().name)||'';}catch(e){}
  ui.ng={n:S&&!S.online?S.players.length:2,players:base,tab:'local',seats:2,code:'',myName,err:'',busy:false};
  ui.modal='new';render();
}

// ---------- Input ----------
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');
  if(!t||t.disabled) return;
  const d=t.dataset, act=d.act;
  if(!S&&!NO_GAME_ACTS.has(act)) return;
  if(ON.active&&ON.blocked&&!NO_GAME_ACTS.has(act))return;
  switch(act){
    case 'view': if(S.phase!=='setup'){ui.view=+d.i;render();} break;
    case 'sel':
      if(!canAct()||S.phase!=='place') return;
      {const c=CARDS[d.id];sfx(ui.sel!==d.id&&c.type==='G'&&(ui.faces[d.id]||'front')==='front'&&!meetsReq(counts(cur().board),c)?'error':'tap');}
      ui.sel=ui.sel===d.id?null:d.id; ui.aim=null; ui.hlObj=null; ui.view=S.turn; render(); break;
    case 'flip': sfx('flip'); ui.aim=null; ui.faces[d.id]=(ui.faces[d.id]||'front')==='front'?'back':'front'; render(); break;
    case 'spot': {
      if(!canAct()||S.phase!=='place'||!ui.sel) return;
      const key=kxy(+d.x,+d.y);
      // touch: first tap previews the spot, second tap places
      if(ui.ptr!=='mouse'&&ui.aim!==key){ui.aim=key;renderBoard();renderPrompt();return;}
      placeHuman(+d.x,+d.y); break;
    }
    case 'place-aim': if(ui.aim&&canAct()&&S.phase==='place'&&ui.sel){const [x,y]=ui.aim.split(',').map(Number);placeHuman(x,y);} break;
    case 'hlobj': sfx('tap'); ui.hlObj=ui.hlObj===d.o?null:d.o; ui.view=+d.p; renderTop(); renderBoard(); renderSide(); break;
    case 'undo': undoPlace(); break;
    case 'draw': if(canAct()&&S.phase==='draw'){if(S.online){if(ui.pending) commitOnline(d.src);} else doDraw(d.src);} break;
    case 'zin': zoomTo(ui.zoom*1.25); break;
    case 'zout': zoomTo(ui.zoom/1.25); break;
    case 'center': ui.origin=null; renderBoard(); break;
    case 'rules': ui.modal='rules'; render(); break;
    case 'new': openNewGame(); break;
    case 'close': ui.modal=null; render(); break;
    case 'close-over': ui.dismissOver=true; render(); break;
    case 'results': ui.dismissOver=false; render(); break;
    case 'gate-ok': ui.gateOpen=S.setupIdx; render(); break;
    case 'su-face': ui.setup.face=d.face; render(); break;
    case 'su-obj': ui.setup.obj=d.o; render(); break;
    case 'su-ok': {
      if(S.online){saveSetupOnline();break;}
      const p=S.players[S.setupIdx];
      if(!ui.setup.face||!ui.setup.obj) return;
      placeStarter(p,ui.setup.face); p.secret=ui.setup.obj; p.ready=true; setupNext(); break;
    }
    case 'handoff-ok': S.phase='place'; S.lastHuman=S.turn; save(); render(); break;
    case 'ng-n': syncNg(); ui.ng.n=+d.n; render(); break;
    case 'ng-ai': syncNg(); ui.ng.players[+d.i].ai=d.v==='1'; render(); break;
    case 'ng-lvl': syncNg(); ui.ng.players[+d.i].level=d.v; render(); break;
    case 'ng-go': {
      syncNg();
      if(ON.active) leaveOnlineView();
      newGame(ui.ng.players.slice(0,ui.ng.n)); break;
    }
    case 'ng-tab': syncNg(); ui.ng.tab=d.tab; ui.ng.err=''; render(); break;
    case 'ng-seats': syncNg(); ui.ng.seats=+d.n; render(); break;
    case 'on-create': dialogCreate(); break;
    case 'on-join': dialogJoin(); break;
    case 'on-copy': copyLink(); break;
    case 'on-start': onStart(); break;
    case 'on-leave': onLeave(); break;
    case 'on-local': exitOnline(); break;
    case 'on-retry': goOnline(ON.code); break;
    case 'name-ok': nameOk(); break;
  }
});
const NO_GAME_ACTS=new Set(['rules','new','close','ng-n','ng-ai','ng-lvl','ng-go','ng-tab','ng-seats','on-create','on-join','on-copy','on-start','on-leave','on-local','on-retry','name-ok','zin','zout']);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&ui.modal&&(S||ON.active)){ui.modal=null;render();}
  if(e.key==='Enter'&&e.target&&e.target.id==='ng-code'){e.preventDefault();dialogJoin();}
  if(e.key==='Enter'&&e.target&&e.target.id==='on-name'){e.preventDefault();nameOk();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&ui.undo){e.preventDefault();undoPlace();}
  if((e.key==='f'||e.key==='F')&&ui.sel&&!ui.modal&&!/INPUT/.test(document.activeElement.tagName)){sfx('flip');ui.aim=null;ui.faces[ui.sel]=(ui.faces[ui.sel]||'front')==='front'?'back':'front';render();}
});

document.addEventListener('pointerdown',e=>{ui.ptr=e.pointerType||'mouse';},true);
document.addEventListener('mouseover',e=>{
  if(!S||S.phase!=='place'||!ui.sel||ui.ptr!=='mouse') return;
  const sp=e.target.closest&&e.target.closest('.spot'), k=sp?kxy(sp.dataset.x,sp.dataset.y):null;
  if(k!==ui.hover){ui.hover=k;renderPrompt();}
});

// ---------- Board zoom and pan ----------
// zoom around a screen point; cards are sized in em, so only the font-size changes
function zoomTo(z,cx,cy){
  z=Math.max(4,Math.min(18,z));
  if(Math.abs(z-ui.zoom)<.01) return;
  const sc=$('#boardScroll'), el=$('#board'), r0=el.getBoundingClientRect();
  if(cx==null){const r=sc.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;}
  const fx=(cx-r0.left)/ui.zoom, fy=(cy-r0.top)/ui.zoom;
  ui.zoom=z;el.style.fontSize=z+'px';
  if(ui.origin) ui.origin.zoom=z;
  const r1=el.getBoundingClientRect();
  sc.scrollLeft+=r1.left+fx*z-cx;sc.scrollTop+=r1.top+fy*z-cy;
}
(function boardGestures(){
  const sc=$('#boardScroll');
  let pinch=null, drag=null;
  const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  sc.addEventListener('touchstart',e=>{if(e.touches.length===2) pinch={d:dist(e.touches),z:ui.zoom};},{passive:true});
  sc.addEventListener('touchmove',e=>{
    if(!pinch||e.touches.length!==2) return;
    e.preventDefault();
    const t=e.touches;
    zoomTo(pinch.z*dist(t)/pinch.d,(t[0].clientX+t[1].clientX)/2,(t[0].clientY+t[1].clientY)/2);
  },{passive:false});
  sc.addEventListener('touchend',e=>{if(e.touches.length<2) pinch=null;});
  ['gesturestart','gesturechange'].forEach(t=>sc.addEventListener(t,e=>e.preventDefault()));
  sc.addEventListener('wheel',e=>{if(!e.ctrlKey) return;e.preventDefault();zoomTo(ui.zoom*Math.exp(-e.deltaY*.01),e.clientX,e.clientY);},{passive:false});
  sc.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('.spot,button')) return;
    drag={x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop};sc.classList.add('dragging');
  });
  window.addEventListener('pointermove',e=>{if(drag){sc.scrollLeft=drag.l-(e.clientX-drag.x);sc.scrollTop=drag.t-(e.clientY-drag.y);}});
  window.addEventListener('pointerup',()=>{if(drag){drag=null;sc.classList.remove('dragging');}});
})();

// ---------- Draw animation ----------
function launchFlight(f){
  if(!f.from||matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hc=document.querySelector(`.hcard[data-id="${f.id}"]`);
  const target=hc||document.querySelector(`.pchip[data-i="${f.drawer}"]`);
  if(!target) return;
  const to=target.getBoundingClientRect(), fr=f.from;
  if(!fr.width||!to.width) return;
  const fly=document.createElement('div');
  fly.className='flyer';
  fly.style.cssText=`left:${fr.left}px;top:${fr.top}px;font-size:${fr.width/12}px`;
  fly.innerHTML=cardHTML(f.id,f.face,'inhand');
  document.body.appendChild(fly);
  const s=hc?to.width/fr.width:Math.min(to.width/fr.width,to.height/fr.height);
  const dx=to.left-fr.left+(hc?0:(to.width-fr.width*s)/2), dy=to.top-fr.top+(hc?0:(to.height-fr.height*s)/2);
  if(hc) hc.style.visibility='hidden';
  const a=fly.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(${s})`,opacity:hc?1:.1}],{duration:600,easing:'cubic-bezier(.3,.7,.3,1)'});
  a.onfinish=a.oncancel=()=>{fly.remove();if(hc) hc.style.visibility='';};
}

// ---------- Card textures ----------
(function textures(){
  const wrap=(body,op)=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='80' viewBox='0 0 120 80'><g fill='none' stroke='#fff' stroke-opacity='${op}' stroke-width='1.1' stroke-linecap='round'>${body}</g></svg>`)}")`;
  let fur='', scales='';
  for(let r=0;r<6;r++) for(let c=0;c<10;c++){const x=c*14+(r%2)*7-6, y=r*14+4;fur+=`<path d='M${x} ${y+7}q2-5 7-7'/>`;}
  for(let r=0;r<8;r++) for(let c=0;c<9;c++){const x=c*16+(r%2)*8-8, y=r*11;scales+=`<path d='M${x} ${y}a8 8 0 0 0 16 0'/>`;}
  const T={
    F:wrap(`<path d='M-5 62C18 58 30 44 46 40s30-14 42-26 26-16 38-14'/><path d='M46 40c4 12 16 20 30 22s30 10 50 6'/><path d='M88 14c-6-6-6-14-2-20'/><path d='M20 57c-2 8 2 16 10 24'/><path d='M76 62c-2 6 0 12 6 18'/><path d='M30 47c-8-6-18-8-30-6'/><path d='M62 33c4-10 2-20-6-30'/><path d='M100 66c6-8 14-12 24-12'/><g fill='#fff' fill-opacity='.22' stroke='none'><circle cx='46' cy='40' r='2'/><circle cx='88' cy='14' r='1.6'/><circle cx='76' cy='62' r='1.6'/><circle cx='20' cy='57' r='1.3'/></g>`,.18),
    P:wrap(`<path d='M-10 90L130 -10'/><path d='M10 76c-2-14 4-26 14-34M24 66c8-2 20 0 30 8M38 56c-2-14 4-26 14-34M52 46c8-2 20 0 30 8M66 36c-2-14 4-26 14-34M80 26c8-2 20 0 30 8M94 16c-2-12 2-20 10-26M108 6c8-2 16 0 24 6'/>`,.16),
    A:wrap(fur,.16),
    I:wrap(scales,.13),
  };
  KING.forEach(k=>document.documentElement.style.setProperty('--tex-'+k,T[k]));
})();

// ---------- Online play ----------
// The room (seats, seed) and every player's own move list come from HubOnline.rooms.watch. Each screen rebuilds the whole
// game from the seed, the seats (sorted by uid) and those move lists, checking every move; illegal moves are ignored.
// Local play never touches any of this: no save(), no bots, no pass-and-play in online mode.
const ON={active:false,code:null,stage:'',uid:null,unsub:null,room:null,players:{},pending:false,sending:0,mine:{setup:null,moves:[]},
  built:false,wasMine:false,remoteN:0,flagged:false,badge:false,rec:false,token:0,err:null,saveErr:null,msg:'',copied:false,fallback:false,busy:false,joined:false,viewTimer:0};
const hubOK=()=>{try{return !!(window.HubOnline&&HubOnline.available());}catch(e){return false;}};
const normCode=c=>String(c==null?'':c).replace(/\D/g,'');
const fmtCode=c=>c&&c.length===6?c.slice(0,3)+' '+c.slice(3):(c||'');
const roomLink=code=>location.origin+location.pathname+'?room='+code;
const safeColor=c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c)?c:'';
const errText=e=>{
  const c=e&&e.code;
  if(c==='version'||c==='rules-update')return e.message;
  return c==='offline'?"You're offline. Check your connection and try again.":c==='timeout'?"Couldn't reach the game server.":c==='missing'?'No game with that code.'
    :c==='full'?'That game is full.':c==='started'?'That game has already started.':c==='unavailable'?'Online play is unavailable.'
    :c==='auth'?"Couldn't sign in to the game server.":c==='denied'?'The game server refused that.':"Couldn't reach the game server.";
};
const needName=()=>{try{return !!(HubKit.profile&&HubKit.setProfile&&!HubKit.profile().name);}catch(e){return false;}};
// chip colour: the player's profile colour when it is unique at the table, else the seat colour
function pcol(i){
  if(S&&S.online){
    const c=safeColor(S.players[i].color);
    if(c&&S.players.filter(q=>(safeColor(q.color)||'').toLowerCase()===c.toLowerCase()).length===1) return c;
  }
  return `var(--p${i})`;
}

function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function sshuffle(arr,r){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// Rebuild the game for 2-4 seats. `mine` is this device's own (possibly not yet confirmed) setup and moves.
function buildOnline(room,players,mine,myUid){
  const ids=Object.keys(room.seats||{}).sort(), n=ids.length;
  if(n<2||n>4||typeof room.seed!=='number') return null;
  const r=rng(room.seed);
  const res=sshuffle(RES_IDS,r), gold=sshuffle(GOLD_IDS,r), st=sshuffle(START_IDS,r), objs=sshuffle(OBJECTIVES.map(o=>o.id),r);
  const first=Math.floor(r()*n);
  const base=ids.map((u,i)=>String((room.seats[u]&&room.seats[u].name)||'').replace(/\s+/g,' ').trim().slice(0,16)||`Player ${i+1}`);
  const nameAt=i=>{const k=base.slice(0,i).filter(x=>x.toLowerCase()===base[i].toLowerCase()).length;return k?`${base[i]} ${k+1}`:base[i];};
  const s={online:true,v:1,phase:'setup',turn:first,first,round:1,endTriggered:false,turnsLeft:0,passStreak:0,log:[],resDeck:res,goldDeck:gold,
    market:{R:[],G:[]},common:[objs.pop(),objs.pop()],results:null,lastMove:null,moveCount:ids.map(()=>0),
    players:ids.map((uid,i)=>({uid,name:nameAt(i),color:room.seats[uid]&&room.seats[uid].color,ai:false,level:'normal',board:{},placedN:0,hand:[],score:0,starter:st[i],secretChoices:[objs.pop(),objs.pop()],secret:null,ready:false}))};
  s.market.R=[res.pop(),res.pop()];s.market.G=[gold.pop(),gold.pop()];
  s.players.forEach(p=>{p.hand=[res.pop(),res.pop(),gold.pop()];});
  s.me=ids.indexOf(myUid);
  const docOf=uid=>{
    const d=(players&&players[uid])||{};
    if(uid!==myUid||!mine) return d;
    const sm=Array.isArray(d.moves)?d.moves:[];
    return {setup:d.setup||mine.setup,moves:mine.moves.length>sm.length?mine.moves:sm};
  };
  s.players.forEach(p=>{
    const su=docOf(p.uid).setup;
    if(su&&(su.face==='front'||su.face==='back')&&p.secretChoices.includes(su.secret)){placeStarter(p,su.face);p.secret=su.secret;p.ready=true;}
  });
  if(!s.players.every(p=>p.ready)) return s;
  s.phase='place';
  slog(s,`Round 1. ${nm(s.players[first])} plays first.`);
  const moves=ids.map(u=>{const m=docOf(u).moves;return Array.isArray(m)?m:[];});
  const ptr=ids.map(()=>0);
  for(let guard=0;guard<2000;guard++){
    const i=s.turn, p=s.players[i];
    if(!p.hand.length||!validSpots(p.board).length){
      passOn(s,p);
      if(advance(s)) break;
      continue;
    }
    let applied=false;
    while(ptr[i]<moves[i].length){
      if(applyMove(s,i,moves[i][ptr[i]++])){applied=true;break;}
      slog(s,`A move from ${nm(p)} broke the rules and was ignored.`);
    }
    if(!applied) break; // waiting for seat i
    s.passStreak=0;
    if(advance(s)) break;
  }
  return s;
}
function applyMove(s,i,mv){
  if(!mv||typeof mv!=='object') return false;
  const p=s.players[i], {id,face,x,y}=mv, src=mv.src??null;
  if(typeof id!=='string'||!p.hand.includes(id)||(face!=='front'&&face!=='back')||!Number.isInteger(x)||!Number.isInteger(y)) return false;
  if(!validSpots(p.board).some(([a,b])=>a===x&&b===y)) return false;
  if(face==='front'&&!meetsReq(counts(p.board),CARDS[id])) return false;
  const opts=drawOptionsOf(s); // placing never changes the decks or the market
  if(opts.length?!opts.some(o=>o.src===src):src!==null) return false;
  const pts=placeOn(s,i,id,face,x,y);
  if(src) drawOn(s,i,src);
  s.moveCount[i]++;
  s.lastMove={seat:i,key:kxy(x,y),pts,src};
  return true;
}
function applyPending(){
  const pd=ui.pending;
  if(!pd||!S||!S.online) return;
  const me=S.me, p=S.players[me];
  const ok=me>=0&&S.phase==='place'&&S.turn===me&&p.hand.includes(pd.id)&&validSpots(p.board).some(([a,b])=>a===pd.x&&b===pd.y)
    &&(pd.face==='back'||meetsReq(counts(p.board),CARDS[pd.id]));
  if(ok){placeOn(S,me,pd.id,pd.face,pd.x,pd.y);S.phase='draw';}
  else{ui.pending=null;ui.undo=null;}
}
function mineDoc(){
  const d=ON.players[ON.uid]||{}, sm=Array.isArray(d.moves)?d.moves:[];
  return {setup:d.setup||ON.mine.setup||null,moves:ON.mine.moves.length>sm.length?ON.mine.moves:sm};
}
const remoteCount=()=>Object.keys(ON.players).filter(u=>u!==ON.uid).reduce((a,u)=>a+(ON.players[u].moves||[]).length+(ON.players[u].setup?1:0),0);

// Rebuild the game from the room and render. `ui.pending` (placed, not yet drawn) is laid over the top.
function refreshGame(){
  const s=buildOnline(ON.room,ON.players,ON.mine,ON.uid);
  if(!s){S=null;ON.stage='error';ON.msg="This game can't be shown.";render();return;}
  const mineNow=s.me>=0&&s.phase==='place'&&s.turn===s.me;
  const rc=remoteCount(), remoteMoved=ON.built&&rc>ON.remoteN;
  S=s;applyPending();
  ON.stage='play';
  if(!ON.built){ui.view=Math.max(0,S.me);ui.setup={face:null,obj:null};}
  if(ui.view>=S.players.length) ui.view=0;
  // your-turn signals: only when another player's update hands you the turn (never on first load)
  if(remoteMoved&&mineNow&&!ON.wasMine){sfx('chime');ON.flagged=true;}
  if(!mineNow) ON.flagged=false;
  ON.wasMine=mineNow;ON.remoteN=rc;ON.built=true;
  signals();
  // an opponent's move: show their codex with the drop animation
  if(remoteMoved&&S.lastMove&&S.lastMove.seat!==S.me&&!ui.pending&&!ui.sel&&!ui.modal){
    const lm=S.lastMove;
    ui.view=lm.seat;ui.fresh={view:lm.seat,key:lm.key,pts:lm.pts};ui.origin=null;
    sfx('place',true);if(lm.pts>0) setTimeout(()=>sfx('score',true),120);
    clearTimeout(ON.viewTimer);
    ON.viewTimer=setTimeout(()=>{if(S&&S.online&&ON.active&&!ui.sel&&!ui.modal&&S.me>=0&&ui.view===lm.seat&&ui.fresh==null){ui.view=S.me;ui.origin=null;render();}},2800);
  }
  if(S.phase==='over'&&S.me>=0&&!ON.rec){
    ON.rec=true;
    const top=S.results[0], mr=S.results.find(r=>r.i===S.me);
    try{if(mr&&HubKit.recordResult) HubKit.recordResult('codex',ON.uid+':'+ON.code,{won:mr.total===top.total&&mr.done===top.done,score:mr.total});}catch(e){}
  }
  render();
}
function signals(){
  const t=ON.active&&ON.flagged?'Your turn · Codex Naturalis':'Codex Naturalis';
  if(document.title!==t) document.title=t;
  const b=ON.active&&ON.flagged;
  if(b!==ON.badge){ON.badge=b;try{if(HubKit.setBadge) HubKit.setBadge(b);}catch(e){}}
}

// ---- sending your own moves ----
function turnSummary(s){
  return {phase:s.phase==='setup'?'setup':s.phase==='over'?'over':'play',next:s.phase==='place'?s.players[s.turn].uid:null,...(s.phase==='over'?{over:true}:{})};
}
function flush(onDenied){
  if(ON.blocked)return;
  const code=ON.code, tok=ON.token, doc=mineDoc(), turn=turnSummary(S);
  const o={moves:doc.moves,turn};
  if(doc.setup) o.setup=doc.setup;
  ON.sending++;
  HubOnline.rooms.writeMine(code,o).then(()=>{
    ON.sending--;
    if(tok===ON.token&&S) renderPrompt();
  },e=>{
    ON.sending--;
    if(tok!==ON.token) return;
    if(e&&e.code==='denied'){ // the server refused the write: roll back to what it holds
      ON.mine={setup:null,moves:[]};ON.saveErr='denied';
      if(onDenied) onDenied();
      refreshGame();
    } else if(S) renderPrompt();
  });
  if(S) renderPrompt();
}
function placeOnline(x,y){
  if(ON.blocked)return;
  const p=S.players[S.me], id=ui.sel, face=ui.faces[id]||'front';
  const b=Object.assign({},p.board);b[kxy(x,y)]={id,face,x,y,order:p.placedN};
  const pts=pointsFor(b,id,face,x,y);
  ui.pending={id,face,x,y};ui.undo=true;ON.saveErr=null;
  delete ui.faces[id];
  ui.sel=null;ui.aim=null;ui.hover=null;ui.view=S.me;
  ui.fresh={view:S.me,key:kxy(x,y),pts};
  sfx('place');if(pts>0) setTimeout(()=>sfx('score'),120);
  refreshGame();
  if(S&&S.phase==='draw'&&!drawOptions().length) return commitOnline(null);
  if(window.innerWidth<=860) $('#marketSec').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function undoOnline(){
  const pd=ui.pending;
  if(!pd) return;
  ui.pending=null;ui.undo=null;ui.sel=pd.id;ui.faces[pd.id]=pd.face;ui.view=S.me;
  sfx('swish');
  refreshGame();
}
// the draw sends the whole move (card, face, spot and where it was drawn from)
function commitOnline(src){
  if(ON.blocked)return;
  const pd=ui.pending;
  if(!pd||!S||!S.online) return;
  const el=src&&document.querySelector(`[data-src="${src}"]`), from=el&&el.getBoundingClientRect();
  let drawn=null;
  if(src==='RD') drawn=S.resDeck[S.resDeck.length-1];
  else if(src==='GD') drawn=S.goldDeck[S.goldDeck.length-1];
  else if(src) drawn=S.market[src[0]][+src[1]];
  ON.mine={setup:mineDoc().setup,moves:[...mineDoc().moves,{id:pd.id,face:pd.face,x:pd.x,y:pd.y,src:src||null}]};
  ui.pending=null;ui.undo=null;
  if(drawn){ui.flight={id:drawn,face:src[1]==='D'?'back':'front',from,drawer:S.me};sfx('draw');}
  if(src&&src[1]!=='D') ui.refill=src;
  refreshGame();
  flush(()=>{ui.pending=pd;ui.undo=true;ui.flight=null;});
}
function saveSetupOnline(){
  if(ON.blocked)return;
  const su=ui.setup;
  if(!S||!S.online||S.me<0||!su.face||!su.obj) return;
  ON.mine={setup:{face:su.face,secret:su.obj},moves:mineDoc().moves};
  ON.saveErr=null;
  refreshGame();
  flush(()=>{});
}

// ---- entering, watching and leaving a room ----
function stopOnline(){
  if(ON.session){ON.session.close();ON.session=null;}
  ON.blocked=false;
  ON.token++;
  if(ON.unsub){try{ON.unsub();}catch(e){}ON.unsub=null;}
  clearTimeout(ON.viewTimer);
}
function resetOnline(code){
  Object.assign(ON,{active:true,code,stage:'joining',uid:null,room:null,players:{},pending:false,sending:0,mine:{setup:null,moves:[]},built:false,wasMine:false,
    remoteN:0,flagged:false,rec:false,err:null,saveErr:null,msg:'',copied:false,fallback:false,busy:false,joined:false});
}
// switch the page from local play to a room; the local save is left alone
function goOnline(code,opts){
  stopOnline();
  ui.aiToken++;ui.pending=null;ui.undo=null;ui.sel=null;ui.aim=null;ui.hover=null;ui.hlObj=null;ui.fresh=null;ui.flight=null;ui.preview=null;
  ui.dismissOver=false;ui.modal=null;ui.setup={face:null,obj:null};ui.faces={};ui.origin=null;
  S=null;
  resetOnline(code);
  ON.joined=!!(opts&&opts.joined);
  const tok=ON.token;
  try{history.replaceState(null,'',location.pathname+'?room='+code);}catch(e){}
  signals();
  if(!hubOK()){ON.stage='unavailable';render();return;}
  connect(tok);
}
// name check, sign-in, a look at the room, then the live watch
async function connect(tok){
  if(needName()){ON.stage='name';render();return;}
  ON.stage='joining';render();
  try{
    const me=await HubOnline.ready();
    if(tok!==ON.token) return;
    ON.uid=me.uid;
    if(!ON.joined){
      const r=await probe(ON.code);
      if(tok!==ON.token) return;
      if(r.state!=='ok'){
        if(r.state==='started'){ON.stage='nogame';}
        else if(r.state==='missing'){ON.stage='missing';}
        else{ON.stage='error';ON.msg=probeText(r);}
        render();return;
      }
    }
    if(ON.session){ON.session.close();ON.session=null;}
  if(window.HubSession) ON.session=HubSession.mount({code:ON.code,onExit:exitOnline,onRestart:goOnline});
  ON.unsub=HubOnline.rooms.watch(ON.code,snap=>{if(tok===ON.token) onSnap(snap);});
  }catch(e){
    if(tok===ON.token) failWith(e);
  }
}
// look the room up and take a free seat (an existing seat is kept, even after the start)
async function probe(code){
  const info=await HubOnline.rooms.lookup(code);
  if(!info.exists) return {state:'missing'};
  const compatibility=HubOnline.rooms.compatibility?HubOnline.rooms.compatibility(info):{ok:true};
  if(!compatibility.ok)return {state:'incompatible',message:compatibility.message};
  if(['cancelled','ended'].includes(info.status)&&!info.seated)return {state:'closed',message:'This room has ended. Start a new game from the hub.'};
  if(info.game&&info.game!=='codex') return {state:'wrong'};
  if(!info.seated){
    if(info.status!=='open') return {state:'started'};
    try{await HubOnline.rooms.join(code);}
    catch(e){if(e&&(e.code==='full'||e.code==='started'||e.code==='missing')) return {state:e.code};throw e;}
  }
  return {state:'ok'};
}
const probeText=r=>r.message|| (r.state==='wrong'?'That code belongs to a different game. Open it from the hub.':r.state==='full'?'That game is full.':r.state==='started'?'That game has already started.':'No game with that code.');
function failWith(e){
  const c=e&&e.code;
  S=null;
  if(c==='unavailable') ON.stage='unavailable';
  else if(c==='missing') ON.stage='missing';
  else if(c==='started') ON.stage='nogame';
  else{ON.stage='error';ON.msg=errText(e);}
  render();
}
// Every room snapshot is checked before replay, including deferred local drafts.
function roomSnapshotAllowed(snap) {
  const compatibility = snap.room && HubOnline.rooms.compatibility ? HubOnline.rooms.compatibility(snap.room) : {ok:true};
  const terminal = snap.room && ['cancelled','ended'].includes(snap.room.status);
  const sessionOK = !ON.session || ON.session.update(snap);
  ON.blocked = !!terminal || !compatibility.ok || !sessionOK;
  if(ON.blocked) {
    ON.deferred=null;
    clearTimeout(ON.viewTimer);
    if(!ON.session) {
      const message=compatibility.ok ? 'This room has ended. Return to the hub to start another game.' : compatibility.message;
      ON.stage='error';ON.msg=message;S=null;render();
    }
    return false;
  }
  return true;
}
function onSnap(snap){
  if(!roomSnapshotAllowed(snap)) return;
  if(snap.error){
    ON.err=snap.error;
    if(!ON.room) failWith(snap.error); else if(S) renderPrompt();
    return;
  }
  ON.err=null;
  if(!snap.room){ON.room=null;S=null;ON.stage='missing';render();return;}
  ON.room=snap.room;ON.players=snap.players||{};ON.pending=!!snap.pending;
  const seated=!!(snap.room.seats&&snap.room.seats[ON.uid]);
  if(!seated){
    if(snap.room.status!=='open'){S=null;ON.stage='nogame';render();}
    return;
  }
  if(snap.room.status==='open'){ON.stage='waiting';S=null;render();return;}
  refreshGame();
}
function leaveOnlineView(){ // drop the room view without touching the page (used before a local game starts)
  stopOnline();ON.active=false;ON.flagged=false;ON.code=null;ON.stage='';
  try{history.replaceState(null,'',location.pathname);}catch(e){}
  signals();
}
function exitOnline(){
  leaveOnlineView();
  S=null;ui.pending=null;ui.undo=null;ui.modal=null;ui.view=0;
  startLocal();
}
function renderShell(){ // before there is a game to show: only the room screens
  $('#players').innerHTML='';$('#roundInfo').textContent='Online game';
  $('#board').innerHTML='';$('#resStrip').innerHTML='';$('#boardTitle').textContent='';
  $('#prompt').innerHTML='';$('#hand').innerHTML='';$('#market').innerHTML='';$('#objectives').innerHTML='';$('#log').innerHTML='';$('#deckInfo').textContent='';
  renderModal();
}
async function copyLink(){
  if(!ON.code) return;
  let ok=false;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(roomLink(ON.code));ok=true;}}catch(e){}
  if(ok){ON.copied=true;ON.fallback=false;render();setTimeout(()=>{ON.copied=false;render();},1800);return;}
  ON.fallback=true;render();
  const f=document.getElementById('on-link');
  if(f){f.focus();f.select();try{if(document.execCommand('copy')){ON.copied=true;ON.fallback=false;render();setTimeout(()=>{ON.copied=false;render();},1800);}}catch(e){}}
}
async function onStart(){
  if(ON.busy) return;
  const tok=ON.token;
  ON.busy=true;ON.msg='';render();
  try{await HubOnline.rooms.start(ON.code);}catch(e){if(tok===ON.token) ON.msg=errText(e);}
  if(tok===ON.token){ON.busy=false;render();}
}
async function onLeave(){
  if(ON.busy) return;
  const tok=ON.token;
  ON.busy=true;ON.msg='';render();
  try{await HubOnline.rooms.leave(ON.code);}
  catch(e){if(tok===ON.token){ON.busy=false;ON.msg=errText(e);render();}return;}
  if(tok===ON.token) exitOnline();
}
function nameOk(){
  const el=document.getElementById('on-name'), v=el?el.value.replace(/\s+/g,' ').trim():'';
  if(!v){ON.msg='Enter a name to continue.';render();return;}
  try{HubKit.setProfile({name:v});}catch(e){}
  ON.msg='';
  connect(ON.token);
}
// ---- the New game dialog's Online tab ----
function commitName(){
  try{
    if(!(HubKit.profile&&HubKit.setProfile)) return true;
    const v=String(ui.ng.myName||'').replace(/\s+/g,' ').trim().slice(0,16);
    if(!v){ui.ng.err='Enter your name first.';render();return false;}
    if(v!==HubKit.profile().name) HubKit.setProfile({name:v});
  }catch(e){}
  return true;
}
async function dialogCreate(){
  const ng=ui.ng;
  if(ng.busy) return;
  syncNg();
  if(!commitName()) return;
  ng.busy='create';ng.err='';render();
  try{
    const r=await HubOnline.rooms.create({game:'codex',maxSeats:ng.seats});
    ui.modal=null;ng.busy=false;
    goOnline(r.code,{joined:true});
  }catch(e){ng.busy=false;ng.err=errText(e);render();}
}
async function dialogJoin(){
  const ng=ui.ng;
  if(!ng||ng.busy||ui.modal!=='new') return;
  syncNg();
  const code=normCode(ng.code);
  if(!/^[1-9][0-9]{5}$/.test(code)){ng.err='Enter the six-digit game code.';render();return;}
  if(!commitName()) return;
  ng.busy='join';ng.err='';render();
  try{
    await HubOnline.ready();
    const r=await probe(code);
    if(r.state!=='ok'){ng.busy=false;ng.err=probeText(r);render();return;}
    ui.modal=null;ng.busy=false;
    goOnline(code,{joined:true});
  }catch(e){ng.busy=false;ng.err=errText(e);render();}
}
function onlineHTML(){
  const code=fmtCode(ON.code), local='<button class="btn" data-act="on-local">Play on this device</button>';
  const hub='<a class="btn" href="../">Back to the hub</a>';
  switch(ON.stage){
    case 'unavailable': return `<h2>Online play is unavailable</h2><p class="lede">Online games need the game server, and it can't be reached from here right now. Playing on this device still works.</p><div class="mfoot">${local}</div>`;
    case 'name': return `<h2>What should we call you?</h2><p class="lede">Other players see this name. You can change it later in the menu under You.</p>
      <div class="onrow" style="margin-top:12px"><label class="sr" for="on-name">Your name</label><input id="on-name" maxlength="16" autocomplete="nickname" placeholder="Name"></div>
      ${ON.msg?`<p class="errline" role="alert">${esc(ON.msg)}</p>`:''}
      <div class="mfoot">${local}<button class="btn primary" data-act="name-ok">Continue</button></div>`;
    case 'joining': return `<h2>Joining game ${esc(code)}</h2><p class="lede">Connecting to the game server…</p><div class="mfoot">${local}</div>`;
    case 'nogame': return `<h2>This game started without you</h2><p class="lede">Game ${esc(code)} is already under way and every seat is taken. Ask your friends for a new code, or start a game of your own.</p><div class="mfoot">${hub}<button class="btn primary" data-act="new">New game</button></div>`;
    case 'missing': return `<h2>No game with that code</h2><p class="lede">There is no game ${esc(code)}. Check the code with whoever invited you.</p><div class="mfoot">${hub}<button class="btn primary" data-act="new">New game</button></div>`;
    case 'error': return `<h2>Couldn't open the game</h2><p class="lede">${esc(ON.msg||"Something went wrong.")}</p><div class="mfoot">${local}${ON.code?'<button class="btn primary" data-act="on-retry">Try again</button>':''}</div>`;
    case 'waiting': return waitingHTML();
  }
  return '';
}
function waitingHTML(){
  const room=ON.room, seats=room.seats||{}, max=room.maxSeats||2, host=room.host===ON.uid;
  const ids=Object.keys(seats).sort((a,b)=>(seats[a].joinedAt||0)-(seats[b].joinedAt||0)||(a<b?-1:1));
  const rows=ids.map(u=>{
    const tags=[u===room.host?'host':'',u===ON.uid?'you':''].filter(Boolean).join(' · ');
    return `<li style="--pc:${safeColor(seats[u].color)||'var(--muted)'}"><span class="dotc"></span><span class="who">${esc(seats[u].name||'Player')}</span><span class="tag">${tags}</span></li>`;
  }).join('')+Array.from({length:Math.max(0,max-ids.length)},()=>'<li class="empty"><span class="dotc"></span><span class="who">Waiting for a player…</span></li>').join('');
  const status=host?(ids.length<2?'Share the code. You need at least one more player to start.':ids.length<max?'Start now, or wait for more players. The game starts by itself when every seat is full.':'Everyone is here.')
    :'Waiting for the host to start the game.';
  return `<h2>Waiting for players</h2><p class="lede">Share this code, or the link, with your friends.</p>
  <div class="bigcode" aria-label="Game code ${esc(ON.code)}">${esc(fmtCode(ON.code))}</div>
  <div class="onrow" style="margin-top:10px"><button class="btn primary" data-act="on-copy">${ON.copied?'Link copied':'Copy link'}</button></div>
  ${ON.fallback?`<label class="sr" for="on-link">Game link</label><input id="on-link" class="copyfld" readonly value="${esc(roomLink(ON.code))}"><p class="lede">Select the link above and copy it.</p>`:''}
  <h3>Players · ${ids.length} of ${max}</h3><ul class="plist" aria-label="Players">${rows}</ul>
  <p class="statusline" role="status">${status}</p>
  ${ON.msg?`<p class="errline" role="alert">${esc(ON.msg)}</p>`:''}
  <div class="mfoot"><a class="btn" href="../">Back to the hub</a>${host?`<button class="btn primary" data-act="on-start" ${ids.length<2||ON.busy?'disabled':''}>Start</button>`:`<button class="btn" data-act="on-leave" ${ON.busy?'disabled':''}>Leave</button>`}</div>`;
}

// ---------- Boot ----------
function start(data){
  // ?room=CODE opens straight into that room, before any local save is read
  const rc=new URLSearchParams(location.search).get('room');
  if(rc!=null&&rc!==''){
    const c=normCode(rc);
    if(/^[1-9][0-9]{5}$/.test(c)) return goOnline(c);
    ON.active=true;ON.stage='error';ON.msg="That link doesn't hold a valid six-digit game code.";render();return;
  }
  const mode=new URLSearchParams(location.search).get('mode');
  if(location.hash!=='#continue'&&['solo','local','online'].includes(mode)){
    openNewGame();ui.ng.n=2;ui.ng.players[0]={name:'You',ai:false,level:'normal'};
    ui.ng.players[1]={name:mode==='local'?'Player 2':'Moss',ai:mode!=='local',level:'normal'};
    ui.ng.tab=mode==='online'?'online':'local';renderModal();return;
  }
  startLocal(data);
}
function startLocal(data){
  let s=data&&data.S;
  if(!s){try{s=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){s=null;}}
  if(s&&s.v===1&&Array.isArray(s.players)){
    S=s;
    if(data&&data.zoom) ui.zoom=data.zoom;
    ui.view=data&&data.view!=null?data.view:(handOwner()??S.turn);
    render();
    if((S.phase==='place'||S.phase==='draw')&&cur().ai) aiStep();
    else if(S.phase==='pass') setTimeout(endTurn,300);
  } else newGame([{name:'You',ai:false},{name:'Moss',ai:true}]);
}
HubKit.init({
  id:'codex',name:'Codex Naturalis',accent:{light:'#7a5a12',dark:'#d8b45a'},scheme:'auto',
  items:()=>[
    {label:'Rules',onSelect:()=>{ui.modal='rules';render();}},
    {label:'New game',onSelect:()=>openNewGame()},
    ...(ON.active&&ON.code?[{label:'Game code',value:fmtCode(ON.code),onSelect:copyLink}]:[]),
    ...(ON.active?[]:[{label:'Bot speed',value:pace[0].toUpperCase()+pace.slice(1),onSelect:cyclePace}])
  ]
});
{const a=document.querySelector('.top .actions');if(a&&!a.querySelector('[data-hubkit="menu"]')) a.insertAdjacentHTML('beforeend',HubKit.buttonHTML());}
window.claude?.hot?.snapshot?.(()=>({S,view:ui.view,zoom:ui.zoom}));
window.claude?.hot?.ready?window.claude.hot.ready(start):start(window.claude?.hot?.data??{});
