'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const playSource=source.slice(source.indexOf('function playHTML(){'),source.indexOf('function paintTools(){'));
function view(uid){
 const ON={uid,D:{cur:{drawer:'drawer',word:{w:'private-example'}}}};
 return new Function('ON','PEN','PEN_NAMES','HubKit','esc',playSource+';return playHTML();')(ON,['#000','#f00'],['Black','Red'],{buttonHTML:()=>''},String);
}
test('online drawing view keeps tools with the drawer and guess input with guessers',()=>{
 const drawer=view('drawer'),guesser=view('guest');
 assert.match(drawer,/data-oa="pen"/);assert.match(drawer,/aria-label="Fine pen"/);
 assert.doesNotMatch(drawer,/id="gform"/);assert.match(guesser,/id="gform"/);
 assert.doesNotMatch(guesser,/data-oa="pen"/);assert.doesNotMatch(guesser,/private-example/);
 assert.equal((drawer.match(/<canvas/g)||[]).length,1);assert.equal((guesser.match(/<canvas/g)||[]).length,1);
});
test('compact drawing layout follows the visual viewport when the phone keyboard opens',()=>{
 const sync=source.slice(source.indexOf('function syncVV(){'),source.indexOf('if(window.visualViewport){visualViewport.addEventListener'));
 const properties={},classes=new Set();
 const window={innerHeight:844,visualViewport:{height:844,offsetTop:0}};
 const document={documentElement:{style:{setProperty:(k,v)=>properties[k]=v},classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k)}}};
 const update=new Function('window','document',sync+';syncVV();');
 update(window,document);assert.equal(classes.has('compact-play'),false);
 window.visualViewport={height:420,offsetTop:12};update(window,document);
 assert.equal(classes.has('compact-play'),true);assert.equal(properties['--vvh'],'420px');assert.equal(properties['--vvt'],'12px');
 window.visualViewport.height=844;update(window,document);assert.equal(classes.has('compact-play'),false);
});
