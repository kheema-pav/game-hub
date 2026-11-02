(function(){
  'use strict';
  const E=window.HubEngines.ludo;
  const rotate=(point,n)=>{let[x,y]=point;for(let i=0;i<n;i++)[x,y]=[14-y,x];return[x,y];};
  const at=(x,y)=>'left:'+(x*100/15)+'%;top:'+(y*100/15)+'%;';
  const yard=(t,slot)=>rotate([t%2===0?2:4,t<2?10:12],slot);
  function position(progress,t,slot){
    if(progress===-1)return yard(t,slot);
    if(progress<=50)return E.TRACK[(slot*13+progress)%52];
    if(progress<E.FINISH)return rotate([7,64-progress],slot);
    return rotate([t%2===0?6.65:7.35,t<2?7.1:7.85],slot);
  }
  function destination(a,s){
    const before=s.tokens[s.current][a.token],next=before===-1?0:before+s.die;
    const square=next<=50?(s.slots[s.current]*13+next)%52:null;
    let captures=0;
    if(square!==null&&!E.SAFE.includes(square))s.tokens.forEach((tokens,p)=>{if(p!==s.current)tokens.forEach((_,t)=>{if(E.trackIndex(s,p,t)===square)captures++;});});
    return {next,captures,safe:next>50||E.SAFE.includes(square),enter:before===-1};
  }
  function describe(a,s){if(a.type==='roll')return 'Roll the die';const d=destination(a,s);return 'Token '+(a.token+1)+(d.enter?': leave yard':d.next===E.FINISH?': finish home':': move '+s.die)+(d.captures?' · capture '+d.captures:'');}
  function render(s,viewer,actions,ctx){
    const esc=ctx.esc,movable=new Map(actions.flatMap((a,i)=>a.type==='move'?[[a.token,i]]:[]));
    const activeColour=E.COLOURS[s.slots[s.current]],cells=new Map(),landings=new Map();
    const push=(x,y,html)=>{const k=x+','+y;cells.set(k,(cells.get(k)||'')+html);};
    s.tokens.forEach((tokens,p)=>tokens.forEach((progress,t)=>{
      const slot=s.slots[p],pos=position(progress,t,slot),index=p===viewer?movable.get(t):undefined;
      const title=esc(s.players[p].name+', token '+(t+1)+(progress===-1?', in yard':progress===E.FINISH?', home':', '+(E.FINISH-progress)+' steps from home'));
      const tag=index!==undefined?'button':'span';
      push(pos[0],pos[1],'<'+tag+' class="ludo-token'+(index!==undefined?' can-move':'')+'" style="--token:'+E.COLOURS[slot]+'"'+(index!==undefined?' data-move="'+index+'" type="button"':'')+' title="'+title+'" aria-label="'+title+'">'+(t+1)+'</'+tag+'>');
    }));
    actions.forEach(a=>{if(a.type!=='move')return;const d=destination(a,s);if(d.next===E.FINISH)return;const pos=position(d.next,a.token,s.slots[s.current]),key=pos.join(',');if(!landings.has(key))landings.set(key,[]);landings.get(key).push(a.token+1);});
    let board='<div class="ludo-board" aria-label="Ludo board. Numbered pieces are tokens; dashed rings show legal landing squares.">';
    for(let slot=0;slot<4;slot++){
      const [x,y]=rotate([0,9],slot),[x2,y2]=rotate([5,14],slot),left=Math.min(x,x2),top=Math.min(y,y2),player=s.slots.indexOf(slot);
      board+='<div class="ludo-yard'+(player===s.current&&!s.over?' active':'')+(player<0?' empty':'')+'" style="'+at(left,top)+'--yard:'+E.COLOURS[slot]+'"><span>'+esc(player>=0?s.players[player].name:'')+'</span></div>';
      for(let t=0;t<4;t++){const [sx,sy]=yard(t,slot);board+='<span class="ludo-socket" style="'+at(sx,sy)+'--yard:'+E.COLOURS[slot]+'" aria-hidden="true"></span>';}
    }
    board+='<div class="ludo-home" aria-hidden="true"><span>★</span></div>';
    E.TRACK.forEach(([x,y],i)=>{const owner=i%13===0?Math.floor(i/13):null;board+='<div class="ludo-cell'+(E.SAFE.includes(i)?' safe':'')+'" style="'+at(x,y)+(owner!==null?'--safe:'+E.COLOURS[owner]+';':'')+'">'+(E.SAFE.includes(i)?'<span class="ludo-star" aria-hidden="true">★</span>':'')+'</div>';});
    for(let slot=0;slot<4;slot++)for(let n=0;n<5;n++){const[x,y]=rotate([7,13-n],slot);board+='<div class="ludo-cell ludo-lane" style="'+at(x,y)+'--lane:'+E.COLOURS[slot]+';"></div>';}
    for(const[k,tokens]of cells){const[x,y]=k.split(',').map(Number);board+='<div class="ludo-pieces" style="'+at(x,y)+'">'+tokens+'</div>';}
    for(const[k,tokens]of landings){const[x,y]=k.split(',').map(Number);board+='<div class="ludo-landing" style="'+at(x,y)+'--landing:'+activeColour+'" title="Landing for token'+(tokens.length>1?'s':'')+' '+tokens.join(', ')+'" aria-hidden="true"><span>'+ (tokens.length===1?tokens[0]:'↗')+'</span></div>';}
    board+='</div>';
    let controls='';
    if(actions.some(a=>a.type==='roll'))controls='<button type="button" class="tt-primary ludo-roll" data-move="'+actions.findIndex(a=>a.type==='roll')+'">Roll the die <span aria-hidden="true">↗</span></button><p class="ludo-hint">'+(s.sixStreak?'A six means another chance.':'A six brings a token into play.')+'</p>';
    else if(actions.length)controls='<p class="ludo-hint">Tap a raised token or choose its move below.<br>Dashed rings show where it will land.</p><div class="ludo-moves">'+actions.map((a,i)=>{const d=destination(a,s),label=d.next===E.FINISH?'Bring it home':d.enter?'Leave the yard':'Move '+s.die+' spaces',detail=d.captures?'Capture '+d.captures+' opposing token'+(d.captures===1?'':'s'):d.next===E.FINISH?'One more safely home':d.safe?'Land on a safe square':(E.FINISH-d.next)+' steps from home';return '<button type="button" data-move="'+i+'" aria-label="'+esc(describe(a,s))+'. '+esc(detail)+'"><b class="ludo-move-number">'+(a.token+1)+'</b><span><strong>'+label+'</strong><small>'+detail+'</small></span><span aria-hidden="true">→</span></button>';}).join('')+'</div>';
    else if(!s.over)controls='<p class="ludo-hint">Waiting for '+esc(s.players[s.current].name)+' to '+(s.phase==='roll'?'roll.':'choose a token.')+'</p>';
    const pips={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
    const die='<span class="ludo-die" aria-hidden="true">'+(s.lastDie?Array.from({length:9},(_,i)=>'<i'+(pips[s.lastDie].includes(i)?' class="pip"':'')+'></i>').join(''):'<b>?</b>')+'</span>';
    return '<div class="ludo-layout" style="--active:'+activeColour+'"><section class="ludo-table">'+board+'<div class="ludo-legend"><span>★ Safe square</span><span>Four tokens. One race home.</span></div></section><aside class="ludo-side"><section class="ludo-turn"><div class="ludo-eyebrow">'+(s.over?'Race complete':'Turn '+s.turnNo)+'</div><h2>'+esc(s.over?s.players[s.winner].name+' wins!':(s.players[s.current].name==='You'?'Your turn':s.players[s.current].name+"’s turn"))+'</h2><div class="ludo-dice">'+die+'<div>'+(s.lastDie==null?'<strong>Let’s play</strong><small>Roll to start your journey</small>':'<small>Last roll · '+esc(s.players[s.lastRoller].name)+'</small><strong>'+s.lastDie+'</strong>')+(s.sixStreak&&s.current===s.lastRoller?'<small>'+s.sixStreak+' consecutive six'+(s.sixStreak===1?'':'es')+'</small>':'')+'</div></div><div class="ludo-actions">'+controls+'</div><p class="ludo-notice" role="status">'+esc(s.notice)+'</p></section><section class="ludo-progress"><h3>The race home</h3><ul class="ludo-score">'+s.players.map((p,i)=>'<li class="'+(i===s.current&&!s.over?'current':'')+'" style="--pc:'+E.COLOURS[s.slots[i]]+'"><i aria-hidden="true"></i><span>'+esc(p.name)+(i===viewer&&p.name!=='You'&&(ctx.online||s.players.some(person=>person.bot))?' <small>You</small>':'')+'</span><div class="ludo-finishers" aria-label="'+s.scores[i]+' of 4 tokens home">'+s.tokens[i].map(progress=>'<b class="'+(progress===E.FINISH?'finished':'')+'" aria-hidden="true">'+(progress===E.FINISH?'✓':'·')+'</b>').join('')+'</div></li>').join('')+'</ul></section><details class="ludo-rules"><summary>How to play</summary><p>Roll a six to leave the yard. A six earns another roll. Your third consecutive six is forfeited, then play passes; earlier moves stand.</p><p>Land exactly on an opponent to send their token back to the yard. All eight star squares and your home column are safe. Tokens may share squares: there are no blockades, and passing is always allowed. Landing on an unsafe stack captures every opposing token there.</p><p>Use an exact roll to finish. Captures and finishes do not earn bonus rolls. First to bring all four tokens home wins. In a two-player game, players use opposite corners.</p><p>Token numbers identify your pieces. Player names label each coloured yard, and each move is also available as a large button beside the board.</p></details></aside></div>';
  }
  HubTabletop.mount({id:'ludo',inlineRules:true,title:'Ludo',minPlayers:2,maxPlayers:4,privateInformation:false,engine:E,options:[],render,describe,score:(s,p)=>s.scores[p]});
})();
