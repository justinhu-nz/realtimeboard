// A timetabled trip that AT's departures list leaves out is treated as not running
// (e.g. the 23:04 O-W at Kingsland P2 on 17 Nov 2026, replaced by buses), within limits.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
for (const file of ['index.html', 'index2.html', 'index-live.html']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
  const store = new Map();
  const context = vm.createContext({console: {...console, warn() {}, log() {}}, URL, AbortSignal, Intl, Date,
    location: {hash: '', href: 'https://board.example/'},
    localStorage: {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)},
    window: {addEventListener() {}}, document: {getElementById() {return {};}, querySelector() {return null;}},
    fetch: async () => {throw new Error('Offline');}
  });
  const run = code => vm.runInContext(code, context);
  run(source);

  const NOW = Date.parse('2026-11-17T22:39:00Z');
  const at = min => NOW + min * 60000;
  // GTFS clock on service day 2026-11-17 (UTC board): past midnight is 24:xx.
  const hhmm = min => { const t = (at(min) - Date.parse('2026-11-17T00:00:00Z')) / 60000; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') + ':00'; };
  const setup = ({owMin = 25, busMin = 20} = {}) => {
    run(`state.config={...DEFAULT_CONFIG,timezone:'UTC',stopIds:'9305-k2,8204-bus',dualStopMode:false,lookaheadHours:2,subscriptionKey:''};
      state.now=new Date(${NOW});`);
    context.__bundle = {
      stops: {'9305-k2': {stopId: '9305-k2', name: 'Kingsland 2', siblingCodes: ['9304']}, '8204-bus': {stopId: '8204-bus', name: 'Bus stop', siblingCodes: []}},
      routes: {'O-W': {routeId: 'O-W', type: 2, shortName: 'O-W'}, '20': {routeId: '20', type: 3, shortName: '20'}},
      trips: {'ow-1-aaaaaaaa': {headsign: 'Henderson'}, 'bus-1-bbbbbbbb': {headsign: 'Town'}, 'bus-2-cccccccc': {headsign: 'Town'}},
      calendars: {}, calendarDates: {daily: [{date: '20261117', exception_type: '1'}]},
      stopTimesByStop: {
        '9305-k2': [{tripId: 'ow-1-aaaaaaaa', routeId: 'O-W', serviceId: 'daily', stopId: '9305-k2', departureTime: hhmm(owMin), stopSequence: 10}],
        '8204-bus': [{tripId: 'bus-1-bbbbbbbb', routeId: '20', serviceId: 'daily', stopId: '8204-bus', departureTime: hhmm(busMin), stopSequence: 5},
                     {tripId: 'bus-2-cccccccc', routeId: '20', serviceId: 'daily', stopId: '8204-bus', departureTime: hhmm(busMin + 15), stopSequence: 5}]
      }
    };
    run('state.bundle=__bundle;');
  };
  const live = (movements, stopsAnswered, fetchedAt = NOW) => {
    context.__rt = {fetchedAt, trips: {}, vehicles: {}, alerts: [], movements, stopsAnswered};
    run('state.realtime=__rt;');
  };
  const mv = (tripId, code, min, extra = {}) => ({[tripId + ':' + code]: {tripId, code, scheduled: at(min), monitored: false, boarding: true, routeId: '', routeLabel: '', destination: '', ...extra}});
  const ids = () => JSON.parse(run('JSON.stringify(deriveDepartures().map(r => r.tripId))'));
  const otherPlatform = mv('ew-9-dddddddd', '9304', 19);

  setup();
  live({...otherPlatform}, {'9305': 0, '9304': 1});
  assert(!ids().includes('ow-1-aaaaaaaa'), `${file}: train AT dropped, other platform listed -> hidden`);

  live({}, {'9305': 0, '9304': 0});
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: empty answer at every platform is unknown -> shown`);

  live({...otherPlatform}, {'9304': 1});
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: no answer for this platform -> shown`);

  live({...otherPlatform}, undefined);
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: cached realtime without stop answers -> shown`);

  live({...otherPlatform, ...mv('ow-1-aaaaaaaa', '9305', 25)}, {'9305': 1, '9304': 1});
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: untracked but listed -> shown`);

  live({...otherPlatform, '~ow-1:9305': {tripId: 'ow-1-eeeeeeee', code: '9305', scheduled: at(25), boarding: true}}, {'9305': 1, '9304': 1});
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: listed under a new version hash -> shown`);

  live({...otherPlatform}, {'9305': 0, '9304': 1}, NOW - 3600000);
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: stale live data -> timetable`);

  setup({owMin: 1});
  live({...otherPlatform}, {'9305': 0, '9304': 1});
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: due within 2 minutes -> shown`);

  setup({owMin: 110});
  live({...otherPlatform}, {'9305': 0, '9304': 1});
  assert(ids().includes('ow-1-aaaaaaaa'), `${file}: beyond 100 minutes -> shown`);

  // Buses follow the same rule, and AT-only trips replace dropped ones.
  setup();
  live({...mv('bus-2-cccccccc', '8204', 35)}, {'8204': 1});
  let got = ids();
  assert(!got.includes('bus-1-bbbbbbbb') && got.includes('bus-2-cccccccc'), `${file}: bus AT dropped -> hidden, listed bus kept`);

  live({...mv('bus-9-ffffffff', '8204', 22, {routeId: '20', routeLabel: '20', destination: 'Town'}),
        ...mv('bus-8-ffffffff', '8204', 24, {routeId: '999', routeLabel: '999', destination: 'Elsewhere'})}, {'8204': 2});
  got = ids();
  assert(got.includes('bus-9-ffffffff'), `${file}: AT-only bus on a board route -> shown`);
  assert(!got.includes('bus-8-ffffffff'), `${file}: AT-only bus on a route not on the board -> not shown`);

  live({...otherPlatform, ...mv('ew-7-ffffffff', '9305', 30, {routeLabel: 'E-W', destination: 'Manukau via City Centre'})}, {'9305': 1, '9304': 1});
  const liveTrain = JSON.parse(run('JSON.stringify(deriveDepartures().find(r => r.tripId === "ew-7-ffffffff") || null)'));
  assert(liveTrain && liveTrain.rail && liveTrain.destination === 'Manukau via City', `${file}: AT-only train at a platform -> shown as rail`);

  // Refresh: an empty platform triggers a check of its sibling platform.
  setup();
  const asked = [];
  context.fetch = async url => {
    const code = String(url).split('/').pop().split('?')[0];
    asked.push(code);
    const movements = code === '9304' ? [{trip_id: 'ew-9-dddddddd', scheduledDepartureTime: new Date(at(19)).toISOString(), route_short_name: 'E-W'}] : [];
    return {ok: true, status: 200, json: async () => ({response: {movements, extensions: []}})};
  };
  run(`state.config.departuresUrl='https://api.example/departures';state.config.realtimeUrl='';state.config.alertsUrl='';state.config.vehiclesUrl='';`);
  await run('refreshRealtime()');
  assert(asked.includes('9304'), `${file}: sibling platform fetched when a platform is empty`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.realtime.stopsAnswered)')), {'9305': 0, '8204': 0, '9304': 1}, `${file}: answers recorded per stop`);
  run(`state.realtime.fetchedAt=${NOW};`); // refresh stamps the real clock; the board clock is fixed
  assert(!ids().includes('ow-1-aaaaaaaa'), `${file}: end to end -> dropped train hidden`);
  console.log(`dropped-trips ${file}: ok`);
}
})().catch(err => { console.error(err); process.exit(1); });
