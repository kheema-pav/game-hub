'use strict';
// Real browser checks run in CI. No real Firebase requests are made.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'artifacts', 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/shared/firebase-config.js') { response.writeHead(200, { 'Content-Type': 'application/javascript' }); response.end('window.HUB_FIREBASE_CONFIG=null;'); return; }
  const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  fs.readFile(file, (error, content) => { response.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' }); response.end(error ? 'Missing file' : content); });
});
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  try {
    for(const [kind,width,height] of [['chromium',360,780],['chromium',390,844],['chromium',768,1024],['chromium',1280,900],['webkit',810,1080]]) {
      const browser=await ({chromium,webkit}[kind]).launch();
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,serviceWorkers:'block'});
      await context.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const shot=async(name)=>page.screenshot({path:path.join(shots,`${name}-${kind}-${width}.png`),fullPage:true});
      const fit=async(label)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),label+' fits '+width);
      try {
        // Real setup clicks before there is any game or save, including touch-sized iPad WebKit.
        await page.goto(url+'/codex/?mode=solo');
        await page.getByRole('button',{name:'4 players',exact:true}).click();
        assert.equal(await page.locator('.ngrow').count(),4);
        await page.getByLabel('Player 1 name',{exact:true}).fill('Cy');
        await page.locator('.ngrow').nth(1).getByRole('button',{name:'Expert',exact:true}).click();
        assert.equal(await page.locator('.ngrow').nth(1).locator('[data-v="expert"]').getAttribute('class'),'segb on');
        assert.equal(await page.getByLabel('Player 1 name',{exact:true}).inputValue(),'Cy');
        await page.locator('.ngrow').nth(2).getByRole('button',{name:'Human',exact:true}).click();
        assert.equal(await page.locator('.ngrow').nth(2).getByRole('button',{name:'Expert',exact:true}).count(),0);
        await page.getByRole('button',{name:'2 players',exact:true}).click();
        assert.equal(await page.locator('.ngrow').count(),2);
        await fit('Codex setup');await shot('codex-setup');
        await page.getByRole('button',{name:'Start game',exact:true}).click();
        assert.equal(await page.getByRole('heading',{name:'Cy, prepare your codex',exact:true}).count(),1);

        // Catan fixture uses legal setup moves and an engine roll; no real room is involved.
        await page.goto(url+'/isles/');
        const produced=await page.evaluate(()=>{
          G=E.newGame({seed:101,mode:'base',target:10,players:['Cy','Zenia','Friend','Guest'].map((name,i)=>({name,color:E.COLOR_IDS[i],bot:false}))});
          for(let i=0;i<32&&G.phase==='setup';i++) {const r=Bot.step(G);if(!r.ok)throw Error('setup fixture: '+r.err);}
          if(G.phase!=='roll')throw Error('setup did not finish');
          G.fx=[];ui.cfg.hideHands=false;enterGame();
          const productive=G.board.hexes.find(h=>h.number&&h.id!==G.robber&&h.v.some(v=>G.vb[v]));
          const n=productive.number,a=Math.max(1,n-6);E.doRoll(G,[a,n-a]);
          const fx=G.fx.find(f=>f.type==='produce');afterAction();
          return {gains:fx.gains,names:G.players.map(p=>p.name),resources:E.RES_NAME};
        });
        assert.equal(await page.locator('.pchip').count(),4);
        assert.ok((await page.locator('.route-stats').allTextContents()).every(t=>/Roads 2/.test(t)&&/Longest [1-9]/.test(t)));
        const receipt=await page.locator('#production').innerText();
        for(const [p,gains] of Object.entries(produced.gains)) {
          assert.ok(receipt.includes(produced.names[p]));
          for(const [resource,n] of Object.entries(gains)) assert.ok(receipt.includes('+'+n+' '+produced.resources[resource]));
        }
        await fit('Catan game');await shot('catan-production');
        assert.ok(await page.evaluate(()=>{const board=document.querySelector('.board-wrap').getBoundingClientRect(),log=document.querySelector('.activity-area').getBoundingClientRect();return board.bottom<=log.top+1||board.right<=log.left+1;}),'activity never overlays the island');
        // Long recent and full history both scroll, updates preserve reading position.
        await page.evaluate(()=>{G.log=Array.from({length:90},(_,i)=>({t:'Event '+i,p:null,turn:Math.floor(i/30)+1}));G.turnNo=3;renderTicker();});
        assert.equal(await page.locator('.ha-recent li').count(),60);
        await page.locator('.ha-heading').click();
        assert.equal(await page.locator('.ha-dialog:modal').count(),1);
        assert.equal(await page.locator('.ha-full li').count(),90);
        await page.locator('.ha-full').evaluate(el=>el.scrollTop=0);
        await page.evaluate(()=>{G.log.push({t:'Newest event',p:null,turn:3});renderTicker();});
        assert.equal(await page.locator('.ha-full').evaluate(el=>el.scrollTop),0);
        await page.getByRole('button',{name:'Jump to latest',exact:true}).click();
        assert.ok(await page.locator('.ha-full').evaluate(el=>el.scrollTop>0));
        await shot('full-game-log');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.ha-dialog:modal').count(),0);
        await page.locator('.ha-recent').focus();await page.keyboard.press('Enter');
        assert.equal(await page.locator('.ha-dialog:modal').count(),1);
        await page.getByRole('button',{name:'Close game log',exact:true}).click();
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.equal(await page.locator('.receipt-row').first().evaluate(el=>getComputedStyle(el).animationName),'none');

        // Named Splendor move feedback remains next to the market on small screens.
        await page.goto(url+'/gems/');
        await page.evaluate(()=>{
          startGame([{name:'Cy',type:'human',level:'medium'},{name:'Friend',type:'human',level:'medium'}]);
          ui.handoff=false;render();
          humanAct({t:'take',gems:COLORS.slice(0,3)});
          ui.handoff=false;render();
        });
        assert.match(await page.locator('.move-receipt').innerText(),/Cy.*took/s);
        assert.equal(await page.locator('.receipt-gem').count(),3);
        await fit('Splendor');await shot('splendor-feedback');
        assert.equal(await page.locator('.roomcode').count(),0);

        // Every other tabletop stays usable at the same device widths.
        for(const id of ['connect4','reversi','ludo','azul','ticket','yahtzee']) {
          await page.goto(url+'/'+id+'/?mode=local');
          await page.getByRole('button',{name:'Start new game',exact:true}).click();
          const ready=page.getByRole('button',{name:'Ready, show my turn',exact:true});
          if(await ready.count())await ready.click();
          await fit(id);await shot(id+'-review');
          if(id==='connect4') {
            await page.getByRole('button',{name:'Drop a disc in column 1',exact:true}).click();
            await page.locator('.ha-heading').click();
            assert.match(await page.locator('.ha-full').innerText(),/Drop in column 1/);
            await page.getByRole('button',{name:'Close game log',exact:true}).click();
            await page.goto(url+'/connect4/#continue');await page.reload();
            assert.match(await page.locator('.ha-recent').innerText(),/Drop in column 1/);
          }
        }
        await page.goto(url+'/sketch/?mode=local');await fit('Pictionary setup');await shot('pictionary-review');
        assert.deepEqual(errors,[],`${kind} ${width}: no runtime errors`);
        console.log('Mobile feedback passed:',kind,width);
      } finally {await browser.close();}
    }
  } finally {server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
