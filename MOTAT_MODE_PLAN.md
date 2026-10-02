# MOTAT tram board: implementation plan and evidence

**Status:** planning only; no application code has been changed.  
**Research date:** 30 September 2026 (Pacific/Auckland).  
**Goal:** add a separate, optional MOTAT mode to the existing single-page Auckland Live Departures app. A button on the main setup screen opens a familiar stop-based board for the Western Springs trams. MOTAT mode has its own settings and does not require an Auckland Transport API key or GTFS zip.

## What was verified

MOTAT links to a public live tram tracker and publishes separate departure timetables for Great North Road and Aviation Hall. The public tracker page embeds a read-only share session. Using that session for read-only API requests returned:

| Request | Result on 30 September 2026 |
| --- | --- |
| Server metadata | HTTP 200; Traccar version `3.11.7` |
| Session | HTTP 200; `readonly: true`, `admin: false` |
| Devices | HTTP 200; nine tram/device records, including names, status and last update |
| Latest positions | HTTP 200; nine records with coordinates, fix time, speed, course, accuracy and validity |
| One-hour position history | HTTP 200 for two active trams; 664 and 678 fixes respectively; median gap of five seconds in both samples |

At the time of the check, two devices were online. Several others had old positions, including one about 43 days old whose position still had `outdated: false`. **Fix age and operating state must be checked explicitly.** These counts are a snapshot, not an operating schedule.

The session and positions responses reflected a test web origin in `Access-Control-Allow-Origin`, returned `Access-Control-Allow-Credentials: true`, and set a cookie with `SameSite=None`. A request with `Origin: null` also received matching cross-origin headers. This is promising for direct access, but it does **not** prove that the browser running this app can maintain the session: browser privacy settings may block third-party cookies. A direct local-file browser test was blocked by the Codex browser security policy, so it was not bypassed. Test from the app's actual hosted origin before choosing an integration path.

The public share token is deliberately omitted from this document. It may be rotated or revoked. The read-only tests did not modify tracker data, and no copies of the tracker responses were retained in the repository.

## Data model

The MOTAT board needs a small static service model and a separate live movement model:

- **Stops:** official names, manually checked coordinates, order in each direction, and whether the stop is a request stop.
- **Track:** a checked polyline with distance along the line, including terminal and depot areas where applicable.
- **Published departures:** weekday and weekend/event/holiday times for each terminus, with source URL, effective date and last review date.
- **Trams:** tracker device ID, display number, latest position and recent position history. Device identifiers must not be treated as scheduled trip IDs.
- **Predictions:** stop, direction, tram, estimated arrival/departure, source, confidence, and last reliable fix time.

The published PDFs provide terminus departure times. They do not provide a complete GTFS-style trip/stop-time table for intermediate request stops. Do not generate precise scheduled times for those stops from a simple interpolation.

## Implementation sequence

### 1. Prove the browser data path

From the app's deployed origin, perform a read-only session request followed by devices and positions requests. Check response status, cookies, CORS and reconnection after a reload. Confirm that reusing the public shared view in another display is acceptable to MOTAT/Blipbr, and establish a reasonable polling interval.

If direct browser access is unreliable, use a small server endpoint that holds the tracker session, fetches positions, and caches a sanitized public response for all board viewers. Do not scrape the tracker's rendered HTML or fetch an hour of history on every refresh. Do not embed the public token as a permanent application secret.

### 2. Build the static timetable and route

Transcribe the two official timetable PDFs into versioned data. Check the stop order and coordinates against MOTAT's route information and a route map, then validate the track against actual GPS traces. Represent weekday and weekend/event/holiday service separately. Allow an explicit closure or altered-service state; the website currently publishes operational notices outside the PDFs.

### 3. Infer tram movement

Project each recent GPS fix onto the track and calculate its distance along the line. Infer direction from progress across multiple fixes over time. Heading and instantaneous speed are supporting signals, not the sole basis for direction. Reject fixes that are too old, implausibly far from the line, inaccurate, or inconsistent with recent movement.

Classify each tram as moving toward a terminus, stopped on the line, at a terminus, off the line/depot, or unknown. An online tracker alone is insufficient evidence that a tram is carrying passengers.

### 4. Estimate stop times

Estimate time to an intermediate stop from the remaining distance **along the track** and measured travel times for the remaining segments. Include observed stop dwell where there is enough data. Smooth estimates so ordinary GPS noise does not make the board jump every few seconds.

Keep terminal **arrival** and terminal **departure** distinct. A tram approaching Aviation Hall does not imply it will depart at its arrival time; terminal departure should be anchored to the published timetable or evidence of a new run. Avoid forcing a GPS device onto a particular scheduled trip when two trams operate or a service is delayed.

Use confidence-based display states:

| Evidence | Display |
| --- | --- |
| Recent fixes, confirmed direction, plausible route progress | `~5 min` with `Live estimate` label |
| Tram stopped or direction uncertain | `Approaching` or `At terminus` |
| No trustworthy live position and a published terminal departure exists | Fixed clock time with `Scheduled` label |
| No service or no defensible estimate | `No live estimate` or `No service` |

Set freshness, route-distance and confidence thresholds from recorded runs. An initial candidate is to stop showing a moving ETA after roughly one minute without a fix, but this is a **parameter to validate**, not a verified rule.

### 5. Add a separate user flow

Add a **MOTAT Trams** button on the existing main setup screen. MOTAT mode should offer stop selection and the existing single/dual stop board layout, with separate configuration and refresh timers. Show destination, tram number, due time and prediction status in familiar rows. Do not show AT occupancy or alerts in this mode without a corresponding MOTAT source. Returning to the AT board must preserve its current configuration and behavior.

### 6. Validate predictions before presenting them as live

Replay recorded runs and compare estimates made several minutes ahead with observed stop passages. Cover both directions, reversals, terminal layovers, one-tram and two-tram periods, request-stop pauses, stale trackers, loss of access, and closure/altered-service days. Measure median and 90th-percentile timing error as well as false `arriving now` messages. A proposed initial target is median error below two minutes for predictions made 3–10 minutes ahead; adjust the model or its confidence labels if the data cannot meet that target.

## Decision gates and questions for independent review

1. **Data rights and stability:** Is the public read-only share session intended for reuse in a separate display? Can MOTAT/Blipbr provide a documented, stable feed or permission for this use?
2. **Browser access:** Does the session work from the app's real origin on its target browsers, including reloads and third-party cookie restrictions? If not, is a small cache/proxy available?
3. **Static geography:** What are the verified stop coordinates, stop order and track geometry? Which sections are depot or out of service?
4. **Schedule semantics:** Are the linked PDFs current for regular weekdays, weekends, events and holidays? How are closures and temporary timetable changes published?
5. **Prediction semantics:** Should intermediate stops show estimated arrival, departure, or simply an approaching tram? What confidence and error are acceptable for a fun display?

**Go/no-go:** a scheduled terminal board can be built from the PDFs alone. A genuinely live stop board should proceed only after the data path is proven in the target browser or through a cache/proxy, and recorded runs show that its estimates are useful. No GTFS feed is required.

## Primary links for cross-checking

| Purpose | Link |
| --- | --- |
| MOTAT tram information, stops, timetable links and operational notices | [MOTAT tram information](https://www.motat.nz/visit/tram-information/) |
| Public live map and device list | [MOTAT tram tracker](https://tramtracker.motat.nz/) |
| Great North Road published timetable (June 2026 PDF) | [Great North Road timetable](https://assets.ctfassets.net/mplktqcfflsk/1T58FNM1vqnJNU5W2ExNrC/3b627cfd17244f9b7cc46749e2a731cc/Motat_Tram_Timetable_Great_North_Road_June_2026.pdf) |
| Aviation Hall published timetable (June 2026 PDF) | [Aviation Hall timetable](https://assets.ctfassets.net/mplktqcfflsk/23PZrzXR8nFRQDS7stdnsj/179cbc2ef0f84ee829506a594c22c8e2/Motat_Tram_Timetable_Aviation_Hall_June_2026.pdf) |
| Tracking provider's description of the MOTAT partnership | [GPS Live Track MOTAT page](https://gpslivetrack.co.nz/solutions/motat-tram-tracker/) |
| Tracking provider's description of the MOTAT partnership | [Blipbr MOTAT page](https://blipbr.com/motat-tram-tracker/) |
| Tracking software API overview and authentication | [Traccar API documentation](https://www.traccar.org/traccar-api/) |
| API endpoints and response schemas; note that MOTAT runs an older version | [Traccar OpenAPI reference](https://www.traccar.org/api-reference/openapi.yaml) |

The read-only API checks used the share session linked from the public tracker page and the standard Traccar `/api/session`, `/api/devices` and `/api/positions` paths. The direct endpoint responses require that session, so opening those paths alone may show an authentication error. The public tracker page is the reproducible starting point. Current Traccar documentation describes the API concepts; verify behavior against MOTAT's observed `3.11.7` instance rather than assuming every current API feature exists there.
