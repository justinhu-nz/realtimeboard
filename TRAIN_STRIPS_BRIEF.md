# Train strips that survive rail closures: handover brief

## The problem

The board's "Buses and trains" layout puts two train rows under each bus panel. Each train strip is tied to **one platform stop ID** (`trainLeftStopId` / `trainRightStopId`, filtered at `index.html:3131`). Platforms stand in for directions, and that breaks whenever AT changes how trains run.

What the user wants: for a chosen station, one strip of **city trains** and one of **non-city trains**. Each strip must adjust to closures, diversions and odd running patterns by itself.

**Constraints**
- No hand-written rules for each station or direction. Rail running patterns are often messy, and the user explicitly rejected per-station selectors.
- Keep it simple. The user's worry is that this is getting overcomplicated.

**The user's own board:** they live between Kingsland and Maungawhau.
- Left panel: bus stop 8205 plus Maungawhau Platform 1 ("To City").
- Right panel: bus stop 8204 plus Kingsland Platform 2 ("To West").

## Stress-test cases (every one the user raised)

Dates are 2026. The timetable is AT's GTFS published 3 Nov 2026, which is still AT's latest. The board mirrors it at `justinhu-nz/auckland-gtfs`.

1. **West line closed Swanson–Kingsland, Sat 14–Sun 15 Nov.** Trains turn round at Kingsland and leave **both** platforms for "Manukau via City Centre". The right strip ("Kingsland P2, To West") showed city trains, and there are no west trains at all. Arriving trains end at Kingsland (headsign "Kingsland").
2. **Sun 15 Nov after 8:30pm, E-W closed Manukau–Waitematā; trains run Waitematā–Kingsland only.** This is **not in the published timetable**: no train leaves Kingsland after 19:43. It may only appear in the live feed, and the board currently **ignores trips that exist only in the live feed** (`deriveDepartures`, `index.html:2164`, builds rows from timetable trips only).
3. **S-C night works, Tue 3, Wed 11, Tue 17, Wed 25 Nov (and 1, 8, 9, 15, 22, 23 Dec) after 11pm: Newmarket–Karanga-a-Hape via Grafton closed.** Trains run Pukekohe–Maungawhau **via Parnell** instead, going the other way round the loop. In the timetable these are two trips: Newmarket > Parnell > Waitematā > Te Waihorotiu > Karanga-a-Hape > Maungawhau, and the reverse.
4. **Other S-C closures, all with RBS replacement buses:**
   - Pukekohe–Manukau: 7–8 Nov, Sun 15 Nov after 9:30pm, and 27 Dec–10 Jan.
   - Pukekohe–Newmarket after 9:30pm: Mon 2, 16, 30 Nov and 14 Dec.
   - Pukekohe–Puhinui after 9:30pm: Mon 9, 23 Nov and 7, 21 Dec.
   - Pukekohe–Ōtāhuhu after 9:30pm: Sun 22 Nov and 20 Dec.
5. **Other E-W night works:**
   - Swanson–Waitematā after 11pm: Tue 3, Wed 11, Tue 17, Wed 25 Nov.
   - Swanson–New Lynn after 11pm: Wed 18 Nov.
   - Manukau–Waitematā after 9:30pm: Sun 22 Nov.
6. **Newmarket, a junction.** Trains leave toward Parnell (city), Grafton (city via S-C, but west via O-W), and Remuera (south and Onehunga). Platforms are mixed:
   - P1 serves city trains and westbound trains via Grafton.
   - P4 serves southbound trains, plus a city train on Tue 17 night.
   - P2 serves city trains plus an Ōtāhuhu train.
7. **Via Parnell vs via Grafton from Newmarket.** A via Parnell train only makes sense for Britomart (Waitematā) or Te Waihorotiu, and only if nothing leaves sooner. Timetable ride times:

   | | Waitematā | Te Waihorotiu | Karanga-a-Hape |
   |---|---|---|---|
   | via Parnell | 13 min | 16 min | 19 min |
   | via Grafton | 13 min | 10 min | 7 min |

8. **…except during closures, when via Grafton trains don't run (case 3).** Then via Parnell is the right train.
9. **Citybound trains that never reach a city station.** The user's example was "buses replace trains between Otahuhu and Homai". That closure isn't in the feed, but the same shape is, every day:
   - E-W Manukau, Puhinui, Papatoetoe or Middlemore → **Otahuhu**.
   - S-C Pukekohe…Remuera → **Newmarket**.
10. **The S-C is a loop.** One anticlockwise trip runs Newmarket > Parnell > city > Grafton > **Newmarket again** > Pukekohe. At Newmarket the same trip is citybound on its first call and southbound on its second.
11. **Kingsland's O-W trains.** "Onehunga via Grafton" leaves Kingsland toward Maungawhau like city trains, then turns off via Grafton and never reaches the city.
12. **The user's spreadsheet idea:** every station knows its citybound, eastbound, southbound, westbound and northbound relationships. The open worry is branching (cases 6, 10, 11).
13. **A diversion that bypasses the city (hypothetical).** Suppose an E-W train runs Kingsland > Maungawhau > Grafton > Parnell > Orakei, for example with the CRL shut. It leaves Kingsland the same way as every city train but never calls at a city station. Any rule learned from *normal* running would confidently call it a city train. Calling it "other" is accurate but unhelpful: Grafton and Parnell are near the city, and the rider needs to see that.

## Signals already ruled out (tested against the timetable)

| Signal | Fails on |
|---|---|
| Platform | Cases 1, 3 (Maungawhau E-W leaving from P2), 6 |
| Next station only | Case 11 |
| GTFS `direction_id` | Cityward is 1 for E-W but 0 for S-C at Maungawhau. It's also inconsistent within S-C (some southbound Manukau trips share the northbound value) |
| `direction_id` plus line, per station | Case 10: S-C at Newmarket splits 269 city / 293 other |
| Headsign contains "City Centre" | Trains ending at Waitematā are headed just "Waitemata" (40 misses) |
| Straight-line distance to the city | 1,303 false positives on the Onehunga line |
| Busiest station = "the city" | Newmarket (356 trips a day) outranks the city stations |
| "Same run (here → last stop) normally reaches the city" | Case 10: Newmarket → Pukekohe and Parnell → Newmarket are marked city |
| Table of (line, station, next station), filled by majority vote over the timetable | Case 13. The table encodes normal running, so it's confidently wrong exactly when running isn't normal, which is the whole point of the feature. (It did match all 31,737 timetabled departures apart from short-runners, so the data won't reveal this weakness.) |

## What survived

- **City rule:** a departure is a city train if a later stop on *that trip* is Waitematā, Te Waihorotiu or Karanga-a-Hape. That list is the only network knowledge.
  - It handles cases 1, 3, 6, 10 and 11 with no special cases.
  - It agreed with the "City Centre" headsign on 16,142 of 16,182 departures; every disagreement was a Waitematā-terminating train, where the rule was right.
- **Trains that end at your station** are already excluded: `pickup_type=1` is set on every rail last stop. The only mid-trip `pickup_type=1` stops are Te Huia set-down-only stops, which correctly can't be boarded.
- **Earliest-arrival filter (cases 7 and 8):** keep a city train only if no *later-departing* train reaches some city station sooner. Closures need no special handling, because absent trains can't beat anything. Use live predicted arrivals where available.
- **Principle from case 13: sort trains only by facts about that trip.** Use normal running only to notice when a trip is *unusual*, never to decide where it goes.
  - **Unusual check:** a departure is unusual if its remaining stops don't appear in that order in any trip in the normal timetable. Case 13 fails at Grafton → Parnell, because normal trains from Grafton go to Newmarket or Karanga-a-Hape. Unusual trains should show more detail rather than a confident label, e.g. "Orakei · via Grafton, Parnell · not via city". AT's headsigns often already include a "via".
  - **Short-runners (case 9):** an optional fallback that counts a train as citybound only if trains making exactly the same calls normally carry on to the city. It catches every real short-runner and avoids the case 10 traps. It's safe for case 13, because no normal trip makes those calls, so it finds no evidence and stays out of it. The simpler alternative is to leave short-runners in "other" with their destination.
- **Empty strip:** show a status card with the alert headline and the next departure. The timetable also has rail replacement buses (RBW, RBO, RBE, RBS, RBM). On 15 Nov, RBW and RBO stop at "New North Road/Kingsland Station" and "Kingsland Shops".

## Open questions

- Should short-runners go in the city strip, perhaps labelled "change at Otahuhu", or stay in "other" with their destination?
- How to label "other" at junctions (Newmarket mixes south, Onehunga and west)? Options: one row per next station, a line filter, or auto labels like "towards Swanson".
- Building rows from live-only trips (case 2) is needed whatever classifier is chosen.
- At the three city stations themselves, "city train" is meaningless. Setup should not offer it there.

## Where things are

- **Board:** `index.html`.
  - Train slots: `trainPlatformIds` at `:1266`, rendering at `:3131`.
  - Bundle build: `buildBundle` at `:1648`.
  - The worker's stop_times filter by stop ID is at `:1450`. Add the city platforms to this filter to get city arrival times cheaply. The unusual check and the short-runner fallback need all rail stop_times (about 37,000 rows).
- **Prototype:** `prototypes/train-strips.cjs` covers the city rule, the earliest-arrival filter and one-row-per-direction for "other". It's timetable only, with no short-runner table and no live data. Run it with:

  ```bash
  node prototypes/train-strips.cjs <unzipped-gtfs-dir>
  ```

- **Analysis scripts:** these live in a temporary folder on the user's machine, not in the repo. Ask for them if you need them.
