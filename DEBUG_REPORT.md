# Debug review — 1 November 2026

Reviewed the current standalone apps (`index.html`, `index2.html`, `index-live.html`), regression tests, deployment workflow, and supporting prototype scripts. Preserved pre-existing uncommitted changes. Changes are local; nothing was committed or deployed.

## Fixed in this review

- **Background rebuild navigation:** stale timetable refreshes now rebuild without switching from setup to the board. Added this non-navigation build option to the AT/MOTAT variant too.
- **Obsolete builds:** builds capture their feed, configuration and operation sequence. A build finishing after settings change, a newer build or reset cannot overwrite the current bundle or reopen the board.
- **Reset during downloads/uploads:** timetable loads now have operation identities. Old parsing/download results cannot restore reset data or clear a newer operation's loading state.
- **Missing timetable times:** a missing departure time previously crashed bundle sorting with `Cannot read properties of undefined (reading 'localeCompare')`. Arrival-time fallback is now stored consistently; invalid times are excluded before building.
- **Connection test navigation:** delayed results cannot redraw setup after navigation or apply a verdict to a changed configuration.
- **Malformed alert selectors:** null and non-object selectors are filtered before reading stop and route IDs.
- **Damaged saved caches:** reject null calendar exceptions, malformed notice lists, and malformed ordered trip updates before they reach rendering or delay propagation.

Added `tests/debug-regressions.cjs` to the deployment checks, extended cache validation tests, and added a real-browser connection-test navigation regression.

## Verification

All five dependency-free Node suites pass for each of the three current app variants:

```sh
node tests/four-way.cjs
node tests/share-board.cjs
node tests/edge-cases.cjs
node tests/auto-key.cjs
node tests/debug-regressions.cjs
```

Headless Google Chrome smoke tests also pass for all three variants: startup, colour demo, scheduled board, refresh/navigation races, connection-test/navigation race, share dialog, and setup overflow at 375, 768 and 1440 pixels. External requests were blocked. Chrome required execution outside the filesystem sandbox to launch.

All inline scripts compile in the four root HTML pages and all prototype pages. `node --check prototypes/proto.js` and `git diff --check` pass.

## Remaining findings and limits

- **P2 — MOTAT history has a separate reset race.** In `index2.html`, `motatSeedHistory()` applies fetched history before the parent refresh checks its request sequence, and device-name updates also precede that check. A tracker request completing after reset/source switching can repopulate tracker state. The timetable operation guards added here do not cover tracker authentication/history. This path still needs dedicated mocked tracker tests and operation guards.
- **P2 — GTFS requests have no timeout.** ZIP and unpacked-file fetching can remain pending indefinitely, leaving loading active and delaying fallback. Realtime requests already have timeouts; timetable downloads still need a suitable large-download timeout/cancellation policy.
- **P2 — Legacy page remains published.** Deployment copies `index-old.html`, but the functional suites target the three current variants. The old page received syntax checking only and retains its historical implementation. Decide whether it should stay publicly reachable or receive the same maintenance as current pages.
- **Credential exposure is part of the current architecture.** The workflow substitutes `AT_API_KEY` directly into public HTML, and the app includes a departures credential. A GitHub secret does not remain confidential after that substitution. Use only credentials intended for public client use; confidential credentials would require a server-side design.
- The code is duplicated across several large HTML files. Shared fixes require repeated edits, creating ongoing drift risk.
- Real AT responses, production GTFS ZIP parsing/download performance, tracker authentication/cookies, and current published MOTAT schedules were not verified. Browser coverage is Chrome only. Prototype interactions and the live editor's complete iframe messaging workflow were not exhaustively exercised. Passing tests do not establish that every possible input or race is covered.

---

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
