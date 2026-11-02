
// ---------- Card data ----------
const KING=['F','P','A','I'], OBJS=['Q','K','M'], SYMS=[...KING,...OBJS];
const NAMES={F:'Fungi',P:'Plant',A:'Animal',I:'Insect',Q:'Quill',K:'Inkwell',M:'Manuscript'};
const PLURAL={F:'Fungi',P:'Plants',A:'Animals',I:'Insects',Q:'Quills',K:'Inkwells',M:'Manuscripts'};
const DIRS=[[-1,-1],[1,-1],[-1,1],[1,1]]; // corners: top-left, top-right, bottom-left, bottom-right
const CARDS={}, RES_IDS=[], GOLD_IDS=[], START_IDS=[];
const cor=s=>s.split('').map(ch=>ch==='-'?null:ch); // '-' hidden corner, 'E' empty corner

(function buildCards(){
  const others={F:['P','A','I'],P:['I','F','A'],A:['F','I','P'],I:['A','P','F']};
  KING.forEach(k=>{
    const [a,b,c]=others[k];
    [[k+'E'+k+'-',0],[k+k+'-E',0],['E-'+k+k,0],['-'+k+'E'+k,0],
     ['-'+a+'Q'+k,0],['K'+k+b+'-',0],[c+'M-'+k,0],
     [k+'E-E',1],['-'+k+'EE',1],['EE'+k+'-',1]]
    .forEach(([s,points],i)=>{const id=`R${k}${i+1}`;CARDS[id]={id,type:'R',k,corners:cor(s),points};RES_IDS.push(id);});
    [['EQE-',1,'Q',{[k]:2,[a]:1}],['KE-E',1,'K',{[k]:2,[b]:1}],['E-EM',1,'M',{[k]:2,[c]:1}],
     ['EEE-',2,'C',{[k]:3,[a]:1}],['EE-E',2,'C',{[k]:3,[b]:1}],['-EEE',2,'C',{[k]:3,[c]:1}],
     ['-EQ-',3,null,{[k]:3}],['K--E',3,null,{[k]:3}],['-ME-',3,null,{[k]:3}],['E--E',5,null,{[k]:5}]]
    .forEach(([s,points,cond,req],i)=>{const id=`G${k}${i+1}`;CARDS[id]={id,type:'G',k,corners:cor(s),points,cond,req};GOLD_IDS.push(id);});
  });
  [['EPIE','I','FPIA'],['AEEF','F','PAIF'],['EEEE','PF','IAFP'],['EEEE','AI','PIAF'],['EE--','AIP','IFPA'],['EE--','PAF','FAIP']]
  .forEach(([f,c,b],i)=>{const id='S'+(i+1);CARDS[id]={id,type:'S',corners:cor(f),center:c.split(''),backCorners:cor(b)};START_IDS.push(id);});
})();

const OBJECTIVES=[
  {id:'D1',kind:'pattern',pts:2,cells:[[0,0,'F'],[1,-1,'F'],[2,-2,'F']],label:'Three Fungi in a rising diagonal'},
  {id:'D2',kind:'pattern',pts:2,cells:[[0,0,'P'],[1,1,'P'],[2,2,'P']],label:'Three Plants in a falling diagonal'},
  {id:'D3',kind:'pattern',pts:2,cells:[[0,0,'A'],[1,-1,'A'],[2,-2,'A']],label:'Three Animals in a rising diagonal'},
  {id:'D4',kind:'pattern',pts:2,cells:[[0,0,'I'],[1,1,'I'],[2,2,'I']],label:'Three Insects in a falling diagonal'},
  {id:'L1',kind:'pattern',pts:3,cells:[[0,0,'F'],[0,2,'F'],[1,3,'P']],label:'Two Fungi stacked, a Plant at lower right'},
  {id:'L2',kind:'pattern',pts:3,cells:[[0,0,'P'],[0,2,'P'],[-1,3,'I']],label:'Two Plants stacked, an Insect at lower left'},
  {id:'L3',kind:'pattern',pts:3,cells:[[1,-1,'F'],[0,0,'A'],[0,2,'A']],label:'Two Animals stacked, a Fungi at upper right'},
  {id:'L4',kind:'pattern',pts:3,cells:[[-1,-1,'A'],[0,0,'I'],[0,2,'I']],label:'Two Insects stacked, an Animal at upper left'},
  ...KING.map(k=>({id:'K'+k,kind:'set',pts:2,need:{[k]:3},label:`Every 3 visible ${PLURAL[k]}`})),
  {id:'O3',kind:'set',pts:3,need:{Q:1,K:1,M:1},label:'Every Quill, Inkwell and Manuscript set'},
  {id:'OM',kind:'set',pts:2,need:{M:2},label:'Every 2 Manuscripts'},
  {id:'OK',kind:'set',pts:2,need:{K:2},label:'Every 2 Inkwells'},
  {id:'OQ',kind:'set',pts:2,need:{Q:2},label:'Every 2 Quills'},
];
const OBJ_BY_ID=Object.fromEntries(OBJECTIVES.map(o=>[o.id,o]));

// ---------- Rules engine ----------
const sideCorners=(c,face)=>face==='front'?c.corners:(c.type==='S'?c.backCorners:['E','E','E','E']);
const sideCenter=(c,face)=>c.type==='S'?(face==='front'?c.center:[]):(face==='back'?[c.k]:[]);
const kxy=(x,y)=>x+','+y;

function counts(board){
  const n={F:0,P:0,A:0,I:0,Q:0,K:0,M:0};
  for(const key in board){
    const pc=board[key], card=CARDS[pc.id];
    sideCenter(card,pc.face).forEach(s=>n[s]++);
    sideCorners(card,pc.face).forEach((s,i)=>{
      if(!s||s==='E') return;
      const nb=board[kxy(pc.x+DIRS[i][0],pc.y+DIRS[i][1])];
      if(nb&&nb.order>pc.order) return; // covered by a later card
      n[s]++;
    });
  }
  return n;
}
function validSpots(board){
  const ok=new Set(), blocked=new Set();
  for(const key in board){
    const pc=board[key], cs=sideCorners(CARDS[pc.id],pc.face);
    DIRS.forEach(([dx,dy],i)=>{
      const k2=kxy(pc.x+dx,pc.y+dy);
      if(board[k2]) return;
      (cs[i]===null?blocked:ok).add(k2);
    });
  }
  return [...ok].filter(k=>!blocked.has(k)).map(k=>k.split(',').map(Number));
}
const missing=(card,n)=>card.type!=='G'?0:Object.entries(card.req).reduce((m,[s,v])=>m+Math.max(0,v-n[s]),0);
const meetsReq=(n,card)=>missing(card,n)===0;
function pointsFor(board,id,face,x,y){
  const c=CARDS[id];
  if(face!=='front'||c.type==='S') return 0;
  if(c.type==='R'||!c.cond) return c.points;
  if(c.cond==='C') return c.points*DIRS.filter(([dx,dy])=>board[kxy(x+dx,y+dy)]).length;
  return c.points*counts(board)[c.cond];
}
function patternOcc(o,board){
  const occ=[], [ax,ay]=o.cells[0];
  for(const key in board){
    const pc=board[key], ox=pc.x-ax, oy=pc.y-ay, keys=[];
    let ok=true;
    for(const [dx,dy,k] of o.cells){
      const kk=kxy(ox+dx,oy+dy), q=board[kk];
      if(!q||CARDS[q.id].k!==k){ok=false;break;}
      keys.push(kk);
    }
    if(ok) occ.push(keys);
  }
  return occ;
}
function maxPackingSets(occ){ // each card counts once per objective
  const used=new Set(), pick=[];
  if(occ.length>40){for(const o of occ) if(o.every(k=>!used.has(k))){o.forEach(k=>used.add(k));pick.push(o);}return pick;}
  let best=[];
  (function rec(i){
    if(pick.length+(occ.length-i)<=best.length) return;
    if(i===occ.length){best=pick.slice();return;}
    const o=occ[i];
    if(o.every(k=>!used.has(k))){o.forEach(k=>used.add(k));pick.push(o);rec(i+1);pick.pop();o.forEach(k=>used.delete(k));}
    rec(i+1);
  })(0);
  return best;
}
const maxPacking=occ=>maxPackingSets(occ).length;
function objTimes(o,board,n){
  if(o.kind==='pattern') return maxPacking(patternOcc(o,board));
  return Math.min(...Object.entries(o.need).map(([s,v])=>Math.floor(n[s]/v)));
}
function patternPartial(o,board){
  const origins=new Set();
  for(const key in board){
    const pc=board[key], k=CARDS[pc.id].k;
    if(!k) continue;
    o.cells.forEach(([dx,dy,kk])=>{if(kk===k) origins.add(kxy(pc.x-dx,pc.y-dy));});
  }
  let n=0;
  for(const og of origins){
    const [ox,oy]=og.split(',').map(Number);
    let m=0, blocked=false;
    for(const [dx,dy,k] of o.cells){
      const q=board[kxy(ox+dx,oy+dy)];
      if(!q) continue;
      if(CARDS[q.id].k===k) m++; else {blocked=true;break;}
    }
    if(!blocked&&m===2) n++;
  }
  return n;
}

function visibleByCard(board){
  const out={};
  for(const key in board){
    const pc=board[key], card=CARDS[pc.id], v=[...sideCenter(card,pc.face)];
    sideCorners(card,pc.face).forEach((s,i)=>{
      if(!s||s==='E') return;
      const nb=board[kxy(pc.x+DIRS[i][0],pc.y+DIRS[i][1])];
      if(nb&&nb.order>pc.order) return;
      v.push(s);
    });
    out[key]=v;
  }
  return out;
}
// cards that count toward an objective: scoring pattern cards, or cards showing a needed symbol
function objCards(o,board){
  if(o.kind==='pattern') return new Set(maxPackingSets(patternOcc(o,board)).flat());
  const vis=visibleByCard(board), out=new Set();
  for(const k in vis) if(vis[k].some(s=>o.need[s])) out.add(k);
  return out;
}
function objProgress(o,board){
  const n=counts(board), t=objTimes(o,board,n);
  let txt;
  if(o.kind==='pattern'){const near=patternPartial(o,board);txt=`${t} done${near?` · ${near} one card away`:''}`;}
  else{
    const e=Object.entries(o.need);
    if(e.length===1){const [s,v]=e[0];txt=`${n[s]} visible · ${v-(n[s]-t*v)} more for the next`;}
    else{const lack=e.filter(([s,v])=>n[s]-t*v<v).map(([s])=>NAMES[s]);txt=`${t} done · next needs ${lack.join(', ')}`;}
  }
  return {t,earned:t*o.pts,txt};
}
