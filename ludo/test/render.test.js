'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../engine');
let game;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'..','game.js'),'utf8'),{window:{HubEngines:{ludo:E}},HubTabletop:{mount:x=>{game=x;}}});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('board renders all 16 tokens, safe squares, five home-column cells per corner and escaped names',()=>{
  const s=E.create({seed:7,players:[{name:'<script>bad</script>'},{name:'B'},{name:'C'},{name:'D'}]});
  const html=game.render(s,0,E.legal(s,0),{esc});
  assert.equal((html.match(/class="ludo-token/g)||[]).length,16);
  assert.equal((html.match(/class="ludo-cell safe/g)||[]).length,8);
  assert.equal((html.match(/class="ludo-cell ludo-lane/g)||[]).length,20);
  assert.equal(html.includes('<script>bad</script>'),false);assert.match(html,/&lt;script&gt;/);
  assert.match(html,/Roll the die/);assert.equal(game.minPlayers,2);assert.equal(game.maxPlayers,4);
});
test('move buttons use current legal indices and waiting viewers cannot submit token actions',()=>{
  const s=E.create({seed:7,players:[{name:'A'},{name:'B'}]});s.phase='move';s.die=6;s.lastDie=6;s.lastRoller=0;
  const actions=E.legal(s,0),html=game.render(s,0,actions,{esc});
  for(let i=0;i<4;i++)assert.match(html,new RegExp('data-move="'+i+'"'));
  assert.equal((html.match(/ can-move/g)||[]).length,4);
  assert.equal(game.render(s,1,[],{esc}).includes('data-move='),false);
});
test('legal landing previews explain captures and safe moves without revealing interactive moves to other viewers',()=>{
  const s=E.create({seed:7,players:[{name:'A'},{name:'B'}]});
  s.phase='move';s.die=1;s.lastDie=1;s.lastRoller=0;
  s.tokens[0]=[0,7,55,-1];s.tokens[1]=[27,-1,-1,-1];
  const html=game.render(s,0,E.legal(s,0),{esc});
  assert.match(html,/Landing for token 1/);
  assert.match(html,/Landing for token 2/);
  assert.doesNotMatch(html,/Landing for token 3/,'finishing tokens use the home message instead of a track marker');
  assert.match(html,/Capture 1 opposing token/);
  assert.match(html,/Land on a safe square/);
  assert.match(html,/Bring it home/);
  assert.equal(game.render(s,1,[],{esc}).includes('ludo-landing'),false);
  assert.equal(game.privateInformation,false,'a public board should not need pass-device privacy curtains');
});
test('all die results render the corresponding number of pips',()=>{
  const s=E.create({seed:7,players:[{name:'A'},{name:'B'}]});s.lastRoller=0;
  for(let die=1;die<=6;die++){
    s.lastDie=die;
    assert.equal((game.render(s,0,E.legal(s,0),{esc}).match(/class="pip"/g)||[]).length,die);
  }
});
