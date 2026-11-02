'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../engine');
function view(){
  let config;const handlers={},root={addEventListener:(type,fn)=>handlers[type]=fn,querySelectorAll:()=>[]};
  const context={HubEngines:{reversi:E},HubTabletop:{mount:c=>{config=c;}},document:{getElementById:()=>root}};context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game.js'),'utf8'),context);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return {config,render:s=>config.render(s,0,E.legal(s,E.actor(s)),{esc}),handlers};
}
test('view offers only legal squares and explains previews, disc colours and rules',()=>{
  const v=view(),s=E.create({seed:3,players:[{name:'You',bot:false},{name:'Bot',bot:true}]}),html=v.render(s);
  assert.equal(v.config.privateInformation,false);assert.equal(v.config.inlineRules,true);assert.equal(v.config.id,'reversi');
  assert.equal((html.match(/data-rv-square=/g)||[]).length,64);assert.equal((html.match(/data-move=/g)||[]).length,4);
  assert.match(html,/D3: place black, flips 1 disc/);assert.match(html,/Black · Playing/);assert.match(html,/How to play Reversi/);
  assert.equal(typeof v.handlers.focusin,'function');assert.equal(typeof v.handlers.pointerover,'function');
});
test('player text is escaped and forced passes are visible',()=>{
  const v=view(),s=E.create({seed:3,players:[{name:'<img onerror=x>',bot:false},{name:'Other',bot:false}]});s.passed=1;
  const html=v.render(s);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img onerror=x&gt;/);assert.match(html,/Other has no legal move/);
});
