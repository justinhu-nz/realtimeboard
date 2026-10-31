const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
for (const file of ['index.html', 'index2.html', 'index-live.html']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
  const store = new Map();
  const location = {href: `https://board.example/${file}?apiKey=OLD-QUERY-SECRET#debug`, hash:'', pathname:`/${file}`, search:''};
  const context = vm.createContext({console, URL, location, history:{replaceState(){location.hash='';}}, localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},window:{addEventListener(){}},document:{getElementById(){return {}},querySelector(){return null}},Intl,Date});
  const run = code => vm.runInContext(code,context);
  run(source);
  run(`state.config = {...DEFAULT_CONFIG,subscriptionKey:'PRIVATE-AT-KEY',departuresKey:'PRIVATE-DEPARTURES-KEY',trackerToken:'PRIVATE-TRACKER-TOKEN',gtfsUrl:'https://private-feed.example/',realtimeUrl:'https://private-realtime.example/',pollSeconds:35,timezone:'UTC',stopIds:'bus-west, bus-city',dualStopMode:true,dualStopLeftLabel:'West / Whānau 🚌',dualStopRightLabel:'City',fourWayMode:true,trainStationLabel:'Our station',trainLeftStopId:'platform-1',trainRightStopId:'platform-2',trainLeftRoutes:'WEST',trainRightRoutes:'EAST, WEST',pageSize:7};`);
  const url = run('boardShareUrl()');
  assert(!url.includes('PRIVATE'));
  assert(!url.includes('private-feed'));
  assert(!url.includes('private-realtime'));
  assert(!url.includes('OLD-QUERY-SECRET'));
  assert.strictEqual(new URL(url).search,'');
  const payload = JSON.parse(decodeURIComponent(new URL(url).hash.slice(7)));
  for (const key of ['subscriptionKey','departuresKey','trackerToken','gtfsUrl','realtimeUrl','vehiclesUrl','alertsUrl','departuresUrl','pollSeconds','timezone','requireSubscriptionKey','mode']) assert(!Object.hasOwn(payload.preferences,key),key+' must never be exported');
  assert.strictEqual(payload.preferences.trainRightRoutes,'EAST, WEST');
  run(`state.config = {...DEFAULT_CONFIG,subscriptionKey:'RECIPIENT-KEY',gtfsUrl:'https://recipient-feed.example/',pollSeconds:45}; saveConfig();`);
  // Even a hand-edited link must not import connection settings or change the startup mode.
  payload.preferences.subscriptionKey='INJECTED';payload.preferences.gtfsUrl='https://injected.example/';payload.preferences.requireSubscriptionKey=false;payload.preferences.mode='board';
  location.hash='#board='+encodeURIComponent(JSON.stringify(payload));
  run('applySharedBoardLink()');
  assert.strictEqual(run('state.config.subscriptionKey'),'RECIPIENT-KEY');
  assert.strictEqual(run('state.config.gtfsUrl'),'https://recipient-feed.example/');
  assert.strictEqual(run('state.config.pollSeconds'),45);
  assert.strictEqual(run('state.config.mode'),'setup');
  assert.strictEqual(run('state.config.requireSubscriptionKey'),true);
  assert.strictEqual(run('state.config.trainStationLabel'),'Our station');
  assert.strictEqual(run('state.config.dualStopLeftLabel'),'West / Whānau 🚌');
  assert.strictEqual(run('state.config.pageSize'),7);
  assert.strictEqual(location.hash,'');
  // Malformed links are atomic: no partial preference import.
  const before = run('JSON.stringify(state.config)');
  payload.preferences.stopIds='SHOULD-NOT-IMPORT';payload.preferences.pageSize='bad-type';
  location.hash='#board='+encodeURIComponent(JSON.stringify(payload));run('applySharedBoardLink()');
  assert.strictEqual(run('JSON.stringify(state.config)'),before);
  assert(run('state.error.startsWith("Could not load")'));
  for (const hash of ['#board=%INVALID', '#board='+encodeURIComponent(JSON.stringify({version:99,source:'at',preferences:{}})), '#board='+encodeURIComponent(JSON.stringify({version:1,source:'at',preferences:[]}))]) {
    location.hash=hash;run('applySharedBoardLink()');assert.strictEqual(run('JSON.stringify(state.config)'),before);
  }
  // Numeric preferences are clamped by the normal config sanitizer.
  payload.preferences.pageSize=999;payload.preferences.rotateSeconds=-50;
  location.hash='#board='+encodeURIComponent(JSON.stringify(payload));run('applySharedBoardLink()');
  assert.strictEqual(run('state.config.pageSize'),50);assert.strictEqual(run('state.config.rotateSeconds'),3);
  if(file==='index2.html') {
    run('boardSource="motat";state.config={...MOTAT_DEFAULT_CONFIG,stopIds:"motat-aviation",dualStopLeftLabel:"Tram city"};saveConfig()');
    const motatUrl=run('boardShareUrl()');const motatPayload=JSON.parse(decodeURIComponent(new URL(motatUrl).hash.slice(7)));
    assert.strictEqual(motatPayload.source,'motat');
    run('boardSource="at";state.config=loadConfig()');
    location.hash=new URL(motatUrl).hash;run('applySharedBoardLink()');
    assert.strictEqual(run('boardSource'),'motat');assert.strictEqual(run('state.config.stopIds'),'motat-aviation');
    assert.strictEqual(run('state.config.trackerUrl'),'https://tramtracker.motat.nz');
  }
  console.log(file+': share round-trip, Unicode, credential exclusion, incoming allowlist, malformed links, numeric bounds, and source selection passed');
}
