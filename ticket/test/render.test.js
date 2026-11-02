'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../engine.js');
let config;const context={window:{HubEngines:{ticket:E}},HubTabletop:{mount(c){config=c;}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../geography.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../game.js'),'utf8'),context);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function state(edition){return E.create({seed:41,players:[{name:'A',color:'#dd3333'},{name:'B',color:'#3333dd'}],options:{edition}});}
function render(s,draft={},viewer=s.current){return config.render(s,viewer,E.legal(s,viewer),{esc,draft});}
for(const edition of ['usa','europe']){
 test(`${edition}: geographic cities and shapes are bundled for every route endpoint`,()=>{const g=context.window.HubTicketGeography[edition];assert.deepEqual(Object.keys(g.cities).sort(),Object.keys(E.maps[edition].cities).sort());assert.ok(g.land.length>2);for(const p of Object.values(g.cities))assert.ok(p[0]>0&&p[0]<1040&&p[1]>0&&p[1]<680);});
 test(`${edition}: preview displays only the two selected cities without changing kept tickets`,()=>{const s=state(edition),ids=s.offers[s.current],before=JSON.stringify(s),draft={ticketMask:'3'};config.choose(draft,'ticket',String(ids[2]),{target:{getAttribute:()=>null}});assert.equal(draft.ticketMask,'3');const html=render(s,draft),t=E.maps[edition].tickets[ids[2]];assert.equal((html.match(/class="tr-endpoint"/g)||[]).length,2);assert.ok(html.includes(`data-city="${esc(t.a)}"`));assert.ok(html.includes(`data-city="${esc(t.b)}"`));assert.match(html,/tr-destination-guide/);assert.equal(JSON.stringify(s),before);});
 test(`${edition}: keep toggle also previews that ticket; clearing and route inspection work`,()=>{const s=state(edition),id=s.offers[s.current][1],draft={route:'0'};config.choose(draft,'ticketMask','1',{target:{getAttribute:()=>String(id)}});assert.equal(draft.ticket,String(id));assert.equal(draft.route,'');let html=render(s,draft);assert.match(html,/Choose more tickets/);config.choose(draft,'route','0',{});html=render(s,draft);assert.match(html,/tr-route-glow/);assert.doesNotMatch(html,/class="tr-destination-guide"/);config.choose(draft,'clearFocus','yes',{});assert.doesNotMatch(render(s,draft),/class="tr-endpoint"/);});
 test(`${edition}: held tickets remain inspectable while waiting, but opponents tickets stay private`,()=>{let s=state(edition);s=E.apply(s,s.current,{type:'tickets',mask:3}).state;const html=render(s,{ticket:String(s.players[0].tickets[0])},0);assert.match(html,/Your destinations/);assert.equal((html.match(/class="tr-ticket-preview"/g)||[]).length,2);assert.match(html,/Waiting for/);});
}

test('online payment renders safely while a move is sending and actions are withheld',()=>{
 let s=state('usa');s=E.apply(s,0,{type:'tickets',mask:3}).state;s=E.apply(s,1,{type:'tickets',mask:3}).state;
 const route=E.maps.usa.routes.find(r=>r.n===1);s.players[s.current].hand[route.c==='gray'?'red':route.c]=8;
 s=E.apply(s,s.current,{type:'claim',route:route.id}).state;
 assert.equal(s.phase,'payment');
 const html=config.render(s,s.current,[],{esc,draft:{}});assert.match(html,/Waiting for your move to sync/);assert.doesNotMatch(html,/data-move=/);
});
