// Prototype: closure-proof "City trains" / "Other trains" strips, timetable only (no live data).
// Usage: node prototypes/train-strips.cjs <unzipped-gtfs-dir>
const fs = require("fs"), path = require("path");

// ---------------------------------------------------------------- the whole idea
const CITY = ["Waitemata", "Te Waihorotiu", "Karanga-a-Hape"]; // the only network knowledge

// deps: departures from one station, each { dep, head, plat, next, arr: {cityStation: minutes} }
function strips(deps, rows = 2) {
  deps.sort((a, b) => a.dep - b.dep);
  const city = deps.filter(d => Object.keys(d.arr).length);
  const other = deps.filter(d => !Object.keys(d.arr).length);
  // City: keep a train only if no LATER-leaving train reaches some city station sooner.
  const best = {}, keep = new Set();
  for (const d of [...city].reverse())
    for (const [s, t] of Object.entries(d.arr))
      if (!(t > best[s])) { best[s] = t; keep.add(d); d.wins = (d.wins || []).concat(s); }
  // Other: next train per next-station first, so one direction can't hog the rows.
  const seen = new Set(), spread = other.filter(d => !seen.has(d.next) && seen.add(d.next));
  return {
    city: city.filter(d => keep.has(d)).slice(0, rows),
    other: [...new Set([...spread.slice(0, rows), ...other])].sort((a, b) => a.dep - b.dep).slice(0, rows)
  };
}
// ---------------------------------------------------------------- end of the idea

// GTFS plumbing (the real app already has all of this)
const G = process.argv[2];
const read = f => {
  const [h, ...ls] = fs.readFileSync(path.join(G, f), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const k = h.split(",");
  return ls.map(l => Object.fromEntries(l.split(",").map((v, i) => [k[i], v])));
};
const routes = new Map(read("routes.txt").filter(r => r.route_type === "2").map(r => [r.route_id, r]));
const trips = new Map(read("trips.txt").filter(t => routes.has(t.route_id)).map(t => [t.trip_id, t]));
const stops = new Map(read("stops.txt").map(s => [s.stop_id, s]));
const cal = new Map(read("calendar.txt").map(c => [c.service_id, c]));
const exc = read("calendar_dates.txt");
const seq = new Map();
for (const st of read("stop_times.txt")) if (trips.has(st.trip_id)) (seq.get(st.trip_id) || seq.set(st.trip_id, []).get(st.trip_id)).push(st);
for (const s of seq.values()) s.sort((a, b) => a.stop_sequence - b.stop_sequence);
const station = id => (stops.get(stops.get(id).parent_station || id).stop_name).replace(" Train Station", "");
const mins = t => { const [h, m] = t.split(":"); return h * 60 + +m; };
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function runs(sid, date) {
  const e = exc.find(x => x.service_id === sid && x.date === date);
  if (e) return e.exception_type === "1";
  const c = cal.get(sid), day = DAYS[new Date(date.slice(0, 4), date.slice(4, 6) - 1, date.slice(6)).getDay()];
  return !!c && c.start_date <= date && date <= c.end_date && c[day] === "1";
}
function departures(name, date, from) {
  const out = [];
  for (const [tid, sts] of seq) {
    if (!runs(trips.get(tid).service_id, date)) continue;
    sts.forEach((st, i) => {
      if (station(st.stop_id) !== name || st.pickup_type === "1" || i === sts.length - 1 || mins(st.departure_time) < from) return;
      const arr = {};
      for (const x of sts.slice(i + 1)) { const n = station(x.stop_id); if (CITY.includes(n) && !(n in arr)) arr[n] = mins(x.arrival_time); }
      out.push({ dep: mins(st.departure_time), head: st.stop_headsign || trips.get(tid).trip_headsign,
        plat: "P" + (stops.get(st.stop_id).platform_code || "?"), next: station(sts[i + 1].stop_id), arr });
    });
  }
  return out;
}

for (const [name, date, at, note] of [
  ["Kingsland", "20261115", "19:00", "tonight, West line closed"],
  ["Maungawhau", "20261115", "19:00", "tonight"],
  ["Kingsland", "20261117", "08:00", "normal Tuesday"],
  ["Newmarket", "20261117", "07:20", "normal Tuesday"],
  ["Newmarket", "20261117", "23:00", "Grafton closed after 11pm"],
]) {
  const s = strips(departures(name, date, mins(at)));
  console.log(`\n${name} ${at} (${note})`);
  for (const [label, rows] of [["City ", s.city], ["Other", s.other]]) {
    if (!rows.length) console.log(`  ${label}  (none)`);
    rows.forEach((d, i) => console.log(`  ${i ? "     " : label}  ${hhmm(d.dep)}  ${d.head.padEnd(28)} ${d.plat}` +
      (d.wins ? `  fastest to ${d.wins.map(w => ({ "Waitemata": "Britomart", "Te Waihorotiu": "Te Waihorotiu", "Karanga-a-Hape": "K Rd" })[w]).join(", ")}` : `  next: ${d.next}`)));
  }
}
