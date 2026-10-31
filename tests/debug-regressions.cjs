const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  for (const file of ['index.html', 'index2.html', 'index-live.html']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
    const context = vm.createContext({console, URL, AbortSignal, Intl, Date,
      location: {hash: '', href: 'https://board.example/'},
      localStorage: {getItem() {return null;}, setItem() {}},
      window: {addEventListener() {}}, document: {getElementById() {return {};}, querySelector() {return null;}}
    });
    const run = code => vm.runInContext(code, context);
    run(source);
    run(`render=()=>{};renderSetup=()=>{};
      state.config={...DEFAULT_CONFIG,stopIds:'s',dualStopMode:false,fourWayMode:false,routeAllowlist:'',requireSubscriptionKey:false};
      state.gtfs={source:'fixture',feedInfo:[],calendars:[],calendarDates:[],stops:[{stop_id:'s'}],
        routes:[{route_id:'r',route_short_name:'BUS'}],trips:[{trip_id:'t',route_id:'r',service_id:'daily'}]};
      var fixture=[{stop_id:'s',trip_id:'t',departure_time:'12:00:00'},
        {stop_id:'s',trip_id:'t',arrival_time:'12:10:00'},
        {stop_id:'s',trip_id:'t',departure_time:'invalid'}];
      selectedStopTimesFor=async()=>fixture;`);
    await run('buildBundle({open:false})');
    assert.equal(run('state.config.mode'), 'setup', file + ': background builds must preserve setup');
    assert.equal(run('state.bundle.stopTimesByStop.s.length'), 2, file + ': invalid times are omitted and arrival fallback is supported');
    run(`var previous=state.bundle;var finishScan;
      selectedStopTimesFor=()=>new Promise(resolve=>finishScan=resolve);`);
    const pending = run('buildBundle()');
    run(`state.config.stopIds='another-stop';finishScan(fixture);`);
    await pending;
    assert(run('state.bundle===previous'), file + ': obsolete builds must not overwrite the current bundle');
    assert.equal(run('state.config.mode'), 'setup');
    run(`state.config.stopIds='s';`);
    const resetBuild = run('buildBundle()');
    run('state.gtfs=null;state.bundle=null;finishScan(fixture)');
    await resetBuild;
    assert.equal(run('state.bundle'), null, file + ': pending build must not restore reset data');
    run(`var finishParse;gtfsWorkerTask=()=>new Promise(resolve=>finishParse=resolve);
      state.config.mode='setup';`);
    const loading = run(`fetchGtfs({candidates:['https://fixture.example/gtfs/'],quiet:true})`);
    run(`resetAll();state.gtfsLoading=true;finishParse({'stops.txt':[], 'routes.txt':[], 'trips.txt':[]});`);
    assert.equal(await loading, false, file + ': reset invalidates a pending download');
    assert.equal(run('state.gtfs'), null, file + ': completed parser must not restore reset data');
    assert.equal(run('state.gtfsLoading'), true, file + ': old download must not clear a newer loading state');
    run(`state.bundle={generatedAt:'2000-01-01'};state.config.mode='board';
      var finishFetch;fetchGtfs=()=>new Promise(resolve=>finishFetch=resolve);
      var buildOptions;buildBundle=async options=>{buildOptions=options};`);
    const refresh = run('maybeRebuildStaleBundle()');
    run(`state.config.mode='setup';finishFetch(true);`);
    await refresh;
    assert.equal(run('buildOptions.open'), false, file + ': stale refresh must not navigate');
    assert.equal(run(`normalizeRealtime({entity:[{alert:{header_text:{translation:[{text:'Alert'}]},informed_entity:[null,42,{stop_id:'s'}]}}]},'test').alerts[0].stopIds.join(',')`), 's');
    console.log(file + ': background builds, obsolete build/reset races, missing times, malformed alert selectors passed');
  }
})().catch(error => {console.error(error);process.exitCode=1;});
