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
