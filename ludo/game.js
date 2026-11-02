(function(){
  'use strict';
  const E=window.HubEngines.ludo;
  const rotate=(point,n)=>{let[x,y]=point;for(let i=0;i<n;i++)[x,y]=[14-y,x];return[x,y];};
  const at=(x,y)=>'left:'+(x*100/15)+'%;top:'+(y*100/15)+'%;';
  function describe(a,s){if(a.type==='roll')return 'Roll the die';const p=s.tokens[s.current][a.token],next=p===-1?0:p+s.die;return 'Token '+(a.token+1)+(p===-1?': leave yard':next===E.FINISH?': finish home':': move '+s.die);}
  function render(s,viewer,actions,ctx){
    const esc=ctx.esc, movable=new Map(actions.map((a,i)=>a.type==='move'?[a.token,i]:[-1,i]));
    const cells=new Map(),push=(x,y,html)=>{const k=x+','+y;cells.set(k,(cells.get(k)||'')+html);};
    s.tokens.forEach((tokens,p)=>tokens.forEach((progress,t)=>{
      const slot=s.slots[p];let pos;
      if(progress===-1)pos=rotate([t%2===0?2:4,t<2?10:12],slot);
      else if(progress<=50)pos=E.TRACK[E.trackIndex(s,p,t)];
      else if(progress<E.FINISH)pos=rotate([7,64-progress],slot);
      else pos=rotate([t%2===0?6.65:7.35,t<2?7.1:7.85],slot);
      const index=p===viewer?movable.get(t):undefined;
      const title=esc(s.players[p].name+', token '+(t+1)+(progress===-1?', in yard':progress===E.FINISH?', home':', '+(E.FINISH-progress)+' steps from home'));
      const tag=index!==undefined?'button':'span';
      push(pos[0],pos[1],'<'+tag+' class="ludo-token'+(index!==undefined?' can-move':'')+'" style="--token:'+E.COLOURS[slot]+'"'+(index!==undefined?' data-move="'+index+'" type="button"':'')+' title="'+title+'" aria-label="'+title+'">'+(t+1)+'</'+tag+'>');
    }));
    let board='<div class="ludo-board" aria-label="Ludo board. Token numbers identify each player’s four pieces.">';
    for(let slot=0;slot<4;slot++){
      const [x,y]=rotate([0,9],slot),[x2,y2]=rotate([5,14],slot),left=Math.min(x,x2),top=Math.min(y,y2);
      const player=s.slots.indexOf(slot);
      board+='<div class="ludo-yard" style="'+at(left,top)+'--yard:'+E.COLOURS[slot]+'"><span>'+esc(player>=0?s.players[player].name:'Empty corner')+'</span></div>';
    }
    board+='<div class="ludo-home" aria-hidden="true"><span>HOME</span></div>';
    E.TRACK.forEach(([x,y],i)=>{const owner=i%13===0?Math.floor(i/13):null;board+='<div class="ludo-cell'+(E.SAFE.includes(i)?' safe':'')+'" style="'+at(x,y)+(owner!==null?'--safe:'+E.COLOURS[owner]+';':'')+'">'+(E.SAFE.includes(i)?'<span class="ludo-star" aria-hidden="true">★</span>':'')+'</div>';});
    for(let slot=0;slot<4;slot++)for(let n=0;n<5;n++){const[x,y]=rotate([7,13-n],slot);board+='<div class="ludo-cell ludo-lane" style="'+at(x,y)+'--lane:'+E.COLOURS[slot]+';"></div>';}
    for(const[k,tokens]of cells){const[x,y]=k.split(',').map(Number);board+='<div class="ludo-pieces" style="'+at(x,y)+'">'+tokens+'</div>';}
    board+='</div>';
    let controls='';
    if(actions.some(a=>a.type==='roll'))controls='<button type="button" class="tt-primary ludo-roll" data-move="'+actions.findIndex(a=>a.type==='roll')+'">Roll the die</button>';
    else if(actions.length)controls='<p>Choose a glowing token on the board, or tap below.</p><div class="ludo-moves">'+actions.map((a,i)=>'<button type="button" data-move="'+i+'">'+esc(describe(a,s))+'</button>').join('')+'</div>';
    else if(!s.over)controls='<p>Waiting for '+esc(s.players[s.current].name)+'.</p>';
    const die=s.lastDie==null?'?':'⚀⚁⚂⚃⚄⚅'[s.lastDie-1];
    return '<div class="ludo-layout"><section class="ludo-table">'+board+'</section><aside class="ludo-side"><div class="ludo-dice"><span aria-hidden="true">'+die+'</span><div>'+(s.lastDie==null?'Ready to roll':esc(s.players[s.lastRoller].name)+' rolled <strong>'+s.lastDie+'</strong>')+(s.sixStreak&&s.current===s.lastRoller?'<small>'+s.sixStreak+' consecutive six'+(s.sixStreak===1?'':'es')+'</small>':'')+'</div></div><p class="ludo-notice" role="status">'+esc(s.notice)+'</p><div class="ludo-actions">'+controls+'</div><ul class="ludo-score">'+s.players.map((p,i)=>'<li style="--pc:'+E.COLOURS[s.slots[i]]+'"><i aria-hidden="true"></i><span>'+esc(p.name)+'</span><b>'+s.scores[i]+'/4 home</b></li>').join('')+'</ul><details class="ludo-rules"><summary>Our Ludo rules</summary><p>Roll a six to leave the yard. A six earns another roll. Your third consecutive six is forfeited, then play passes; earlier moves stand.</p><p>Land exactly on an opponent to send their token back to the yard. All eight star squares and your home column are safe. Tokens may share squares: there are no blockades, and passing is always allowed. Landing on an unsafe stack captures every opposing token there.</p><p>Use an exact roll to finish. Captures and finishes do not earn bonus rolls. First to bring all four tokens home wins. In a two-player game, players use opposite corners.</p><p>Colours and numbered tokens identify players without relying on colour alone.</p></details></aside></div>';
  }
  HubTabletop.mount({id:'ludo',title:'Ludo',minPlayers:2,maxPlayers:4,engine:E,options:[],render,describe,score:(s,p)=>s.scores[p]});
})();
