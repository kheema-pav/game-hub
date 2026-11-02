const S = {screen:"setup",teams:["Team One","Team Two"],secs:60,rounds:3,turn:0,used:new Set(),word:null,skipsLeft:1,end:0,left:60,paused:false,reveal:false,scores:[0,0],tick:null,wake:null};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const total = () => S.teams.length * S.rounds;

function pickWord(){
  const flat = Object.entries(WORDS).flatMap(([c,l])=>l.map(w=>[c,w]));
  let pool = flat.filter(x=>!S.used.has(x[1]));
  if(!pool.length){S.used.clear();pool=flat}
  const [c,w] = pool[Math.floor(Math.random()*pool.length)];
  S.used.add(w); S.word={c,w};
}
const sfx=(n,o)=>{try{HubKit.sfx(n,o)}catch(e){}};
async function keepAwake(){try{S.wake=await navigator.wakeLock.request("screen")}catch(e){}}

function go(screen){S.screen=screen;if(screen==="final"){recordLocalResult();sfx("win")}render()}
function startGame(){
  clearInterval(S.tick);delete S._night;S.word=null;S.reveal=false;S.paused=false;S.left=S.secs;S.skipsLeft=1;
  S.scores=S.teams.map(()=>0);S.turn=0;S.used.clear();keepAwake();go("handover");
}
function recordLocalResult(){
  if(ON.active||S.screen!=="final"||S.turn<total())return;
  try{
    if(window.HubGameNight){
      const best=Math.max(...S.scores);
      HubGameNight.finish('sketch',S,{players:S.teams.map((name,i)=>({name,bot:false,score:S.scores[i]})),winners:S.scores.map((score,i)=>score===best?i:-1).filter(i=>i>=0),mode:'local',summary:S.rounds+' rounds · '+S.secs+'s turns'});
    }
  }catch(e){}
}
function beginDraw(){pickWord();S.skipsLeft=1;S.reveal=false;S.left=S.secs;S.paused=false;go("secret")}
function startTimer(){
  S.end=Date.now()+S.left*1000;S.paused=false;S.prev=S.left;go("draw");
  clearInterval(S.tick);
  S.tick=setInterval(()=>{
    if(S.paused)return;
    S.left=Math.max(0,Math.ceil((S.end-Date.now())/1000));
    if(S.left!==S.prev){S.prev=S.left;if(S.left>=1&&S.left<=10)sfx("tick")}
    paint();
    if(S.left<=0){clearInterval(S.tick);sfx("buzzer");go("verdict")}
  },250);
}
function verdict(ok){
  if(ok)S.scores[S.turn%S.teams.length]++;
  S.turn++;
  go(S.turn>=total()?"final":"scores");
}
function skip(){if(S.skipsLeft>0){S.skipsLeft--;pickWord();sfx("flip");render()}}

function scoreList(active){
  return `<div class="score">${S.teams.map((t,i)=>`<div class="${i===active?'on':''}"><span class="dot" style="background:${COLORS[i]}"></span><span class="n">${esc(t)}</span><span class="p">${S.scores[i]}</span></div>`).join("")}</div>`;
}
function status(){
  const r = Math.floor(S.turn/S.teams.length)+1;
  return `<div class="top"><span class="label">Round ${Math.min(r,S.rounds)} of ${S.rounds}</span>${HubKit.buttonHTML()}</div>`;
}

function render(noClear){
  if(ON.active)return;
  const a=$("app"), cur=S.turn%S.teams.length, name=esc(S.teams[cur]||"");
  let h="";
  a.dataset.screen=S.screen;
  if(S.screen==="setup"){
    h=`<header class="sk-intro"><span class="sk-sticker" aria-hidden="true">✎</span><span class="label">A little imagination. A lot of laughter.</span><h1>Pen &amp; Paper<br>Pictionary</h1><p class="muted">Draw something brilliant. Or brilliantly bad.</p></header>
    <div class="sk-modes"><div><b>At the table</b><span>One phone + paper · 2–4 teams</span></div>${onlineAvailable()?'<a href="#ocard"><b>Play online ↗</b><span>Draw on screen · 2–8 players</span></a>':''}</div>
    <div class="card"><span class="label">1 · Name your teams</span>
      ${S.teams.map((t,i)=>`<div class="teamin"><span class="dot" style="background:${COLORS[i]}"></span><input id="t${i}" value="${esc(t)}" maxlength="20" aria-label="Team ${i+1} name"></div>`).join("")}
      <div class="row">${S.teams.length<4?'<button id="addT">Add team</button>':''}${S.teams.length>2?'<button id="delT">Remove last</button>':''}</div>
    </div>
    <div class="card"><span class="label">2 · Set the pace</span><span class="tiny muted">Drawing time per turn</span>
      <div class="seg">${[45,60,90].map(v=>`<button data-secs="${v}" aria-pressed="${S.secs===v}">${v}s</button>`).join("")}</div>
      <span class="label">Turns per team</span>
      <div class="seg">${[2,3,5].map(v=>`<button data-rounds="${v}" aria-pressed="${S.rounds===v}">${v}</button>`).join("")}</div>
    </div>
    <button class="primary" id="start">Start game</button><p class="sk-estimate">${S.teams.length*S.rounds} turns · about ${Math.ceil(S.teams.length*S.rounds*S.secs/60)} minutes of drawing</p>
    <p class="muted tiny">Each team gets one word per turn. Guess it before time runs out to score a point. One skip per turn.</p>
    ${S.notice?`<p class="notice" role="status">${esc(S.notice)}</p>`:''}${onlineCardHTML()}`;
  }
  else if(S.screen==="handover"){
    h=`${status()}<div class="stage big"><span class="label">Up next</span><h1 style="color:${'var(--ink)'}">${name}</h1>
    <p class="muted">Pick a drawer. Everyone else looks away while the drawer reads the word.</p></div>
    ${scoreList(cur)}
    <button class="primary" id="ready">I'm the drawer</button>`;
  }
  else if(S.screen==="secret"){
    h=`${status()}<div class="stage big"><span class="label">${name} · drawer only</span>
    <button type="button" id="reveal-word" class="wordbox ${S.reveal?'':'hidden-word'}" aria-label="${S.reveal?'Hide secret word':'Reveal secret word'}">${S.reveal
      ?`<span class="cat">${esc(S.word.c)}</span><span class="word">${esc(S.word.w)}</span>`
      :`<span class="word">Tap to reveal</span><span class="cat">Drawer only. Keep it secret!</span>`}</button>
    ${S.reveal?`<div class="row"><button id="skip" ${S.skipsLeft?'':'disabled'}>${S.skipsLeft?'Skip word (1 left)':'No skips left'}</button><button id="hide">Hide</button></div>`:''}</div>
    <button class="primary" id="go" ${S.reveal?'':'disabled style="opacity:.5"'}>Start the clock</button>`;
  }
  else if(S.screen==="draw"){
    h=`${status()}<div class="stage"><span class="label big">${name} is drawing</span>
    <div class="sk-clock-state" role="status">${S.paused?'Clock paused · take your time':'Draw! No letters, numbers or talking.'}</div><div class="timer" id="tm" role="timer" aria-label="Time remaining"></div><div class="bar"><i id="bar"></i></div>
    <div class="wordbox ${S.reveal?'':'hidden-word'}" id="wb"></div>
    <div class="row"><button id="peek">${S.reveal?'Hide word':'Show word'}</button><button id="skip" ${S.skipsLeft?'':'disabled'}>Skip${S.skipsLeft?' (1)':''}</button></div></div>
    <div class="row"><button id="pause">${S.paused?'Resume':'Pause'}</button><button class="good" id="got">Guessed it</button></div>`;
  }
  else if(S.screen==="verdict"){
    h=`${status()}<div class="stage big"><h1>Time's up</h1>
    <div class="wordbox"><span class="cat">The word was</span><span class="word">${esc(S.word.w)}</span></div>
    <p class="muted">Did ${name} guess it?</p></div>
    <div class="row"><button class="bad" id="no">Missed it</button><button class="good" id="yes">Got it</button></div>`;
  }
  else if(S.screen==="scores"){
    h=`${status()}<div class="stage"><h2 class="big">Scores</h2>${scoreList(S.turn%S.teams.length)}
    <p class="muted big">Next: ${esc(S.teams[S.turn%S.teams.length])}</p></div><button class="primary" id="next">Next turn</button>`;
  }
  else if(S.screen==="final"){
    const max=Math.max(...S.scores), w=S.teams.filter((_,i)=>S.scores[i]===max);
    h=`<div class="stage big"><span class="label">Final</span><h1>${w.length>1?"It's a tie":esc(w[0])+" wins"}</h1>
    ${w.length>1?`<p class="muted">${w.map(esc).join(" and ")}</p>`:''}${scoreList(-1)}</div>
    <div class="row"><button id="again" class="primary">Rematch, same teams</button><button id="setup">Change teams</button></div>`;
  }
  if(S.screen==="setup"||S.screen==="final")h='<div class="fl"></div>'+h;
  a.classList.toggle("clock-paused",S.screen==="draw"&&S.paused);
  a.innerHTML=h; bind(); paint();
  try{HubKit.setFloating(S.screen==="setup"||S.screen==="final")}catch(e){}
  if(!noClear){if(S.screen==="setup"||S.screen==="final")clearSave();else save()}
}
const SAVE_KEY="pictionary.save.v1";
function clearSave(){try{localStorage.removeItem(SAVE_KEY)}catch(e){}}
function save(){
  if(ON.active)return;
  try{if(window.HubGameNight)HubGameNight.touch(S)}catch(e){}
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({v:1,screen:S.screen,teams:S.teams,scores:S.scores,turn:S.turn,rounds:S.rounds,secs:S.secs,used:[...S.used],skipsLeft:S.skipsLeft,_night:S._night}))}catch(e){}
}
function restore(){
  try{
    const d=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
    if(!d||d.v!==1||!["handover","secret","draw","verdict","scores"].includes(d.screen))return false;
    const n=Array.isArray(d.teams)?d.teams.length:0, ok=x=>Number.isInteger(x)&&x>=0;
    if(n<2||n>4||!d.teams.every(t=>typeof t==="string")||!Array.isArray(d.scores)||d.scores.length!==n||!d.scores.every(ok)||!Array.isArray(d.used)||!d.used.every(w=>typeof w==="string"))return false;
    if(!ok(d.turn)||!(d.rounds>=1&&d.rounds<=9)||!(d.secs>=5&&d.secs<=600)||d.turn>=n*d.rounds)return false;
    // the current word is the last one added to the used list
    const w=d.used[d.used.length-1], c=Object.keys(WORDS).find(k=>WORDS[k].includes(w));
    let screen=d.screen;
    if(screen==="verdict"&&!c)screen="handover";
    if(screen==="secret"||screen==="draw")screen="handover";
    S.teams=d.teams.slice();S.scores=d.scores.slice();S.turn=d.turn;S.rounds=d.rounds;S.secs=d.secs;S.left=d.secs;
    S.used=new Set(d.used);S.skipsLeft=d.skipsLeft===0?0:1;S.reveal=false;S.paused=false;
    S.word=c?{c,w}:null;S.screen=screen;
    S._night=d._night;
    keepAwake();
    return true;
  }catch(e){return false}
}
function showRules(){
  const r=$("rules");
  $("rules-local").hidden=ON.active;$("rules-online").hidden=!ON.active;$("rules-note").hidden=ON.active;
  r.hidden=false;$("rules-ok").focus({preventScroll:true});
}
function hideRules(){
  const r=$("rules");if(r.hidden)return;r.hidden=true;
  const b=[...document.querySelectorAll('[data-hubkit="menu"]')].find(x=>x.offsetParent!==null||getComputedStyle(x).position==="fixed");
  if(b)b.focus({preventScroll:true});
}
function endGame(){clearInterval(S.tick);go(S.turn>0?"final":"setup")}
function paint(){
  if(S.screen!=="draw")return;
  const tm=$("tm"); if(!tm)return;
  tm.textContent=`${Math.floor(S.left/60)}:${String(S.left%60).padStart(2,"0")}`;
  tm.classList.toggle("low",S.left<=10);
  $("app").classList.toggle("clock-paused",S.paused);
  $("bar").classList.toggle("low",S.left<=10);
  $("bar").style.width=(S.left/S.secs*100)+"%";
  const wb=$("wb");
  wb.className="wordbox "+(S.reveal?"":"hidden-word");
  wb.innerHTML=S.reveal?`<span class="cat">${esc(S.word.c)}</span><span class="word">${esc(S.word.w)}</span>`:`<span class="word">Word hidden</span>`;
}
function on(id,fn){const e=$(id);if(e)e.onclick=fn}
function bind(){
  S.teams.forEach((_,i)=>{const e=$("t"+i);if(e)e.oninput=()=>{S.teams[i]=e.value||`Team ${i+1}`}});
  on("addT",()=>{S.teams.push(`Team ${["One","Two","Three","Four"][S.teams.length]}`);render(true)});
  on("delT",()=>{S.teams.pop();render(true)});
  document.querySelectorAll("[data-secs]").forEach(b=>b.onclick=()=>{S.secs=+b.dataset.secs;render(true)});
  document.querySelectorAll("[data-rounds]").forEach(b=>b.onclick=()=>{S.rounds=+b.dataset.rounds;render(true)});
  on("start",startGame); on("ready",beginDraw);
  on("reveal-word",()=>{S.reveal=!S.reveal;render();$("reveal-word").focus({preventScroll:true})});
  on("hide",()=>{S.reveal=false;render()});
  on("go",()=>{if(S.reveal){sfx("tap");S.reveal=false;startTimer()}});
  on("skip",skip);
  on("peek",()=>{S.reveal=!S.reveal;render()});
  on("pause",()=>{
    if(S.paused){S.end=Date.now()+S.left*1000;S.paused=false}else{S.paused=true}
    render();
  });
  on("got",()=>{clearInterval(S.tick);sfx("score");verdict(true)});
  on("yes",()=>{sfx("score");verdict(true)}); on("no",()=>verdict(false));
  on("next",()=>go("handover"));
  on("again",()=>{clearSave();startGame()}); on("setup",()=>{clearSave();go("setup")});
  document.querySelectorAll("[data-osecs]").forEach(b=>b.onclick=()=>{O.secs=+b.dataset.osecs;render(true)});
  document.querySelectorAll("[data-orounds]").forEach(b=>b.onclick=()=>{O.rounds=+b.dataset.orounds;render(true)});
  on("ocreate",openOnlineLobby); on("ojoin",openOnlineLobby);
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&(S.screen==="draw"||ON.active))keepAwake();if(!document.hidden&&ON.active)onTick()});
$("rules-ok").onclick=hideRules;
$("rules").addEventListener("click",e=>{if(e.target===$("rules"))hideRules()});
document.addEventListener("keydown",e=>{
  if($("rules").hidden)return;
  if(e.key==="Escape"){e.preventDefault();hideRules()}
  else if(e.key==="Tab"){e.preventDefault();$("rules-ok").focus()}
});
/* ---------- Online play (each player on their own phone) ----------
   Spec: docs/online-phase2.md section C with R2 and R5 (amendments win), patterns from docs/online-splendor.md.
   Everyone rebuilds the whole game from the room (seed, seats, options) and each player's own record list, so all phones agree.
   Records (each in its author's own `moves` list; a record that does not fit the rules is ignored by every client):
     drawer of turn t:  {a:"start",turn,at}  {a:"skip",turn}  {a:"correct",turn,uid,gi}  {a:"end",turn,why:"guessed"|"time"}
     any guesser:       {a:"guess",turn,at,text}            (text <= 40; gi = index of that guess in the guesser's own list)
   Only the drawer of turn t (order[t % n]) counts for start/skip/correct/end. `correct` must point at a real guess whose text
   matches the word. The word comes from a seeded shuffled deck whose pointer advances on every valid start and skip.
   Drawing = append-only chunk docs rooms/{code}/draw/{uid}_{turn}_{i} = {t,i,d}; d is a ";"-joined list of items:
     s<c>.<w>   new stroke: colour 0-5 (6 = eraser), width 0-2
     p<x>,<y> <dx>,<dy> ...   points 0-1000 on each axis; the first is absolute, the others are deltas (appended to the open stroke)
     x   clear      u   undo the last stroke
   Nothing here touches local storage; the word is never written to the DOM or the console on a guesser's phone (guessers only keep
   a hash of it; accepted: the seed technically lets a determined player derive it).
   The one-phone game above is untouched. */
const OL={game:"sketch",name:"Pictionary",accent:"#ffd23f"};
const O={secs:60,rounds:1};
const PEN=["#18212d","#d64545","#f08c1a","#1f9d55","#2f6fd6","#8a4fd0"], PEN_NAMES=["Black","Red","Orange","Green","Blue","Purple"];
const WID=[5,11,22], ERS=2.6, CHUNK_MS=800, CHUNK_MAX=30000;
const ON={active:false,code:null,uid:null,room:null,players:{},D:null,mine:{moves:[]},unsub:null,token:0,first:true,fatal:"",err:null,
  vkey:"",vsig:"",tick:0,lastSec:-1,buzzed:-1,seen:{},seenT:-1,seenInit:false,gnote:null,flag:false,badge:false,rec:false,wrote:false,note:""};
const DRW={board:null,out:null,nextI:0,sent:new Set(),got:new Set(),ready:false,timer:0,unsub:null,t:-1,drawer:null,mine:false,pen:0,size:1,tail:null,
  q:[],applied:[],tailT:0,raf:0,initial:true,wsig:"",fsig:"",ro:null,down:false};

const onlineAvailable=()=>{try{return !!(window.HubOnline&&window.HubLobby&&HubOnline.available())}catch(e){return false}};
const fmtCode=c=>c&&c.length===6?c.slice(0,3)+" "+c.slice(3):(c||"");
const remaining=(D,c)=>clamp(c.at+D.secs*1000-Date.now(),0,D.secs*1000);
const roundOf=(D,t)=>Math.min(D.rounds,Math.floor(t/D.n)+1);

/* ----- canvas model: strokes drawn on a 4:3 white sheet, points 0-1000 on each axis ----- */
function newBoard(cv){
  const b={cv,ctx:cv.getContext("2d"),strokes:[],open:null,W:0,H:0,dpr:1};
  const ink=s=>s.c===6?"#fff":PEN[s.c];
  const lw=s=>WID[s.w]*(s.c===6?ERS:1)*b.W/1000;
  b.fit=(bw,bh)=>{
    const W=Math.max(60,Math.floor(Math.min(bw,bh*4/3))), H=Math.floor(W*3/4), dpr=Math.min(2,window.devicePixelRatio||1);
    if(W===b.W&&H===b.H&&dpr===b.dpr)return;
    b.W=W;b.H=H;b.dpr=dpr;cv.style.width=W+"px";cv.style.height=H+"px";cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    b.ctx.setTransform(dpr,0,0,dpr,0,0);b.redraw();
  };
  b.redraw=()=>{
    const c=b.ctx;c.fillStyle="#fff";c.fillRect(0,0,b.W,b.H);c.lineCap="round";c.lineJoin="round";
    for(const s of b.strokes){
      if(!s.pts.length)continue;
      c.strokeStyle=c.fillStyle=ink(s);c.lineWidth=lw(s);
      if(s.pts.length===1){c.beginPath();c.arc(s.pts[0][0]*b.W/1000,s.pts[0][1]*b.H/1000,lw(s)/2,0,6.2832);c.fill();continue}
      c.beginPath();c.moveTo(s.pts[0][0]*b.W/1000,s.pts[0][1]*b.H/1000);
      for(let k=1;k<s.pts.length;k++)c.lineTo(s.pts[k][0]*b.W/1000,s.pts[k][1]*b.H/1000);
      c.stroke();
    }
  };
  b.begin=(c,w)=>{b.open={c,w,pts:[]};b.strokes.push(b.open);if(b.strokes.length>400)b.strokes.shift()};
  b.add=(x,y)=>{
    const s=b.open;if(!s)return;
    const c=b.ctx,k=s.pts.length;s.pts.push([x,y]);
    c.lineCap="round";c.lineJoin="round";c.strokeStyle=c.fillStyle=ink(s);c.lineWidth=lw(s);
    if(!k){c.beginPath();c.arc(x*b.W/1000,y*b.H/1000,lw(s)/2,0,6.2832);c.fill()}
    else{const p=s.pts[k-1];c.beginPath();c.moveTo(p[0]*b.W/1000,p[1]*b.H/1000);c.lineTo(x*b.W/1000,y*b.H/1000);c.stroke()}
  };
  b.undo=()=>{b.strokes.pop();b.open=null;b.redraw()};
  b.clear=()=>{b.strokes=[];b.open=null;b.redraw()};
  b.apply=op=>{
    if(op.k==="s")b.begin(op.c,op.w);else if(op.k==="p")b.add(op.x,op.y);
    else if(op.k==="x")b.clear();else if(op.k==="u")b.undo();
  };
  return b;
}
/* ----- chunk encoding ----- */
const encPts=pts=>pts.map((p,i)=>i?`${p[0]-pts[i-1][0]},${p[1]-pts[i-1][1]}`:`${p[0]},${p[1]}`).join(" ");
function newOut(){
  const o={items:[],buf:[]};
  o.fl=()=>{if(o.buf.length){o.items.push("p"+encPts(o.buf));o.buf=[]}};
  o.s=(c,w)=>{o.fl();o.items.push(`s${c}.${w}`)};
  o.pt=(x,y)=>{o.buf.push([x,y]);if(o.buf.length>=1500)o.fl()};
  o.x=()=>{o.fl();o.items.push("x")};
  o.u=()=>{o.fl();o.items.push("u")};
  // pending items as chunk strings, each kept well under the 40,000 character limit
  o.take=()=>{
    o.fl();const res=[];let cur=[],len=0;
    for(const it of o.items){if(len+it.length+1>CHUNK_MAX&&cur.length){res.push(cur.join(";"));cur=[];len=0}cur.push(it);len+=it.length+1}
    if(cur.length)res.push(cur.join(";"));o.items=[];return res;
  };
  return o;
}
function parseChunk(d){
  const ops=[];if(typeof d!=="string")return ops;
  for(const it of d.split(";").slice(0,3000)){
    const k=it[0];
    if(k==="s"){const m=/^s([0-6])\.([0-2])$/.exec(it);if(m)ops.push({k:"s",c:+m[1],w:+m[2]})}
    else if((k==="x"||k==="u")&&it.length===1)ops.push({k});
    else if(k==="p"){let x=0,y=0,first=true;
      for(const pr of it.slice(1).split(" ")){const m=/^(-?\d{1,5}),(-?\d{1,5})$/.exec(pr);if(!m)continue;
        if(first){x=+m[1];y=+m[2];first=false}else{x+=+m[1];y+=+m[2]}
        ops.push({k:"p",x:clamp(x,0,1000),y:clamp(y,0,1000)});if(ops.length>20000)return ops}}
  }
  return ops;
}

/* ----- the room, the replay and who does what ----- */
const mineMoves=()=>{const d=ON.players[ON.uid]||{},sm=Array.isArray(d.moves)?d.moves:[];return ON.mine.moves.length>sm.length?ON.mine.moves:sm};
const summary=()=>({phase:ON.D&&ON.D.over?"over":"play",next:ON.D&&!ON.D.over&&ON.D.cur?ON.D.cur.drawer:null});
function flush(){
  if(ON.blocked)return;
  const code=ON.code,tok=ON.token;
  HubOnline.rooms.writeMine(code,{moves:mineMoves(),turn:summary()}).then(()=>{},e=>{
    if(tok!==ON.token||!ON.active)return;
    if(e&&e.code==="denied"){ON.mine={moves:[]};recompute();showView()}
  });
}
// Appends my records, shows the result at once (the overlay) and sends them.
function push(...recs){
  if(ON.blocked)return;
  ON.mine.moves=[...mineMoves(),...recs];
  recompute();flush();showView();
}
function recompute(){
  const movesOf=u=>u===ON.uid?mineMoves():((ON.players[u]||{}).moves||[]);
  const prev=ON.D, D=replayOnline(ON.room,movesOf,ON.uid);
  if(!D||D.me<0){ON.D=null;ON.fatal="This game can't be shown.";return}
  ON.D=D;ON.fatal="";
  if(!prev){return}
  if(D.done.length>prev.done.length){
    const last=D.done[D.done.length-1];
    if(last.why==="guessed")sfx("score");else if(ON.buzzed!==last.t){ON.buzzed=last.t;sfx("buzzer")}
  }
  if(D.over&&!prev.over)sfx("win");
  const c=D.cur,pc=prev.cur;
  if(c&&c.drawer===ON.uid&&!c.started&&!(pc&&pc.t===c.t&&pc.drawer===ON.uid&&!pc.started)){sfx("chime");ON.flag=true}   // it is my turn to draw
  if(!c||c.drawer!==ON.uid||c.started)ON.flag=false;
}
function recordIfOver(){
  const D=ON.D;
  if(!ON.active||!D||!D.over||ON.rec)return;
  ON.rec=true;
  if(ON.players[ON.uid]&&(ON.players[ON.uid].turn||{}).phase!=="over")flush();   // my own summary says "over" too
  try{const max=Math.max(...Object.values(D.scores)),mine=D.scores[ON.uid];
    if(HubKit.recordResult)HubKit.recordResult(OL.game,`${ON.uid}:${ON.code}`,{won:mine===max,score:mine})}catch(e){}
}
function signals(){
  const on=ON.active&&ON.flag;
  const t=on?"Your turn to draw · Pictionary":ON.title;
  if(document.title!==t)document.title=t;
  if(on!==ON.badge){ON.badge=on;try{if(HubKit.setBadge)HubKit.setBadge(on)}catch(e){}}
}
// Every room snapshot is checked before replay, including deferred local drafts.
function roomSnapshotAllowed(snap) {
  const compatibility = snap.room && HubOnline.rooms.compatibility ? HubOnline.rooms.compatibility(snap.room) : {ok:true};
  const terminal = snap.room && ['cancelled','ended'].includes(snap.room.status);
  const sessionOK = !ON.session || ON.session.update(snap);
  ON.blocked = !!terminal || !compatibility.ok || !sessionOK;
  if(ON.blocked) {
    ON.deferred=null;
    clearInterval(ON.tick);ON.tick=0;teardownPlay();
    if(!ON.session) {
      const message=compatibility.ok ? 'This room has ended. Return to the hub to start another game.' : compatibility.message;
      ON.fatal=message;showView();
    }
    return false;
  }
  return true;
}
function onSnap(snap){
  if(!roomSnapshotAllowed(snap)) return;
  if(snap.error){
    ON.err=snap.error;
    if(!ON.D){ON.fatal=snap.error.code==="offline"?"You're offline. Reconnect and try again.":"Couldn't reach the game server.";showView()}
    return;
  }
  const hadErr=!!ON.err;ON.err=null;
  if(!snap.room){if(!ON.D){ON.fatal="No game with that code.";showView()}return}
  ON.room=snap.room;ON.players=snap.players||{};
  const code=ON.code;
  if(!(ON.room.seats&&ON.room.seats[ON.uid])){leaveOnline();HubLobby.notSeated(code,{gameName:OL.name,accent:OL.accent});return}
  if(ON.room.status!=="playing"){leaveOnline();enterRoom(code);return}
  const first=!ON.D;
  recompute();
  if(!ON.D){showView();return}
  if(first||hadErr)ON.vsig="";
  if(!ON.wrote){ON.wrote=true;if(!ON.players[ON.uid]&&!ON.mine.moves.length)flush()}   // the hub reads the turn summary from my own doc
  showView();
  recordIfOver();signals();
}
// Drawer duties: confirm the first matching guess, or end the turn when the time is up (a second of grace for slow networks).
function drive(){
  if(ON.blocked)return;
  const D=ON.D,c=D&&D.cur;
  if(!ON.active||!D||D.over||!c||!c.started||c.drawer!==ON.uid)return;
  if(ON.seenT!==c.t){ON.seen={};ON.seenT=c.t;ON.seenInit=false}
  const now=Date.now(), deadline=c.at+D.secs*1000+1000;
  const ms=c.guesses.filter(g=>g.match);
  for(const g of ms){const k=g.uid+"#"+g.gi;if(!(k in ON.seen))ON.seen[k]=ON.seenInit?now:null}
  ON.seenInit=true;
  const ok=ms.filter(g=>{const s=ON.seen[g.uid+"#"+g.gi];return(s!=null?s:g.at)<=deadline});
  if(ok.length){
    ok.sort((a,b)=>{const sa=ON.seen[a.uid+"#"+a.gi],sb=ON.seen[b.uid+"#"+b.gi];
      return(sa==null?0:1)-(sb==null?0:1)||(sa==null?a.at-b.at:sa-sb)||a.at-b.at});
    const g=ok[0];pushChunks();
    push({a:"correct",turn:c.t,uid:g.uid,gi:g.gi},{a:"end",turn:c.t,why:"guessed"});
    return;
  }
  if(now>=deadline){pushChunks();push({a:"end",turn:c.t,why:"time"})}
}
function onTick(){
  if(ON.blocked)return;
  const D=ON.D,c=D&&D.cur;
  if(!ON.active||!D||D.over||!c||!c.started)return;
  const rem=remaining(D,c),sec=Math.ceil(rem/1000);
  paintTimer(rem);
  if(sec!==ON.lastSec){
    const was=ON.lastSec;ON.lastSec=sec;
    if(sec>=1&&sec<=10)sfx("tick");
    if(sec===0&&was>0&&ON.buzzed!==c.t){ON.buzzed=c.t;sfx("buzzer")}
  }
  drive();
}
function paintTimer(rem){
  const D=ON.D,tm=$("tm");if(!tm||!D)return;
  const s=Math.ceil(rem/1000);
  tm.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  tm.classList.toggle("low",s<=10);
  const b=$("bar");if(b)b.style.width=(rem/(D.secs*1000)*100)+"%";
}

/* ----- entering and leaving ----- */
function openOnlineLobby(){
  S.notice="";
  HubLobby.openCreateJoin({game:OL.game,gameName:OL.name,seatOptions:[2,3,4,5,6,7,8],opts:()=>({secs:O.secs,rounds:O.rounds}),accent:OL.accent,onRoom:enterRoom});
}
function enterRoom(code){
  S.notice="";
  try{history.replaceState(null,"",`${location.pathname}?room=${code}`)}catch(e){}
  HubLobby.enter(code,{game:OL.game,gameName:OL.name,minToStart:2,accent:OL.accent,onPlay:c=>beginOnline(c.code,c.uid),onExit:exitLobby});
}
function exitLobby(){
  try{history.replaceState(null,"",location.pathname)}catch(e){}
  if(!ON.active)render(true);
}
function startOnline(){
  ON.title=document.title;
  const rc=new URLSearchParams(location.search).get("room");
  if(rc==null||rc==="")return false;
  const code=rc.replace(/\D/g,""), valid=/^[1-9][0-9]{5}$/.test(code);
  if(valid&&onlineAvailable()){render(true);enterRoom(code);return true}
  S.notice=valid?"Online play is not available right now. You can still play on this device.":"That link doesn't hold a valid six-digit game code.";
  try{history.replaceState(null,"",location.pathname)}catch(e){}
  return false;
}
function stopWatch(){
  if(ON.session){ON.session.close();ON.session=null;}
  ON.blocked=false;
  ON.token++;
  if(ON.unsub){try{ON.unsub()}catch(e){}ON.unsub=null}
}
function beginOnline(code,uid){
  stopWatch();teardownPlay();
  Object.assign(ON,{active:true,code,uid,room:null,players:{},D:null,mine:{moves:[]},first:true,fatal:"",err:null,vkey:"",vsig:"",lastSec:-1,buzzed:-1,seen:{},seenT:-1,
    gnote:null,flag:false,badge:false,rec:false,wrote:false,note:""});
  S.notice="";keepAwake();
  try{history.replaceState(null,"",`${location.pathname}?room=${code}`)}catch(e){}
  clearInterval(ON.tick);ON.tick=setInterval(onTick,250);
  showView();
  const tok=ON.token;
  if(ON.session){ON.session.close();ON.session=null;}
  if(window.HubSession) ON.session=HubSession.mount({code:ON.code,onExit:leaveOnline,onRestart:code=>{leaveOnline();enterRoom(code);}});
  ON.unsub=HubOnline.rooms.watch(code,snap=>{if(tok===ON.token)onSnap(snap)});
}
function leaveOnline(){
  stopWatch();teardownPlay();clearInterval(ON.tick);ON.tick=0;
  const was=ON.active;
  Object.assign(ON,{active:false,code:null,uid:null,room:null,players:{},D:null,mine:{moves:[]},fatal:"",err:null,vkey:"",vsig:"",flag:false,badge:false});
  try{document.title=ON.title;if(HubKit.setBadge)HubKit.setBadge(false)}catch(e){}
  try{history.replaceState(null,"",location.pathname)}catch(e){}
  try{HubLobby.close()}catch(e){}
  try{S.wake&&S.wake.release&&S.wake.release();S.wake=null}catch(e){}
  S.screen="setup";
  if(was)render(true);
}
/* ----- views ----- */
const players=D=>D.order.map(u=>({u,name:D.names[u],color:D.colors[u],pts:D.scores[u]}));
function oScoreList(D,nextUid){
  return `<div class="score">${players(D).map(p=>`<div class="${p.u===nextUid?'on':''}"><span class="dot" style="background:${p.color}"></span><span class="n">${esc(p.name)}${p.u===ON.uid?' (you)':''}</span>${p.u===nextUid?'<span class="tag">draws next</span>':''}<span class="p">${p.pts}</span></div>`).join("")}</div>`;
}
function oStatus(D,t){return `<div class="top"><span class="label">Round ${roundOf(D,t)} of ${D.rounds}</span>${HubKit.buttonHTML()}</div>`}
function resultCard(D,last){
  const g=last.guesser;
  return `<div class="wordbox"><span class="cat">${g?esc(D.names[g])+' guessed it!':"Time's up"}</span><span class="word">${esc(last.w)}</span>
    <span class="cat">${g?`+2 ${esc(D.names[g])} · +1 ${esc(D.names[last.drawer])}`:'No points this turn'}</span></div>`;
}
function viewKey(){
  const D=ON.D;
  if(ON.fatal||!D)return "conn";
  if(D.over)return "over";
  return D.cur.started?"play:"+D.cur.t:"inter:"+D.cur.t;
}
function showView(){
  if(!ON.active)return;
  const key=viewKey();
  if(key!==ON.vkey){teardownPlay();ON.vkey=key;ON.vsig="";buildStatic(key)}
  if(key.startsWith("play:"))paintPlay();
  else{
    const sig=JSON.stringify([key,ON.fatal,ON.D&&ON.D.scores,ON.D&&ON.D.done.length]);
    if(sig!==ON.vsig){ON.vsig=sig;buildStatic(key)}
  }
  signals();
}
function buildStatic(key){
  const D=ON.D,a=$("app");let h="";
  document.documentElement.classList.toggle("noscroll",key.startsWith("play:"));
  try{HubKit.setFloating(key==="over"||key==="conn")}catch(e){}
  if(key==="conn"){
    h=`<div class="fl"></div><div class="stage big"><span class="label">Online game ${esc(fmtCode(ON.code))}</span>
      <h2 role="status">${esc(ON.fatal||"Connecting to the game server…")}</h2>
      <div class="row">${ON.fatal?'<button class="primary" data-oa="retry">Try again</button>':''}<button data-oa="leave">Leave</button></div></div>`;
  }
  else if(key==="over"){
    const list=players(D).sort((x,y)=>y.pts-x.pts), max=list[0].pts, w=list.filter(p=>p.pts===max);
    h=`<div class="fl"></div><div class="stage big"><span class="label">Final</span><h1>${w.length>1?"It's a tie":esc(w[0].name)+" wins"}</h1>
      ${w.length>1?`<p class="muted">${w.map(p=>esc(p.name)).join(" and ")}</p>`:''}
      <div class="score">${list.map(p=>`<div class="${p.pts===max?'on':''}"><span class="dot" style="background:${p.color}"></span><span class="n">${esc(p.name)}${p.u===ON.uid?' (you)':''}</span><span class="p">${p.pts}</span></div>`).join("")}</div>
      <div class="card" style="text-align:left"><span class="label">Turn by turn</span><ol class="recap">${D.done.map(r=>`<li>${esc(D.names[r.drawer])} drew “${esc(r.w)}”: ${r.guesser?esc(D.names[r.guesser])+' got it':'nobody got it'}</li>`).join("")}</ol></div></div>
      <button class="primary" data-oa="leave">Back to start</button>`;
  }
  else if(key.startsWith("inter:")){
    const c=D.cur,mine=c.drawer===ON.uid,last=D.done[D.done.length-1],name=esc(D.names[c.drawer]);
    h=`${oStatus(D,c.t)}<div class="stage big">
      ${last?resultCard(D,last):`<span class="label">Get ready</span><h2>${D.n} players, ${D.total} turns</h2>`}
      ${oScoreList(D,c.drawer)}
      <p class="muted">${mine?'It is your turn to draw.':`Next: ${name}`}</p></div>
      ${mine?'<button class="primary" data-oa="start">Start drawing</button>':`<p class="muted big" role="status">Waiting for ${name} to start drawing…</p>`}`;
  }
  else if(key.startsWith("play:")){
    h=playHTML();
  }
  a.dataset.screen=key.startsWith("play:")?"online-play":"online-"+key.split(":")[0];
  a.innerHTML=h;
  a.onclick=onAppClick;
  if(key.startsWith("play:"))setupPlay();
}
function onAppClick(e){
  const b=e.target.closest&&e.target.closest("[data-oa]");
  if(!b||b.disabled)return;
  const c=ON.D&&ON.D.cur,act=b.dataset.oa;
  if(act==="leave")leaveOnline();
  else if(act==="retry"){beginOnline(ON.code,ON.uid)}
  else if(act==="start"){if(c&&c.drawer===ON.uid&&!c.started){sfx("tap");push({a:"start",turn:c.t,at:Date.now()})}}
  else if(act==="skip"){if(c&&c.started&&c.drawer===ON.uid&&!c.skipped&&DRW.ready){sfx("flip");DRW.board.clear();DRW.out.x();push({a:"skip",turn:c.t})}}
  else if(act==="pen"){DRW.pen=+b.dataset.v;paintTools()}
  else if(act==="size"){DRW.size=+b.dataset.v;paintTools()}
  else if(act==="undo"){if(DRW.board&&DRW.board.strokes.length){DRW.board.undo();DRW.out.u()}}
  else if(act==="clear"){if(DRW.board&&DRW.board.strokes.length){DRW.board.clear();DRW.out.x()}}
}
function playHTML(){
  const mine=ON.D.cur.drawer===ON.uid;
  return `<div class="play ${mine?'is-drawer':'is-guesser'}" id="play">
    <div class="phead"><div class="pwho"><span class="label" id="plab"></span><b id="pname"></b></div><span class="ptimer" id="tm" role="timer" aria-label="Time left">0:00</span>${HubKit.buttonHTML()}</div>
    <div class="bar"><i id="bar"></i></div>
    ${mine?'<div class="pword" id="pword"></div>':'<div class="pword sk-guess-prompt"><div class="pw"><span class="cat">Watch the sketch</span><span class="word">Any bright ideas?</span><span class="tiny">First correct guess scores 2 points.</span></div></div>'}
    <div class="cbox" id="cbox"><div class="cwrap"><canvas id="cv" aria-label="${mine?'Your drawing':'The drawing'}"></canvas></div></div>
    ${mine?`<div class="tools"><span class="label sk-tool-label">Your pencil case</span>
      <div class="trow" role="group" aria-label="Pen colour and eraser">${PEN.map((c,i)=>`<button type="button" class="sw" data-oa="pen" data-v="${i}" style="--c:${c}" aria-label="${PEN_NAMES[i]}" aria-pressed="false"></button>`).join("")}<button type="button" class="sw er" data-oa="pen" data-v="6" aria-label="Eraser" aria-pressed="false">Erase</button></div>
      <div class="trow"><span class="trow" role="group" aria-label="Pen size" style="flex:3">${[6,12,20].map((d,i)=>`<button type="button" class="tb" data-oa="size" data-v="${i}" aria-label="${['Fine','Medium','Thick'][i]} pen" title="${['Fine','Medium','Thick'][i]} pen" aria-pressed="false"><i style="width:${d}px;height:${d}px"></i></button>`).join("")}</span>
        <button type="button" class="tb" data-oa="undo">Undo</button><button type="button" class="tb" data-oa="clear">Clear</button></div></div>`:''}
    <div class="sk-feed-wrap"><span class="label sk-tool-label">The guessing gallery</span><div class="feed" id="feed" aria-live="polite"></div></div>
    ${mine?'':`<form class="gform" id="gform" autocomplete="off"><input id="gi" type="text" maxlength="40" enterkeyhint="send" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Type your guess" aria-label="Your guess"><button class="primary" type="submit">Guess</button></form>`}
  </div>`;
}
function paintTools(){
  document.querySelectorAll("[data-oa=pen]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.v===DRW.pen)));
  document.querySelectorAll("[data-oa=size]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.v===DRW.size)));
}
function paintPlay(){
  const D=ON.D,c=D&&D.cur;if(!c||!c.started||!$("play"))return;
  const mine=c.drawer===ON.uid;
  $("plab").textContent=`Round ${roundOf(D,c.t)} of ${D.rounds} · turn ${c.t+1} of ${D.total}`;
  $("pname").textContent=mine?"You are drawing":`${D.names[c.drawer]} is drawing`;
  paintTimer(remaining(D,c));
  if(mine){
    const sig=c.word.w+"|"+c.skipped;
    if(sig!==DRW.wsig){DRW.wsig=sig;$("pword").innerHTML=`<div class="pw"><span class="cat">${esc(c.word.c)}</span><span class="word">${esc(c.word.w)}</span></div><button type="button" data-oa="skip" ${c.skipped?'disabled':''}>${c.skipped?'No skips left':'Skip word'}</button>`}
  }
  // the feed: wrong guesses only (a matching guess is hidden at once, on every phone)
  const lines=c.guesses.filter(g=>!g.match).slice(-4).map(g=>`<div class="${g.uid===ON.uid?'me':''}"><b>${esc(D.names[g.uid])}</b> ${esc(g.text)}</div>`);
  if(!mine&&ON.gnote&&ON.gnote.t===c.t)lines.push(`<div class="ok">${esc(ON.gnote.msg)}</div>`);
  if(!lines.length)lines.push(mine?'<div class="me">Your audience is thinking…</div>':'<div class="me">See something? Make a guess below.</div>');
  const f=lines.join("");
  if(f!==DRW.fsig){DRW.fsig=f;$("feed").innerHTML=f}
}

/* ----- the drawing: drawer's canvas, viewers' canvas ----- */
function setupPlay(){
  const c=ON.D.cur,mine=c.drawer===ON.uid,cv=$("cv");
  Object.assign(DRW,{board:newBoard(cv),t:c.t,drawer:c.drawer,mine,sent:new Set(),got:new Set(),ready:!mine,nextI:0,q:[],applied:[],tailT:0,initial:true,wsig:"",fsig:"",down:false,tail:null});
  if(mine){DRW.pen=0;DRW.size=1;DRW.out=newOut()}
  const box=$("cbox"),lay=()=>{DRW.board&&DRW.board.fit(box.clientWidth-14,box.clientHeight-14)};
  lay();
  if(window.ResizeObserver){DRW.ro=new ResizeObserver(lay);DRW.ro.observe(box)}
  if(mine){
    DRW.timer=setInterval(pushChunks,CHUNK_MS);
    bindDrawer(cv);paintTools();
    DRW.unsub=HubOnline.draw.watch(ON.code,c.drawer,c.t,ownChunks);
  }else{
    bindGuess();
    DRW.unsub=HubOnline.draw.watch(ON.code,c.drawer,c.t,viewChunks);
  }
  syncVV();
  ON.lastSec=-1;
  paintPlay();
}
function teardownPlay(){
  if(DRW.mine&&DRW.out&&ON.active&&DRW.t>=0){try{pushChunks()}catch(e){}}
  clearInterval(DRW.timer);DRW.timer=0;
  if(DRW.unsub){try{DRW.unsub()}catch(e){}DRW.unsub=null}
  if(DRW.ro){try{DRW.ro.disconnect()}catch(e){}DRW.ro=null}
  cancelAnimationFrame(DRW.raf);DRW.raf=0;DRW.q=[];DRW.board=null;DRW.out=null;DRW.t=-1;DRW.mine=false;DRW.ready=false;
  document.documentElement.classList.remove("noscroll");
}
function syncVV(){
  const vv=window.visualViewport,r=document.documentElement.style;
  const height=vv?vv.height:window.innerHeight;
  r.setProperty("--vvh",height+"px");
  r.setProperty("--vvt",(vv?vv.offsetTop:0)+"px");
  // A phone keyboard shrinks the visual viewport without changing CSS media queries.
  document.documentElement.classList.toggle("compact-play",height<600);
}
if(window.visualViewport){visualViewport.addEventListener("resize",syncVV);visualViewport.addEventListener("scroll",syncVV)}
window.addEventListener("resize",syncVV);
syncVV();

function pushChunks(){
  if(ON.blocked)return;
  if(!DRW.out||!DRW.mine||!ON.active)return;
  for(const d of DRW.out.take()){
    const i=DRW.nextI++,t=DRW.t,id=`${ON.uid}_${t}_${i}`;
    DRW.sent.add(id);sendChunk(t,i,d,0);
  }
}
function sendChunk(t,i,d,tries){
  if(ON.blocked)return;
  const code=ON.code,tok=ON.token;
  HubOnline.draw.add(code,t,i,d).catch(e=>{
    if(tok!==ON.token||!ON.active||tries>=4||(e&&e.code==="invalid"))return;
    setTimeout(()=>{if(tok===ON.token&&ON.active)sendChunk(t,i,d,tries+1)},1500*(tries+1));
  });
}
function ownChunks(list,err){          // after a reload: rebuild my canvas from my own chunks, then continue from max(i)+1
  if(!DRW.mine)return;
  if(!err)for(const ch of list){
    DRW.nextI=Math.max(DRW.nextI,ch.i+1);
    if(DRW.sent.has(ch.id)||DRW.got.has(ch.id))continue;
    DRW.got.add(ch.id);
    for(const op of parseChunk(ch.d))DRW.board.apply(op);
  }
  if(!DRW.ready)DRW.board.open=null;
  DRW.ready=true;
}
function viewChunks(list,err){
  if(DRW.mine||!DRW.board||err)return;
  const same=DRW.applied.length<=list.length&&DRW.applied.every((id,k)=>list[k].id===id);
  if(!same){DRW.board.clear();DRW.q=[];DRW.applied=[];DRW.tailT=0;DRW.initial=true}
  const now=performance.now();
  for(const ch of list.slice(DRW.applied.length)){
    DRW.applied.push(ch.id);
    const ops=parseChunk(ch.d);
    if(DRW.initial){ops.forEach(op=>DRW.board.apply(op));continue}
    if(DRW.tailT-now>1500){DRW.q.forEach(o=>DRW.board.apply(o.op));DRW.q=[];DRW.tailT=0}   // far behind: catch up at once
    const at=Math.max(now,DRW.tailT),step=ops.length?CHUNK_MS*0.9/ops.length:0;
    ops.forEach((op,j)=>DRW.q.push({t:at+j*step,op}));
    DRW.tailT=at+CHUNK_MS;
  }
  DRW.initial=false;
  if(DRW.q.length&&!DRW.raf)DRW.raf=requestAnimationFrame(animate);
}
function animate(){
  DRW.raf=0;
  const now=performance.now();
  while(DRW.q.length&&DRW.q[0].t<=now&&DRW.board)DRW.board.apply(DRW.q.shift().op);
  if(DRW.q.length&&DRW.board)DRW.raf=requestAnimationFrame(animate);
}
function bindDrawer(cv){
  const pos=e=>{const r=cv.getBoundingClientRect();return[clamp(Math.round((e.clientX-r.left)/r.width*1000),0,1000),clamp(Math.round((e.clientY-r.top)/r.height*1000),0,1000)]};
  let lx=-9,ly=-9;
  const add=(x,y,force)=>{
    if(!force&&Math.abs(x-lx)<2&&Math.abs(y-ly)<2){DRW.tail=[x,y];return}
    DRW.board.add(x,y);DRW.out.pt(x,y);lx=x;ly=y;DRW.tail=null;
  };
  cv.addEventListener("pointerdown",e=>{
    if(!DRW.ready||!DRW.mine||DRW.down||(e.pointerType==="mouse"&&e.button!==0))return;
    e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}
    DRW.down=true;DRW.board.begin(DRW.pen,DRW.size);DRW.out.s(DRW.pen,DRW.size);
    const[x,y]=pos(e);lx=-9;ly=-9;add(x,y,true);
  });
  cv.addEventListener("pointermove",e=>{
    if(!DRW.down)return;
    const evs=e.getCoalescedEvents?e.getCoalescedEvents():[];
    for(const ev of(evs.length?evs:[e])){const[x,y]=pos(ev);add(x,y)}
  });
  const up=()=>{
    if(!DRW.down)return;
    DRW.down=false;
    if(DRW.tail){add(DRW.tail[0],DRW.tail[1],true)}
  };
  ["pointerup","pointercancel","lostpointercapture"].forEach(n=>cv.addEventListener(n,up));
  cv.addEventListener("contextmenu",e=>e.preventDefault());
}
function bindGuess(){
  const f=$("gform"),inp=$("gi");
  f.onsubmit=e=>{
    e.preventDefault();
    const c=ON.D&&ON.D.cur;if(!c||!c.started||c.drawer===ON.uid)return;
    const text=inp.value.replace(/\s+/g," ").trim().slice(0,40);
    if(!text)return;
    if(c.guesses.filter(g=>g.uid===ON.uid).length>=60)return;
    inp.value="";
    push({a:"guess",turn:c.t,at:Date.now(),text});
    if(wkey(text)===c.key){ON.gnote={t:c.t,msg:"That's it! Waiting for the drawer's phone to confirm…"};paintPlay()}
    else sfx("tap");
    inp.focus({preventScroll:true});
  };
}
function onlineCardHTML(){
  if(!onlineAvailable())return "";
  return `<div class="card" id="ocard"><span class="label">Online · each player on their own phone</span>
    <p class="muted tiny">2 to 8 players. You take turns drawing on your phone; everyone else watches live and types guesses.</p>
    <span class="label">Drawing time</span>
    <div class="seg">${[45,60,90].map(v=>`<button data-osecs="${v}" aria-pressed="${O.secs===v}">${v}s</button>`).join("")}</div>
    <span class="label">Turns each</span>
    <div class="seg">${[1,2,3].map(v=>`<button data-orounds="${v}" aria-pressed="${O.rounds===v}">${v}</button>`).join("")}</div>
    <div class="row"><button class="primary" id="ocreate">Create online game</button><button id="ojoin">Join with a code</button></div></div>`;
}

try{HubKit.init({
  id:"sketch",name:"Pictionary",accent:"#ffd23f",scheme:"auto",floating:true,
  items:()=>{
    const it=[{label:"How to play",onSelect:showRules}];
    if(ON.active){it.push({label:"Leave game",confirm:"Tap again to leave this game",onSelect:leaveOnline});return it}
    if(S.screen!=="setup"&&S.screen!=="final")it.push({label:"End game",confirm:"Tap again to end this game",onSelect:endGame});
    return it;
  },
  onOpen:()=>{
    if(ON.active)return;
    if(S.screen==="draw"&&!S.paused){S.paused=true;render()}
  }
})}catch(e){}
if(!startOnline()){
  const mode=new URLSearchParams(location.search).get('mode');
  if(location.hash==='#continue'||!['local','online'].includes(mode)){restore();render()}
  else {
    S.screen='setup';render(true);
    if(mode==='online'){
      if(onlineAvailable())openOnlineLobby();
      else {S.notice='Online play is unavailable right now. You can still play on this device.';render(true)}
    }
  }
}
