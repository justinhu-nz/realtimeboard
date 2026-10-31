// Shared sample data and widgets for the config UX prototypes.
// Everything here is fake: no network calls, no GTFS, no AT key.

const STOPS = [
  { id: "8205-eda192d2", code: "8205", name: "Great North Road / Ponsonby Road", routes: ["18", "195", "209", "OUT"] },
  { id: "8206-1b3c9f10", code: "8206", name: "Great North Road / Ponsonby Road (opposite)", routes: ["18", "195", "209", "INN"] },
  { id: "7006-4c1a22e8", code: "7006", name: "Karangahape Road / Pitt Street", routes: ["OUT", "INN", "20", "22N", "22R"] },
  { id: "7024-90aa71c4", code: "7024", name: "Karangahape Road / Pitt Street (opposite)", routes: ["OUT", "INN", "20", "22N", "22R"] },
  { id: "1315-3f8e0d6a", code: "1315", name: "Customs Street East / Britomart", routes: ["70", "75", "NX2", "TMK"] },
  { id: "7148-a51e66b2", code: "7148", name: "Newmarket / Broadway", routes: ["70", "75", "INN", "OUT", "650"] },
  { id: "6015-7d0c4b19", code: "6015", name: "Henderson Interchange Stand A", routes: ["131", "132", "141", "143"] },
  { id: "6016-0e9f2a73", code: "6016", name: "Henderson Interchange Stand B", routes: ["133", "134", "152", "154"] },
  { id: "1007-c3e4f5a6", code: "1007", name: "Akoranga Station Northbound", routes: ["NX1", "NX2", "82"] },
  { id: "1008-b2d3e4f5", code: "1008", name: "Akoranga Station Southbound", routes: ["NX1", "NX2", "82"] }
];
const PLATFORMS = [
  { id: "9218-p1", code: "9218", name: "Henderson Train Station", platform: "1", routes: ["WEST"], towards: "Swanson" },
  { id: "9218-p2", code: "9218", name: "Henderson Train Station", platform: "2", routes: ["WEST"], towards: "Britomart" },
  { id: "9100-p3", code: "9100", name: "Britomart Train Station", platform: "3", routes: ["EAST", "STH"], towards: "Manukau, Pukekohe" },
  { id: "9100-p4", code: "9100", name: "Britomart Train Station", platform: "4", routes: ["WEST", "ONE"], towards: "Swanson, Onehunga" },
  { id: "9113-p1", code: "9113", name: "Newmarket Train Station", platform: "1", routes: ["STH", "ONE", "WEST"], towards: "Britomart" },
  { id: "9113-p2", code: "9113", name: "Newmarket Train Station", platform: "2", routes: ["STH", "ONE"], towards: "Pukekohe, Onehunga" }
];
const DESTINATIONS = {
  "18": "Hobsonville Point", "195": "New Lynn", "209": "Titirangi", "OUT": "Outer Link", "INN": "Inner Link",
  "20": "Wynyard Quarter", "22N": "New Lynn", "22R": "Rosebank Road", "70": "Botany", "75": "Glen Innes",
  "NX2": "Hibiscus Coast", "NX1": "Albany", "TMK": "Panmure", "650": "Glen Innes", "82": "Milford",
  "131": "Te Atatu", "132": "Swanson", "141": "Ranui", "143": "Ranui", "133": "Henderson Heights",
  "134": "Sturges Road", "152": "Lincoln", "154": "Glen Eden", "WEST": "Swanson", "EAST": "Manukau",
  "STH": "Pukekohe", "ONE": "Onehunga"
};
const DEFAULT_COLOURS = {
  NX1: ["#0089C1", "#FFFFFF"], NX2: ["#0089C1", "#FFFFFF"], OUT: ["#F2A900", "#1F2A44"], INN: ["#6CC24A", "#1F2A44"],
  TMK: ["#00A3AD", "#FFFFFF"], WEST: ["#84BD00", "#1F2A44"], EAST: ["#F7B500", "#1F2A44"],
  STH: ["#E2231A", "#FFFFFF"], ONE: ["#00A3E0", "#FFFFFF"], AIR: ["#E99C3F", "#FFFFFF"]
};
const FALLBACK_PILL = ["#62ddf4", "#163047"];

function stopById(id) { return STOPS.find(s => s.id === id) || PLATFORMS.find(p => p.id === id) || null; }
function stopTitle(s) { return s ? (s.platform ? `${s.name} · Platform ${s.platform}` : s.name) : ""; }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pillStyle(route, colours) {
  const [bg, fg] = (colours && colours[route]) || FALLBACK_PILL;
  return `background:${bg};color:${fg}`;
}

// Deterministic fake departures so the preview doesn't jump around on every render.
function departuresFor(stopId, routeFilter, count) {
  const stop = stopById(stopId);
  if (!stop) return [];
  const routes = routeFilter && routeFilter.length ? stop.routes.filter(r => routeFilter.includes(r)) : stop.routes;
  if (!routes.length) return [];
  let seed = [...stopId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rows = [];
  let mins = 1 + (seed % 3);
  for (let i = 0; i < count; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const route = routes[seed % routes.length];
    rows.push({ route, dest: DESTINATIONS[route] || "City Centre", mins });
    mins += 2 + (seed % 6);
  }
  return rows;
}
function formatDue(mins, cutoff) {
  if (mins <= 0) return "Due";
  if (cutoff != null && mins > cutoff) {
    const d = new Date(Date.now() + mins * 60000);
    return d.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return mins + " min";
}

// Searchable stop picker. Shows the chosen stop as a card with a Change button.
// opts: { source: STOPS|PLATFORMS, value, placeholder, onChange(id) }
function stopPicker(host, opts) {
  const source = opts.source || STOPS;
  let query = "", open = false, active = 0;
  function matches() {
    const q = query.trim().toLowerCase();
    if (!q) return source.slice(0, 6);
    return source.filter(s => (stopTitle(s) + " " + s.code + " " + (s.towards || "")).toLowerCase().includes(q)).slice(0, 12);
  }
  function choose(id) { open = false; query = ""; opts.onChange(id); }
  function render() {
    const chosen = opts.value && stopById(opts.value);
    if (chosen && !open) {
      host.innerHTML = `<div class="picked"><span class="name">${escapeHtml(stopTitle(chosen))}${chosen.towards ? `<div class="hint" style="margin:0">towards ${escapeHtml(chosen.towards)}</div>` : ""}</span><span class="code">${escapeHtml(chosen.code)}</span><button class="ghost small" type="button">Change</button></div>`;
      host.querySelector("button").onclick = () => { open = true; render(); host.querySelector("input").focus(); };
      return;
    }
    const list = matches();
    host.innerHTML = `<div class="picker"><input type="search" placeholder="${escapeHtml(opts.placeholder || "Search stop name or number")}" value="${escapeHtml(query)}" aria-autocomplete="list" aria-expanded="${open}">
      ${open ? `<div class="picker-results" role="listbox">${list.length ? list.map((s, i) => `<button type="button" role="option" data-id="${s.id}" class="${i === active ? "active" : ""}"><span>${escapeHtml(stopTitle(s))}${s.towards ? ` <span class="muted">→ ${escapeHtml(s.towards)}</span>` : ""}</span><span class="code">${escapeHtml(s.code)}</span></button>`).join("") : `<div class="empty">No stops match “${escapeHtml(query)}”.</div>`}</div>` : ""}</div>`;
    const input = host.querySelector("input");
    input.onfocus = () => { if (!open) { open = true; active = 0; render(); host.querySelector("input").focus(); } };
    input.oninput = e => { query = e.target.value; active = 0; render(); const i = host.querySelector("input"); i.focus(); i.setSelectionRange(query.length, query.length); };
    input.onkeydown = e => {
      const l = matches();
      if (e.key === "ArrowDown") { active = Math.min(active + 1, l.length - 1); render(); host.querySelector("input").focus(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); render(); host.querySelector("input").focus(); e.preventDefault(); }
      else if (e.key === "Enter" && l[active]) { choose(l[active].id); e.preventDefault(); }
      else if (e.key === "Escape") { open = false; render(); }
    };
    host.querySelectorAll("[data-id]").forEach(b => b.onmousedown = e => { e.preventDefault(); choose(b.dataset.id); });
    input.onblur = () => setTimeout(() => { if (open && document.activeElement !== host.querySelector("input")) { open = false; render(); } }, 120);
  }
  render();
  return { set(v) { opts.value = v; render(); } };
}

// Clickable route pills. Empty selection means "all routes".
function routeChips(host, stopId, selected, colours, onChange) {
  const stop = stopById(stopId);
  if (!stop) { host.innerHTML = `<span class="hint">Pick a stop to see its routes.</span>`; return; }
  const all = !selected.length;
  host.innerHTML = `<div class="route-chips">${stop.routes.map(r => `<span class="route-chip ${all || selected.includes(r) ? "" : "off"}" role="checkbox" tabindex="0" aria-checked="${all || selected.includes(r)}" data-r="${r}" style="${pillStyle(r, colours)}">${r}</span>`).join("")}</div>
    <div class="hint">${all ? "Showing all routes. Click a route to hide it." : `Showing ${selected.length} of ${stop.routes.length} routes. <button class="linkish" type="button" data-all>Show all</button>`}</div>`;
  const toggle = r => {
    let next = all ? stop.routes.slice() : selected.slice();
    next = next.includes(r) ? next.filter(x => x !== r) : next.concat(r);
    if (next.length === stop.routes.length || !next.length) next = [];
    onChange(next);
  };
  host.querySelectorAll("[data-r]").forEach(el => {
    el.onclick = () => toggle(el.dataset.r);
    el.onkeydown = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(el.dataset.r); } };
  });
  host.querySelector("[data-all]")?.addEventListener("click", () => onChange([]));
}

// Small rendering of the departures board for a config.
// cfg: { layout, main, left, right, trains:{left,right}, pageSize, cutoff, colours }
function bandHtml(title, slot, cfg, busRows, train) {
  const rows = slot.stopId ? departuresFor(slot.stopId, slot.routes, busRows) : [];
  const trainRows = train && train.stopId ? departuresFor(train.stopId, train.routes, 2) : [];
  const row = (r, cls) => `<div class="mini-row ${cls || ""}"><span class="pill" style="${pillStyle(r.route, cfg.colours)}">${r.route}</span><span class="dest">${escapeHtml(r.dest)}</span><span class="due">${formatDue(r.mins, cfg.cutoff)}</span></div>`;
  return `<div class="mini-band"><h4>${escapeHtml(title)}</h4>
    ${slot.stopId ? (rows.length ? rows.map(r => row(r)).join("") : `<div class="empty-slot">No routes selected</div>`) : `<div class="empty-slot">Choose a stop</div>`}
    ${train ? (train.stopId ? trainRows.map(r => row(r, "train")).join("") : `<div class="mini-row train"><span class="dest muted">Choose a train platform</span></div>`) : ""}
  </div>`;
}
function renderMiniBoard(host, cfg) {
  const size = Math.max(1, Math.min(8, cfg.pageSize || 5));
  const titleFor = slot => slot.label || stopTitle(stopById(slot.stopId)) || "Stop";
  let bands;
  if (cfg.layout === "single") bands = [bandHtml(titleFor(cfg.main), cfg.main, cfg, size)];
  else if (cfg.layout === "dual") bands = [bandHtml(titleFor(cfg.left), cfg.left, cfg, size), bandHtml(titleFor(cfg.right), cfg.right, cfg, size)];
  else bands = [bandHtml(titleFor(cfg.left), cfg.left, cfg, Math.max(1, size - 2), cfg.trains.left), bandHtml(titleFor(cfg.right), cfg.right, cfg, Math.max(1, size - 2), cfg.trains.right)];
  const now = new Date().toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false });
  host.innerHTML = `<div class="mini-board"><div class="bands" style="grid-template-columns:repeat(${bands.length},minmax(0,1fr))">${bands.join("")}</div><div class="mini-foot"><span>Page 1 of 2 · rotates every ${cfg.rotateSeconds}s</span><span>${now}</span></div></div>`;
}

// Colour editor: one row per route with pickers and a pill preview.
function colourEditor(host, colours, onChange) {
  const routes = Object.keys(colours);
  host.innerHTML = `<div class="colour-rows">${routes.map(r => {
    const [bg, fg] = colours[r];
    return `<div class="colour-row" data-r="${r}"><span class="pill" style="background:${bg};color:${fg}">${r}</span>
      <input type="color" value="${bg}" aria-label="${r} background"><input type="color" value="${fg}" aria-label="${r} text">
      <span class="hint" style="margin:0">${bg} / ${fg}</span>
      <button class="ghost small x" type="button" aria-label="Remove ${r}">Remove</button></div>`;
  }).join("")}</div>
  <div style="display:flex;gap:.4rem;margin-top:.5rem"><input type="text" placeholder="Route, e.g. 70" style="width:8rem" data-new><button class="ghost small" type="button" data-add>Add route colour</button></div>`;
  host.querySelectorAll(".colour-row").forEach(row => {
    const r = row.dataset.r, [bgIn, fgIn] = row.querySelectorAll("input[type=color]");
    const update = () => onChange(Object.assign({}, colours, { [r]: [bgIn.value.toUpperCase(), fgIn.value.toUpperCase()] }));
    bgIn.oninput = fgIn.oninput = () => { row.querySelector(".pill").style.cssText = `background:${bgIn.value};color:${fgIn.value}`; };
    bgIn.onchange = fgIn.onchange = update;
    row.querySelector(".x").onclick = () => { const next = Object.assign({}, colours); delete next[r]; onChange(next); };
  });
  host.querySelector("[data-add]").onclick = () => {
    const r = host.querySelector("[data-new]").value.trim().toUpperCase();
    if (r && !colours[r]) onChange(Object.assign({}, colours, { [r]: FALLBACK_PILL.slice() }));
  };
}

function protoBanner(current) {
  const pages = [["a-layout-first.html", "A · Layout first"], ["b-live-editor.html", "B · Live editor"], ["c-tabbed.html", "C · Tabbed"]];
  const el = document.createElement("div");
  el.className = "proto-banner";
  el.innerHTML = `<span><strong>Prototype</strong> · sample data, nothing is saved</span><nav>${pages.map(([href, t]) => `<a href="${href}" ${href === current ? 'aria-current="page"' : ""}>${t}</a>`).join("")}<a href="index.html">All options</a></nav>`;
  document.body.prepend(el);
}

function defaultProtoConfig() {
  return {
    layout: "single",
    main: { stopId: "8205-eda192d2", label: "", routes: [] },
    left: { stopId: "8205-eda192d2", label: "", routes: [] },
    right: { stopId: "", label: "", routes: [] },
    trains: { left: { stopId: "", routes: [] }, right: { stopId: "", routes: [] } },
    stationLabel: "",
    pageSize: 5, rotateSeconds: 5, cutoff: 60, lookahead: 2, lockFirstPage: false, poll: 10,
    keyMode: "builtin",
    colours: JSON.parse(JSON.stringify(DEFAULT_COLOURS))
  };
}

// Returns a list of { field, message } for whatever stops the board opening.
function blockersFor(cfg) {
  const out = [];
  if (cfg.layout === "single" && !cfg.main.stopId) out.push({ field: "main", message: "Choose a stop" });
  if (cfg.layout !== "single") {
    if (!cfg.left.stopId) out.push({ field: "left", message: "Choose the left stop" });
    if (!cfg.right.stopId) out.push({ field: "right", message: "Choose the right stop" });
  }
  if (cfg.layout === "fourway") {
    if (!cfg.trains.left.stopId) out.push({ field: "trainLeft", message: "Choose the left train platform" });
    if (!cfg.trains.right.stopId) out.push({ field: "trainRight", message: "Choose the right train platform" });
  }
  return out;
}
