// Every layout takes any stop: bus, train or ferry, in any slot.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
const ctx = vm.createContext({ location: { hash: '' }, console, localStorage: { getItem() { return null; }, setItem() {} }, window: { addEventListener() {} }, document: { getElementById() { return {}; }, querySelector() { return null; } }, Intl, Date, Set, Map, WeakMap, Object, Number, String, Array, JSON, Math });
vm.runInContext(source, ctx);
const run = code => vm.runInContext(code, ctx);
run('render = () => {}; renderSetup = () => {}; scheduleAutoBuild = () => {};');

// One stop per mode, plus a train station with two platforms.
const stops = [
  { stop_id: 'bus-x', stop_code: 'bus', stop_name: 'Queen Street' },
  { stop_id: 'ferryP', stop_name: 'Ferry Terminal - Devonport', location_type: '1' },
  { stop_id: 'ferry-x', stop_code: 'ferry', stop_name: 'Devonport Ferry Terminal', parent_station: 'ferryP', platform_code: '1' },
  { stop_id: 'K', stop_name: 'Kingsland Train Station', location_type: '1' },
  { stop_id: 'K1-x', stop_code: 'K1', stop_name: 'Kingsland Train Station 1', parent_station: 'K', platform_code: '1' },
  { stop_id: 'K2-x', stop_code: 'K2', stop_name: 'Kingsland Train Station 2', parent_station: 'K', platform_code: '2' },
  { stop_id: 'WP', stop_name: 'Waitematā Train Station', location_type: '1' },
  { stop_id: 'W1-x', stop_code: 'W1', stop_name: 'Waitematā Train Station 1', parent_station: 'WP', platform_code: '1' }
];
const routes = [{ route_id: 'b', route_short_name: '25B', route_type: '3' }, { route_id: 'f', route_short_name: 'DEV', route_type: '4' }, { route_id: 't', route_short_name: 'E-W', route_type: '2' }];
const trips = [], stopTimes = [];
const trip = (id, route, headsign, calls) => {
  trips.push({ trip_id: id, route_id: route, service_id: 'daily', trip_headsign: headsign });
  calls.forEach(([stop, time], i) => stopTimes.push({ trip_id: id, stop_id: stop + '-x', stop_sequence: String(i + 1), arrival_time: time + ':00', departure_time: time + ':00', pickup_type: i === calls.length - 1 ? '1' : '0' }));
};
trip('bus1', 'b', 'Blockhouse Bay', [['bus', '12:05'], ['K1', '12:20']]);
trip('ferry1', 'f', 'Downtown', [['ferry', '12:10'], ['bus', '12:25']]);
trip('train1', 't', 'Manukau via City Centre', [['K1', '12:03'], ['W1', '12:15']]);
trip('train2', 't', 'Swanson', [['W1', '12:00'], ['K2', '12:12'], ['bus', '12:40']]);
const gtfs = { source: 'test', feedInfo: [], stops, routes, trips, calendarDates: [],
  calendars: [{ service_id: 'daily', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20200101', end_date: '20991231' }] };

async function build(cfg) {
  ctx.__cfg = cfg; ctx.__gtfs = gtfs; ctx.__st = stopTimes;
  run(`state.config = sanitizeConfig({ ...DEFAULT_CONFIG, requireSubscriptionKey: false, ...__cfg });
       state.gtfs = __gtfs; state.error = ''; state.realtime = null;
       selectedStopTimesFor = async ids => __st.filter(st => ids.has(st.stop_id));
       state.now = new Date('2026-11-17T11:58:00+13:00');`);
  await run('buildBundle({ open: false })');
  assert.strictEqual(run('state.error'), '', JSON.stringify(cfg));
  assert.strictEqual(run('bundleHasSelectedStops()'), true);
}
const routesIn = rows => Array.from(rows, r => r.routeLabel);

(async () => {
  // Single list mixing a bus stop, a ferry pier and a train platform.
  await build({ stopIds: 'bus-x, ferry-x, K1-x' });
  assert.deepStrictEqual(routesIn(run('deriveDepartures()')), ['E-W', '25B', 'DEV']);

  // Two stops: ferry on the left, train platform on the right.
  await build({ dualStopMode: true, stopIds: 'ferry-x, K2-x', dualStopLeftId: 'ferry-x', dualStopRightId: 'K2-x' });
  let html = run('renderDualStopBoards(deriveDepartures(), state.config).html');
  assert(html.includes('Downtown') && html.includes('Swanson'));

  // Stops and trains: ferry on top, train station underneath (station-wide, to city).
  const four = { dualStopMode: true, fourWayMode: true, stopIds: 'ferry-x, bus-x', dualStopLeftId: 'ferry-x', dualStopRightId: 'bus-x' };
  await build({ ...four, trainLeftStopId: 'K2-x', trainLeftShow: 'city', trainRightStopId: 'K1-x' });
  let bands = run('JSON.stringify(renderDualStopBoards(deriveDepartures(), state.config).pageRows.map(r => r.routeLabel + "@" + r.stopId))');
  assert.deepStrictEqual(JSON.parse(bands), ['DEV@ferry-x', 'E-W@K1-x', '25B@bus-x', 'E-W@K1-x']);

  // A ferry pier or bus stop underneath works too (shows its next two departures).
  await build({ ...four, trainLeftStopId: 'bus-x', trainRightStopId: 'ferry-x' });
  bands = JSON.parse(run('JSON.stringify(renderDualStopBoards(deriveDepartures(), state.config).pageRows.map(r => r.routeLabel + "@" + r.stopId))'));
  // Left: ferry on top, bus underneath. Right: bus on top, ferry underneath.
  assert.deepStrictEqual(bands, ['DEV@ferry-x', '25B@bus-x', '25B@bus-x', 'DEV@ferry-x']);
  // Same stop on top and underneath: each row appears once, the strip takes its lines.
  await build({ ...four, trainLeftStopId: 'ferry-x', trainLeftRoutes: 'DEV', trainRightStopId: 'K1-x' });
  bands = JSON.parse(run('JSON.stringify(renderDualStopBoards(deriveDepartures(), state.config).pageRows.map(r => r.routeLabel + "@" + r.stopId))'));
  assert.strictEqual(bands.filter(x => x === 'DEV@ferry-x').length, 1);

  // The top-stop route filter doesn't touch the strip, and vice versa.
  await build({ ...four, routeAllowlist: '25B', trainLeftStopId: 'K1-x', trainRightStopId: 'K2-x' });
  assert.deepStrictEqual(routesIn(run('deriveDepartures()')).sort(), ['25B', 'E-W', 'E-W']);

  // Setup: the bottom picker finds ferries and buses, train platforms first;
  // station-wide sorting is offered only at train stations.
  assert.deepStrictEqual(Array.from(run('pickerMatches("train", "Devonport")'), s => s.stop_id), ['ferry-x']);
  ctx.__stops = [...stops, { stop_id: 'KB-x', stop_code: 'KB', stop_name: 'Kingsland Bus Stop' }]; run('state.gtfs.stops = __stops');
  assert.deepStrictEqual(Array.from(run('pickerMatches("train", "Kingsland")'), s => s.stop_id), ['K1-x', 'K2-x', 'KB-x']);
  run('state.gtfs.stops = __gtfs.stops');
  assert.strictEqual(run('stripStationModesAllowed("K1-x")'), true);
  assert.strictEqual(run('stripStationModesAllowed("ferry-x")'), false);
  run('state.config.trainLeftShow = "city"; chooseSlotStop("trainLeft", "ferry-x")');
  assert.strictEqual(run('state.config.trainLeftShow'), '');                 // switching to a pier drops station sorting
  run('chooseSlotStop("trainLeft", "station:K")');
  assert.strictEqual(run('state.config.trainLeftShow'), 'city');             // a whole station starts on "to city"
  assert.strictEqual(run('state.config.trainLeftStopId'), 'K1-x');
  run('state.config.trainLeftShow = "other"; chooseSlotStop("trainLeft", "station:K")');
  assert.strictEqual(run('state.config.trainLeftShow'), 'other');            // re-picking the station keeps its direction
  run('chooseSlotStop("trainLeft", "K2-x")');
  assert.strictEqual(run('state.config.trainLeftShow'), '');                 // a platform means that exact platform
  run('state.config.trainLeftStopId = "ferry-x"; state.config.trainLeftShow = ""');
  assert.strictEqual(run('trainShowHtml("Left", state.config)'), '');
  assert.strictEqual(run('setupRoutesFor("trainLeftRoutes")'), null);      // still loading
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepStrictEqual(Array.from(run('setupRoutesFor("trainLeftRoutes")'), r => r.label), ['DEV']); // ferry lines, not filtered to trains
  // Stop labels don't call a ferry pier a platform, or repeat a number the name already has.
  const suffix = (name, code) => run(`platformSuffix(${JSON.stringify(name)}, ${JSON.stringify(code)})`);
  assert.strictEqual(suffix('Downtown Ferry Terminal Pier 1', '1'), '');
  assert.strictEqual(suffix('Devonport Ferry Terminal', '1'), ' · Pier 1');
  assert.strictEqual(suffix('Maungawhau Train Station 1', '1'), '');
  assert.strictEqual(suffix('Stop A Henderson Station', 'A'), '');
  assert.strictEqual(suffix('Queen Street', ''), '');
  console.log('any mode: single list, two stops, stops-and-trains with bus/train/ferry in every slot, shared stops, separate filters, setup picker, options and stop labels passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
