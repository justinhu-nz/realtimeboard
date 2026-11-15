// Station-wide train strips: "calls at a target station later", tested on a small made-up
// network that packs in the awkward cases, and (optionally) on a real AT timetable:
//   node tests/train-strips.cjs [unzipped-gtfs-dir]
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
  const context = vm.createContext({ location: { hash: '' }, console, localStorage: { getItem() { return null; }, setItem() {} }, window: { addEventListener() {} }, document: { getElementById() { return {}; }, querySelector() { return null; } }, Intl, Date, Set, Map, WeakMap, Object, Number, String, Array, JSON, Math });
  vm.runInContext(source, context);
  vm.runInContext('render = () => {}; renderSetup = () => {};', context);
  return context;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

// Build a board for one pair of strips and return helpers to read it at a given time.
async function board(ctx, gtfs, stopTimes, cfg) {
  ctx.__gtfs = gtfs; ctx.__stopTimes = stopTimes; ctx.__cfg = cfg;
  run(ctx, `
    state.config = sanitizeConfig({ ...DEFAULT_CONFIG, dualStopMode: true, fourWayMode: true, requireSubscriptionKey: false, ...__cfg });
    state.gtfs = { source: 'test', feedInfo: [], ...__gtfs };
    state.error = ''; state.realtime = null;
    selectedStopTimesFor = async ids => __stopTimes.filter(st => ids.has(st.stop_id));
  `);
  await run(ctx, 'buildBundle({ open: false })');
  assert.strictEqual(run(ctx, 'state.error'), '', 'board build failed');
  assert.strictEqual(run(ctx, 'bundleHasSelectedStops()'), true);
  return {
    at(iso) { ctx.__now = iso; run(ctx, 'state.now = new Date(__now); nextTrainCache = [];'); return this; },
    strip(index, limit = 99) {
      ctx.__i = index;
      return JSON.parse(run(ctx, 'JSON.stringify(trainStripRows(deriveDepartures(), __i).map(r => ({ dest: r.destination, route: r.routeLabel, stop: r.stopId, trip: r.tripId, seq: r.stopSequence, live: !!r.liveOnly, t: timeLabel(r.effective, state.config.timezone) })))')).slice(0, limit);
    },
    empty(index) { ctx.__i = index; return run(ctx, 'emptyStripLabel(__i)'); },
    label(index) { ctx.__i = index; return run(ctx, 'trainStripLabel(__i)'); },
    live(movements) { ctx.__mv = movements; run(ctx, 'state.realtime = { fetchedAt: state.now.getTime(), trips: {}, vehicles: {}, alerts: [], movements: __mv }'); return this; }
  };
}

// ---------------------------------------------------------------- made-up network
async function fixture() {
  const ctx = loadApp();
  const station = (id, name, n) => [{ stop_id: id, stop_name: name + ' Train Station', location_type: '1' },
    ...Array.from({ length: n }, (_, i) => ({ stop_id: `${id}${i + 1}-x`, stop_code: `${id}${i + 1}`, stop_name: `${name} Train Station ${i + 1}`, parent_station: id, platform_code: String(i + 1), location_type: '0' }))];
  const stops = [{ stop_id: 'busL-x', stop_code: 'busL', stop_name: 'Bus left' }, { stop_id: 'busR-x', stop_code: 'busR', stop_name: 'Bus right' },
    ...station('K', 'Kingsland', 2), ...station('M', 'Maungawhau', 2), ...station('W', 'Waitematā', 1), ...station('MS', 'Morningside', 1),
    ...station('N', 'Newmarket', 1), ...station('G', 'Grafton', 1), ...station('P', 'Parnell', 1), ...station('O', 'Orakei', 1), ...station('S', 'Southdown', 1)];
  const routes = [{ route_id: 'bus', route_short_name: 'BUS', route_type: '3' }, { route_id: 'ew', route_short_name: 'E-W', route_type: '2' }, { route_id: 'ow', route_short_name: 'O-W', route_type: '2' }, { route_id: 'sc', route_short_name: 'S-C', route_type: '2' }];
  const trips = [], stopTimes = [];
  // Each call is [platform, "HH:MM"]; the last call of a trip cannot be boarded.
  const trip = (id, route, headsign, calls) => {
    trips.push({ trip_id: id, route_id: route, service_id: 'daily', trip_headsign: headsign });
    calls.forEach(([stop, time], i) => stopTimes.push({ trip_id: id, stop_id: stop + '-x', stop_sequence: String(i + 1), arrival_time: time + ':00', departure_time: time + ':00', pickup_type: i === calls.length - 1 ? '1' : '0' }));
  };
  trip('b1', 'bus', 'Somewhere', [['busL', '12:01'], ['busR', '12:02'], ['busL', '12:30']]);
  trip('city1', 'ew', 'Waitematā', [['MS1', '12:00'], ['K1', '12:03'], ['M1', '12:06'], ['W1', '12:15']]);                 // ends in the city
  trip('turn', 'ew', 'Manukau via City Centre', [['K2', '12:05'], ['M1', '12:08'], ['W1', '12:17'], ['O1', '12:30']]);     // turn-back from the "west" platform
  trip('west', 'ew', 'Swanson', [['W1', '12:00'], ['M2', '12:09'], ['K2', '12:12'], ['MS1', '12:15']]);
  trip('owE', 'ow', 'Onehunga via Grafton', [['MS1', '12:10'], ['K1', '12:13'], ['M1', '12:16'], ['G1', '12:19'], ['N1', '12:22']]); // heads cityward, never arrives
  trip('owW', 'ow', 'Henderson', [['N1', '12:05'], ['G1', '12:08'], ['M2', '12:11'], ['K2', '12:14'], ['MS1', '12:17']]);
  trip('loop', 'sc', 'Southdown via City', [['N1', '12:02'], ['P1', '12:05'], ['W1', '12:09'], ['G1', '12:18'], ['N1', '12:21'], ['S1', '12:40']]); // same platform twice
  trip('bypass', 'ew', 'Orakei via Grafton, Parnell', [['K1', '12:20'], ['M1', '12:23'], ['G1', '12:26'], ['P1', '12:29'], ['O1', '12:35']]); // looks like a city train, isn't
  trip('ends', 'ew', 'Kingsland', [['W1', '12:10'], ['M2', '12:19'], ['K2', '12:22']]);                                      // terminates at Kingsland
  trip('short', 'sc', 'Newmarket', [['S1', '12:00'], ['N1', '12:19']]);
  const gtfs = { stops, routes, trips, calendars: [{ service_id: 'daily', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20200101', end_date: '20991231' }], calendarDates: [] };
  const base = { stopIds: 'busL-x, busR-x', dualStopLeftId: 'busL-x', dualStopRightId: 'busR-x' };
  const NOON = '2026-11-17T11:55:00+13:00';
  const dests = rows => rows.map(r => r.dest);

  // The user's board: Maungawhau to city, Kingsland calling at Morningside.
  let b = (await board(ctx, gtfs, stopTimes, { ...base, trainLeftStopId: 'M1-x', trainLeftShow: 'city', trainRightStopId: 'K2-x', trainRightShow: 'via', trainRightViaStopId: 'MS1-x' })).at(NOON);
  assert.deepStrictEqual(dests(b.strip(0)), ['Waitematā', 'Manukau via City']);            // no O-W, no bypass
  assert.deepStrictEqual(dests(b.strip(1)), ['Swanson', 'Henderson']);                      // E-W and O-W west, no Onehunga, no terminating train
  assert.strictEqual(b.label(0), 'To city');
  assert.strictEqual(b.label(1), 'Towards Morningside');
  assert.deepStrictEqual(Array.from(run(ctx, 'departureStopCodes()')).sort(), ['K1', 'K2', 'M1', 'M2', 'busL', 'busR']);

  // City / not city at Kingsland: together they are every boardable train, with no overlap.
  b = (await board(ctx, gtfs, stopTimes, { ...base, trainLeftStopId: 'K1-x', trainLeftShow: 'city', trainRightStopId: 'K2-x', trainRightShow: 'other' })).at(NOON);
  assert.deepStrictEqual(b.strip(0).map(r => r.trip), ['city1', 'turn']);                   // both platforms feed the city strip
  assert.deepStrictEqual(b.strip(1).map(r => r.trip), ['west', 'owE', 'owW', 'bypass']);    // Onehunga and the bypass are "not city"
  const all = (await board(ctx, gtfs, stopTimes, { ...base, trainLeftStopId: 'K1-x', trainLeftShow: 'all', trainRightStopId: 'K1-x', trainRightShow: '' })).at(NOON);
  assert.strictEqual(all.strip(0).length, 6);
  assert.deepStrictEqual(all.strip(1).map(r => r.trip), ['city1', 'owE', 'bypass']);        // "This platform only" is unchanged
  assert(!all.strip(0).some(r => r.trip === 'ends'));

  // Loop train at a junction: city-bound on its first call, outbound on its second.
  b = (await board(ctx, gtfs, stopTimes, { ...base, trainLeftStopId: 'N1-x', trainLeftShow: 'city', trainRightStopId: 'N1-x', trainRightShow: 'other' })).at(NOON);
  assert.deepStrictEqual(b.strip(0).map(r => [r.trip, r.seq]), [['loop', 1]]);
  assert.deepStrictEqual(b.strip(1).map(r => [r.trip, r.seq]), [['owW', 1], ['loop', 5]]);

  // Closure: nothing calls at Morningside any more. The strip empties and says when trains resume.
  const closed = stopTimes.filter(st => !['west', 'owW'].includes(st.trip_id) || st.stop_id !== 'MS1-x');
  b = (await board(ctx, gtfs, closed, { ...base, trainLeftStopId: 'K1-x', trainLeftShow: 'city', trainRightStopId: 'K2-x', trainRightShow: 'via', trainRightViaStopId: 'MS1-x' })).at(NOON);
  assert.deepStrictEqual(b.strip(1), []);
  assert.strictEqual(b.empty(1), 'No trains in the next week');
  b = (await board(ctx, gtfs, stopTimes, { ...base, trainLeftStopId: 'K1-x', trainLeftShow: 'city', trainRightStopId: 'K2-x', trainRightShow: 'via', trainRightViaStopId: 'MS1-x' })).at('2026-11-17T14:30:00+13:00');
  assert.deepStrictEqual(b.strip(1), []);
  assert.strictEqual(b.empty(1), 'No trains · next Wed 12:12');

  // Trains that exist only in the live feed. Sorted by AT's live calls, then by headsign.
  const t = hhmm => Date.parse(`2026-11-17T${hhmm}:00+13:00`);
  const mv = (tripId, code, when, destination, extra = {}) => [tripId + ':' + code, { tripId, code, expected: t(when), scheduled: t(when), routeId: 'ew', routeLabel: 'E-W', destination, stopSequence: 1, boarding: true, monitored: true, ...extra }];
  b.at(NOON).live(Object.fromEntries([
    mv('shuttle', 'K2', '12:01', 'Britomart'), mv('shuttle', 'W1', '12:11', 'Britomart'),        // live call in the city
    mv('extra', 'K1', '12:02', 'Manukau via City Centre'),                                         // headsign only
    mv('wextra', 'K2', '12:04', 'Swanson'), mv('wextra', 'MS1', '12:07', 'Swanson'),              // live call at Morningside
    mv('arrive', 'K2', '12:06', 'Kingsland', { boarding: false }),                                 // set-down only
    mv('city1-0a1b2c3d', 'K1', '12:03', 'Waitematā'), mv('west', 'K2', '12:12', 'Swanson')         // timetabled trips are not duplicated
  ]));
  assert.deepStrictEqual(b.strip(0).map(r => [r.trip, r.live, r.t]), [['shuttle', true, '12:01'], ['extra', true, '12:02'], ['city1', false, '12:03'], ['turn', false, '12:05']]);
  assert.deepStrictEqual(b.strip(1).map(r => [r.trip, r.live]), [['wextra', true], ['west', false], ['owW', false]]);
  ctx.__result = { movements: Object.fromEntries([mv('shuttle', 'K2', '12:01', 'Britomart')]) };
  run(ctx, 'var __asked = null; fetchMovements = async codes => { __asked = codes; return { movements: {} }; }');
  await run(ctx, 'addStripTargetMovements(__result, ["K1", "K2", "busL", "busR"], "key")');
  assert.deepStrictEqual(Array.from(run(ctx, '__asked')).sort(), ['MS1', 'W1']);               // a live-only train triggers the target lookup
  ctx.__result = { movements: Object.fromEntries([mv('west', 'K2', '12:12', 'Swanson')]) };
  run(ctx, '__asked = null');
  await run(ctx, 'addStripTargetMovements(__result, ["K1", "K2"], "key")');
  assert.strictEqual(run(ctx, '__asked'), null);                                                // a normal day costs no extra requests

  // Rendered board: station heading, strip label and the empty message.
  run(ctx, 'state.realtime = null');
  b.at('2026-11-17T14:30:00+13:00');
  const html = run(ctx, 'renderDualStopBoards(deriveDepartures(), state.config).html');
  assert(html.includes('Kingsland Station') && html.includes('Towards Morningside') && html.includes('No trains · next Wed 12:12'));

  // Setup: "via" needs a station, and a strip change invalidates the saved board.
  run(ctx, 'state.config.trainRightViaStopId = ""');
  assert.strictEqual(run(ctx, 'fourWayReady()'), false);
  assert(run(ctx, 'setupBlockers().some(b => b.field === "trainRightVia")'));
  run(ctx, 'state.config.trainRightViaStopId = "MS1-x"; state.config.trainRightShow = "other"');
  assert.strictEqual(run(ctx, 'bundleHasSelectedStops()'), false);
  // ---- Whole-station sorting in the single list and two-stop layouts.
  const plain = { dualStopMode: false, fourWayMode: false };
  const ids = rows => rows.map(r => r.tripId);
  // Single list: a bus stop plus "Kingsland Station, to city" (stored as platform 1).
  await board(ctx, gtfs, stopTimes, { ...plain, stopIds: 'busL-x, K1-x', stopModes: 'K1-x=city' });
  run(ctx, `state.now = new Date('${NOON}')`);
  assert.deepStrictEqual(ids(JSON.parse(run(ctx, 'JSON.stringify(singleListRows(deriveDepartures()))'))), ['b1', 'city1', 'turn']); // turn leaves platform 2
  assert(Array.from(run(ctx, 'departureStopCodes()')).includes('K2'));
  // The same platform without a direction is that exact platform again.
  await board(ctx, gtfs, stopTimes, { ...plain, stopIds: 'busL-x, K1-x', stopModes: '' });
  run(ctx, `state.now = new Date('${NOON}')`);
  assert.deepStrictEqual(ids(JSON.parse(run(ctx, 'JSON.stringify(singleListRows(deriveDepartures()))'))), ['b1', 'city1', 'owE', 'bypass']);
  // Two stops: Maungawhau to city, Kingsland towards Morningside (the user's own board).
  const two = { dualStopMode: true, fourWayMode: false, stopIds: 'M1-x, K2-x', dualStopLeftId: 'M1-x', dualStopRightId: 'K2-x', stopModes: 'M1-x=city, K2-x=via:MS1-x' };
  await board(ctx, gtfs, stopTimes, two);
  run(ctx, `state.now = new Date('${NOON}')`);
  assert.deepStrictEqual(ids(JSON.parse(run(ctx, 'JSON.stringify(sideRows(deriveDepartures(), "M1-x"))'))), ['city1', 'turn']);
  assert.deepStrictEqual(ids(JSON.parse(run(ctx, 'JSON.stringify(sideRows(deriveDepartures(), "K2-x"))'))), ['west', 'owW']);
  let dual = run(ctx, 'renderDualStopBoards(deriveDepartures(), state.config).html');
  assert(dual.includes('Maungawhau Station') && dual.includes('To city') && dual.includes('Kingsland Station') && dual.includes('Towards Morningside'));
  assert(!dual.includes('Onehunga') && !dual.includes('Orakei'));
  // During a closure, the two-stop side says when the next train is.
  await board(ctx, gtfs, stopTimes, two);
  run(ctx, `state.now = new Date('2026-11-17T14:30:00+13:00'); nextTrainCache = {}`);
  dual = run(ctx, 'renderDualStopBoards(deriveDepartures(), state.config).html');
  assert(dual.includes('No trains · next Wed 12:12'));
  // A "towards" side with no station chosen blocks the board.
  run(ctx, 'state.config.stopModes = "K2-x=via"');
  assert.strictEqual(run(ctx, 'fourWayReady()'), false);
  assert(run(ctx, 'setupBlockers().some(b => b.field === "via:K2-x")'));
  run(ctx, 'state.config.stopModes = "K2-x=via:MS1-x, M1-x=city"');
  assert.strictEqual(run(ctx, 'bundleHasSelectedStops()'), true);       // the same settings written in another order still match the saved board

  // ---- Setup search: a whole-station row above that station's platforms.
  run(ctx, 'renderSetup = () => {}; scheduleAutoBuild = () => {}');
  const entries = JSON.parse(run(ctx, 'JSON.stringify(pickerEntries("main", "bus", "Kingsland"))'));
  assert.deepStrictEqual(entries.map(e => e.id), ['station:K', 'K1-x', 'K2-x']);
  assert.strictEqual(entries[0].label, 'Kingsland Station');
  assert.strictEqual(entries[1].sub, 'This platform only');
  // "Towards" lists one row per train station, never platforms or bus stops.
  run(ctx, `state.gtfs.stops = state.gtfs.stops.concat({ stop_id: 'KB-x', stop_code: 'KB', stop_name: 'Kingsland Avenue' })`);
  const towards = JSON.parse(run(ctx, 'JSON.stringify(pickerEntries("via:K2-x", "station", "Kingsland"))'));
  assert.deepStrictEqual(towards.map(e => [e.id, e.label]), [['K1-x', 'Kingsland Station']]);
  assert(run(ctx, 'pickerHtml("via:K2-x", "station", "MS1-x", "")').includes('Morningside Station'));
  assert.deepStrictEqual(JSON.parse(run(ctx, 'JSON.stringify(pickerEntries("main", "bus", "Bus").map(e => e.id))')), ['busL-x', 'busR-x']);     // bus stops: no extra rows
  // Adding a station twice uses its other platform, so each can face a different way.
  run(ctx, 'state.config = sanitizeConfig({ ...DEFAULT_CONFIG, requireSubscriptionKey: false }); state.config.stopIds = ""; chooseSlotStop("main", "station:K"); chooseSlotStop("main", "station:K")');
  assert.strictEqual(run(ctx, 'state.config.stopIds'), 'K1-x, K2-x');
  assert.strictEqual(run(ctx, 'state.config.stopModes'), 'K1-x=city, K2-x=city');
  run(ctx, 'setSlotShow("stop:K2-x", "via"); chooseSlotStop("via:K2-x", "MS1-x")');
  assert.strictEqual(run(ctx, 'state.config.stopModes'), 'K1-x=city, K2-x=via:MS1-x');
  run(ctx, 'chooseSlotStop("main", "K1-x")');                                    // picking the platform itself: exact again
  assert.strictEqual(run(ctx, 'state.config.stopModes'), 'K2-x=via:MS1-x');
  // Two stops: both sides on one station get different platforms.
  run(ctx, 'state.config = sanitizeConfig({ ...DEFAULT_CONFIG, dualStopMode: true, requireSubscriptionKey: false }); chooseSlotStop("left", "station:K"); chooseSlotStop("right", "station:K")');
  assert.deepStrictEqual([run(ctx, 'state.config.dualStopLeftId'), run(ctx, 'state.config.dualStopRightId')], ['K1-x', 'K2-x']);
  assert(run(ctx, 'directionChipsHtml(topSlot("K1-x"), "via:K1-x")').includes('aria-pressed="true" data-set-show="stop:K1-x" data-show="city"'));
  assert.strictEqual(run(ctx, 'directionChipsHtml(topSlot("busL-x"), "via:busL-x")'), '');  // exact stops get no chips
  // At a city station, "to city" and "not to city" make no sense.
  run(ctx, 'chooseSlotStop("left", "station:W")');
  const cityChips = run(ctx, 'directionChipsHtml(topSlot("W1-x"), "via:W1-x")');
  assert(cityChips.includes('All trains') && !cityChips.includes('To city') && !cityChips.includes('Not to city'));
  console.log('fixture: city/via/other/all strips, both platforms, turn-backs, Onehunga via Grafton, loop train, bypass diversion, terminating trains, closures, next-train message, live-only trains, setup blockers, single list and two-stop station sorting, station search rows passed');
}

// ---------------------------------------------------------------- real AT timetable
async function real(dir) {
  const ctx = loadApp();
  const table = name => { ctx.__text = fs.readFileSync(path.join(dir, name), 'utf8'); return JSON.parse(run(ctx, 'JSON.stringify(csvParse(__text))')); };
  const version = table('feed_info.txt')[0]?.feed_version;
  assert.equal(version, 'VDV_Merge_119_2_C_4_338.08584079057965103722149836510CU53',
    'These November closure expectations require the 3 Nov 2026 AT timetable snapshot');
  const stops = table('stops.txt'), routes = table('routes.txt'), trips = table('trips.txt');
  const gtfs = { stops, routes, trips, calendars: table('calendar.txt'), calendarDates: table('calendar_dates.txt') };
  const rail = new Set(routes.filter(r => r.route_type === '2').map(r => r.route_id));
  const railTrips = new Set(trips.filter(tr => rail.has(tr.route_id)).map(tr => tr.trip_id));
  const [head, ...lines] = fs.readFileSync(path.join(dir, 'stop_times.txt'), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const cols = head.split(',');
  const stopTimes = lines.filter(l => railTrips.has(l.slice(0, l.indexOf(',')))).map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
  const platform = (name, n) => { const s = stops.find(x => x.stop_name === `${name} Train Station ${n}`); assert(s, 'no platform ' + name + ' ' + n); return s.stop_id; };
  const bus = stops.find(s => s.stop_code === '8205').stop_id, bus2 = stops.find(s => s.stop_code === '8204').stop_id;
  // Bus rows are irrelevant here: give each bus stop one made-up departure so the board builds.
  trips.push({ trip_id: 'testbus', route_id: routes.find(r => r.route_type === '3').route_id, service_id: gtfs.calendars[0].service_id });
  stopTimes.push({ trip_id: 'testbus', stop_id: bus, stop_sequence: '1', departure_time: '12:00:00' }, { trip_id: 'testbus', stop_id: bus2, stop_sequence: '2', departure_time: '12:05:00' });
  const base = { stopIds: bus + ', ' + bus2, dualStopLeftId: bus, dualStopRightId: bus2, lookaheadHours: 3 };
  const make = (left, right) => board(ctx, gtfs, stopTimes, { ...base, trainLeftStopId: left[0], trainLeftShow: left[1], trainLeftViaStopId: left[2] || '', trainRightStopId: right[0], trainRightShow: right[1], trainRightViaStopId: right[2] || '' });
  const show = (title, rows) => console.log('  ' + title + '\n' + (rows.length ? rows.slice(0, 6).map(r => `     ${r.t}  ${r.route.padEnd(4)} ${r.dest.padEnd(30)} P${stops.find(s => s.stop_id === r.stop).platform_code}`).join('\n') : '     (none)'));
  const M1 = platform('Maungawhau', 1), K2 = platform('Kingsland', 2), MS = platform('Morningside', 1), N1 = platform('Newmarket', 1);

  // The user's board.
  const mine = await make([M1, 'city'], [K2, 'via', MS]);
  console.log('\nSun 15 Nov 19:00, Western line closed Swanson–Kingsland');
  mine.at('2026-11-15T19:00:00+13:00');
  show('Maungawhau · To city', mine.strip(0)); show('Kingsland · Towards Morningside', mine.strip(1));
  console.log('     empty message: ' + mine.empty(1));
  assert.strictEqual(mine.strip(1).length, 0);
  assert(/^No trains · next Mon /.test(mine.empty(1)));
  assert(mine.strip(0).length > 0);

  console.log('\nTue 17 Nov 08:00, normal morning');
  mine.at('2026-11-17T08:00:00+13:00');
  show('Maungawhau · To city', mine.strip(0)); show('Kingsland · Towards Morningside', mine.strip(1));
  assert(mine.strip(0).length > 5 && !mine.strip(0).some(r => r.route === 'O-W'));
  assert(mine.strip(1).some(r => r.route === 'E-W') && mine.strip(1).some(r => r.route === 'O-W'));
  assert(!mine.strip(1).some(r => /onehunga|city|waitemat/i.test(r.dest)));

  // Kingsland during the closure: both platforms carry city trains; nothing else runs.
  const kings = await make([K2, 'city'], [K2, 'other']);
  kings.at('2026-11-15T17:00:00+13:00');
  console.log('\nSun 15 Nov 17:00, Kingsland city / not city');
  show('To city', kings.strip(0)); show('Not to city', kings.strip(1));
  assert(new Set(kings.strip(0).map(r => r.stop)).size === 2, 'city trains should leave both platforms');
  assert.strictEqual(kings.strip(1).length, 0);
  assert(!kings.strip(0).some(r => /^kingsland$/i.test(r.dest)));
  kings.at('2026-11-17T08:00:00+13:00');
  console.log('\nTue 17 Nov 08:00, Kingsland city / not city');
  show('To city', kings.strip(0)); show('Not to city', kings.strip(1));
  assert(kings.strip(1).some(r => /onehunga/i.test(r.dest)), 'Onehunga via Grafton belongs in not-city');
  assert(!kings.strip(0).some(r => r.route === 'O-W'));

  // Newmarket: junction, loop trips, and the via-Parnell night diversion.
  const newmarket = await make([N1, 'city'], [N1, 'other']);
  newmarket.at('2026-11-17T07:20:00+13:00');
  console.log('\nTue 17 Nov 07:20, Newmarket');
  show('To city', newmarket.strip(0)); show('Not to city', newmarket.strip(1));
  const city = newmarket.strip(0), other = newmarket.strip(1);
  assert(city.length && other.length);
  assert(new Set(city.map(r => r.stop)).size > 1, 'city trains use several Newmarket platforms');
  const twice = other.filter(o => city.some(c => c.trip === o.trip));
  console.log('     loop trips seen both city-bound and outbound: ' + twice.length);
  assert(twice.length > 0 && twice.every(o => city.find(c => c.trip === o.trip).seq < o.seq));
  newmarket.at('2026-11-17T23:00:00+13:00');
  console.log('\nTue 17 Nov 23:00, Newmarket, Grafton route closed');
  show('To city', newmarket.strip(0)); show('Not to city', newmarket.strip(1));
  assert(newmarket.strip(0).some(r => /parnell/i.test(r.dest)), 'via Parnell trains are city trains on closure nights');

  // Whole timetable, every station: "city" + "not city" = every boardable train, no overlap.
  let checked = 0;
  for (const name of ['Kingsland', 'Newmarket', 'Maungawhau', 'Papatoetoe', 'Remuera']) {
    const p = platform(name, 1);
    const times = ['2026-11-15T18:00:00+13:00', '2026-11-17T07:00:00+13:00', '2026-11-17T22:30:00+13:00', '2026-11-18T23:00:00+13:00'];
    // One board at a time: each build replaces the app's state.
    const everything = await make([p, 'all'], [p, 'all']);
    const alls = times.map(when => everything.at(when).strip(0));
    const both = await make([p, 'city'], [p, 'other']);
    times.forEach((when, i) => {
      both.at(when);
      const a = both.strip(0), b = both.strip(1), all = alls[i];
      const key = r => r.trip + ':' + r.seq;
      assert.strictEqual(a.length + b.length, all.length, name + ' ' + when);
      assert.strictEqual(new Set([...a, ...b].map(key)).size, all.length, name + ' ' + when);
      checked += all.length;
    });
  }
  const papatoetoe = await make([platform('Papatoetoe', 1), 'city'], [platform('Papatoetoe', 1), 'other']);
  papatoetoe.at('2026-11-17T05:00:00+13:00');
  console.log('\nTue 17 Nov 05:00, Papatoetoe (short-runners stay in not-city with their destination)');
  show('To city', papatoetoe.strip(0)); show('Not to city', papatoetoe.strip(1));
  console.log(`\nreal timetable: closures, junctions, loop trips and ${checked} departures split cleanly passed`);
}

(async () => {
  await fixture();
  const dir = process.argv[2] || process.env.GTFS_DIR;
  if (dir) await real(dir); else console.log('(pass an unzipped AT GTFS folder to also test against the real timetable)');
})().catch(err => { console.error(err); process.exitCode = 1; });
