const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 try {
 for(const file of ['index.html','index2.html','index-live.html']){
  const context=await browser.createBrowserContext();const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith('file:')?req.continue():req.abort());
  await page.goto(pathToFileURL(path.join(__dirname,'..',file)).href,{waitUntil:'networkidle0'});
  assert(await page.$('.setup'));
  await page.click('[data-action=colorDemo]');
  assert(await page.$('.board'));
  await page.click('[data-action=setup]');
  assert(await page.$('.setup'));
  await page.evaluate(()=>{
   state.config={...DEFAULT_CONFIG,mode:'board',requireSubscriptionKey:false,stopIds:'s',dualStopMode:false};
   state.bundle={generatedAt:new Date().toISOString(),stops:{s:{name:'Test stop'}},routes:{r:{routeId:'r',shortName:'BUS',type:3}},trips:{t:{headsign:'Town'}},calendars:{},calendarDates:{daily:[{date:dateKeyFor(new Date(),state.config.timezone),exception_type:'1'}]},stopTimesByStop:{s:[{tripId:'t',routeId:'r',serviceId:'daily',departureTime:timeLabel(Date.now()+600000,state.config.timezone),stopSequence:1}]}};
   bundleRefreshAttempted=true;render();
  });
  assert(await page.$('.board'));
  assert((await page.$eval('.board',el=>el.textContent)).includes('Town'));
  // A slow refresh resolves after navigation: setup must stay visible.
  await page.evaluate(()=>{refreshRealtime=()=>new Promise(resolve=>{window.finishRefresh=resolve});});
  await page.evaluate(()=>{document.querySelector('[data-action=refresh]').click();document.querySelector('[data-action=setup]').click();});
  await page.evaluate(()=>window.finishRefresh());
  assert(await page.$('.setup'));assert.equal(await page.$('.board'),null);
  // Share dialog works and does not throw on the actual DOM.
  await page.evaluate(()=>openShareDialog());assert(await page.$('dialog[open]'));
  await page.click('[data-close-share]');
  // A connection test must not redraw setup after opening the board.
  await page.evaluate(()=>{state.connectOpen=true;state.editingKey=true;renderSetup();});
  await page.evaluate(()=>{
   document.querySelector('[data-action=fetchRealtime]').click();
   state.config.mode='board';renderBoard();
   window.finishRefresh();
  });
  assert(await page.$('.board'), file+' connection test navigated back to setup');
  assert.equal(await page.$('.setup'),null);
  await page.click('[data-action=setup]');
  for(const width of [375,768,1440]){
   await page.setViewport({width,height:900});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(overflow,false, file+' setup overflows at '+width+'px');
  }
  assert.deepEqual(errors,[]);
  console.log(file+': browser startup, demo, scheduled board, refresh/navigation race, share dialog passed without uncaught errors');
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
