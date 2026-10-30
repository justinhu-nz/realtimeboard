const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
for (const file of ['index.html', 'index2.html']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
  const store = new Map();
  const context = vm.createContext({console: {...console, warn() {}}, URL, AbortSignal, Intl, Date,
    location: {hash: '', href: 'https://board.example/'},
    localStorage: {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)},
    window: {addEventListener() {}}, document: {getElementById() {return {};}, querySelector() {return null;}},
    fetch: async () => {throw new Error('Offline');}
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  assert.equal(run('secValue(null)'), undefined);
  assert.equal(run('secValue("")'), undefined);
  assert.equal(run('secValue(false)'), undefined);
  assert.equal(run('secValue(0)'), 0);
  assert.equal(run('secToMs(null)'), undefined);
  assert.equal(run('occupancyLevel(null)'), 0);
  assert.equal(run('occupancyLevel(0)'), 1);
  assert.equal(run('normalizeRealtime({entity:[null, 42, {}]}, "test").alerts.length'), 0);

  run(`var prior = {stopSequence:1,departureDelay:120};
    var noData = {stopSequence:2,scheduleRelationship:'NO_DATA'};
    var trip = {updates:{stop:noData}, orderedUpdates:[prior,noData], tripDelay:180};`);
  assert.equal(run('propagatedStopUpdate(trip,"stop",2)'), null);
  assert.equal(run('propagatedStopUpdate(trip,"later",3)'), null);
  run('trip.orderedUpdates.push({stopSequence:3,departureDelay:60})');
  assert.equal(run('propagatedStopUpdate(trip,"later",4).departureDelay'), 60);
  run('trip.orderedUpdates=[prior,{stopSequence:2,scheduleRelationship:"SKIPPED"}]');
  assert.equal(run('propagatedStopUpdate(trip,"later",3).departureDelay'), 120);
  run('trip.orderedUpdates=[prior,{stopSequence:2,departureTime:123456}]');
  assert.equal(run('propagatedStopUpdate(trip,"later",3)'), null);

  // Both Auckland DST transitions, overnight GTFS times, invalid/blank times.
  for (const [date, time, expected] of [
    ['20260927','01:30:00','2026-09-26T12:30:00.000Z'],
    ['20260405','01:30:00','2026-04-04T13:30:00.000Z'],
    ['20260926','25:30:00','2026-09-26T13:30:00.000Z'],
    ['20261031','12:00:00','2026-10-30T23:00:00.000Z']
  ]) assert.equal(run(`new Date(gtfsEpoch('${date}','${time}','Pacific/Auckland')).toISOString()`), expected);
  assert(run('Number.isNaN(gtfsEpoch("20261031","","UTC"))'));
  assert(run('Number.isNaN(gtfsEpoch("20261031","12:99:00","UTC"))'));
  assert.equal(run('csvParse("\\uFEFFstop_id,stop_name\\r\\ns,\\\"A, B\\\"\\r\\n")[0].stop_id'), 's');
  run('eval(stopTimesFilterSource());');
  assert.equal(run('filterStopTimes("\\uFEFFstop_id,trip_id\\ns,t",["s"])[0].trip_id'), 't');
  assert.equal(run('filterStopTimes("stop_id,trip_id",["s"]).length'), 0);

  context.multilineCsv = '\"stop_id\",trip_id,stop_headsign\ns,t,\"City\nCentre\"';
  assert.equal(run('filterStopTimes(multilineCsv,["s"])[0].stop_headsign'), 'City\nCentre');

  run(`state.config={...DEFAULT_CONFIG,timezone:'UTC',stopIds:'s',dualStopMode:false,lookaheadHours:48,subscriptionKey:'key'};
    state.now=new Date('2026-10-31T12:00:00Z');
    state.bundle={stops:{s:{name:'Stop'}},routes:{r:{routeId:'r',shortName:'BUS'}},trips:{t:{headsign:'Town'}},
      calendars:{},calendarDates:{daily:['20261031','20261101','20261102'].map(date=>({date,exception_type:'1'}))},
      stopTimesByStop:{s:[{tripId:'t',routeId:'r',serviceId:'daily',departureTime:'10:00:00',stopSequence:1}]}};
    state.realtime=null;`);
  assert.equal(run('deriveDepartures().length'), 2, '48 hours includes the second following day');
  run(`state.realtime={fetchedAt:state.now.getTime(),trips:{},movements:{'t:s':{cancelled:true,scheduled:Date.parse('2026-10-31T10:00:00Z')}}};`);
  assert(run('deriveDepartures().every(row=>row.status==="scheduled")'), 'cancellation from another service day must not leak');
  run(`state.config.lookaheadHours=1;state.bundle.stopTimesByStop.s[0].departureTime='12:30:00';
    state.realtime={fetchedAt:state.now.getTime(),trips:{t:{startDate:'20261031',updates:{s:{departureDelay:3600}}}}};`);
  assert.equal(run('deriveDepartures().length'), 0, 'prediction outside lookahead is excluded');
  run(`state.bundle.stopTimesByStop.s[0].departureTime='bad';state.realtime=null;`);
  assert.equal(run('deriveDepartures().length'), 0);

  run(`state.config={...DEFAULT_CONFIG,subscriptionKey:'key',departuresUrl:'',realtimeUrl:'https://test/trips',alertsUrl:'',vehiclesUrl:''};
    state.realtime={fetchedAt:123,trips:{}};var previous=state.realtime;`);
  await run('refreshRealtime()');
  assert.equal(run('state.refreshFailed'), true, 'disabled departures task must not mask all configured feeds failing');
  assert.equal(run('state.subKeyOk'), false);
  assert(run('state.realtime===previous'), 'failed request retains previous cache');
  assert.equal(run('state.refreshing'), false);

  // Slow requests finishing out of order must not overwrite a newer result.
  run(`var pending=[];fetch=()=>new Promise(resolve=>pending.push(resolve));`);
  const first = run('refreshRealtime()');
  const second = run('refreshRealtime()');
  run(`pending[1]({ok:true,json:async()=>({entity:[{trip_update:{trip:{trip_id:'new'}}}]})});`);
  await second;
  run(`pending[0]({ok:true,json:async()=>({entity:[{trip_update:{trip:{trip_id:'old'}}}]})});`);
  await first;
  assert(run('Boolean(state.realtime.trips.new) && !state.realtime.trips.old'));

  run(`saveJson('config',{stopIds:42,routeColors:null,dualStopMode:'false',pageSize:-1,timezone:'Invalid/Zone'});var loaded=loadConfig();`);
  assert.equal(run('typeof loaded.stopIds'), 'string');
  assert.equal(run('typeof loaded.routeColors'), 'string');
  assert.equal(run('typeof loaded.dualStopMode'), 'boolean');
  assert.equal(run('loaded.pageSize'), 1);
  assert.equal(run('loaded.timezone'), 'Pacific/Auckland');
  run(`saveJson('bundle',{stops:{s:{}},stopTimesByStop:[]});`);
  assert.equal(run('loadBundle()'), null);
  run("saveJson('realtime',{fetchedAt:Date.now(),trips:{},vehicles:{},alerts:{}})");
  assert.equal(run('loadRealtime()'), null);
  run(`var rendered=0;render=()=>{rendered++};localStorage.setItem=()=>{throw new Error('Quota exceeded')};saveJson('config',{});`);
  assert.equal(run('rendered'), 0, 'storage failure must not start another render/request loop');
  assert(run('state.status.includes("Storage unavailable")'));

  if (file === 'index2.html') {
    run(`motatAddFix({deviceId:1,fixTime:new Date().toISOString(),latitude:null,longitude:174.7});
      motatAddFix({deviceId:2,fixTime:new Date(Date.now()+3600000).toISOString(),latitude:-36.8,longitude:174.7});`);
    assert.equal(run('Object.keys(motat.trams).length'), 0);
    run(`boardSource='motat';state.config={...MOTAT_DEFAULT_CONFIG,closedDates:'2026-10-31'};
      state.now=new Date('2026-10-30T23:00:00Z');motat.lastOk=state.now.getTime();
      motatActiveTrams=()=>[{onLine:true}];motatTramLegs=()=>{throw new Error('Closed service must not predict')};`);
    assert.equal(run('motatDepartures().length'), 0);
    run('resetAll()');
    assert.equal(run('boardSource'), 'at');
    assert.equal(run('motat.lastOk'), 0);
    assert.equal(run('state.pageLocked'), false);
  }
  console.log(file + ': realtime failures/races, missing values, propagation, DST, CSV BOM, 48-hour horizon, service-day cancellation, corrupt settings/cache, storage failure' + (file === 'index2.html' ? ', MOTAT GPS and closures' : '') + ' passed');
}
})().catch(error => {console.error(error);process.exitCode=1;});
