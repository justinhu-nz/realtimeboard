const fs = require('fs'), vm = require('vm'), assert = require('assert');
(async () => {
for (const file of ['index.html', 'index2.html']) {
 const html = fs.readFileSync(require('path').join(__dirname, '..', file), 'utf8');
 const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
 const context = vm.createContext({location:{hash:""},console, localStorage:{getItem(){return null},setItem(){}}, window:{addEventListener(){}}, document:{getElementById(){return {}},querySelector(){return null}}, Intl, Date, Set, Map, Object, Number, String, Array});
 vm.runInContext(source, context);
 vm.runInContext(`
 state.config = {...DEFAULT_CONFIG, dualStopMode: true, fourWayMode: true, stopIds: 'busW, busC', dualStopLeftLabel: 'Towards west', dualStopRightLabel: 'Towards city', trainStationLabel: 'Neighbourhood Station', trainLeftStopId: 'railW', trainRightStopId: 'railC', trainLeftRoutes: 'WEST', trainRightRoutes: 'WEST', routeAllowlist: 'BUS', requireSubscriptionKey: false};
 state.bundle = {stops: {busW:{name:'Westbound bus'},busC:{name:'Citybound bus'},railW:{name:'Station',platformCode:'1'},railC:{name:'Station',platformCode:'2'}}, routes: {bus:{shortName:'BUS',routeId:'bus',type:3},rail:{shortName:'WEST',routeId:'rail',type:2},other:{shortName:'OTHER',routeId:'other',type:2}}};
 var now = Date.now();
 var makeRow = (stopId, routeId, destination, n) => ({stopId,routeId,routeLabel:state.bundle.routes[routeId].shortName,destination,scheduled:now+n*60000,effective:now+n*60000,status:'scheduled',occupancy:0});
 var rows = [...Array.from({length:7},(_,i)=>makeRow('busW','bus','West bus '+i,i+1)),makeRow('busC','bus','City bus',1),makeRow('railW','other','Wrong service',2),...Array.from({length:4},(_,i)=>makeRow('railW','rail','Swanson',i+3)),makeRow('railC','rail','Waitematā',4)];
 var first = renderDualStopBoards(rows,state.config);
 `, context);
 const run = code => vm.runInContext(code,context);
 assert.deepStrictEqual(Array.from(run('boardStopIds()')),['busW','busC','railW','railC']);
 assert.strictEqual(run('first.pageCount'),3);
 assert.strictEqual(run('first.pageRows.filter(r=>r.stopId==="railW").length'),2);
 assert(!run('first.html').includes('Wrong service'));
 assert.strictEqual(run('(first.html.match(/train-station-strip/g)||[]).length'),2);
 const fixed=run('JSON.stringify(first.pageRows.filter(r=>r.routeId==="rail"))');
 run('state.page=1; var second=renderDualStopBoards(rows,state.config)');
 assert.strictEqual(run('JSON.stringify(second.pageRows.filter(r=>r.routeId==="rail"))'),fixed);
 assert(run('second.pageRows.some(r=>r.destination==="West bus 3")'));
 run('state.pageLocked=true; var locked=renderDualStopBoards(rows,state.config)');
 assert(run('locked.pageRows.some(r=>r.destination==="West bus 0")'));
 assert(run('renderDualStopBoards([],state.config).html.includes("No upcoming trains")'));
 run('state.config.pageSize=1');
 assert.strictEqual(run('renderDualStopBoards(rows,state.config).pageRows.filter(r=>r.stopId==="busW").length'),1);
 run('state.config.fourWayMode=false');
 assert.strictEqual(run('boardStopIds().length'),2);
 assert(!run('renderDualStopBoards(rows,state.config).html').includes('train-station-strip'));
 run('state.config.fourWayMode=true; state.config.trainLeftStopId=""');
 assert.strictEqual(run('fourWayReady()'),false);
 run('state.config.trainLeftStopId="railW"; state.config.pageSize=5; state.pageLocked=false; state.page=0');
 if(file==='index2.html') {run('boardSource="motat"');assert.strictEqual(run('fourWayEnabled()'),false);run('boardSource="at"');}
 run(`
 render = () => {};
 state.config.stopIds = 'busW, busC';
 state.config.trainLeftStopId = 'railW-old'; state.config.trainRightStopId = 'railC-old';
 state.gtfs = { source:'fixture', feedInfo:[], calendars:[], calendarDates:[],
   stops:[{stop_id:'busW'},{stop_id:'busC'},{stop_id:'railW-new',stop_code:'railW',platform_code:'1'},{stop_id:'railC-new',stop_code:'railC',platform_code:'2'}],
   routes:[{route_id:'bus',route_short_name:'BUS',route_type:'3'},{route_id:'rail',route_short_name:'WEST',route_type:'2'},{route_id:'other',route_short_name:'OTHER',route_type:'2'}],
   trips:[{trip_id:'b',route_id:'bus',service_id:'daily'},{trip_id:'t',route_id:'rail',service_id:'daily'},{trip_id:'o',route_id:'other',service_id:'daily'}] };
 selectedStopTimesFor = async ids => {
   if (!ids.has('railW-new') || !ids.has('railC-new')) throw new Error('Train platforms omitted from ingestion');
   return [{stop_id:'busW',trip_id:'b',departure_time:'12:05:00',pickup_type:'1'},{stop_id:'busW',trip_id:'b',departure_time:'12:00:00'},{stop_id:'busC',trip_id:'b',departure_time:'12:00:00'},{stop_id:'railW-new',trip_id:'t',departure_time:'12:00:00'},{stop_id:'railC-new',trip_id:'t',departure_time:'12:00:00'},{stop_id:'railW-new',trip_id:'o',departure_time:'12:10:00'}];
 };
 `);
 await run('buildBundle()');
 assert.strictEqual(run('state.error'),'');
 assert.strictEqual(run('state.bundle.stopTimesByStop.busW.length'),1); // Drop-off-only visits cannot be boarded.
 assert.strictEqual(run('state.config.trainLeftStopId'),'railW-new');
 assert.strictEqual(run('state.bundle.routes.rail.type'),2);
 assert.strictEqual(run('state.bundle.stops["railW-new"].platformCode'),'1');
 assert.strictEqual(run('state.bundle.stopTimesByStop["railW-new"].length'),2); // Bus allowlist must not drop train routes.
 assert.strictEqual(run('bundleHasSelectedStops()'),true);
 assert.deepStrictEqual(Array.from(run('departureStopCodes()')),['busW','busC','railW','railC']);
 run('state.config.trainLeftRoutes="DOES NOT EXIST"; var savedBundle=state.bundle');
 await run('buildBundle()');
 assert(run('state.error.includes("No train services match the left")'));
 assert(run('state.bundle === savedBundle'));
 console.log(file+': GTFS build, platform migration, route metadata, independent bus/train filters, live stop codes, invalid filters; platform inclusion, service filtering, fixed trains, bus pagination, locking, empty states, minimum rows, and disabled mode passed');
}

})().catch(err => {console.error(err);process.exitCode=1});
