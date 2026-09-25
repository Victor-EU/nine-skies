# Nine Skies — Plan

Version 2, 23 September 2026. Builds the film described in the design
document. Version 1 of this plan is in `docs/archive/`, with the sixty
findings and seventy-two decisions that produced the world this plan
inherits; their numbering continues here rather than starting again.

## Progress, 23 September 2026

| Stage | State | Record |
| --- | --- | --- |
| 0 — Risky scenes | **Done.** Guilin's towers read at 30 m, so scene 3 stands; Everest and the Taklamakan cut at 90 m. | F76 |
| 1 — The cut | **Done.** Version 1 deleted, `engine/src/film` and the shell written, `npm run check` green. | F75 |
| 2 — Rough cut | **Done.** Nine rails, 18:00 to the frame, every rail in its band. Huangshan opens; the steppe ends at Heaven Lake. | F77, F79 |
| 3 — The look | **Built, not done.** Nine stills; every station under 4 ms of GPU at 1080p on an M3 with FXAA. Open: an M1 and an iPhone measured (`?frametime` is the phone's tool). | F78–F83 |
| 4 — Delivery | **Done.** Nine packs, 16.4 MB with what is read before them (55.8 MB since the colour, F87); no tile fetched outside them; the build ships them. First frame on a phone over 4G is arithmetic, not measured. | F84 |
| 5 — Text, sound, credits | **Text and credits done**, every figure in metric and imperial. **No sound**: a stand-in and a synthesised wind were both rejected, and all of it is to be found on the web (D85). | — |
| 6 — Launch | Not started. | |
| 7 — Detail | **Started.** The terrain lit smooth (D86); the ground coloured from the 2016 Sentinel-2 mosaic, and the four southern scenes, hero areas and country, from a median of the Sentinel-2 archive, 2018-2025; the hero tiles nearest the camera at 10 m, and the country's ground along each rail at 10 m too; the walls laid with photographed rock (Poly Haven's scans, CC0) over the photograph's own tone; the ground near the camera lit by its relief below the grid, from GLO-30 (125 m on the country, 30 m on the 90 m hero areas), and the country's ground along each rail at the source's own 31 m. 1,030.3 MB of the 2 GB D89 allows; the terrain 2.0-2.3 ms at the northern stations and 5.7-6.3 at the southern (F95). Next: the country's 250 m colour registered to the ground; the southern stations' cost found among F91-F93; the changed stills signed off (six from F92, seven from F93, three again from F94 and again from F95). | F86, F87, F89, F90, F91, F92, F93, F94, F95 |

Stages 0 to 4 and most of 3 and 5 took one day against five and a half
weeks planned.

## Where this starts

The repository already holds the two things the film cannot do without and
would take months to rebuild:

| Asset | What it is | State |
| --- | --- | --- |
| The world | Copernicus GLO-30 for all of mainland China on one Albers grid at 1 km: 7,245 tiles, 4,667 with land, 98 Natural Earth rivers carved into their valleys, 50 closed lakes kept at their level, a water layer, an 8 km horizon field, every named place measured against the 30 m source | Built. `make world`, six minutes from 67 GB of source held outside the repo. 40 MB of coded tiles, 930 kB of horizon. |
| Hero grids | 90 m grids over the Three Gorges and Tiger Leaping Gorge, with their own water | Built for the corridor world. Everest is defined and not cut. Nothing over Guilin, the Taklamakan or Changbai. |
| The renderer | Streamed tiles, four LODs, the horizon impostor, water ribbons, rim curtains where a hero grid meets the country, a hypsometric palette and aerial haze in shared GLSL | Working, 2.1 ms of GPU per frame on an M3 at 5.9 Mpx. Looks like a prototype. |
| The instruments | GPU timer queries at committed camera stations, a colour-difference check through four kinds of vision, the pipeline's probe and siting reports | Working. |

Everything else in the repository served the version-1 game and goes.

## Decisions made here

- **D73** The product is an eighteen-minute film: nine scenes of 120 s, each
  with a 6 s lead-in. A scene is a time box; it ends at 120 s wherever the
  camera is.
- **D74** The camera is on authored rails. Four inputs: faster, slower,
  direction, auto. Auto is the default and the attractor. Altitude is
  automatic within an authored band. There is no flight model, and the
  simulation folder is deleted rather than kept behind a flag. Rail speed
  is a per-scene cinematographic choice and unrealistic on purpose: the
  film shows the landscape, it does not fly at a true speed.
- **D75** The world is not rebuilt. Hero grids are added beside the country
  grid; nothing under an existing tile changes.
- **D76** Scenes replace regions as the content structure. The nine-region
  schema, the cards, the expeditions, the challenges and their committed
  ground are deleted. Content is `content/scenes/*.yaml` and nothing else.
- **D77** The look is signed off per scene on a committed still frame,
  re-rendered by the frame-cost stations on every build.
- **D78** No playtest gate. The public launch is the test. Findings continue
  in `docs/findings.md`, from F75, in public.
- **D79** Delivery is per-scene packs: each pack holds exactly the tiles its
  rail can see, the film prefetches the next scene during the current one,
  and the whole film is under 30 MB.
- **D80** Same repository, new branch `film`. The version-1 shell is not
  refactored; a new one is written beside it and the old one deleted.
- **D81** Fewer than forty lines of text, none over twelve words. A test
  counts them.
- **D82** Public GitHub repository and a static host. The film carries a
  credits page with the Copernicus notices and the Natural Earth
  attribution; the 67 GB of source stays outside the repository and
  `make world` rebuilds it.
- **D83** Rails are recorded in the app and stored as latitude, longitude,
  height above ground and speed; the engine projects them at load. No
  committed ground and no signatures: clearance is a report from the machine
  with the world, and CI checks only what needs no world.
- **D84** No telemetry. The public's answer arrives through the repository's
  discussions and issues, linked from the credits page, and is written up in
  the findings log.
- **D85** All the film's sound is sourced, none of it made here: the nine
  cues and the bed of wind are recordings found and licensed from libraries
  on the web, credited on the credits page. A wind synthesised in the
  browser from shaped noise was built and heard on 23 September 2026 and
  rejected as sounding like a machine; so was the stand-in before it.
- **D86** The terrain is lit by the ground's normal, not the triangle's,
  reversing version 1's D3. Flat facets were that game's art direction;
  over a 1 km grid they drew the country as bricks a kilometre wide, and
  the film is to look like the place (F86).
- **D87** The film may be up to 300 MB on the wire, not 30, so that the
  ground can be coloured from a satellite mosaic (decided 24 September
  2026). What D79 buys is unchanged: each scene's pack, the next one
  fetched during the current one. What the size costs is written where it
  falls: a longer wait for the first pack, and the host (stage 6).
- **D88** Stage 3 leaves a closed basin no mapped river drains and no
  mapped lake marks as the source has it, reversing D62's fill (decided 24
  September 2026). An audit of the built world against the 67 GB of source
  found the fill was the one large departure from it: the karst scene's
  towers poured into a plain, Guilin's dolines and the Taklamakan's dune
  corridors flat. The film routes no water through a hollow; the mapped
  rivers are still carved to run downhill. Breach was priced and refused
  for the slots it cuts through ridges (F88).
- **D89** The film may be up to 2 GB on the wire, not 300 MB (decided 24
  September 2026), so that the ground's colour and detail can be as fine
  as the camera needs where it flies low. D79 still holds: each scene is
  one pack, and the next is fetched during the current one. The cost falls
  on the host. Past 1 GB the film no longer fits GitHub Pages' site limit,
  and the packs are served from somewhere else (stage 6).


## What each part of the repository becomes

| Path | Now | Becomes |
| --- | --- | --- |
| `pipeline/` | Acquire, reproject, carve, tile, water, package, probe, hero, siting, regions | **Kept whole.** Gains `make scenes` (per-scene packs) and three hero cuts. `regions.py` and the region report go. |
| `engine/src/terrain` | Tiles, streaming, LODs, horizon, water, curtains, palette | **Kept.** Gains the look: sun and shadow, sky, clouds, per-scene palette, snow line, water light, grade. |
| `engine/src/gfx` | GPU timer, comfort settings, colour difference, aerial haze | Timer and aerial haze kept. Comfort settings go; the colour check stays for the text and the map. |
| `engine/src/sim` | Atmosphere, aircraft, flight model, route, scale, solar | `solar.ts` moves to `gfx` and drives the sun. `scale.ts` keeps the two world constants. The rest is deleted. |
| `engine/src/expedition` | Progress along a route, beats, resume | `path.ts` (a point at a distance along a polyline) seeds the rail code. The rest is deleted. |
| `engine/src/input` | Twenty actions, keyboard and gamepad | Kept, cut to four actions, gains touch. |
| `engine/src/map` | Track, transform, palette | Kept for the lead-in map and the end card. |
| `engine/src/{challenge, discovery, journal, save, hud}` | The version-1 game | Deleted. |
| `engine/src/film` | — | **New.** Timeline, scene loader, rail camera, altitude controller, offsets and the auto attractor, captions. |
| `app/src/main.ts` | 1,657 lines wiring twenty systems | Deleted. Replaced by a shell of a few hundred lines: canvas, timeline, player bar, title layer, the lead-in map. `frameCost.ts` and `probe.ts` stay. |
| `content/` | Nine regions, cards, expeditions, challenges, signed sections and patches | `scenes/*.yaml`, a schema, a validator. Everything else deleted, including the cutter key. |
| `tools/` | Route check, sessions, teaches, atlas, challenges, ground, gorges, stations, the section and patch cutters and their signing key | Stations kept and pointed at scene stills. `make rails` replaces the route check: it flies every rail over the world on the machine that has one and commits its report. Committed ground, the cutters and the key go; CI checks no ground. The rest deleted. |
| `test/` | 761 TypeScript tests | The terrain, codec, grid, map and colour tests stay. The rest go with their subjects. New: the four film invariants below, none of which needs a world or a GPU. |
| `docs/` | Reports and the findings log | Reports stay. `prototype-findings.md` stays as the version-1 record; `findings.md` continues from F75. |
| Root documents | GDD v1, build plan v1 | Archived under `docs/archive/`. The README is rewritten at stage 6. |

## The scene file

One YAML file per scene is the whole of the content format.

```yaml
id: three-gorges
title: { zh: 三峡, pinyin: Sānxiá, en: The Three Gorges }
line: One river, three gorges, {190 km} of walls.   # a figure is marked, and shown in miles or feet too
hero: three-gorges            # optional: the 90 m grid to draw here
month: 5
hour: 17                      # Beijing time; the sun comes from it
rail:                         # recorded in the app, projected at load
  - { lat: 30.76, lon: 111.28, above_ground_m: 250, speed: 95 }
  - { lat: 30.84, lon: 111.02, above_ground_m: 300, speed: 80 }
  # ... slack past 114 s of flight at authored speed
band: { above_ground_m: [120, 600] }   # what the controller holds between keys
corridor_deg: 60              # how far off the rail's heading a viewer may turn
pitch_deg: 6                  # how far below level the camera looks; a rail key may say `pitch:` (F79)
look_ahead_km: 8              # how far ahead the altitude reads the ground; 1.5 over a massif of spires (F81)
look:
  sky: gorge-afternoon
  palette: limestone-green
  cloud: valley-mist
  grade: cool
captions:
  - { at: 20, text: The camera is below the rim. }
  - { at: 70, text: Ships climb 113 m through the dam's locks. }
music: cue-02
```

The validator refuses a scene whose rail is shorter than 114 s at authored
speed, whose captions exceed the budget, whose hour has no sun, or whose
hero grid is not built. Clearance is not the validator's job: `make rails`
flies every rail over the world on the machine that has one and commits its
report beside the scenes.

Rails are recorded, not typed. A dev mode in the app flies free with the four
inputs plus climb and descend, drops a keyframe on a key press and writes the
YAML. Nine rails is an afternoon each with the recorder and impossible
without it; the recorder is the first thing stage 2 builds.

## Stages

Each stage has a done criterion that a build can check, and none of them is
a playtest.

### Stage 0 — Prove the two risky scenes (3 days)

Before anything is deleted, answer the two questions that could change the
shot list.

- Cut a 30 m hero grid over Guilin–Yangshuo, roughly 40 × 40 km, and render
  a still from river height. The cutter's 90 m is a module constant today
  and becomes a per-area setting. Either the towers read, or scene 3 moves
  to the nearest place the data can carry and the design document is
  amended. At 30 m this is the largest pack in the film, about 4 MB, which
  is the price of the one scene that needs it.
- Cut Everest at 90 m (already defined in `hero.py`) and the Taklamakan's
  eastern dune field at 90 m, and render a still of each.

Done when three stills exist in `docs/stills/` and the shot list is final.

### Stage 1 — The cut (3 days)

On branch `film`: delete the version-1 systems per the table above, write
`engine/src/film` and the new shell, reduce the bindings to four, port the
tests that survive. The renderer is untouched.

Done when `npm run check` is green with about a third of the tests it has
now, and the app plays one scene on a rail for 120 s over the country world
with the current look.

### Stage 2 — The rough cut (1 week)

Build the rail recorder first, then record nine rails. Nine title cards,
the lead-in map, the player bar, the altitude controller, offsets and the
auto attractor, touch input in landscape with a rotate prompt in portrait,
and the time-box rule. Watch it, all eighteen minutes, in the current
prototype look. Decide scenes 1 and 6 here. Start sourcing the music now
rather than in stage 5: it has the longest lead time of anything the
repository does not make.

Done when the film plays end to end at exactly 18:00 and `make rails`
reports every rail inside its band, with the slack past 114 s.

### Stage 3 — The look (3 weeks)

The largest stage and the honest risk. Take scene 2, the gorges, to a
finished still: sun and shadow, sky, valley mist, palette, water light,
grade. Sign it off. Apply the rule to the other eight, one still each, in
order of how much each departs from the reference (the plateau's clean air
and the desert's orange are the far ends). Hold GPU cost at the stations
throughout.

Done when nine stills are committed with the capture that made them, and
a capture at the stations reads under 8 ms of GPU at 1080p on an M1 and
under 16 ms of frame time at native resolution on an iPhone from the last
three years. CI has no GPU: the stills and the budget are captures committed
with their output, not tests.

### Stage 4 — Delivery (1 week)

`make scenes` cuts a pack per scene: every country tile and hero tile the
rail can see at its view radius, plus the horizon field once. The loader
plays scene *n* while fetching *n+1*. First frame under three seconds on a
mid-range phone over 4G.

Done when the film is under 30 MB total, a test proves each pack contains
every tile its rail streams, and no tile outside the packs is ever requested.

### Stage 5 — Text, sound, credits (1 week, in parallel with 3 and 4)

The forty lines, written and counted. Nine cues and the wind bed sourced,
licensed and placed. A credits page with the Copernicus notices, Natural
Earth, the licences of the music, and the question the project asks.

Done when the text test passes, every scene has its cue, and the credits
page renders the notices verbatim from `NOTICE.md`.

All the sound is found, not made (D85): the nine cues and the wind bed are
recordings from libraries on the web whose licences allow a public web
build, listed with their credits in `content/sound.yaml`. Finding them is
research: which libraries carry music with Chinese instruments and field
recordings of wind at altitude, and on what terms.

Researched 24 September 2026. The site serves every cue as a file anyone
can download, and the `packs` release is public, so only CC0 and CC BY 4.0
recordings qualify: Freesound (per sound) and Kevin MacLeod's Incompetech
(CC BY 4.0) carry both music with Chinese instruments and CC0 mountain,
valley and dune wind. Nothing non-commercial, no-derivatives or
share-alike, which synced to picture would make the film share-alike;
Pixabay, the BBC's library and the paid libraries all forbid handing out
the files. The one way to nine cues written for these places is a
commissioned score, licensed CC BY 4.0 by contract. The choice is the
author's.

### Stage 6 — Launch (2 days)

Create the public GitHub repository (there is no remote today), CI on `main`,
the static host (GitHub Pages or Cloudflare Pages; the film may now be up
to 2 GB (D89). Under 1 GB, GitHub Pages' site limit holds, but its soft
limit of 100 GB a month is only a few hundred full viewings. Past 1 GB the
packs go elsewhere. Cloudflare Pages has no bandwidth limit but refuses any
file over 25 MiB, so a larger pack is split. An object store that charges
nothing for downloads, such as Cloudflare R2, takes the packs whole),
the README rewritten for the film, `docs/findings.md` opened with what the
build measured, and the link published.

Done when the link plays on a phone that has never seen it.

### Stage 7 — Detail (last, as fine-tuning)

The landscape reads as a game built with Lego: flat-shaded facets, a 1 km
country grid under six times the relief, and colour from elevation bands
alone. The fix is more data and a finer rendering of it, and it comes last
because it is tuning, not structure.

- *Research the data.* Where land cover (forest, grass, desert, rock, snow,
  farmland) comes from at 10 to 30 m and on what terms; whether a cloud-free
  satellite mosaic can colour the ground, and under which licence; glacier
  and snow outlines; whether more hero areas or a finer country grid pay
  for their bytes. Each source's terms are read before a byte is fetched,
  as for Copernicus and Natural Earth (F59).
- *Render it finer.* Normals from the height field per pixel rather than
  per face, detail below the grid's resolution, ground coloured by what
  covers it rather than by its height, and the relief exaggeration looked
  at again where it turns hills into spikes.

Done when the nine stills are re-taken beside the current ones and signed
off, and the frame cost and the budget (2 GB, D89) still hold, or are revised with the
reason written down.

**Calendar:** seven to nine weeks of one person's time with Claude, so a
launch in the second half of November 2026 if stage 0 raises nothing. Stage 3 is
the only stage likely to run over, and if it does, the film launches with
the scenes that are finished and the rest at the rough-cut look, marked as
such on the credits page. A late launch is a worse outcome for a research
project than a partly polished one.

## Tests that stay and tests that are new

Kept: the pipeline's 152 Python tests; the terrain codec, grid, streaming,
horizon, water and palette tests; the projection reference; the colour
difference check; the map tests. Deleted with their subjects: everything
under flight, route, challenge, discovery, journal, save, HUD and
expedition.

New, four of them, none needing a world or a GPU:

- Every scene is 120 s and the film is 18:00 to the frame.
- Every pack holds every tile its rail and its heading corridor can stream,
  and the film is under its budget (30 MB, 300 MB since D87, 2 GB since D89).
- Text: fewer than forty lines, none over twelve words, a title on every
  scene, characters on every title.
- Every scene names a hero grid that is built or none, an hour with a sun,
  and a music cue that exists.

Not tests: rail clearance (`make rails` on the world machine, report
committed), the stills and the GPU budget (captures, committed with their
output). Version 1 committed ground beside every route so CI could fly it,
signed it so nobody could edit it, and re-cut it on every world change. That
machinery was a fifth of the repository, and it goes.

## Risks

| Risk | What it would do | What is done about it |
| --- | --- | --- |
| The look does not arrive | The film is true and dull, and dull loses the viewer at scene 2 | Stage 3 is the longest stage; the reference still is signed off before the rule is applied; the fallback is a partial launch, not a delay |
| Guilin does not resolve at 30 m | Scene 3 has no towers | Stage 0 answers it before anything is deleted |
| Phones | The floor device was a Mac; phones were never measured, and Safari has no GPU timer query | Stage 3 measures frame time on an iPhone by wall clock; the LOD radius and resolution scale are the levers |
| Music rights | A film with no sound, or a takedown | Sourced in stage 5 under licences that allow a public web build; credited on the page |
| Data terms on a public build | Copernicus asks for its notices and no implied endorsement; Natural Earth asks nothing; HydroSHEDS was refused in version 1 for exactly this reason and is not used | The credits page carries the notices verbatim, tested |
| Size | 40 MB of tiles plus 122 MB of water for a world the viewer sees a tenth of | Per-scene packs (D79) |
| Scene 1 | The flattest ground in the slot that decides whether anyone sees scene 2 | Decided at the rough cut (F79): Huangshan opens the film, on the 30 m lattice, in a sea of cloud |
| Scope creep from version 1 | Something from the deleted game comes back "because it exists" | It does not exist: D74 and D76 delete rather than disable |

## Not in this plan

Cities, weather, seasons as a setting, other languages, a downloadable
build, telemetry of any kind, sharing, a photo mode, and any measurement of
what the viewer learned before the link is public. What the launch teaches
goes into the findings log, and the next version of this plan is written
from that.
