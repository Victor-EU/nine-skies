# Findings, version 2

The film's findings, continuing the numbering of `prototype-findings.md`
(F1–F74, the version-1 game) as plan v2 D78 has it. A finding is something
measured, with the number and what it changed.

## F75 — The cut (plan stage 1), 23 September 2026

**What was done.** Branch `film`. The version-1 game systems were deleted
rather than disabled (D74, D76, D80): the flight model, aircraft and route
simulation; expeditions, challenges, discoveries, the journal, saves, the HUD
readouts and comfort settings; the region schema, the cards, the signed route
sections and challenge patches with their cutters and key; every tool that
read them; and the 1,657-line shell. The design and plan v1 moved to
`docs/archive/`.

**What was written.** `engine/src/film/`: the timeline (120 s a scene, 6 of
lead-in), the scene format with rails projected at load, the rail flight
(auto as attractor, heading inside a corridor, a bounded speed multiplier,
cosmetic bank) and the altitude controller (look-ahead, rate cap, band).
`engine/src/input/` cut to two axes and one action with a touch source
beside keyboard and pad. `content/scenes.ts`, the gate; `tools/film.ts` and
`tools/validateFilm.ts`; a Vite plugin serving `/film.json` from
`content/scenes/`; a shell of about 300 lines with a title card, a caption
line, an auto badge and a player bar. One scene authored, the Three Gorges,
18 rail keys from Yichang to Fuling.

**Numbers.**

| | Before | After |
| --- | --- | --- |
| Working-tree diff | | 151 files, +4,515 / −23,887 lines |
| TypeScript source (engine, app, content, tools) | ~21,000 lines | 9,764 lines |
| TypeScript tests | 761 | 363 |
| Python tests | 393 | 389 (the four that read committed route sections) |
| Typecheck, tests, film gate | | green |

**What the first flight showed.** Over the corridor world with its 90 m
hero grid, the scene plays end to end: title over the first frame of the
rail, 114 s of flight, the end card. Steering takes the camera off auto and
the idle timer puts it back; the badge follows. Two things the rough cut
will have to fix, both content rather than code:

- A rail typed from a map as straight lines between river towns cuts across
  the meanders, and at 250 m above the water the near wall fills the frame
  where the line meets it. That is what the rail recorder (D83, stage 2) is
  for: a rail flown, not typed.
- The gate's slack rule (a viewer at double speed must not run out of path)
  asked the Three Gorges for 342 km of rail against the 190 km of gorges,
  so the rail runs on past Wanzhou to Fuling. The rule is right and the
  cost is real: every scene's rail is about twice the ground it shows.

**Two facts for the next stage.** The country world has no hero index until
stage 0's cuts land, so the gorges scene flies over the 1 km grid there and
over the 90 m grid on `?world=sea-to-sky`. And the gate checks hero grids
against whichever built world carries an index, so on a machine with no
world it says so rather than passing silently.

## F76 — Stage 0: what the source resolves, 23 September 2026

**What was done.** The hero cutter's 90 m became a per-area setting and an
index became one lattice per directory (`hero/` at 90 m, `hero-30m/` at 30 m),
because the engine draws one texture array of one tile size per index. Four
90 m areas were cut for the country world, Everest and the Taklamakan's
central dunes new beside the two gorges, and Guilin to Yangshuo was cut at the
source's own 30 m: 180 tiles of 3,840 m, 6.0 MB raw. Each was hillshaded from
its raster before any renderer touched it (`docs/stills/*-hillshade.png`).

| Area | Cells | Tiles | Raw | Reads as |
| --- | --- | ---: | ---: | --- |
| Everest and the Rongbuk glacier | 90 m | 9 | 0.30 MB | The massif, its glaciers and ridges, 3,697–8,734 m |
| The Taklamakan's central dunes | 90 m | 16 | 0.53 MB | Dune ridges, north-east to south-west, 1,099–1,213 m: 100 m of relief drawn as dunes, not noise |
| Guilin, the Li to Yangshuo | 30 m | 180 | 5.99 MB | Towers. At the Xingping bend the cones stand as separate peaks either side of the meanders, 108–656 m |

**What it decides.** Scene 3 stands: the karst reads, and it reads only at
30 m. The engine therefore grew a second lattice rather than the scene
moving: `Terrain` takes every hero cover and gives each its own lattice and
texture array, drawn into one set of cuts in the country grid, and the
offline reader does the same. In the browser both load together: 85 tiles at
90 m and 180 at 30 m.

**Sited from the map, to be measured.** The Taklamakan area and the two Li
places were placed from the map, not by `siting.py`; the hillshade says the
dunes are under the box and the towers are in it, which is the question, but
the siting report has not run over them.

## F77 — Stage 2: the rough cut, 23 September 2026

**What was done.** Nine scene files, the film exactly 18:00 to the frame.
Four rails are Natural Earth's own river centrelines resampled every 4–12 km
(`python -m nineskies.rails`): the Yangtze through the gorges, the Jinsha
round the first bend, the Yellow River south through the loess. Five are
hand-typed from the map where no river runs (the estuary, the Li, the steppe,
Turpan to the Taklamakan, the plateau, the Himalaya). The lead-in map draws
the country from the horizon field, the rails flown so far and the jump to
the next scene with its distance; the end card draws the whole route. A rail
recorder (`?record=<id>`) flies free and writes a rail into its scene file; a
still hook writes the frame to `docs/stills/`. `make rails` flies every rail
over the country world (`docs/rails-report.md`).

**What the rails report says.** No rail leaves the world. The camera never
reaches its band's ceiling except 4 % of the first bend, and its floor only
1 % of the gorges. Ground stands above the camera within 2 km ahead on 1 % of
the gorges and 2 % of the first bend, by up to 400 m: the walls of a gorge
the rail is inside, which is the picture. Over hero grids: 25 % of the gorge
rail (the gorges are 190 of its 576 km), 52 % of the Li, 47 % of the Jinsha,
16 % of the Himalaya, 5 % of the desert.

**What the rough cut looks like**, every scene in the prototype's look:

- The estuary opens over the sea with the coast a thin line: true and empty,
  which is the provisional scene the design warned about. Watched, the
  decision is still open; nothing in this frame earns the slot yet.
- The gorges now follow the river rather than cutting across it (F75), and
  the ribbon of water leads the eye between the walls.
- Karst: the towers stand as separate spikes over the green plain, at eye
  level. The scene the data was least likely to carry carries it.
- The first bend is a wall on both sides at 300 m over the water; the frame
  wants a higher rail or a wider corridor, which is the recorder's job.
- Loess: the Yellow River as a blue line through ochre, readable but flat.
- Steppe: the Yin Shan fills the first frames and the emptiness has not
  begun; the rail should start west of the hills or higher.
- Turpan: Ayding Lake reads as a pale floor in a bowl under grey ridges.
- The plateau: flat, pale, a lake; the sense of height is the caption's job
  until the look gives the sky its altitude.
- The Himalaya: a snowfield of peaks at six times relief, the summit a spike
  among spikes. It reads as a wall; whether it reads as Everest is stage 3.

**What it changes.** Nothing in the code. Two rails want re-recording
(the first bend higher, the steppe further west), one scene is still
provisional (the estuary), and every frame says the same thing: the look
is the film, and stage 3 is where the time goes.

## F78 — Stage 3: the look, 23 September 2026

**What was done.** A look layer over the terrain renderer, `engine/src/look/`
(design v2, "The look"):

- *A sun.* Direction from the scene's month and hour and the camera's
  place, through the NOAA position `gfx/solar.ts` already had; its colour a
  transmittance by air mass (gold at ten degrees, orange on the horizon),
  scaled by the sky preset's turbidity. The clock runs at 1x: two minutes
  move the sun half a degree.
- *A sky per scene.* A dome drawn first from one GLSL chunk, `skyAt`, and a
  haze colour every surface takes from the same chunk, `skyHorizonAt(dir)`,
  which carries the sun's glow: ground towards the sun fades into warm air,
  ground away from it into cool, and the seam the version-1 rule forbade is
  still one number. Nine sky presets: haze density and scale height, a tint,
  a turbidity, the glow's strength and width, the zenith's depth.
- *Shadows.* One 2,048² depth map from the sun (1,024 on a phone) over a
  square ahead of the camera that scales with its height (4–16 km of world),
  drawn with the terrain's own vertex shader and cut, texel-snapped, read
  with nine hardware-compared taps and faded at the map's edge.
- *Clouds.* Mist as a slab in the terrain shader, banked by noise, from the
  ground to a level; a cloud layer as one quad of five-octave noise for a
  deck or cirrus. No summit plume: `summit-plume` is thin cirrus for now.
- *A palette per scene.* The ramp's stops, rock, snow, the slope at which
  ground turns to rock, and the three water colours, baked into the fragment
  shader as constants and recompiled at scene start; a snow line by latitude
  (5,700 m at 28 N to 4,000 m at 43 N) unless the preset says a height.
- *Water with light in it.* A surface tilted by noise, reflecting the sky by
  Fresnel (never the disc: a mirror of a disc twenty-five times white is a
  hole in the picture), glinting in the sun's own colour at twice white.
- *A grade.* Linear light into a multisampled half-float target, a bloom
  from what is brighter than white, then exposure, warmth, saturation,
  contrast, a filmic curve, a vignette and sRGB. Five grade presets.

The names a scene file may use are the four tables in `look/presets.ts`,
and the content gate refuses any other. Deleted with their subjects: the
region-blend atmosphere (`gfx/aerial.ts`, the stand-in region weights, the
flight-model atmosphere). New tools: `__ns.hold(i, s, hour?)` holds a scene
at a second on its rail in auto and `__ns.still(name, w, h)` saves it;
`make stations` cuts the frame-cost stations from the rails
(`app/public/capture-stations.json`, one a scene at sixty seconds).

**What the sun said about the hours.** Five scenes named an evening light
and were lit at noon: with one time zone, 19:00 in Turpan is a sun 28° up.
Moved: the loess to 16:00 (20°), the steppe to 19:00 (5°), Turpan to 21:12
(5°), the plateau to 18:54 (6°), Everest to 19:15 (5°). And the gorges from
09:30 to 17:00: at 09:30 the sun stood behind a camera heading west and lit
both walls alike; at 17:00 it stands ahead, one wall lit and one in shade,
the river carrying its glint. The design's row 2 now says so.

**The reference still**, `docs/stills/02-three-gorges.png`: scene 2 held
sixty seconds in, inside Xiling Gorge at 280 m over the water, the sun
ahead-left at 28°, green walls with rock on the steepest facets, mist in
banks on the water, the far ridges layered in haze, the sky deepening to
blue. Signed off as the rule the other eight inherit. Four other stills are
taken at 1,280 × 720 (`docs/stills/README.md`); four remain, because the
app's browser pane stopped compositing when the session's window closed,
and a frame that is not composited cannot be read back.

**What the stills taught, in the order it cost time:**

- *Mist must top out under the rail.* The first gorge mist stood at 350 m
  with the camera at 250 m, and every frame was white. At 230 m, under the
  band's floor over the reservoir, it lies on the water. A slab also whites
  out any low plain in view - the Jianghan plain east of Yichang was one
  sheet - so the density is a quarter of the first guess and two octaves of
  noise bank it.
- *The horizon ring's skirt is a wall in clear air.* Version 1's band hung
  fourteen degrees below each ridge and hazed its foot by 38 %; the film's
  plateau and Himalaya presets were ten times clearer than its air, and the
  skirt showed as a grey wall where the streamed ground ran out at 384 km.
  The foot now fades all the way to the sky, and no preset is clearer than
  2 × 10⁻⁶ a metre: the plateau's clean horizon is its scale height and its
  blue, not a vacuum.
- *A held camera must be placed from the ground that is finally drawn.* A
  hold made before a hero grid's tiles arrived sat on the 1 km surface,
  hundreds of metres over the 90 m one (F51), and two holds of the same
  frame gave two pictures. The hold re-places its height every frame.
- *The first bend's rail is a wall at 300 m and the sky at 2,200 m.* At six
  times relief Tiger Leaping Gorge is a slot; from 300 m over the river the
  frame is the wall, from 2,200 m over the highest ground ahead it is peaks
  from an airliner. The rail now flies 1,000 m up in a 400–2,500 m band,
  unverified until the pane composites again.
- *The sky's fill was blue.* Sky light straight from the zenith colour made
  every shade side blue; it is pulled a third of the way to grey.

**Frame cost: not yet measured.** The GPU timer is available in the app's
browser; the capture at the nine stations (`__ns.frameCost()`, now drawing
through every pass and pricing sky, shadow, clouds and post one at a time)
needs a compositing pane. The machine is an M3, not the plan's M1, and the
plan's 8 ms line will be read against that. Phones are unmeasured.

**What it changes.** The gorges are an afternoon scene. Two decisions still
open for the user: scene 1 is a green plain under a hazy sky at sixty
seconds (the estuary against Huangshan, D-open), and scene 6's steppe reads
but is flat. Stage 3 continues with the four stills, the capture, and a
phone; stage 4 (packs) can start beside it.

## F79 — Huangshan opens, and the steppe ends at Heaven Lake, 23 September 2026

**What was decided.** Two content decisions by the user, on the stills:
Huangshan opens the film in place of the estuary, which was the flattest
ground in the slot; and scene 6 keeps the steppe *and* takes Changbai's
crater lake, since nine 120-second boxes leave no tenth slot and a split
box breaks the one rule every test holds. The shape that fits is one scene
carrying both by speed: east across the Xilingol grassland at 550 km a
minute, the film's fastest, then the rail slows to 35 over the volcano and
laps the lake three times, so a double-speed viewer arrives at forty-five
seconds with two laps to fly and a normal viewer at about ninety. At half
speed the lake never arrives, which is the time box (D73). The Gobi leaves
the film; Turpan keeps the desert.

**What was cut.** Two hero areas from the source, like stage 0's (F76):

| Area | Grid | Tiles | Size | What the hillshade says |
| --- | ---: | ---: | ---: | --- |
| Huangshan, Lotus Peak | 30 m | 30 | 2.0 MB raw | The massif's ridges read at 90 m; the spires are 30 m features like the karst, so it joins Guilin's lattice |
| Changbai, Heaven Lake | 90 m | 12 | 0.4 MB | The 5 km caldera is five country samples; at 90 m it is a crater, rim 2,730 m, floor flat at 2,188 m |

The cutter now routes an area to `hero/` or `hero-<n>m/` by its resolution,
so `make hero` cannot mix lattices in one index again.

**Heaven Lake is not in Natural Earth's lakes**, and the water rule draws
only mapped lakes. Its outline is now traced from the source itself: the
cells flat at the lake's own level to the metre (2,188 m, 11.9 km² with the
shore, the lake being 9.8), their convex hull, written as `HAND_LAKES` in
`rivers.py` and appended to the fetched file wherever lakes are read. Cut
again, the area keeps one lake and nine of its twelve tiles are wet.

**The rails.** Huangshan: 84 km at 22 km a minute, 230 s, 97 % over its
grid, 476–1,652 m over the ground; the cloud sea sits at 1,050 m under the
rail's lowest point. Grassland to Heaven Lake: 938 km, 344 s at the
authored speeds, 17 % over the crater's grid. The frame-cost stations are
re-cut; Huangshan's is 22 km in at 1,216 m over the plain's edge.

**What it changes.** The design's shot list rows 1 and 6 and the plan's
scene-1 risk row. Two sky, palette and cloud presets: `huangshan-dawn`,
`granite-pine`, `cloud-sea` (the first deck a scene names), and
`grassland-volcano` with the lake a deep blue. Neither scene has a still:
the browser pane is still not compositing. They are the first two stills
to take when it is, with the first bend.

**Addendum, the same evening: the stills, and what the camera had to learn.**
All nine stills are taken (`docs/stills/`). Three things the new scenes
taught, each a change to the rail rather than the look:

- *A camera pitched six degrees down never sees a slot canyon's floor from
  its rim.* At six times relief the Jinsha lies sixty degrees below a camera
  1,500 m over it, under the frame's bottom edge. The scene file may now say
  `pitch_deg`, and a rail key `pitch:`, interpolated like height; the first
  bend flies at 22 degrees and its still is the slot with the river in it.
- *A ring rail looks along its own tangent.* Circling Heaven Lake, the lake
  was always beside the camera and never in front, and a ring outside the
  rim put the camera below it. The rail now crosses the caldera again and
  again, forty degrees down on each crossing and twenty-five on the loops
  outside the rim between them; the still at 108 s is the first crossing.
- *One clock across ten degrees of longitude.* Scene 6's hour was chosen
  for the grassland at 118 E; at the lake at 128 E the same clock is forty
  minutes later and the sun was down. 18:00 keeps it four degrees up over
  the crater and eleven over the grass.

Huangshan's still is the cloud sea with the summits far below the camera:
the altitude controller keeps the camera 250 m over the highest ground
within eight kilometres ahead, which over a massif of 1,800 m spires means
2,200 m and peaks under the frame. The scene wants peaks at eye level and
cloud below, so the look-ahead has to become a scene value (short over
Huangshan, long over the plateau); that is the next change, not this one.
The frame-cost capture refused to run twice, both times with animation
frames arriving at 1 Hz: the app's window has to be in front for the two
minutes it takes.

## F80 — What a frame costs with the look on it, 23 September 2026

**How.** `__ns.frameCost(8)` at the film's nine stations
(`app/public/capture-stations.json`, `make stations`), drawn through every
pass of the look at 1920 × 1080 on an Apple M3 (not the plan's M1), the
cheapest of eight timings per variant. The instrument fitted 2.25 ms per
megapixel plus 0.61 ms per pass, r² 0.97; its resolution was ±2.3 ms,
because the `clear` variant now carries the sky dome, the shadow pass and
the post pipeline and is no longer the same small work everywhere.

**The numbers**, whole frame, GPU milliseconds:

| Station | Tiles drawn | Triangles | Frame | Of which post |
| --- | ---: | ---: | ---: | ---: |
| huangshan | 167 | 742 k | 3.9 | 2.5 |
| first-bend | 161 | 722 k | 4.7 | 2.9 |
| below-the-sea | 137 | 261 k | 3.8 | 2.5 |
| the-roof | 137 | 261 k | 3.8 | 2.6 |
| the-wall | 146 | 283 k | 4.2 | 2.6 |
| karst | 199 | 1,268 k | 7.0 | 5.4 |
| three-gorges | 46 | 519 k | 4.6 | 3.4 |
| grassland-to-heaven-lake | 97 | 209 k | 4.7 | 3.8 |
| loess | 0 | 0 | 2.8 | 2.4 |

The first five are whole frames: every tile the station wants was
resident. The last four are not: the capture jumps a thousand kilometres
between stations and its settle gave up with 52 to 137 tiles still to
fetch, so the karst's 7.0 ms is 180 tiles of the 30 m lattice over a
half-drawn country and the loess drew nothing at all. The settle has to
wait for the fetch, not only for the upload; that is a capture fix.

**What it says.** With the look on, a frame is 4 to 5 ms at 1080p on this
machine, under the plan's 8 ms line with room, and the post pipeline -
the multisampled half-float scene, the bloom chain, the composite - is
2.5 to 3 ms of it, the largest single cost and the same at every station.
The sky, the shadow map and the clouds each cost less than the
instrument's ±2.3 ms can see; their differences came out on both sides of
zero. An M1 is roughly half this GPU, so 8 to 10 ms there, which is the
budget or a little over it; the post pass's resolution is the lever, and
a phone will be measured by wall clock as the plan says.
