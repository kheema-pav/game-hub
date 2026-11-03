'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const A=require('../activity.js');
test('recent history retains all of the last completed turn plus current activity',()=>{
 const entries=[{text:'old',group:1},...Array.from({length:30},(_,i)=>({text:'event '+i,group:2})),{text:'roll',group:3}];
 assert.equal(A.recent(entries,3).length,31);
 assert.equal(A.recent(entries,3)[0].text,'event 0');
 assert.equal(A.recent(entries,4).length,1);
});
test('new games, skipped turn numbers and legacy logs have usable previews',()=>{
 assert.deepEqual(A.recent([],1),[]);
 const entries=[{text:'before',group:7},{text:'now',group:12}];
 assert.deepEqual(A.recent(entries,12),entries);
 assert.deepEqual(A.recent([{text:'old saved log'}],3),[{text:'old saved log'}]);
});
test('plain-text game history escapes names and moves',()=>{
 const html=A.html('game',[{text:'<img src=x onerror=alert(1)>',group:1}],1);
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img'));
});
