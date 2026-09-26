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

F82 re-measures all nine: the four half-drawn stations whole, and every
station drawn as its own scene, which F80's were not.

## F81 — Huangshan flies among its peaks, 23 September 2026

**The change.** How far ahead the altitude controller reads the ground is
now the scene's to say: `look_ahead_km` in the scene file, eight unless
the scene says, 0.5 to 30. The controller reads the ground under the
camera and at eight even steps out to that distance, instead of at 1.5,
4 and 8 km; the even steps see every ridge on the way, and moved the
other eight scenes by tens of metres, all towards fewer floor hits.
Huangshan reads 1.5 km, its keys over the massif fly 150 m over the
highest ground in that reach, and its band floor is 150 m. The still is
taken at twenty seconds now, not thirty: at 22 km a minute, thirty
seconds is 11 km in and already past Bright Summit, with the ground
ahead dropping under the deck and nothing in the frame but cloud.

**What the frames said.** Held at 16, 20 and 24 s:

- At 16 s the frame is a wall. It is not a spire beside the line that the
  controller missed; it is the massif's southern front 1 to 2 km ahead,
  which at six times relief fills the frame from the deck to its top. The
  controller starts climbing it when it enters the reach, 4 s out at
  22 km a minute, and the frame-rate walk of the rail has the camera
  under ground within 1 km on 4 % of frames by at most 71 m, at the
  band's floor 1 % of the time, never faster than 253 m/s. The massif
  looms and the camera rises over its rim into the spires; that is the
  opening.
- At 20 s the camera is at 1,779 m with Lotus Peak ahead across the
  horizon and the spires falling away to the cloud on both sides. That is
  the still.
- At 24 s the camera is at 1,850 m and the frame is cloud, with the
  spires just passed at its bottom edge: at 1:8 anything within a
  kilometre and below the camera is under the frame's bottom, which is
  41° down at pitch 10.

**One kilometre was tried too.** It puts the 20 s camera at 1,607 m, in a
slot between two walls with the cloud sea through the gap: among the
peaks to the letter, and no massif in the frame. The walk is rougher as
well, under ground within 1 km on 6 % of frames by up to 254 m at
317 m/s. A kilometre and a half shows the massif and flies it smoothly.

**A swath was tried and refused.** Reading the ground on five lanes out to
24° either side of the heading, on the argument that a spire 200 m
beside the line stands in the middle of a frame 94° wide, put the
three-gorges station from 814 to 1,193 m and the first bend at its
ceiling 29 % of the time: in a gorge the walls beside the line are the
picture, and a controller that climbs for them takes the camera out of
the gorge. At Huangshan it bought nothing the eye could see, since the
wall at 16 s is on the line. The controller reads the line.

**Two lessons for the stills.** A hold placed before the hero tiles have
landed reads the ground as null, and the camera sits at the band's floor
over nothing: three stills came back byte-identical at 150 m before the
tiles were given twenty seconds. And a vite restart, which any engine
edit causes, refetches the whole country; a still after one needs the
same patience.

**Rails report.** Huangshan: 89 km, 242 s at authored speed, 150 to
1,383 m above ground, ground ahead above the camera on 2 % of samples by
up to 160 m, at the floor 2 %. The first bend sits at its 1,600 m ceiling
11 % of the way, which is the band chosen in F79, not this change.

## F82 — The capture waits for the world, and draws each station as its scene, 23 September 2026

**Why F80's settle gave up.** The capture suspends the shell's loop and
placed each station once, then only drew. Placing is what asks the
terrain for tiles and inserts the ones that have landed, so after that
one frame the terrain's stats never changed: the fetches it had started
landed in a cache nobody read, the settle saw the same "137 in flight"
for 180 frames, and timed whatever had been cached from earlier in the
page's life. It was not a limit too short. On a fresh page every station
now arrives in 0.07 to 0.48 s, well inside the old three seconds.

**The fix.** The settle places the station every frame, and calls the
world finished only when nothing is missing, landing, or in flight,
water files included (the terrain's stats now carry `waterPending`). A
failed fetch waiting to be asked again is in flight for nobody, so
"nothing in flight" was never the same as "nothing missing". Its limit
is thirty seconds of wall clock rather than a frame count, and a station
that does not arrive is timed anyway and marked `⚠ NOT WHOLE` in the
table, with how many tiles it lacked. Tests cover the rule and the loop.

**A second fault, found by the re-capture.** Every station was drawn as
whatever scene the film happened to be playing: its palette, mist, cloud
deck, sun and camera pitch. A run taken while the gorges were playing
drew the first bend at 6° instead of its 22° and under the gorges'
valley mist, and read it 1 ms dearer than it is. The shell's capture hook
now sets each station's own scene for it, at the station's own second
(`flightS`, written by `make stations`) and the rail's pitch there, and
puts the playing scene back afterwards.

**The numbers.** `__ns.frameCost(16)` at all nine stations, twice, on a
fresh page, 1920 × 1080 on the M3, each variant the cheapest of 16. The
instrument fitted r² 0.995 and 0.987, resolution ±1.1 and ±1.0 ms. The
frame is the cheaper of the two runs; seven stations agreed within
0.25 ms, the grassland and Turpan within 0.7 and 0.9 ms.

| Station | Tiles | Triangles | Frame | Terrain | Post |
| --- | ---: | ---: | ---: | ---: | ---: |
| huangshan | 167 | 767 k | 5.7 | 1.8–2.0 | 2.8–2.9 |
| three-gorges | 173 | 775 k | 5.1 | 2.3–2.4 | 2.8–3.0 |
| karst | 317 | 1,509 k | 5.6 | 2.7–2.9 | 2.9–3.1 |
| first-bend | 161 | 722 k | 5.2 | 2.4–2.6 | 2.8–2.9 |
| loess | 137 | 261 k | 3.9 | 1.0 | 2.5–2.7 |
| grassland-to-heaven-lake | 149 | 269 k | 3.8 | 0.8–1.1 | 2.5–2.9 |
| below-the-sea | 137 | 261 k | 3.5 | 0.6–0.8 | 2.2–3.1 |
| the-roof | 137 | 261 k | 3.8 | 1.3–1.7 | 2.3–2.4 |
| the-wall | 146 | 283 k | 4.6 | 0.7–1.0 | 2.9 |

*Terrain* is the terrain drawn alone less the empty frame; *post* is the
frame less the frame without the post pipeline; both as a range over the
two runs. Every station is whole.

**What it says.** A frame is 3.5 to 5.7 ms on this machine. The four
scenes with hero ground close under the camera - Huangshan's spires, the
gorges, the karst's 30 m lattice, the first bend - are 5.1 to 5.7; the
five over country ground are 3.5 to 4.6. Post is 2.2 to 3.1 ms
everywhere and still the largest single cost. One look pass is now above
the noise: Huangshan's cloud deck, 1.1 and 1.2 ms in the two runs, a
screen-wide quad of noise under most of the frame. The sky and the
shadow map cost nothing the instrument can see anywhere. At F80's
reckoning of an M1 as half this GPU, the heavy four are 10 to 11.5 ms
there and over the plan's 8 ms line; the other five are 7 to 9. The
levers are the same two: the post pass's resolution, and the 30 m
lattice's LOD distances at the karst.

Against F80, the five stations it had whole moved by −0.3 to +1.8 ms,
Huangshan the most; all inside F80's own ±2.3 ms, so none is a change
this can see.

**For the next capture.** Run it twice and take the cheaper. The first
run after a page load was a poor fit once (r² 0.73, flagged by the
table) and good the next.

## F83 — FXAA in place of multisampling, and Heaven Lake in August, 23 September 2026

**Where the post pass's time went.** Timed at four stations with the
scene target at 4, 2 and 0 samples (`rig.post.samples`), each the
cheapest of 16: the post pass cost 2.6 to 3.4 ms with four samples, 1.9
to 2.1 with two and 0.8 to 1.3 with none. Four samples of half-float at
1080p were two of its three milliseconds, and a repeat of the four-sample
run agreed inside the ±1 ms the instrument resolves.

**The change.** The scene target is not multisampled by default; the
composite smooths edges with FXAA instead, reading the linear HDR scene
with its luma compressed so a bright edge does not outvote the rest. At
three times enlargement a Huangshan ridge line is marginally softer than
with four samples and shows no staircase. Multisampling is one setting
away (`?msaa=4`). The scene target can also be drawn smaller than the
canvas and stretched (`?scale=0.75`), the lever a slow phone pulls, and
`?frametime` puts a wall-clock readout in the corner: median, 95th
percentile, frames a second and the share of slow frames over the last
240. That is how the iPhone line of stage 3 gets measured, since Safari
has no timer query; it has not been yet.

**The numbers**, all nine stations whole, twice, cheapest of the two
(r² 0.945 and 0.987; resolution ±1.75 and ±1.19 ms), GPU milliseconds at
1920 × 1080 on the M3:

| Station | F82, four samples | FXAA | Post now |
| --- | ---: | ---: | ---: |
| huangshan | 5.7 | 3.9 | 0.9–1.5 |
| three-gorges | 5.1 | 3.1 | 0.7 |
| karst | 5.6 | 3.5 | 0.6–1.0 |
| first-bend | 5.2 | 3.1 | 0.7–1.3 |
| loess | 3.9 | 2.1 | 0.7–0.9 |
| grassland-to-heaven-lake | 3.8 | 2.1 | 0.6–0.7 |
| below-the-sea | 3.5 | 1.8 | 0.7–1.1 |
| the-roof | 3.8 | 1.9 | 0.7–1.0 |
| the-wall | 4.6 | 2.2 | 0.7–1.0 |

Every station is under 4 ms. At F80's reckoning of an M1 as half this
GPU, every one is at or under 8 ms there, Huangshan at the line. The
largest single cost left is Huangshan's cloud deck, 1.3 to 1.4 ms in
both runs: the next lever if an M1 reads over.

**Heaven Lake.** The still was one brown: steppe, forest and crater all
in a dark rock colour under a sun 4° up, the warm grade on top, and the
lake a navy patch in the rim's shadow. Two changes:

- *The palette*, for August: the steppe band a soft summer green rather
  than khaki, the forest below it darker, olive tundra above the trees,
  and the rim and plateau band pale grey trachyte and pumice; the lake
  the blue-green of deep cold water. A first pass at full green read as
  a golf course and was taken down to sage.
- *The hour*, 18:00 to 17:15. At 18:00 the crater's sun was 4° up and
  its light (0.80, 0.58, 0.29), nearly orange; at 17:15 it is 12° up and
  (0.93, 0.84, 0.66), and the steppe's is 20°. The frame at 108 s is
  now a pale crater in green country with the lake blue at its heart
  and the west rim's shadow across the floor.

## F84 — Stage 4: nine packs, 16.4 MB, and no tile outside them, 23 September 2026

**What a pack holds.** `make scenes` cuts one file per scene
(`dist-film/packs/<id>.bin`): every country tile and water file the
scene's camera can ask for, and the scene's own hero area. What the camera
can ask for is computed from the rail flight's own limits
(`engine/src/film/reach.ts`): the rail as far as the fastest viewer gets,
double the authored speed for the whole 114 s, a drift of up to 20 km to
either side, and the terrain's view disc of six tiles around every tile
the camera can stand in. The disc is now one function (`terrain/view.ts`)
that the terrain draws from and the packs are cut to. Rail beyond the
fastest viewer's reach is slack and is not packed: 234 of the gorges'
576 km.

**Hero heights are coded.** The hero areas were published as raw 16-bit
arrays; a pack codes each area as one tile-codec field (delta, byte
planes, gzip) a tile wide and every tile tall, and the tool decodes it the
way the browser will and compares every sample before writing. Guilin's
6.0 MB is 2.0 MB; all seven areas together are 4.1 MB.

| Pack | Size | Tiles | Files | Reach | Hero |
| --- | ---: | ---: | ---: | ---: | --- |
| huangshan | 1.05 MB | 150 | 255 | 84 km | huangshan 0.40 MB |
| three-gorges | 1.89 MB | 220 | 349 | 342 km | three-gorges 0.73 MB |
| karst | 2.92 MB | 187 | 308 | 134 km | guilin 2.00 MB |
| first-bend | 1.67 MB | 200 | 345 | 190 km | tiger-leaping-gorge 0.47 MB |
| loess | 1.38 MB | 300 | 435 | 684 km | — |
| grassland-to-heaven-lake | 1.52 MB | 335 | 443 | 849 km | changbai 0.19 MB |
| below-the-sea | 1.85 MB | 404 | 485 | 1,140 km | taklamakan 0.14 MB |
| the-roof | 2.40 MB | 462 | 691 | 1,368 km | — |
| the-wall | 1.17 MB | 209 | 333 | 228 km | everest 0.15 MB |

Nine packs are 15.85 MB. The files read before any pack - the world's
manifest, its tile index, the horizon field and the hero manifests - are
0.56 MB, so the film is **16.41 MB** against the plan's 30.

**At run time** (`app/src/packs.ts`) the packs come one at a time, the
playing scene's first and the next one's behind it, and the terrain's
tile requests are answered from them, waiting for a pack on its way. A
hero area is announced at startup by its manifest; the terrain sizes its
lattice and rim for it and draws it from the frame its heights arrive in
a pack, which it could already do because an area is drawn whole or not
at all. A tile no pack holds is fetched on its own and counted. Holding
every scene at 5, 60 and 110 s in the dev server: nine packs fetched,
15.85 MB, every view whole, every hero drawn, **no tile fetched outside
the packs**. Without packs (a checkout that has not run `make scenes`)
every tile is fetched alone and each hero whole, as before.

**The test** (`test/film/packs.test.ts`) flies each rail with the real
rail flight for the whole 114 s, eight ways - left alone, straight at the
fastest, straight then veering hard at the far end, weaving, slowest -
and checks every frame's view disc against the committed pack index
(`app/public/packs/index.json`), with no world to hand. It was checked
the other way too: packs cut without the drift fail it in four scenes of
nine, and packs cut for normal speed in six. A first version flew only
steering pilots and missed the second, because hard steering halves
progress along the rail.

**The build** copies `dist-film/` into `app/dist` and refuses to build
without it. Served by `vite preview` alone, the film plays: before the
first pack it fetches 620 kB (the script, 167 kB compressed, the tile
index, 75 kB, the horizon field, 351 kB, and seven small JSON files),
then the two packs. That is the title card and the lead-in map; the first
scene's ground is its 1.05 MB pack behind them. Over a 10 Mbit/s phone
connection that reads as about a second to the first frame and two to
the ground, which is inside the plan's three seconds but is arithmetic,
not a measurement: nothing here throttles a network or is a phone.

## F85 — Stage 5: credits and figures done, and the sound is to be found, 23 September 2026

**The credits page** (`app/credits.html`) is filled at build from
`NOTICE.md`, rendered from its Markdown rather than retyped, with the
question the project asks and the sound's credits from
`content/sound.yaml`. A test holds both Copernicus notices to the file word
for word. `NOTICE.md`'s own account of what carries the data had gone out
of date with version 1 (route sections, challenge ground) and now names
the worlds, the scene packs and the stills. The player bar and the end
card link to the page.

**Every figure in two systems**, asked for the American viewer: a scene
file marks each figure, `{1800 m}`, `{190 km}`, `{47 °C}`, and the film
shows "1,800 m (5,900 ft)". A figure written to the unit is converted
exactly (8,849 m is 29,032 ft); a round one stays round (1,800 m is
5,900 ft, not 5,906). The gate refuses a metric figure left unmarked,
which found seventeen, and two more it could not see (Huangshan's "the
cloud lies at 1,200", scene 6's "a thousand kilometres") were marked by
hand. A figure and its conversion count as one word, so every line is
still twelve or fewer. The lead-in map gives its jump in miles too.

**The sound, twice rejected.** The player (`app/src/sound.ts`) plays a
scene's cue from its lead-in, fades it across the cut, follows pauses and
chapter jumps to the second, and thins a wind bed with altitude; it was
checked with a stand-in, a sine tone and a loop of white noise. Those were
heard - they kept playing in the browser pane after the files were
deleted, because the page was not reloaded - and judged terrible, and
the white noise in particular "machine noise". A wind synthesised from
brown and pink noise, filtered in three layers under slow random gusts,
with a spectrum falling about 6 dB an octave, was built next and rejected
as well. D85: all the film's sound is recorded sound found on the web,
none of it made here. The player stays; it plays nothing until
`content/sound.yaml` names licensed files, and the launch gate
(`--complete`) refuses a film without nine cues and a wind bed.


## F86 — The terrain lit smooth, and where its detail can come from, 24 September 2026

**The Lego was the lighting.** Version 1 lit every triangle flat, from the
screen-space derivatives of its world position (its D3), because that
game's art direction asked for low-poly facets. Over the country grid's
1 km samples that drew China as bricks a kilometre wide, and over the
hero grids as crystals; it is most of what viewers of the film called a
game built with Lego. D86 reverses it. Each vertex now takes a central
difference of the heights around its texel, at the finest spacing whatever
the LOD, so a tile's shading does not change when its LOD does, and the
fragment lights the interpolated normal. Along a tile's edge the
difference reads the neighbour's row: every instance carries the layers of
the four tiles beside it (`iNeighbours`), filled at the end of the frame
once every tile the frame lands is in, and read without marking them used,
so a neighbour looked at is not kept from eviction. A one-sided difference
stands in where a neighbour is not resident, so the only seam is at the
edge of what is loaded. The rim's curtain, a wall with no heights around
it, keeps the flat normal.

**The shadow has to read the same normal.** Lit smooth and shadowed flat,
The Wall kept sharp tan triangles in the shade of its ridges: the shadow
skips its test for a surface turned from the sun, and a facet turned away
was being lit by a smooth normal that was not, so it shone out of a cast
shadow. On the smooth normal the triangles went, and Huangshan and Guilin,
the two scenes with the most vertical rock, show no acne.

**The stills.** All nine re-taken (the previous ones are at e977ebb). The
facets are gone everywhere; the plateau reads as rolling ground instead of
tilted plates, and the Three Gorges' walls as walls. What is left is what
the data holds rather than how it is lit: the 1 km ground's silhouettes
are still polygons where the camera is low over it (The Wall's
foreground), the country reads smooth as clay because nothing below the
grid's spacing is drawn, and the colour is still elevation bands alone.

**What it costs.** Four more height reads a vertex. Two captures, cheapest
of each, GPU ms at 1920 × 1080 on the M3 (resolution ±1.28 and ±1.71):

| Station | F83 | Now |
| --- | ---: | ---: |
| huangshan | 3.9 | 3.9 |
| three-gorges | 3.1 | 3.3 |
| karst | 3.5 | 4.6 |
| first-bend | 3.1 | 4.1 |
| loess | 2.1 | 2.1 |
| grassland-to-heaven-lake | 2.1 | 2.4 |
| below-the-sea | 1.8 | 1.9 |
| the-roof | 1.9 | 2.1 |
| the-wall | 2.2 | 2.3 |

Karst is the only rise both runs agree on outside the resolution, and it
is the station with twice anyone else's triangles (1.5 M, Guilin's 30 m
grid). Karst and the First Bend are now over the 4 ms line F83 drew for an
M1 at half this GPU, and well inside the 33 ms frame. If an M1 reads
over, the lever is a normal baked per tile when it lands, one read a
vertex instead of five.

**Where the detail can come from.** Researched, each source's terms read
at the provider:

- *Land cover:* ESA WorldCover 2021, 10 m, CC BY 4.0, a class map per
  scene at 50 to 100 m under 3 MB for all nine. GlobeLand30 forbids release
  over the internet.
- *Imagery:* EOX Sentinel-2 cloudless, but only its 2016 and 2017 mosaics,
  CC BY 4.0; from 2018 it is CC BY-NC-SA, which would bind the repository.
  Esri and Mapbox imagery cannot be redistributed. About 5 to 7 MB for the
  nine scenes at 2048².
- *Glaciers:* the Randolph Glacier Inventory 7.0, CC BY 4.0, a few kB.
- *Forest and water:* Hansen Global Forest Change (CC BY 4.0), JRC Global
  Surface Water (free, credited); OpenStreetMap's water would make a
  derived mask ODbL inside an MIT repository.
- *Elevation:* nothing open is finer than 30 m over China. Copernicus
  GLO-30, already the source, is the best there is; the gain is using it
  at 30 or 90 m in more places.

And rendering, in the order the research ranks it: sampling the heights
bicubically on a denser mesh, which rounds the 1 km silhouettes; sky
occlusion baked from the DEM, 8 bits at 90 m, about 0.3 MB a scene;
colour from the imagery with its own shadows divided out, or from land
cover; noise below the grid's spacing bent into the normals, by slope
and cover, faded with distance; and haze that turns distance blue.

## F87 — The ground in its own colour, from the 2016 Sentinel-2 mosaic, 24 September 2026

**The source, and the only year it can be.** EOX publishes a cloud-free
mosaic of Sentinel-2 a year. Its tile service states each layer's licence
(`WMTSCapabilities.xml`, read 24 September 2026): 2016 and 2017 are CC BY
4.0; 2018 to 2025 are CC BY-NC-SA 4.0, which would bind the repository and
the film to non-commercial share-alike terms. The 2017 layer turned out to
be empty over China (it answers a one-band black tile at every zoom; Vienna
has one), so the 2016 mosaic is the only one that can colour this film. The
service charges nothing, asks for attribution and rate-limits heavy use, so
`make colour` fetches at six tiles a second and never asks twice: 11,597
tiles, 220 MB, cached under `data/source/`, in 33 minutes. The credit is in
`NOTICE.md`, and so on the credits page, where a test holds it word for word.

**What is cut.** Every country tile a scene pack holds (2,181 with land or
coast) at 257 samples a side, 250 m, from zoom 10; the 90 m hero areas at
45 m from zoom 13; the 30 m ones, Guilin and Huangshan, at 15 m from zoom
14, near the mosaic's own 10 m. Each is reprojected onto the tile's Albers
grid by averaging, with the heights' shared-edge rule, and written as WebP:
38 MB for all of it, in two and a half minutes. The packs carry each
scene's colour beside its tiles: the film is 55.8 MB, against 16.4 before
and the 300 MB D87 allows. The Roof's pack is the largest at 12.2 MB.

**Clouds.** The 2016 mosaic is one satellite's first year, and over the
humid south it is flecked with cloud, each fleck ringed where the mosaic
stitched round it and often shadowed beside it. The cutter finds cloud by
what it is among: bright grey inside forest or farmland is cloud, where the
same among rock, sand, salt or snow is ground, and above 3,500 m a pale
patch among meadows is taken for snow. Silt and bare soil are warm and
cloud is cool, which keeps the Yangtze from being filled. Thin haze round a
cloud is unmixed from white; thick cloud and its shadow are filled from the
ground round them, bilinearly down a pyramid. It fills 28 % of the Three
Gorges, 34 % of Tiger Leaping Gorge and 35 % of Guilin, and in those three
the fill shows as soft smudges and, at Tiger Leaping Gorge, cloud above
3,500 m kept as snow. Everest and the Taklamakan needed none.

**Taking out the mosaic's own sun** was tried and dropped: dividing by a
hillshade of the same ground in a 10:30 sun (south-east, 55°) did not
flatten the relief the photograph holds but printed its inverse, the slopes
turned from that sun bleached cyan. The mosaic's baked shading is much
weaker than a sun model predicts, and the film lights over it.

**In the shader** the colour is one sRGB layer beside each height layer,
mipmapped with anisotropic filtering, uploaded from the decoded image
straight to the GPU with no copy on the heap (twelve a frame, so a pack's
140 tiles paint in over a dozen frames), and drawn once uploaded; until
then a tile flies in its palette. The grade, set against the stills: gain
1.4, saturation 1.05, a white balance of (1.1, 1.0, 0.78), because the
mosaic's greens read teal under the film's sky, and the palette's rock on
half the steepest ground, where a photograph from above is a smear of a few
texels. No palette snow over it: the photograph has the snow where it lies.
On the GPU the colour is about 200 MB with mips: the country's 256 layers,
90 MB; the 90 m cover's 97, 34 MB; the 30 m cover's 210, 74 MB.

**The stills** (all nine re-taken). Where the camera is high and the ground
is wide the change is the one asked for: the plateau of The Roof is tan,
green and snow-streaked instead of a relief model, Turpan is desert with
green oases, Heaven Lake stands in dark forest with
its pale pumice rim, and the Himalaya carries its snow where the photograph
has it. Where the camera is low it is less: 250 m colour under a camera a
kilometre up is soft; steep walls smear; and the southern gorges keep the
fill's smudges. A still taken with the browser pane hidden came out as sky
alone, frames throttled and nothing landed, so the recipe now waits on
`__ns.settled()`.

**What it costs**, cheapest of two captures at 1920 × 1080 on the M3
(resolution ±1.1 and ±1.3 ms), against F86: Huangshan 4.5 (3.9), the
Three Gorges 3.6 (3.3), Karst 4.5 (4.6), the First Bend 3.7 (4.1), Loess
2.4 (2.1), Heaven Lake 2.6 (2.4), Turpan 2.2 (1.9), The Roof 2.3 (2.1),
The Wall 2.6 (2.3). A texture read a fragment, a few tenths of a
millisecond, inside what the instrument resolves.

**Next.** A composite of our own from Sentinel-2's archive for the southern
hero areas, whose 2016 mosaic is a third cloud: the L2A scenes on AWS carry
a cloud classification, and the Copernicus terms allow reproduction and
adaptation with "Contains modified Copernicus Sentinel data [year]". Finer
colour where the camera flies low, which the budget now allows and the GPU's
memory decides. And detail below the colour's texel, bent into the normals.

## F88 — The world against its source, and the hollows left as they are, 24 September 2026

**The audit.** Everything the film draws was checked against the 67 GB of
GLO-30 under `data/source/`, by code that shares nothing with the pipeline
but the file formats: an Albers written from Snyder (within 5 cm of
`albers.json` at all 51 points), a tile decoder written from the format, and
the 1 km reduction rebuilt by binning every source pixel into the cell its
centre falls in, the thinned tiles north of 50 N read at their own spacing.

- All 1,969 source files hash to `pipeline/sources/cop30.json`.
- The conditioned grid, `heights.bin`, the 4,667 tile files and all nine
  packs, their hero fields with them, are the same numbers byte for byte;
  the horizon field matches its reduction to 1 m.
- Stage 2 against the source, over 176,295 samples in 699 blocks (240 at
  random, 315 on the rails' waypoints, 144 from the packs): median error
  0.9 m, mean 2.8 m, bias +0.3 m. North of 50 N the same, so F71 holds.
- Placement: in all 280 blocks with 800 m of relief the recompute fits at
  zero shift, and fits 14 times worse half a cell away in any direction.
  The hero lattices fit at zero too.
- No pack holds a tile the build did not fetch; the nearest is 497 km from
  any rail, past the horizon.

**GDAL's footprint.** The per-sample residual, up to 138 m in the
Karakoram, is not noise. GDAL's `average` and `max` take a destination
pixel's footprint as the box between its transformed top-left and
bottom-right corners, which on a grid turned against the meridians is not
the cell: 1.27 × 0.66 km at 76 E, where the grid turns 17°, and 0.87 ×
1.11 km at 118 E. That box reproduces GDAL's values five to nine times
better than the cell does. The centres are right; what stage 2 averages is
a skewed box away from 105 E. Left as it is: at 1 km it costs a few metres.

**The fill.** The one large departure from the source was stage 3's rule
for the basins no mapped river drains and no mapped lake marks, D62's fill:
6.4 % of the country raised, up to 574 m. Where the camera looks, it had
raised half the ground within 5 km of the karst rail by a median 77 m,
burying the Li's cone karst under a plain with the tops of hills showing
through; on the 30 m Guilin area it poured the dolines flat, 12.5 % of the
ground near the rail and up to 83 m; on the Taklamakan's 90 m area, 38 %,
the corridors between the dunes.

**Three rules, priced where the camera is.** Stage 3 was run in memory with
each rule on every hero area and on a window round each scene's pack; each
window's fill reproduced the shipped grid on 98–100 % of its pack and 100 %
near its rail, so what the other two rules would draw is measured, not
estimated. The share of the ground near the rail each would move from what
shipped (1 km: within 5 km of the rail; hero: within 2 km):

| Scene | leave, 1 km: share, median, max | breach's cuts, 1 km: share, deepest | leave, hero |
| --- | ---: | ---: | ---: |
| Karst | 50 %, 77 m, 182 m | 13 %, 182 m | Guilin 12.5 %, 83 m |
| Below the sea | 11 %, 6 m, 121 m | 7 %, 50 m | Taklamakan 38 %, 30 m |
| Huangshan | 8 %, 23 m, 99 m | 4 %, 99 m | 1 %, 36 m |
| The Roof | 6 %, 12 m, 103 m | 3 %, 119 m | — |
| Heaven Lake | 5 %, 6 m, 111 m | 2 %, 71 m | 0.3 %, 12 m |
| The Wall | 5 %, 41 m, 293 m | 3 %, 293 m | 0.8 %, 15 m |
| Three Gorges | 3 %, 16 m, 127 m | 3.5 %, 258 m | 0.9 %, 69 m |
| First Bend | 1 %, 35 m, 273 m | 1.4 %, 455 m | 0.4 %, 28 m |
| Loess | 0.7 %, 9 m, 37 m | 1.5 %, 41 m | — |

Leave gives back the source's hollows. Breach gives them back too and cuts
a slot one cell wide through the ridge round each, a kilometre wide on the
country grid, which in hillshades reads as canals across the karst and
notches through dune crests. Naming more sinks reaches nothing here: the
Taklamakan area alone holds 2,586 closed basins. So **D88: leave.** The film
routes no water through a hollow, and every mapped river is still carved to
run downhill.

**The rebuild.** `make carve` for the country, 21 minutes; `make hero`, two
(all seven areas, each equal sample for sample to the in-memory leave, and
no window moved); tiles, water, package, probes and siting in about a
minute; `make scenes`, `rails` and `stations`. The country keeps 1,892,257
cells at the source's height that the fill had raised, and Heaven Lake, the
hand-traced lake of F79, is kept on the country grid for the first time.
All runnable probes pass. The Yangtze probe now reports one reach of six
dammed: its second waypoint, 31.8 N 98.6 E on the upper Jinsha, stands in
an 18 m hollow 6 km from the carved channel, which the fill had filled; no
scene flies near it. The packs are 56.38 MB, 0.55 MB more, because hollows
are detail. Rails: over the karst the camera now stands up to 800 m above
the ground, its band's ceiling, where it stood 704; at the First Bend, 10 m
of ground stands above the camera ahead at one moment. The frame-cost
stations did not move.

Two things the rebuild found in passing. Guilin and Huangshan were cut only
when named (`published=False`), so a `make hero` after a change to stage 3
would have left the karst and the opening scene on the old rule with nothing
to say so; every area a scene flies is published now, and a test holds
every scene's hero to that. And `make hero` wrote its reports under the
corridor's bare name whatever the corridor, which is how the committed
country report came to cover four areas of seven; they are named after the
corridor now, as `carve`'s are, and cover all seven.

**The stills are not re-taken.** Taken with this session's browser pane
hidden, two stills came out with the terrain right and the sky wrong, blue
turned grey, the same in a scene D88 barely touches (Loess) as in one it
changes (Karst): a hidden pane draws a still, deterministically, from a sky
that is not the scene's. 03 and 07 wait for a pane that is in view.

**The captions.** "Bogda: 5445 m" flies over 1 km ground that tops out at
5,139 m, where the source's own highest sample nearby is 5,338 m. "From
here the ground stays above 4000 m" dips to 3,522 m just after Qinghai
Lake. Everest is 8,734 m on its hero grid against the caption's 8,849 m,
GLO-30's own highest sample being 8,738 m, known since F12.

## F89 — The south in its own colour, from eight years of Sentinel-2, 24 September 2026

**Why.** The 2016 mosaic (F87) is a third cloud over the southern gorges,
and the cut fills that third from the ground around it: 34 % of Tiger
Leaping Gorge, 35 % of Guilin, 28 % of the Three Gorges and 8 % of
Huangshan came out as soft grey-green smudges, where the camera flies
lowest. Those four hero areas are now coloured from the archive the mosaic
was made from, composited here (`pipeline/nineskies/composite.py`).

**The source.** Sentinel-2 Level-2A, Collection 1: ESA's archive
reprocessed to one baseline, as Element 84 publishes it on AWS and indexes
it in the earth-search STAC. Each pass is an MGRS tile carrying ESA's
true-colour image (10 m, from surface reflectance) and its per-pixel scene
classification (20 m). The Commission's legal notice on Sentinel data
grants reproduction, distribution and adaptation, and asks whoever
distributes an adaptation to carry "Contains modified Copernicus Sentinel
data [year]". NOTICE.md carries it for 2018-2025, and the credits test
holds it word for word.

**Which passes.** The catalogue lists 3,318 items over the four areas from
2018 to 2025 that are less than 70 % cloud. Each was probed for how much
of the area it sees clear, from a read of its classification at a
sixteenth of its resolution: 3,300 small reads, under a minute an area. Passes
at least 30 % clear with the sun at least 55° high were read: 304 at Tiger
Leaping Gorge and 160 at the Three Gorges, from the 20 m overview (colour
45 m), and 100 each at Guilin and Huangshan, at the full 10 m (colour
15 m). Each tile's clearest were taken a month at a time, March to
October, and each pass was read only where it covers its area. That is
6.9 GB, cached under `data/source/` and never read twice. The archive
answers at about 5 MB/s here, so the reads took about 45 minutes.

*The sun rule came from the first try.* That try took the clearest passes
all year round, and the south's clearest are its winter ones. Their sun
at 35° carves long shadows into every south-east-facing gorge wall, and
under the Three Gorges' evening sun from the west (17:00 in May) the
relief would have been lit inside out. The 1.9 GB of winter passes it
read were deleted.

**The median.** Every MGRS tile of a zone shares one UTM grid, so a pass's
pixels land on the composite's pixels whole and nothing is resampled
before the vote. A pixel's colour is the median, channel by channel, of
its clear views: vegetation, bare ground, water or snow, and not within
100 m of cloud, cirrus or cloud shadow. What the classifier misses is
outvoted. Views per pixel, 5th / 50th / 95th percentile: Tiger Leaping
Gorge 23 / 57 / 109, the Three Gorges 28 / 52 / 84, Guilin 15 / 21 / 46,
Huangshan 27 / 43 / 89. Fewer than 0.05 % of pixels have under three
views, and those are filled from their neighbours. Each area builds in
about two minutes.

**No light is taken off.** A C-correction against the heights (fit each
channel as a line in the cosine of the sun on the slope, divide by it)
was written and dropped before it shipped, because the data has no light
in it to take off. On steep forested slopes, those turned toward the
satellite's sun are darker than those turned away: mean brightness 35 against 42 at
Tiger Leaping Gorge, 49 against 59 at the Three Gorges. The bright lines
along the gorge walls are forest. The walls keep it and the gentler
ground above is farmed, so a correction would have erased the ground's
own pattern. F87's de-shading failed for the same reason.

**The tone.** ESA's true colour is linear reflectance and darker than the
mosaic's rendering, and the shader's grade (F87) was set on the mosaic.
So the composite is mapped onto the mosaic by one line per channel. The
line is fitted to the 10th to 90th percentiles of both, over the clear
ground of all four areas pooled: red ×0.89 + 3.8, green ×1.11 − 5.1,
blue ×1.09 + 12.5. Above the 90th percentile it eases into white. One
line for all four, not one an area, because each area's mosaic is its own
summer of 2016. Fitted to Guilin alone, the line wanted offsets of 20 to
30 (the mosaic's haze), and it would have hazed the composite again.
Fitting the whole curve, not a line, blew out the snow on Jade Dragon and
turned the Jinsha cyan. At each area's edge the tone leans back onto the
local mosaic over 1.5 km, the broad tone only, blurred over a kilometre,
so the country tiles meet it without a seam and without the mosaic's
cloud crossing over.

**What it gives.** The four areas are filled 0.0 to 0.1 %, against 8 to
35 %. Seen from above:
- **Guilin:** the karst tower field and the Li River are legible, where
  the mosaic was a hazy teal smudge.
- **Tiger Leaping Gorge:** the gorge, its villages and Lijiang are clear
  of cloud, the Jinsha is silty tan as it runs in summer, and Jade Dragon
  keeps its snow.
- **The Three Gorges:** gains its forested walls.

The stills gain less, because the camera flies between the walls and the
palette's rock covers half the steepest ground (F87):
- **The First Bend:** darker walls, a river bed with its sandbars, and
  bare tan slopes on the far ridge.
- **The Three Gorges:** forest texture on the walls, where the mosaic's
  cloud fill had left pale smears.
- **Karst:** the Li River's valley floor.
- **Huangshan:** little change.

The colour files for the four areas are 3.1 MB. The film is 57.9 MB, up
1.6 MB from F88's 56.4, because sharper ground codes larger. The GPU's
work is unchanged: the same layers at the same size. Frame cost was not
re-measured.

**The budget** is now 2 GB (D89), so that the colour and detail can be as
fine as the camera needs. This change used 1.6 MB of it. The composites are
kept at 20 m and 10 m under `data/work/composite/`, finer than the colour
cut from them, so finer colour for these areas needs no new reads.

**Stills without a window.** Neither session could keep a browser window
in front. A hidden tab draws no frames between the hold and the still,
so its stills have the right ground under a grey sky. `npm run stills`
drives a headless Chrome, whose page is visible and draws on the M3
through Metal. Against the committed Loess still it differs by 1.2
levels in 255 (4 in the sky), and two takes of Huangshan differ by 0.005.
Stills 01 to 04 and 07 are re-taken with it. 07 shows only F88's change.

Still weak:
- **The country around these areas** is still the 2016 mosaic. Its tiles
  in the four southern scenes are 14 to 23 % cloud filled, and the worst
  tile in each is 67 to 84 %. That is the distant ground in those scenes.
- **The tone line** is a compromise. Guilin's ground reads a little teal,
  like the mosaic's.

## F90 — The southern scenes' distant ground, from the archive too, 24 September 2026

**Why.** F89 coloured the four southern hero areas from the archive, but
the country tiles around them were still the 2016 mosaic. Those tiles are
the distant ground in those four scenes, and the mosaic left them 14 to
23 % cloud-filled on average, 67 to 84 % in the worst tile of each scene.
The country tiles in the four southern scenes' packs, 689 of them and
2.8 million km², are now the archive's too, at their own 250 m.

**Reading at 160 m.** A Sentinel-2 tile is about two country tiles wide,
so each pass is read whole, from the 16th overview of its true colour and
the 8th of its classification. The two are the same 687-pixel grid. One
pass is about 1.2 MB, and 16 threads read four a second. Nothing is
probed: over a whole tile the catalogue's cloud figure is the right one.
The catalogue lists 36,036 passes over the region from 2018 to 2025 with
the sun at least 55° high and under 30 % cloud, found in 58 block searches.

**What the first try showed.** The first try took 20 passes per tile,
those seeing most of it clear. Neighbouring tiles usually agreed within
2 or 3 levels where they overlap, but one pair in ten stepped by 12 to 14
(17 to 26 %), and some tiles had black wedges. The cause was the swaths.
Most Sentinel-2 tiles lie across the edge of two orbits' swaths. Chosen by
tile, the passes came from the orbit that sees more of it, so the strip
only the other sees kept a view or two (the wedges). Every swath edge
crossing a tile was also a step between two sets of days. Lower
percentiles than the median did not help (35th and 25th: the same steps),
so haze was not the cause.

**By orbit.** Passes are now chosen per tile and per relative orbit: 16
each, the least cloudy under a high sun, a month at a time. The catalogue
gives the orbit only in the product's name. That is 10,100 passes over
367 tiles and 632 tile-orbits, 9.0 GB kept, about 35 minutes of reads,
and the 1.3 GB the first try read but no longer uses was deleted. Each
tile-orbit's median is taken on its own grid (9 / 14 / 16 views per pixel
at the 5th / 50th / 95th percentile, five minutes for all of them). A
country tile then takes every tile-orbit over it, each weighted by how
far a point is inside what that tile-orbit sees, rising over 5 km. Where
swaths and tiles overlap, which is 10 to 40 km at these latitudes, the
medians blend rather than step. The previews over Karst and the First
Bend show no step, no wedge and no cloud. The toning is F89's line, so
the hero areas and the country around them are the same colour, and the
hero areas' edges now meet the archive's country rather than the mosaic.
The rest of the country keeps the mosaic.

**What it gives.** 688 of the 689 tiles are the archive's. The one left
is open sea the mosaic has no colour for either. Seen from above, the
First Bend's country changes most. The mosaic's patchwork of scenes and
cloud is now one landscape: the Three Parallel Rivers, the Hengduan
snows, Erhai and Dianchi. Around Guilin and the Pearl River the cloud is
gone. In the stills, the First Bend's far ridges take Yunnan's red dry
soils (1.2 levels a pixel on average, 2 in the upper half). Huangshan,
the Three Gorges and Karst barely change (0.1 to 0.4): their cameras fly
low, among walls, haze or a sea of cloud, and see little distant ground.
Loess and The Roof share 85 tiles with the region at their far edge, and
their stills show no seam. Their re-takes differ from the committed ones
by what F89 measured between a headless Chrome and a window (1.2 and 2.5
levels, most of it in the sun's disc).

The film is 60.1 MB, up 2.1 MB: sharper, cloud-free ground codes larger.
The composites under `data/work/composite/mgrs/` are 160 m, not much
finer than the 250 m colour cut from them.

## F91 — Ten metres near the camera, from Sentinel-2's own pixels, 24 September 2026

**Why.** A hero tile's colour is 257 samples a side whatever the tile: 45 m
on the 90 m lattice and 15 m on the 30 m one. The camera flies 150 to 300 m
up in four of the nine scenes, and a pixel at 1080p is a milliradian, so a
45 m texel is a pixel only 45 km away and dozens of pixels wide under the
camera. Sentinel-2 sees 10 m. At 10 m every tile of every hero area would
be about 800 MB of GPU memory, against about 200 MB for all the colour now.
The camera needs the fine colour only where it is.

**A second image a tile.** Each hero tile is cut again at 10 m: 1,153
samples a side on the 90 m lattice, 385 on the 30 m one. It is read from
the tile's own source (the composite in the south, the 2016 mosaic at zoom
14 elsewhere) and given the colour tile's corrections: the tone leaning
onto the country at the area's edge, the haze lifted round a cloud. Where
the colour tile was filled, the fine tile takes the colour tile. So a
fine tile averaged over a colour sample is that sample, and the two differ
only in detail. The colour tiles themselves are unchanged, byte for byte.
- *Lanczos, not averaging.* Taken onto the Albers grid by averaging, as the
  colour tiles are, the fine tile kept 5.5 of the source's 8.4 (mean
  Laplacian, Huangshan). Averaging blurs across the turn from UTM, pixel
  for pixel. Lanczos keeps 6.8.
- *WebP at 90, not 82.* At 82, WebP smoothed away a fifth of what was left
  in dark forest.
- *Size.* The fine tiles are 30 MB for all seven areas: 11.9 MB at the
  Three Gorges, 7.7 MB at Tiger Leaping Gorge, 6.2 MB at Guilin, and under
  2 MB each elsewhere.

**Ten metres in the south.** F89 read Tiger Leaping Gorge and the Three
Gorges from the 20 m overview. They are now read at 10 m, as Guilin and
Huangshan were: 300 passes, 10.3 GB, in 17 minutes. The first attempt hung
for two hours when the laptop's network dropped under it, so GDAL's reads
now time out and are retried. Views per pixel at the 5th / 50th / 95th
percentile:
- Three Gorges: 18 / 39 / 59.
- Tiger Leaping Gorge: 14 / 41 / 83.

The pooled tone line refitted over the four areas moved by half a level
(red gain 0.887 to 0.901), so the south's hero areas and country tiles were
cut again with it. The 20 m reads, 3.8 GB, are no longer read.

**In the engine** (`engine/src/terrain/fineColour.ts`). Each hero lattice
keeps a pool of fine layers and hands them to the tiles nearest the camera.
Once a frame, the tiles drawn within reach are sorted by distance. The
nearest take free layers first, then the layers of tiles flown away from
longest ago. The shader fades from the fine layer to the colour layer
across the ground between two distances. A tile claims its layer further
out than the fade reaches, so its image is fetched, decoded and uploaded
before it shows, and it is let go only once the fade has left it.

| Lattice | Fine whole to | Gone by | Claimed within | Layers | GPU memory |
| --- | --- | --- | --- | --- | --- |
| 90 m | 8 km | 12 km | 16 km | 16 | 113 MB |
| 30 m | 5 km | 8 km | 10 km | 40 | 32 MB |

At most 14 and 37 tiles lie that near any point. A pool's array is made
when a tile first wants it and freed after ten seconds with none, so the
two are held together for at most those ten seconds after a scene changes
lattice. An image into the 90 m pool costs about 1 ms on the M3, the mip
rebuild included, and two go up a frame. The first costs 7 ms, as it
allocates the array: once each time a scene nears a hero area. The 30 m
pool's cost 0.1 ms.

**What it gives.** The fine colour shows where the camera sees ground
from above.
- **The Three Gorges:** gains most. Its forested walls have their texture,
  and the villages and the road show. 14 % of the still changes by more
  than 8 levels.
- **Heaven Lake:** the crater rim and the forest round it are sharper
  (17 %).
- **The First Bend:** the river banks and fields are sharper (4.5 %).
- **Huangshan and Karst:** barely change (1.8 % and 0.9 %). Their cameras
  look at tower walls, and a picture taken from above has nothing to add
  to a wall.
- **On the steepest walls,** the 10 m detail is now drawn down the face as
  streaks where the 45 m colour was a blur.

The walls are the next lever: colour for ground seen side-on, which no
overhead image holds. Stills 01 to 04 and 06 are re-taken, 06 now headless
too. The rest show nothing of this change, and the Wall's re-take differed
only in its sky (window against headless, F89), so they stand.

**The film is 90.2 MB**, up 30.1 MB, of the 2 GB D89 allows.

**Frame cost: not measured.** Photos and a second Chrome held the GPU
through the capture. Loess read 6.7 ms against its 2.1 ms anchor, and the
capture resolved ±6 ms. Two paired runs, fine colour on and off, differed
by less than that with no consistent sign. The shader adds one texture read
on the tiles that hold a fine layer, which F87 put at a few tenths of a
millisecond. To be timed at the nine stations with the machine idle.

## F92 — The walls in photographed rock, 24 September 2026

**Why.** The film draws relief six times steeper than the ground's (F14),
so a slope of 45 degrees stands on screen at 80, with about six times the
surface its photograph from above covers. Each texel was drawn down the
wall as a streak, and F91's 10 m colour only sharpened the streaks. Karst
and Huangshan, whose cameras look at walls, barely changed with F91.

**Detail made in the shader was tried first.** Noise for rock bands,
stains, joints, ledges and clumps of plants, with relief from its gradient.
It read as camouflage, then as crackle glaze, then as engraving. Most of a
wall has no photograph, so its detail has to come from somewhere, and a
photograph of real rock was chosen over one made up.

**The source.** Poly Haven's scans. Every Poly Haven asset is CC0
(<https://polyhaven.com/license>, read 24 September 2026): no credit is
required. They are credited in `NOTICE.md` all the same. Four faces, one
for each kind of rock the film's walls are. Each scan has its colour,
normals and height:

| Face | Scan | Across | Scenes |
| --- | --- | --- | --- |
| limestone | Marble Cliff 04 | 12.7 m | Three Gorges, Karst, First Bend |
| granite | Marble Cliff 03 | 5.7 m | Huangshan |
| dark | Dark Rock 02 | 2.0 m | The Roof, The Wall |
| sediment | Cliff Side | 1.8 m | Loess, Heaven Lake, Below the Sea |

`make rock` fetches the 2k maps once (28 MB). `pipeline/nineskies/rock.py`
cuts each face to 1,024 a side: its colour with its height, ranked as a
percentile, in alpha, and its normals. All four come to 4.0 MB, carried in
the film's shared files.

**In the shader** (`terrainMaterial.ts`, `rock.ts`):
- *The photograph's tone, not its streaks.* On steep ground the photograph
  is read log2 of its stretch mips up, so a texel on a wall is as tall as
  it is wide. Its tone stays.
- *The face, mapped on the wall itself.* The face is projected from the
  two sides a wall can face, in tile coordinates, a whole number of faces
  to a tile. It meets the next tile's face, and the world's rebase does not
  move it.
- *Its size follows the grid.* Seventeen samples, the size of the relief
  the grid can draw: eight faces to a hero tile, 480 m on the 30 m grids
  and 1,440 m on the 90 m ones, and 42 to a country tile. First tried at a
  third of that everywhere, the Tiger Leaping Gorge's 3 km walls came out
  as a fine, bark-like repeat.
- *Where the rock shows.* A wall's bareness is its slope's rock band (the
  palette's, as before), less half of how green its photograph is. There is
  none where the photograph is far brighter than the rock: that is snow,
  which at Everest otherwise went dark. Rock shows where the bareness passes
  0.35, edged by the face's own height, with plants in the lowest sixth of
  its heights, which are its cracks. The slope leads, so rock comes in faces
  down the steepest sides. Thresholded by the face's height alone, it came
  in islands, like cobbles on moss.
- *Its colour.* The face's colour is divided by its mean, keeps half its
  hue and is tinted to the palette's rock. Its brightness is read again at
  a third of the scale, so a wall taller than a face does not show it
  repeating.
- *Plants seen from the side* are 30 % greyer and 20 % darker on the
  steepest ground, where the canopy's shaded interior shows.
- *Relief* comes from the face's normals: whole on rock, half on plants.
  It changes the lighting only. The shadow keeps the ground's own normal
  (F86).
- *Far off,* where the face's height is under a pixel, the share of rock
  alone is drawn.
- *One face is held at a time,* the one the scene's palette names: 11 MB of
  GPU memory with mips, let go once the next has loaded. A still waits for
  it.

Two palettes were set when rock was a half-strength veil, and their bands
now put a face on nearly every wall. Huangshan's band moved from 0.45–0.8
to 0.6–0.95. Heaven Lake's moved from 0.5–0.85 to 0.65–0.95, and it takes
the layered sediment face: the dark face's blocky heights, tinted pale,
made white blocks.

**The stills.** Six were re-taken. Share of each still changed by more
than 8 levels:
- **Huangshan (33 %):** grey granite pinnacles with pines on the slopes
  between, where there was a khaki blur.
- **Three Gorges (37 %):** limestone cliff bands among the forest.
- **Karst (35 %):** grey limestone faces down the steep sides of green
  towers.
- **First Bend (66 %):** walls of grey rock, where they were smooth dark
  slopes. The busiest of the six.
- **Heaven Lake (40 %):** layered rock inside the crater. The outer slopes
  are the photograph's, greener and yellower than the veil left them.
- **The Wall (27 %):** mostly sky, since the old still was taken in a window
  (F89); 6 % of its ground changed. The peaks keep their snow.

Loess, Below the Sea and The Roof changed by under 0.3 % and their stills
stand. Each scene's look was signed off on its still (D77), so the six
need signing off again.

**Frame cost: not measured.** Photos, a second Chrome and another
session's headless Chrome held the GPU. Loess read 4.9 and 7.9 ms against
its 2.1 ms anchor, and the capture resolved ±4 to ±5 ms. The work added:
- On wall fragments only: eight texture reads. The colour three times
  (at the face's scale, a third of it, and blurred) and the normals once,
  each from two sides.
- Everywhere else: a derivative and a mip bias.
- A face's upload once a scene, in its lead-in.

**The film is 94.1 MB**, up 3.9 MB, of the 2 GB D89 allows.

**Next.** Timing at the nine stations with the machine idle. Then detail
below the grid on the ground that is not wall, where the photograph's texel
is drawn as it was.

## F93 — The ground's relief below its grid, from GLO-30, 24 September 2026

**Why.** Four of the nine scenes fly over the 1 km country grid for most of
their two minutes: the Loess, Below the Sea, the Roof and the Wall. The hero
areas are small squares, and all of them together may be 256 tiles at most,
cut out of the country by at most eight rectangles. Nothing smaller than
the grid is drawn, so the country reads smooth as clay. The Loess's line
promises ground "gullied everywhere", and at 1 km there is no gully on
screen. The source, GLO-30, is 30 m, and it holds them.

**The finer ground comes from the source, not the shader.** F92 found
detail made in the shader reads as made. Hero areas along the rails would
have given real ground too. But a 700 km rail needs hundreds of tiles
streamed and let go, where hero cover is drawn whole, so the rails would
have had to be flown again. So the grid keeps its shape, and the lighting
takes the source's own slope below it. `make relief`
(`pipeline/nineskies/relief.py`) cuts GLO-30 again onto each tile's grid,
finer than the tile's own heights:
- *Country tiles:* 125 m, 513 samples a side.
- *90 m hero tiles:* 30 m, 385 a side.

It reads the source already on disk and fetches nothing.

**What a tile holds.** The ground's normal at each sample, from central
differences across a grid one sample wider than the tile, so neighbours
agree on the samples they share.
- *As the ground stands.* The engine multiplies the slope by the world's
  own exaggeration, 6 at `scaleFor(8, 6)`, so the relief is as steep as the
  ground drawn round it.
- *Encoded.* Each part is stored as the signed square root of its size
  about the byte 127, so flat is stored flat and the bytes are spent near
  flat.
- *Lossless WebP.* Lossy WebP halves the resolution of its colour and
  smears one part into the other.

The encodings, measured on a Loess tile. Error is in hillshade at the
film's exaggeration, in levels of 255:

| Encoding | Size | Mean error | 99th percentile |
| --- | ---: | ---: | ---: |
| Lossy, quality 90 | 151 KB | 38.6 | 128 |
| Lossless, 6 bits | 316 KB | 2.6 | 11 |
| Lossless, 7 bits | 372 KB | 1.5 | 7 |
| Lossless, 8 bits | 429 KB | 0.6 | 2.5 |

**Where.** Every country tile whose nearest point is within 90 km of
anywhere the camera can stand (`nearTiles`, `engine/src/film/reach.ts`):
505 tiles. `make scenes` lists them in the pack index, and `make relief`
cuts what the index lists. Also the five 90 m hero areas whole, 97 tiles.
The 30 m areas are at the source's spacing already. 602 files, 212 MB, cut
in 2 min 22 s.

**In the engine** (`relief.ts`, `terrain.ts`, `terrainMaterial.ts`):
- *A pool of images near the camera,* as F91's fine colour. The country's
  is 20 layers of 513² (28 MB with mips). It is drawn whole to 40 km,
  faded to the grid's own normal by 70 km, and a tile claims its image
  within 90 km. The 90 m hero lattice's is 24 layers of 385² (19 MB): whole
  to 8 km, gone by 16, claimed within 20. Each holds every tile within its
  reach of any point.
- *The light only.* The shadow keeps the grid's normal, and so does all
  that reads the slope: the rock band, the snow, the walls' faces. The
  relief never moves the rock or the snow, and a slope it lights is still
  shadowed where the drawn ground is. On a wall, the rock face bends the
  relief's normal rather than the grid's.
- *A still waits for it,* as for the colour.

**The stills.** Seven re-taken. Share of each still changed by more than 8
levels:

| Still | Changed | What changed |
| --- | ---: | --- |
| The Roof | 16.3 % | The plateau's rolling ground has its ridges and drainage lines, crisp to the horizon. |
| The Wall | 15.4 % | The foothills are creased where they were rounded. |
| Below the Sea | 12.6 % | The range beyond the basin is ridged, and the desert floor has its ripples. |
| Heaven Lake | 11.4 % | The volcano's outer flanks are creased, and so are the hills beyond it. |
| Loess | 11.0 % | The gully network shows through the haze. The foreground stays soft: a 125 m texel is dozens of pixels wide there. |
| First Bend | 8.5 % | The country beyond the gorge has its relief. The walls barely change: F92's rock face was their detail. |
| Three Gorges | 7.1 % | The country beyond the gorge has its relief. The walls barely change: F92's rock face was their detail. |

Huangshan (0.4 %) and Karst (0.1 %) fly the 30 m grid, which gets no
relief. Their stills stand. The seven need signing off (D77).

**Frame cost: not measured.** The GPU was 58–59 % busy with none of this
work running. Two things held it:
- *Photos,* at 40 % CPU.
- *A headless Chrome from another project's session.* It has kept a tab
  drawing the film since 01:42 on 24 September. `npm run stills` took the
  fixed port 9333, which that Chrome already held, so it drove that
  Chrome's tab instead of starting its own, and left it on the film. The
  earlier stills are sound: that Chrome drew on the same GPU, and the
  fixed tool's Huangshan matches the committed still to 3 levels.

`tools/stills.ts` now starts its own Chrome on a port the system picks and
reads the port from the profile. The work added is one texture read and a
few operations on the pixels of the tiles within reach, which F87 put at a
few tenths of a millisecond for the colour's.

**The film is 306.4 MB**, up 212.3 MB, of the 2 GB D89 allows. Each pack
carries 8 to 41 MB of relief. The largest pack is the Roof's, at 52.9 MB,
and the first, Huangshan's, is 12.3 MB.

**Next.** The frame cost timed with the GPU idle: close the other session's
Chrome, which is left alone here, and Photos. The foreground at 125 m is
still soft. A finer layer nearer the rail would cost about four times the
bytes for each step in spacing.

## F94 — The ground along the rails at the source's own spacing, 24 September 2026

**Why.** F93 lit the country by its relief at 125 m, and the Loess's
foreground stayed soft. The camera flies 600 m above the ground ahead, and
the bottom of the frame is about 5 km off. A pixel at 1080p is a
milliradian, so a 125 m sample is about 25 pixels wide at the bottom of the
frame and 8 pixels wide at 16 km. It drew the gullies as smears. GLO-30 is 30 m. The ground under the camera
needs it, and only there.

**What was weighed.** Measured on a Loess tile:

| Spacing | Cut as | Per image | Per 64 km tile |
| --- | --- | ---: | ---: |
| 125 m (F93) | the tile whole | 430 KB | 0.43 MB |
| 62.5 m | four 32 km sub-tiles | 470 KB | 1.9 MB |
| 31.25 m | sixteen 16 km sub-tiles | 428 KB | 6.9 MB |

At 31.25 m the ground is smoother from one sample to the next, and an image
compresses a little better than at 62.5 m. At 62.5 m a sample would
still be 13 pixels wide at the bottom of the frame; at 31.25 m it is 7, the
finest the source holds. So the source's own spacing was taken. Seven and six bits save 11 % and 26 %, and were left: one encoding,
one decoder. Covering the widest drift off the rail as well as the rail
would nearly double the bytes (2,011 sub-tiles against 1,091). The near
relief follows the film's line, and a viewer who drifts off it still has the
125 m relief.

**What is cut** (`make relief`, `pipeline/nineskies/relief.py`). Each
country tile is split four ways a side into 16 km sub-tiles of 512 cells,
513 samples, in the F93 encoding. That is the sub-tiles within 16 km of each
rail (the near relief's fade), as the film flies it, out to the fastest
viewer's reach. The sub-tiles the scene's own hero area covers whole are
left out: the country is cut out there. `make scenes` lists them in the pack
index (`reliefNear`), and `make relief` cuts what it lists, reading each
country tile once over the sub-tiles it needs:
- 1,056 sub-tiles, 1,051 files, 366.3 MB (349 KB each on average).
- The whole relief, country, hero and near, cut in about six minutes.

**In the engine** (`relief.ts`, `terrain.ts`, `terrainMaterial.ts`):
- *A pool of its own on the country lattice.* 16 layers of 513², 22 MB with
  mips, for the 14 sub-tiles at most within 20 km of a point. Drawn whole to
  10 km, faded into the 125 m relief by 16 km, and claimed within 20 km.
  Each sub-tile is placed by its own distance.
- *Sixteen layers to an instance.* A country tile's instance carries the
  layer + 1 of each of its sub-tiles. Each row, south to north, is one
  float, holding four layers at six bits each, 24 bits, exact in a float.
  The shader finds a fragment's sub-tile and reads its layer from the row.
- *No seams.* Which sub-tile a fragment is in changes across a triangle, so
  the read is given the gradient of the fragment's position across the whole
  tile, which does not jump where the sub-tile does. The sub-tiles share
  their edge samples, as the tiles do.
- *The light only, as F93.* The shadow and all that reads the slope keep the
  grid's normal.
- *A still waits for it.*

Flying the Loess live, 9 to 12 sub-tiles were lit each second, with nothing
waiting for upload.

**The stills.** Three changed. Share of each still changed by more than 8
levels:

| Still | Changed | What changed |
| --- | ---: | --- |
| Loess | 7.3 % | The foreground's gullies branch, crisp to the bottom of the frame, where they were smears. |
| Below the Sea | 5.7 % | The near dune field has its crests one by one, and the range beyond is sharper. |
| The Roof | 1.4 % | A fine grain on the nearest slopes. |

The other six changed by 0.4 % at most, what two takes of the same frame
differ by, and stand. Their cameras are over hero ground or look past the
near ground. Heaven Lake's rail carries 62 MB of near relief, but its still
frames the crater. The three need signing off (D77).

**Frame cost: not measured.** Photos was still at 28 % CPU, and the other
session's headless Chrome (F93) still held the GPU. The work added, on the
country's fragments within 90 km:
- A derivative and a few integer operations.
- Where a sub-tile holds near relief, one texture read with its gradient.
- Two 513² uploads a frame at most.

**The film is 672.8 MB**, up 366.4 MB, of the 2 GB D89 allows. The near
relief by pack:

| Pack | Near relief | Pack now |
| --- | ---: | ---: |
| Below the Sea | 90.4 MB | 139.1 MB |
| The Roof | 80.3 MB | 133.2 MB |
| Heaven Lake | 62.0 MB | 98.0 MB |
| Loess | 59.6 MB | 93.9 MB |
| Three Gorges | 23.9 MB | 66.7 MB |
| The Wall | 18.6 MB | 39.1 MB |
| First Bend | 13.6 MB | 42.8 MB |
| Karst | 12.3 MB | 37.3 MB |
| Huangshan | 5.7 MB | 18.0 MB |

A pack is fetched while the scene before it plays. Below the Sea's has two
minutes to arrive, about 9.3 Mbit/s.

**Next.** The frame cost timed with the GPU idle. The foreground's colour is
now the coarser of the two: the country's colour is 250 m, and on the Roof
and Below the Sea the near ground is a blur of colour under a sharp relief.
The Sentinel-2 10 m colour along the rails, as F91 did for the hero areas,
would be the next lever.

## F95 — The ground along the rails in Sentinel-2's own ten metres, 25 September 2026

**Why.** F94 lit the ground along the rails by its relief at 31 m, and
the colour on it stayed the country's 250 m. On the Roof and Below the
Sea the near ground was sharp relief under a smear of colour: 250 m is
dozens of pixels wide at the bottom of the frame. Sentinel-2 sees 10 m.
F91 gave it to the hero tiles nearest the camera, and the country's ground
along the rails now has it too, in the near relief's own 16 km sub-tiles.

**What was weighed.** One sub-tile under each of the Loess's, Below the
Sea's and the Roof's cameras, cut from the mosaic at zoom 14:

| Spacing | Samples | Per sub-tile (WebP 90) | GPU, 16 layers |
| --- | ---: | ---: | ---: |
| 20 m | 801² | 134-159 KB | 55 MB |
| 15.6 m | 1,025² | 180-210 KB | 90 MB |
| 10 m | 1,601² | 305-349 KB | 219 MB |

Most of the change is from 250 m to 20 m: fields, tracks and dune crests
where there was a wash. 10 m is a little crisper again and is the source's
own, and a thousand sub-tiles at 10 m are a third of a gigabyte, so 10 m
was taken, as F91 took it.

**Where the 10 m comes from.** Each sub-tile is laid onto its country
tile's colour as a fine hero tile is onto its colour tile (F91). Its
detail is the tile's own source read again at 10 m, and whatever the
colour tile did to its source is carried over. So the fade from one to
the other changes the detail, not the colour.
- *The north* (912 sub-tiles): the mosaic at zoom 14, the same 2016
  mosaic the country tiles are. 70,188 of its tiles, 0.6 GB, fetched once
  at the service's six a second: a little over three hours.
- *The south* (144): the country tiles there are the archive's at 160 m
  (F90), so the detail is the archive's too. It is a 10 m median over the
  rectangle of sub-tiles each country tile holds, laid onto that tile's
  colour against the median's own average. Two things F89's hero areas had
  not met:
  - *Passes by orbit.* Chosen by tile alone, the strip that only the
    other orbit sees kept one or two views, as F90 found for the country.
    At the First Bend that was 40 % of two sub-tiles. The passes are now
    chosen by tile and orbit.
  - *Zones.* A rectangle across the edge of a UTM zone needs a median in
    each zone. At the Three Gorges, six sub-tiles (96 km of the rail east
    of 108° E) lay in zone 49 while their median was built in zone 48, and
    only an eighth of them was seen. They now have a zone-49 median of
    their own.

  1,425 passes, 31 GB, cached, of which one would not read. 11 / 15 / 32
  views per pixel at the 5th / 50th / 95th percentile, and every southern
  sub-tile at least 95 % seen.

**EOX's zoom 10 is not where its zoom 14 is.** The first sub-tiles cut
disagreed with their country tiles' broad tone by 3 to 7 levels on
average, 18 at the 95th percentile. Neither warp was at fault: Lanczos and
averaging from zoom 14 agree to within 0.8 of a level. Instead, EOX's own
zoom-10 tiles, which every country tile is cut from, sit up to about
120 m off its zoom-14 tiles, and not by the same amount everywhere. Each
was correlated against a hillshade of GLO-30 on the same ground. Zoom 14
matches best where it lies (the Loess r 0.53, Below the Sea 0.46, both at
no offset). Zoom 10 matches where it lies at the Loess, but at Below the
Sea only when read 120 m north (r 0.19, against 0.02 where it lies). So
the 10 m detail is in the right place, and the country's 250 m is half a
sample off in places.

The sub-tiles keep their detail where it lies. Pulling it onto the
shifted tone would print a faint second copy of every field 120 m off,
right under the camera. Where the offset is, a feature moves 120 m across
the fade 10 to 16 km out, over the minute or so it takes to cross it.

**What is cut** (`make colour`, `imagery.cut_near`): the 1,056 sub-tiles
`make scenes` lists along the rails (F94), 1,601 samples a side, WebP 90.
- *Size.* 357.3 MB: 271.3 MB in the north, about 300 KB a sub-tile, and
  86.0 MB in the south, about 600 KB, since forest codes larger than
  desert.
- *Checked.* Each country tile a sub-tile is laid onto is cut again as
  `make colour` cuts it, and checked against the published one, file for
  file. The whole cut, country, hero and near, takes 16 minutes.
- *Three processes*, since each holds a gigabyte at its peak and this
  machine has eight.

**In the engine** (`colour.ts`, `fineColour.ts`, `terrain.ts`,
`terrainMaterial.ts`, `near.ts`):
- *A second near pool on the country lattice*, beside the near relief's:
  16 layers of 1,601², 219 MB with mips, for the 14 sub-tiles at most within
  20 km of a point. Whole to 10 km and the 250 m colour by 16, the near
  relief's own distances, so the colour sharpens over the same ground the
  relief does. One image is uploaded a frame.
- *Its layers ride on the instance* as the near relief's do: a second
  vec4, four 6-bit layers to a component, read by the same GLSL. The read
  is given the whole tile's gradient, as the near relief's is, scaled
  where the colour is blurred on steep ground.
- *The sub-tiles' constants moved to `near.ts`*, which imports nothing.
  The colour index now reads them, and the country tile's size imports the
  colour's arrays. With that circle, the stand-in terrain's tiles came out
  flat.
- *The pack index's `reliefNear` is now `near`*: the same sub-tiles hold
  both.

**The stills.** Three changed. Share of each still changed by more than 8
levels:

| Still | Changed | What changed |
| --- | ---: | --- |
| Below the Sea | 14.0 % | The green smear under the camera is the oasis: its field parcels, the road and the town. |
| The Roof | 6.9 % | The near grassland has its drainage lines, stony ground and texture. |
| Loess | 5.5 % | The gullies' terraces take their ochre and green. |

The other six changed by 0.4 % at most and stand: their cameras are over
hero ground when they are held. The southern colour was looked at where
the First Bend flies over country ground, 15 seconds in: the valley floor
gains its fields and a village along the river. The walls read greener,
because F92's rock backs off wherever the photograph is green, and at
10 m it shows forest on walls the 250 m smeared grey. The three need
signing off (D77).

**Frame cost.** One clean capture, after the other session's Chrome and a
Chrome tab drawing in the background were gone. It resolved ±1.3 ms with
the fit at r² 0.9985, and Loess and the Roof sit on their F83 anchors.
Terrain ms, with F87's before relief and near layers:

| Station | Now | F87 |
| --- | ---: | ---: |
| Loess | 2.24 | 2.4 |
| Heaven Lake | 2.01 | 2.6 |
| Below the Sea | 2.02 | 2.2 |
| The Roof | 2.28 | 2.3 |
| The Wall | 2.32 | 2.6 |
| Huangshan | 3.25 (not whole) | 4.5 |
| Three Gorges | 6.29 | 3.6 |
| Karst | 6.07 | 4.5 |
| First Bend | 5.71 | 3.7 |

The northern stations carry F93 to F95 and are where they were, within
what the instrument resolves: the near colour costs less than it can see.
The southern ones are 2 to 2.7 ms up on F87. They fly over hero ground,
where the near colour hardly draws, so that is F91 to F93's layers there,
timed here for the first time; the Three Gorges is at 6.3 of the 8 ms
the terrain has. A paired run, with the near colour and without, could not
be taken: the display slept, and the frames it drew came at 17 Hz.

**The film is 1,030.3 MB**, up 357.4 MB, of the 2 GB D89 allows. By pack:

| Pack | Near colour | Pack now |
| --- | ---: | ---: |
| The Roof | 94.9 MB | 228.1 MB |
| Below the Sea | 57.4 MB | 196.5 MB |
| Loess | 52.9 MB | 146.8 MB |
| Heaven Lake | 51.3 MB | 149.3 MB |
| Three Gorges | 39.6 MB | 106.4 MB |
| First Bend | 23.0 MB | 65.8 MB |
| Karst | 16.6 MB | 54.0 MB |
| The Wall | 14.9 MB | 53.9 MB |
| Huangshan | 6.8 MB | 24.8 MB |

The Roof's pack is now the largest, and has its scene's two minutes to
arrive: about 15 Mbit/s.

**The stills tool** waits two minutes for Chrome to open, where it waited
ten seconds. On a loaded machine, and on the first launch of an update
Chrome had fetched itself, it took seventy.

**Next.** The country's 250 m colour registered to the ground: cut from a
finer zoom of the mosaic, or from the archive, rather than from EOX's
zoom 10. Beyond 16 km the colour is still 250 m under a 125 m relief; a
middle level for the country's colour, as the relief has, would carry the
detail further out. The southern stations' terrain, at 5.7 to 6.3 ms,
wants its share found among F91's fine colour, F92's walls and F93's
relief.

## F96 — The country's colour where the ground is, and what the southern frame costs, 25 September 2026

**Why.** F95 found EOX's zoom-10 tiles, which every country tile was cut
from, sitting up to 120 m off the ground in places. So the country's colour
was half a 250 m sample away from its own relief and from the 10 m colour
along the rails. And F95 left the southern stations' terrain at 6 ms of
the 8 it has, up 2 to 2.7 ms on F87, without knowing which layers cost it.

**Which zoom is where the ground is.** Thirteen sub-tiles along the
northern rails (the Loess, Heaven Lake, Below the Sea, the Roof, the Wall),
each read at zooms 10 to 14. Each was correlated against a hillshade of
GLO-30 on the same ground, and compared with zoom 14 averaged to 250 m, at
shifts of up to 240 m.
- *Zooms 12, 13 and 14* agree with each other to 0.3 to 0.6 of a level at
  no shift, at all thirteen. Where the ground has relief enough to tell,
  all three match the hillshade best where they lie.
- *Zooms 10 and 11* do not. Against zoom 14 they are 1 to 10 levels off,
  worst on the Roof. At several sites they fit best 40 to 120 m away, and
  are still 1 to 5 levels off there, so their content differs as well as
  their place. EOX's coarse zooms are evidently not its fine ones averaged.
- *The tone is the same.* Zoom 12 is 0.45 of a level darker than zoom 10,
  alike everywhere, so F87's grade stands.

So the country is cut from zoom 12 (33 m at 30° N, eight pixels to a
sample), the coarsest zoom that lies where the ground is. The hero areas
were already at 13 and 14. That is 148,312 tiles, 2.4 GB, fetched once at
the service's six a second: seven hours.

**What changed.** The whole colour was cut again, in 25 minutes:
- *Country tiles.* 1,700 of the 2,178 changed, 416 of them the archive's
  (F90, F98) in the mosaic their edges fall back on. Where the archive
  sees a tile whole, the mosaic never shows, so the four southern packs
  came out byte for byte the same.
- *Hero areas.* Unchanged, Everest's new composite (F98) included.
- *Sub-tiles along the rails.* 170 of the 1,056 changed. Their detail was
  always zoom 14's, and a sub-tile takes from its country tile only what
  that tile did to its source, which differs only where cloud was filled.
  What changed is what they fade into: the country tile now lies where
  their detail does, so the fade 10 to 16 km out no longer moves anything
  (F95).
- *Three tiles of open sea* off Vladivostok, at the edge of Heaven Lake's
  view, have no colour now. Zoom 10 had a sliver of coast in each (1 to
  10 %), filled across the tile; zoom 12 has nothing there. They fly in the
  palette, as the 18 of open sea round them always have.

**What the southern frame costs.** The layers since F87 that draw on
hero ground were timed by their absence. `?without=fine,near,rock,relief`
loads the film without the named layers, and the shader is compiled
without them. Each configuration was captured five or six times,
interleaved, at 1920 × 1080. The captures came from a separate checkout at
30d68c2, so another session's work in progress (F97) was not in them.
Medians of terrain ms, and what removing each layer saves:

| | Three Gorges | Karst | First Bend |
| --- | ---: | ---: | ---: |
| Everything | 6.21 | 6.39 | 6.00 |
| without F92's rock | 5.02 (1.2) | 5.72 (0.7) | 5.42 (0.6) |
| without F91's fine colour | 5.78 (0.4) | 5.14 (1.3) | 6.36 (−0.4) |
| without F93's relief | 6.49 (−0.3) | 6.73 (−0.3) | 7.20 (−1.2) |
| without all three | 4.30 (1.9) | 5.56 (0.8) | 4.51 (1.5) |

- *The walls' rock* is the one layer that costs everywhere: 0.6 to 1.2 ms.
  A wall's fragment reads its face some ten times.
- *The fine colour* costs most at Karst, where Guilin's 30 m pool holds 40
  layers. Elsewhere it is within the noise.
- *The relief* costs nothing these captures can see.
- *Together* the three are 0.8 to 1.9 ms. Without them the terrain is
  still 4.3 to 5.6 ms, 0.7 to 1 ms above F87. That is older than these
  layers, or the instrument's drift from day to day: the Loess read 2.2 ms
  one night and 2.8 the next morning.

*The instrument is the limit.* The `clear` pass, the same work at every
station, resolved to 0.1 to 0.3 ms with 80 samples. The terrain moved 1 to
2 ms between rounds with nothing changed: Karst with everything on read
7.71, 6.59 and 5.59. The M3's GPU sets its own clock, so single
differences under a millisecond are not measurements, and the table's are
medians. Huangshan was left out: its captures are never whole, and its
`clear` reads 2 to 8 ms.

The capture was refused, at 13 to 19 Hz, whenever anything else drew.
That included this session's own window redrawing between captures, and
the display after 90 idle minutes. The table's captures were taken with
the display held awake and nothing else drawing.

**The stills.** Two changed. Share of each still changed by more than 8
levels:

| Still | Changed | What changed |
| --- | ---: | --- |
| The Roof | 13.9 % | The middle distance's pale and dark patches move onto the hills they belong to. |
| Below the Sea | 2.2 % | The far plain's colour, a little. |

The other seven changed by 0.4 % at most and stand. Frame cost was not
timed again: the layers and their sizes are as they were.

**The film is 1,061.8 MB**, up 1.7 MB: the five northern packs each about
0.4 MB. The southern four are unchanged.

**Next.** The walls' rock is the southern frame's largest optional cost.
It could read its face fewer times a fragment, or only near the camera.
The base terrain's 4.3 to 5.6 ms is the rest of the budget, and F97's 500 m
level adds 0.7 to 0.9 ms to it at Karst and the Three Gorges.

## F97 — The Wall as mountains: the country finer than its samples, the curtain lit, and a drama of three, 25 September 2026

**Why.** Three things were wrong with the Wall, found making the cover:
- *The approach was shards.* At authored speed the flight covers the rail's
  first 114 of its 272 km, over the 1 km country grid. F86 lit it smooth,
  but its silhouettes stayed kilometre-wide triangles wherever the camera
  is low over it, each shaded apart in the last light.
- *Everest was needles.* The hero grid's 90 m holds the slopes as they
  are, and six times them is a field of white spires.
- *A black wedge down the spires.* The curtain the country hangs along a
  hero rim (F74) took the flat normal of its own triangles. A wall's normal
  is level, so it took no snow, was painted the palette's rock, and stood
  in shadow: black.

**The country finer than its samples.** The research F86 ranked first: a
level finer than L0, L-1, draws 500 m quads over the same 1 km samples, and
a vertex between samples takes the height of a Catmull-Rom spline through
the 4 × 4 samples round it (`spline.ts`).
- *It passes through every sample.* A vertex on a sample keeps its height,
  so a coarser level beside a finer one meets it at every sample it draws,
  and the skirts close what is between.
- *Its slope at a sample is the central difference* the lit pass already
  took there (D86), so the normal between samples runs smoothly into it.
- *Past a tile's edge it reads the tile beside,* as the normal already did
  (`iNeighbours`); where that tile is not resident, the edge is held. Within
  one sample of a corner the 4 × 4 reaches the tile diagonal, which neither
  side reads: heights along the shared edge still agree exactly, and the
  slope across it differs by under a metre in a kilometre.
- *Where.* A tile at L0 whose nearest point is within 40 km of the camera
  is drawn at L-1, unless hero areas cover half of it or more: the country
  is cut away there, and its vertices would only be work. At the First
  Bend's station the camera's own tile is 71 % Tiger Leaping Gorge.
- *A 250 m level too, and refused.* L-2, 256 quads a side within 16 km,
  was built and timed at six stations against L-1 alone, twice each, 80
  samples a capture. It cost 1.1 to 3.4 ms of GPU a frame more, where L-1
  costs 0.3 to 0.9 over L0, and the near ground at 1080p could not be told
  from L-1's.
- *The curtain follows.* It hangs from exactly the surface the tile draws,
  so its CPU reads the same spline by the same rule.
- *The shadow draws the same ground*: the depth pass shares the vertex
  shader.

**The curtain lit as the ground.** Each point now carries the ground's
slope and height at its top, from the spline through the country's
samples, and the whole column is lit, coloured and snowed as that ground
is. The flat normal is gone from the shader.

**A drama of three for the Wall.** `exaggeration` in a scene file is its
own `A` (`sim/scale.ts`), the film's six unless it says otherwise (D90).
Six was measured on the 1 km grid, whose samples flatten real slopes (F14).
F14 called a route drawn a third past 60° and a ninth past 75° spikes,
not mountains. Measured the same way, the share of ground drawn past 60°
and 75°:

| Ground | A | Past 60° | Past 75° |
| --- | ---: | ---: | ---: |
| Everest hero area, 90 m | 6 | 68.2 % | 35.4 % |
| | 4 | 54.2 % | 12.9 % |
| | 3 | 40.0 % | 4.5 % |
| Country within 10 km of the rail's first 114 km, 1 km | 6 | 2.3 % | 0.0 % |

At four, more than a ninth is still past 75°; three is the most drama
under it. The
approach was never steep: its shards were the grid and the light, which the
finer levels answer. The camera's altitude is real metres throughout, so
nothing it flies changes; the terrain, the horizon and the look (haze,
mist, the shadow's reach, the clouds) are put into world units at the
scene's scale when it starts (`useSceneScale`), and a frame-cost station is
drawn at its scene's.

Tried and refused: reading rock and snow at the film's six whatever the
scene draws at. Six paints real 20° slopes as rock, and it brought back the
pale veils on the approach's hills that were half of its smear.

**What it shows that six hid.** Looking south at Everest the camera sees
north faces, and near Rongbuk (100-114 s) the ground's colour has black
patches. Both the archive's median (F89) and the 2016 mosaic hold them in
the same places: they are the shadows the ground cast when the satellite
passed. At six the spires hid the valleys they lie in. Dividing them out
of the imagery is F86's research item and the next lever for the Wall.

**The stills.** Six changed. Share of each still changed by more than 8
levels:

| Still | Changed | What changed |
| --- | ---: | --- |
| The Wall | 58.0 % | The approach is rolling ground with its river's valley, where it was shards; the range stands on the horizon as a range, not a wall of spikes. |
| Loess | 6.2 % | The nearest ridges are rounded where they were straight edges. |
| The Roof | 5.3 % | The same, on the plateau's near hills. |
| Below the Sea | 4.0 % | The same, on the near desert and the range beyond it. |
| First Bend | 1.1 % | The country beyond the gorge, a little rounder. |
| Heaven Lake | 0.7 % | The hills round the volcano, a little rounder. |

Huangshan, the Three Gorges and Karst changed by 0.3 % at most, what two
takes of the same frame differ by, and stand. The six need signing off
(D77). The cover's Everest card is now the north face at 136 s, on the
rail's own height, where it had been a frame chosen to hide the needles.

**Frame cost.** Timed headless at 1920 × 1080 on the M3, one station a
capture, 80 samples, each variant twice, the lowest of the two. Terrain, ms
over the clear pass:

| Station | L0 alone | With L-1 | With L-2 too |
| --- | ---: | ---: | ---: |
| Loess | 2.24 | 2.50 | 3.77 |
| Below the Sea | 2.07 | 2.36 | 3.63 |
| The Roof | 1.82 | 2.09 | 3.14 |
| The Wall | 1.13 | 1.70 | 4.56 |
| Karst | 5.07 | 5.99 | 6.17 |
| Three Gorges | 4.60 | 5.29 | 6.78 |

L-1 costs 0.3 ms on the three northern stations, 0.6 at the Wall, and
0.7 to 0.9 at Karst and the Three Gorges, where F96 finds the terrain
already near 6 ms. It adds 100,000 to 150,000 triangles. The timings were
taken before the rule on hero cover, which changes only a neighbour at the
Three Gorges and the First Bend's own tile. Huangshan, the First Bend and
Heaven Lake were not timed cleanly: twice the frames fell to 18 and 19 Hz,
the second time with the display held awake, and the capture refused.

**Next.**
- *The imagery's own shadows* on the Wall's north faces (above).
- *The other walls at six.* F14's measure over every hero area. Past a
  ninth at 75° are five of the seven, all scenes of cliffs and pinnacles
  whose looks were signed off at six:

| Hero area | Grid | Past 75° at 6 | at 3 |
| --- | ---: | ---: | ---: |
| Everest | 90 m | 35.4 % | 4.5 % |
| Huangshan | 30 m | 34.0 % | 0.6 % |
| Tiger Leaping Gorge | 90 m | 21.2 % | 0.9 % |
| Three Gorges | 90 m | 19.6 % | 0.7 % |
| Guilin | 30 m | 15.8 % | 0.4 % |
| Changbai | 90 m | 0.9 % | 0.0 % |
| Taklamakan | 90 m | 0.0 % | 0.0 % |

## F98 — The Wall's ground from high suns, its north faces lit, 25 September 2026

**Why.** F97 drew the Wall at a drama of three, and what the spires had
hidden showed: from about 100 s, black patches on the snow of the north
faces the camera looks at on its way south to Everest. They were not cloud
shadows. The 2016 mosaic and the archive's own passes hold them in the same
places: they were the ground's own shadows, baked into its colour. All the
Wall's ground was the mosaic's, and over the Himalaya the mosaic's clear
passes are winter's, the sun low in the south at the satellite's
mid-morning. The archive's median (F89) takes only passes with the sun at
least 55° high, which at 28° N means March to September. A north face of
55° is lit then.

**Everest's hero area first,** composited as F89 did the south's four: 200
passes from March to September, 1.3 GB, 47 clear views a pixel at the
median, 0.1 % filled. It takes the tone line fitted over those four and
does not join the fit, so the line is unchanged, byte for byte. The north
face came clean, but the patches at 114 s did not: they lay on the country
ground just outside the hero area, coloured by the mosaic at 10 m along the
rail (F95) and at 250 m under it.

**So the Wall's country and its rail too** (`composite.py`,
`SOUTH_SCENES`), as F90 and F95 did the south's:
- *Its 209 country tiles:* 3,209 passes read whole at 160 m, 3.0 GB, 201
  medians by Sentinel-2 tile and orbit.
- *Its rail at 10 m:* 54 sub-tiles, and 46 of the Roof's. The Roof's pack
  shares 95 of the Wall's country tiles, one colour file each, and a
  sub-tile on an archive tile needs the archive's own detail, or is left out
  of the cut. 816 passes, 19.8 GB, 17 medians.
- *The catalogue grows and is never searched again where it was searched.*
  A search made again would find passes published since, and change which
  passes a tile already coloured was chosen from. The tiles searched are
  kept beside it; where the cache said nothing, a tile any cached pass
  covers counts as searched. The south's 10,100 passes are chosen as
  before, and its 631 medians came out byte for byte the same.
- *`make colour` composites Everest too* (`COMPOSITED`), and the notice
  says so.

**What it looks like.** The approach is brown plateau and its valleys, the
river's among them, with no black on it anywhere. From 100 s the foothills
are bare rock under snow on the high peaks, where the mosaic's winter had
laid snow to their feet and shadow across it: the passes are the months
nearer the scene's October than winter's.

**The stills.** Two changed, by more than 8 levels:

| Still | Changed |
| --- | ---: |
| The Wall | 54.6 % |
| The Roof | 1.3 % |

The other seven do not touch the Wall's tiles and were not retaken. The
cover's Everest card changed by 15.6 %. The Wall's and the Roof's need
signing off (D77).

**The film is 1,060.1 MB**, up 29.8 MB, of the 2 GB D89 allows: the Wall's
pack 53.9 to 73.6 MB, the Roof's 228.1 to 238.3 MB. The archive's 10 m
colour compresses less well than the mosaic's.

**Next.** Where else the mosaic's winter bakes north faces black: the
Roof's plateau beyond the Wall's tiles, Heaven Lake's crater.

## F99 — Heaven Lake's crater from the summers after the melt, 25 September 2026

**Why.** Asked to check the Roof and Heaven Lake for the winter shadows F98
took off the Wall, measured on the colour as shipped: steep north faces
against steep south faces, on the relief's own GLO-30 normals (F93, F94).
Calibrated on the Wall's ground, where both are to hand, north faces darker
than all but a tenth of south faces are a tenth of them where the light was
high (the archive, 7 %) and a fifth where it was winter's (the mosaic,
17 to 19 %). By stretch of rail:

| Ground | North faces over south | Light |
| --- | ---: | --- |
| The Roof, Qinghai Lake to Madoi (0-43 s) | 0.72 | low: winter to spring |
| The Roof, east of the Hoh Xil (80-103 s) | 0.79 | low |
| The Roof, Tuotuohe to Nagqu (130-195 s) | 0.96 | high, snow on the north faces |
| The Roof, Namtso to Lhasa (195-237 s) | 1.17 | the archive's since F98 |
| Heaven Lake, round the volcano | 0.85-0.86 | high: summer |

A summer mid-morning sun leaves a north face of 25 to 35° about 0.89 as
bright as a south one; an equinox one about half, a winter one a third,
with the sky's light. Heaven Lake has no winter
shadows. The Roof's two low-sun stretches are brown, not black: the ground
is dry and holds no snow, and the shaded faces are dark earth. On screen,
such shading is hills striped light and dark across the scene's own light,
which is ahead in the west; the Roof's still, at 60 s just past the first
stretch, has it mildly. Not changed here (Next).

**What the check found at Heaven Lake instead.** The mosaic had the crater
under cloud, and the cut filled it from the ground round it (F87): the
inner walls, and the south half of the lake, were a smear, and they are
what the camera looks down on from 90 s. The water layer draws the lake
over its half, but not the walls.

**So Changbai's hero area is the archive's,** as F98 did Everest's:
- *June to August only* (`composite.MONTHS`). A high sun at 42° N allows
  April to August, but the crater's clear views are snow in 95 % of April's
  and 58 % of May's, 4 % of June's and none after, and its lake is ice.
  Every allowed month laid gullies of snow over the flanks and a grey ice
  lake on the scene's August; the three months after the melt leave the
  lake dark and the rim bare.
- 100 passes, 50 from each of two Sentinel-2 tiles, 2.1 GB read at 10 m
  (and 0.9 GB of April and May's, read to compare); 33 clear views a pixel
  at the median, 0.07 % filled.
- It takes the tone line fitted over the south's four and does not join
  the fit: tone.json is unchanged.
- *`make colour` composites it too* (`COMPOSITED`), and the notice says so.

**What it looks like.** The crater is its own: the rim's pale pumice, grey
and buff, the lake whole, forest to the rim's foot. The wall reads cream in
the evening sun it faces; measured, it is a grey-buff of about 130 (sRGB),
where the mosaic's smear was 100 and yellower, and four fifths of it is
dark enough that the scene's rock face stays laid on it (F92). The flanks
are a brighter green than the mosaic's olive, which was its haze.

**The stills.** One changed, by more than 8 levels: Heaven Lake's, at
108 s over the crater, by 76.7 %. The other eight are as they were, to the
level. The cover's Heaven Lake card is that still, and the cover and the
postcards are drawn again. Signed off (D77): the crater walls the rim's own
pale pumice round a whole, dark lake, and the slopes below a brighter
summer green than the mosaic's olive.

**The film is 1,062.5 MB**, up 0.7 MB: Heaven Lake's pack 149.6 to
150.4 MB, its hero area's 10 m colour 0.9 to 1.7 MB.

**Next.**
- *The Roof's first 43 s and 80-103 s,* from the archive as F98 did the
  Wall: 86 sub-tiles along the rail and about 40 country tiles near it,
  some 17 GB at the Wall's rate. Its gold would go greener: the archive's
  months there are April to August, the mosaic's dry season's.

## F100 — The picture the right way round, 26 September 2026

**Why.** Watching the film, the user found the arrow keys reversed: → turned
the view left. The binding table was right (→ is heading +, clockwise from
above, toward the grid's east). The picture was not.

**What was measured.** The camera's own axes, read from its matrix in the
running film: facing the grid's north, the screen's right pointed west;
facing south at Huangshan, east. And three peaks projected through a camera
at Tingri facing south, where east is on the left:

| Peak | From Tingri | On screen | |
| --- | --- | ---: | --- |
| Everest | 12.6 km east, 78.7 km south | +0.15 | wrong side |
| Cho Oyu | 10.6 km west, 62.4 km south | −0.16 | wrong side |
| Shishapangma | 89.4 km west, 18.0 km south | −5.19 | wrong side |

**Why it was so.** The world is laid out x east, y up, z north
(`Terrain.toWorld`): a left-handed frame. three's camera is right-handed,
so every frame the film has drawn was mirrored, east for
west. Everything inside the world agrees with itself - the sun, the
shadows, the rails, the altitude - so nothing looked wrong until a
direction on the screen was compared with one in the world. The lead-in map
was always the right way round, and disagreed with the view after it.

**The fix** is one line in the grade (`look/post.ts`): the composite reads
the scene at `1 - u`. No world, rail, shader or uniform changes; the cost
is nothing. Measured after it, holding → for 1.5 s over Turpan: heading
+49.7°, the view turns right, and the camera banks 32.5° into the turn
(the displayed right side down). The drag and the stick follow the same
axis. The one path left mirrored is the frame-cost capture with the grade
switched off, which measures time and not direction (`look.ts`).

**What it changes.** Every picture the film draws, and so every still
(`docs/stills/`), the cover's frames (`docs/cover/`), the cover and the
postcards: all of them were taken mirrored.

**The stills, again** (`npm run stills`, headless, all nine settled). Each
is its old still turned round and nothing else: against the old one
mirrored, at most 0.4 % of pixels differ by more than 8 levels (Huangshan's
clouds, which move), against the old one as it was, 57 to 95 %. The
cover's two frames (`npm run cover -- frames`) are the same, 0.3 % and 0.0 %,
and the cover and the postcards are drawn again from them; every card's
crop still holds its subject. The Wall's late sun is in the west now,
where 5 pm puts it. Signed off (D77).

**Next.**
- *Anything authored by eye from the screen* - a rail recorded with
  `?record=`, a caption's "ahead" - holds, being positions and not sides;
  a future caption saying "on the left" would now be true.
