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

## F101 — The film watched through: the Wall that never came, and eight things a viewer sees, 26 September 2026

The film was watched end to end at 1280 × 720 as a viewer would, with no
keys pressed, and then with them (four scenes in the browser pane, five in
a headless Chrome after the pane went hidden and stopped the frame loop). What follows is what looked wrong on screen and
what was done about it. Everything is in the shell, the look and the scene
files; the world is untouched.

**The Wall never arrived.** Every rail is cut to twice the flight (the
rails report: "a viewer at double speed needs twice that of rail"), so at
normal speed a scene flies the first half of its rail. For the Wall that
half was Lhatse to Tingri: at 17:52, eight seconds before the end, the
camera was still over brown hills and Everest a grey line on the horizon,
with "Rongbuk glacier" and "Everest" captioned over the plateau. The rail
now runs the plateau at 150 km/min and the mountain at 40: Rongbuk at about
63 s, the summit at about 92 s, the Nepal side at 50 km/min for the slack a
viewer at double speed needs (the gate asks 228 s; it is 242). At one speed
the last minute is now flown among the lit peaks of the Rongbuk basin and
over the summit into Nepal. The packs, the rails report and the stations
were cut again; the Wall's pack listed 13 tiles and 8 sub-tiles along the
Nepal leg without colour or relief. `make colour` and `make relief` then cut
them (690 mosaic tiles fetched, the rest of the world already cached; every
other scene's pack came out byte for byte the same), and the Wall's pack grew
from 73.6 MB to 81.4 MB. Its still at 60 s did not change (16 pixels on the far
horizon). The cover's card had: `tools/cover.ts` framed the Wall at 136 s of
flight, which on the old rail was the glacier with the north face ahead and on
the new one is a green gorge on the Nepal side, and the F101 cover shipped that
gorge. The card is now taken at 70 s, over the glacier with the face ahead and
Nepal beyond it, reached at the authored speed.

**Captions named what was not on screen.** The Roof's third caption said
Namtso at 100 s with the camera at the Hoh Xil (Namtso is at 216 s of rail,
a double-speed place); it now says the Hoh Xil. The Taklamakan's caption
moved from 90 s (Korla, oases) to 102 s (the basin's edge); Heaven Lake's
from 100 s (the cone's flank) to 106 s (the crater in view); the Wall's
Tingri caption from 15 s to 24 s, where Tingri is.

**The horizon ring, three ways.**
- *Pale flat-topped strips over the true horizon* (the Tarim at 13:26, the
  Wall's Nepal side at 92 s). The ring's nearest shell is 384 km out, and in
  the plateau's air (2e-6 a metre, 6,000 m scale height) a band 400 km off
  was 28 % hazed: a ridge line of 8 km cell maxima, flat where a plateau's
  cells share a height, standing as paper over the terrain's own far edge.
  The ring now fades into the sky with distance whatever the air says,
  `1 − exp(−d / 250 km)` at least: 0.79 at the first shell, 0.92 at the
  second (`horizonRing.ts`, `FADE_KM`). Nothing the terrain draws is
  touched.
- *A pale slab at the Wall's left horizon* for the whole scene. Beyond the
  corridor the horizon field is zero, and the band a sea-level ridge hangs
  from sat below the true horizon where no terrain painted over it. A band
  whose ridge is the sea is discarded; the sky is what belongs there.
- *Loess's green range on a yellow sea* (also in the committed still). Not
  the ring: the Lüliang's forested ridges, 60 km off, standing out of the
  dust deck. The deck (`dust-haze`) had a hard top at 1,500 m and the
  camera flies at about 1,560 m, so everything under the lid was ochre and
  every ridge over it a dark unhazed cut-out on a flat band. A mist may not
  rise into the band the scene flies in (the presets test, so the camera
  looks down through it), so the slab has a tail instead: above its top the
  density thins as `exp(−h / tail)`, integrated exactly along the sight line
  (`MistPreset.tailM`, `uMistTail`, `mistAlong`), 900 m for the dust deck
  and none for every other mist, which is the hard top it always was. The
  ridges are in dust; the near ground is as it was.

**The shell.**
- The loading card ("Nine Skies") faded over 0.9 s while the scene's title
  faded in under it, worst on a deep link: it now steps aside in 0.25 s.
- A chapter's name stayed over the picture after the bar had stepped
  aside, when the pointer was left resting on it: the label goes with the
  bar.
- The lead-in map's jump label ran off the sheet ("3,185 km (1,979 mi)
  west" over Turpan's sky): a label now takes the first of five placements
  wholly on the sheet, tested against the fan's own outline.
- Turpan's title stood over a wall: the flank of Bogda filling the left
  third. The lead-in's camera was placed by an eased controller with the
  clock stopped, so it kept the height read before the pack had landed. It
  now forgets its height each lead-in frame and stands where the landed
  ground says, which at Bogda is 2,200 m higher and the picture the rail
  meant.
- A held turn banked the horizon 34°, which read as a dive; the bank is
  held to 23° (`rail.ts`).

**Seen and left.** Satellite colour smeared down every exaggerated wall
where the rock face does not take over; the northern near-ground a blur
under the camera; Turpan's tiger-striped hills under the 21:00 sun; rivers
as constant-width ribbons with stepped edges on the country grid, and
Heaven Lake's plane cutting its rim in a zig-zag; cloud pixels in Changbai's
forest at 11:01; the Himalaya's far peaks as unlit grey (the ring draws no
normals, by design); and at the Wall's hero rim
the curtain's tan vertical stripes, now in view at 17:00. Each is a world
or pipeline matter, not a shell one.

**Checked.** `npm run check` passes (466 tests, the gate); every scene's
title card, the Wall at 30, 92 and 112 s, Loess at 45 and 100 s, the karst
and the gorge mists, Turpan's title and the Tarim at 80 s were captured
headless before and after. The stills and the cover are retaken.

## F102 — The cast: figures in the sky, off unless asked, one seam (D91), 26 September 2026

**Asked.** Chinese myth figures in the film's sky — the Monkey King, Nezha,
the four dragons, the Queen Mother of the West and her blue birds, the
pilgrims — as a layer the viewer can switch on, off by default, built so it
can be swapped or dropped later. Research and two mockups came first (the
cut-out casting board and the 3D study, both private artifacts); the user
chose figures made in code over anything copied, and the lantern skin over
ink and lacquer.

**What was built.** An optional layer with three plug axes and a single
seam.

- *Content.* A scene file may carry a `cast:` block (`content/cast.ts`;
  `Scene.cast`, empty when absent): each cue names a registered figure, a
  variant, a role — a *monument* at a place and a height over the ground,
  or a *companion* so many metres ahead, right and up in the camera's
  frame — a size in real metres, the seconds of the flight it is in play,
  and a line of its own. The gate refuses an unknown figure (naming the
  list), a monument without a place, a companion without an offset or
  behind the camera, a cue outside the flight or ending before it starts,
  a size outside 10 m–30 km, a bare figure or a line over twelve words.
  `content:validate` counts the cast per scene.
- *Figures.* `engine/src/cast/figure.ts` holds the `Figure` and
  `FigureBuilder` interfaces and a registry; `kinds.ts` is the list the
  gate knows, so the gate carries no geometry, and a test holds the two to
  each other. A figure is built once at a native size in its own units and
  scaled to the cue's metres by the layer; each frame it moves itself and
  the layer places it. `parts.ts` has what figures share: a scale relief
  and a silk-and-rib texture computed in code (no canvas, so a figure
  builds in a test), and `SpineTube`, a body of any length along a curve
  with its belly kept down and two index groups so a skin dresses back and
  belly apart. The first figure is the dragon (`figures/dragon.ts`): the
  study's, ported — 9,380 triangles, four claws, no wings, variants for the
  four kings in the Four Symbols' colours.
- *Skin.* A figure never picks a material: it asks its skin by role and
  colour (`skin.ts`), and a skin caches per pair, so a dragon of a hundred
  parts wears eleven materials. The lantern is the first skin: silk over
  bamboo with an inner glow. A swap redresses every part (tested).
- *The layer.* `cast.ts`'s `CastLayer` owns the scene's figures, a sun and
  a hemisphere light it sets each frame from the look's values (direction,
  colour, ambient, daylight), and a fog in the horizon's colour whose reach
  is set from the look's haze (linear against the look's exponential; they
  cross two thirds of the way to the horizon, near enough for figures that
  should fade where the ground does). The terrain's shaders ignore
  `scene.fog`, so the world is untouched. Monuments are placed every frame
  in world units, since the terrain rebases; companions are eased toward
  their spot. A cue fades in and out over 1.5 s. `Passes.cast` prices the
  layer by absence like the others; `LookRig.air` exposes the haze it
  computed.
- *The switch.* `app/src/cast.ts`: a lantern button in the bar (shown only
  when the film has a cast), the key J, `?cast` in the address so a link
  carries it (`?cast=off` to refuse it), the choice remembered per browser.
  On, the layer's code arrives as its own chunks (`cast-*.js`, the figures,
  `parts-*.js`: 12 kB gzipped between them) and the current scene's figures
  are built; off, they are freed and the fog removed. The entry bundle
  carries none of the figure code (checked in the build: `main-*.js`
  mentions no variant, the figures chunk does).
- *The seam.* `Scene.cast`; the parser; `Passes.cast` and `LookRig.air`;
  in the shell, `cast?.setScene` at a scene's start, `cast?.setScale` with
  the exaggeration, `cast?.frame` after the look's frame, the button, the
  key, and `__ns.cast` for probing. Nothing else in the core knows the
  layer exists.

**First cue.** Huangshan: the East Sea's king, 1,500 m, 700 m over the
ground north of Lotus Peak, from 6 to 108 s. Captured headless with the
cast on (scratch `castshot.mjs`, `tools/stills.ts`'s driver with
`Page.captureScreenshot`, and `PROBE=10,20,…` to project the figure into
the frame at each second): in frame and lit at 10–25 s, upper right over
the cloud sea, hazed with the peaks; behind the camera from 30 s on the
rail's second pass. Small at 850 world units. Both are content matters for
the cues (stage C), not the layer's.

**Cost.** Not yet priced at the stations (the pane was hidden and the
frame loop with it); the dragon rewrites 1,533 vertices and 32 instance
matrices a frame and draws under 10k triangles in a dozen materials.

**Checked.** `npm run check`: typecheck, 479 tests (13 new in
`test/cast/`), `content:validate` with Huangshan showing one in the cast.
In the pane: a fresh page comes up off with only the switch's own module
loaded; the button fetches the layer's modules and builds one figure; the
second click frees it and removes the group and the fog; the address flag
and the stored choice behave as the tests say.

**Next.** Stage B, the study's other figures as builders (Nezha, Wukong,
the pilgrims on a shared figurine, Xiwangmu and the birds, the cranes);
stage C, cues for the nine scenes from the casting board, and the sky's
name on the card; stage D, the layer's lines in their own register; the
fog matched to the look's exponential haze in the figures' own shader
once there are enough figures to justify one; the stations priced with
the cast on.

## F103 — The cast's company: six figures on one doll, 26 September 2026

Stage B of D91: the study's figures as builders. Every human figure of
the cast is now the same doll dressed differently, and the layer places
each by its cue in the film's light.

**The figurine** (`engine/src/cast/parts.ts`). A `Wardrobe` dresses a
mesh by role and colour from the skin and remembers it, so a swap redresses
everything and the budget counts everything. `humanoid()` builds the doll
- a head a third of its height, a torso, arms with an elbow, legs with a
hip, shoes - 2.3 units tall; `walk()` swings the limbs against each other;
`cloudBank()` and `breathe()` make the silk puffs a figure rides;
`bird()` makes a crane, and at a smaller size and other colours one of the
Queen Mother's blue birds. A character is what a builder adds to the doll.

**The figures** (`figures/`). Nezha (8,104 triangles): buns and ties, the
bib, the lotus-leaf skirt, the ring on the wrist, the flame-tipped spear,
the sash rewritten along a waving curve each frame, two wind-fire wheels
spinning; he circles his place leaning into the turn, or hovers as the
`still` variant. Wukong (9,916): the doll in fur with a pale face, the
phoenix-wing cap with two plumes, gold mail with red collar and belt, the
tiger kilt in stripes computed in code, the banded staff on his shoulder,
one hand at his brow, a tail, and the somersault cloud under him; a
figure-of-eight and a somersault every seven seconds, or hovering as
`still`. The pilgrims (20,032): the horse with walking legs and a swinging
tail, saddle and bridle; the monk in the five-leaf crown and the patched
kasaya with the ringed staff, seated; Bajie with snout, ears, belly and the
nine-tooth rake; Sha with red hair and beard, nine skulls, the crescent
staff and the luggage pole; on a road of sixteen cloud puffs, walking a
slow circle or in place. Xiwangmu (8,900): the robe to the ground, wide
gold sleeves, a jade belt, the coiffure with the 胜 bar and discs, a peach
in her hand, on a cloud bank, with three blue birds circling her. The
cranes (7,744): eleven in a loose V, each flapping at its own rate, banked
so a wing shows, flying a loop or holding formation.

**What the first placement taught.**
- At 300 km a minute a monument is passed in seconds: the Queen Mother
  set at Bogda's Jade Pool was behind the camera by eight seconds, and
  Nezha over the Flaming Mountains, in front at 12 s, was 64 km off and
  six pixels wide. On the fast scenes figures ride with the camera. The
  probe's NDC z over one means *behind the camera* (the far plane is
  3,200 km), which the probe now says outright.
- A companion's "up" went through the vertical scale, which the film
  draws six times the horizontal: 70 m up stood 30 degrees over the lens,
  and the cranes and Wukong sat under the frame. Offsets are now metres
  of the picture, all three axes through the horizontal scale, the scale
  a size goes through; a place and a height over the ground stay real.
- Companions face the way the camera flies, so the viewer sees their
  backs: right for the pilgrims on the road, and for Nezha's sash; for a
  figure that should turn to the viewer a cue will want a `facing`
  (stage C).

**Cues now** (to see each builder once; the casting for the nine scenes
is stage C): Huangshan, the East King's dragon over the cloud sea, a
flock of cranes and Wukong riding beside the camera; Turpan, the Queen
Mother for the first leg and Nezha over the depression; the Roof, the
pilgrims at 760 m ahead and to the right. Captured headless at 25, 30 and
40 s with the cast on; all in frame and lit.

**Checked.** `npm run check` passes; the cast tests build every listed
kind under 60k triangles and swap its skin whole. The entry bundle still
carries no figure code.

**Next.** Stage C: the casting board's cues across the nine scenes, a
`facing` for companions, the sky's name on the card; the blue birds and
crane wings as shaped feathers rather than boxes; the stations priced with
the cast on.

## F104 — The cast in nine skies: every scene cued, a facing, and the sky's name on the card, 26 September 2026

Stage C of D91. The casting board's plan is in the scene files, as far as
the six built figures carry it; a cue can say which way its figure turns;
and with the cast on, the title card names the scene's sky from the
*Huainanzi*'s nine fields of heaven.

**The nine skies** (`heaven:` in each scene file, read like the title, on
the card under the line, only while the cast is on). The board's
assignment: Huangshan 苍天 the azure sky (east); the Three Gorges 阳天 the
sunlit sky (south-east); the Karst 炎天 the blazing sky (south); the First
Bend 朱天 the vermilion sky (south-west); the Loess 钧天 the central sky;
Grassland to Heaven Lake 变天 the changing sky (north-east); Below the Sea
颢天 the white sky (west); the Roof 幽天 the dim sky (north-west); the
Wall 玄天 the dark sky (north). The gate holds a scene to a whole name or
none, and the cast test to nine different names from the nine.

**A facing** (`facing_deg` on a cue). A companion's is from the way the
camera flies - 90 its right, 180 the camera; a monument's is a bearing.
The doll is built facing +z and the world's +z is north, so the yaw is
the bearing itself (`figureYaw`). With it the party, Wukong, Nezha and the
Queen Mother turn three-quarters to the viewer instead of showing their
backs (F103).

**The company, per scene.** Huangshan: the four Dragon Kings surfacing
from the cloud sea round the massif, each where a pass of the loop looks
at him, Wukong and the cranes beside the camera, Nezha after him from
half way. The Gorges: the West King's third son, the White Dragon of
Eagle Grief Stream, in the slot below the camera (a `white` livery). The
Karst: the party with Bajie walking the sky beside the river, a flock
crossing ahead. The First Bend: the party over the gorge with Wukong
ahead, cranes below, which winter at Lashi Lake by Lijiang. The Loess:
the monk alone on the white horse riding out of Chang'an at the film's
midpoint (a `monk` variant of the pilgrims: horse and rider, a shorter
road), and the Jing River's king in dust (a `dust` livery). Grassland to
Heaven Lake: cranes with the camera over the grass, and a flock circling
the lake in the crater. Below the Sea: the Queen Mother off Bogda, the
Uyghur story's slain dragon lying along the Flaming Mountains as a
monument twenty kilometres long, Wukong and Nezha over the depression,
the party over the Flowing Sands. The Roof: the party crossing the
Tongtian beside the camera, black-necked cranes off Qinghai Lake. The
Wall: the party high and small against the last light from Rongbuk on,
the crossing; nothing else over Chomolungma. Twenty-five cues; every
scene has at least one.

**What the captures taught** (all nine scenes headless, twice or three
times each, with the cast on):
- A monument in the cloud sea must be cued to clear the deck: the North
  King at 600 m over a valley floor of 300 m was under the 1,050 m cloud
  and invisible; at 1,000 m he surfaces.
- White is lost on white. The West King in ivory was not to be seen
  against the cloud sea; he is silver now.
- The dragon's loop was nearly flat, so seen from the side a king was a
  line; the loop now rises and dives a third of the length, and a dragon
  seen from afar coils.
- A flock has to be big to read: at 300 m across it is a white scribble;
  480 m and up, it is birds. Seen from the rear quarter (a facing of 45
  to 60) it is a V; side-on, the flapping wings are edge-on and it is a
  scribble again.
- Two companions on one azimuth overlap: Wukong sat on the Queen
  Mother's cloud, then under Nezha. Cues on a fast scene want their own
  bearings.
- The crater: from outside, at six times relief, the rim stands 24
  degrees above the camera and anything over the lake is above the frame
  or behind the rim. The flock over the lake is cued below the rim and
  appears when the camera crosses in, at about 110 s at 1x, and for every
  lap at 2x.
- The grade mirrors the picture (F100), so the probe's NDC x is the
  picture's mirror; a cue's `right_m` still lands on the picture's right,
  because the world's right vector is mirrored too.

**Waiting for builders** (the board's figures the six kinds cannot
give): the tiger and Sanduo at the bend; the phoenix, Guanyin, the
elephant and the Li's egrets at the karst; the carp at the Dragon Gate
and Jingwei on the Loess; the Peng and the Manchu magpie with the red
fruit on the steppe and at the lake; the Bull Demon King, Sha alone out
of the Flowing Sands and the Eight Immortals at Turpan; the turtle, the
qilin and lungta on the Roof; Yao Ji on Goddess Peak; Miyolangsangma at
the Wall, if she is chosen over the crossing. The blue birds and cranes
still have box wings.

**Checked.** `npm run check` passes; the gate reports every scene's
company and its sky. Captures in this session's scratchpad, `castC-*`.

**Next.** Stage D, the layer's own lines (`line` on a cue is read and
budgeted, and the shell does not show it yet); the stations priced with
the cast on; feathered wings; the figures above, as the film wants them.

## F105 — The cast's own lines, in a second register, 27 September 2026

Stage D of D91. A cue may carry a line, and the shell now says it: the
figure's name in characters over the words, in the lantern's warmth
(`--warm`), the characters in the song face and the words in italic
serif, in the caption's place. It shows only while the cast is on, for
six seconds like a caption, and it is never on at the same time as one.

**The shape.** `line` on a cue was read and budgeted since F102; it now
has `name_zh` (characters only) over it and `line_at`, the second it
shows, the cue's `from` unless said. The gate refuses a name or a time
with no line, a time outside the cue's own seconds, a line over the
flight's end, a line whose six seconds cross a caption's, and two of the
cast's lines within six seconds of each other. The cast's lines are the
cast's: `textLines` does not count them, so the film still says 36 of
its 40 with fifteen more in the sky.

**The lines** (fifteen, one to three a scene, each twelve words or fewer,
each a name and one thing about the figure the viewer is looking at):
the four Dragon Kings, Wukong and Nezha over Huangshan; the White Dragon
in the Gorges; the party at the Karst and at the Bend; Xuanzang riding
out alone and the Jing River king on the Loess; the steppe's cranes; the
Queen Mother, Nezha and the Flowing Sands at Turpan; the black-necked
cranes and the Tongtian on the Roof; the last crossing at the Wall.
Their seconds sit between the captions' (a caption at 8, 50 and 96 s
leaves 20, 32 and 62 for the cast at Huangshan).

**Checked.** `npm run check` passes; the gate reports each scene's
lines of its own. The hold harness (`castshot.mjs`) pins the camera and
the shell clears all text on a pinned camera, so it cannot show a line;
a play-through harness (`playshot.mjs <chapter> <out.png>`, scratchpad)
plays a chapter headless from its lead-in and logs every caption and
cast line as it comes and goes. Huangshan: the caption at flight 8–14,
the cast's line at 20–26, nothing overlapping. Loess: the caption at
15–21, then 玄奘 at 24–30. Frames of both in the scratchpad.

**Next.** The stations priced with the cast on (a window and a GPU, not
this session's headless swiftshader); feathered wings for the birds; the
figures the board still wants (F104); a decision on scene 9 and the
switch's name.

## F106 — Feathers, six more of the board's figures, and what the cast costs, 27 September 2026

Stage E of D91: the birds' wings as feathers, the figures the casting
board wanted that the six kinds could not give, and the stations priced
with the cast on as far as a headless timer will price them.

**Feathers** (`parts.ts`). A feather is a flat tapered blade of twenty
triangles; `featherFan` sweeps a row of them back from one root, each a
hair under the one before, and merges them into one geometry, with the
outer share of each in a second for tips of another colour. `wing` is an
arm of four coverts and, from the wrist, a fan of primaries with tips:
three meshes a wing, built along +x and mirrored by scale for the left,
so a flock of eleven stays at 132 draws. The cranes and the Queen
Mother's blue birds have them now; the box wings are gone. The tiger
stripes moved from Wukong's kilt to the parts as `stripesTexture`, one
per pair of colours.

**Six figures** (`figures/`), each on its own puff of cloud or wing:
- the qilin (5,590 triangles): a deer in scales with a dragon's head,
  antlers, a beard and mane, cloven hooves, flames at the shoulders and
  hocks, an ox's tail; gold with green, as the Ming woodblocks have it;
  it walks on cloud, as asked;
- the phoenix (4,314): a pheasant's body in red and gold, a crest with
  beads, feathered wings, and five tail plumes in five colours rewritten
  along waving curves each frame, each with an eye at its end;
- the tiger (5,860): stripes computed in code, a pale belly and muzzle,
  the 王 on the brow, a long tail with a black tip, paws on cloud;
- the turtle (3,904): the 鼋 of the Tongtian, a domed shell with a rim
  and moss, a plastron, the soft-shell's tube of a nose, four paddles
  that row the air;
- the magpie (1,880): black and white with a blue-black tail, the red
  fruit of the Manchu story in its beak;
- the Peng (2,972): an eagle in gold, a hooked beak, wings of nine units
  each with dark tips, a fan of a tail, talons tucked; it soars, the
  wings beating slowly.
Every kind builds under 60k and swaps its skin whole; the registry and
the gate's list hold each other to twelve.

**Where they went.** The phoenix over the karst towers; the tiger
walking the air over the gorge named for its leap, after the cranes;
the Peng over the steppe, and the magpie beside the camera on the
crater's laps; the qilin and the turtle on the Roof, beside the party,
after the cranes. Each with a line: 麒麟, 凤凰, 虎, 老鼋, 喜鹊, 鹏. The
cast now speaks 21 lines in the nine scenes, still none of the film's.

**What the captures taught.** The Peng's tail fan was swung to one side
by a sign - a fan spreads from its first feather, so it starts a
half-spread before straight back - and seen from behind at a low angle a
soaring bird is a blob with a line; it is cued higher and turned
three-quarters to the camera, so the wings show from below. A magpie of
70 m at 700 m was a speck; 90 m reads.

**What the cast costs.** `__ns.frameCost` now drives the cast at each
station (the station's figures at the station's second), and a headless
Chrome on the M3's own GPU priced four stations with the cast on, twice
each. The instrument fitted only at the two stations on the country grid
alone (r² 0.96–0.98): Below the Sea, all 4.3 and 5.0 ms against 6.2 and
5.05 without the cast; the Roof, 4.8 against 4.9. With two figures on
stage the cast's cost is inside the timer's noise, under half a
millisecond. At Huangshan and the Karst, the hero stations, the fit
failed (r² 0.45–0.75) and the numbers are not measurements; Huangshan
with its seven figures and 450 draws is the one that wants a visible
window: `?cast#huangshan`, then
`__ns.frameCost(20, [1920, 1080], ["huangshan"]).then(r => console.log(__ns.frameCostTable(r)))`
in the console, twice. The headless numbers run about twice F86's
anchors even when they fit (`clear` alone reads 1.6–2.4 ms), so only the
difference within a run is read, never the absolute.

**Decisions taken, open to reversal.** Scene 9 keeps the crossing: the
party high and small against the last light, nothing else over
Chomolungma; Miyolangsangma stays unbuilt, since a lantern doll of the
mountain's goddess would not be reverent, and silence is one cue away.
The switch keeps its name: the cast, key J, `?cast` in a shared link.

**Still waiting.** Sanduo, Guanyin, lungta and Miyolangsangma, figures
of living faiths, which want a decision on how they are drawn before
they are; Yao Ji, Jingwei, the carp, the Bull Demon King, the Eight
Immortals, the elephant, the egrets, which want time.

**Checked.** `npm run check` passes; captures of each new figure in
this session's scratchpad (`castC-castE-*`).

## F107 — The rest of the board: eleven figures, four of them drawn without a body, 27 September 2026

Stage F of D91. The casting board's last eleven figures are built and
cued, and the four that belong to living faiths are drawn by a rule
decided today.

**The rule for living faiths.** Sanduo is the Naxi god of Jade Dragon
Snow Mountain, with a temple and a festival; Guanyin is prayed to in
every province; the wind horse hangs on every pass in Tibet;
Miyolangsangma receives an offering from every Sherpa expedition before
it sets out. A lantern doll of any of them would be a caricature of
someone's god. So the film draws none of them as a body: each is its
mount, its seat, its standard, or the thing its faith itself makes and
hangs, the way early Buddhist art showed the Buddha for five centuries
by an empty seat, a wheel or a pair of footprints. `LIVING_FAITHS` in
`kinds.ts` names the four, each of them opens its wardrobe, and the cast
tests hold them to it: no part of theirs has the role `skin`, the doll's
face and hands.
- Sanduo: the white horse saddled in white and gold, riderless, the
  white spear upright at the saddle with a pennant streaming from it.
  The line says why the saddle is empty: the Naxi god is the snow
  mountain itself.
- Guanyin of the South Sea: the lotus throne, empty; on it the vase of
  pure water with the willow sprig; the novel's white parrot circling.
- Lungta: the prayer flags themselves, fourteen on a line between two
  clouds in the five colours, each block-printed in code (`flagPrint`:
  the horse with the flaming jewel, rows of text above and below) and
  fluttering on the rope.
- Miyolangsangma: her golden tigress with the saddle cloth empty and the
  bowl of inexhaustible food on it, cued on the approach from Tingri and
  gone before Rongbuk; the crossing follows; nothing over the summit.

**The seven that wanted time.** Yao Ji (6,908 triangles) on a cloud in
jade, her hair in two loops, two ribbons streaming, a hand raised over
the river; Jingwei (1,904), the crow-shaped bird of the Shan Hai Jing
with the patterned head, white bill, red feet and a twig; the carp
(3,268), leaping a tall ellipse out of a spray of cloud, tail beating,
since the Dragon Gate lies past the Loess rail's reach; the Bull Demon
King (6,652) as the white bull of ch. 61, iron horns and the fire wheel
on the right one; the Eight Immortals (37,074 triangles, 211 meshes, the
heaviest figure) each from the doll with their emblem, Zhang Guolao
backwards on a donkey; the elephant (4,432) with the caparison, ears
that swing and a trunk rewritten each frame; the egrets (12,168), nine
with the neck drawn in and yellow feet, in a loose line. Two bodies are
shared now: the horse moved from the pilgrims into `parts.ts` (`horse`,
`horseWalk`) and carries the pilgrims, Sanduo's mount and the donkey;
the tiger's body (`tigerBody`, `prowl` in `tiger.ts`) carries the tiger
and the tigress. Twenty-three kinds, 41 cues, 32 lines of the cast's
own; the film's own count is still 36 of 40.

**Where they went.** The Gorges: Yao Ji above the camera through the Wu
Gorge from 62 s. The Karst: the elephant beside the camera from the
start, egrets in the cranes' place, Guanyin's seat over the towers at
the end. The Bend: Sanduo high on the right as the rail leaves the
gorge, Jade Dragon's side. The Loess: the carp and Jingwei. Turpan: the
bull below Wukong and Nezha, the Eight Immortals crossing the sea over
Ayding Lake, the one ground in the film below it. The Roof: the flags on
the left over the first leg. The Wall: the tigress on the approach.

**What the captures taught.**
- A monument on a summit in a gorge scene is never seen: at six times
  relief every nearer wall stands over the line of sight. Yao Ji was
  cued on Goddess Peak first, at 700 m and again at 1,800 m tall, and in
  no frame of the approach was she visible; she rides as a companion in
  her own reach of the river instead. Monuments belong on open ground:
  Huangshan's cloud sea, the crater, the Flaming Mountains.
- Elephant Trunk Hill is behind the Karst camera from the first second
  (0.3 km at 50 degrees off axis, then 173), so the elephant walks
  beside the camera.
- Where the rail pitches down (the Bend at 95 s looks 18 degrees into
  the gorge), a companion's `up_m` has to follow: Sanduo at up 450 was
  above the frame, at 40 cut by its top edge, at -240 in the upper
  third. The probe's NDC is the check.
- Two companions on one bearing overlap whatever their distance: the
  bull at 1,900 m sat behind Wukong at 1,200 m. A companion needs its
  own bearing in both axes, not its own distance.
- An elephant in one grey is a lump: the trunk, ears and legs a shade
  darker, it reads at 300 m.

**Checked.** `npm run check` passes; the gate reports every scene's
company; captures in this session's scratchpad (`castC-F-*`,
`castC-G-*`, `castC-H-*`, `castC-I-*`).

**Decisions taken, open to reversal.** The four figures of living faiths
are drawn without a body, as above; the Wall keeps the crossing, with
the tigress before it and nothing over the summit. The names over the
lines: 三朵, 南海观音, 风马旗, and for the tigress 珠穆朗玛, the mountain's
name, which is the goddess's.

**Next.** A visible-window price at Turpan (46–54 s: Wukong, Nezha, the
bull and the Eight Immortals, about 345 draws) and at Huangshan; the
immortals could share fewer meshes if it costs. The board is built.

## F108 — The Eight Immortals baked: 211 draws to 42, 27 September 2026

The heaviest figure of the cast was the Eight Immortals, 211 parts and so
211 draw calls, on stage at Turpan with Wukong and Nezha. A figure is
made of many small parts because it is built like a doll, but most of
them never move against each other: once the eight are posed, only the
donkey's legs and tail move on their own.

**The bake.** `Wardrobe.bake(root, keep)` in `parts.ts` merges every
part under `root` into one mesh per material, each carried into the
root's frame, and takes out the groups it leaves empty. What moves on
its own is named in `keep` and stays as it was; so does a part that is
hidden, or dressed in a material of its own (a stripe, a print), which
the skin would not give back on a swap. A part mirrored by a negative
scale, as every left wing is, is wound again, or its faces would turn
inside out. The result is dressed by the skin like any part, so a skin
swap still reaches it, and the triangles are the same.

**What it changed.** Counted from the renderer (`renderer.info`, both of
the frame's render calls summed) at Turpan's station, 60 s, headless on
the M3's GPU, with the cast shown and hidden:

| | before | after |
|---|---|---|
| the Eight Immortals' meshes | 211 | 42 |
| draw calls in the frame, cast shown | 317 | 148 |
| of which the cast | 301 | 132 |
| triangles in the frame | 784k | 784k |

The 42 are 33 materials and the donkey's four legs and tail. The frame
without the cast draws 16 calls, so the cast was 95% of the station's
draws and is now 89%, and two thirds of what is left is Wukong and
Nezha.

**What it cost.** The eight no longer bob and sway each on their own:
the line moves as one, and each immortal is set at a fixed small height
and turn so it does not read as a plank. Their clouds no longer breathe;
at 520 m across, a puff's breath was under a metre.

**The GPU timer could not see any of this.** Priced headless at the same
station (`pricecast.mjs`), the run with the cast switched off entirely
read 0.7 ms between "all" and "all without the cast", which is the
timer's noise at this station; the cast's own cost is under it. Draw
calls are the measure that moves, and the scratchpad's `drawcount.mjs
<scene> <second> <label>` counts them.

**Checked.** `npm run check` passes; a test builds a small tree and holds
the bake to it (two parts of one material in one mesh, a mirrored part's
faces turned the way its normals say, a kept, a hidden and a printed
part left alone, triangles kept), and one holds the Eight Immortals under
fifty meshes. The frame at Turpan 60 s looks as it did (`castC-J-*`).

**Next.** The pilgrims are next at 147 meshes and walk in six scenes;
the egrets (153) and cranes (132) flap every wing, so a flock would
gain less. The bake applies to any of them with its moving parts named.

## F109 — The bake skinned: the pilgrims, egrets and cranes, and the immortals bob again, 27 September 2026

F108's bake merged only what never moves. The flocks would have gained
little from it, since every wing of every bird moves on its own: the
cranes would have gone from 132 meshes to 99. So the bake is skinned now.

**The skinned bake.** `Wardrobe.bake(root, keep)` still merges every
part under the root into one mesh per material, and each part is now
bound to a bone at the group that carries it: a bird, a wing's shoulder,
its wrist, a leg's hip, an arm. The groups move as they always did, and
the bones follow them, so the figure's own code is unchanged: a wing
flaps because `flapWing` turns its pivot, whether or not the feathers
are baked. What a group carries is fixed at the bake, so two things stay
out of it: a part whose geometry is rewritten each frame (a tail, a
sash), named in `keep`; and a part whose own transform changes. The
second was the clouds' breath, a scale on each puff: baked, a bank now
holds still, and `breathe` leaves alone what is no longer a mesh. At a
figure's size the breath was under a metre.

**One material, one program.** three.js keeps one shader program per
material, and a material drawn both skinned and not switches programs at
every draw. The skin now gives a baked part its own instance of each
material (`skin.material(role, colour, true)`), and a skin swap keeps it
there.

**What it changed** (meshes per figure, and draw calls per frame at four
stations at 60 s, counted from the renderer headless on the M3's GPU
before and after; the triangles in every frame the same to the one):

| figure | meshes before | after | bones |
|---|---|---|---|
| pilgrims | 147 | 19 | 31 |
| the monk alone | 72 | 11 | 14 |
| cranes | 132 | 3 | 55 |
| egrets | 153 | 5 | 45 |
| the Eight Immortals | 42 | 34 | 74 |

| station | draws before | after | without the cast |
|---|---|---|---|
| Huangshan | 316 | 187 | 25 |
| Karst | 383 | 107 | 24 |
| Below the Sea | 148 | 140 | 16 |
| the Roof | 221 | 93 | 16 |

Huangshan's remaining draws are the four Dragon Kings (68 each), Wukong
and Nezha, none of them baked.

**The immortals bob again.** F108 gave up each immortal's own bob and
sway so their parts could merge; with a bone at each of them it is back,
and the donkey's legs are bones instead of meshes of their own. Only its
tail draws apart.

**Checked.** `npm run check` passes. A test turns a group after the bake
and finds the part it carries turned with it while the root's part stays;
another holds the four figures to their counts with every triangle kept,
and the earlier test still holds mirrored parts' winding and the parts
the bake must leave alone. Captured headless in seven scenes
(`castC-K-*`), with a second frame 180 ms later at the Bend, the Karst
and Huangshan: the cranes' wings are up in one and down in the other,
the pilgrims' legs and arms have moved, and nothing is out of place.
The cast's own update per frame is the same within noise at each
station, from 0.2 ms on the Roof to 1.0 ms at Huangshan.

**Next.** The heaviest figures left are the Dragon Kings (68 each, four
at Huangshan), the Queen Mother (71) and the immortals' neighbours at
Turpan, Wukong and Nezha (45 each); each would bake with its rewritten
parts (the dragons' spines, Nezha's sash, Wukong's tail and plumes)
kept.

## F110 — The Dragon Kings, Wukong and Nezha baked, and baked figures culled again, 27 September 2026

The last of the heavy figures on the stations: the dragon (68 meshes,
drawn 69 times since the body's back and belly are two), four of them at
Huangshan and one each in the Gorges, on the Loess and at Turpan; and
Wukong and Nezha, 45 each, at Huangshan and Turpan.

**What had to change first.** The bake binds a part to the group that
carries it, so a part that turns itself would be frozen. The dragon's
jaw, its two whiskers and the seventeen blades of its mane each turned
themselves; Wukong's two cap plumes swayed themselves; Nezha's spear
flame scaled itself. Each is now wrapped in a group of its own that does
the turning, with the same transform as before, and the bake gives that
group a bone. The dragon also dressed its parts itself; it now uses the
wardrobe like every other figure. What stays out of the bake is what is
rewritten each frame: the dragon's spine tube and its instanced fins,
Wukong's tail, Nezha's sash; and Wukong's kilt, which wears its own
stripes.

| figure | draws before | after | bones |
|---|---|---|---|
| a dragon | 69 | 9 | 34 |
| Wukong | 45 | 12 | 11 |
| Nezha | 45 | 10 | 11 |

**A fault in F109, found here.** F109 switched frustum culling off for
baked meshes, since three.js computes a skinned mesh's bounds once, from
the pose at the bake, and a flock or a dragon moves far from it. At
Huangshan three of the four kings are behind the camera at 60 s: their
bodies were culled and their baked heads and legs were not, 9 draws and
18,540 triangles for nothing. A baked mesh now carries bounds read from
its own bones each time three.js asks (`followBounds` in `parts.ts`):
each bone where it stands, plus the reach of what it carries as measured
at the bake, half again for a bone's scale. With it, every station's
frame has exactly the triangles it had before any bake, so culling is as
good as it was part by part.

**The stations** (draw calls per frame at 60 s, headless on the M3's GPU;
before is F109's code, after is this one; the triangles are the same as
before any bake at every station):

| station | before | after | without the cast |
|---|---|---|---|
| Huangshan | 187 | 59 | 25 |
| the Gorges | 93 | 33 | 24 |
| Karst | 107 | 107 | 24 |
| Loess | 117 | 57 | 16 |
| Below the Sea | 140 | 72 | 16 |
| the Roof | 93 | 93 | 16 |

Since F107 Huangshan has gone from 316 draws to 59 and Turpan from 317 to
72. The cast's own update per frame is unchanged within noise, 0.3 to
1.0 ms.

**Checked.** `npm run check` passes. The bake test now also holds a baked
mesh's bounds to where its bones are after they move; the figures' test
holds the dragon to 8 meshes, Wukong to 12 and Nezha to 10, with every
triangle kept; the skin-swap test still passes on the dragon.
Captured headless at Huangshan, the Gorges, Turpan and the Loess
(`castC-L-*`), with second frames 250 ms later: the dragons' legs, tails
and tufts have moved, their heads carry antlers, mane and whiskers where
they were before the bake, and Wukong turns his somersault.

**Next.** The heaviest unbaked figures are now the Queen Mother (71),
the qilin (58), the Bull Demon King (44) and the goddess's tigress (42).
None of them is on a station at 60 s.

## F111 — The Queen Mother and the qilin baked, 27 September 2026

The two heaviest figures left after F110: the Queen Mother with her three
blue birds (71 meshes) over Turpan's first leg, and the qilin (58) on the
Roof, which walks through the Roof's station at 60 s.

**What had to change first.** Nothing in the Queen Mother turns itself:
her arms and each bird and wing move by groups. The qilin's twelve
flames at shoulder and hock flickered by scaling themselves, and its
tuft followed the tail's end by moving itself; each is now a pivot group
with the same transform, which the bake gives a bone. The qilin's tail
is rebuilt each frame and stays out of the bake. Both figures' clouds
hold still now, as every baked cloud does.

| figure | draws before | after | bones |
|---|---|---|---|
| the Queen Mother | 67 | 14 | 21 |
| the qilin | 58 | 10 | 24 |

The Queen Mother has 71 meshes, but four of them are her legs, hidden
under the robe and never drawn; the bake leaves hidden parts alone, so
they are still there, still hidden. The figures' test now counts only
the meshes drawn.

| frame | draws before | after | without the cast |
|---|---|---|---|
| Below the Sea at 20 s (the Queen Mother, the Turpan dragon) | 92 | 39 | 16 |
| the Roof's station at 60 s (the party, the qilin) | 93 | 45 | 16 |

The triangles in both frames are the same before and after.

**Checked.** `npm run check` passes; the figures' test holds the Queen
Mother to 14 drawn meshes and the qilin to 10 with every triangle kept.
Captured headless at Turpan 15 s and the Roof 80 s (`castC-M-*`), each
with a second frame 250 ms later: the blue birds have moved round her
and beaten their wings, the qilin's legs have changed stride, and its
tuft rides the end of the tail.

**Where the cast stands.** Every figure on a station at 60 s is baked.
Of the unbaked figures, the Bull Demon King (44), the goddess's tigress
(42), Sanduo's horse (37), the tiger (36) and the phoenix (31) are the
heaviest.

## F112 — The Bull Demon King, the tigress, Sanduo's mount and the tiger baked, 27 September 2026

The four heaviest figures left after F111, none of them on a station at
60 s but each on stage for a good part of its scene.

**What had to change first.** The bull's six wheel flames flickered by
scaling themselves and its tuft followed the tail's end by moving
itself; the tiger's dark tail tip did the same. Each is now a pivot group
with the same transform, which the bake gives a bone. The tiger's body
is shared by the goddess's tigress (`tigerBody`), so the tip's pivot
serves both. What is rebuilt each frame stays out: every tail, and
Sanduo's pennant. The tiger's and the tigress's striped coat and head
wear their own stripes, so they stay out too, three draws each. The
clouds hold still.

| figure | draws before | after | bones |
|---|---|---|---|
| the Bull Demon King | 44 | 11 | 19 |
| the tigress | 42 | 14 | 12 |
| Sanduo's mount | 37 | 11 | 7 |
| the tiger | 36 | 10 | 12 |

| frame | draws before | after | without the cast |
|---|---|---|---|
| Below the Sea at 46 s (Wukong, Nezha, the bull) | 82 | 49 | 16 |
| the Wall at 40 s (the tigress) | 65 | 37 | 23 |
| the Bend at 95 s (Wukong, the party, the tiger, Sanduo's mount) | 126 | 74 | 22 |

The triangles in each frame are the same before and after.

**Checked.** Every test passes (489) and `validateFilm` says the film is
ok; the figures' test holds each of the four to its count with every
triangle kept, and the living-faith test still finds no part of skin on
Sanduo's mount or the tigress. `npm run check` as a whole stops at the
type check, on one error in `content/cast.ts`: a peer session sharing
the checkout has added fields to `CastCue` for D92 and has not finished
the parser. Nothing here touches either file, and the four figures
typechecked clean before that edit landed. Captured headless at Turpan
46 s, the Wall 40 s and the Bend 95 s (`castC-N-*`), each with a second
frame 250 ms later: the bull's wheel has turned on its horn and its legs
have moved; the tigress and the tiger have changed stride with the tail
tip on the tail's end; Sanduo's spear stands at the saddle.

**Where the cast stands.** Thirteen of the twenty-three figures are
baked. The heaviest left are the phoenix (31), Yao Ji (31) and the
elephant (28).

## F113 — The cast moves on its own: visits drawn from a seed, and a fourth plug axis (D92), 27 September 2026

**Asked.** The figures follow the camera, which is boring; make their
movement random so that they surprise, and keep to the cast's plug-and-play
architecture.

**What was wrong.** Thirty-five of the forty-one cues were companions: a
fixed spot in the camera's frame, held for 40 to 110 s, faded in on the
spot and faded out on it, turned the way the cue said while riding along
at the camera's speed. Up to five were on screen at once (the Karst). A
figure with no motion of its own relative to the lens reads as a sticker
on the glass; the eye has placed it in three seconds and stops looking.
Measured playing (scratch `motionprobe.mjs`, which plays a scene headless
and projects every figure twice a second), two things were worse than dull:

- The ease toward a companion's spot ran in world units, so a companion
  trailed its spot by the camera's speed over the ease's rate: 60–240 m at
  Huangshan's 22 km/min, but 1.9 km at the Roof's 360, where every
  companion sat *behind* the lens for nearly every sample.
- The eased position survived the terrain's rebase of the world origin
  (every 4,000 world units, every 5.3 s at the Roof), so each rebase threw
  the companions 4 to 24 km ahead, from where they rushed back through the
  middle of the picture and behind the camera again. At the Roof and the
  grassland the cast was flashes, not figures.

Holds hid both: `__ns.hold` pins the camera, so every still the cues were
tuned by showed the spot exactly.

**What was built: motion, the cast's fourth plug axis** (beside the figure,
the skin and the cue; the layer's one seam with the film is unchanged but
for a `view` in the frame input and `lineAt`).

- *The list the gate knows* (`cast/moves.ts`): `anchor` (a monument's),
  `hold` (the F103 companion, kept for a cue that asks for it), and seven
  that pass through the picture: `cross`, `overtake` (from behind the
  lens), `oncoming` (out of the distance, face-on, past the lens), `rise`
  (up from under the frame and down again), `stoop` (down from over it),
  `circle` (round the camera), `blink` (Wukong's somersault: a pause, gone
  in half a second up and over, a pause somewhere else); and `chase`, which
  only the director casts.
- *Motions* (`cast/motion.ts`, `cast/motions/*.ts`, one file each,
  registered by being imported, as figures are): a motion is built for one
  visit and returns a pose for any second of it. Most are a `KeyPath`: a
  cubic Hermite through timed keys laid out in the picture's own terms (the
  frame's -1..1 and metres from the lens, with a pad of the figure's own
  half-size past an edge), read back into metres through the live view
  each frame, so a path that enters off the edge of a 16:9 frame also
  enters off the edge of a phone held upright. A figure faces the way it is
  seen to go (side-on crossing, face-on coming on, from behind when it
  overtakes), pitches with its climb and banks into its turns, within its
  temperament's limits; the prayer flags, a thing on the wind, keep their
  cue's facing so they are never a stick seen end-on.
- *Temperaments* (`cast/temperament.ts`): each figure's repertoire and
  weights, pace, height band in the picture, pitch, gaps between visits,
  and whom it chases — a table of character apart from the builders, so
  a figure's file knows its body and nothing of how it is cast; a figure
  with no entry moves generically. Play is Wukong's (the somersault) and
  Nezha's (he chases Wukong, as in ch. 4, wherever both are cast); the
  living faiths and the Queen Mother are `stately`: slow, never drawn near.
- *The director* (`cast/director.ts`): when a scene starts it draws the
  scene's plan from the viewing's seed. A companion now *visits*: in from
  off the picture, through it or pausing in it, and out, with empty sky
  between. What it keeps, whatever the dice: a figure with a line has
  arrived and is paused at its author's spot, turned as its author turned
  it, for every second of its line, and comes and goes on its author's side
  of the picture; no more than two companions are in the picture at once,
  lines aside; a figure's visits stay inside its cue and three seconds
  apart; a monument stands for its whole cue. The dice choose the motion,
  the side, the height, the distance (mostly the author's, one visit in
  seven near and big, one in seven far and small; never near for the
  stately), whether a visit pauses, the gaps, and — for a cue with a
  `chance:` — whether the figure comes at all.
- *The seed* (`cast/random.ts`, `app/src/cast.ts`): a new one each time
  the page opens; `?castseed=N` plays a viewing again. A plan is a function
  of the seed, the scene and the cue alone, and a pose of the flight's
  second alone, so a seek, a hold, a probe or a shared link shows the same
  thing in any browser at any frame rate. Nothing in the cast calls
  `Math.random` but the shell's one draw.
- *Content* (`content/cast.ts`): a cue may name `motion:` (one or a list,
  of its role's motions) and `chance:` (0 to 1]; neither is used yet, so
  every cue moves by its figure's temperament.
- *The layer*: companions are placed from the camera's position every
  frame through a frame whose heading follows the camera's with a 0.8 s
  lag, so a figure is where its motion says at any speed and across a
  rebase, and swings a little when the rail turns. A figure skimming ground
  is lifted by up to half its size; one that goes behind a peak is hidden
  by it (lifting it clear pushed Wukong out of the top of the picture among
  Huangshan's spires, by up to 1,100 m). The line on screen comes from the
  layer, so a figure the dice left out says nothing.

**What it does.** Over 200 seeds:

| scene | visits a viewing | cue-seconds on stage | seconds with no companion |
|---|---|---|---|
| Huangshan | 10.9 | 41% | 43 of 114 |
| the Three Gorges | 6.2 | 46% | 54 |
| the Karst | 11.7 | 40% | 17 |
| the First Bend | 12.6 | 42% | 26 |
| the Loess | 10.5 | 42% | 34 |
| Grassland to Heaven Lake | 6.9 | 48% | 51 |
| Below the Sea | 8.3 | 40% | 36 |
| the Roof | 11.1 | 47% | 26 |
| the Wall | 3.2 | 51% | 67 |

Crossings are 44% of visits, then oncoming 19%, overtaking 10%, rising 9%,
the somersault 7%, stooping 6%, chasing 2%, circling 2%. Played headless
with seed 7: at Huangshan the cranes overtake from behind the lens at 9 s
and are gone by 17; Wukong drops in over a peak at 14 s and is in three
places before 23; the sky is empty until 29, when he crosses for his line;
from 48 s Nezha is a second behind him through every hop. At the Roof the
pilgrims walk across the picture at 13–22 s at 360 km/min, the cranes come
out of the distance and hold for their line, and the flags blow in for
theirs — where before the fix all three were behind the camera.

**Checked.** `npm run check`: typecheck, 507 tests (18 new in
`test/cast/motion.test.ts`: the dice; the motion list against the registry;
every passing motion entering and leaving off the picture or behind the
lens in a 16:9 and a 9:19.5 view for three sizes and twelve seeds, never
jumping; facing by motion; a named pause at the author's spot and facing;
the flags' fixed facing; the temperaments' rules; for every committed scene
and forty seeds, the plan's determinism, every line covered in the
picture, visits inside their cues and apart, the crowd held; Nezha after
Wukong; `chance` and a cue's own motions; the gate; the seed; and the layer
holding a companion to its pose at the Roof's speed through a rebase), and
`validateFilm` ok. The tests found two faults before any viewer did: the
Bull Demon King, put near the left edge, drifted off it during his line
(a pause's drift is now kept inside the picture) and left by swinging
across the lens (a named visit now keeps to its author's side); and
`?cast` alone parsed as seed 0, which would have played every viewing the
same.

**Not done.** Monuments still stand still for their cue; the Huangshan
kings could surface and sink on their own timing. A figure does not yet
turn its head to the lens as it passes. Nothing announces an arrival
(cranes scattering before a dragon breaks the cloud, a sound). No cue uses
`chance:` yet, so every figure comes every viewing. The rise does not know
where the cloud sea or the river is, only the bottom of the frame.

## F114 — The cast surprises: monuments surface, omens foretell, heads turn, some figures are rare (D93), 27 September 2026

**Asked.** The four things F113 left: monuments still stand still for
their cue; nothing signals an arrival; no figure turns its head to the
camera as it passes; no figure is rare. Keep to the plug-and-play
architecture.

**What was built.**

- *A motion that surfaces* (`cast/motions/surface.ts`, a row in
  `cast/moves.ts`). `moves.ts` is now a table of each motion's traits: its
  space (world or frame), whether it comes and goes, whether a cue may name
  it, its natural length, and when it is first seen. The director reads
  that table and names no motion itself. `surface` is a monument's that
  comes and goes. From under its place (its height over the ground and a
  third of its length more) it swims up along its bearing, nose high,
  stands at the place a while, then noses over and dives a little further
  on. Seen from the side it is a porpoise's arc, and the cloud deck and the
  rock hide it on the way down by being drawn over it. A world pose may now
  carry metres swum from its place. The dragon's temperament has it, so the
  four Dragon Kings surface over Huangshan's cloud sea. The Turpan dragon
  is dead and lies still: its cue says `motion: anchor`.
- *The sight* (`cast/sight.ts`): where a place shows in the picture at a
  second of the flight, flying the rail on auto at its authored speed
  through the film's usual view. The director times a monument's rising by
  it. Each king is in view for only one or two stretches of the loop (the
  East King 0–30 s, the South King 58–84 s, the West King 0–14 s and the
  last seconds, the North King 0–40 s). Drawn blind, a third of risings
  came up in view. So, more often than not (85%), a monument waits for a
  moment the flight is looking its way, within a minute of the first time
  it fits, and lets the time go by if none comes. Monuments take a rising
  each in turn, so each has one before any has two, and no more than three
  are up at once, bar a line. The named East King stands through his line
  in every viewing.
- *Omens, the cast's fifth plug axis* (`cast/omens.ts`, `cast/omens/*.ts`).
  An omen is a witness's reaction a moment before an arrival.
  - Temperaments say what a figure's coming brings: the dragon, the Peng,
    the tiger and the Bull Demon King make the birds `scatter`; the holy and
    the rare (the Bodhisattva, the phoenix, the qilin, the Queen Mother,
    Sanduo, Miyolangsangma) make everyone `look`.
  - Temperaments also say who answers: the skittish (cranes, egrets,
    magpie, Jingwei, the carp) flee, and the curious turn.
  - `omens.ts` holds each omen's traits: who witnesses, how long before the
    arrival, whether the witness leaves, and whether one may be brought on.
  - The director writes the reaction on the witness's visit, and at play
    the omen's module wraps the witness's own motion.
  - A scattering witness must be well in the picture when it takes fright
    (in a pause, or the middle of its way). Otherwise its flight is only its
    leaving come early, which was what the first playthrough showed.
  - Where none is on stage, a flock is brought on to hover a few seconds
    first. A monument's coming is foretold before the companions take up
    their seconds, so the herald has room.
  - `scatter`: the bird flinches for 0.3 s with its head snapped round to
    the danger, then bolts away from it, across the picture and up. It
    accelerates enough to be out of the picture in 2.6 s, before the
    arrival is fully in. The flight is laid out in the picture's own
    terms. In frame metres, a flock below eye level that came any nearer
    dropped out of the bottom of the picture. The danger's height counts
    for half, since birds burst across and up.
  - The pose now carries an `alarm`, which the layer hands the figure in
    its frame (`CastFrame.alarm`, optional). Cranes and egrets break
    formation and beat faster, so a flock bursts apart rather than
    sliding off as one block.
  - `look`: heads only. The witness turns toward where it is coming from,
    stays on it as it comes, and holds for four seconds after.
  - Never a figure mid-line.
- *Heads* (`Figure.heads`, `cast/gaze.ts`, helpers in `cast/parts.ts`).
  A head is a pivot of the figure's own that its animation never touches,
  facing +z at rest, with its limits. The layer turns it after the figure
  has moved itself, toward the point the pose names:
  - the lens, while the figure's line is on;
  - the lens, in a glance on its way, as often as the figure is curious
    (Wukong 0.65; the flags, the empty lotus and the carp never);
  - the danger, in an omen.

  Past its reach behind it, a head lets go rather than whip round the other
  way. Twenty figures have 106 heads between them: every bird of a flock,
  each of the Eight Immortals, the horse and the donkey, the elephant with
  its trunk. `humanHead` takes the doll's head and everything a builder
  hung above the collar; beards are attached by hand.
- *Rarity* (content only, `chance:`), each for the lore's reason:
  - the phoenix, seen when the world is at peace, one viewing in two;
  - the Peng, which rises on the sixth month's wind, three in five;
  - Jingwei, a small bird on a long errand, three in five;
  - the qilin, three in four, since it was asked for.

  Every scene keeps a figure that always comes.

**Seen playing** (seed 7 at Huangshan, seed 1 at the Karst, scratch
`motionprobe.mjs`):
- At Huangshan the cranes come in over the ridge at 10 s and hover at
  13 s. At 14.8 s their heads snap round to the right, and the V bursts
  and scatters left. The East King comes up behind the peaks and is in
  the sky above them for his line at 20 s.
- At 57.5 s the cranes drift over the open cloud sea and scatter at 58.2
  s. At 59.8 s the red South King breaks the cloud at the lower right and
  swims up out of it, as Nezha comes in for his line.
- At the Karst the pilgrims glance at the lens, then turn their heads to
  the phoenix a second before it comes in from the left, and hold on it
  until they leave; it glances at the lens as it passes.
- No exceptions.

**What it does.** Over 200 seeds:

| scene | glances a viewing | scatters | looks | risings |
|---|---|---|---|---|
| Huangshan | 5.3 | 0.98 | 0.00 | 4.0 (84% where the flight looks) |
| the Three Gorges | 2.0 | 0 | 0.06 | — |
| the Karst | 1.6 | 0 | 0.97 | — |
| the First Bend | 4.5 | 0 | 0.90 | — |
| the Loess | 1.8 | 0.06 | 0.07 | — |
| Grassland to Heaven Lake | 0.9 | 0.02 | 0 | — |
| Below the Sea | 1.6 | 0 | 0 | — |
| the Roof | 1.5 | 0 | 0.17 | — |
| the Wall | 0.4 | 0 | 0 | — |

**Checked.** `npm run check`, with 13 new tests in
`test/cast/surprise.test.ts`:
- the surfacing path: under, up, standing, under, never jumping, nose up
  rising and down diving, along its bearing;
- the sight: ahead, not behind, none without a rail;
- the kings up where the flight looks: over 70% against a blind plan's
  third, and each king in most viewings;
- the named king standing through his line for sixty seeds;
- glances inside their visits, never while named, at the figure's
  curiosity;
- a head turned to the lens during a line and back at rest after, played
  through the layer;
- every figure with a head has a pivot of its own;
- the omen list against its registry;
- every reaction in the film for thirty seeds before its arrival, from a
  witness that answers to it, never cutting a line, the cranes scattering
  before a king in a third or more of Huangshan viewings;
- the scatter keeping its own way until it reacts, leaving the picture
  away from the danger with its head round to it first;
- the look taking only the head;
- rarity and a figure that always comes.

The helper that fitted the heads checked each one turns about its pivot
with +z as its rest forward.

## F115 — The film watched as a viewer: the rail's corners turned, a chapter played again from its start, 27 September 2026

**Asked.** Use the film in the browser as a viewer would, and watch for
defects and bugs.

**How it was watched.** The dev server in the desktop app's browser pane,
1027 × 774. The whole film end to end with the cast on (seed 2357475547),
the end card, the credits page, the keys, the chapter bar, the address's
chapters, a phone held upright and on its side (375 × 812, 740 × 360,
touch). An in-page logger read the clock, the caption, the cast's line,
the camera's heading and its height over the ground, and every figure's
place in the picture, five to ten times a second; a second one read a
single figure every frame.

**Fixed.**

- *The rail turned its corners in one frame.* A rail is straight lines
  between its keys, and the camera's heading was the heading of the line
  it was on, so at every key the picture swung through the whole corner
  between two frames: 74° over Huangshan's cloud sea at 50.2 s (the empty
  sea, then the sun and a new range of peaks), 81° in the Three Gorges at
  14.3 s, 104° into Tiger Leaping Gorge at 81.3 s, 42° over the Karst at
  77.1 s, and 30 corners of 5° or more in the Loess's first two minutes.
  Found by the cast: Guanyin, held in the picture through her line, slid
  out of it and back in 0.4 s, because the camera had turned 42° in a
  frame and the cast's frame follows it 0.8 s late. `railAtKm` now takes
  the heading from the rail's chord across `TURN_S` = 5 s of authored
  flight, half behind and half ahead: the line's own heading on a straight,
  and through a corner a turn that starts 2.5 s before the key and ends
  2.5 s after. The camera stays on the line; only where it looks turns.
  Flown at 60 fps, no frame now turns more than 0.49° (the First Bend and
  the Loess) and no second more than 29°; 4 s turned the First Bend's
  corner at 36° a second, 6 s left the Loess looking more than 15° off
  its line for 16 s. The rails report is no worse for it: ground ahead at
  Huangshan 2 → 1% (worst 161 → 143 m), the Gorges' worst 275 → 228 m,
  the First Bend's 10 → 0 m. The stations were cut again: at 60 s
  Huangshan's heading moved 12.7°, the Loess's 6.1°, the Gorges' 4.6°.
  The two stills taken at a moved heading were taken again (`npm run
  stills three-gorges loess`, then `npm run cover`): the Gorges pans a
  few degrees left, and the Loess about six and some 60 m higher, since
  the altitude controller looks ahead along the new heading, so its dust
  reads a little thicker. The Huangshan still (20 s) moves 0.6° and its
  card (8 s) 0.9°, and are left.
- *A chapter played again flew on from where it was.* The frame starts a
  scene only when the clock crosses into another, so the chapter already
  on screen, asked for again by its segment, its number or the end card's
  list, got its title card back and a clock at nought while the camera
  flew on: pressed at 48 s into Huangshan it was at km 72 of 89; the Wall
  chosen from the end card came back on the Nepal side, km 168 of 272,
  lost its `#the-wall`, and the cast of the second it left stood over the
  title card. `goToChapter` starts the scene again when it is the one on
  screen; the chapter keys, the bar, the end card, Watch again and
  `__ns.jumpTo` all go through it.

**Seen and left.**

- The credits page says both "No sound is licensed yet" and, from
  `NOTICE.md`'s *Music and sound*, "Nine cues, one a scene, and a bed of
  wind, each licensed or commissioned". The notice is written for the
  launch; until the sound comes it contradicts the page above it.
- The cast's lines, warm italic over a halo, are faint on pale ground:
  the Loess's haze, the Taklamakan, the Roof's tan, the Wall's snow. The
  captions hold up better. The keys' labels at the top left are grey on a
  pale sky.
- Speed changes at a key in one frame, as the heading did: the Grassland
  550 → 300 → 140 → 60 → 30 → 25 km/min from 78.6 to 109.3 s, the Wall
  150 → 60 → 40 → 50. These are authored slowings; easing them would move
  every caption, line and cue timed at the authored speed.
- One of the kings' risings in this viewing was behind the camera the
  whole time (the one in six D93 lets go by).
- `__ns.hold` twice leaves the clock at the lead-in (its `advance` is
  ignored once the first hold has paused it). The held frame is right;
  P after it plays the scene from its title. Dev only.
- Checked and sound: every title card (one that looked missing was a
  screenshot taken late), Heaven Lake in the frame from 108 s, every cast
  line with its figure in the picture, the scatter before the South King,
  the portrait prompt, the landscape phone card beside its map, the touch
  buttons, the address's chapters, the credits page's way back.

**Checked.** `npm run check`: 523 tests, three new in
`test/film/rail.test.ts` (the heading is the line's own on a straight,
turns through a corner with no frame over a degree and halfway round at
the key, and the camera stays on the line). Played again in the pane: the
Gorges' first 20 s turn −25° → −75° → −25° → −103° with no frame over
half a degree; Huangshan pressed again at 21 s starts at km 0 and is at
km 1.10 three seconds into the flight (1.10 by the clock); the Wall from
the end card starts at km 0 under `#the-wall`.

## F116 — The cast painted: pictures in place of the figures made in code (D94), 27 and 28 September 2026

**Asked.** The fantasy animals look childish, "even child animation has
better designs", with a photoreal, cinematic Wukong as the bar; images
through the user's OpenAI key, $25 then $30 at most. Then, the pilot seen:
"It's way better. proceed".

**How they are made.** Safata, the user's local agent, has no image tool
(0.1.4: its tools are text, files, search, charts and decks; asked on
three models, $0.03), so `npm run paint` calls OpenAI's image API itself,
keyed by `.keys/openai`, which git ignores. A brief per figure in
`content/paintings/` gives the figure and a pose per view; `_style.yaml`
wraps every one: film concept art, not children's illustration;
transparent ground; soft dawn light that sits under any sun; a strong
silhouette; a beast bare unless it is said to wear something; the
novels' and temples' designs (Wukong wears the crown and plumes of the
havoc years, not the fillet of *Black Myth*); living faiths by their
mounts, seats and flags. Four drafts a view at `high` (gpt-image-2.5
Flare, $0.043 a picture at 1024×1536 or 1536×1024), one chosen by hand,
cut to its figure and written as WebP with its alpha by `python -m
nineskies.paintings keep` into `app/public/cast/`. The dragons are one
family: the East King drawn first, the other kings, the White Dragon and
the Jing River's king drawn from his picture with Sunburst, same pose and
design in their colours. 26 views of 20 figures, 9.5 MB; 110 pictures
made in all, $4.78, every call in `docs/paint-ledger.jsonl`.

The image model dressed animals of its own accord: all four tigers, Pengs
and qilins came with harness, saddles or bells, and the turtle with the
pilgrims' luggage roped to his shell. The rule that a beast is bare
unless it is said to wear something redrew them clean. Nezha came back
two drafts of four, the rest four.

**How they are drawn.** `engine/src/cast/painting.ts`: a card upright and
turned to the camera about the figure's origin, its feet for one that
stands or walks, its middle for one that flies. A view says where the
feet are and what a cue's size measures, as the figure made in code did:
feet to crown for one that stands, nose to tail or wingtip to wingtip
across the picture for the rest. `paintings/<figure>.ts` registers a view
per variant; a variant without one (the dragon lying twenty kilometres
along the Flaming Mountains) and a film asked `?paint=off` are drawn by
the figure made in code (`madeBuilder`), which stays. The flocks and the
wind horses stay made in code.

- *The world is left-handed and the grade turns the picture round at the
  end (F100).* A picture laid in it reads mirrored, so the card is
  mirrored once more: at `scale.x < 0` a painting is as painted.
- *A figure faces the way it goes.* Every painting faces right; the card
  mirrors when its figure heads left across the picture, not within
  `MIRROR_AT` of straight at the camera, and swings round through edge
  on over `TURN_S` = 0.4 s rather than jumping. A hovering figure turns:
  Wukong over Huangshan swung from −86° to 164° at 32.3 s.
- *The card writes its depth.* Without it the cloud sea, drawn after the
  figures without writing its own, painted over their lower halves.
- *The scene's light tints it.* Sun and sky in the shares a matte face
  takes them, over their sum at the First Bend's noon channel by channel,
  four fifths of the way: noon as painted, Huangshan's dawn (0.86, 0.74,
  0.58) before that, Turpan's sunset deep orange.
- *A close pass is held to the picture.* `heldTo` shrinks a card to fill
  at most 0.5 rad of the view's height and 1.1 of its width; the Karst
  elephant came to 124 m of the lens at 28 s and would have filled 61%
  of the frame's height.

**Found on the way: pictures uploaded upside down.** Some cards drew
upside down, and not the same ones from run to run: the pilgrims over the
Karst in one, Sanduo's horse at the First Bend in every run. Upright in
the world by their matrices, upside down squeezed to 40% and wholly in
front of the lens: the texture itself. `terrain/colourLayers.ts` set
`UNPACK_FLIP_Y_WEBGL` and `UNPACK_PREMULTIPLY_ALPHA_WEBGL` off with raw
`gl.pixelStorei`; three r186 remembers what it last set and skips setting
it again, so a picture uploaded after a terrain tile, which three believed
it had flipped already, went up unflipped and unpremultiplied. It now
sets them through `renderer.state.pixelStorei`. Nothing showed it before:
no texture of the film's asked for the flip.

**Staged.** At the scenes' sizes the paintings were 30 to 110 px high at
their lines (Wukong over Huangshan 101, Nezha 45, the tiger 45, the
Wall's pilgrims 46), and at that size the old toys' flat colours read
better than a painting's detail. Each painted companion is sized for about
a quarter of the frame at its authored offset, where the director holds
it through its line: 190 px high for one that stands, 330 wide for a
beast, 300 for a bird, 460 for a company, never more than four times its
old size (Nezha over Huangshan 60 → 240 m, the Karst pilgrims 220 → 700,
the Turpan immortals 520 → 1300). The monuments were large enough.

A companion on its own way now keeps out of the picture from two seconds
before another figure's line to one after it (`LINE_ALONE_S`): at the
Karst the elephant, a quarter of the frame, crossed in front of the
pilgrims through theirs.

**Seen.** All nine scenes played headless at each line, seeds 7 and 1
(for the phoenix, Jingwei and the Peng, which some viewings never see):
the kings on Huangshan's cloud sea, the White Dragon before the Gorges'
wall, Yao Ji over the Wu Gorge, the elephant and the pilgrims over the
towers, the tiger in Tiger Leaping Gorge, Sanduo's horse, the monk
leaving Chang'an over the Loess, the Jing River king in dust, the carp,
the magpie at Heaven Lake, the Queen Mother, Nezha, the Bull Demon King,
the Eight Immortals and the Flowing Sands in Turpan's evening, the qilin
and the turtle on the Roof, the tigress before the Wall and the last
crossing over it.

**Left.**

- The dragon lying along the Flaming Mountains is still the red lantern
  serpent made in code, and beside the paintings it is the toy the rest
  were. A card cannot lie along a range; it wants a painting laid on the
  ground or a view the rail sees side on.
- A painting does not move its parts: no wingbeat, no head turned to the
  lens or to what is coming (`heads` is empty), no somersault. It glides
  on its motion and swings round to turn.
- A seed can still stand one figure in front of another outside a line:
  over Huangshan at 67 s (seed 7) Wukong stood before the South King as
  he surfaced.
- `?paint=off` draws the toys at the new sizes, up to four times what
  they were.

**Checked.** `npm run check`: 535 tests, twelve new: the painting's view,
size, mirror, light, hold, registration and fall-back to the figure made
in code, and every registered picture on disk (`test/cast/painting.test.ts`,
11); and that a passing companion keeps out of every line, for every
seed the director is tested on (`test/cast/motion.test.ts`). The film
validates.

## F117 — The sky given weather, the cloud sea rebuilt, the air blued, the rivers darkened (D95), 28 September 2026

**Asked.** "Go through the app as a real user … improve the visuals. We
want to make the app great", with the OpenAI key for pictures and $30 at
most.

**Seen.** The film watched in the browser pane at 800 × 600, each chapter
for its first half minute, keys 1 to 9 between them. What read worst, in
order of how much of the film it spoils:

- Every sky was the gradient and the glow and nothing else: no scene had
  a cloud over it (Grassland and the Wall had a faint cirrus of value
  noise). The sky is a third to a half of most frames.
- Huangshan, the first thing seen, lay over a flat grey fuzz: the cloud
  sea was value noise on a plane, streaked by perspective, with dark
  blots where it thinned and hills cut off by it along a hard line.
- The rivers were sheets of pale sky-blue: the Jinsha at the First Bend a
  flat cyan wedge from above, the Yangtze in the gorges the colour of the
  open sky though it runs between walls.
- Captions and the cast's lines, cream and gold, were faint on the cloud
  sea and on pale ground.
- Wukong's somersault cloud, and every painting's soft edge, was ringed
  in dark.

**The sky.** `engine/src/look/clouds.ts` draws a layer from a painted map.
Four maps (`content/clouds/`: cumulus, cirrus, the cloud sea, a mackerel
sky) were painted by the cast's image model, two drafts each, as
satellite views of cloud over a black ocean with no light of their own;
`npm run paint` gained `--set` for a folder of briefs and a style's
`background: opaque`. `python -m nineskies.cloudmaps keep` levels a
picture and makes it tile: the picture joined to itself rolled half a
side along the cheapest cut through a band at each edge (image quilting).
Averaging the two had left grey ghosts over the cumulus; joining them by
the brighter had cut clouds off at the band. The shader reads the map
twice (once 3.7 × finer, fraying the edges), moves its threshold by a slow
noise so a tiled map never repeats a sky, and lights it: from below, the
sky's light on a base that darkens as it thickens, the sun through it by
Beer's law, a sunward edge brighter than a lee one, and the silver lining
of thin cloud towards the sun (Henyey-Greenstein, g 0.65); from above, the
map as the height of billows the sun rakes, the lee of each paled, the
relief going smooth with distance.

A first pass drew every sky as popcorn. The layer's height over the
camera is drawn at the scene's exaggeration and its map was not, so a
heap two kilometres up looked twelve up and a sixth of its size; the map
is now spread by the exaggeration too. A second bug: a map already loaded
answered at once, before the layer knew which map it wanted, and was
dropped, so a scene whose map an earlier one had loaded drew no cloud
(Grassland, the Roof, the Wall when held after others).

`CloudPreset` is now `{ mist, layers }`. Cumulus over the Gorges (3,400
m, with cirrus), the Karst (2,600), the First Bend (6,600), Grassland
(3,600, with cirrus) and the Roof (7,400); cirrus in the Loess's dust,
over Turpan's evening and at the Wall (10,500 m); Huangshan's cloud sea
under a mackerel sky at 5,200 m. The First Bend, Turpan and the Roof had
`cloud: none` and name new presets. A test holds every sky layer 300 m
over the highest the camera flies in `docs/rails-report.md` (the Wall's
9,904 m under cirrus at 10,500), and every map to a file on disk.

**The cloud sea.** Drawn from the painted map at a scale of 9 km, with a
veil: where the map is thin the deck is thin cloud (0.8 opaque), not a
hole. The ground meets it softly: a deck's `contactM` (90 m) pales ground
from 90 m over the deck's top down, and everything under it, towards the
cloud's own colour, by the ground's height and not along the sight line,
so a range forty kilometres off is not whitened. A mist slab with a tail
was tried first: it washed out every distant peak.

**The air.** The haze takes blue first (`airFog` in `SKY_GLSL`: the
haze's share per channel as 1 − (1 − fog)^k, k mixed toward 0.72 / 0.96 /
1.34 by the sky preset's `blue`), so far ridges step back in blue before
the horizon's white. The terrain and the horizon ring use the same
function, so where one hands to the other is still one colour. Clean air
0.6 to 0.8, the dust 0.1, Turpan 0.15.

**The water.** A river's reflection is its valley's walls (the ground's
own colour in shade) until the reflected ray climbs clear, a lake's a
little, the sea's not at all; a second, finer ripple; the body varies
with a drifting silt noise; and the rivers' colours are rivers': the
Jinsha silty khaki (0.40, 0.39, 0.31), the Yangtze in the gorges grey-green
(0.30, 0.38, 0.34), the Li jade (0.26, 0.42, 0.36), the default grey-green
(0.32, 0.42, 0.42) where it had been sky-blue (0.42, 0.66, 0.84).

**The cards.** A painting's texture is premultiplied as it uploads, and
the material premultiplied it again, so every half-clear pixel was
darkened by its own alpha twice. It now blends ONE, ONE_MINUS_SRC_ALPHA
with the material's own premultiplying off: Wukong's cloud is white to
its last wisp.

**The words.** A soft shade behind a caption and a cast's line (a blurred
radial gradient, 0.42 at its middle). The loading card has a painting
behind the name: Huangshan's peaks over a sea of cloud in ink on dark
silk, one of four drafts (`content/art/`, kept by `python -m
nineskies.art keep` to `app/public/art/title.webp`, 216 KB), fading in and
drifting slowly larger while the real ground loads; still under
`prefers-reduced-motion`.

**Cost.** Eight cloud maps and four title paintings, $0.60; the ledger
stands at $5.38 of its $30. The frame cost, headless on the M3 at 1080p:
every station 4.8 to 7.9 ms against the 33.3 ms frame; the clouds, priced
by absence, are inside the instrument's ±1 ms spread at every station
but the Gorges, where two layers may cost 1.6 ms.

**Stills.** All nine retaken with `npm run stills`, and the cover's two
frames and the cover redrawn: they need sign-off (D77).

**Left.**

- Water reflects the sky without its cloud: a lake at a low angle under
  a sky of cumulus mirrors a clear one (the Roof's Qinghai Lake).
- The cloud sea from low over it still reads a little like snow in its
  middle distance, the lee shade a pattern of blue flecks.
- Cloud layers are planes: no cumulus stands up in profile at the
  horizon, and the Roof's clouds at 7,400 m are flat undersides.
- The Roof's and the Wall's terrain in low sun shines like crumpled foil;
  Qinghai Lake carries a paler band across it; both were there before.

**Checked.** `npm run check`: 538 tests (three new: the maps on disk and
every layer's numbers, the layers over the rails report's altitudes, the
air's `blue` bluer in clean air than in dust), the film validates;
`nineskies.cloudmaps`'s cut wraps on both axes, keeps the middle as
painted and levels clear to 0 and thick to 1 (`test_cloudmaps.py`, 3).
Every scene seen before and after, headless, at the same held seconds.


## F118 — The dragons alive: a painting's body swims as it goes (D96), 28 September 2026

**Asked.** "Biggest feature request, think from first principles, how can
we make the fantasy animal 'alive' meaning moving like animated, not like
a flying picture, think a lot"; then, on the answer, "yes, start with the
dragon".

**Why a card reads as a picture.** What makes a thing look alive, most
telling first: its parts move against each other (a dozen lit joints are a
walking man); that movement answers its travel (a bird bobs with its
downstroke, beats harder climbing and glides diving; a stride keeps pace
with the ground); loose parts lag and settle; the body turns along its
path; it touches the world (cloud churns under it); it means something
(goes somewhere, looks). The cast had the last from its director and
omens (D92, D93) and none of the rest: a painted card glides, always
upright, and nothing in it moves.

**Not a video model.** Animating each painting into a loop was the first
thought, and it is not to be had: OpenAI shut down Sora 2 and its Videos
API on 24 September 2026 (the models endpoint gives `shutdown_date`), and
an open model does not run on this M3 with 8 GB. A loop would anyway keep
its own tempo whatever the figure's path does, show one side only, and need
a matte cut from every frame.

**Bending the painting.** Tried first in numpy on the East King's picture
over the Huangshan still: a wave along his traced midline, the mane
stirring, the painted cloud churning, a gentle bob. It read as swimming,
with no tearing where the coils pass close, so it was built:

- `life.ts`, the cast's seventh plug axis: `LIFE_KINDS`, `registerLife`, a
  `Body` (the mesh at rest in the picture's pixels, and what the picture
  shows about each vertex once read), a `Stride` (effort and climb); four
  modules in `life/`, one file each. `serpent`: a wave down the midline
  from head to tail, little at the head and growing to the tail, blended
  between the four nearest stretches of midline so coils go their own ways;
  everything within `reach` goes with the body (legs, fins, the cloud about
  the coils), the rest only rises and falls with it; quicker and deeper
  the harder it works (0.28 waves a second hovering, 0.45 keeping pace).
  `flutter`: loose parts in circles about a root, stirring more the
  further they reach, stiff circles kept still (antlers, the face).
  `churn`: cloud found by its colour (grey and pale) once the picture has
  loaded, boiling in eddies, spared where named. `pitch`: the picture
  turned about the figure's origin to its path's climb, a moment late,
  last since it turns what the others moved.
- A view names its lives and its `pixels`; `registerPainting` checks each
  rig with its module. A living view's card is a grid 64 cells across
  (about 24 pixels a cell) instead of two triangles, bent on the CPU each
  frame; a view without lives is the card it was.
- The layer hands each figure its `pace`: its own path read 0.2 s either
  side of now, as body lengths a second through the picture (a companion)
  or over the ground (a monument), and whether it keeps pace with the
  flight. Effort is 0.35 standing, 1 keeping pace, one more for each
  length a second, at most 2. A monument's surfacing reads 0.15 to 0.2
  lengths a second, its hover 0.02; Wukong crossing 3.7. The first pace
  read nought throughout: the surfacing motion hands every pose the same
  `world` object, so a pose read later overwrote the one read before;
  poses are now copied to plain numbers at once (`spotOf`) and the path
  read again at now.
- Climb is the pitch the motion gave the figure's group, which the card,
  turned to the eye, never showed.

**The dragons' rig.** Traced on the East King: 26 points of midline from
his head down the neck, round the lower coil, over the arch, down to the
hind legs, up over the left coil and down to the tuft (radius 70, reach
320 pixels); his mane, beard and whiskers about a still head and antlers;
the tuft; his cloud (grey under 0.15), never on his body (circles along
the midline) or his head. The five others were drawn from his picture, so
his rig serves each, moved to where the figure lies in it, fitted by
silhouette: overlaps 0.87 to 0.96, offsets 0 to 15 pixels, no scale. Only
their cloud differs: the Western King's silver and the White Dragon's
pearl are nearly cloud's grey, so their cloud must be brighter (0.86,
0.8); the Jing River King's dust is loess-coloured (grey under 0.55).

**Seen.** Headless, the four kings at Huangshan held and played, the White
Dragon in the gorges, the Jing River King over the Loess: the coils swell
and pass, the tuft and mane stir, the cloud turns over, the body noses up
as it surfaces. At the film's sizes (a king is 200 to 470 pixels across)
the swim is plain and never rubbery.

**Cost.** About 0.2 ms of the main thread a living dragon a frame on the
M3 (serpent 0.03 to 0.05 ms, churn 0.04 to 0.09, each flutter 0.02 to
0.03, pitch 0.01; a wave's sine taken once per vertex at build, so a frame
is two products). Three dragons in the picture at Huangshan: about 0.6
ms. 5,376 triangles a dragon where it was 2. No paint spent: the ledger
stands at $5.38 of $30.

**Left.** The rest of the cast, on the same axis: the birds (wings hinged
as plates at the shoulder, flap to climb and glide to dive; the flank
under a near wing painted in, about $0.07 each), the walkers (legs cut
below the body, the far pair the near pair darkened and out of step), the
turtle's flippers, the carp's tail, the people's plumes, sashes and
sleeves. A wake of cloud shed behind a cloud-rider. A card cannot turn in
depth, so an animated figure should not reverse in view: the director's
to learn.

**Checked.** `npm run check`: 556 tests (18 new in `test/cast/life.test.ts`:
the list and the modules agree; a serpent swims more at the tail, carries
only what is within reach, sends its wave toward the tail and quickens
with effort; loose parts stir from their root and not where stiff; cloud
is found by colour, churns only once read, and is spared; a flier noses
up whichever way it faces and follows its climb late and no further than
its most; pace through the picture and over the ground, none between two
kinds of place, copied at once; a living painting bends its card and a
still one stays two triangles, and a living view without its pixels or
with a rig off its picture is refused), and the film validates.


## F119 — The birds alive: wings that beat, glide and bank the body (D96), 28 September 2026

**Asked.** "yes, go on to the birds", after F118's dragons.

**The idea.** The phoenix, the Peng, the magpie and Jingwei were each
painted in three-quarter view with a near wing raised up and back from
the bird's back and a far wing spread from behind the breast. A wing is
cut from the picture along the line where it leaves the body, over sky,
and drawn as a part of its own: the near one in front of the body, the far
one behind. It turns about that line as a plate turns about an edge seen
from the side, reaching further or less far across it and, past it,
showing its other side. Since the hinge is the seam, what a wing uncovers
is sky, and the body behind it is the body as painted: the flank-painting
F118 expected ($0.07 a bird) was not needed.

**Built.**

- `Layer` in `life.ts`: a part's outline, feathered across its seam; a
  life module may name the layers it moves (`layers(rig)`). The card lays
  its grid once for the picture and again for each part, each vertex
  carrying its layer's share as a premultiplied vertex colour, the parts
  behind drawn first and those in front last, and a cell no layer shows
  not drawn. Of two layers laid one over the other, the lower is whole
  across their seam and only the upper feathered: split between them, a
  seam pixel's coverage came to three quarters and a pale line ran along
  every wing root.
- `life/flap.ts`: a wing's reach across its hinge, as a share of how it
  is painted, at the top of the stroke, at the bottom, and gliding. The
  downstroke takes 55 per cent of a beat; the tip lags the root by 0.15 of
  a beat, so the wing bends through each turn; the body rises through each
  downstroke. It glides down any dive steeper than 0.12 rad and beats up
  any climb over 0.08; otherwise it beats on, or in bursts with glides
  between. Quicker the harder it works.
- `serpent` gained `bob`, nought for a streamer that swims on a body that
  does not: the phoenix's five plumes each swim from their root.

**The birds.** The magpie's bounding flight: four beats at 3 a second and
half a second's glide, the near wing swung down over the body at the
bottom, the far one folded up behind it at the top, the tail's end
stirring. Jingwei, a crow's steady 2 a second. The Peng soars: two beats
at 0.45 a second and five seconds' glide with its wings held high, beating
whenever it climbs; its far wing turns about a line along the body at the
breast, so it rises over the neck; its crest streams. The phoenix, 0.7 a
second, both wings raised at the top; its near wing comes down only to
edge on, since at that pace a wing swung over the body is long in view
and muddles it; five plumes, a beaded crest.

**Seen.** A lab in headless Chrome: the page's own modules imported by the
URLs the app loaded them at (Vite stamps them, and another stamp is
another registry), one figure built and flown in front of the lens with a
chosen climb and pace, recorded with CDP's screencast at about 60 frames a
second. Then each bird in its scene as the film plays (seed 1 casts the
phoenix, the Peng and Jingwei, which come by chance; seed 7 casts none of
them). The Peng's near wing at first came down nearly flat to its back and
it read one-winged for a moment: its stroke now stops at 0.3.

**Cost.** A winged bird is its grid three times over, about 8,500
vertices and 6,000 triangles; its lives cost 0.11 to 0.26 ms of the main
thread a frame on the M3 (the phoenix's flap 0.12, each plume 0.03). No
paint spent: $5.38 of $30.

**Left.** The walkers, the turtle, the carp and the people, as F118 lists.
The card's swing round when a figure turns the other way is still a
picture's (the Peng seen edge on as it overtakes); animated figures should
not reverse in view.

**Checked.** `npm run check`: 563 tests (7 new: a stroke's halves, a
wing's reach at top, bottom and glide, a near part in front and a far one
behind, wings moving about their hinges while the picture only bobs,
gliding down a dive, beating up a climb and resting between bursts, a
rig refused a one-point hinge, a reach past a wing's or a burst without
its rest, and a winged card drawing its wings again less the picture's
cells under them), and the film validates.


## F120 — The walkers alive: legs that stride, clouds that are trodden (D96), 28 September 2026

**Asked.** "Yes, go on", to the walkers after F119's birds.

**The idea.** The six walkers, the tiger, the qilin, the elephant of
heaven, the Bull Demon King, Sanduo's horse and Miyolangsangma's tigress,
were each painted from the side in mid-stride with a puff of cloud under
every foot (the bull wades a bank of it). Below the body a leg is a limb
over sky, so like a wing it can be drawn on its own and turned: about its
hip or shoulder, back at an even pace while its foot bears the body and
forward while it is lifted, its lower leg folding back at the knee or hock
as it lifts. The four come down a quarter of a stride apart in a walk's
order, near hind, near fore, far hind, far fore. The body rises over each
leg as it passes under, hindquarters and forequarters in turn, so the
back rocks, and the head nods. The puff under a foot is carried level with
it rather than turned with the leg, and pressed flat as the foot comes
down: the cloud is trodden. No paint.

**Built.**

- `life/gait.ts`, the life of a walker. A leg is traced as its hip, knee
  and foot, its thickness, the circles of the cloud under it, and where in
  its swing the painting caught it (-1 all the way back to 1 forward), so
  it swings through its stride about its painted pose and never past it.
  Back through the stance, 60 per cent of a stride, at an even pace; then
  forward on a cubic whose ends run at that pace, so the leg never jerks
  where the foot leaves or meets the cloud. Strides quicken and lengthen
  with effort.
- Each leg is a layer, the far ones behind the body and the near in
  front, shaped by its line and its circles (`Layer` gained `bands` and
  `circles` beside the wings' outlines). A first try bent the one mesh:
  where two puffs nearly touch (the qilin's far feet stand 20 px apart)
  the wisps between them smeared into comet tails as the feet parted. As
  layers, legs and their clouds pass over one another. The body about a
  hip goes with its leg as far as the layer's seam, so the seam never
  shows.
- A far leg's layer is drawn whole a little past its edge, as the lower of
  two layers is, so its cloud circles are drawn in by its feather's width
  or it carries off a sliver of the next foot's cloud.
- Two faults of the card the legs showed up, both the wings' as well:
  - Where the picture was cut away at one corner of a mesh cell and the
    part over it feathered at another, the sky showed through the cell:
    pale holes in the qilin's flank. The upper layer is now whole at all
    four corners of any cell where the lower is cut.
  - The picture and its parts lie in one plane and the card writes depth,
    so a part and the picture under it fought pixel by pixel for which was
    nearer: speckles. The far parts, the picture and the near parts are now
    three draws, the far held back and the near forward by a polygon
    offset.
- `churn` gained `within`, the circles its cloud lies in, so the white
  horse's and the white bull's coats do not boil. Churn, flutter and
  serpent now reckon a point once and move it alike in every layer: a
  walker is its grid five times over, and churning every copy had cost
  the horse 0.12 ms a frame.
- A named figure no longer turns its back on its own way across the
  picture (`facingAlong` in `motion.ts`). At the First Bend the tiger
  crossed right, then, pausing for its line, turned to its cue's 250°, to
  the left: the card swung edge-on in view and the tiger walked backwards
  while it drifted on to the right. An author's facing that points back
  across the picture against the figure's way is now mirrored across the
  line of sight: turned toward the lens or away as the author set it, on
  the side the figure goes. It was the flying picture's fault too, but a
  figure that walks shows it.

**The walkers.** The tiger prowls at 0.6 strides a second, its far
forepaw, tucked behind the near one, carried with it; its tail swings.
The qilin steps high (its lower legs fold 0.5 rad), its mane, beard and
long whisker stirring, the flames at its hocks carried with its legs, its
antlers still. The elephant walks slow and short (0.4 a second, legs
swinging 0.12 rad), its trunk swaying as a serpent, its ear stirring, its
tail swinging the tassel. The bull strides heavily, head tossing, legs
wading the bank of cloud, which boils about them; the tail lashes, the
sash's end stirs, and the burning wheel swings on its horn. Sanduo's
horse walks proudly, knees high and head nodding, the pennant flying from
the spear and the long tail streaming; only its puffs churn. The tigress
walks unhurried, her back rocking under the bowl, her tail swinging its
curled tip.

**Seen.** The lab again (F119), each walker alone against open sky, and
at twice the pixel density with the frame clipped to the figure, since
the painting's size cap holds it to a share of the view, too small to
judge a hoof. Then each in its own scene as the film plays: the elephant
over the Karst (8 s), the tiger (64 s) and the horse (92 s) at the First
Bend, the bull Below the Sea (47 s), the tigress at the Wall (36 s), all
with seed 1, and the qilin on the Roof (77 s) with seed 7, since seed 1
does not cast it. Each goes the way it faces. What is left: in a
frame or two of the qilin's stride, two specks of cloud a few pixels
across where its far feet part.

**Cost.** A walker is its grid five times over, 11,000 to 19,500
vertices and 6,400 to 9,000 triangles; its lives cost 0.13 to 0.21 ms of
the main thread a frame on the M3 (the horse most, with its pennant and
tail). Reckoning each point once took the phoenix to 0.20 ms. No paint
spent: $5.38 of $30.

**Left.** The turtle's flippers, the carp's tail and the people's loose
clothes, as F118 lists; a wake of cloud where a foot or a wing presses.
A figure turning round on its own path, not only for its line (the
Peng's overtake, F119), still swings its card edge-on.

**Checked.** `npm run check`: 571 tests (8 new: a stride's order, its
even stance and its unjerking swing and lift; legs as parts of their
own, the far behind and the near in front, a far leg's cloud drawn in;
feet swinging about their hips half a stride apart, the hip still; a
cloud carried level and pressed; the walk mirrored for a beast facing
left; a rig refused two legs for a foot, a leg painted past its swing or
a swing past a leg's; a walker's card in three draws; and a named
figure's facing kept to the side it goes), two tests extended (a winged
card whole over every cell of the picture it cuts; a named figure turned
as the author turned it or that mirrored), and the film validates.

## F121 — The people alive, the seat, the turtle and the carp (D96), 29 September 2026

**Asked.** "Proceed", to the people and Guanyin's seat, then the turtle
and the carp, after F120's walkers.

**The idea.** A person painted standing on a cloud has little that moves
on its own but what the air moves: hair, ribbons, sleeves, tatters, the
tassels of a crown, and the cloud itself. Those were F118's `flutter` and
`churn` already, rigged on each picture. What a person adds is balance:
one standing on a cloud as on a boat leans a little over their feet one
way and the other, never in time, and one walking rises over each step.
The turtle rows the air with a river turtle's stroke, which is its walk:
each flipper back slowly while it pulls and forward quickly while it
returns, in a walk's order, so it is F120's `gait` with flippers for
legs. The carp is F118's serpent: a wave from its head to its tail,
which beats. No paint.

**Built.**

- `life/sway.ts`, a new kind of life. The rig is where the feet are,
  how high the crown, and how far it leans. The picture turns about the
  feet, the turn growing from nothing at the knees to all of it at the
  crown, so what they stand on keeps still; two slow sways out of step
  make the lean, so it never ticks. A walker's rig adds steps a second and
  a rise, and the body rises over each step, twice a stride, its feet
  kept where they are painted.
- A picture of several (`Who` in `life.ts`): the Eight Immortals abreast,
  the pilgrims on their road, the Queen Mother's three birds. A life names
  whose it is and the circles of the picture that are them, so each
  immortal keeps their own balance, each bird bobs on its own beat, and
  each walker's legs are their own layers (`sha:leg-near-hind`). A view
  whose lives name two parts alike is refused when it is registered.
- `flutter` gained `pace`, how many times quicker than cloth it stirs:
  flames lick. Nezha's wheels and spear point burn at four times.
- The card now holds only the vertices a drawn cell uses, since it is
  sent to the GPU whole each frame and most of a wing's or a leg's grid is
  sky. The lives still move the whole grid. The Queen Mother, four grids
  of 6,800 vertices, went from 0.76 to 0.31 ms a frame; Sanduo's horse
  from 0.47 to 0.34; every layered figure gains.

**The figures.**

- Wukong leans over his cloud; the two long pheasant plumes of his crown
  stream and stir, his red tatters flutter, the somersault cloud boils.
  The staff on his shoulder keeps still where a plume passes it.
- Nezha leans on his wheels; the red sash loops and streams, his hair
  ribbons and the lotus-leaf skirt stir, the fire of the wheels and the
  spear's point licks, and he noses into a climb.
- The Queen Mother stands almost still; her crown's jade pendants and her
  sleeves stir, her cloud boils, and her three blue birds beat their
  raised wings out of step, tails streaming.
- Yao Ji leans over her cloud; the long white ribbon streams and loops,
  her hair lifts, her sleeves and hem stir.
- Guanyin's seat keeps still, as the living faiths do (`LIVING_FAITHS`):
  the white parrot beats its raised wing over it, the willow in the vase
  sways, and only the cloud under the throne boils.
- The monk alone: the white horse walks as Sanduo's does, each hoof's
  puff of cloud carried and pressed; its head nods, tail swings, mane and
  harness tassels stir.
- The pilgrims on the road: Sha and Bajie each rise over their own steps
  and keep their own balance, their hems swinging; the horse strides with
  its near foreleg, nods, and its back rises under the monk; the road of
  cloud boils. Their feet are painted in the road, so a leg drawn on its
  own would leave a hole in the cloud where it was; only the horse's
  foreleg, clear of it, strides.
- The Eight Immortals each keep their own balance on their own cloud;
  He Xiangu's ribbons stir, and the clouds boil, sparing Zhang Guolao's
  white donkey.
- The turtle rows, three flippers in a walk's order; his head nods with
  the stroke, the moss stirs, and he noses into a climb. The thin far
  hind flipper lies behind the near one, and moving both drew the near
  one's edge again as a ghost when it swung away, so it keeps still with
  the shell.
- The carp swims up out of its spray, its body sending a wave to its
  great tail; its fins and barbels stir, the spray boils.

**Seen.** Each alone in the lab at twice the pixel density, frame by
frame and as a map of what moved, then in its scene as the film plays
with seed 1: Wukong (33 s) and Nezha (64 s) at Huangshan, Yao Ji in the
Three Gorges (81 s), the pilgrims (28 s) and Guanyin (74 s) over the
Karst, the monk (25 s) and the carp (63 s) over the Loess, the Queen
Mother (21 s) and the Eight Immortals (53 s) Below the Sea, the turtle on
the Roof (85 s). The birds' and the parrot's wings first left their
feather tips behind as specks: a wing's outline is feathered, so it must
lie a feather's half-width past the feathers, over sky. Grown by 12 px
and feathered over 14 px, they are clean.

**Cost.** 0.08 to 0.33 ms of the main thread a frame on the M3, measured
in the lab (the Eight Immortals least, their picture being low; the monk's
horse most). No paint spent: $5.38 of $30.

**Left.** A wake of cloud where a foot or a wing presses. A figure
turning round on its own path still swings its card edge-on (F119). The
pilgrims' own feet do not step, and the Queen Mother's birds and the
parrot beat only their raised wings.

**Checked.** `npm run check`: 580 tests (9 new: flames quicker than
cloth; a sway that leans the crown within its rig over still feet, turns
about them, never ticks, and rises twice a stride over still feet if it
walks, and refuses a rig it cannot read; a picture of several naming
each one's parts, moving each one's body within its own circles, and
refusing two parts of one name), the winged card's test reading its
alpha through the card's own vertices, and the film validates.

## F122 — The pilgrims wade, the turtle rows with both hind flippers, the birds beat both wings (D96), 29 September 2026

**Asked.** "Improve" the three weak spots F121 left: the pilgrims' legs
did not step, the turtle's far hind flipper kept still, and the birds and
the parrot beat only their raised wings.

**The pilgrims.** Sha's and Bajie's feet are painted sunk in their road
of cloud, and the horse's hind and far fore legs with them: a leg drawn
on its own would leave a hole in the road where it stood. A leg can now
be `inPicture` (`life/gait.ts`): it is not a layer, and the picture about
it is bent with it, turned at the hip and folded at the knee as any leg,
so its foot wades and the cloud stretches about it. A gait may now be a
person's two feet, `near` and `far`, half a stride apart, and the body
rises over each step as over a beast's hind legs. The step's rise moved
from `sway`, which is balance alone again, into the gait, so the rise and
the legs keep time: Sha wades with his one leg clear of his robe, Bajie
with both, and the horse with three, its near foreleg, clear of the road,
still drawn on its own.

**The turtle.** The near hind flipper had been traced 50 px low, so its
upper edge was only half in its layer, and the far flipper, 40 px across,
is under two cells of the 64-cell mesh. Both are traced again; a view may
now ask for a finer mesh (`cells`, up to 160), and the turtle's is 96.
The two flippers touch along their length, and whichever swings away
from the seam uncovers the copy of the other's edge it carries, or its
own hidden edge. So each swings only toward the other, the near one up
over the far and the far one down behind the near: painted all the way
forward and all the way back, with a leg's own `swing` and `beat` (the
hind flippers stroke together, or they cross). Nothing is uncovered at
the seam.

**The birds.** The Queen Mother's three birds have their far wings
painted, below or beside the body, two of them over her robe. A far
wing's reach never goes below as painted (1 at the top of the stroke to
1.3 at the bottom), so it never uncovers what it lies over, and one may
be drawn in front (`front`), so it stays in front of the robe as it
reaches over it. Each bird now beats both wings, the far one reaching out
as the raised one comes down. The parrot's far wing is hidden behind its
body in its picture, so its tail fans and its crest lifts instead.

**Cost.** A wing now binds only the vertices within three cells of its
outline, not half its grid: the Queen Mother, six wing layers, 0.30 ms a
frame. The turtle on 96 cells 0.26 ms (0.43 on 128, which looked no
better once the flippers kept to their seam). Measured with the machine
heavily loaded (load average 23), so if anything high.

**Seen.** In the lab at twice the pixel density, frame by frame, and in
their scenes with seed 1: the pilgrims over the Karst (28 s), the Queen
Mother Below the Sea (21 s), Guanyin's seat over the Karst (74 s), the
turtle on the Roof (85 s).

**Checked.** `npm run check`: 583 tests (a leg in the picture bends it
rather than being drawn apart, a person's two feet half a stride apart
rising the body twice a stride, a far wing drawn in front never reaching
less than painted, a finer mesh, and a leg's own swing and beat refused
past what a leg can do), and the film validates.

## F123 — The cast turns round, leaves prints, borrows what is hidden, and comes on without a stall (D96), 29 September 2026

**Asked.** "Continue" with what F122 left: a figure turning round flipped
like a card, the walkers left no wake in the cloud they walked on, a few
parts kept still because the painting hides them, and the film had not
been watched whole with the cast on.

**Turning round.** A card mirrored as its figure turned the other way by
squeezing to a line and out again in 0.4 s: a picture seen edge on, the
one moment that says it is flat. Sketched offline on the Peng
(`turnproto.py`): turned whole about its upright, with perspective, it is
still a line halfway; turned head first, the tail after, the picture
creases like a folded page. What reads as a figure turning is narrowing
it only to a third of its width, as a bird coming round toward the eye
is foreshortened, giving way there to its mirror, and widening again. The
card is now two, as painted and mirrored, on one geometry
(`sideOfTurn`, `TURNED_WIDTH` 0.3, `TURN_S` 0.7); only the side the turn
is past the middle toward writes depth. The two sides cross over `CROSS`,
0.15 of the turn either side of its middle, about a tenth of a second,
and overlap there, each still four fifths drawn at the middle: crossed
evenly, half and half, the Peng was a ghost the sky showed through. The
pilgrims turning in front of the camera over the Karst (325 px tall) and
the Peng over the grassland (305 px) now wheel round, with a wingtip
doubled for a frame.

**Prints.** A walker treads a puff of cloud under each foot. As a foot
lifts, a copy of the lower part of its cloud, round and clear of the hoof,
stays where it was and goes on back at the pace the foot pushed it,
growing, sinking a little and thinning away before the foot lifts again
(`prints` on a gait; `PRINT_*`). A copy is a new kind of layer (`copy`):
the picture keeps what it shows, and the copy is faded frame by frame
(`Body.fade`) and drawn first, in a draw of its own that writes no depth:
in one draw with the far legs, a print fought them for their pixels where
it passed behind them and speckled their clouds. Cut level under the hoof,
a print had a hard flat top and stretched into a grey shelf; round and
growing evenly, it is a puff. The qilin, elephant, tiger, the tigress, the
white horse and the monk's horse leave them; the Bull Demon King has no
puff traced under his hooves. A walker costs a fifth more a frame
(0.20 ms for the qilin, 0.34 for Sanduo's white horse, the heaviest).

**Borrowed parts.** A part the painting hides may be borrowed from its
twin: the near one again, a little way off, in the body's shadow (`shade`
on a copy), drawn behind everything and moving on its own beat. The
parrot's far wing (the shape behind its head is its crest, not a wing)
beats with the near one and shows past it at the top of the stroke
(`far: { borrow }`). Sha's far leg, under his robe, steps out in front of
the near one and back behind it (`borrow` on a leg, clipped `above` the
road it wades in). The horse's far hind cannot be borrowed: the monk's
robe hangs over its hindquarters nearly to the road, and a far leg drawn
where it could show would hang from its belly.

**Coming on.** Headless, a figure's first frame held the film 30 to 100
ms: its picture decoded, flipped and premultiplied on that frame, then
sent to the GPU. A painting is now fetched as a bitmap decoded off the
page's thread, flipped and premultiplied as it is made
(`createImageBitmap`), and the layer hands one picture a frame to the GPU
as they arrive, before any is on (`Figure.warm`, the renderer taken from
the scene's `onBeforeRender`). Building the programs ahead as well
(`compileAsync`) could not be shown to help under the machine's load, and
was left out.

**Watched whole.** The film played headless from Huangshan to the Wall
with the cast on (seed 1, 1280 by 720, the M3's GPU through ANGLE Metal),
every frame logged (`watch.mjs`): 18.1 minutes, nothing thrown or warned.
Every scene held 60 frames a second at the 95th percentile. The cast's
own work was 0.0 to 0.3 ms a frame at the median and at most 1.2 ms at
the 95th, three figures at most in the picture at once (the south king,
Wukong and Nezha over Huangshan, 32 thousand triangles). In a first run,
before the pictures were decoded ahead, frames over the Karst were held
100 to 550 ms about figures coming on, some of it other work loading the
machine; in this one the Karst never went past 16.8 ms. One frame over
Below the Sea, 81 s in, held 750 ms: it holds there with the cast off too
(62 ms, the ground or water arriving), so it is the scene's, not the
cast's, and is left for its own look. Twenty-two cards turned round, all
but one in view, most of them the pilgrims, Guanyin's seat and Wukong's
blinks; the largest, Guanyin's seat at 366 px.

**Checked.** `npm run check`: 589 tests (a card turning narrows but never
to an edge nor seen through; prints are copies of the cloud below the
hoof, drifting back, gone before the foot lifts again, never rising with
the body, leaving the picture as it was and drawn first with no depth;
a borrowed wing and leg go as their twin does, shifted, bending nothing of
the picture, and are refused when near, in the picture or treading
cloud), and the film validates.

## F124 — Below the Sea no longer stalls at 81 s: the Taklamakan's programs and arrays made ready before it comes, 29 September 2026

**Asked.** "The film stalls on one frame in scene 7, Below the Sea, at about
81.25 s of flight": `__ns.rig.render` took 50 to 60 ms on that frame
headless, with the cast off and on, and one whole-film run under a load
average of 15 saw a 750 ms gap there. Find what happens at that moment and
make the frame not stall.

**What happens at 81.25 s.** The rail comes within reach of the
Taklamakan's 90 m area (`VIEW_RADIUS_TILES`, 384 km), and its lattice is
drawn for the first time. That frame compiled four programs, the lattice's
and the rim curtain's, each in the picture and in the sun's depth pass, and
spent 53 ms of it waiting in `getProgramInfoLog` for ANGLE to link them.
The palette is written into the terrain's shaders (`setTerrainPalette`),
so every scene's programs are new, and a hero lattice is hidden until an
area is in reach. The same frame made the area's sixteen tiles resident
and sent the lattice's arrays for the first time: 7 MB, 6.4 MB of it the
dry area's water array sent whole, in zeros.

**Programs asked for ahead.** After a frame is drawn, the look rig asks
three for every program the scene can draw with, drawn or hidden
(`renderer.compile`), whenever the program the ground is drawn with
changes: a new palette, or new lights. It asks where each will draw: the
scene's into the post pass's target, since a program drawn into a target
is made for linear light and no tone mapping; the sun's with the scene as
its pass sees it (`SunShadow.fromTheSun`). They link beside the frames that
follow (KHR_parallel_shader_compile), and one a frame is taken into use
once it has linked: its first use still waits 7 to 30 ms on ANGLE Metal,
and in the lead-in no one sees the wait. Asked for once at a scene's
start, they went stale with the cast on. The cast brings a sun and a sky
of its own when its code arrives, after the lead-in's first frame, and
three counts the scene's lights into every program's key, a
`ShaderMaterial`'s too; the sun's pass hides the lights, so its programs
count none. The cast's figures are asked for with the rest, so the frames
they came on in, 4, 16 and 28 s into this scene, no longer compile either
(40 to 240 ms before).

**An area readied before its reach.** A hero area within 64 km of the
reach is readied four tiles a frame: each made resident, its water and
colour asked for, its heights and water sent to the GPU as they are
written (`readyArea`, `HERO_READY_M`, `HERO_READY_PER_FRAME`). The
Taklamakan's sixteen tiles are in by 68.2 s, and at 81.25 s the area is
only drawn. An array of heights or water is now allocated with nothing
sent until a layer is written (`dataReady`), so no zeros go up.

**Measured.** Headless at 1,280 by 720 (ANGLE Metal on the M3), the scene
played from its lead-in, before and after interleaved, the load average
noted:

| | cast | load | render at 81.25 s | worst gap, 80.5–82.5 s |
|---|---|---|---|---|
| before | off | 4.9, 6.6 | 74, 71 ms | 87, 78 ms |
| after | off | 3.8, 5.4 | 4, 7 ms | 26, 46 ms |
| before | on | 5.2, 5.1 | 99, 356 ms | 110, 383 ms |
| after | on | 8.5, 6.2 | 2, 7 ms | 24, 24 ms |

An earlier run of the fix at a load of 16 to 20 held 4.8 ms. The picture
at 83 s is the same before and after, and the First Bend, the Karst and the
Three Gorges play to 70 s with the cast on, their areas drawn whole and
nothing in the console.

**Left.** The lead-in now carries the programs' first uses, one a frame,
25 to 31 ms each with the cast on. `terrain.update` still spikes now and
then, and the country's near relief and colour pools take 5 to 40 ms of a
frame under load.

**Checked.** `npm run check`: 592 tests (an area past its reach readied
four tiles a frame, undrawn and uncut, then drawn whole the frame it is in
reach with nothing left to make resident; an array that sends no zeros
before a layer is written; the sun's programs asked for every caster,
hidden or not, in its depth material, into the map, the lights hidden and
the scene put back), and the film validates.

## F125 — The near colour sent a band of rows at a time, 29 September 2026

**Asked.** A hitch through every scene, seen while F124 was traced: each
1,601² near colour image (F95), 10 MB, went to the GPU in one
`texSubImage3D`, 10 to 30 ms of the frame on a quiet machine and 70 to
300 under load, a few times a second. Spread each over frames, and hold
its layer only once its last band is in.

**Where the time goes.** In the app's own context, the call for a whole
10 MB image returned in 2 to 5 ms, but the GPU's process took 15 to 20 ms
more over it (70 to 90 for the first into a new array), and the frame
waited at whatever next asked it anything. A band of 160 rows, 1 MB,
took 1.5 to 1.7 ms, cut from the `ImageBitmap` as it is by the unpack
rows (`UNPACK_ROW_LENGTH`, `UNPACK_SKIP_ROWS`), and the bands put
together read back the same as the whole image.

**A band at a time.** An array's images go up oldest first, and one the
frame's bytes run out in goes up as far as they reach and carries on from
that row the next frame (`ColourLayers.flush`). It is held, and the mips
rebuilt, only once its last row is in, so a layer half sent is never
drawn; a layer that takes another tile or another image part way starts
again from the first row. The frame's bytes, `COLOUR_BYTES_PER_FRAME`,
2 MB, are shared by every array: the tiles' own colour first, which
paints a tile at all, then the fine colour, the relief and the near. A
near image takes five frames, 85 ms of the 800 before its fade begins at
Below the Sea's 300 km a minute. Four megabytes were tried first; a band
of them still held a frame 6 to 21 ms under load. The unpack rows are set
through three's own state and put back to 0, which three's uploads take
them to be (F116).

**Measured.** Below the Sea played headless to 112 s, cast off,
`terrain.uploadColour` timed every frame, before (F124) and after
interleaved:

| | load | frames over 8 ms | worst | gaps over 50 ms |
|---|---|---|---|---|
| before | 5.4 → 3.9 | 16 | 11.7 ms | 1 |
| after | 3.9 → 6.8 | 9 | 31.5 ms | 13 |
| before | 6.8 → 7.6 | 38 | 73.1 ms | 21 |
| after | 7.6 → 4.6 | 0 | 7.4 ms | 1 |

With 4 MB bands the two pairs were 34 frames over 8 ms to none, and 14 to
four. The one after run with frames over 8 ms had the load rising under
it; the same code profiled twice more with every GL call timed had one
frame over 6 ms in the whole flight, a band at 8.4 ms. A held, settled
frame at 30 s is the same on the ground before and after; only the
drifting cloud differs.

**Checked.** `npm run check`: 596 tests (a near image sent every row
once, over the frames its bytes take, held and its mips rebuilt only at
its last; started again from the first row when its layer takes another
tile or image; the frame's bytes shared, what one array sends the next
not having; a picture's band picked out by the unpack rows, put back to 0
for three), and the film validates.

## F126 — Water keeps its level: the rivers lie flat in their valleys, 29 September 2026

**Asked.** A frame of the Three Gorges' opening, the Yangtze a pale sheet
tilted up the gorge: "the water is against the physical law. It should be
flat or should be as what gravity pull."

**What it was.** Water was painted on the ground as the ground lay (F72,
F73). For the Three Gorges' first 26 s the camera is over the 1 km country
grid: the 90 m area begins 39 km up the rail. There the Yangtze is one
sample wide, every channel sample at the river's own level (158 m above
the dam, 75 m below it, 44 to 51 m at Yichang), and its ribbon was drawn
600 m either side of the line, 60 % of the way up the next sample's wall.
That wall stands a median 163 m over the water, and a tenth of the time
461 m (the higher bank beside each channel sample, country tiles 58 to 64
by 22 to 24). At six times relief the river stood up the gorge as a tilted
sheet. The same happened wherever a ribbon ran in a valley narrower than
itself: the Yellow River's canyon in the Loess, and the Jinsha at the
First Bend, a pale strip standing up the gorge 15 s in. A standing body's
shore, half a sample out from its last wet sample, climbed a wall the
same way.

**The rule.** Water is drawn only where the ground is at its level: within
4 m of it, for a river on a plain whose 1 km banks stand a few metres
over the water, or a pixel and a half of height, so a coarse level of the
mesh far off keeps its water. The level is the data's own. A standing
body's is its wet samples' (GLO-30 flattens a body to one value). A
river's is the lowest of the four samples round the nearest point of its
line. The offset a sample carries runs from the line to the sample
(`water.py` writes the sample less the line's point), so that point is
the sample less its offset. In 2,591 samples of 2,591 between 300 m and
2.5 km of the Yangtze on those tiles, a channel sample (within 708 m of
the line) is a corner of its cell; the water report's drift bound, half a
sample's diagonal, says it always is.

**The channel.** The 1 km grid cannot hold a river's floor, so the vertex
shader carves one into the ground drawn (`waterBed`): under the level
inside the ribbon, up to it at the ribbon's edge, and back to the data
half a sample beyond, as a function of the distance to the line, as deep
at the line as twice what the lower bank stands over the water at the
ribbon's edge. In a model V valley the drawn shore then lands within 55 m
of the ribbon's edge on the 500 m mesh and 70 m on the 1 km mesh, for
walls from 0.5 % to 150 % (`water.test.ts`). Two rules were tried first
and left: lowering every vertex inside the ribbon by its own lowest bank
was out by up to 600 m and drew the shore as the mesh's staircase, since
a vertex just inside was carved and its neighbour just outside not; and a
channel of fixed depth dug the Roof's gentle banks into ditches the river
spilled along into side valleys. Only ground the channel carved is flooded
past the ribbon's edge; hollows the data has under a river's level beside
it stay dry, as they were. The channel is drawn only: the ground the
camera, the cast and the captions stand on is the data's. The sun's depth
pass runs the same vertex shader, so the walls shadow the water and the
carved bed shadows nothing.

**Flat.** The water is lit where the sight line meets its level, not
where it meets the carved bed: its ripples, glint, shadow, mist and haze
are the level surface's, so what is seen is a flat surface with its shore
where the bank rises through it.

**At the rims.** Within 2 to 4 samples of a drawn hero rim the carve is let
back up to the data (`rimTaper`). Carved beside the rim, the hero area's
skirts stood up out of the water as a cliff across the river, 26 s into
the Three Gorges. The curtain along the rim (F74) is built on the CPU, so
it hangs from the bed the CPU's copy of the rule gives (`waterBedM`).

**Seen.** Headless at 1280 by 720, every scene at 15, 45, 75 and 105 s
against the same frames drawn by HEAD, the sky masked since the clouds
drift: the ground changed at the Three Gorges' 15 s (30 % of its pixels),
the Loess (4 %), the First Bend's 15 s (3.7 %) and the Roof's 45 s
(3.2 %), each where a river had stood up a wall and now lies in its
valley; the rest within 1.3 %, most of it nothing, but for Huangshan,
whose cloud sea drifts too. The Three Gorges from
2 to 26 s: the river flat in the gorge floor, the reservoir behind the
dam level at 20 s, the shore a curve along the river. With the cast on
(seed 1), the White Dragon swims in the gorge's air, above the water. Of the nine stills, retaken, only the Loess's changed on
the ground (2.5 %, the Yellow River lying in its canyon where it had
washed up the canyon's west wall); the other eight moved only by drifting
cloud and rippling water, and are kept as signed off.

**Cost.** Not measurable on this machine today. Three passes over the
stations at 1080p, old and new interleaved, with other sessions holding
the load average at 27 to 35: the instrument's resolution was ±5.4 ms,
and its last pass flagged a poor fit. Summed over the eight stations
drawn whole, terrain was 41.1 ms new against 41.5 old in that pass; an
earlier pass's 2 ms more at the Loess (5.5 against 3.5) came back as 4.1
against 3.9. The work added: four water reads a vertex on a tile whose
water has landed, and twelve height reads more within a ribbon; four
height reads a fragment where a ribbon covers or the channel carved, four
where standing water does, and a second shadow read where the surface
lies over a carved bed. To be timed again on a quiet machine.

**Left.** The drawn river's grey-blue beside the reservoir the Sentinel-2
composite photographed, turquoise, on ground the grid does not hold as
water. The grassland's river drawn as pieces of standing water with gaps
(F73's surface where the 1 km grid resolves it, no ribbon between), as
before. A standing body is clipped to its level but not carved, so far off
on a coarse mesh a narrow one thins to its wet samples and the pixel
tolerance. The Loess's still needs signing off (D77), and the cover,
whose Loess card is that still, drawing again after it.

**Checked.** `npm run check`: 596 tests (the level found round the line's
nearest point, the other way from the offset; the tolerance; the channel
never raising the ground, continuous in the distance, uncarved on a plain;
the drawn shore at the ribbon's edge in valleys of any steepness at every
phase of the mesh; the CPU's bed against a tile; the rim's taper; and the
shader holding each), and the film validates.

## F127 — Rivers the colour of their photograph, and whole, 29 September 2026

**Asked.** The two things F126 left: the drawn river's grey-blue beside the
reservoir the photograph shows turquoise, and the grassland's river drawn
in pieces.

**Pieces: what it was.** Not standing water, as F126 had it: the ribbon.
Its distance was read from the four samples' offsets bilinearly, which is
exact along a straight reach, but the steppe's river is the channel stage
3 cut, eight-connected and smoothed twice, and it turns within a sample.
There the offsets are not linear in position, and read so the distance
missed the line by 144 m at the gaps, up to 190 m. The river the camera
sees 45 s in (43.4 N, 122.9 E, byte 7) is drawn 180 m either side, and
10.4 % of its centreline was not drawn at all; over the region's rivers
(country tiles 74 to 83 by 43 to 48, bytes 7 to 10), 7.8 % at 120 m and
4.6 % at 180 m. The Yangtze's 600 m ribbon hid the same error.

**Pieces: the rule.** Each sample also names a point of the line, its foot:
the sample less its offset. The line through a cell's four feet, joined
by chords where two lie within 1.5 samples of each other along the river
(the chord square to the offsets at both ends, within a cosine of 0.7) and
the nearest foot where none do, is the river's wherever it turns. A cell's
chords are its own four feet's, not its neighbour's, so a distance read
from them alone steps at every edge of the grid: by more than 20 m at 53 %
of edge points near a line, the bytes' rounding (32 m units). So the
bilinear reading is kept and the chords' taken only where the two part:
wholly past 120 m, not at all under 60 m. Along the line they part by 30 m
or less at 75 % of its points and by more than 120 m at 8 %, the turns;
2 % fall in between. Undrawn centreline 7.8 % to 0.05 %; steps over 20 m
at 5.8 % of edge points, all at turns. It also mends a river that was not
there: between two rivers 1.4 samples apart the offsets read bilinearly
pass through zero, and the chords, which never join one river's foot to
the other's, put the point 700 m from both (`water.test.ts`). The shader
and its CPU copy, which the rim curtain's bed reads, do the same.

**Colour: what it was.** Four things. The river's colour was the palette's,
picked by eye and drawn ungraded, beside ground drawn from the photograph
graded (gain 1.4, saturation 1.05, white balance 1.1, 1.0, 0.78). Three
palettes named no river colour and drew the default's sky blue (0.42,
0.66, 0.84): the grassland's, the Roof's and the Below the Sea's, blue
ribbons on the steppe, the plateau's ochre and the desert. The glint was a
lobe a few degrees wide (cos^400) on ripples tilted 4.6 degrees over
160 m, so looking towards an evening sun, as the Three Gorges' opening
does, its path lay on the water as white cloud; it had been taken for
mist. And a gorge's river mirrored the open sky: the valley's walls came
into the mirror only below 18 degrees, and at six times relief a gorge's
stand at 70 and more.

**Colour: the rule.** A river's colour is its water's in the photograph,
graded as the ground's is. Measured in the 10 m colour along the rails:
crops 800 m across centred on the river's line where it passes within
2.5 km of the rail, each crop's colours in four clusters, the cluster
nearest the river as seen in the crops, the median of its pixels. The
Yangtze below the gorges, jade, 0.32, 0.44, 0.39 (40 crops); the Jinsha,
milky, 0.66, 0.62, 0.50 (28 of 37); the Yellow River, khaki, 0.52, 0.47,
0.33 (32 of 40); the plateau's rivers, ochre, 0.67, 0.51, 0.33 (22 of 27).
The steppe's river is dry sand where the rail crosses it; its river's
standing water, 185 km south of the rail, and its lakes, 120 km north,
are a dark teal, 0.15, 0.24, 0.22. The desert's are dry beds under the rails, and take the Yellow
River's silt. The Three Gorges' 90 m area agrees: its reservoir's 8,109
inner samples, in its own composite, 0.22, 0.35, 0.33. Inside a river's
own surface (F73), where all four samples round are water, the drawn water
is the photograph itself, so the reservoir is the turquoise and jade the
bays beside it are. A river's line runs on across the lake it feeds and
out to sea, and there its colour gives way to the lake's and the sea's:
the Roof's still had an ochre stripe across its lake. The sun's glitter
is Cox and Munk's: the share of the facets tilted to throw the sun at the
eye, their slopes' variance 0.004 (calm water; at 3 m/s of wind the whole
of the gorge's river was one sheet of it), twice as bright as white at its
heart, as the glint was; the ripples' tilt halved. And a ribbon mirrors its
banks as steep as they stand: the lower bank's rise over the water, drawn,
over the ribbon's half-width, seen along the reflected ray's heading
across the river (`vWallTan`, from the vertex shader's bed).

**Seen.** Every scene at 15, 45, 75 and 105 s against F126's frames, the sky
masked: the First Bend, where a grey ribbon had run down the middle of the
cream Jinsha the photograph shows, is the photograph's cream, seamless;
the Roof's blue ribbons are its silt, a dusty ochre-grey under the sky
they mirror at a low angle; the steppe's river is whole and slate, where
it had been pale blue pieces; the Yellow River is khaki; the Three
Gorges' is jade under its mist, and the path of the evening sun on it a
soft silver rather than white cloud. Changed: the Three Gorges' 15 s
(3.1 %), the First Bend's 15, 45 and 105 s (to 3.7 %), the Loess (0.7 to
1.1 %), the grassland's 15 and 45 s (0.6 and 9.6 %), the Below the Sea's
75 s (1 %), the Roof's 45 and 105 s (5.3 and 1 %); the rest within
0.2 %. Of the stills, retaken, four
changed on the ground: the Three Gorges' (0.3 %), the First Bend's
(0.5 %), the Below the Sea's (0.3 %, its lake's glint) and the Roof's
(2.6 %); the other five are kept as signed off.

**Cost.** Not measured: the headless capture refused, its frames arriving
at 8.5 Hz. The work added is arithmetic, no reads: six chords a water
fragment and a water vertex, one exponential for the glitter in place of
a power, and a varying.

**Left.** The steppe's river is drawn as water where the photograph shows
a dry bed: Natural Earth's line and stage 3's channel say river. The line
itself zigzags at the kilometre where the channel stage 3 cut does. Lakes
and the sea keep their palettes' colours, picked by eye: Heaven Lake's
photograph is a deep blue (0.11, 0.17, 0.27 over its 901 inner samples)
where its palette's is turquoise (0.14, 0.46, 0.58). The four stills, and
the Loess's from F126, need signing off (D77), and the cover drawing again
after them. The frame's cost, F126's and this, to be timed on a quiet
machine.

**Checked.** `npm run check`: 604 tests (a line that turns within a sample
drawn along the line; no two rivers a sample apart joined across the land
between; the point halfway between two rivers as far from each as the
bytes put them; every scene's palette with its own river colour; the
shader grading a river as the ground and drawing a river's surface as its
photograph, leaving lakes and the sea their colour, the glitter's width
and peak, the walls in the mirror), and the film validates.

## F128 — Wukong goes with the pilgrims, 29 September 2026

**Asked.** With the cast on, the Monkey King was missing from most of the
scenes with Xuanzang: over the Wall, the monk on the white horse, Bajie
and Sha, and no Wukong.

**What it was.** The painting of the pilgrims (D94) is the monk, Bajie and
Sha; Wukong is his own figure. He was cued in two of the five scenes that
cast the party, the First Bend and Below the Sea, and in those the
director (D92) sent him on visits of his own, somersaults and circles at
seconds of their own, so he was seldom in the picture with them. At the
Karst, the Roof and the Wall he was not cast at all. The First Bend's line
said "Wukong ahead, the monk on the white horse, Bajie and Sha behind"
over a picture without him in it more often than not.

**Rule.** A temperament may escort another figure (`escorts`, beside
Nezha's `chases`): when both are cast for some of the same seconds, the
director gives the escort a visit for each of the other's, the same
seconds, turning to the lens when the other is named, and no visits of
its own; a chaser goes after only a leader that goes its own way. The new
motion `escort` (director-only, like `chase`) is the other's pose moved
across the line of sight toward the way the other faces in the picture:
Wukong's middle 0.64 of the party's size ahead of theirs, past the horse's
nose (0.47) and clear of it with his staff (0.13), his feet a tenth of it
over their road. Lifted over them instead while they come straight at the
lens or go straight away, and as he closes in on them (wholly over by
0.6 of his lead). He comes out of them as they come into the picture, and
goes back into them as they leave. Ahead put him past the edge whenever
the party walks toward the nearer one, which a line's pause often does
(the Karst's, the First Bend's, and half the viewings of Below the Sea's
and the Roof's), so he keeps his middle within 0.8 of the half width
while they are in the picture, closing in and rising over them; he rises
no higher than keeps his top under 0.95 of the half height (the Roof's
party rides at the horizon), and where there is no room over them either
he keeps further ahead, to 0.95, part way past the edge, rather than
stand in front of the monk. He stands 1 % nearer the lens than they do,
the same in the picture, so where the two overlap he is cleanly in front.
Wukong is cued with the party at the Karst, the Roof, the Wall and Below
the Sea's Flowing Sands (a second cue; his first stays with Nezha over
the Flaming Mountains), at 0.36 of the party's size, Sha's height or a
little under; the First Bend's cue goes from 420 m to 400. The Loess has
none: the monk rides out of Chang'an alone, and the monkey is taken on
later (ch. 14).

**Seen.** Held at the party's lines with seed 7, and seed 123 where the
party walks toward the edge, headless: at the Wall and the Roof (seed 7)
and Below the Sea he leads on his cloud ahead of the horse, facing their
way; at the First Bend ahead of them, rising over the monk at the edge; at
the Karst over the monk's crown, scouting; at the Roof (seed 123) at the
horse's head, then part way past the edge. Over 60 seeds, of the seconds
the party is well in the picture he is never out of it; his top is past
the frame's in 2 % of the Roof's and 3 % of the Wall's, where the party
itself rides near the top, and in none of the others'.

**Cost.** Not measured: one more painted card in the picture while the
party is, as when he visited on his own.

**Left.** Nezha still chases Wukong over the Flaming Mountains (ch. 61),
where the novel has him come to help. Straight on, or closing in, Wukong
over the party can overlap the monk's staff.

**Checked.** `npm run check`: 613 tests (the escort ahead of the one it
goes with on the side it faces, by its share, level with it across the
line of sight, over it straight on, out of it only as it comes in; kept in
the picture wide and tall as the other nears the edge, under the top when
it rides high, further ahead when crowded; with the party wherever both
are cast, for each of its visits and no other, none with the monk alone,
at a third of its size), and the film validates.

## F129 — Nezha after the Bull Demon King; followers beside the ones they follow, not on them; what the escort costs, 29 September 2026

**Asked.** F128's three leftovers: Nezha still chased Wukong over the
Flaming Mountains, where the novel sends him to help; Wukong over the
pilgrims could overlap the monk's staff; the escort's cost was not
measured.

**Nezha.** A temperament's `chases` is now a list, the first of it cast
for some of the same seconds taken: Nezha's is the Bull Demon King, then
Wukong. At the Flaming Mountains he goes after the Bull, as he does to
end the fight (ch. 61); over Huangshan, with no Bull, after the monkey
(ch. 4). Held at the Bull's line, the chase showed what a chase had always
been: a second behind on a path that pauses for a line is where the leader
stands, and Nezha stood inside the Bull, nearly three times his size, his
head over its back. Over 60 viewings the old chase had the two covering
each other for 93 % of Huangshan's chase seconds and all of Turpan's. So a
chaser now keeps a body's length behind the other across the picture as
well (0.55 of the two sizes, centre to centre), and over it, by its size,
while it comes straight at the lens or goes away, rising until it is clear
of it across (0.55 of the way out). It keeps in the picture as the escort
does. Covering fell to 2.0 % at Huangshan and 0 at Turpan; Nezha off the
picture while Wukong is well in it, 9.2 % to 3.3 %; his head past the top,
25 % to 21 % (Wukong rides high, and Nezha is the taller).

**One rule for both.** The escort's and the chaser's placing is one
function, `keptBeside` in `motion.ts`, with `sideFacing` and
`acrossSight`: as far out across the picture as keeps the figure's middle
within 0.8 of the half width; rising no higher than keeps its top under
0.95; and where there is no room over the other, out only as far as leaves
room for the rise it has there (a search, not a guess from the shortfall,
which stood Nezha half over and half beside Wukong), up to 0.95, part way
past the edge. Where the other comes nearly straight at the lens and has no
side to go out to, it goes out to its visit's side: close over Huangshan,
Nezha over Wukong had no room and hid him whole.

**The staff.** Measured from the painting's outline, with Wukong's cloud
0.094 of the party's size either side of his feet and 0.066 under them:
the monk's staff needs his feet 0.58 over the party's road, the horse's
ears 0.44 from 0.52 ahead of the party's middle in. His full rise was
0.55, and he began rising only as he closed in, after he was over the
horse's head. Now he leads at 0.70 (0.64), 0.09 clear of the nose with his
staff, and rises by how far ahead he is: from 0.665, where his cloud
reaches the nose, to 0.525, over the head, wholly, to 0.62 (0.55). The
margin over the outline is 0.038 at the least; a test holds the numbers.
The Roof's and Below the Sea's parties were cut into for 47 % and 37 % of
their lines: big in the picture, they are named off centre and walk to the
nearer edge, with room for him neither ahead nor over them. Named at 60 m
right of the middle (from 240 and 360), 3.4 % and 2.6 %; overall, of the
party's seconds well in the picture, 1 to 7 % by scene.

**Cost.** The escort's pose, in a loop: 1–3 µs, 46 µs at the most, 4 a
frame. Held at the Roof's line, headless at 1920 × 1080, Wukong shown and
hidden in turns of 10 frames over 400: his figure's update 0.3–0.4 ms a
frame (the painting bent by its lives, as the pilgrims' own), 2 draw calls
and 29,700 triangles; the frame's GPU time 7.9 and 8.1 ms, then 7.4 and
7.2 (shown, hidden): within the timer's noise both times.

**Seen.** Headless, seeds 7, 123 and 5: the Karst's and the First Bend's
Wukong over the monk, clear of the staff; the Roof's and Below the Sea's
parties near the middle with him ahead; Nezha above and behind the Bull
through the Bull's line; Nezha beside Wukong where Wukong comes at the
lens over Huangshan.

**Left.** Over the Flaming Mountains Wukong is seen in 8 % of viewings,
0.4 s a viewing, as he was before F128: the seconds there are taken by
four lines, which a passing figure keeps out of. Wukong's head can go past
the top of the frame at the Roof and the Wall while the party rides high
(2–3 % of their seconds).

**Checked.** `npm run check`: 616 tests (Nezha after the Bull at the
Flaming Mountains; a chaser behind the one it chases by a body's length,
over it straight on, and off it close and straight on in a wide frame and
a tall one; the escort's rise clear of the pilgrims' outline at every
side), and the film validates.

## F130 — Wukong after the Bull Demon King and Nezha in his way; followers come down to keep their heads in; Nezha Wukong's size over Huangshan, 29 September 2026

**Asked.** F129's two leftovers: Wukong seen over the Flaming Mountains in
8 % of viewings; heads past the top of the frame, Wukong's at the Roof and
the Wall (2–3 % of the party's seconds), Nezha's at Huangshan (21 % of the
chase).

**The Flaming Mountains.** Wukong now goes after the Bull Demon King there
(`chases: ["niumowang"]`), as the novel has him do (ch. 61), and a chase is
not kept out of the picture by the others' lines, as a figure passing on
its own way is. With Nezha after the Bull too, the two took the same place
and stood on each other for 68–75 % of the chase; in a line, the second
after the first, 15–25 %, the pair piled over the Bull's back where there
was no room behind him. So Nezha does what the novel has him do instead:
he bars the Bull's way. A temperament's `blocks` (Nezha's: the Bull) is
looked for before its `chases`, and the director casts the new motion
`block` (`motions/block.ts`) with each of the other's visits that stops,
for the same seconds. It keeps to one side of the other for the whole
visit, the side the other faces while it stops: ahead of it coming in,
going its way; turned round to face it while it stops, a body's length off,
as a chaser keeps behind; behind it as it turns and goes, and after it. It
never goes backwards and never passes over the other. The director's
lookups are one, `followOf`: escort, then block, then chase, and one blocked
or chased must go its own way, so no one chases a chaser. The Bull stopped
for his line 760 m left, facing in, with no room behind him, and Wukong
climbed over his back into the top-left corner; named 480 m left, there is
room behind him for Wukong and before him for Nezha. Over 60 viewings:
Wukong in 82 % of them (from 8 %), 9.7 s a viewing; Nezha in the Bull's way
in 80 %; on the Bull, of the seconds the Bull is well in the picture, 1.9 %
and 0; on any other figure 5.4 % and 3.7 %.

**Rising by what is painted.** A chaser rose over the other by the other's
size; the Bull's size is his length, and he stands 0.64 of it to his horns.
The layer now hands the motions each figure's painted height
(`paintedHeight`, from the painting's feet and size, the pictures being
cut to the figure): Nezha 1.03, Wukong 1.18 with his plumes, the Bull 0.64,
the pilgrims 0.53. A chaser or a blocker rises by the other's and keeps its
own top by its own.

**Heads.** Nezha was cued over Huangshan at 240 m, 900 m off, for his line;
after Wukong (130 m, 600 m off) he is drawn at Wukong's distance, so nearly
twice his height, up to three-eighths of the frame, and his head went out
whenever Wukong rode high. His cue is now 140 m at 525 m: drawn for his
line exactly as before (every path scales with the cue's distance and
size), and after the monkey the monkey's size. And a follower whose leader
rides so high that even level with it its top would be past the keep comes
down as far as keeps it in (`keptBeside`'s `lower`, at most its own
height), but only as far as it is clear of the other across the picture:
all the way beside it, not at all over it, where it would come down on it.
Head past the top, of the seconds the leader is well in the picture: Nezha
at Huangshan 22 % to 0.8 % (off the picture 3.4 % to 0, on Wukong 1.3 % to
0.7 %); Wukong at the Roof 1.9 % to 0.9 %, at the Wall 3.2 % to 1.0 %. What is
left is where the one followed has its own head at the top (all of the
Roof's and the Wall's, 13 of 23 at Huangshan), or where the follower is over
it with no room either side, as in a tall frame.

**Measured right.** The escort's overlap with the party had been measured
against the top of the painting's outline only, so Wukong down beside the
horse's nose, where nothing is painted, counted as in the party. Against
each column's top and bottom, from `pilgrims-default.webp`, the party's
seconds with his cloud in it are as they were before this: 1.6 % the Karst,
0.8 % the First Bend, 4.1 % Below the Sea, 7.1 % the Roof, 3.6 % the Wall.

**Cost.** A follower's pose, in a loop over the Huangshan, Turpan and Roof
visits: 1.6–4.5 µs on average, under 30 µs at the 99th percentile; its worst
single call varies from run to run between 40 and 300 µs (the timer and the
collector). The block asks for the leader's pose twice. Wukong over the
Flaming Mountains is one more painted figure for about 10 s a viewing, as
the escort was (F129: 0.3–0.4 ms a frame, 2 draw calls).

**Seen.** Headless, seeds 1 and 2 (the Bull crossing, and coming at the
lens): the Bull stopped left of the middle, Nezha before him turned to him,
Wukong behind him at his height and after him as he goes; seed 53 over
Huangshan, Nezha after Wukong at his size, and in his own line where he was.

**Left.** The Eight Immortals come in for their line as the Bull's ends,
and on some viewings pass behind him on the way, as before.

**Checked.** `npm run check`: 620 tests (the block; a follower brought down
to keep its head in and never down on the other; Wukong after the Bull and
Nezha in his way; Nezha over Huangshan about Wukong's size; the paintings'
heights), and the film validates.

## F131 — The cover with its skies: a figure on every card, 29 September 2026

**Asked.** The cover has nine cards, and something shipped is not on it.
It was the cast. The cover (`app/public/cover.png`, the README's first
picture and the site's preview) was the ground alone: seven cards were the
film's stills, which are drawn without the cast for the look's sign-off
(D77), and its own two frames, Huangshan and the Wall, were taken with the
cast off too. Since 26 September the film has had its figures (D91), painted
since the 28th (D94) and alive since the 29th (D96), and the film is named
for the skies they fill, yet no card showed one. The cover was a day behind
the ground as well: the stills were taken again for F126–F127 and the cover
was last drawn for F117. The README did not mention the cast at all.

**A frame a card, with the cast on.** `npm run cover -- frames` now takes
all nine cards from the running film with the cast on, in one viewing
(`?cast&castseed=1`, `CAST_SEED` in `tools/cover.ts`), so a card comes out
the same each time it is taken. It waits thirty frames after the ground has
settled, since the figures' pictures go to the GPU one a frame (F123), and
reports how many figures are on stage. Most frames are a second in a
figure's line, when the director holds it where its cue puts it (D92):

| Card | Second | Figure |
| --- | --- | --- |
| Huangshan | 34 | Wukong on his cloud over the cloud sea, the peaks beside him |
| The Three Gorges | 18 | the White Dragon coming up the gorge |
| Karst | 8 | the elephant of heaven over the towers and the Li |
| The First Bend | 66 | the tiger over the gorge it jumped |
| Loess | 54 | the carp leaping over the Yellow River |
| Heaven Lake | 106, 1,500 m up | the magpie with the red fruit over the crater |
| Below the Sea | 46 | the Bull Demon King with Nezha's wheel on his horn, Nezha in his way, Wukong after him |
| The Roof | 86 | the old turtle of the Tongtian |
| The Wall | 72 | the party crossing over the face to the Western Heaven |

Nine different figures. The Dragon Kings over Huangshan (22 s) read as
well as Wukong does, and the pilgrims over the Karst (28 s) are that
scene's strongest frame, but they are the Wall's card; the Jing River King
over the Loess (42 s) would have made three dragons.

**Off the caption.** Held for their lines, the White Dragon (30 s) and the
carp (62 s) sit low in the picture, under the card's words. Both are taken
earlier in their visits, where this viewing has them high: the only two
cards that hang on the seed. Heaven Lake's rail is 300 m over Changbai's
flank, which fills the picture while the magpie is in it; by 108 s, when
the crater opens, the bird has gone. Held at 1,500 m, inside the scene's
band of 300 to 2,500, at 106 s the lake is under it. On the postcards, a
card lies under the ones after it, so the six are placed where each
figure is on an uncovered part: Heaven Lake's magpie was under the
Huangshan card, then under the Wall's.

**The README** opens with the cast and says in "Watching it" how to bring
it on (`J`, the lantern on the bar, `?cast`): the cover now shows a layer
the film opens without. Each card's alt text names its figure.

**Checked.** `npm run typecheck`; the nine frames and the cover and
postcards drawn again and looked at, every figure clear of its card's
words. The film's stills and every scene file are untouched.

**Left.** The cards' captions name the place, not its sky; 苍天 and the
rest are on the title card only while the cast is on (F104). The cover
needs signing off (D77).

## F132 — The Three Gorges' hero grid from the scene's first second, 29 September 2026

**Asked.** A frame 9 s into the Three Gorges: "the second scene beginning
needs some more details on the landscape." Rounded green hills, their
colour drawn down the slopes in stripes.

**What it was.** The scene's rail starts at Yichang, 40 km east and 8 km
south of where the 90 m hero area ended, so its first 26 s (F126) flew the
1 km country grid: the 500 m spline level, its 31 m relief and 10 m colour
stretched six times up walls that grid cannot hold. From 26 s on, over the
hero grid, the same gorge has ridges and photographed rock walls (F92).

**The area.** `three-gorges` grew from 12 by 3 hero tiles to 17 by 4 (68,
196 by 46 km): five east, over Xiling's lower reach, the dam and Yichang,
and a row south, so the rail starts 3.4 km inside it. Still one area (F51):
the only rim the camera crosses is the west one, as before. Cut from the
source like the rest (`make hero`): the six other areas came out
byte-identical. Stage 3 cut 3 cells, at most 9 m, where the Yangtze
crosses the dam at 90 m (30.83 N 111.01 E); the water lies at 157.5 m on
the reservoir, 62 m between the two dams and 38-40 m at Yichang; the
seam against the country grid stands worst 274 m (330 before) against
900 m of skirt. Over the hero grid: 34 % of the rail (25 %).

**The colour, in parts.** The area's Sentinel-2 median was read for the
old box, and its cached passes, its median and its share of the tone line
are kept as they were: an area that grows is composited in parts
(`composite.PARTS`), its own first over its old window, then the new
ground under its own key (`three-gorges-yichang`, reaching a tile back
over the old), read and built like any area's, 50 passes a Sentinel-2
tile. `imagery.composite_on` lays each part only within its window, the
first over the later ones, fading out over 1.5 km toward the edges they
reach past (from the parts' windows, so a 10 m tile fades as its area
does). Ground no part reaches (the row south of the old area, 16 km and
more from the rail) is the country's own archive at 160 m (F90), as it
was before the area grew. The tone line refitted byte-identical.

**The relief, and what nearly went.** The source GLO-30 was deleted to
free disk while this was built, and `make relief` then read every cell as
ocean: it cut every tile flat and deleted the 1,665 real ones as orphans.
All but seven were taken back out of the scene packs (each checked against
the hash that names it); the seven were sub-tiles along this rail that the
grown area now covers, which no pack lists. `relief.source_cells` now
refuses a cell the mirror has and the disk has not, and `--only` updates
the index and deletes nothing. The six cells under the gorges were fetched
again (274 MB) and the area cut again at 30 m: its old 36 tiles differ in
1.4 % of samples by more than 2 levels, GDAL's average warp over a larger
grid (the old box cut alone is identical).

**Seen.** Headless at 1280 by 720, held at 3, 12, 22, 34 and 45 s: to
22 s the gorge now has the hero grid's ridges and rock walls, the reservoir
level behind the dam; 34 and 45 s as before. The Yichang part is built from
all 200 of its passes (4.2 GB at 1 MB/s; twelve read again after the
network failed them), and nothing of the area is filled. Where the two
parts overlap, a tile column wide, their toned medians differ by a median
1 to 1.7 levels a channel, blended over the 1.5 km: at 27, 30 and 33 s,
where the rail crosses the old edge, no seam shows. Three Gorges pack
106.4 to 114.5 MB; the film 1,078.5 MB of 2,000.

The Gorges cover card (18 s) retaken: the White Dragon whole over the
gorge, clear of the caption; the sheet is drawn again with F138's Loess
card. Still 02 (60 s, the old ground) retaken: 7.5 % of its ground pixels
moved by more than 8 levels (two takes of one build differ by 0.75 %), as
fine shading along the slopes, the old tiles' relief cut again over the
larger grid. Both signed off by the user on 30 September (D77).

**Left.** A test bound moved: a quarter of a rail's near sub-tiles may lie
under its hero area, now a third (23 of the Gorges' 78). Frame cost not
measured.

## F133 — The four Dragon Kings together for their line, and no king timed behind a mountain, 29 September 2026

**Asked.** Over Huangshan the line says "The four Dragon Kings, up from the
cloud sea with Wukong's gifts", and one dragon is in the picture. The four
were placed round the massif, one to a quarter, each coming up where a pass
of the loop looked his way (D93). While the line was on (20–26 s) the East
King was in the picture; the South King was behind the lens, the West King
off the left; the North King was straight ahead and counted as seen, ten
kilometres off, behind the peaks, a curl of tail by a spire. Over 200
viewings a viewer met three or four kings, one at a time, never four.

**The kings together, one picture.** The four are brothers in the novel:
the East King beat his drum and struck his bell, and the other three came
with the gifts (ch. 3): the South King's phoenix-winged purple-gold crown,
the West King's golden chain mail, the North King's cloud-stepping boots of
lotus fibre. Their four pictures are one pose recoloured (D94), so side by
side they would read as copies. A new view, `dragon:four-kings`, draws them
in one picture: `gathering` painted from the four kings as references
(`--ref`, four at $0.37), each in a pose of his own and holding his gift,
rising out of one long bank of cloud; then its pick edited once, only the
crown made the Monkey King's (the model's first was a European crown with
arches and a jewel, $0.17). Its life (D96): a serpent on each king's
midline, traced by eye on the colour of his scales, none bobbing the whole
picture; manes, beards, tails and the crown's plumes stirring about still
heads; the cloud bank churning, spared along the four bodies so the West
King's silver does not churn with it.

It is a monument cue of its own at Huangshan, which takes the line and the
name (四海龙王), up from 10 to 34 s: seven kilometres out, right of the
line, where nothing stands between from 20 s. The four single kings now
start after it, and none of them is ever up while it is.

**Height at six times relief.** A place's height shows six times over in
the picture (`exaggeration`) and a figure's size does not. Put where the
gathering's cloud would lie on the cloud sea's top (1,050 m), it stood 30°
up, cut by the frame's top. Its middle is now 1,760 m, about the camera's
height, so the four stand whole over the cloud sea, 2° above the level.

**Each king in his own quarter, in the loop's order.** After 38 s the old
places were barely looked at: the East King's place was behind the flight,
the North King's in view only when his cue was over. Each king now stands
where the loop looks across at him, clear of the peaks, and about 2° above
the camera's level: the North King off the north-east as it turns (34–48 s),
the East King off the east as it runs south (52–69 s), the South King where
he was (61–79 s), the West King off the south-west as it turns for home
(86–101 s). Set 16–21° up at first, they hung small at the top of the sky.

**Nothing behind a mountain (the sight).** The director's sight (D93) knew
only where across the picture a place was. `tools/sightlines.ts` flies each
scene's rail at its authored speed, the camera held over the drawn ground by
the altitude controller as the shell holds it, and for every quarter second
asks whether the ground rises over the straight line from the lens to each
monument at its height (a line straight in the exaggerated world is
straight in real metres, so the relief does not change the answer). The
spans behind the ground go to `content/scenes/sightlines.json`, a place to a
line, with a digest of the rail, band and look-ahead they were worked out
for; a gap under a second between two spans is a peep over a ridge and
counts as behind. The film reads them into each scene's `behind`, and the
sight answers null for a place while it is behind the ground, so a king
waits for a moment he can be seen. The content gate says when a scene's
rail or a monument's place has changed since: run the tool again where the
world is built. It takes a second for the film.

Before, 31% of the seconds the director counted a king as seen were behind
the ground, and 9% of risings were wholly so.

**Measured** over 200 viewings: the four kings together up, mid-picture and
clear for every second of their line in all of them; each king seen on his
own after in 92–98% (6.7–11.9 s a viewing); no rising only behind the
ground; all four again on their own in 84% of viewings, three in 12%.
Played to the line: 四海龙王 on, the four whole over the cloud sea. The cover's
Huangshan card (34 s, Wukong) is as it was.

**Checked.** `npm run typecheck`; `npm run content:validate` (film ok);
tests 624 of 625: the one failing is the Three Gorges' near relief in the
scene packs, which another session is re-cutting as this is written.

**Left.** At about 56 s the East King, ten kilometres off, stands over a far
knoll for a moment, as if perched on it. Only the Dragon Kings surface;
the tool knows every monument, and Heaven Lake's crane flock, placed to sit
below the crater's rim (F104), is behind it until 103 s. The painting is `high`
quality; spend $5.93 of $30. `npx vite-node tools/sightlines.ts` has no npm
script yet: `package.json` carries another session's uncommitted work.

## F134 — The dragon of the Flaming Mountains painted, and laid on the range, 29 September 2026

Seen in the browser over Turpan (scene 7, 12:28): the Uyghur story's slain
dragon was still the one made in code, a flat orange tube with a toy's
eyes, beside a painted Queen Mother of the West. It had been kept in code
(D94) because a card cannot lie along a range; but hung 1,500 m over the
ground, nine kilometres up at six times relief, it did not lie along it
either.

**Changed.** Painted as the family's design (`--ref` the East King, one
pass, four pictures, $0.23), in the red and ochre of the sandstone his
blood stained: lying dead along the picture, head laid on his forelegs,
eyes shut, smoke rising off his back as off hot rock (`slain` in
`content/paintings/dragon.yaml`). Nothing of him moves but the smoke,
churned in the plumes over him only. The cue stands him on the range's
crest at the Flaming Mountain, 350 m over the ground: his belly on the
ridge and the tail that hangs under him just clear of it. He is named
while he is ahead, 火焰山, "The dragon a Uyghur hero slew; its blood turned
the mountains red.", at 14 s, so Bogda's caption moved from 12 to 8 s.
His sightlines (F133) were worked out again for the new place: not behind
the ground until 46.5 s, and he is gone at 30.

**Checked.** Held at 6–20 s the painted dragon lies on the red crest,
ahead and to the left of the line, 60 to 40 km out; played through, the
line comes on at 17 s of play with him under it. `npm run typecheck`;
`npm run content:validate` (film ok); tests 625 of 625.

**Left.** The code-made dragon keeps its `lantern` variant, which the film
no longer asks for (the painting tests use it as the variant with no view).
Cranes, egrets and the wind-horse flags are still made in code.

## F135 — Laozi on his green ox, and Guanyin herself, 30 September 2026

**Asked.** "We are missing the Chinese phoenix (king of all birds), and
Daode Tianzun (太上老君)." Asked where they fit, and told that the phoenix
was already cast over the Karst, but in one viewing in two (F114's
`chance: 0.5`) and so the least seen figure of the cast (in 49 % of 2,000
viewings, 12 s a viewing, against 17–42 s for the rest), and that Laozi
would fit the Loess, the user decided (D97): "draw the body, and change
Guanyin to real body as well. Old sage riding the ox, OK."

**Laozi.** The Loess is the Journey's start, the monk riding west out of
Chang'an; Laozi went west too, out through the Hangu Pass on his green ox,
when the keeper saw a purple cloud come from the east and knew a sage was
coming (紫气东来), and left the Daodejing there. The pass is downstream past
the flight's end, as the carp's Dragon Gate is. Painted as the painters show
him, not as the enthroned Daode Tianzun of the altar: a very old man with a
long white beard, a whisk over his shoulder and a gourd at his side, seated
sideways on a slate blue-green ox walking a bank of violet cloud
(`content/paintings/laozi.yaml`; four drafts, $0.17, the third kept). His
life: the ox walks slowly, its hooves painted sunk in the bank, so each
leg wades (`inPicture`) rather than leaving a hole; its head nods under the
horns and its tail swings; the whisk's horsetail and the robe's loose end
stir; the bank boils, the hooves spared. A figure made in code too, for
`?paint=off`. Temperament: stately, an ox's pace (1.6), everything turns to
look. Cued at 70–114 s, 1,400 m ahead, 560 m, named 太上老君, "Laozi on his
green ox, going west, a purple cloud before him." at 102 s, the Loess's last
line, between the caption at 95 s and the flight's end; Jingwei's is at 78.

**Guanyin.** Painted as the novel (ch. 8) and the temples show Guanyin of
the South Sea: white robe and hood, pearls and blue beads, the vase in her
left hand, the willow in her right, standing on a lotus on cloud, the white
parrot by her shoulder (four drafts, $0.17, the third kept). Her life: she
leans a little over her feet; the willow's leaves and her sleeves' ends
stir; the parrot's raised wing beats behind its body and the lowered one in
front reaches a little further on each downstroke and never less than
painted, so it never uncovers the hood beside it; its tail fans; the cloud
under the lotus boils, the lotus spared. The figure made in code stands on
its lotus now, with a head. `LIVING_FAITHS` is three: Sanduo, the wind
horse, Miyolangsangma. Her card is sized feet to hood (350 m) and set lower
(`up_m` 80), since at 180 her hood touched the top of the frame; her line
is now the novel's: "Guanyin of the South Sea, who comes when the pilgrims
cannot win."

**Checked.** Held with the cast on (seed 1): Guanyin at 75 s whole over the
horizon, the parrot at her shoulder; Laozi at 104 s coming on over the
Yellow River's valley, 25 % of the frame high (at `up_m` −320 his cloud sat
on the ridge behind him, so he was lifted to −170 and enlarged from 460 m).
The cover's frames at seed 1 plan the same visits as before (the elephant
at the Karst's 8 s, the carp at the Loess's 54 s). `npm run typecheck`;
`npm run content:validate` (film ok, 36 lines of 40); tests 638 of 638.
Paint spent $6.50 of $30.

**Left.** Laozi comes once in most viewings, for his line: Jingwei's line
and the crowd keep the Loess's sky full until 97 s.

## F136 — The phoenix always comes, and the egrets fly in its train, 30 September 2026

**Asked.** For the phoenix, the user chose the fuller of the two offered:
act out 百鸟朝凤, the hundred birds paying court to the king of birds, by
having the Karst's egrets fly in a train behind it whenever it comes.

**Changed.** The phoenix is cast every viewing (its `chance` gone) and named
"The phoenix, king of birds, seen when the world is at peace." A new motion,
`train` (`motions/train.ts`), the fourth that follows another: for each of
the leader's visits, on its path 1.2–2.2 s behind, and behind it across the
picture by 0.45 of the two sizes, past the plumes, 2–6 % of its distance
below the leader's line, as the plumes fall; kept in the picture as the
chaser is (`keptBeside`), over the leader where it comes straight on. A
chaser goes after most visits of its leader (0.8); a train after every one.
Temperament `attends` (egrets → phoenix), looked for after `escorts` and
before `blocks` and `chases`. `moves.ts` gains `FOLLOW_MOTIONS` (the
director's own motions that are not holds), which the director's sides and
the tests use where they named chase, escort and block one by one. The
egrets' line moved from 50 to 84 s: at 50 their named visit overlapped the
phoenix's at 40, and a follower keeps off its own named visit.

**What showed.** Held at 43 s, the egrets were there and not seen: a white
fleck at the horizon. Nine egrets abreast in a chevron, crossing the picture
side-on, are nine birds one behind another. They fly in echelon now, each a
little behind, aside and below the one before, so the line strings out
seen from the side or from behind; and the cue is 700 m (from 440), the
birds 60 m across, since the flock's size is its loop's reach and the birds
are small in it. Held at 43 s, the line of egrets streams behind the plumes.

**Checked.** Stepped a second at a time through the phoenix's named visit
(seed 1, 37–54 s): the egrets come in off the edge at 39 s behind it, keep
0.43 of the half width behind it while it pauses for its line, and go out
after it at 52 s, never jumping. Over 2,000 viewings the phoenix comes 2.2
times for 22.6 s (from 12.1), and 89 % of its visits have their train, its
named visit always; the rest fall on the egrets' own line or past their
cue. The egrets are on for 35 s a viewing (from 23). At their own line
(88 s) the echelon reads as a line of birds.

**Left.** The egrets are still made in code, as are the cranes; beside the
painted phoenix they are small white birds, which a court should be.

## F137 — Companions out of the rock: drawn nearer, the same in the picture, 30 September 2026

**Asked.** A frame of the Three Gorges 52 s in, the White Dragon's body cut
off by the gorge's right wall: "the animal flies through mountain and
rocks. This is just not logical and users will laugh at us."

**What it was.** A companion is placed in the camera's frame (D92), the
White Dragon 2 km ahead and 700 m below, 1 km long. In a winding gorge at
six times relief a point 2 km straight ahead is as often in a wall as over
the river, and the dragon is wider than the gorge. The layer kept a
companion off the ground by one height under its middle, lifting it at
most half its size, and let a peak it passed behind hide it (F111). With
the cast on (seed 1), held at nine moments from 15 to 105 s, the dragon
was cut by a wall or ridge at 15, 25 and 52 s and wholly inside or behind
the rock at 45 and 75 s. Lifting further is no cure: the walls stand
kilometres over him, and he would leave the picture.

**The rule.** Where the rock would still cut a companion or stand between
it and the eye, it is drawn nearer and smaller in one ratio, a scaling
about the eye (`cast/clearance.ts`). Every point of it stays on its own
sight line, so its picture is where it was and as large; only its depth
changes, and it passes in front of the wall. The ratio is the largest at
which its bounds (its group's box, 5 % larger) stand clear of the drawn
ground under them, a 3 by 3 of samples, and no ground rises over the lines
from the eye to its four lower corners and its middle, 24 samples each;
found by six halvings down to 8 % of its distance. If not even that is
clear, it is not drawn. A monument is untouched: it stands on its place
and a peak may hide it.

**Seen.** The nine moments again, same seed: at 52 s the dragon is whole,
drawn at 0.51 of his distance, in front of the right wall where only a
white fleck had shown; at 15 s his tail is over the ridge, not in it; where
he was clear (35, 90 s) nothing moved. The cast layer's frame costs a mean
0.26 ms with the dragon held nearer at 52 s and 0.48 ms with both figures
on at 90 s (headless, the M3).

**Left.** A companion drawn nearer is fogged a little less, as the cast's
fog is by distance; not measured.

## F138 — The Loess in October's clear air, and the Yellow River the colour it is where it runs, 30 September 2026

**Asked.** Watching the Loess at 8:07, the user could not tell what they
were looking at: "the landscape is not greatly drawn … why it looks so
foggy, because it's a desert?" Then: check how the Loess actually looks on
satellite images and in real photographs; then remove the dust haze and
fix the river colour.

**What was on screen.** 8:07 is the scene's first second: Hekou, where the
Yellow River comes off the Hetao plain past Togtoh's power station, its
industrial park, a town and irrigated fields, with the Kubuqi's last dunes
across the river. The gullied loess begins about 30 km on. All of it was
under the scene's look as the design table had it, "Afternoon, dust": a
sky of nearly twice the default haze tinted ochre (`dust-afternoon`,
5e-6 a metre, tint 1.0, 0.86, 0.66, `blue` 0.1), a dust slab to 1,500 m
with a 900 m tail that the camera, 600 m over ground at 1,000 to 1,200 m,
flew inside (`dust-haze`, 5e-5 a metre), and the warm grade. The river was
the palette's one colour, khaki (F127).

**What the place looks like.** The satellite along the rail (EOX
Sentinel-2 cloudless, 2016, which the film's ground is, and 2023 to
compare): olive-khaki ground cut everywhere into fine dendritic gullies,
with tan exposures; not desert. The river is silt-brown at Hekou, dark
jade through the Wanjiazhai and Longkou reservoirs from about 70 km,
grey-green past Fugu, khaki and tan from Jiaxian down. The air (research,
with sources): dust is a spring thing, four fifths of Shaanxi's dust
storms from March to May; sun-photometer aerosol optical depth at Yulin
(CARSNET, 2002–2013) is at its lowest of the year in October, 0.21 at
440 nm against 0.45 in April, and fine particles then (Ångström about 1),
so what haze there is is grey-white, not ochre; MODIS over north-west
China agrees, autumn the cleanest season, and the air has cleared since
2013. Photographs of the gorge in early October show a pale-blue sky,
ridges fading blue-grey for tens of kilometres, the river blue-grey and
clear at Hequ and jade at Laoniuwan, and milky tan at Qiankun Bay and
Hukou. Seven October afternoons of MODIS true colour over the route: two
overcast, two partly cloudy, three clear, no yellow dust on any.

**The air.** The Loess's look is now `autumn-afternoon` (the default's
density, 2.75e-6, over a 4,000 m scale height; a grey tint, 0.98, 0.97,
0.96; `blue` 0.55, so near ridges blue before far ones whiten; turbidity
1.1), `thin-cirrus` (the cirrus the dust had, with no mist under it) and
the `clear` grade. `dust-afternoon` and `dust-haze` are gone: no other
scene named them. The mist's tail (`tailM`) stays in the engine, unused.
The low October sun at 16:00 warms the loess by itself.

**The river's colour along its course.** A palette may now list its
river's colour where it was measured along it (`riverAlong`, latitude,
longitude, colour); `river` stays the colour away from them. At a point
of water the colour is the measured points', each weighted by the inverse
fourth power of its distance softened by a kilometre, so a point's colour
holds round it and gives way to the next about halfway between; past
12 km from every point it fades back to `river` by 25 km, for a
tributary or another river (`riverColourAt` in `water.ts`, and the shader's
`riverAlong`: the points as constants, in kilometres from the first, the
fragment's metres from a new uniform, `uWorldOrigin`, the terrain's origin
and horizontal compression, set every frame beside the camera). A palette
without points compiles to its one colour as before.

The Loess's points are measured by `python -m nineskies.rivercolour
<scene>`: at each rail point, the film's own 10 m photograph round it,
3 km across; the pixels ESA WorldCover 2021 (10 m, CC BY 4.0, read a
window at a time over the network) calls permanent water, less every
patch under 15 ha (the lotus ponds of the Qiachuan wetland by Heyang read
as a green Yellow River otherwise); their median. A point whose water is
under 3 % of its crop is left out (six of 67: dry reaches, or the line off
the river). 61 points, from 0.518, 0.475, 0.318 at Hekou, to 0.22–0.25,
0.29–0.33, 0.24–0.28 in the reservoirs, about 0.3–0.4, 0.33–0.39, 0.26–0.31
past Fugu, and 0.53–0.68, 0.47–0.59, 0.36–0.43 from Jiaxian to Tongguan.

**Seen.** Headless at 1, 30, 60 and 90 s against the shipped frames and
the satellite: the town and fields at Hekou, the reservoir jade at 30 s
where it had been khaki, grey-green at 60 s with the sky in it, khaki at
90 s; ridges to the horizon where the dust had stopped the eye at about
20 km. The Loess's still (60 s) was taken again, and the cover's Loess
card (54 s) and the cover drawn again.

**Checked.** `npm run check`: 638 tests (a river's colour its measured
point's at it, their mean halfway, the scene's own away from them, and
the shader's rule the same; the Loess's air no thicker than the default's
and grey, with no mist; the Yellow River silt at Hekou and Qikou and jade
at Wanjiazhai), and the film validates.

**Left.** The gullies are still the 1 km country grid's, drawn at six
times their height: the relief normals (F93, F94) shade them, but the
ground's shape is broad corrugated hills, where the place is a flat-topped
plateau cut by a maze of narrow gullies a few hundred metres deep. The
scene opens on its least typical ground, Hekou's plain and power station.
The third caption, "It carries a billion tonnes of soil a year", was the
river's load in the last century (about 1.6 billion tonnes); since the
dams and the soil conservation it carries a fraction of that. The Loess's
still and the cover need signing off (D77). Frame cost not measured: the
river's rule is a loop of 61 on water fragments only.

## F139 — The pilgrims and Wukong in a moment of each scene, and in more than one picture, 30 September 2026

**Asked.** A frame of the Karst at 4:30, the party and Wukong: "the motion
lacks variation, it's kind of boring. Either we change the outfit a bit
and/or how they move and/or how they pose." The party was one painting in
five scenes (3, 4, 7, 8, 9), single file on its road, and Wukong one
picture, scouting, in six, kept just past the horse's nose. Offered a
moment of the novel for each scene, the user chose that with the figures
changing pose within a scene, and Wukong in the golden fillet while he
travels with the pilgrims (D99).

**Painted.** Eleven views, four drafts each at high from the kept pictures
as references ($2.64; $9.14 of the $30 spent). The party halted to rest,
the monk turned in the saddle and Bajie leaning on his planted rake; stopped
short at the tiger, weapons out, the horse shying; on the raft of Sha's nine
skulls and Guanyin's gourd over the Flowing Sands (ch. 22); over the frozen
Tongtian in winter cloaks, the hooves bound in straw and Bajie's rake
carried crosswise (ch. 48); arrived in the West, the monk off the horse with
his palms together and the two kneeling. Wukong the rebel taunting whoever
comes after him, and swinging the Rakshasi's plantain fan (ch. 59-61);
Wukong the pilgrim, in the fillet, plain tunic and tiger-skin kilt,
scouting, striking, crouched on his cloud and bowing. A brief's view may
bring a subject of its own for that (`tools/paint.ts`). Each is measured
as its figure's first picture is, eye to sole or by the horse and the
three, so a figure is one size in all of them; a view's size may now reach
past its picture, to twice it, for a crouch or a party halted close. Each
is alive: every person keeps their balance, robes, ribbons, manes, plumes
and the fan stir, the horses' tails swing, the cloud and the golden dust
boil, the raft rocks, and the party walks on the ice.

**The pose axis.** `cast/poses.ts`, the cast's eighth plug axis. A cue
names the views its figure goes in (`poses`) and those it stops in
(`paused`). From each visit's own seed: its first visit comes in the first
it goes in, the author's; every other in one it goes in other than the one
the last left in; where it stops it takes one it stops in, the author's
first for a line; where it goes on, one it goes in, or keeps the one it
stopped in if that is one (0.4); and at a moment its motion hides a change
in (`Motion.swaps`: a hop of Wukong's somersault), half the time another,
having held the one it has 2 s. A change is drawn as the card's own turn:
the one picture narrows to 0.3 of its width and gives way to the other over
0.7 s (`Figure.present`). `PosedFigure` holds a figure a picture, each
scaled to the first, and only those drawn are in its group, for the
layer's box (F137). A follower stops when its leader does, so Wukong
changes with the party: he crouches on his cloud while they rest, raises
his staff when they stop at the tiger, bows when they arrive. Only a
painted figure has poses; `?paint=off` draws its variant as before.

| Scene | The party goes / stops | Wukong goes / stops |
|---|---|---|
| 1 Huangshan | — | scout, taunting |
| 3 Karst | the road / halted to rest | pilgrim, crouched / crouched |
| 4 First Bend | the road / the tiger | pilgrim / striking |
| 7 Turpan | the raft | the fan, scout (Flaming Mountains); pilgrim, crouched / crouched (Flowing Sands) |
| 8 The Roof | the ice | pilgrim, crouched / crouched |
| 9 The Wall | the road / arrived | pilgrim / bowing |

**Motion.** The party stops on the road more often than not: a
temperament's `pauses` (0.35 for all, as before; the party's 0.7). Wukong
ranges: each escort visit keeps him up to half the party's length further
ahead and a third of it higher, drifting about that by 0.12 over 7 to
12 s, out ahead and back. The height only where there is room for it under
the top of the picture: at the Wall and the Flowing Sands, where the party
rides high, it had pushed him out to the edge, as an escort with no room
over the party is. A named visit keeps him where his author put him, beside
the party for the line.

**A slip.** The card's size cap first took its own group's scale as a
pose's, which for a figure drawn alone is the layer's scale again: every
card came out 20 to 60 times smaller. The session placing Nüwa found it;
fixed, and a test draws a card alone where the slip shows.

**Checked.** Seed 1: in the Karst the party stops to rest at 25.6, 52.5
and 96.0 s, at the First Bend at the tiger at 29.6 and 97.2 s, at the Wall
it arrives for its line at 69.6 s; the Flaming Mountains Wukong comes with
the fan. Held at twelve moments across the scenes, the pictures are whole
and the figures in the picture; stepped through the Karst's change at
25.5-26.5 s, the party and Wukong narrow together and open again at rest
and crouched. Every new picture labbed 24 frames: no tear. The cover's
frames retaken: Turpan (Wukong after the Bull with the fan) and the Wall
(the party arrived, Wukong bowing beside it) changed and are kept, the sheet
and postcards redrawn; the other seven showed the same picture and stand.
The stills are drawn without the cast. Tests and `content:validate` pass.

**Left.** The Loess's monk alone and the party's walk on the road are still
one picture each. The cast layer's frame cost with two pictures of a
figure bent at once, for 0.7 s at a change, is not measured.

## F140 — The wind horse out of the Roof, and Nüwa in its place, 30 September 2026

**Asked.** A frame of the Roof at 14:37 with the flags named: "Remove this
thing … as a Chinese native, I have no idea what this is." The line of
prayer flags between two clouds, 风马旗, is Tibetan; a Chinese viewer
reads it as bunting in the sky, and the line did not help. Offered four
figures of Chinese myth for the slot (Nüwa mending the sky, the heavenly
horse, the Torch Dragon, Yinglong), the user chose Nüwa (D98).

**Changed.** The flags are gone, and the figure with them:
`figures/lungta.ts`, its kind, its temperament, and its place in
`LIVING_FAITHS`, which keeps the Naxi god and the goddess of Chomolungma.
The one thing only the flags used goes too: a temperament's `facesPath`
and the path's `fixedYaw`, which held a thing on the wind broadside to the
lens; every figure left faces the way it goes.

Nüwa takes the flags' cue: over the first leg from Qinghai Lake, on the
left, 22–60 s, named at 30 s, "Nüwa, who mended the broken sky with stones
of five colours." (女娲补天). Painted (`content/paintings/nuwa.yaml`, four
drafts at high, the first kept, $0.18) as the Han reliefs show her, a
woman to the waist in a Han robe and a serpent below, rising with both
hands holding up the glowing stone, the five colours in it. Her life
(`paintings/nuwa.ts`): the serpent swims a slow wave down to its curled
tail and carries the wisps at its coils; she rides the head of the wave
and keeps almost still; ribbon, hair, hanging sleeve and robe stir; the
clouds clear of her coils and the stone's smoke boil, spared the scales
and the stone; she noses into her climb. A code-made figure for
`?paint=off` (`figures/nuwa.ts`), the serpent a tapered tube rebuilt each
frame. Temperament stately, mostly crossing, high in the band; her coming
turns heads (`look`). The cast is 24 kinds again.

**What showed.** At the flags' spot, 260 m up, her stone was cut by the top
of the picture through her named pause: a flag line is thin, and she
stands half her height over her middle. At 120 m up she is whole from 28
to 40 s, above the horizon with the stone in the sky, and leaves off the
left edge.

**Checked.** Held at seed 1, 28–44 s, a frame every 3 s: whole, no tear in
the ribbon, the body or the cloud. The other figures of the Roof keep the
plans they had with the flags at seed 1 (Nüwa takes the flags' place in
the director's draws), so the Roof's cover (F131, 86 s, the turtle) stands.
Cast and film tests and `content:validate` pass.

**Left.** Her second visit in a viewing, and her look in a tall picture,
are not looked at.

## F141 — The road in three pictures, and the monk alone in four, 30 September 2026

**Asked.** After F139: "Give the Loess monk and the road walk more poses
too." The party's walk on the road and the monk riding out of Chang'an
were still one picture each.

**Painted.** Five views, four drafts each at high from the kept pictures
as references ($1.04; $10.16 of the $30 spent). The road led by Sha, the
monk on the horse telling his beads, Bajie last under the luggage with the
rake through its ropes; the road on foot, the monk leading in a bamboo
pilgrim's hat, the horse unridden behind him. The monk alone: on foot
leading the horse; halted, turned in the saddle with a hand raised to the
city he leaves; dismounted and praying, the horse's head low beside him.
Each measured as the picture it goes with, by the walkers' heights and the
horse, and alive: every walker and the horses step, their feet wading, the
heads nod, tails, ribbons, tassels and robes stir, the cloud boils.

**Cast.** The Karst's party goes in three pictures of the road, the First
Bend's in two, and the Wall's comes in on foot and arrives, then goes on
riding. The Loess's monk goes riding or leading the horse and stops to
look back and to pray. A long stop, with more than one picture to stop
in, takes the second halfway (`poses.ts`, `LONG_STOP_S`, 5.4 s): the monk
is named at 24 s as he waves farewell to Chang'an, then prays for the
road, and goes on.

**Checked.** Seed 1: the Loess monk comes riding at 19.8 s, waves at 23.6,
prays at 27.4 and leads the horse off at 31.2; the Karst's three visits
come in the road, led by Sha, and on foot. Held in the film at each, the
pictures whole and one size with the ones they follow. Every new picture
labbed 24 frames: no tear. The cover frames of the Karst, the First Bend,
the Loess and the Wall, retaken, show the same pictures and stand. Tests
and `content:validate` pass.

**Left.** The Loess monk's second visit, where a viewing has one, may
stop in either picture; not looked at.

## F142 — Every painted companion in a second picture, 30 September 2026

**Asked.** After the pilgrims (F139, F141): "Give the other cast figures
more poses too."

**Painted.** A second picture for each of the 20 painted companions, 21 in
all, four drafts each at high from the kept picture as reference, with the
figure, dress and light kept and only the pose new ($4.52; $14.68 of the $30
spent). Nezha charging on his wheels, the spear thrust ahead; the White
Dragon diving; the Jing River King rearing, roaring; Yao Ji spreading the
rain over the gorge from her sleeves; the phoenix, the magpie and Jingwei
gliding, Jingwei's pebble about to fall; the Peng stooping; Guanyin pouring
from the vase and scattering the dew; the tiger stopped, roaring; Sanduo's
horse rearing at its empty saddle; the carp arched at the top of its leap,
its barbels lengthening; Laozi reading his book on the halted ox; the Queen
Mother offering the peach; the Bull Demon King, horns lowered, bellowing;
the Eight Immortals each afloat on their own art (the gourd, the fan, the
sword, the donkey, the lotus, the basket, the flute, the castanets); Nüwa
swimming level, the stone at her breast; the qilin stopped, looking back;
the old turtle, neck raised to ask his question; the tigress of
Miyolangsangma lying at rest; the elephant drinking from the Li.

Each measured to its figure's first picture by what did not change shape:
SIFT matches between the two pictures (OpenCV in a scratch environment),
clustered by RANSAC, the head's or the saddle's cluster giving the scale;
the carp and the qilin, with too few matches, by eye on a grid (body
length, withers). Each alive: every one keeps its balance or rocks where it
floats, tails, sashes, ribbons, manes, pennants and wingtips stir, flames
lick, the dragons and Nüwa swim their waves, clouds boil. Every one labbed
24 frames: no tear.

**Cast.** A beast or a god stops in its new picture, for its line and
whenever it pauses: Yao Ji rains, the elephant drinks, Guanyin pours the
dew, the tiger roars, Sanduo's horse rears, the Jing River King rears,
Laozi reads, the Queen Mother offers the peach, the Bull lowers his horns,
the qilin looks back, the turtle asks, the tigress rests. A flyer goes in
both, a visit in one and the next in the other: Nezha, the White Dragon,
the phoenix, the carp, Jingwei, the Peng, the magpie, Nüwa, and the Eight
Immortals, who come first on their arts, as their line says.

**A change as it stops.** The change into the picture it stops in began as
it stopped, 0.4 s before its line, and lasted 0.7 s: the Turpan cover card,
at the Bull's line, caught him and Nezha half turned. It now begins 0.7 s
before the stop, so a figure has come round into its stopped picture by the
time it stops and its line comes (`poses.ts`); the pilgrims' changes
(F139, F141) move with it. A figure that only goes in several pictures holds
its line in the author's first; only a cue that names what it stops in
takes a second halfway through a long stop (F141).

**Checked.** Seed 1, held in the film at each line: every figure in its
stopped picture, settled. The cover's frames retaken: the Karst (the
elephant drinking), the First Bend (the tiger roaring), Grassland (the
magpie gliding), Turpan (the Bull's horns lowered at a charging Nezha) and
the Roof (the turtle's question) changed and are kept, the sheet and
postcards redrawn; the Three Gorges and the Loess showed the same and
stand. Tests and `content:validate` pass. The five cards signed off by the
user, 30 September 2026.

**Left.** Every picture of a figure is loaded with its scene: the cast's
pictures now take about 30 to 100 MB of the GPU a scene (Turpan's 14 the
most), from 16 to 55 before F139, not measured on a phone. The egrets
follow the phoenix's path, which poses do not change. The monuments (the
Dragon Kings, the slain dragon) stay in one picture.

## F143 — Huangshan's camera kept off the granite, 30 September 2026

**Asked.** A frame of Huangshan under its first caption: "we are colliding
with the mountains". A granite face filled half the picture beside the lens.

**Found.** Not a drawing fault: the ground the altitude reads and the ground
drawn agree to the metre (the hero area answers under the camera; a ray
marched through the frame meets the sampled ground where the picture shows
rock). The camera reads the ground only along its heading, 1.5 km ahead
(F81), so it flies among the spires rather than over them. It was flying
past them too near. Played headless at 10 Hz, it passed ground as high as
itself 200–450 m off between 16 and 27 s, which the horizontal compression
(eight) draws 25–55 m off. The played frames at 18–23 s are rock to the
lens; a hold at 16 s is inside a face.

**Changed.** A scene may name a clearance, `clear_m`: the altitude reads
the ground round the camera out to it (three rings, a bearing every 20°)
and that far either side of its way ahead, at each look-ahead sample, as
it reads the ground ahead, so it climbs for a face beside its way before it
is beside it. Nought, the film's, reads the line alone as before, so the
gorges' walls stay beside the camera (F81's refusal of a swath to the
frame's edges stands). Huangshan names 400 m. The sightlines' digest takes
the clearance where a scene names one, so the scenes that name none keep
theirs; Huangshan's were worked out again (its kings are behind the ground
for less of the flight), and its frame-cost station flies at 1,402 m (from
1,242).

**Checked.** Played headless, the nearest ground as high as the camera is
now 1.15 km off (145 drawn units; it was 200 m), and nothing comes within
60 units at any second of the scene. Played frames at 16–30 s: the massif
whole ahead to 20 s, then the camera over the southern peaks. 600 m flew
the same. The cast's plan at seed 1 is unchanged; at the cover's moment
(34 s) the camera is 94 m higher. 652 tests pass.

**Left.** Over the southern peaks (23–30 s) the massif is under the frame's
foot and the picture is mostly the cloud sea: the rail flies over the peaks
there, and the clearance now keeps it high enough to. A rail that threads
between them would give the picture back. The other scenes are not
surveyed for near passes; only Huangshan names a clearance.

## F144 — A named figure whole in a window narrower than the film's, 30 September 2026

**Asked.** "Fix Nüwa being cut off in the tall window": in the browser pane
(716 × 774) she stood half off the left edge as her line came on, and was
gone off it by 33 s, her pause (29.6–38.6 s) not over.

**Found.** The view's height is the film's (62°) whatever the window, so a
narrower window loses the sides: 58° across in the pane against 94° at
16:9. A path's keys set in the picture's terms (where a figure comes in
and goes out) are laid for the window it is drawn in, but two are set in
metres for the film's own picture: the author's spot for a named figure,
and the end of its pause's drift, kept within 0.8 of the wide picture
(F113). Nüwa's spot, a quarter of the way to the left edge at 16:9, is
near the edge of the pane, and the drift took her past it.

**Changed.** A key set in metres that the film's picture holds is brought
in across a narrower one until the figure, `halfWidthM` either side (the
cue's size × 0.6, the pad a figure clears an edge by), is no more out of
it than it was out of the film's: whole if it was whole, centred if it is
wider than the picture (`heldInNarrower` in `motion.ts`, applied as a
path is laid for the view). Only across, and only inward; a key meant to
be off the picture or behind the lens stays, and at 16:9 or wider nothing
moves, so the film's frames, covers and stills are as they were. Every
named figure on a path has it, not only Nüwa.

**Checked.** Held at seed 1 in the pane's shape, 28–38 s: whole in every
frame. In a phone's (390 × 844) she is wider than the picture's half and
fills it, tail tip to stone. A test holds every transit motion's named
pause inside the pane and a phone, three seeds each, and the film's own
picture untouched. 653 tests pass.

**Left.** Only named pauses and drifts are held; a figure passing through
unnamed in a tall window crosses it faster and nearer its edges, as it
enters and leaves by that window's own edges already.

## F145 — The film on Telbase, its packs in the project's private bucket, 30 September 2026

**Asked.** "Deploy to telbase.ai. We have an R2 storage, check how it
works." Then, of the two ways offered, the packs in Telbase's own storage
with a function that signs for them (D100).

**How Telbase's storage works.** `telbase storage` (or `deploy --storage`)
gives a project one Cloudflare R2 bucket, private: no public address, S3
keys with full access (`storage credentials`), and CORS origins
(`storage cors`). The deployed project is given the same keys as
R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.
Telbase counts a static site as a website (without limit on the paid
plans) and a server as an app (limited), so the film stays a static site
with one function beside it, and no project needed deleting.

**Built.** `tools/telbase/api/pack.mjs`, the site's one function: a
pack's key (`<index folder>/packs/<scene>.bin`, nothing else) is sent on
with a 302 to R2, signed (Signature Version 4, S3's query form, with
Node's own crypto, so the site has no package.json and deploys as static)
as of the day's start for two days, so the link is the same all day and
caches. The site is built with its packs' base at `/api/pack?key=<folder>`
(`VITE_PACKS_URL`), so the app is unchanged. `tools/hostPacks.ts` sends
the packs with the keys the Telbase CLI gives each time it runs, never
written or printed, and checks what is there with a signed HEAD.
`make telbase` builds, stages `dist-site/` with the function, deploys it
as the project's one service with its storage, lets the site's origin
read the bucket, and sends the packs (before the deploy, once the
repository is linked, `.telbase/`, which git ignores). The first deploy
linked the repository as a project whose one service is `./dist-site`.

**Checked.** The signer reproduces AWS's worked example of a signed link.
Live: the site answers without a login; `/api/pack` answers 302 to a link
in `nine-skies-files`, and 404 to any key but a pack's; each of the nine
packs answers at its size in the index, with `Access-Control-Allow-Origin`
for the site and `immutable` caching. In a headless browser at
https://nine-skies.telbase.ai the opening's pack comes through the
function from R2, the massif rises under the chapter card, and the next
pack follows. Here R2 gives 1.56 MB/s, the line's own speed (Cloudflare's
speed test 1.50 MB/s; the site's own files from Vercel 0.30 MB/s).
1,074 MB sent once; sent again, nothing.

**Left.** Telbase's storage status still read 0 objects after the upload
(its usage lags). Not played on a phone yet (stage 6's "done when"). The
link is the telbase.ai one; no domain of its own.

## F146 — The cast off at every visit, and the cover without it, 30 September 2026

**Asked.** The film's first viewers, on the site: the figures should be
off by default. They were already off for a first visit (D91): a fresh
browser at https://nine-skies.telbase.ai opened with the switch up and
none of the cast's code or paintings fetched. They came on from the start
only by a link with `?cast`, or in a browser where the viewer had once
brought them on, since the switch remembered the choice there
(`nineskies.cast`). And the cover, the picture a shared link shows, had a
figure on every card (F131), so the film looked like it was about them
before it opened.

**Built.** The switch no longer remembers: every visit opens without the
cast, the lantern and J bring it on for that viewing, and only `?cast` in
the address opens with it (`wantedAtStart` reads the address alone; a
stored choice from before is ignored). The cover's frames are taken with
the cast off (`npm run cover -- frames` opens `?cast=off`), at the seconds
F131 chose, which hold without their figures, but for Huangshan: at 34 s
the camera is kept over the peaks (F143) and the card was cloud, so it is
taken at 12 s, the granite rising out of the cloud sea ahead. The sheet
(`app/public/cover.png`) and the postcards drawn again; the cards' words
say what ground they show.

**Checked.** The switch's test: off with no address, on with `?cast` or
`?cast=on`, off with `?cast=off`. The nine frames looked at on the sheet
and the postcards.

**Left.** Apps that showed a link already keep their old preview for a
while (they cache it). The site's `og:image` is `./cover.png`, relative;
some apps want a full address.
