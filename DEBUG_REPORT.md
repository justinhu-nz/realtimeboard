# Debug review — 31 October 2026

Reviewed and updated both standalone apps: `index.html` (AT) and `index2.html` (AT/MOTAT). Changes are local; nothing was deployed.

## Fixed

- A disabled departures request counted as a successful feed when every configured personal-key feed failed. Failed refreshes now preserve the previous cache and report failure correctly.
- Automatic polling could repeatedly supersede slow requests. Polling now waits for the current refresh, with a 20-second request timeout for live feeds.
- Refresh completion could replace setup with the board after navigation. Completion handlers now check the active mode.
- Storage-write failures triggered another render, potentially restarting network requests repeatedly. They now record the storage error without restarting rendering.
- Invalid saved configuration types and structurally invalid timetable/realtime caches could break rendering. Added validation and fallback behavior.
- Null/empty timing values became zero-delay predictions, and null occupancy appeared as an empty vehicle. Missing data now stays unknown while genuine numeric zero remains valid.
- `NO_DATA` did not stop previous stop/trip delays propagating. It now stops propagation; `SKIPPED` still passes a previous delay through to later stops.
- GTFS epoch conversion used the offset at the UTC guess, producing errors around daylight-saving transitions. It now resolves local noon and uses the GTFS service-day time origin.
- A 48-hour lookahead omitted departures on the second following date, and delayed predictions could extend outside the selected horizon. Both bounds are covered.
- Cancellation records from another service date could affect a repeated daily trip. Supplied movement schedule timestamps are checked against the row.
- Invalid timetable times could reach rendering as invalid dates. Invalid/blank values are excluded.
- GTFS CSV ingestion mishandled BOM headers, quoted headers, multiline quoted stop fields, and header-only stop-times input.
- Timetable builds included drop-off-only stop visits as departures. `pickup_type=1` is now excluded on build.
- Reset left pagination/demo state behind. MOTAT reset also retained its source/tracker state; these are now reset.
- MOTAT accepted malformed or future GPS fixes and could produce live departures during a configured closure. Added validation and closure enforcement.
- Switching AT/MOTAT now invalidates in-flight refresh results before they can update the new mode's refresh status.

## Verification

All three dependency-free suites pass for both HTML files:

```sh
node tests/four-way.cjs
node tests/share-board.cjs
node tests/edge-cases.cjs
```

The deployment workflow now runs these before packaging the site.

The Chrome smoke suite checks startup, colour demo, scheduled departures, refresh/navigation races, the share dialog, and setup overflow at 375, 768, and 1440 pixels. External requests are deliberately blocked. It requires `puppeteer-core` and a Chrome installation:

```sh
PUPPETEER_MODULE=/absolute/path/to/puppeteer-core CHROME_PATH=/absolute/path/to/chrome node tests/browser-smoke.cjs
```

`git diff --check` passes.

## Limits

Live AT credentials, full production GTFS downloads, tracker cookie authentication, and actual feed availability were not exercised. Browser interaction testing used Chrome; Safari and Firefox remain unverified. The smoke suite checks setup width, not every board layout visually. MOTAT's hard-coded published timetable was not independently revalidated. Existing cached bundles need rebuilding to remove previously included drop-off-only visits.

Reference rules checked against the official [GTFS schedule specification](https://gtfs.org/documentation/schedule/reference/) and [GTFS realtime specification](https://gtfs.org/documentation/realtime/reference/).
