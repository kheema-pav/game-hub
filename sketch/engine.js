
const WORDS = {
  Object: ["Hourglass","Stethoscope","Lighthouse","Parachute","Typewriter","Chandelier","Compass","Hammock","Telescope","Drawbridge","Accordion","Padlock","Scarecrow","Kaleidoscope","Wheelbarrow","Periscope","Metronome","Snow globe","Jukebox","Bagpipes","Windmill","Trampoline","Catapult","Sundial","Umbrella stand","Tricycle","Ladle","Harpoon","Bunk bed","Submarine"],
  Action: ["Eavesdropping","Sleepwalking","Procrastinating","Hitchhiking","Babysitting","Photobombing","Juggling","Tiptoeing","Haggling","Daydreaming","Sneezing","Skydiving","Snorkeling","Moonwalking","Arm wrestling","Counting sheep","Tying a tie","Spilling the beans","Walking the plank","Karaoke","Sandcastle building","Ice fishing","Pickpocketing","Gift wrapping","Flossing","Surfing the web","Burning the toast","Breaking the ice","Raising the roof","Thumb war"],
  Concept: ["Gravity","Jealousy","Nostalgia","Deadline","Inflation","Camouflage","Democracy","Insomnia","Time zone","Black hole","Peer pressure","Stage fright","Jet lag","Cold war","Rush hour","Echo","Mirage","Static electricity","Awkward silence","Brain freeze","Superstition","Gossip","Quicksand","Optical illusion","Climate change","Writer's block","Small talk","Plot twist","Lost in translation","Midlife crisis"],
  Place: ["Labyrinth","Observatory","Colosseum","Igloo","Skyscraper","Lighthouse keeper","Catacombs","Oasis","Speakeasy","Planetarium","Volcano","Bazaar","Monastery","Dry dock","Drive-in theater","Treehouse","Penthouse","Quarry","Aqueduct","Greenhouse"],
  Character: ["Mermaid","Astronaut","Gladiator","Pirate captain","Mime","Beekeeper","Sumo wrestler","Vampire","Court jester","Scuba diver","Ninja","Cowboy","Lumberjack","Detective","Mad scientist","Genie","Werewolf","Referee","Magician","Cheerleader"]
};
const COLORS = ["#ffd23f","#4cc9f0","#ff6b9d","#7bd88f"];

// Deterministic online rules. Shared by every viewer; independent of the interface.
const WL=Object.entries(WORDS).flatMap(([c,l])=>l.map(w=>({c,w})));
const safeColor=c=>typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c)?c:"";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function sshuffle(arr,r){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// Matching (R5): NFD, strip accents, lower-case, drop a leading a|an|the, keep only [a-z0-9]
const normGuess=s=>String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/^\s*(?:a|an|the)\s+/,"").replace(/[^a-z0-9]/g,"");
function h53(str){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677)}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return 4294967296*(2097151&h2)+(h1>>>0)}
const wkey=s=>h53(normGuess(s));
const roomOpts=room=>{const o=(room&&room.opts)||{};return{secs:[45,60,90].includes(o.secs)?o.secs:60,rounds:[1,2,3].includes(o.rounds)?o.rounds:1}};
const isRec=x=>x&&typeof x==="object"&&!Array.isArray(x);

// Rebuilds the whole game. `movesOf(uid)` is that player's record list. Seat order: uids sorted, then shuffled with the seeded
// generator; the word deck is shuffled next (the same generator), so every phone gets the same order and the same words.
function replayOnline(room,movesOf,myUid){
  const seats=(room&&room.seats)||{}, uids=Object.keys(seats).sort(), n=uids.length;
  if(n<2||n>8||typeof room.seed!=="number")return null;
  const r=rng(room.seed), order=sshuffle(uids,r), deck=sshuffle(WL.map((_,i)=>i),r), {secs,rounds}=roomOpts(room), total=n*rounds;
  const base=uids.map((u,i)=>String((seats[u]&&seats[u].name)||"").replace(/\s+/g," ").trim().slice(0,16)||`Player ${i+1}`);
  const names={}, colors={};
  uids.forEach((u,i)=>{const k=base.slice(0,i).filter(x=>x.toLowerCase()===base[i].toLowerCase()).length;names[u]=k?`${base[i]} ${k+1}`:base[i];colors[u]=safeColor(seats[u]&&seats[u].color)||COLORS[i%COLORS.length]});
  const lists=new Map(order.map(u=>{const m=movesOf(u);return[u,Array.isArray(m)?m:[]]}));
  const scores={}, done=[]; order.forEach(u=>{scores[u]=0});
  let cur=null, ptr=0, over=false;
  for(let t=0;t<total;t++){
    const d=order[t%n], dm=lists.get(d);
    const si=dm.findIndex(x=>isRec(x)&&x.a==="start"&&x.turn===t&&Number.isFinite(x.at));
    if(si<0){cur={t,drawer:d,started:false};break}
    let wi=deck[ptr++%deck.length], skipped=false, end=null;
    for(let j=si+1;j<dm.length&&!end;j++){
      const x=dm[j];
      if(!isRec(x)||x.turn!==t)continue;
      if(x.a==="skip"){if(!skipped){skipped=true;wi=deck[ptr++%deck.length]}}
      else if(x.a==="correct"){
        const gm=lists.get(x.uid), q=gm&&Number.isInteger(x.gi)&&x.gi>=0?gm[x.gi]:null;
        if(x.uid!==d&&isRec(q)&&q.a==="guess"&&q.turn===t&&typeof q.text==="string"&&wkey(q.text)===wkey(WL[wi].w))end={why:"guessed",guesser:x.uid,gi:x.gi};
      }
      else if(x.a==="end"&&x.why==="time")end={why:"time"};
    }
    if(end){
      if(end.why==="guessed"){scores[end.guesser]+=2;scores[d]+=1}
      done.push({t,drawer:d,c:WL[wi].c,w:WL[wi].w,why:end.why,guesser:end.guesser||null});
      if(t===total-1)over=true;
      continue;
    }
    const key=wkey(WL[wi].w), guesses=[];
    order.forEach(u=>{if(u===d)return;lists.get(u).forEach((q,gi)=>{
      if(isRec(q)&&q.a==="guess"&&q.turn===t&&typeof q.text==="string"){const text=q.text.slice(0,40);guesses.push({uid:u,gi,at:Number.isFinite(q.at)?q.at:0,text,match:wkey(text)===key})}})});
    guesses.sort((a,b)=>a.at-b.at||(a.uid<b.uid?-1:a.uid>b.uid?1:a.gi-b.gi));
    // the word itself is only kept on the drawer's own phone; everyone else holds a hash
    cur={t,drawer:d,started:true,at:dm[si].at,skipped,key,word:d===myUid?WL[wi]:null,guesses};
    break;
  }
  return{order,names,colors,n,secs,rounds,total,scores,done,cur:over?null:cur,over,me:order.indexOf(myUid)};
}
