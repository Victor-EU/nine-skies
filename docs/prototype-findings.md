# Prototype findings — phase 0

2026-09-20 · running log for gate G1

Findings from building the foundations, the D3/D4 spike, the horizon impostor
and the first real-elevation corridor build. Each one is a decision the build
plan needs to absorb, not a bug report.

## F1 — The impostor is a plateau feature, not an approach feature

**This finding replaces two earlier versions, and the corrections matter more
than the finding**, because the build plan was about to be changed on the
first one.

The first version said: the plateau wall is 564 km ahead from the Sichuan
Basin, the terrain cache draws 384 km, therefore Expedition 1's signature
moment — "the plateau rising like a wall ahead" — cannot render, therefore the
impostor must land before the G1 playtest or the gate fails for the wrong
reason. The premises are true; the conclusion is not. A wall only looks like a
wall from close to it, and close enough is inside the cache.

**Geometry.** Apparent angle above the horizon, flying 900 m above local
ground along the Sea to Sky corridor at 1:8 and 1.5×:

| Inland | Wall ahead | Streamed terrain | With impostor | Impostor adds |
| ---: | ---: | ---: | ---: | ---: |
| 2,000 km | 1,312 km | below the eye | +0.25° | first sighting |
| 2,200 km | 1,112 km | −3.13° | +1.12° | 4.24° |
| 2,400 km | 912 km | −3.60° | +1.35° | **4.95°** |
| 2,600 km | 712 km | −0.12° | +2.83° | 2.95° |
| 2,760 km (basin) | 552 km | +1.31° | +3.24° | 1.92° |
| 2,900 km | 412 km | +3.88° | +4.25° | 0.37° |
| 3,000 km | 312 km | +4.04° | +4.08° | — |

The reveal — the wall going from a line on the horizon to something filling
the windscreen — happens between roughly 300 km and 100 km out, and **300 km
is inside the streamed radius**. So the second version said: the impostor buys
the approach rather than the arrival, peaking around 2,400 km inland where the
streamed horizon sits below the eye and there is nothing above it but sky.

That was also wrong, and fixing F9 is what showed it. Geometry is only half of
visibility; the other half is how much air is in the way. Measured by
framebuffer readback, impostor on versus off, out of 765 possible units of
channel difference:

| Looking from | Region density | Impostor height | Contrast against sky |
| --- | ---: | ---: | ---: |
| Uplands, 2,400 km | 2.8e−5 | **4.44°** | 32 — a whisper |
| Sichuan Basin, 2,760 km | 5.2e−5 | 1.09° | 13 — invisible |
| Plateau edge, 3,400 km | 6.8e−6 | 0.57° | 96 |
| Plateau, 3,900 km | 6.8e−6 | 1.01° | **102 — a hard white ridge** |

The approach has the angle and none of the contrast: 900 km of lowland air in
late autumn eats the plateau completely, which is exactly what it does in
life. The plateau has almost no angle and all of the contrast, because the air
up there is glass — so the Himalaya arrive as a crisp white line against deep
blue, and without the impostor that is empty sky.

**So the impostor belongs to Expedition 7, not Expedition 1.** Standing on the
plateau and seeing the Himalaya 450–1,150 km off is the thing it draws that
nothing else can.

**Action.** Keep it: it is built, it costs one draw call, and it carries the
destination of the expedition the GDD ends on. Do **not** gate G1 on it — that
was the wrong conclusion twice over. `H` toggles it in the prototype so the
cohort can answer the question instead of us guessing.

**And a process note worth more than the finding.** Three versions, and each
correction came from building the thing and measuring it, not from thinking
harder. The first two readings were made from screenshots and arithmetic; the
one that held up came from reading the framebuffer. Numbers that decide plan
changes should come from the frame buffer.

## F2 — 384 km is a floor, not a budget

The GDD's performance table quotes 120 km of view distance, and the risk
register's mitigation for "browser cannot hold the plateau view distance" is
to reduce it to 90 km. Measured, at the heart of the approach:

| Inland | 384 km view | 90 km view |
| ---: | ---: | ---: |
| 2,900 km | +3.88° | −1.86° |
| 3,000 km | +4.04° | −3.39° |
| 3,100 km | +3.97° | −1.39° |
| 3,200 km | +2.87° | +0.13° |

At 90 km the plateau is not smaller, it is **gone** — the horizon drops below
the eye and the windscreen is ground and sky. That mitigation would delete the
moment it was meant to protect.

The near field is the load-bearing part, which is the opposite of what the
first draft of F1 assumed. So the order to cut in is: impostor shells first
(they carry anticipation, and the world degrades to what it is today), then
LOD detail, and the near radius last and never below about 300 km.

**Action.** Split the GDD's performance target — near field ~380 km at full
LOD, impostor horizon to 1,200 km — and rewrite the risk register mitigation
in that order. 1,200 km is not arbitrary: the plateau first clears the horizon
at 2,000 km inland with the wall 1,312 km off, so a shorter reach clips the
first sighting and a longer one draws ground nobody can see.

## F3 — Expedition 1's climb budget only closes if the climb starts at Shanghai

**Measured**, and locked into a test (`test/sim/flight.test.ts`). Flying full
climb at cruise:

| Climb starts at | Distance to Lhasa | Altitude on arrival |
| --- | --- | --- |
| Shanghai (0 m) | 2,980 km | above 4,500 m — fits, ~15 % margin |
| Chongqing (1,000 m) | 1,540 km | below 4,500 m — does not fit |

Altitude is the one axis that is not compressed, so the horizontal gain does
not help. About 84 % of the expedition is spent climbing.

This is the right answer rather than a problem — it is the thesis in the
controls — but it has three consequences:

- Expedition 1's autopilot must begin climbing on the eastern plain, not at the
  mountains. Route authoring has to encode that.
- A player who takes the stick and dawdles over the Three Gorges arrives below
  the plateau rim. Terrain contact bounces rather than crashes, so it is not
  fatal, but it will feel bad. The rejoin behaviour should restore altitude,
  not just heading.
- The per-leg speed mode the GDD already allows is the tuning lever: dropping
  the western legs to low speed buys climb time without touching the physics.

## F4 — Tuning that came out of the aircraft, and what it buys

The aircraft was tuned to one target: a service ceiling just above Everest base
camp. Everything else followed.

| | Value |
| --- | --- |
| Service ceiling | 6,197 m |
| Climb rate, sea level | 7.1 m/s |
| Climb rate, plateau (4,500 m) | 2.1 m/s |
| Boost cut-out | 3,564 m (stated as density ratio 0.70, not as an altitude) |
| Cruise turn radius, coast → plateau | 141 m → 222 m |
| Cruise ground speed, coast → plateau | 130 → 163 km/min |

The ceiling does a lot of teaching for free: Namtso (4,718 m) and Everest base
camp (5,150 m) are reachable, and the summit (8,849 m) is not — so the player
looks *up* at Everest, which is what you actually do. Expedition 7 depends on
this, and `test/sim/aircraft.test.ts` fails if the ceiling drifts out of band.

## F5 — Cards will quote colder numbers than the GDD prose does

The GDD's Ice to Coconuts describes "Harbin at -25 °C, Sanya at 25 °C". Those
are closer to January daily minima than to monthly normals — the normals are
about -18 °C and 22 °C. The build plan's rule is that a card's figure must match
what the HUD showed, and the HUD will read the normal.

**Action.** A note for content production, not a code change: either the cards
quote normals and the prose follows, or the cards explicitly say "January mean
daily minimum". Worth settling before 230 cards are written to the wrong
convention.

## F6 — The haze model could not express 600 km

Aerial perspective was sampled at the far end of the sight line:
`exp(-targetHeight / H)`. Over a 384 km world that is close enough. Over a
1,200 km one it is not: the line of sight to a 4,500 m ridge spends almost all
of its length in the thick air *below* that ridge, and taking only the ridge's
own height made distant mountains arrive as clean, dark cut-outs pasted on the
sky — the single worst thing a horizon impostor can look like.

The fix is a closed form, not a march: for an exponential atmosphere the mean
density along a straight path is the integral of `exp(-y/H)` between the two
heights, divided by the height difference. Two exponentials, and distance
reads on its own.

The densities also had to be retuned — they were fitted against a world a
third as deep — and the retune is what exposed F7.

## F7 — The region atmosphere table was written and never connected

`SPIKE_REGIONS` held three parameter sets from the start and nothing read
them; the prototype ran one global density everywhere. That was invisible
while the world stopped at 384 km and obvious the moment it did not, because a
single density makes every region's horizon look the same — and "the plateau's
air is clean and its horizon is hard" is the first thing the GDD promises
about the destination.

Now blended at the aircraft from three stand-in region weights. This is **not**
D14, which blends nine sets by per-pixel region weight and drives music and
card triggers from the same numbers. It is the smallest thing that lets the
playtest see the intended look: the basin reads as milk, the plateau reads as
glass, and the invariant that the haze colour and the clear colour are the
same value means terrain fading into the distance lands exactly on the sky.

**Action.** D14 stays scheduled. Nothing here anticipates its interface.

## F8 — The hypsometric ramp had the snow line 1,600 m too low

The ramp blended to snow from 3,800 m, which painted the entire Tibetan
Plateau as an ice sheet — Expedition 7's players would have arrived somewhere
that does not exist. Permanent snow on the plateau starts around 5,400 m. The
ramp now runs plateau → alpine → snow with the transition there.

Land cover (workstream A step 7) supersedes the whole ramp, so this is
temporary. It is worth recording anyway, because it is the first case of the
rule that the GDD sets and this project has to keep: **a colour stop is a
factual claim.** A ramp is a small map legend, and a wrong stop is a wrong map.

## F9 — The shaders were writing linear colour to an sRGB framebuffer

The one that was hiding under everything else. three converts the clear colour
from the linear working space on its way to the screen; it does not touch a
custom `ShaderMaterial`'s output. The terrain and impostor shaders were
computing in linear and writing it raw. So at full haze, ground landed on
**(149, 167, 195)** while the sky it was fading into cleared to
**(199, 212, 229)** — a hard 50-unit seam along the horizon, in the one place
this game cannot afford one, in every screenshot taken so far.

The ramp constants had been picked by eye, which means they were sRGB, and
were being consumed as linear. That cancelled out for unlit ground, which is
why the terrain looked broadly right and the bug survived the whole spike.

Fixed by converting in both directions in the shared chunk: ramp stops in,
display encoding out, lighting and haze in linear between them. The haze
densities then had to be retuned a second time, because the first tuning had
been compensating for a haze colour that was landing half as bright as it
should.

**This was invisible to every test in the suite and will stay invisible**, and
CI has no GPU to catch it. It took a framebuffer readback to see it. The
readback probe used here should become a tool in the repo before G1 rather
than a thing retyped into a console.

## F10 — The country grid was the wrong shape, from two true numbers

The build plan specified the Albers output grid as **5,200 x 5,500** samples at
1 km, and 82 x 86 tiles of 64 km. Reprojecting China's bounding box — lon
73–135 E, lat 18–54 N, which is the box the plan itself names — gives:

| | Plan | Measured | |
| --- | ---: | ---: | --- |
| East–west | 5,248 km | **6,628 km** | 1,380 km too narrow |
| North–south | 5,504 km | **4,351 km** | 1,153 km too tall |
| Tiles at 64 km | 82 x 86 = 7,052 | 105 x 69 = **7,245** | +2.7 % |

Both plan numbers are real facts about China. 5,200 km is roughly its
east–west extent measured near 40 N, and 5,500 km its north–south extent
counting down to the Nansha Islands at 4 N. Neither is the bounding box of a
*projected boundary*, which is the only thing a raster grid can be: 62 degrees
of longitude measured along the box's **southern** edge at 18 N is 6,560 km, so
the projected box is much wider than the country is at mid-latitude, and the
span from 18 N to 54 N is only 4,351 km however far the islands reach.

The grid is now **105 x 69 tiles = 6,720 x 4,416 km**, origin snapped to a
64 km multiple at (−3,456 km, +1,792 km) in Albers metres, frozen as constants
in `pipeline/nineskies/grid.py` with `test_grid.py` reprojecting China's
boundary and failing if it ever stops fitting — or if the grid drifts more than
one spare tile larger than it needs to be.

**What this costs, which is almost nothing.** 7,245 tiles against a planned
7,052 is 2.7 % more, so the ~30 MB elevation budget survives. The horizon field
grows from 657 x 433 (556 kB) to **841 x 553 (930 kB)**, which is still inside
the "<1 MB" line in the shipped world budget. Nothing in the frame budget
moves, because view distance is a radius and not a fraction of the world.

**What it would have cost later.** Tile indices reach into the content hash and
into save files. Discovering this after tiles shipped means either a migration
or a world that is quietly missing its west and its east. Twelve hundred
kilometres of Xinjiang and the Northeast would have been outside the grid, and
the symptom — terrain stops — looks exactly like a streaming bug.

Two smaller corrections came out of the same arithmetic:

- The plan's "2,232 one-degree tiles" counts **cells**, not files. 263 of them
  are open ocean and do not exist in the bucket, so the full acquisition is
  **1,969 files**.
- The rasters are *sample* grids, not cell grids: 64 cells but 65 samples per
  tile side, with the outer half-sample hanging outside the window. Without the
  extra row and column the last tile in each direction has no 65th sample to
  read and the shared edge the whole seam strategy depends on does not exist.

## F11 — The projection loses 1.2 % of every distance, and F3 survives it

An equal-area projection preserves area by construction and distorts distance.
The aircraft moves in projected metres, so in-game distances are the projected
ones. Measured against WGS84 geodesics along the Sea to Sky route:

| Leg | Geodesic | In-game | |
| --- | ---: | ---: | ---: |
| Shanghai → Wuhan | 688.0 km | 678.9 km | −1.32 % |
| Wuhan → Yichang | 289.7 km | 286.0 km | −1.30 % |
| Yichang → Chongqing | 473.5 km | 468.6 km | −1.05 % |
| Chongqing → Chengdu | 267.8 km | 265.9 km | −0.71 % |
| Chengdu → Lhasa | 1,253.8 km | 1,238.5 km | −1.22 % |
| **Whole route** | **2,972.9 km** | **2,937.8 km** | **−1.18 %** |

F3's climb budget was computed against 2,980 km, and that turns out to be the
*routed* distance rather than the straight line — 2,973 km geodesic through
these waypoints, against 2,913 km great-circle direct. So F3 was measuring the
right thing, and the projection takes 1.2 % off it: **2,938 km in the game**.
Against F3's roughly 15 % climb margin that is noise, and the finding stands
unchanged.

Worth recording anyway, because the number is load-bearing in one specific way:
the GDD's honest-scale pillar is a claim about **area**, and someone will
eventually compare an in-game distance to an atlas. The answer is that it is
1.2 % short across 2,900 km, that the error is consistent rather than random,
and that the alternative — preserving distance — would break the Heihe–Tengchong
split, which is the claim the GDD actually makes.

## F12 — "Cubic resampling" cannot survive a 30× reduction, and the Everest probe cannot survive 1 km

The build plan specified stage 2 as "mosaic and reproject to Albers 1 km with
cubic resampling". Copernicus GLO-30 is 30 m, so each 1 km cell covers about
1,100 source samples, and cubic reads **sixteen** of them at the cell centre.
That is not a reduction, it is a point sample with a smoothing kernel: the
value is whichever crag happened to sit under the centre, and it aliases.

The three obvious alternatives each break something. Measured on the roughest
tenth of cells in three blocks of real GLO-30, reducing 30 m to 1 km:

| | Relief | b = 0 (mean) | b = 0.25 | b = 0.6 | b = 1 (max) |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Crest lost** | | | | | |
| Bhutan Himalaya | 242 m/km | −249 m | −187 m | −100 m | 0 m |
| Three Gorges | 41 m/km | −79 m | −59 m | −31 m | 0 m |
| Sichuan uplands | 48 m/km | −79 m | −59 m | −32 m | 0 m |
| **Valley floor lifted** | | | | | |
| Bhutan Himalaya | | +235 m | +293 m | +375 m | +469 m |
| Three Gorges | | +55 m | +73 m | +100 m | +130 m |
| Sichuan uplands | | +52 m | +70 m | +103 m | +130 m |

where `b` is the same silhouette bias the horizon field uses: `mean + b × (max
− mean)`. Two things fall out of the table. The first is that **at 1 km the
resolution dominates the choice** — the Himalaya lose at least 100 m of crest
and gain at least 235 m of valley floor whatever you pick. The second is that
the bias only acts where there is relief: on flat ground max, mean and min
coincide and every value of `b` returns the same answer, which is why the
Sichuan Basin floor and the Yangtze delta do not move at all.

Stage 2 now uses **b = 0.25**. The argument is asymmetry, not balance: stage 3
carves river channels back down by burning HydroSHEDS centrelines, so valley
lift has a later stage that undoes it, and nothing anywhere restores a crest
once it is averaged away. So err toward the crest, but not far enough that
unconditioned valleys become unflyable before stage 3 lands.

**And the Everest probe cannot pass — not at 1 km, and not at 30 m either.**
The plan asks for 8,849 m ± 40 m, with the parenthetical "1 km resampling clips
a sharp summit" as though 40 m were the allowance for that. So I fetched the
Everest tile and asked the source directly:

| | Value | Against the survey |
| --- | ---: | ---: |
| 2020 China–Nepal survey | 8,848.86 m | — |
| **GLO-30 at native 30 m, its own highest sample** | **8,737.8 m** | **−111 m** |
| A 1 km cell, pure maximum (b = 1) | 8,737.8 m | −111 m |
| A 1 km cell, b = 0.25 | 8,504.6 m | −344 m |
| A 1 km cell, mean (b = 0) | 8,426.9 m | −422 m |

**The source is 111 m low before the pipeline touches it**, so no resampling
choice and no resolution can pass a ±40 m check. This is not a defect in
Copernicus: GLO-30 derives from TanDEM-X radar, which at a snow and ice summit
both penetrates the surface and averages the summit pyramid across its
resolution cell. The same signature shows on every sharp peak in the corridor —
Namcha Barwa −427 m, Yulong Xueshan −151 m, Gongga Shan −118 m, Gangkhar
Puensum −69 m against their published heights.

So the probe as written is testing the radar's summit fidelity, not the
pipeline, and would fail forever while looking like a pipeline bug.

**What the probe became.** Two of the three fixes above turned out to be in
tension, which only showed up on measuring rather than arguing. A tolerance
"that admits the source's own offset" (±150 m) is only needed if you keep
expecting the survey height; once the expectation is restated against the
source, the right tolerance is whatever the *reduction* costs — and that is
much smaller. Reducing the Everest tile from 30 m with the stage-2 bias:

| Destination | b = 0 | b = 0.25 | b = 0.6 | b = 1 | Lost vs source at b = 0.25 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 90 m (hero grid) | 8,725.7 | 8,728.7 | 8,732.9 | 8,737.8 | **−9.1 m** |
| 250 m | 8,680.7 | 8,695.0 | 8,715.0 | 8,737.8 | −42.8 m |
| 500 m | 8,543.3 | 8,591.9 | 8,660.0 | 8,737.8 | −145.9 m |
| 1 km (country grid) | 8,277.1 | 8,383.3 | 8,532.0 | 8,732.9 | −354.5 m |

And the reason ±150 m at 1 km would have been a fiction rather than a loose
check: **at 1 km the answer depends on where the grid happens to fall.**
Shifting the destination origin sub-cell, with everything else identical:

| Destination | Spread across sub-cell alignments |
| --- | ---: |
| 90 m | **8.4 m** |
| 1 km | **153.3 m** |

A ±150 m tolerance at 1 km would have been consumed entirely by grid phase. It
would have passed a correct pipeline and a broken one alike — the worst kind of
green. (It also explains why the 1 km figure quoted above, 8,504.6 m, is not
reproducible to the metre: it sits at one end of a 8,350–8,503 m range that
alignment alone sweeps.)

So the probe now reads: **8,737.8 m ± 25 m, sampled from the hero grid** —
9.1 m of measured reduction loss plus 8.4 m of alignment, with headroom. It
still fails by an order of magnitude if anyone points it at the 1 km grid, and
it fails on a 60 m datum error. `probes.py` gained a `grid` field to carry
that, and the runner now *reports* a probe it cannot reach on the artefact in
hand rather than skipping it silently, because a probe that quietly does not
run is worse than one that fails.

That reframing is the general rule the other five probes should be read
against: **a golden probe can only test faithfulness to the source.** Lhasa
passes at 3,651.9 m because GLO-30 says 3,651.4 m there and the city sits on a
broad valley floor — the probe is easy for the same reason it is meaningful.

**A postscript on making the stage run at all.** The first full-corridor warp
never finished. GDAL subdivides the destination until each chunk's *source*
window fits inside `warp_mem_limit`, and at a 30× reduction a source window is
enormous — at the 2,048 MB I first set, the warper asks for roughly half a
billion source pixels at a time. On a machine with less free memory than that
it produced 730 MB/s of swap traffic and about 6 % CPU. Bounded to 128 MB, the
same warp runs at 200 % CPU and finishes in minutes. The limit is not a speed
knob, it is a does-this-terminate knob, and its cost scales with the
**reduction ratio** rather than with the size of the data. Phase 2's
full-country build reduces by the same 30× over five times the area.

## F13 — The stand-in world is 15× smoother than China, and G1 was about to be asked the wrong question

The prototype's terrain is fiction shaped like China's three steps, and it was
always labelled as such. What was not visible until real elevation landed is
*how* unlike China it is — not in where the mountains are, but in how steep
they get.

Comparing the **roughest single tile each world can produce**, by the height
difference between adjacent 1 km samples:

| | Stand-in | Real (Nyainqêntanglha, tile 40,21) |
| --- | ---: | ---: |
| Median step | 11 m/km | **248 m/km** |
| 90th percentile | 36 m/km | **539 m/km** |
| Steepest | 70 m/km | **938 m/km** |

At the prototype's 1:8 horizontal and 1.5× vertical — an apparent vertical
exaggeration of 12× — those become mesh slopes of:

| | Stand-in | Real |
| --- | ---: | ---: |
| Median | 7.5° | **71.4°** |
| 90th percentile | 23.4° | **81.2°** |
| Steepest | 40.0° | **84.9°** |

The stand-in's *most extreme* slope is gentler than real China's *median*. On
real data the Himalaya do not read as mountains at this scale, they read as
walls — the median face is past 70°.

**This is the thesis working, not a bug.** The GDD's asymmetry — altitude
uncompressed, distance compressed roughly forty-fold — has to produce steep
ground, and 1 km of real China becomes 125 m of world at 1:8 while its 250 m of
relief stays 375 m tall. Nothing here is behaving incorrectly.

**But it means G1's compression A/B has not yet been asked.** Findings F1 and
F2 measured *visibility* — angles above the horizon, contrast against sky —
and those are geometry and atmosphere, so they stand. The question G1 actually
decides is which compression *feels* right, and every judgement anyone has
formed about that so far was formed over terrain fifteen times smoother than
the terrain the game ships. The 1.5× vertical exaggeration in particular was
chosen to give the stand-in some drama; real relief may need none, or less
than none.

**Action.** The compression A/B must be re-driven over the corridor before the
cohort is recruited, and `verticalExaggeration` re-examined as part of it
rather than held fixed at 1.5× while only the horizontal ratio varies. This is
cheap now — `C` already cycles compression and the corridor already flies — and
it is the difference between G1 answering the real question and G1 answering a
question about a world nobody will ship.

**Done, in F14** — and the guess above was right: real relief needs *less than
none*. The measurement says 0.75×, half what the stand-in was tuned to. It also
found something F13 did not anticipate: the A/B as specified could not have
tested compression at all, because it varied compression and exaggeration
together as a single product.

## Spike result: D3, D4 and the impostor

Measured in Chrome on the development machine (not the Iris Xe floor device,
which is still the number that counts):

| | Result |
| --- | --- |
| Draw calls, 137 visible tiles | **3** (one per occupied LOD bucket) |
| Terrain triangles | 218k–261k, against a 1.2 M budget |
| Impostor | **1 draw call, 6,144 triangles** (0.4 % of budget), one shared shader |
| Horizon march | 2.6 ms full sweep, sliced to **0.6 ms/frame** over eight frames, every 25 km |
| Coarse global field | 657 × 433 Int16 = **556 kB**, built in 126–185 ms at boot |
| Frame rate | 65–120 fps (vsync-capped) |
| Heightmap path | R16I texture array, `texelFetch` in the vertex shader — works |
| Flat shading | Screen-space derivatives of world position — works, no normal attribute |

Verified by framebuffer readback rather than by eye — which is also how F9 was
found, and how the first two versions of F1 were shown to be wrong.

Two things the build should not forget:

- The floor device measurement is still outstanding and is the one that decides
  whether the 4 ms L0 trip-wire in the risk register is hit. Everything above
  is a development machine. **Taken in F30**, on the development machine and
  with an instrument: L0 costs 0.10–0.13 ms and the whole visible scene 0.98 ms
  of the 33.3 ms frame. The Iris Xe is still outstanding; the "65–120 fps" in
  the table above turns out to have been a measure of vsync.
- The world is a flat plane. On a sphere, ground 560 km away sits 25 km below
  the tangent plane and the horizon from 1,200 m is 138 km, so none of the
  approach above would be visible at all. Every flight game at this scale makes
  this trade; this one claims geographic faithfulness in its first sentence, so
  the departure belongs on the record rather than in the shader.

## Corridor build result: the phase 0 gate

`make world` on a clean machine, no GDAL install and no AWS account:

| | Result |
| --- | --- |
| Source acquired | 331 Copernicus GLO-30 tiles, **13.89 GB**, 36 minutes at 6.3 MB/s |
| Re-run cost | 8 seconds, 0 bytes — one HEAD per tile, all sizes matched |
| Reprojected grid | 3,521 × 1,345 samples at 1 km, **10.3 MB**, −4 to 7,305 m |
| Tiles cut | **1,155**, of which 923 hold land · 9.76 MB |
| Horizon field | 841 × 553 Int16 · **0.93 MB** |
| Published world | 10.7 MB, fetched by the app in **136 ms** |
| **Lhasa probe** | **3,651.9 m** against 3,650 ± 30 — **pass** |
| **Yangtze probe** | monotonic across 7 waypoints — **pass** |

**Both corridor golden probes pass against real elevation**, which is phase 0's
stated exit gate, and the aircraft flies the corridor.

The second half of the gate is worth stating precisely, because "flies over
real terrain" can hide a coordinate bug. The engine's `groundElevationM` reads
the same Int16 buffer the GPU draws, and it agrees with the pipeline's own
sampler at every published anchor:

| | Pipeline | Engine | Real |
| --- | ---: | ---: | ---: |
| Shanghai | 10 m | 9.9 m | ~4 m |
| Wuhan | 20 m | 19.6 m | ~20 m |
| Yichang | 84 m | 83.7 m | ~40 m |
| Chongqing | 242 m | 242.2 m | ~167 m |
| Chengdu | — | 508.4 m | ~500 m |
| Tiger Leaping Gorge | 3,028 m | 3,028.8 m | ~2,188 m |
| Lhasa | 3,651.9 m | 3,651.8 m | 3,650 m |

The right-hand column is the honest one. Flat places are right to a few metres;
places with relief read high by exactly the amount F12 predicts, because a 1 km
cell containing a gorge is mostly not gorge. **Tiger Leaping Gorge is +523 m**,
which is the strongest argument in this document for the 90 m hero areas: at
1 km that gorge is not a gorge, it is a slope.

> **Corrected, 21 September 2026.** The Tiger Leaping Gorge row is not Tiger
> Leaping Gorge. The anchor of that name sat at 26.87 N, 100.75 E, which F49
> measured as **71 km** from the gorge and 721 m above the river through it —
> a highland with 1,642 m of relief in a 20 km box against the gorge's 3,823.
> The pipeline/engine agreement in the first two columns stands; it was a
> coordinate check and it checked a coordinate. The third column and the
> +523 m do not: they compare a reading at one place against a figure for
> another. **The conclusion survives at the right place and is larger.** At
> 27.18 N, 100.13 E the source's own 30 m reads 1,775 m within 2 km and the
> 1 km grid reads 2,152 m, so the grid fills the gorge in by **377 m** — and
> 40 km upstream at Shigu, where the same river runs through a broad valley,
> it is right to 10 m. One river, one grid, two answers: that pair is the
> argument for the hero areas.

Three things the build should not forget:

- The floor device measurement is still outstanding and is the one that decides
  whether the 4 ms L0 trip-wire in the risk register is hit. Everything here is
  a development machine. **Taken in F30** — see the note on the spike result
  above.
- The world is a flat plane. On a sphere, ground 560 km away sits 25 km below
  the tangent plane and the horizon from 1,200 m is 138 km, so none of the
  approach in F1 would be visible at all. Every flight game at this scale makes
  this trade; this one claims geographic faithfulness in its first sentence, so
  the departure belongs on the record rather than in the shader.
- A corridor build's horizon field is real inside the corridor and zero — open
  sea — outside it. Looking north from the Yangtze you see ocean where Shandong
  is. That is correct for what has been built and wrong about China, so the HUD
  names the corridor and counts `off-world` tiles rather than letting it pass
  for scenery.

## F14 — The G1 compression A/B was testing exaggeration, not compression

F13 said the compression A/B had to be re-driven over real terrain before the
cohort is recruited. Driving it turned up something prior to the playtest: as
specified, **the A/B does not vary compression in any way the player can see.**

Terrain is drawn by dividing horizontal distance by the compression and
multiplying elevation by the exaggeration, so the angle of a mesh facet between
two 1 km samples is

    slope = atan(vex * dh / (1000 / compression)) = atan(A * gradient)

where **A = compression × exaggeration**. Terrain *shape* depends only on that
product. The three candidates hold `verticalExaggeration` at 1.5 and so sweep

| Candidate | A | what the player is actually being shown |
| --- | ---: | --- |
| 1:5 × 1.5 | 7.5 | |
| 1:8 × 1.5 | 12 | three different vertical exaggerations |
| 1:12 × 1.5 | 18 | |

The cohort would have been asked "how big should the world be?" and would have
answered "how exaggerated do you like your mountains?", and nobody would have
noticed, because the two questions were welded together by a constant.

**Measured over the corridor.** Gradient between adjacent 1 km samples, inside
a 40 km band either side of the flown Shanghai–Lhasa route (259,443 land
cells), against the whole corridor for context:

| | p50 | p90 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| Whole corridor, land | 66 m/km | 245 | 464 | 4,060 |
| Flown route band | 80 m/km | 324 | 512 | 995 |

Rendered, that becomes:

| Setting | A | p50 | p90 | p99 | over 60° | over 75° |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1:5 × 1.5 | 7.5 | 30.9° | 67.6° | 75.4° | 21.0 % | 1.2 % |
| **1:8 × 1.5 (shipped)** | **12** | **43.8°** | **75.6°** | **80.8°** | **35.6 %** | **11.2 %** |
| 1:12 × 1.5 | 18 | 55.2° | 80.3° | 83.8° | 45.9 % | 24.6 % |

At the shipped setting **a third of the ground you fly over is steeper than
60°, and a ninth of it is past 75°** — vertical, for practical purposes. At
1:12 a quarter of the world is a wall. The renders in `docs/ab/` are all the
same real vantage point 1,400 m over Tiger Leaping Gorge, and they show it
plainly: at A = 12 the Yunnan highlands are a bed of nails, and the gorge that
gives the place its name is not visible as a gorge at all.

**Sweeping A on the flown route** shows where terrain starts reading as
terrain:

| A | p50 | p90 | over 60° | over 75° |
| ---: | ---: | ---: | ---: | ---: |
| 2.0 | 9.1° | 32.9° | 0.0 % | 0.0 % |
| 4.0 | 17.7° | 52.3° | 3.0 % | 0.0 % |
| **6.0** | **25.6°** | **62.7°** | **13.6 %** | **0.1 %** |
| 7.5 | 30.9° | 67.6° | 21.0 % | 1.2 % |
| 12.0 | 43.8° | 75.6° | 35.6 % | 11.2 % |

**A ≈ 6 is the recommendation**, which at 1:8 means dropping
`verticalExaggeration` from 1.5 to **0.75** — not raising it. Compare
`ab-1to8-vex1.5.jpg` with `ab-1to8-vex0.75.jpg`: same compression, same camera,
same ground, and the second one has ridgelines, valley floors and a legible
drainage pattern where the first has spikes. `ab-1to8-vex0.5.jpg` (A = 4) is
readable but starts to look like moorland, which is the other failure.

**This is a legibility question, not a difficulty one.** The simulation works
in real metres, so exaggeration changes nothing about flying. At 4,429 m over
the gorge the aircraft makes 163 km/min with a maximum climb of 2.2 m/s, which
is a gradient of **0.81 m/km** against a route median of **80 m/km** — a
hundredfold short. Terrain cannot be climbed by flying at it at *any* setting;
that is the "distance is cheap, altitude is expensive" thesis in `scale.ts`
working as designed. What A changes is only whether the player can see what
they are flying over.

**It also interacts with F12.** At 1 km a summit is one sample, and the b = 0.25
silhouette bias deliberately biases single samples upward. A high A then
amplifies that: a 100 m difference between neighbouring samples — ordinary in
the mountains at this resolution — becomes a 50° facet at A = 12 and a 31° one
at A = 6. Much of the spikiness above is **the reduction's own noise, magnified**,
not ridgelines that exist. The 90 m hero grid will change this picture and the
A/B should be re-checked once stage 6 lands.

**What the A/B should be.** Two questions, asked separately:

- *Drama* — hold compression at 1:8 and vary A over {4, 6, 9}. This is the
  question the current toggle actually asks, and it deserves to be asked on
  purpose.
- *Compression* — hold A at whatever drama wins and vary compression with
  exaggeration moving inversely (1:5 × 1.20, 1:8 × 0.75, 1:12 × 0.50). Terrain
  shape is then **identical** and only the framing changes:

| Setting | tile on screen | camera back | far plane |
| --- | ---: | ---: | ---: |
| 1:5 × 1.20 | 12,800 u | 416 u | 640,000 u |
| 1:8 × 0.75 | 8,000 u | 260 u | 400,000 u |
| 1:12 × 0.50 | 5,333 u | 173 u | 266,667 u |

Note the camera sits the same 2,080 *real* metres behind the aircraft in all
three, so that comparison is already controlled — which is why the renders here
are a fair test.

Caveat: these are L0 numbers, the near ground. Distant tiles drop to coarser
LOD and read shallower, so the walls are worst exactly where the player is
looking.

## F15 — With the drama held, horizontal compression is a change of units

F14 split the G1 A/B into two questions and recommended asking them
separately. Building the instrument answered the second one on its own: **the
compression axis cannot be played.** Hold the apparent exaggeration and the
three candidates are the same flight, frame for frame.

**The argument.** The render transform from real space is
`diag(1/c, A/c, 1/c)`, which is the fixed distortion `diag(1, A, 1)` with a
uniform `1/c` on top. Every other length in the frame is derived from a real
quantity and so carries the same `1/c`: the camera's distance behind the
aircraft, the clip planes, the tile size, the skirt depth, the aircraft's
position after any amount of flying. A uniform scale applied to both the scene
and the camera is not visible. Compression is therefore a choice of units —
unobservable in principle, not merely unobserved in this prototype.

**Measured, because an argument is not a measurement.** Same real start, same
stick inputs, 5,400 simulation steps, then one frame read back from the
framebuffer and differenced pixel by pixel:

| | real km flown | altitude | world units flown | frame vs 1:8 |
| --- | ---: | ---: | ---: | ---: |
| 1:5 × 1.20 | 208.075 | 1,367.812 m | 41,615 | 0.0016 |
| 1:8 × 0.75 | 208.075 | 1,367.812 m | 26,009 | — |
| 1:12 × 0.50 | 208.075 | 1,367.812 m | 17,340 | 0.0054 |
| *1:8 at A = 9* | *208.075* | *1,367.812 m* | *26,009* | *3.135* |

The frame column is mean absolute difference per channel, 0–255. The three
compressions differ by five thousandths of one grey level — float noise on
silhouette edges, worst single pixel 27. One step of the *drama* axis, from the
same position in the same flight, differs by 3.135, some six hundred times
more. The distances are identical to the millimetre because the simulation
never sees the compression at all.

**Two confounds turned up while building it,** both of which would have made
the axis look like it did something:

- **The chase camera was half in world units.** It sat `back = 2080/c` behind
  the aircraft — correctly real — and then `+95` world units above it, which is
  79 real metres at 1:5 and 190 at 1:12. The cohort would have ranked camera
  heights alongside compressions. Both vertical offsets now go through
  `toWorldH` with the rest of the rig.
- **Haze was integrated in world units.** `aerialFog` accumulates optical depth
  along the *world* sight line, so the same real 100 km was 20,000 units at 1:5
  and 8,333 at 1:12: **1:12 looked 2.4× clearer** than 1:5 for no reason a
  player could name, in the one respect — air — the GDD sells as the difference
  between the basin and the plateau. Region densities are now authored per real
  metre and converted at upload.

  The vertical half of the same bug had already fired. The height falloff was
  `1/9000` per world `y`, and world `y` carries the exaggeration, so real scale
  height is `9000/vex`. When F14 dropped the exaggeration from 1.5 to 0.75 an
  hour earlier it silently doubled the haze layer's real scale height from
  6 km to 12 km — a change to the atmosphere made by a change to the terrain,
  which nobody asked for and nobody would have found by reading either diff.
  The scale height is now 6,000 real metres, named, and cannot drift again.

**What G1 should ask instead.** The gate's stated pass condition is that "one
compression ratio wins the preference ranking clearly". No ratio can win a
ranking of identical stimuli. What the GDD means by compression is visible in
its own two descriptions of it, which cannot both be true:

> cruise covers about 130 real kilometres a minute

> at 1:5 Sea to Sky is about 40 minutes, at 1:12 about 17

Both are in § The world, nine lines apart.

The first is implemented and is scale-free. The Sea to Sky waypoints total
**3,219.7 real km**, which at 130 km/min is **24.8 minutes at every
compression** — matching the GDD's own figure for 1:8 while ignoring the
compression entirely. The second describes a trip-length comparison, and trip
length is set by `MODE_GROUND_KM_PER_MIN`. The GDD is asking a **speed**
question in the vocabulary of scale.

So:

- **Axis 1, drama** — `A ∈ {4, 6, 9}` at 1:8. Built, and the only axis that
  changes the picture.
- **Axis 2, pacing** — cruise speed, not compression. `{80, 130, 190}` real
  km/min puts Sea to Sky at **40.2 / 24.8 / 16.9 minutes**, which is the
  40 / 25 / 17 spread the GDD wanted to compare, reproduced exactly.
- **Compression** is an engineering parameter and should be decided on
  engineering grounds — float precision in world coordinates against tile
  counts and streaming radius — then fixed. It does not belong in a playtest.
  1:8 is a reasonable place to fix it and nothing measured here argues against
  it.

The `C` key stays, because a toggle that visibly does nothing is now the
cheapest demonstration of this finding that exists. There is no gallery for
this one: `docs/ab/` has nothing to show when the images are identical.

**Action.** Axis 1 is built and keyed to `V`. Axis 2 needs the speed toggle
before the cohort is recruited — the same shape of work, half a day. The G1
protocol in the build plan and the compression test in the GDD have both been
rewritten against this finding; a playtest run on the old protocol would have
produced a clean, meaningless ranking.

## F16 — The pacing spread the GDD asked for is bounded by its own climb budget

F15 established that trip length is a cruise-speed question and recommended
{80, 130, 190} km/min, the speeds that reproduce the GDD's 40 / 25 / 17-minute
spread. Building the toggle and flying it says the top of that range **does
not fly**: at 190 km/min the aircraft arrives at Lhasa below the plateau rim
and Expedition 1 cannot be completed.

**Why it is a ceiling and not a preference.** Climbing to plateau cruise at
4,500 m costs **18.6 minutes of flying, at every pacing**. Altitude is the one
axis that is not compressed and not gained any faster by going faster — the
whole of THE ASYMMETRY in `scale.ts` — so raising cruise speed does not buy
climb, it spends the ground the climb had to happen over.

Flying flat out from Shanghai, direct (2,874 km, the worst case: a player who
follows the waypoints has 345 km more to climb over):

| cruise | Sea to Sky | arrives at | clears the 4,500 m rim |
| ---: | ---: | ---: | --- |
| 80 km/min | 40.2 min | 5,555 m | yes, by 1,055 m |
| **130 km/min** *(shipped)* | **24.8 min** | **4,584 m** | **yes, by 84 m** |
| 135 km/min | 23.9 min | 4,503 m | yes, by 3 m — the ceiling |
| 190 km/min | 16.9 min | 3,761 m | **no, 739 m short** |

The ceiling moves with how directly the route is flown — 135 km/min direct,
140 over F3's 2,980 km, 151 over the published 3,220 km waypoint route — and
190 fails on all three, so the conclusion is not an artefact of which distance
is used. `CLIMB_LIMITED_CRUISE_KM_PER_MIN` takes the conservative one.

**The squeeze.** The GDD sets its own working bounds: 25 minutes is the
ceiling for a narrated trip, 15 the floor below which the plateau stops
feeling vast. As speeds those are 129 and 215 km/min. The climb budget caps
the same axis at 135. So the window where both hold is **129 to 135 km/min —
23.9 to 25.0 minutes** — and the shipped 130 sits in it with a kilometre a
minute to spare on one side and five on the other. That is not a tuning
coincidence; it is the only place the current aircraft and the current
narrative bound can both be satisfied.

Which means the honest statement of the pacing A/B is sharper than F15's:

- **80 km/min is a real question.** It breaks the 25-minute guideline, and
  whether that guideline is real is exactly what a playtest is for.
- **190 km/min is not a question**, it is a bug report against the aircraft.
  Ranked by a cohort it would lose for a reason nobody would be able to name:
  the expedition simply does not arrive.

**Three ways to open the top of the range**, none of them free:

1. **Per-leg speed.** F3 already named this: the western legs drop to low. At
   190 cruise flown entirely at low speed the same direct route arrives
   1,437 m *above* the rim. This works today and needs no code — but it means
   the pacing A/B is then testing a speed *profile*, not a speed, and the two
   must not be confused the way scale and drama were.
2. **More climb.** `maxClimbRateMs` is tuning (F4), not physics, and 18.6
   minutes is what it buys. Raising it is the one change that moves both
   bounds at once, and it moves the thesis with them: the plateau is supposed
   to be expensive.
3. **Widen the narrated-trip ceiling** past 25 minutes, which is a writing and
   attention question rather than an engineering one.

**Also worth flagging: the shipped margin is 84 metres.** F3 recorded "~15 %
margin", which reads like room; measured against the direct line it is 84 m of
altitude, and one tuning change to the climb rate spends it. That is now its
own test.

**Action.** The toggle is built and keyed to `P`; the HUD names the condition,
the trip length it implies, and warns in red when the selected pacing cannot
complete Expedition 1 — because that failure is invisible from the cockpit
until the aircraft arrives under the rim twenty minutes later. All three
candidates are characterised in `test/sim/flight.test.ts` rather than
asserted-as-wished, and `CRUISE_CANDIDATES` still contains 190 because it is
the GDD's own figure and removing it would hide the finding. Whether 190 stays
in the A/B is a design decision: it needs option 1 or 2 first.

---

## F17 — Expedition 1 does not clear the ground, and F16 was checking the wrong rim

> **Corrected by F18 in two places, both in the same direction.** The
> clearance walk sampled the ground only where each simulation step landed,
> which at cruise skips two kilometres of terrain at a time and at boost over
> four; checking every kilometre a step crosses moves the single-speed ceiling
> from 92 to 91 km/min on the waypoints flown below. And those waypoints were
> the corridor manifest's seven anchors, which exist for the Yangtze golden
> probe rather than for the expedition. The GDD's own Expedition 1 — Shanghai,
> Wuhan, Chongqing, Chengdu, Lhasa — is 2,931 km, has less ground to climb
> over, and clears at **73 km/min**, not 92. Every conclusion below holds; the
> route it holds for is worse than the one measured.

F16 asked whether the aircraft **arrives** at Lhasa above plateau cruise
height, and answered yes at the shipped pacing, by 84 m. That is a good
question about Lhasa and the wrong question about the route to it. The plateau
is not a table. Sea to Sky crosses ground at **5,595 m** (29.33 °N, 92.41 °E)
a hundred and thirty-one kilometres short of Lhasa — 1,095 m *above* the rim
F16 was checking against. An expedition can clear its destination and fly into
a ridge, and this one does.

Flown at cruise from end to end, from the corridor's own 1,200 m start, full
up-elevator the whole way — which is the most favourable policy any player
could manage:

| cruise | outcome | got to | flown |
| ---: | --- | ---: | ---: |
| 80 km/min | clears, by 289 m | 3,220 km — all of it | 32.4 min |
| **92 km/min** | clears, by **73 m** | 3,220 km — all of it | 28.5 min |
| 93 km/min | hits, 19 m in, at 3,089 km | 96 % | 27.1 min |
| **130 km/min** *(shipped)* | **hits, 86 m in, at 1,954 km** | **61 %** | **13.0 min** |
| 190 km/min | hits, 535 m in, at 1,950 km | 61 % | 9.1 min |

At the shipped pacing the aircraft flies into the Hengduan west of Chengdu
(28.86 °N, 102.44 °E, ground 4,247 m) thirteen minutes after leaving Shanghai.
Not a near miss at the destination: a mountain, at the midpoint, a fifth of
the way through what the GDD calls a twenty-five minute journey.

**Why the wall cannot be climbed at the wall.** The steepest hundred
kilometres of the route is the Yarlung Tsangpo gorge wall at 2,829–2,929 km,
which climbs from 744 m to 4,701 m — **39.6 m of rise per kilometre of
ground**. Gradient belongs to the terrain; the *climb rate* it demands belongs
to how fast you cross it, and at 130 km/min this one asks for **86 m/s from an
aircraft that gives 6.2** at that altitude. Fourteen times over. To climb it in
place the aircraft would have to cross it at 9.4 km/min — a fifth of `low`
mode at the shipped pacing. A wall like this is never climbed at the wall. It is climbed over the thousand kilometres
before it, or it is flown into, and which of those happens is decided by the
cruise speed a thousand kilometres earlier. That arithmetic is now
`climbDemandMs` and `groundSpeedForGradient` in `route.ts` rather than prose.

**The window F16 found is empty.** F16 put the feasible band at 129–135 km/min:
above 135 the aircraft arrives below the rim, below 129 the trip runs past the
GDD's twenty-five minute narrative ceiling. Measured against the ground, the
fastest pacing that clears is **92**, and at 92 the flight takes **28.5
minutes**. There is no cruise speed at which Expedition 1 both clears the
terrain and fits the trip length — the two constraints miss each other by
three and a half minutes, and the shipped 130 satisfies neither.

**Per-leg speed stops being a lever and becomes the requirement.** F3 proposed
dropping the western legs to low as a way of buying altitude, and F16 treated
it as one of three ways to open the *top* of the range. It is now the only
thing that makes the route flyable at all:

| at 130 km/min | outcome | flown |
| --- | --- | ---: |
| every leg at cruise | hits at 1,954 km | 13.0 min |
| last leg at low | hits at 1,954 km — the aircraft never reaches that leg | 13.0 min |
| **last two legs at low** | **clears, by 202 m** | **38.1 min** |
| every leg at low | clears, by 896 m | 57.0 min |

Note the second row. Dropping only the final leg changes nothing, because the
contact is on the leg before it: a speed profile has to be designed against
the profile of the ground, not against where the route ends.

**Why this was not noticed sooner** — three things the check had to get right,
each of which silently produces the wrong answer:

1. **The terrain bounce had to be switched off.** `step` lifts an aircraft
   that touches down to 25 m above the ground, which is the right kindness to
   a player (GDD, "calm, not punishing") and a lie to a clearance check. On
   any slope gentle enough that the ground gains less than 25 m per step, the
   bounce carries the aircraft up the escarpment a bounce at a time. The first
   version of `flyRoute` did exactly this and reported a clean flight over
   7,150 m of Tibet, on an aircraft whose absolute ceiling is 6,750 m.
2. **The walk has to stop at the first contact.** Keep going and the check
   reports clearances for an aircraft that is inside a mountain, and the
   deepest one it finds is likely to be somewhere the flight never reached.
3. **Distance has to come from the aircraft, not from the pacing.** Ground
   speed is pinned to *indicated* airspeed, so true airspeed rising with
   altitude carries a climbing aircraft over the ground faster than the pacing
   claims — 13 % over a short leg and **23 % over a full expedition**. Sea to
   Sky flown entirely at low speed takes 57.0 minutes, not the 74.3 that
   `minutesForKm` predicts. Every trip length in the GDD, in F15 and in the
   HUD is this arithmetic, and all of them are about a fifth long.

**What cannot be answered on the 1 km grid.** The obvious fix — route round
the high ground, up the Yarlung Tsangpo instead of over the range — cannot be
evaluated with the data we have. Three valley variants through Nyingchi all
read *worse* than the straight line (peaks 5,565–5,812 m, and more kilometres
above 5,000 m), because a 1 km cell laid across a gorge averages the floor
with the walls and a valley route comes back looking like a ridge route. This
is F12's problem wearing different clothes, and it means the western legs of
Expedition 1 cannot be *designed* until the 90 m hero grid exists. Stating
that now is cheaper than discovering it in phase 2 with the route authored.

**Action.** The check is built: `flyRoute` in `engine/src/sim/route.ts`, and
`test/route/seaToSkyClearance.test.ts` flies the real corridor and pins every
number above. It skips where no corridor is built — a green tick for a check
that ran on nothing would be worse than the gap it fills — so
`TERRAIN_LIMITED_CRUISE_KM_PER_MIN = 92` carries the answer into a fresh
checkout. The HUD now warns on terrain clearance rather than arrival altitude,
which means it warns at the default condition, because the default condition
is one Expedition 1 cannot be completed in.

Nothing has been changed to *fix* it, because each remedy is a design decision
and they are not interchangeable:

1. **Author the speed profile** — the last two legs at low. Works today, and
   makes Expedition 1 a thirty-eight minute trip.
2. **More climb rate.** `maxClimbRateMs` is tuning (F4), not physics. It moves
   every bound at once, and it moves the thesis with them: the plateau is
   meant to be expensive, and the service ceiling of 6,197 m is set where it
   is so the player looks *up* at Everest.
3. **Reroute the western legs**, which needs the hero grid first.
4. **Widen the twenty-five minute ceiling**, a writing question rather than an
   engineering one.

**G1 is not blocked, but it is not untouched either.** The gate flies twelve
minutes of corridor rather than a whole expedition, and along the waypoints
twelve minutes ends a minute short of the Hengduan. But a G1 tester does not
fly the waypoints: the corridor's start heading points straight at Lhasa, and
on that line the ground wins at **1,705 km, eleven minutes and twenty-seven
seconds in** — inside the session. In the game they bounce rather than crash,
so what the protocol actually asks ten people to rank is three drama settings
over eleven minutes of flying and one of scraping a mountainside. Worth
knowing before the cohort is booked; it does not invalidate the drama
question, which is answered long before minute eleven. G2, which flies
Expedition 1 end to end, is blocked until one of the four remedies lands.

---

## F18 — The speed profile that flies Expedition 1, and why its slow legs are the flat ones

F17 left four remedies and no choice between them. This is the first of them
authored: Expedition 1 is now data — `content/expeditions/sea-to-sky.yaml` —
with a speed per leg, validated in CI, and flown over the real corridor by
`test/route/seaToSkyClearance.test.ts`. D17 is no longer a policy; it is a
test that reads the file.

**Two corrections first**, because both changed the numbers F17 recorded and
both made them worse.

*The check skipped terrain.* `flyRoute` sampled the ground where each
simulation step landed. A one-second step at cruise covers 2.2 km and at boost
4.3 km, so on a 1 km profile the walk stepped straight over ridges and
reported a flight. Checking every kilometre a step crosses — altitude
interpolated across the span — is the fix. It moves the single-speed ceiling
on F17's route from 92 to 91 km/min, and it invalidated a "31.4 minute"
profile that had simply jumped a mountain at boost.

*And it was the wrong route.* F17 flew the corridor manifest's seven anchors.
Those exist for the Yangtze golden probe — Tuotuo He to Shanghai — with
Chengdu and Lhasa added; they are not the expedition. The GDD's Expedition 1
is **Shanghai → Wuhan → Chongqing → Chengdu → Lhasa**, 2,931 km, and being
shorter it is harder, not easier: less ground to climb over.

| route | length | highest ground | clears at cruise up to |
| --- | ---: | ---: | ---: |
| corridor anchors (what F17 flew) | 3,219.7 km | 5,595 m | 91 km/min |
| **Expedition 1 as the GDD writes it** | **2,931.0 km** | **5,558 m** | **73 km/min** |
| straight line | 2,874.3 km | 5,847 m | 62 km/min |

At the shipped 130 km/min the authored route puts the aircraft 321 m inside a
ridge west of Chengdu at 1,846 km, twelve minutes out, 63 % of the way.

**The profile.** `low / low / cruise / cruise` — slow to Wuhan, slow to
Chongqing, cruise from there. It clears the worst ground by **333 m** and
arrives over Lhasa at 6,010 m, in **35.5 minutes**. Of 81 possible profiles,
19 clear by 200 m and this is the fastest of them.

| through | cumulative | altitude |
| --- | ---: | ---: |
| Wuhan (679 km, low) | 13.5 min | 4,231 m |
| Chongqing (1,427 km, low) | 26.9 min | 5,560 m |
| Chengdu (1,692 km, cruise) | 28.5 min | 5,659 m |
| Lhasa (2,931 km, cruise) | 35.5 min | 6,010 m |

**The slow legs are the flat ones, and that is not a mistake.** It is the
first thing anyone will want to change, so it is worth saying exactly why it
is upside down. Climbing costs *minutes*, not kilometres: reaching 5,858 m —
the route's highest ground plus a margin — takes **32.1 minutes of flying**
whatever speed the ground goes past underneath. The only place to buy 32
minutes is the eastern plain, where there are 1,427 km of nothing in the way.
Spend them there and the aircraft crosses the Hengduan already above it; spend
them anywhere else and there is nowhere left to spend them, because the wall
west of Chengdu rises 37 m per kilometre of ground and asks for 80 m/s of
climb from an aircraft that gives 6. **Reversing the profile is not slower, it
is a crash**, and that is now a test.

The same arithmetic sets a floor nobody can beat: no profile, on any route
through this corridor, flies Expedition 1 in less than about 33 minutes,
because 32.1 of them are the climb. The GDD's "~25 min" for Sea to Sky was
never reachable at this start altitude.

**Three things the authoring turned up:**

1. **`boost` west of Chongqing is a no-op.** It is gated on air density and
   cuts out at 3,564 m, which by the third leg is below the aircraft. An
   author who writes `boost` there gets cruise and no warning, so the
   equivalence is pinned in a test rather than left as a trap. The GDD's
   trip-length table has a "with boost" column for every expedition; for
   anything that climbs, that column is fiction.
2. **Extra waypoints buy nothing here.** Adding Yichang as a fifth leg — a
   finer profile over the same ground — improves the trip by 0.1 minutes. The
   constraint is the climb, and the climb does not care where the legs are
   cut. The GDD's four legs are enough, so the route is left as the GDD
   writes it.
3. **Start altitude is the lever that actually moves it**, and it is one line
   of the authored file:

   | start | fastest profile clearing by 300 m | trip | single-speed ceiling |
   | ---: | --- | ---: | ---: |
   | **1,200 m** *(authored)* | low / low / cruise / cruise | **35.5 min** | 73 km/min |
   | 2,500 m | low / low / cruise / cruise | 34.6 min | 85 km/min |
   | 3,000 m | low / cruise / low / cruise | 28.9 min | 94 km/min |
   | 4,000 m | low / cruise / cruise / cruise | 25.2 min | 126 km/min |

   Note the cliff between 2,500 and 3,000 m: 500 m of start altitude buys
   5.7 minutes, because at 3,000 m the second leg can be flown at cruise. And
   note where 4,000 m lands — 25.2 minutes, the GDD's own figure, at very
   nearly the shipped pacing. **The GDD's twenty-five minute Sea to Sky is
   reachable, but only by an expedition that starts at cruise altitude
   instead of climbing from the coast.** That is a real choice and it is not
   an engineering one: 1,200 m is authored here because the build plan's own
   test is called "spends most of the expedition climbing, which is the
   lesson", and starting at 4,000 m deletes the lesson to save ten minutes.

**What it costs, stated plainly.** 35.5 minutes is half a minute outside the
GDD's own fifteen-to-thirty-five minute band, and 76 % of it is spent east of
Chongqing. The plateau leg is 42 % of the distance and 20 % of the time. Both
of those are consequences of the climb, not of the profile, and both are the
writer's problem rather than the engine's — which is the right place for them
to be, and one line of YAML from being different.

**Also built, because content with coordinates needs it:** `projectAlbers` in
`worldGrid.ts`, the engine-side forward projection (D1), checked against
PROJ's own answer at all seven corridor anchors and agreeing to five
centimetres. Until now nothing outside the pipeline could turn a latitude into
a position, which was fine while the only projected things were pre-projected
tiles and would have stopped being fine at the first discovery trigger.
Snyder's ellipsoidal form: the spherical one is 16.9 km out at 40 N.

**Action.** Done and in CI. The remaining three remedies stay open and are
now optional rather than blocking: more climb rate, a reroute needing the
90 m hero grid, and widening the narrated-trip ceiling past 35 minutes. G2 is
unblocked — Expedition 1 can be flown end to end — but what it will measure is
a thirty-five minute trip, not a twenty-five minute one, and the gate's second
criterion should be read with that in mind.

## F19 — Expedition 1 has no room in it, and the tightest moment is over flat ground

F17 asked whether the route clears the ground. F18 authored the speed profile
that makes it clear. Both flew the same autopilot: full up-elevator from
Shanghai to Lhasa. That is the correct policy for a clearance proof — best
rate of climb at every instant is the highest the aircraft can be at every
instant, so a route it cannot clear is a route nobody clears — and it is the
one thing it is not, which is a flight.

Nobody would take that flight. It climbs without pause for thirty-five
minutes and arrives over Lhasa at **6,010 m**, which is **2,342 m above the
city** and **187 m below the aircraft's own service ceiling**. The expedition
whose thesis is that you feel the ground come up to meet you ends with the
ground two and a third kilometres down and the aeroplane out of aeroplane.

So the question F17 and F18 could not ask: what does the route have *left
over*? Not "does it clear" but "by how much, where, and what can be done with
it".

### The floor

The number an aircraft on a route is really flying against is not the ground
under it. It is the lowest altitude from which the rest of the route still
works — the **floor** — and on Sea to Sky the two have almost nothing to do
with each other:

| km | where | ground | floor | slack |
| ---: | --- | ---: | ---: | ---: |
| 0 | Shanghai | 10 m | 11 m | 1,189 m |
| 200 | the delta | 114 m | 289 m | **2,128 m** |
| 400 | inland | 38 m | **1,641 m** | 1,685 m |
| 800 | Hubei farmland | 32 m | **3,588 m** | 943 m |
| 1,427 | Chongqing | 254 m | 5,110 m | 450 m |
| 1,692 | Chengdu | 507 m | 5,247 m | 412 m |
| 2,366 | the rim | 5,535 m | 5,535 m | **332 m** |
| 2,900 | Lhasa | 3,717 m | 3,765 m | 2,238 m |

Eight hundred kilometres inland, over wet flat farmland thirty-two metres
above the sea, **the aircraft must already be at 3,588 m**. The floor rises
3,577 m across 800 km of ground that rises 22 m. It stands furthest above the
land — 4,854 m — at km 1,500, in the middle of the eastern plain, and it comes
down onto the ground at the rim, which is what being the binding constraint
looks like.

Nothing the player can see explains any of it. The wall that makes it binding
is fourteen hundred kilometres ahead and below the horizon. This is F3 and
F18 again — the climb has to be bought over the plain — but as a curve rather
than a total, and the curve is the thing an autopilot and a HUD can both read.

### The slack narrows the whole way, which is backwards

Slack peaks at **2,128 m two hundred kilometres out**, while the aircraft is
still over the delta and the wall is a rumour, and falls
monotonically from there to **332 m at the rim** — every hundred-kilometre
step of the way, without one exception. **The player has the most freedom
where there is nothing to look at and the least where the game's entire
subject is.** A sightseeing game wants the opposite shape.

### What the slack is worth, in seconds

The slack is not an abstraction: it is exactly how long the autopilot can hand
the stick back. A player who is not climbing is spending it, at a rate the
air sets.

| what the player does | longest hold that still arrives |
| --- | ---: |
| flies level | **352 s** (5.9 min) |
| noses down 10 % | 127 s |
| noses down 20 % | 76 s |
| noses down 50 % | 34 s |
| full forward stick | **18 s** |

One number, 332 m, divided by the rate at which each policy burns it. The
whole margin of a thirty-five minute expedition is **eighteen seconds** of the
stick forward.

The ratio behind that is the plateau mechanic stated as arithmetic, and it is
worth its own function:

```
climbRecoveryRatio(h) = (climbRate(h) + descentRate) / climbRate(h)
```

Descent is gravity-assisted and does not care about altitude: 18 m/s at sea
level and 18 m/s over Tibet. Climb is power-limited and has lost 86 % of
itself by plateau cruise: 5.66 m/s at 1,200 m, **0.80 m/s at 5,868 m**. So a
second of looking down costs **4 seconds** to undo at the coast and **23** on
the plateau. Neither number knows where it is. The ratio between them is what
thin air actually feels like once the aircraft has somewhere to be, and it is
now on the HUD beside the climb rate, because the density bar shows the cause
and could never show the consequence.

### It is one budget, and it is spendable almost anywhere

The obvious guess — that an early hand-off is cheap because there is time to
recover, and a late one is fatal — is wrong, and the measurement is worth
having because the guess would have produced the wrong design. A sixty-second
level hold costs:

| taken at | cost in final margin |
| --- | ---: |
| 0 min, leaving Shanghai | 39 m |
| 10 min | 44 m |
| 20 min | 47 m |
| 30 min | 50 m |
| 32 min, past the rim | 10 m |
| 34 min | 0 m |

**Thirty-nine metres against fifty: the cost barely depends on when it is
taken.** The power lapse does discount an early loss — the aircraft that is
340 m lower climbs faster than the one it is chasing, so the gap closes a
little — but the discount is 22 %, not the order of magnitude the intuition
promises. Before the rim the budget is effectively one global allowance;
after it, spending is free.

Which is why the binding hand-off is the one it is. The tightest 352-second
hold starts at **t = 26.1 minutes, km 1,381, five kilometres above
Chongqing** — not because anything is special about Chongqing, but because
that is exactly 352 seconds before the rim. **The worst moment to take the
controls is whichever one is still being paid for when the wall arrives**, and
on this route the ground beneath it is 254 m of riverside city with nothing in
the view at stake.

### Where the budget may be spent, and what it costs to have more

A short hand-off has no forbidden region. A long one does, and it is exactly
the approach to the wall:

| hand-off | fails if started |
| --- | --- |
| 2 min | nowhere on the route |
| 6 min | between 21.0 and 26.3 minutes |
| 6.7 min | between 7.3 and 26.3 minutes |
| 8.3 min | anywhere before the rim |

Which is directly authorable: beats may give the player two minutes anywhere,
and the long "you have control" stretch the GDD wants goes before Wuhan or
after the rim, never on the approach.

The other lever is where the expedition starts, and it is the same line of
YAML the trip-length question turns on:

| start | trip | worst clearance | level hold | nose-down |
| ---: | ---: | ---: | ---: | ---: |
| **1,200 m** *(authored)* | 35.5 min | 333 m | **352 s** | **18 s** |
| 2,500 m | 34.6 min | 489 m | 570 s | 27 s |
| 3,000 m | 34.3 min | 556 m | 680 s | 30 s |
| 4,000 m | 33.5 min | 704 m | **968 s** | 39 s |

A 4,000 m start nearly triples the player's freedom — 5.9 minutes to 16.1 —
on the same speed profile. F18 measured the same start altitude as worth ten
minutes off the trip instead, by re-optimising the profile around it. It is
the same gain spent two ways, and it cannot be spent twice.

### What this changes

1. **A route's altitude plan is not a number, it is a floor plus a chosen
   margin — and that margin *is* the hand-off budget.** They are the same
   quantity in different units. Choosing how long the player may fly is
   choosing how much altitude the autopilot banks, and there is no third
   option where they both come out well.
2. **Expedition 1 can afford 5.9 minutes of hands-off flying, once, out of
   35.** Workstream D specifies "autopilot with hand-off and rejoin" as though
   a hand-off were free. It is the most expensive thing in the expedition.
3. **The rejoin needs the floor at runtime.** An autopilot taking control back
   has to answer "can I still make it from here?", which is `altitudeFloorM`
   evaluated at the current position — the in-game form of D17. Shipping the
   floor beside the speed profile makes that a table lookup.
4. **D17's replay proves a property of a policy nothing implements.** The
   guarantee is about full up-elevator; the game will fly something else. The
   replay should fly the policy the runner uses, with the hand-off budget the
   route affords, or it is checking a flight that never happens.

**Built:** `altitudeFloorM` and `climbFloor` (bisected on the simulator
itself, so density lapse, true-airspeed gain and boost lockout are counted
rather than re-derived), `routeFrom`/`groundFrom`, `longestHoldS`, per-km
track recording on `flyRoute`, a `ClimbPolicy` so the check can fly something
other than the ideal, and `climbRecoveryRatio` in `aircraft.ts` with
`MAX_DESCENT_MS` promoted out of the flight model to sit beside it.

**Action.** The engineering is done and in CI: 14 corridor-backed tests pin
every number above, and the synthetic half runs without a build. What is left
is a decision, and it is the same one F18 left open, now with a second price
on it. Expedition 1 as authored gives the player 5.9 minutes of the
thirty-five. The 4,000 m start F18 costed at ten minutes off the trip is worth
16.1 minutes of freedom instead — the climb it deletes is the climb that
consumes the margin — and the gain cannot be taken twice. If the answer is
that Expedition 1 keeps its climb, that is a real answer and the narration is
simply written to it: two minutes of "you have control" anywhere, the long
free stretch before Wuhan or after the rim, and never on the approach.

## F20 — The autopilot and the proof are the same flight, because there is only one

D17 replays every route and asserts it clears. F19 pointed out what that
replay actually flies: full up-elevator from Shanghai to Lhasa, which is a
proof and not a flight, so the guarantee is about a policy the game will never
use. The obvious next move is to write the policy it *will* use — track the
floor, which is the lowest the aircraft may ever be — and check that the
guarantee survives.

It survives completely, and the reason is worth more than the autopilot:

| km | ground | proof flies at | autopilot flies at | apart |
| ---: | ---: | ---: | ---: | ---: |
| 800 | 32 m | 4,531 m | 4,438 m | 93 m |
| 1,427 | 254 m | 5,560 m | 5,513 m | 47 m |
| 1,692 | 507 m | 5,659 m | 5,617 m | 42 m |
| 2,000 | 4,045 m | 5,760 m | 5,723 m | 37 m |
| 2,366 | 5,535 m | 5,867 m | 5,832 m | 35 m |

**The highest trajectory the aircraft has and the lowest one that is safe are
the same line for twenty-seven hundred kilometres.** There is no altitude plan
to make. An autopilot given the whole envelope and told to fly as low as it
dares comes within ninety metres of one told to climb as hard as it can, for
the entire eastern two thirds of the route, and the two arrive within half a
minute of each other. D18's "floor plus a chosen margin" is a real interface
and on this route it is choosing between 5,832 and 5,867.

### Three things the measurement caught

**A margin added to a floor is not a trajectory.** The first version asked for
300 m of clearance by tracking `floor(km) + 300`, and delivered 136 m. Climb
rate falls with altitude, so an aircraft holding station above a rising floor
cannot climb as fast as the floor does; it slides back down onto it and
arrives at the wall with whatever it has left. The margin has to go *inside*
the floor — bisect against a ground raised by 300 m — and then it is flyable,
because the floor is itself a full-climb trajectory: an aircraft sitting on it
with the stick back stays on it exactly.

**A floor is not a setpoint.** A proportional law in both directions needs
standing error to produce command, so it tracks a rising target from below by
most of its capture band — 200 m of band turned 300 m of asked-for clearance
into 136 m of delivered. A floor is asymmetric by meaning: at or under it the
answer is everything the aircraft has, and the easing is only for coming back
down. That change alone recovered 152 of the 164 metres.

**`longestHoldS` was measuring the wrong aircraft.** It scanned hand-offs
against `FULL_CLIMB` regardless of the autopilot it was handed, so it happily
reported that riding the floor and climbing flat out gave the player exactly
the same freedom. A hold has to interrupt whatever the autopilot was doing;
`handOff` now takes the base policy, and the numbers below are the first ones
that are about the flight they claim to be about.

### The dial, and what it is worth

With the margin inside the floor, D18's parameter does exactly what it says:

| clearance asked | delivered | level hand-off | trip |
| ---: | ---: | ---: | ---: |
| 150 m | 115 m | 139 s | 36.6 min |
| 200 m | 168 m | 188 s | 36.3 min |
| 300 m | 272 m | 309 s | 35.8 min |

**One metre of authored clearance is one second of player**, to within 15 %,
because what burns the margin is the climb forgone and at plateau altitude
that is about a metre a second. The shortfall between asked and delivered is
two one-signed errors — twelve metres of controller lag and seventeen of a
100 km stride chording under a concave curve — and neither is to be taken on
argument. What a floor delivers is what the replay says it delivers, which is
D17 one level down.

Note also which way the trip time runs: flying *higher* is faster, because
true airspeed rises with altitude. There is no trade here between the player's
freedom and the clock. The only thing a lower flight buys is the view, and on
this route it does not buy much of one.

### Four kilometres above the Hubei plain, and no policy fixes it

Over farmland 32 m above the sea, the autopilot flies at 4,438 m — **4,406 m
of clearance** — and it is not being cautious. The floor there is 3,588 m
(F19), and the floor is a property of the route and the aircraft, not of the
policy. **For the eastern 1,700 km of Expedition 1 the player is too high to
see anything, and nothing that can be done in code changes that.**

One thing does change it, and it is the knob this build has already turned
three times:

| cruise | floor over Hubei | the flight there | trip |
| ---: | ---: | ---: | ---: |
| 130 km/min | 3,588 m | 4,402 m up | 35.8 min |
| 100 km/min | 2,354 m | 3,588 m up | 48.4 min |
| 73 km/min | **32 m — the ground** | 1,362 m up | 68.7 min |

A climb that has longer to happen can start later, so the floor falls as the
route slows. At F17's terrain-limited 73 km/min the floor over Hubei is the
ground itself: the aircraft is free to fly at any height it likes over the
Yangtze, and the expedition takes sixty-nine minutes.

**The pacing knob is the altitude knob.** F15 established that compression
changes nothing a player can see and that trip length is a cruise-speed
question; F17 bounded that speed with the terrain; F18 authored a profile
inside the bound. F20 adds the part nobody had costed: *the same number also
decides how far above the ground the player spends the first two thirds of the
expedition.* A thirty-five minute Sea to Sky is a four-kilometre-high one.
That is not a bug and it may well be the right trade — the plateau is the
subject and the delta is the runway — but it should be chosen rather than
discovered at G2 by ten people saying the first half was boring.

### It cannot land at Lhasa either

The plateau falls **1,350 m in the last hundred kilometres**, and the final leg
is authored at cruise, which crosses them in well under a minute. Arriving
over the city needs about 30 m/s of descent; the aircraft has 18 at full
forward stick, and a descent at full forward stick is not an arrival. So the
expedition ends **1,949 m above Lhasa** under any policy, which is the altitude
the comparison spread's "automatic snapshot of the plane" would be taken from.

This one is cheap to fix and it is a route change rather than a policy one: a
fifth waypoint short of Lhasa, flown at low, gives the descent the time it
needs. Slowing the whole Chengdu–Lhasa leg does not — it is 1,239 km long and
takes the trip to fifty-two minutes.

> **Wrong, and F21 measured it.** A fifth waypoint flown at low buys about
> half of what is missing and no placement buys more; the obstacle is
> ninety-three kilometres out and 1,571 m above the city, and the only
> configuration that lands is an hour and a quarter long. "Cheap to fix" was
> an estimate made without building the instrument that could price it.

**Built:** `followFloor` (asymmetric, proportional only on the way down, never
a dive), `floorProfile`, `clearanceM` on the floor search so a margin is part
of the curve, `ClimbPolicy` now sees altitude so a policy can close the loop,
and `handOff`/`longestHoldS` corrected to interrupt the autopilot under test.
Six corridor-backed tests and nine synthetic ones, including one that keeps
the wrong turn — a margin added after the fact — as a test, because it is the
kind of mistake that reads as correct.

**Action.** The replay now flies a policy the game could ship, so D17's
guarantee is about a real flight. Two things move to the authoring side, both
of them route decisions rather than engineering ones: a fifth waypoint if the
expedition is to arrive at Lhasa rather than over it, and the pacing choice,
which is now known to set the sightseeing altitude for the first two thirds of
the trip as well as the clock.

## F21 — Expedition 1 does not arrive at Lhasa, and the reason is ninety-three kilometres out

D17 asks whether the aircraft can get *over* the ground. F19 added the floor,
which is how low it may be while still getting over what is coming. Both of
those are about staying up, and between them they had used up all the
attention: the expedition was checked, replayed, costed in minutes and in
seconds of player freedom, and nobody had asked whether it can get back down.

On a route that ends at a city in a valley behind a wall, that is the half
with the answer in it.

### The ceiling, which is the floor's mirror

`altitudeFloorM` is the lowest altitude at a kilometre from which the rest of
the route still clears. `arrivalCeilingM` is the highest altitude from which
the rest can still be *arrived at* — flown down to some chosen height over the
destination without breaking the clearance on the way. The floor rises as the
wall approaches. The ceiling falls as the destination approaches. A route is
flyable where the band between them is positive, and landable only if it is
positive all the way along.

Bisected on the simulator, like the floor, and for a sharper reason than
consistency. Descent is 18 m/s and does not improve with altitude, but true
airspeed does, so an aircraft holding height covers the remaining ground
*faster* and has less time to lose it, not more. That is the wrong sign for
anyone doing this on paper, and it is exactly the kind of thing a replay gets
right for free.

### The band is negative for 2,900 of 2,931 kilometres

| km | ground | floor | ceiling | band |
| ---: | ---: | ---: | ---: | ---: |
| 250 | 40 m | 2,501 m | — | none |
| 1,500 | 405 m | 5,554 m | — | none |
| 2,500 | 4,882 m | 5,793 m | — | none |
| 2,880 | 4,681 m | 5,229 m | — | none |
| 2,895 | 4,369 m | 4,359 m | — | none |
| **2,900** | 3,717 m | 4,069 m | 4,276 m | **208 m** |
| 2,930 | 3,668 m | 3,955 m | 4,151 m | 196 m |

There is no altitude at all from which Expedition 1 can be landed until
**thirty-one kilometres** from Lhasa. The band then opens two hundred metres
wide — and the aircraft is 1,300 m above the top of it, because everything it
did for the previous two thousand nine hundred kilometres was required.

The lowest trajectory that exists — full forward stick everywhere above the
floor, which no player would fly and nothing legal is below — arrives **1,588 m
over the city**. The shipped autopilot arrives at 1,959 m. **The entire policy
knob, from gentlest to most violent, is worth 371 m of a 1,588 m deficit.**

The lowest height the expedition can be authored to arrive at is 1,600 m.

### One ridge, and three numbers

The last hundred kilometres peak at **5,223 m, ninety-three kilometres out**,
over a city at 3,652 m. With the 300 m margin the route is flown with, the
aircraft has to be at 5,523 m there, which is 1,871 m above where it is going.
Ninety-three kilometres at cruise is forty-three seconds. Forty-three seconds
at 18 m/s is 773 m.

That is the whole finding. Everything else is consequences.

It is also, annoyingly, correct geography. Lhasa sits at 3,650 m in the Kyi
Chu valley with the Nyainqêntanglha at 5,000–6,000 m around it; real aircraft
come in down the Yarlung Tsangpo rather than over the rim. A great-circle line
from Chengdu crosses the rim.

### What the knobs are worth

Shortfall against a 500 m arrival, which is a flypast rather than a landing:

| | shortfall | trip |
| --- | ---: | ---: |
| shipped | 1,088 m | 35.7 min |
| approach waypoint 81 km out, flown low | 566 m | 36.6 min |
| the whole route slowed to 73 km/min | 934 m | 68.7 min |
| approach waypoint **and** cruise at 80 | 47 m | 63.5 min |
| approach waypoint **and** cruise at 70 | lands | **73.7 min** |

The second row is the fix F20 called cheap. It buys 522 m of the 1,088 and
**no placement buys more** — 2,800 km out, 2,850, 2,880, all within 60 m of
each other, because what binds is ninety-three kilometres long and a waypoint
before it changes nothing about the ninety-three.

The third row is the one that looks like it should work and does not. Slowing
*everything* by 44 % gives the last ninety-three kilometres nearly twice as
long to descend in, and recovers 154 m of the 1,088 — thirty-three extra
minutes of trip for a seventh of the deficit, which is the sharpest available
statement that this is not a pacing problem.

Only the last two rows land it, and both are past an hour.

### The line cannot be moved either, which is the part that surprised me

If the rim is the problem, route around it. Four candidates, each with the
final leg flown low:

| via | detour | shortfall |
| --- | ---: | ---: |
| Nyingchi, in the Yarlung Tsangpo at 3,032 m | +4 km | 1,247 m |
| Tsetang | +24 km | 1,354 m |
| **Gonggar — Lhasa's actual airport** | +68 km | **603 m** |
| Damxung, from the north | +82 km | 1,313 m |

Nyingchi is the obvious answer and it is +4 km, because it is already *on* the
line — Chengdu, Nyingchi and Lhasa are very nearly collinear, and the valley
that makes Nyingchi low does not run where the route does. Routing via the
city's own airport, sixty-eight kilometres out of the way, still leaves 603 m.
Every straight line into Lhasa crosses something above 5,300 m within a
hundred and fifty kilometres. **This is not a waypoint problem. It is what
Lhasa is.**

### The floor never included the place the route ends

Found on the way: `climbFloor` sampled `0, stride, 2·stride…` and stopped
short of the destination, and `floorProfile` holds its last sample flat past
the end. So every floor ever built was pinned, over its final stride, at
whatever the route demanded fifty kilometres earlier. On Sea to Sky that put
the floor at the destination 400 m above the arrival it was supposed to
permit, and made the route un-landable by arithmetic before terrain got a say.

The autopilot never noticed — being told to stay too high at the very end is
invisible when you are 1,900 m too high anyway — and it would have gone on not
noticing until the first route with room in it arrived and mysteriously
refused to descend.

### What the probe costs to be honest

The bound rests on flying the lowest legal line at full forward stick, and
that turns out to be the only thing in this codebase that a *sampled* floor
cannot carry.

The floor is concave, so a chord between samples lies under it. F20 costed
that at 17 m of clearance mid-route at a 100 km stride. At the end of a route
it changes sign entirely: where the floor falls faster than any chord can
follow, a 100 km stride puts it **150 m below the ground** sixty kilometres
from Lhasa. The shipped autopilot never finds out, because it only ever eases
downward at a quarter stick and is nowhere near the floor when a chord sags. A
probe diving at eighteen metres a second flies straight into the hill and
reports the route un-landable for a reason that is entirely about sampling.

Two clamps fix it, and the second is the one I would not have guessed. The
probe's floor is never below the ground plus the margin — and it reads that
ground for ten kilometres *ahead*, because a policy is asked for one command
per step while `flyRoute` checks every kilometre the step crossed, which at
cruise is two and at boost four. A floor read only at the aircraft's own
kilometre is blind to a ridge the next second flies into. With both, the
answer converges instead of crashing: within twenty metres across strides of
50, 100 and 250 on the synthetic shapes, and on the real corridor — 1 km
terrain, where a chord has much more to hide — settled by 25 km, which is
where this suite reads it. Fifty is not converged, and the engine carries the
sweep that says so rather than a round number someone liked.

**Built:** `arrivalCeilingM`, `approachBand` and `arrivalShortfallM`;
`lowestLegal`, the pointwise-lowest trajectory that makes the bound an
argument rather than a flight; `climbFloor` now samples its own destination;
`strideKm`, `lookAheadKm` and `arrivalM` on the options. Nine corridor-backed
tests and thirteen synthetic ones, including the stride-independence check and
the one that keeps the unclamped probe's crash.

**Action.** D17's clearance check is half a check, and route validation should
run both halves — a route whose band closes is broken in a way no autopilot,
no hand-off and no speed mode can rescue, and it should fail at content
validation rather than at G2. That is a workstream-D item and it is cheap now
that the instrument exists.

The expedition itself is a writing decision with a price on it at last.
**Sea to Sky ends in a flypast, not an arrival**, and the alternatives are: say
so and author the ending at 1,600 m over the city; move the destination to
somewhere the aircraft can reach, which on this line means Nyingchi or
Gonggar; or keep Lhasa and accept seventy-four minutes. The GDD's band is
fifteen to thirty-five. The comparison spread's automatic snapshot is taken
from wherever this ends, so the choice is visible in the shipping artefact
either way.

## F22 — The route gate runs in CI, and the first thing it proves is that no route can land

> **The title was half true for two findings.** The gate's *step* ran in CI
> from this commit; the route half of it printed `NOT CHECKED`, because CI has
> no corridor. F24 committed the ground and made the sentence true.

F21 ended by saying D17's clearance check was half a check and that the other
half should run at content validation rather than at G2. This is that build,
and the half it added found something before it had finished being wired up.

### The gate

`validateRoute` runs both questions and returns one verdict: the full-climb
replay that D17 has always done, and the lowest legal trajectory F20 and F21
built, measured against the height the route says it arrives at. Two flights
and one floor, about three seconds on a 2,931 km route, which is the budget
D19 asked for.

It is not a test any more. `content/validate.ts` used to carry a comment
saying the flyable question "needs a built corridor rather than a parser" and
deferring it to the suite; it now calls the check directly. The corridor
readers moved out of `test/route/` into `tools/`, because authoring is not a
test run and the gate an author trips over should be the one they can run.

```
✓ sea-to-sky over sea-to-sky · 35.5 min · clears by 333 m at 2366 km
  · lowest arrival 1588 m over it · NO ARRIVAL AUTHORED
```

One line, and every number in it is a finding: 35.5 minutes is F18's speed
profile, 333 m is F17's worst ground, 1,588 m is F21's arrival. They used to
need three suites and a built world to say. They still need the world — but
now the absence of one is printed rather than assumed.

### A gate that cannot run says so

The risk register lists "or is skipped because no corridor is built" as a way
the clearance check *fails*, not as a way it succeeds, and that distinction
is the whole reason the gate is worth having. CI has no world, so the route
half prints `⚠ NOT CHECKED` and names the command that would build one. A
machine that does have a world runs `make routes`, which passes
`--require-world` and turns that warning into an exit code.

This is a real remaining gap and it is written down as one: until the corridor
is a CI artefact at G2, the route half of the gate runs on the author's
machine and the schema half runs on every commit. The alternative — a green
tick for a check that ran on nothing — is the failure mode the whole thing
exists to avoid.

### What it found

An arrival needs somewhere to be written down, so the expedition schema gained
one: `arrival: { altitude_m, clearance_m }`, metres above the destination's own
ground. The first draft had a `kind` beside it, `landing` or `flypast`, because
the GDD's expeditions "take off at dawn and land at dusk" and eight of the nine
are meant to end on the ground.

No landing passes. Not on the Tibetan plateau — on **flat ground at 100 m**,
over a route with nothing in it to clear:

| authored | lowest arrival | verdict |
| --- | ---: | --- |
| land, 300 m clearance | 300.2 m | fails by 300 m |
| land, 0 m clearance | ∞ | the probe flies into the ground |
| flypast at 500 m, 300 m clearance | 300.2 m | passes |

The cause is exact and it is the same shape as the bug F21 found in
`climbFloor`. A floor built with a margin keeps that margin to the last
kilometre, so at the threshold the floor is `ground + clearanceM` and nothing
legal is below it. The lowest trajectory that exists arrives at 300 m over a
runway at sea level, and the shortfall the gate reports *is the margin*. Not
terrain. Arithmetic.

The obvious escape is to drop the margin, and it is closed too. With
`clearanceM: 0` the floor is bare interpolated ground, and a probe descending
at full stick goes through it between samples — the `Infinity` in the table is
`arrivalShortfallM` reporting that the flight it was asked about never
finished. F21 hit this once already and fixed it by clamping the probe floor
to `ground + clearanceM`; with a clearance of zero there is nothing to clamp
to.

So the two of them close the door from both sides. **The altitude floor treats
the destination as terrain to be cleared rather than as the place the route is
going**, and no value of either number makes it stop.

`kind` was cut rather than shipped. A schema field that cannot pass on any
ground is worse than one that does not exist yet, and the flypast height is
the part the check can actually evaluate today. The contradiction is caught at
parse time instead — `altitude_m` at or below `clearance_m` is unsatisfiable
by F21's identity, costs a parse rather than a corridor to notice, and is
exactly the wall a landing runs into.

### What the fix is, and why it is not in this commit

The clearance requirement has to taper: `clearanceM` over terrain the route
crosses, `arrivalM` at the threshold, and in between whatever a descending
aircraft can actually achieve. The taper length is not free to choose — at 18
m/s and cruise, shedding 300 m takes 17 seconds and 36 km of ground, so a
threshold shorter than that reports an impossible descent as a floor and a
longer one gives away margin over real terrain.

> **The 36 km is wrong, and F23 measured it.** Eighteen metres a second is the
> asymptote of a four-second lag, not a rate: the real answer is 21 seconds
> and 45 km, and a taper built on the naive figure descends faster than the
> aircraft can follow. It reported a 91 m shortfall on ground with nothing in
> it.

That is a model with a number in it that wants measuring, which is what F20
and F21 each were, and folding it into the commit that built the gate would
have meant shipping the interesting half unmeasured. The gate is honest about
the gap in the meantime: it validates flypast heights, which is what
Expedition 1 needs anyway, and refuses to pretend it can validate a landing.

**Built.** `validateRoute` (engine, pure, both halves); `tools/corridor.ts`,
`tools/expedition.ts` and `tools/routeCheck.ts`; the `arrival` block in the
expedition schema with its unsatisfiability check; `make routes`; the route
half of `content/validate.ts`. Eighteen tests, all synthetic except three
guarded on a built corridor. 279 TypeScript tests in 16 files, 232 with 47
skipped on a fresh checkout.

**Action.** The floor taper is the next engineering item and it unblocks eight
expeditions, because the arrival every one of them wants is a landing. Until
it exists, an expedition either authors a flypast height or authors nothing
and reads the measured one off the gate — which is where Expedition 1 sits,
still waiting on the writing decision F21 priced.

## F23 — A floor that knows where it is going, and the seventy-two metres nobody had paid for

F22 found that no route could land anywhere, including on flat ground at sea
level, because the altitude floor keeps its terrain margin all the way to the
threshold. This is D20, the taper that fixes it, and it cost two corrections
to arithmetic that had been wrong in the repo since F19.

### The model

The clearance a route has to keep is not a number, it is a profile. Full
margin over terrain it crosses; the arrival height at the threshold; and in
between, exactly what the remaining flying time can still give back:

```
required(km) = min(clearanceM, arrivalM + descentReach(secondsLeftFrom(km)))
```

Nothing in it is free to choose. The relaxation at any kilometre is capped at
what the aircraft can still shed before it gets there, so the floor never
permits a descent that does not exist, and it is capped again at `clearanceM`,
so a route arriving no lower than its own margin gets the identity and the
pre-D20 answer to the metre. Every corridor number in F17 through F22 depends
on that second cap, and a test now says so.

**What it costs is real and is the point.** An aircraft cannot be 300 m over a
ridge twenty kilometres out and on the ground at the threshold. A route that
lands gives up margin in its approach — here, as little as it must — and the
gate prints what it gave up rather than hiding it:

```
approach: the lowest legal line passes 108 m over terrain at its closest
```

A route that wants its full margin over everything should arrive above it,
which is a flypast, and then the taper never starts.

### Eighteen metres a second is an asymptote, not a rate

The first version used `MAX_DESCENT_MS` directly and reported a 91 m shortfall
on ground with nothing in it. The floor was descending at 8.31 m per kilometre
and the aircraft managed 6.8.

Full forward stick *commands* 18 m/s; the flight model approaches it with a
four-second time constant, stretched by `1/sigma` in thin air. So a descent
that begins from level flight is permanently one time constant short:

```
descentReachM(T) = 18 · (T − τ · (1 − e^(−T/τ)))     τ = 4 s / sigma
```

which is `18 · (T − τ)` once T is a few τ — **72 m at sea level, 104 m into
Lhasa**. Checked against the flight model at three altitudes and three
durations, it agrees within nine metres everywhere and is always on the low
side, which is the safe side.

That constant had been sitting in `flight.ts` as a feel parameter. It is not
only a feel parameter: any planner asking "can this aircraft get down in
time?" has to pay it, and one that does not over-estimates by the better part
of a hundred metres. It now lives in `aircraft.ts` as `PITCH_TAU_S`, where
`flight.ts` reads it too.

### The gate cannot see the last eighteen metres

With the taper working, `arrivalM: 0` still reported a crash. It is not a bug
and it does not want fixing. At an arrival of zero the floor at the threshold
*is* the ground, and the probe moves eighteen metres of altitude between
samples, so it steps through. Below one second of descent the question is
finer than the simulation, and `Infinity` is the honest answer: the flight it
was asked about never finished.

So the verdict carries a tolerance of one descent step, the way the floor
search carries `toleranceM`, and the schema refuses an arrival under 20 m with
the reason. That is not a restriction on expeditions — real aviation authors
the threshold-crossing height at fifty feet for the same reason nobody
measures a landing at the runway surface.

### What it does to Expedition 1: nothing at all

| arrival asked | lowest | shortfall | approach margin |
| ---: | ---: | ---: | ---: |
| none | 1,588 m | — | 223 m |
| 500 m | 1,588 m | 1,088 m | 223 m |
| 50 m | 1,588 m | 1,538 m | 223 m |

Every F21 number survives to the metre, which is the strongest thing that
could have happened to it. D20 changes the floor, and F21's claim was that
**no** change to the floor, the policy, the hand-off or the speed mode moves
this route — so a floor change that leaves it at 1,588 m is that claim being
tested rather than restated.

There is a second confirmation in it, from an instrument that did not exist
when F21 ran. The taper starts biting at km 2,900 on Sea to Sky, because that
is where Lhasa first comes within descending distance. F21 found the arrival
band opens at km 2,900, by bisecting flights. Same thirty-one kilometres,
reached from opposite directions: one asks how far back the aircraft could
start down, the other asks from how far back it could still arrive.

What does land now is a route that ends where the ground is flat. Shanghai to
Wuhan over the real corridor, arriving 100 m over a destination 25 m above the
sea, keeping 108 m of terrain margin at its closest. That could not be
expressed at all a commit ago.

**Built.** `descentReachM` and `PITCH_TAU_S` in `aircraft.ts`;
`remainingSecondsFrom` and `approachClearanceM` in `route.ts`, threaded through
`altitudeFloorM` and the probe's look-ahead clamp; `approachMarginM` on the
check and a line for it in the gate; `minArrivalM` in the schema; the F21
identity retired from both the schema and its test. 284 TypeScript tests in 16
files, 236 with 48 skipped on a fresh checkout.

**Action.** Eight expeditions can now be authored with the arrival they
actually want. Expedition 1 still cannot, and after three findings trying, the
remaining question about it has not moved an inch: it is a writing decision,
it has a price, and the price is the same as it was.

## F24 — The gate never needed the corridor, and whole metres would have moved its answer

F22 wired both halves of the route check into content validation and F23 made
a route able to land. Both shipped with the same hole in them, written down
each time and left open each time: CI has no built world, so the half of the
gate that flies printed `NOT CHECKED` and the job went green on the schema
alone. The risk register lists "or is skipped because no corridor is built" as
a way the clearance check *fails*. For two findings it was a way it passed.

The recorded plan was to make the corridor a CI artefact at G2. That plan
cannot work, and it is worth saying why before saying what replaced it. Sea to
Sky's heightfield is 9.8 MB for one expedition; phase 2's country grid is
~70 GB and serves all nine; both are built from 14 GB of source rasters that
CI has no business downloading on every push. There is no version of "commit
the corridor" that survives contact with the second expedition.

### What the check actually reads

It never asks the world a question with two dimensions in it. `profileAlong`
turns the corridor into ground-at-a-distance-along-a-line before the first
flight starts, and for Expedition 1 that is 2,932 numbers. Every finding from
F17 to F23 — the 333 m of clearance, the 35.5 minutes, the 1,588 m arrival,
the 223 m approach margin — is a function of those 2,932 numbers and nothing
else in the 9.8 MB.

So the artefact is the section: the ground under one authored route, cut from
a built world and committed beside the route in `content/sections/`. It is
22 kB, under a quarter of one per cent of the corridor, and it does not grow
when the corridor does — a country grid nine expeditions wide still cuts nine
sections of a few thousand numbers each.

### What stops a committed derived file from rotting

A generated file checked in next to its source is a liability unless it can be
caught being stale, so most of the work is the catching. A section carries the
waypoints it was cut from, and a route edited without a re-cut fails by name:

```
✗ sea-to-sky · section: waypoint 3 (chengdu) has moved to 30.66, 104.07
  since the section was cut at 31.10, 104.07
```

It carries the leg lengths too, which any machine can recompute from the
projection without a world, so a projection change is caught as well as a
waypoint move. And it carries the SHA of the heightfield it was read out of,
so the build behind it is nameable. On a machine that *does* have a world the
gate re-cuts and compares, which is the one check CI cannot run for itself,
and `make world` ends by re-cutting so the committed copy cannot silently fall
behind a rebuild.

What a section does not prove is that its numbers are real elevations. A
hand-edited array passes every check above. That provenance belongs to the
pipeline and its golden probes and has not moved.

### The rounding, which is the part that was measured

The obvious storage is whole metres: ground is ±0.5 m, the floor search has a
5 m tolerance and the arrival verdict an 18 m one, so half a metre cannot
reach a verdict. It can.

| ground stored as | worst clearance | lowest arrival | file |
| --- | ---: | ---: | ---: |
| the corridor itself | 332.85 m | 1587.67 m | 9,760 kB |
| whole metres | 332.47 m | 1584.47 m | 16.6 kB |
| decimetres | 332.87 m | 1587.65 m | 22.0 kB |

Half a metre of rounding moves the arrival by 3.2 m — **six times the
perturbation that caused it** — because the floor search and the arrival
bisection each compound it. It is still far inside the 18 m the verdict is
allowed, so nothing would have failed. It would have printed 1,584 where this
repository's own documentation says 1,588, on the machines that have no world,
which is now all of them except one. Decimetres cost 5.4 kB and move it by
14 mm, and every number CI prints is the number the author's machine printed.

That is the whole argument for the extra decimal place, and it is the reason
the precision was measured rather than picked.

### A corridor reads sea level outside itself

Found while writing the cutter. `loadCorridor` answers 0 for any sample
outside its built window, which is indistinguishable from the East China Sea,
and a corridor is a strip cut to one expedition. So a route that left its
strip — a half-built corridor, a waypoint moved west, the `china` fallback
before the country grid exists — flew over calm water and cleared everything
with room to spare. The worst failure a gate can have: silent, and green.

`covers()` answers whether there are tiles under a point at all. The cutter
refuses to write a section whose route leaves the corridor, naming the
kilometre it leaves at, and corridor selection now requires coverage rather
than existence.

### What it unlocked

The suites that assert F17 to F23 to the metre were all gated on a built
corridor, which meant the findings this repository is built on were defended
on exactly one machine on earth. They take their ground from the same
`resolveGround` the gate uses, so a suite and the gate cannot quote different
metres, and the gate is now unskippable by default: an expedition with neither
world nor section is an error, and `--allow-unchecked` exists for drafting,
is in no Makefile target and in no CI step, and cannot hide a route that was
checked and found wrong.

| | before | after |
| --- | ---: | ---: |
| TypeScript tests | 284 | 299 |
| running on a fresh checkout | 236 | 289 |
| skipped without a world | 48 | 10 |

The ten that remain are the ones whose subject *is* the world: six comparing a
section against the corridor it came from, three checking `projectAlbers`
against PROJ's own anchors in the manifest, and one flying the straight
Shanghai–Lhasa line, which is deliberately not the authored route and so is
not in any section.

**Built.** `tools/section.ts` (cut, verify, drift, render), `tools/ground.ts`
(one resolution shared by the gate and the suites), `tools/cutSections.ts`,
`covers`/`firstUncoveredKm` on the corridor reader, `make sections` folded
into `make world`, `--require-world` retired for a strict default, and
`content/sections/sea-to-sky.json`. 299 TypeScript tests in 17 files, 289 of
them on a fresh clone.

**Action.** The route gate is no longer skippable, so the G2 item that asked
for it is closed. Two things it did not do: CI still trusts that a section's
numbers came from the pipeline rather than from a text editor — only a machine
with a world can re-derive them — and `projectAlbers` is still checked against
PROJ only where a manifest exists, which is the one dependency of the section
format that the section cannot defend. Committing the anchor table would close
that, and is a smaller job than it sounds.

## F25 — Neither side could run the projection check alone, so the file runs half of it each

F24 closed the route gate and left a list of what it had not closed. First on
it: `projectAlbers` is a second implementation of the projection the pipeline
owns, `test/route/albers.test.ts` is what stops the two drifting, and it was
three of the ten tests a fresh clone still skipped. Every committed section
depends on that projection — the leg lengths in a section's stamp are computed
with it — and a section cannot defend it. A projection change reads as a
*stale section*, which sends the author to re-cut a file that was never the
problem.

### Why it could not run anywhere

The check needs two things that are never in the same place. PROJ's answer
lives in Python, behind rasterio; `projectAlbers` lives in TypeScript, because
content is authored in degrees and a browser has no PROJ in it. CI runs them
as separate jobs with separate toolchains. The one place both had ever met was
a built manifest, which exists only where somebody has 14 GB of rasters.

So the artefact is the handshake. The pipeline writes a table of points PROJ
has answered for, and commits it. `pipeline/tests/test_reference.py`
regenerates it and fails if the committed copy has drifted, which verifies the
file *where PROJ exists*. `test/route/albers.test.ts` reads it with no Python
and no world, which verifies the engine *where PROJ does not*. Each job checks
the half it can reach, and between them the comparison runs on every commit
for the first time.

Reading a file out of `pipeline/` from a TypeScript test looks wrong for about
a second. It is the point: the pipeline is the only thing in the repository
that owns a projection, so it publishes one, and the engine checks itself
against what was published rather than against a copy of it.

### What the table is, and what widening it actually bought

Forty-two points, 5.8 kB, chosen for where a projection goes wrong rather than
for where the game goes: both standard parallels, where the cone touches and
the scale error changes sign; the central meridian, where easting depends on
nothing but the origin; the corners of the country box, where convergence is
largest; and the seven authored anchors, which are the coordinates content is
actually written in.

It would be tidy to say the old seven-anchor table was blind. It was not. A
`+lat_2=47` mistyped as `45` moves Tiger Leaping Gorge by 5,481 m, and the
tolerance is a decimetre, so the old table caught that class of error with
room to spare. What it bought is margin — the same typo moves the north-west
corner of the country by 28,131 m — and coverage of latitudes the corridor
never visits: the old anchors span 26.9 N to 31.2 N of a country that runs
from 18 N to 54 N.

The reason the check could not run was never what it covered. It was where the
answers lived.

### Two of the three were never gated on anything

The central-meridian and the ellipsoidal-versus-spherical tests assert against
hard-coded PROJ values and need no manifest at all. They had been sitting
inside a `describe.skipIf` written for the anchor test beside them, and so had
not run on a fresh clone either. A guard at the wrong granularity costs
exactly as much as a missing test and looks like nothing.

### One projection call site

`anchor_positions()` in `tiles.py` and the new table were two paths into
rasterio with two copies of the constants. They are one now: `grid.project`,
in the module that owns `ALBERS_PROJ4`. Two tables computed with different
constants would agree with each other and with nothing else, which is the
failure a reference table is supposed to make impossible.

| | F24 | F25 |
| --- | ---: | ---: |
| TypeScript tests | 299 | 302 |
| running on a fresh checkout | 289 | 294 |
| skipped without a world | 10 | 8 |
| Python tests | 44 | 49 |

The eight that remain are all tests whose subject is the world itself: six
comparing a section against the corridor it was cut from, one comparing the
reference table against a built manifest, and one flying the straight
Shanghai–Lhasa line, which is deliberately not the authored route.

**Built.** `pipeline/nineskies/reference.py`, `pipeline/reference/albers.json`,
`grid.project` as the single call into PROJ, `pipeline/tests/test_reference.py`
(5 tests, 2 of them needing rasterio), `test/route/albers.test.ts` rewritten
against the committed table, and `make reference`.

**Action.** The reference table has a property the route section cannot have:
CI re-derives it from source on every commit, because PROJ is a wheel and a
corridor is 14 GB of rasters. So the one provenance gap left is still the
section's — CI verifies that a section matches its route, never that its
elevations came from the pipeline. That was not urgent when one person
authored routes and it is still not, but it is now the only place in the
repository where a committed number is taken on trust.

## F26 — The ground could not be proved real, so it was made impossible to change without a world

F24 committed 2,932 elevations next to the route they belong to, and F25
closed with the one thing that was still taken on trust: CI verified that a
section matched its *route* and never that its ground came from the pipeline.
The plan's guess at the fix was "probably a signature over the cut". That
turned out to be right, half-sufficient, and to be sitting on top of a second
gap nobody had written down.

**A signature cannot say the elevations are real, and saying so is the whole
point of building it carefully.** Re-deriving one number of a section needs
14 GB of rasters, so there is no arrangement of files in which CI recomputes
this. What a signature supports is one sentence:

> These elevations came out of a corridor cut on a machine holding the
> cutting key.

Not that the corridor was built from real rasters. Not that the key holder is
honest. And because the public half is committed in the same repository,
anyone who can write to the repository can swap both — the guarantee is
against accident and inattention, not against an adversary with commit
rights. What it does buy is worth the fifty-six lines of it: **the only way to change
the ground under a route is to cut it from a world again.** A number nudged
until a clearance test passes, a merge resolved badly across 229 lines of
digits, a plausible patch from anywhere at all — all of those stop being a
silent pass. Ed25519 through `node:crypto`, no dependency added.

The signed form is the section's *values*, spelled out field by field, not the
rendered file. Reindenting JSON is something tooling does unasked, and a
signature that broke on a reflow would train its first reader to re-cut a file
nobody had touched.

**The gap underneath.** A section records the SHA of the heightfield it came
from, and it recorded it by copying the corridor manifest's own claim.
Nothing in the repository had ever compared that SHA to `heights.bin`. The
stamp was a claim about a claim — it would have survived a truncated write, a
half-finished rebuild, a file swapped between builds, and named the wrong
9.8 MB with perfect confidence. `loadCorridor` now measures the digest of the
bytes it has just read into memory, which costs nothing it was not already
paying, and `cutSection` refuses a corridor that disagrees with its own
manifest rather than stamping a section with a wish. On this corridor the two
matched, which is the expected result and not the reason to check.

**The other half is not cryptographic.** A signature is a statement about
provenance; whether the numbers are *true* is a different question and the
probes have always been the ones that answer it. They just could never run
without a built grid, so they ran on one machine and CI took their word.
Sea to Sky ends at Lhasa, and Lhasa is a golden probe: Britannica's 3,650 m
±30. The committed section reads **3,651.8 m** at km 2,931, so the probe can
be run against the file. It is the first golden probe that has ever run
without a world.

It is also deliberately thin, and the finding is more useful than the check.
One station out of 2,932 is checked against something that is not us. The
limit is not test-writing effort — it is that widening it needs places whose
elevation is published independently *and* that a route happens to fly over,
and Sea to Sky touches five cities of which the probe table knows one. The
signature covers the other 2,931 numbers and covers them only in the sense of
saying where they came from.

| the route's named places | section | commonly cited |
| --- | ---: | ---: |
| Shanghai, km 0 | 9.9 m | ~4 m — a 1 km DSM cell over downtown reads roofs |
| Wuhan, km 679 | 19.9 m | ~23 m |
| Chongqing, km 1,427 | 253.9 m | ~244 m |
| Chengdu, km 1,692 | 506.8 m | ~500 m |
| **Lhasa, km 2,931** | **3,651.8 m** | **3,650 m ±30 — Britannica, and the only sourced row** |

The four unchecked rows are within about 10 m of the figures a reader would
look up, which is reassuring and is not a test — those are recollected
municipal elevations, not citations, and that is exactly why they are not in
the probe table. Every probe in that file names a source. Shanghai is the
interesting one anyway: 9.9 m against a city that averages about 4 m, because
GLO-30 is a surface model and a 1 km cell over downtown Shanghai contains
rooftops.

**Two tests changed meaning rather than breaking, which is the part worth
recording.** Both had been written against a doctored section file, and after
the signature both failed — because the signature fires first, and a tampered
file now means something different from a stale one.

* *"catches ground that has lost stations"* had been a tamper check. A
  truncated file is now refused on its signature long before anyone counts
  stations, so the station count is no longer about tampering at all: it is a
  check on the *cutter*, and it only fires on a `profileAlong` that returns
  the wrong number of samples and gets that signed. It is now written that
  way, against a validly signed short section.
* *"catches a section whose ground has drifted"* had also edited the section,
  and drift is the opposite situation — a perfect file that the world moved
  underneath, from a rebuild with no re-cut. So the world moves now, through
  an injected corridor reading 40 m high, and the committed file is left
  alone. The old version would have passed for the wrong reason forever.

**And one bug, caught only by simulating the machine that matters.** The
suite reads the real key for the byte-identity test, behind
`describe.skipIf(!built && !key)`. `describe.skipIf` evaluates suite bodies at
collection even when the guard is false — the same trap as F24 — so reading
the key eagerly threw on the one machine guaranteed not to have one, which is
CI. It failed loudly rather than silently, and it still would have been red on
a commit that was correct. Fixtures behind a `skipIf` have to be lazy, without
exception.

| | F24 | F25 | F26 |
| --- | ---: | ---: | ---: |
| TypeScript tests | 299 | 302 | 310 |
| running on a fresh checkout | 289 | 294 | 302 |
| skipped without a world | 10 | 8 | 8 |
| Python tests | 44 | 49 | 52 |

Every one of the eight new TypeScript tests runs with no world, which is where
the tampering they describe would be committed from.

**Built.** `tools/attest.ts` (Ed25519, and blunt in its own docstring about
what a signature does not buy), `attestation()` and the signature check in
`verifySection`, `cutSection` measuring the heightfield instead of copying its
manifest's claim, `Corridor.heightsSha256`, `tools/cutKey.ts` and `make
cut-key`, `pipeline/tests/test_section_probe.py`, and an injectable corridor
opener on `checkRoutes` so a suite can move the world.

**Action.** The chain from published raster to committed elevation is now
attestable at every link but the first. `acquire.py` verifies a download by
its byte count and records nothing about its content, so "the corridor was
built from the tiles the mirror served" is a sentence nobody can check after
the fact — and a tile that arrives intact but wrong is indistinguishable from
one that arrives right. Recording a digest per tile at fetch time is cheap and
worth doing before phase 2 turns 331 tiles into several thousand. Whether it
can be checked against something the mirror publishes, rather than only
against what we ourselves first downloaded, is the part that needs looking
up.

## F27 — The mirror had been publishing a checksum all along, in a header the pipeline was throwing away

F26 left one link in the chain uncheckable. `acquire.py` verified a download
by its byte count and recorded nothing about its content, so *"the corridor
was built from the tiles the mirror served"* had no evidence behind it, and a
tile that arrived intact but wrong was indistinguishable from one that
arrived right. The action written down for it ended with a caveat: whether a
recorded digest could ever be checked against anything but our own first
download **was the part that needed looking up**.

It can, and the answer was already in the response.

**S3 returns an object's MD5 as its ETag**, on every request, including the
HEAD `acquire` was already performing on every tile of every run to read
`Content-Length`. The pipeline was reading one header out of that response
and discarding the one that mattered. The worry going in was that Copernicus
tiles would be multipart uploads, whose ETag is `md5-of-md5s-N` and says
nothing checkable about the content; they are not. Measured on N29/E091,
38,500,243 bytes:

```
served ETag  "14562d345e9a55dc14e40344e86e524f"
local MD5     14562d345e9a55dc14e40344e86e524f
```

So a recorded digest is third-party evidence rather than a note to self, and
the distinction is the whole difference between provenance and
trust-on-first-use. This was the one place in the chain where that was
available — a section's ground cannot be re-derived without 14 GB of rasters
(D21), and a projection table can only be re-derived by PROJ (D22). Here the
publisher hands over a digest for free.

**All 331 tiles, 13.9 GB, agree with what the mirror serves today.** Not one
disagreement and not one tile whose ETag was unusable. That number is the
finding: the corpus this world was built from is, tile for tile, the corpus
Copernicus is still serving.

**Where the checks sit, and why each is where it is.**

| | when | against |
| --- | --- | --- |
| `fetch` compares MD5 to the ETag as bytes arrive | every download | the mirror |
| `make sources` records both digests per tile | when the corpus changes | the mirror |
| `mosaic` refuses to build on tiles that do not match | every build | the record |
| `sources --verify` | on demand, no network | the record |
| the section names the source set it came from | every commit, in CI | the record |

The build gate is at mosaic rather than at fetch because a tile can rot on
disk long after it arrived, and mosaic is the last moment the bytes are still
identifiable as tiles — one warp later they are a single array and their
provenance is gone. It earns its place immediately: flipping **one bit** in
the middle of one 38.5 MB tile, leaving the byte count identical, is refused
by name.

```
source tiles do not match the committed digests, so nothing was built:
  Copernicus_DSM_COG_10_N29_00_E091_00_DEM: sha256 9b2971437948… on disk, 16a6e20e8159… recorded
```

Identical byte count is exactly the case size could never catch, and it is
also the likeliest: every GLO-30 cell in a latitude band compresses to
roughly the same length, so a truncated or swapped tile is *more* likely to
match on size than a random file would be.

**Two digests per tile, for two different jobs.** MD5 is the one the mirror
publishes and therefore the only one that can ever be checked against
somebody who is not us; SHA-256 is what local verification uses afterwards.
MD5 is fine against a truncated transfer and worthless against a chosen
collision, and the point of keeping the second is that the first one's
weakness does not propagate into everything downstream of it.

**The chain now closes, and it is worth being exact about what CI sees.** A
section records the digest of the *set* of rasters behind it — one number
rather than several hundred hashes — and that digest is inside the signed
attestation, so a section cannot claim a provenance it does not have while
its elevations stay honest. `test_sources.py` checks the section's number
against the committed record's, with no world, no rasters and no network.

```
mirror ETag → pipeline/sources/cop30.json → corridor manifest → cutFrom → signature
   (at fetch)        (at make sources)         (at build)      (at cut)   (D23)
```

What CI verifies is the agreement between committed artefacts; the comparison
against the mirror happens where the rasters are. That is the same shape as
D21 and D23, and saying so is better than implying CI has checked something
it cannot reach.

**An unplanned result from having to rebuild.** Adding provenance to the
corridor manifest meant re-running the warp and the tile cut over all 331
tiles — four minutes — and `heights.bin` came out with byte-identical
contents, the same `ec5a5e1b…` as the build from three findings ago. The
section's 2,932 elevations did not move by a decimetre; its diff is four lines
of stamp and signature. Nobody had ever asked whether the pipeline was
deterministic across a full rebuild. It is, and every number quoted in F17
through F26 survives regenerating the world underneath them.

| | F26 | F27 |
| --- | ---: | ---: |
| TypeScript tests | 310 | 311 |
| running on a fresh checkout | 302 | 303 |
| Python tests | 52 | 59 |
| source rasters with a digest | 0 | 331 |
| …corroborated by the publisher | 0 | 331 |

**Built.** `pipeline/nineskies/sources.py` (record, verify, `digest_of` over a
set), `pipeline/sources/cop30.json` (63 kB, one tile per line), the ETag check
inside `acquire.fetch`, the verification gate in `mosaic.build`, the `source`
block in the corridor manifest, `cutFrom.sourceSha256` inside the signed
attestation, `make sources` as part of `make world`, and
`pipeline/tests/test_sources.py`.

**Action.** Nothing on the provenance chain. The remaining engineering item on
the list is still the Iris Xe frame timing, which needs the device; the two
above it are the writing decisions on Expedition 1. Worth noting for phase 2:
`make sources` is one HEAD per tile, so the full country's ~4,000 tiles will
be a minute of HEADs and perhaps twenty of hashing, and the committed record
grows to roughly 750 kB. Both fine; neither is fine if it is discovered
during a build.

## F28 — G1's twelve minutes end seventeen before the thing G1 is about

With the provenance chain closed, the next item on the critical path into G1
is the gate itself. `steepestRise` had already named the question, in its own
docstring, and then nobody asked it:

> the steepest sustained rise on a sampled profile — the wall, not a peak …
> where it falls is the single fact that decides whether a route, **or a
> twelve minute playtest session**, contains the thing the game is about.

**It does not.** Expedition 1 crosses the wall at **minute 29.4 of 35.5**. The
G1 protocol flies twelve.

| G1 as written, twelve minutes from Shanghai | |
| --- | --- |
| reaches | km 600 of 2,931 |
| climbs | 1,200 → 4,006 m |
| ground below at the end | 69 m |
| thinnest air | σ 0.67 |
| crosses the wall | **no — 17.4 minutes short** |

G1's second pass criterion is that *median boredom onset falls after the
plateau edge rather than before*. The plateau edge is seventeen minutes past
the end of the session, so **every participant's onset falls before it
whatever they feel**. The criterion is not demanding, it is unpassable, and a
gate scored on an event that cannot occur is the same failure as a check that
silently skips — it returns a number, and the number is about nothing.

**Why it reads as very nearly right.** The first criterion — *≥ 6 of 10 remark
on the climb, the thin air or the plane going heavy* — is served by exactly
the session that makes the second impossible. Twelve minutes contains 2,806 m
of climb and takes the air to σ 0.67, which is past the threshold at which the
HUD itself starts calling it thin. So the protocol is not measuring nothing.
It is measuring the first half of a two-part claim and scoring it as though
both halves were present. What that session has no answer for is *why* — F19
already measured the ground underneath it, and nothing within sight of the
aircraft explains a climb to 4,000 m over farmland 69 m above the sea. The
thing that explains it arrives at minute 29.4.

**The climb and the wall are in different twelve-minute sessions.** The
earliest twelve-minute session that reaches the wall starts at km 900 — and by
then the player begins at 4,747 m, already most of the way up. There is no
twelve-minute window of this route containing both.

| session length | earliest start containing the wall | starts at | wall at minute |
| ---: | ---: | ---: | ---: |
| 12 min | km 900 | 4,747 m | 11.8 |
| 20 min | km 475 | 3,602 m | 19.8 |
| 30 min | km 0 | 1,200 m | 29.4 |

Thirty minutes from the start is the first session that holds the whole
argument, and thirty minutes from the start is G2's session, not G1's.

**The third criterion is weakened, not broken, and the difference is
measured.** *One drama setting wins the preference ranking clearly* asks a
cohort to rank `A` ∈ {4, 6, 9}, and `A` multiplies relief. The eastern window
turned out less flat than it looks on a map:

| | biggest shape per 50 km | apparent at A=4 | at A=9 | spread |
| --- | ---: | ---: | ---: | ---: |
| G1's twelve minutes | 1,094 m | 547 m | 1,230 m | 683 m |
| across the wall | 2,804 m | 1,402 m | 3,155 m | 1,753 m |

So the comparison is real in the eastern window and **2.6 times weaker** than
it would be across the wall. That is a worse instrument, not a broken one —
unlike F15's compression candidates, which were the same flight frame for
frame. Worth saying plainly because the expectation going in was that the
eastern plain would be flat enough to make the ranking noise, and it is not.

**A session is flown, not sliced.** The obvious implementation — cut the
expedition's track at twelve minutes — is wrong in a way that matters for
every remedy below. A player dropped in partway starts at whatever altitude
the operator sets, and 1,200 m in front of the Hengduan is not a shorter
Expedition 1, it is a crash. So `session()` flies `routeFrom` over
`groundFrom` and defaults the start to the altitude the full expedition would
have there, which is what makes the result a *sample* of the expedition. The
suite asserts the crash case, because a protocol needs to know that before a
cohort is booked rather than after.

**And minutes cannot be converted to kilometres by arithmetic.** True airspeed
rises as the air thins, so twelve minutes from km 1,375 covers more than twice
the ground that twelve minutes from Shanghai does. `TrackSample` now carries
seconds — interpolated by the integrator that already had them, alongside the
altitude it was already interpolating — because a narration beat, an ETA and a
gate protocol are all scheduled in time and the track only ever spoke
distance.

**One unplanned corroboration.** `steepestRise` is handed a bare profile and
no hint about where to look. It puts the wall at km 1,760–1,860, rising
3,669 m at **36.7 m/km**. F17 measured that gradient by hand, from the other
direction — the climb rate the aircraft would need at cruise — and called it
37 m per kilometre. Two independent routes to one landform, and the suite now
pins them to each other.

| | F27 | F28 |
| --- | ---: | ---: |
| TypeScript tests | 311 | 319 |
| running on a fresh checkout | 303 | 311 |
| Python tests | 59 | 59 |

**Built.** `tools/session.ts` (`session`, `startsContainingRim`, `trackOf`),
`tools/sessionPlan.ts` and `npm run content:sessions`, `TrackSample.seconds`,
and `test/route/session.test.ts` — eight tests, all of them running without a
world, because a protocol has to be arguable about from anywhere.

**Action.** Which twelve minutes G1 flies is a protocol decision and it is
recorded in *Open questions* with four remedies priced: lengthen the session
to thirty minutes (90 minutes of flying per participant against the current
36), run two twelve-minute segments per drama setting (72 minutes, and a
cohort that sees the reveal without earning it), move the boredom criterion to
G2 (free, and G2 already flies the whole expedition), or move Expedition 1's
climb, which is the writing decision already open. Recruiting the cohort is
blocked on it: thirty-six minutes and ninety minutes are different
recruitment problems. The same question now has to be asked of G2 and of every
expedition after it, which is why the tool is committed and not the answer.

## F29 — The route claims to teach the three steps, and spends fifty-eight per cent of itself over one of them

F28's action said the session question had to be asked of G2 as well. Asking
it turned up something G2 has in common with G1 and something it does not.

The common part is that a gate criterion is a claim about what a cohort saw.
G2's first is that **seven of ten sketch an east-to-west profile with three
steps, west higher, and the plateau drawn as a flat top rather than a peak.**
`content/expeditions/sea-to-sky.yaml` makes the same claim in its own words —
`teaches: The three steps, and why the west is sparse` — and the schema has
always checked that the field is not empty ("say what it teaches, or it is a
flight not an expedition") while never checking whether the flight does it.

**It does not, in two different ways, and only one of them is fixable by
writing.**

### The steps are there and the time is not

| | minutes | share |
| --- | ---: | ---: |
| third step (< 500 m) | 20.5 | **58 %** |
| second step (500–2,000 m) | 8.5 | 24 % |
| first step (> 2,000 m) | 6.6 | **19 %** |

Measured in minutes rather than kilometres, deliberately: airspeed rises by
nearly three times as the air thins, so the share of the *route* crossing a
step and the share of the *trip* spent over it are different numbers, and a
sketch drawn from memory is weighted by the second. A player spends **three
times as long** below five hundred metres as above two thousand. All three
steps are crossed, so the criterion is not unpassable the way G1's was — but
what the cohort is being asked to draw in thirds, they experienced in
58/24/19.

### The plateau is the least flat thing in the flight

| section, cut at the route's own wall | ground | sd | longest level run | reversals ≥ 500 m |
| --- | ---: | ---: | ---: | ---: |
| before the wall, km 0–1,760 | 0–2,013 m | 460 m | **390 km** | 14 |
| the wall, km 1,760–1,860 | 1,039–4,708 m | 879 m | 7 km | 11 |
| beyond the rim, km 1,860–2,931 | 2,271–5,558 m | 557 m | **40 km** | **122** |

The part of the route a player would be told is the plateau is rougher than
the eastern plain on every measure: a tenth of the level ground, higher
deviation, and a hundred and twenty-two reversals of half a kilometre or
more. The aircraft holds 5,715–6,010 m across that stretch — a 294 m swing —
while the ground under it moves 3,286 m. The experience on offer is *being
level while the world churns*, which is a fine thing and is not a flat top.

**This is not a pipeline error and not a routing error.** Shanghai to Lhasa
crosses the dissected eastern margin of Tibet — the Hengduan ranges, then the
Nyainqêntanglha — and arrives at Lhasa in the Yarlung Tsangpo valley. The flat
Changtang is north and west of the line. The ground is right, the route is
honest, and **the criterion is asking after a landform somewhere else.** Seven
of ten players could sketch it only by having read about it.

The sections above are cut at the wall `steepestRise` finds rather than at
names anybody authored, which is the only way the question is not begged: the
point is to find out whether the part *called* the plateau behaves like one.

### One bug, caught by the test that pins it

The longest-level-run search had an optimisation that looks obviously safe —
having found a run from `i`, skip to its end, since nothing inside it can be
longer. It is wrong, and it cost the plateau section 7 km of its true answer
before anything was written down. A run is measured against **its own** first
sample, so a slow drift carries an inner run further than the one containing
it:

```
[0, 240, 250, 260, 270, 280, 290, 300], tolerance 250
  from index 0:  3 samples   (260 is 260 away from 0)
  from index 1:  7 samples   — and index 1 is inside the run from 0
```

Skipping reports 6 where the answer is 7. The suite now asserts that exact
array, because the reasoning that produced the bug is more persuasive than
the bug is visible.

| | F28 | F29 |
| --- | ---: | ---: |
| TypeScript tests | 319 | 327 |
| running on a fresh checkout | 311 | 319 |
| Python tests | 59 | 59 |

**Built.** `tools/teaches.ts` (`stepMinutes`, `flatness`, `lessonOf`),
`tools/teachCheck.ts` and `npm run content:teaches`, and
`test/route/teaches.test.ts` — eight tests, three of which are hand-computed
profiles that need no world at all.

It reports and never gates. A route crossing honest ground is not broken by a
sentence written above it, so failing a build here would be answering a
question that belongs to whoever writes the expedition.

**Action.** Recorded in *Open questions* as a writing decision with three
options that are not equivalent. **Change the lesson** to what this route does
teach — the wall, which this line shows better than any other and which is the
GDD's own reason for starting at Shanghai. **Reroute north** through the
Changtang so the flat top is genuinely crossed, which is a different and
longer expedition. Or **move the flat-top criterion** to whichever of the nine
expeditions crosses the Changtang, which costs nothing and has to be decided
before G2's protocol is written rather than after. The other half of the
file's claim — `Low, wet and crowded to high, dry and empty` — the route
delivers exactly as authored.

## F30 — The frame budget is written in milliseconds and nothing measured one, so the first thing built was an instrument that argues with itself

Everything in workstream B is costed in milliseconds against a 33.3 ms frame:
terrain 8, sky and post 6, cities 3, weather 2, UI 2, CPU 4, headroom 8. The
prototype recorded **65–120 fps (vsync-capped)** and stopped there, and that
number cannot decide anything, because it is equally consistent with terrain
spending 1 ms of its eight and with it spending 7.9. The risk register's
trip-wire for D3 — *displaced grid under 4 ms at L0* — is a quantity of
exactly the kind an fps counter cannot see, and it has been open since week 2.

So: `EXT_disjoint_timer_query_webgl2`, which asks the GPU what it actually
spent, at seven stations cut from the route, at exactly 1920×1080.

**Three things the instrument found wrong with the measurement, in order.**

*The game loop was still running.* The capture switches parts of the scene off
one at a time and times what is left. Underneath it, `frame()` kept calling
`terrain.update`, which restores every bucket's visibility, and `placeAt`,
which puts the camera back on the aircraft. What was timed was the ordinary
frame with extra steps. It reported **6.21 ms to clear an empty screen** and
**−2.21 ms to draw terrain**, and a capture that does not own the frame
measures nothing.

*The median was the wrong statistic.* Everything that can go wrong during a
timing — the compositor taking the GPU, another tab, a clock change — makes a
reading longer. Nothing makes one shorter than the work takes. The samples are
therefore the true cost plus a one-sided tail, and the floor is the estimate
while the middle is a measure of how busy the machine was:

| an empty 1080p frame, fifteen timings | |
| --- | ---: |
| median | 3.51 ms |
| minimum | **0.50 ms** |

The median of *nothing at all* was a tenth of the entire frame budget.

*"Four times the work costs four times as much" is false here.* The instrument
check scaled the load by drawing the same full-screen pass 1, 2, 4, 8 and 16
times, and the fit failed — r² **−1.30**, then **−3.48**, then **0.90**. That
is not the timer. On a tile-based deferred GPU, consecutive passes that begin
by clearing let the hardware skip storing the one before, so sixteen passes
came back at under three times the cost of one. The timer was being blamed for
reporting something true. **Pixels are the honest axis**: a pass over four
times the area does four times the fragment work on any architecture. Swept
that way the same timer fits at **r² 0.985**.

**The capture.** Apple M3, ANGLE Metal, 1920×1080, lowest of 40 timings,
`terrain` and `horizon` net of `clear`:

| station | km | alt m | tiles | tris | clear | terrain | horizon | all |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| shanghai | 0 | 1,200 | 123 | 252k | 0.58 | 0.24 | −0.04 | 0.94 |
| wuhan | 679 | 4,229 | 137 | 261k | 0.52 | 0.31 | 0.02 | 0.97 |
| chongqing | 1,427 | 5,560 | 137 | 261k | 0.56 | 0.22 | 0.01 | 1.61 |
| chengdu | 1,693 | 5,659 | 137 | 261k | 0.84 | 0.28 | −0.22 | 0.95 |
| wall-foot | 1,760 | 5,682 | 137 | 261k | 0.53 | 0.40 | 0.02 | 0.90 |
| wall-rim | 1,860 | 5,715 | 137 | 261k | 0.53 | 0.43 | 0.07 | 0.81 |
| lhasa | 2,931 | 6,010 | 132 | 258k | 0.54 | 0.19 | 0.01 | 0.82 |

Instrument: **0.347 ms per megapixel + 0.259 ms per pass**, r² 0.985. The
capture's own resolution is **±0.32 ms**, taken as the spread of `clear` —
which is the same work at every station, so any spread in it is the instrument
and not the world. The negative entries are saying precisely that, and should
be read as *below the floor*, not as a defect.

**The trip-wire, at last.** L0 — the 64×64 displaced grid, nine instances, the
draw D3 was a bet on:

| | |
| --- | ---: |
| L0 at six of seven stations | 0.10–0.13 ms |
| the trip-wire | 4 ms |
| terrain, every LOD | 0.19–0.43 ms against its 8 ms line |
| everything currently drawn, from the fit at 1080p | **0.98 ms** of 33.3 |

Vertex texture fetch is not slow here. It is about **36× inside** the number
that was going to trigger a fallback to worker-built CPU meshes and three
engineer-weeks.

**What this does not settle, stated plainly.** This is an Apple M3, and the
floor is an Intel Iris Xe. What the capture converts is the *shape* of the
open question: not "will it hold 30 fps", which nothing here can answer, but
**"is the floor device more than twenty-seven times the cost per pixel of this
one, at this workload?"** — 27× for terrain to fill its own 8 ms line, 34× for
everything currently drawn to fill the whole frame. That is a sharp question
with a measurable answer, and the machine that answers it runs one command.

Two caveats that belong next to those multiples. A single per-pixel ratio is a
one-number summary of a difference that is really several — vertex throughput,
texture units, bandwidth, driver overhead — and a workload can be inside the
ratio on average and outside it on one axis. And **only one of the six GPU
budget lines has been built**: terrain and the horizon impostor. Sky and post
(6 ms), cities (3 ms) and weather (2 ms) do not exist, so 0.98 of 33.3 is not
32 ms of headroom for a finished game. It is the two things that exist costing
1 ms between them.

It also retires a loose end: the recorded "65–120 fps" was never a measure of
this renderer. At 1 ms of GPU work per frame the rate was bounded by vsync and
by the CPU, and would have read much the same with the terrain switched off.

**Two more things the window did, after the numbers were in.** A capture that
starts at 98 frames a second does not stay there: this shell puts the page to
about 1.2 Hz once nobody is looking at it, and a run that began fine then
crawled for twenty minutes looking exactly like a hang. The rate is now
checked before the capture *and before every station*, and a collapse aborts
naming the station it reached. It is measured rather than read off
`document.hidden`, which reported `hidden` throughout several captures running
at 98 Hz and is simply not the same question.

And the app resizes its renderer on every `resize` event, which would have
moved every remaining station off 1080p mid-capture while the report went on
claiming 1080p — the one kind of wrong this whole exercise is about. The
handler now stands down while a measurement owns the frame, and the report
states the drawing buffer read back from the renderer at the end rather than
the size it asked for, with a warning in the table if those differ.

The frame-rate check is a diagnosis; the backstop is a five-minute deadline,
because the check only looks between stations and a station that takes six
seconds takes ten minutes at 1.5 Hz — so the diagnosis can be slow to arrive,
and it covers only one of the reasons a capture can stop making progress.
Verified by running one in a throttled window: it stopped after ten seconds
with *"animation frames are arriving at 7.7 Hz, so this capture would take
about 313 seconds per station instead of six"*, and — the half that matters —
gave the frame back. A capture that aborts while it owns the loop and the
canvas must hand both back, or the operator's only way out is a reload and the
error that caused it is the least of their problems.

| | F29 | F30 |
| --- | ---: | ---: |
| TypeScript tests | 327 | 344 |
| running on a fresh checkout | 319 | 336 |
| Python tests | 59 | 59 |

**Built.** `engine/src/gfx/gpuTimer.ts` (the timer, `linearity`, `lowest`),
`app/src/frameCost.ts` (the capture and its table), `tools/stations.ts` and
`tools/cutStations.ts` with `npm run content:stations` and `make stations`,
`app/public/capture-stations.json`, `TerrainStats.perLod`, and a `suspended`
flag in `main.ts` so a measurement can own the frame and the canvas. `placeAt`
was lifted out of `frame()` so the capture measures the picture the game draws
rather than a second arrangement that resembles it. Seventeen tests: seven on
the fit and the estimator against synthetic timings, five on the stations and
five on the two rules that can be checked without a GPU — the frame-rate
refusal and the resolution figure — all of which run with no GPU and no world.

The stations are committed rather than chosen in the browser, and that is the
one decision here worth defending. A capture is only worth taking if it can be
compared to the last one; stations that move when somebody re-authors a leg
make a regression and an improvement look identical.

**Action.** Closes the measurement half of *Spike D3/D4* and answers the
trip-wire on this machine. The spike stays open on the floor device, where it
is now one command rather than a project. Recorded in *Open questions*: the
floor-device confirmation is the blocking one, because if Apple Silicon is in
scope as a floor rather than only as a ceiling, this capture has already
passed it.

## F31 — Lhasa is behind a ridge forty-five kilometres out, and no constant pace gets down it

F21 found that Expedition 1 passes over Lhasa 1,588 m up and cannot get
lower, and priced three endings without choosing one. The choice has now been
made — **arrive at Lhasa**, with speed free to vary — so the question became
which of the available levers actually closes 1,588 m.

**Speed alone does not.** Flying the whole last leg at `low` — a third of
cruise, thirteen extra minutes — gets to 1,095 m and stops:

| final leg | extra minutes | lowest arrival |
| --- | ---: | ---: |
| cruise, as shipped | — | 1,588 m |
| `low` for the last 100 km | +1.1 | 1,081 m |
| `low` for the last 300 km | +3.3 | 1,091 m |
| `low` for the whole 1,238 km leg | +13.8 | 1,095 m |

The improvement saturates at 100 km and then buys nothing, which is the shape
of a constraint that is not about speed. **Nor does routing.** Coming in down
the Yarlung Tsangpo instead of over the range — via Nyingchi, via Nyingchi and
Tsetang, via Qamdo — costs four to fourteen minutes and lands between 1,224 m
and 1,662 m. Every one of them is worse than the cheapest speed change.

**What binds is one ridge and the arithmetic after it.** Every kilometre of
the approach, read off the committed section:

```
  48 km out  5,220 m      33 km out  4,083 m
  47 km out  5,217 m      32 km out  3,818 m
  46 km out  5,106 m      31 km out  3,717 m   ← the valley floor
  45 km out  5,215 m      30 km out  3,708 m
```

The aircraft must be at 5,520 m with 45 km to run, and Lhasa is 3,652 m. That
is **1,870 m to lose in 45 km**. At plateau cruise those 45 km last seventeen
seconds; at `low`, fifty. Eighteen metres a second — full forward stick, which
is not an arrival — gives 900 m of the 1,870. The gap was never the descent
rate and never the route. It was that there is no ground left to descend over.

**What closes it.** A fourth pace, `approach`, flown over the last 45 km:

| pace over the last 45 km | ground per minute | total | arrives |
| --- | ---: | ---: | ---: |
| cruise (shipped) | 130 | 35.5 | 1,588 m — no |
| `low` (1/3) | 43 | 36.0 | 1,111 m — no |
| 1/4 | 33 | 36.2 | 823 m — no |
| 1/5 | 26 | 36.4 | 535 m — no |
| **`approach` (1/6)** | **22** | **36.7** | **264 m — yes** |
| 1/8 | 16 | 37.2 | 303 m — no better |

It floors out around 250–300 m because the taper releases margin to exactly
the authored arrival and no further, so 1/6 is not a tuned number, it is the
first one that reaches the floor. **The cost is 1.2 minutes.**

**What `approach` actually is, said plainly.** It flies at the same indicated
airspeed as `low` — 38 m/s, a little above stall, and there is no slower way
to fly a light single — and takes half the ground per minute. So what changes
is not the aeroplane. It is the horizontal compression, locally halved. A
route that does that is a route where two stretches of itself are not
comparable by eye, and that is a genuine cost against the GDD's scale pillar.
It is paid in one place, over 45 km, at the end, and the alternative measured
above was not a faster descent — it was not arriving.

Three things were built to keep it honest. `approach` is **not in
`SPEED_MODES`**, so it cannot be written on a waypoint; the only way to reach
it is `arrival.approach_km`, which can only ever be the last few tens of
kilometres into a destination. It **splits the final leg rather than adding a
waypoint** — there is no place forty-five kilometres east of Lhasa this route
is about, and a waypoint would change the route's geometry and invalidate the
committed section and its signature (D21, D23) for a change that moves no
elevation at all. And the route gate now prints `arrives 264 m up against an
authored 300` where it printed `NO ARRIVAL AUTHORED` on every run since F22.

**Sixteen tests failed, and none of them was a bug.** They were the record of
the old truth: a whole file titled *"Expedition 1 does not arrive at Lhasa"*,
an autopilot test asserting it *"cannot descend into Lhasa, whatever it
does"*, and a dozen pinned numbers. Deleting them would have deleted the
argument for the change; leaving them pointed at the shipped file would have
made them assert the opposite of what they say. They now fly
`seaBeforeApproach()` — the same expedition with the approach taken away —
which keeps F21's findings checkable as what they are: the reason `approach`
exists. The autopilot test earned a better claim in the process. It used to
say the fix would be a fifth waypoint; it was not, and the aircraft it
describes now falls short for a different reason — its own 200 m capture band,
not the aeroplane's 18 m/s.

| | F30 | F31 |
| --- | ---: | ---: |
| TypeScript tests | 344 | 347 |
| running on a fresh checkout | 336 | 339 |
| Python tests | 59 | 59 |

**Built.** `approach` in `MODE_IAS_MS`, `MODE_SPEED_RATIO` and
`MODE_GROUND_KM_PER_MIN`; `Arrival.approach_km` and `minApproachKm` in the
schema, with both failure modes validated; the leg split in `flyableFrom`;
`arrival:` and a new `teaches:` on Expedition 1; `seaBeforeApproach()` in the
route fixture; and the sixteen assertions above, rewritten rather than
deleted.

**Action.** Closes F21. Expedition 1 is now 36.7 minutes against the GDD's
fifteen-to-thirty-five band — 1.7 over, where it was 0.5 over — and that is
the deliberate consequence of two decisions taken together: keep the climb,
and arrive. Recorded in *Open questions* as the band being the thing that
should move, since it is the only one of the three that was never measured.

## F32 — The budget is costed at 2.07 megapixels and the floor device draws 5.94

Deciding the floor device settled one question and opened a smaller one
underneath it. Every line of the frame budget is written against **1080p**,
and no Mac renders 1080p at any setting the game currently asks for.

| | pixels |
| --- | ---: |
| the budget's 1920×1080 | 2.07 Mpx |
| this Mac's logical display, 1512×982 | 1.48 Mpx |
| …at `devicePixelRatio` 2, which is what the app asks for | **5.94 Mpx** |

`app/src/main.ts` has always read
`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. On the old Iris Xe
floor that line was nearly free — a 1080p panel at DPR 1 is the budget's own
resolution. On the new floor it means a fullscreen frame is **2.9× the pixels
the budget was costed against**, and F30 measured fragment cost as close to
linear in them.

**What this finding does not contain is the number.** The fit that would price
it — 0.347 ms per megapixel — is fitted over 0.52 to 2.76 Mpx, and 5.94 is
more than twice beyond its last data point. Multiplying it out gives about
2.3 ms, and that figure is an extrapolation rather than a measurement, which
is a distinction this document has spent thirty-one findings not blurring. It
is recorded here as the quantity to go and get.

The capture already takes it: `width`/`height` and `only` were added so the
question needs one station rather than seven.

```
__ns.frameCost(20, [3024, 1964], ["wall-rim"])
```

It could not be run here. The browser pane this session drives throttles to
about 1 Hz whenever it is not being looked at, and every attempt was refused
by F30's own frame-rate guard — correctly, and with the arithmetic in the
refusal: *"animation frames are arriving at 1.0 Hz, so this capture would take
about 2,411 seconds per station instead of six."* A capture taken anyway would
have been a measurement of a throttled compositor.

**Two things follow whatever the number turns out to be.** The budget table
should be denominated in **megapixels rather than a resolution name**, because
megapixels is the quantity that transfers between a 1080p panel and a Retina
one and "1080p" is not. And `setPixelRatio` is now a budget knob rather than a
default: capping it at 1.5 would cost 44 % of the fragment work and some
sharpness, and neither half of that trade has been looked at.

**Built.** `width`/`height` and `only` on `captureFrameCost`, so a capture can
be taken at any resolution and at a subset of stations; `__ns.suspend()`,
exposed because a hand measurement needs the same seam the harness uses — the
first attempt at one here was killed partway through and left the canvas at
the wrong size, which is exactly what the harness's `finally` prevents. And a
comment on `setPixelRatio` naming what it costs, because the next person to
read that line should not have to rediscover it.

## F33 — The controls were written down three times, and a key needs no ramp

The prototype's controls were a `keydown` handler with a key per `if`, a
hand-typed list of the same keys for `preventDefault`, and a help block in the
HTML naming them a third time. Three copies of one fact, none checked against
the others, and the GDD asks for a gamepad from day one — which would have been
a fourth. Workstream D lists the input abstraction at two weeks and the
critical path says to build it before G1 rather than after, so this is it.

**Built.** `engine/src/input/` — a binding table as data (`bindings.ts`: each
control's keys, its standard-mapping gamepad button or stick axis, its label
and the operator's note), a keyboard source and a gamepad source that read
it, and one `Input` the frame polls for a single intent. The help block is
generated from the table at boot, the `preventDefault` set is derived from it,
and a test asserts that every bound key and button appears in the help and
nothing else does. Both devices are live at once — the axes sum and saturate,
so a stick nudge on top of a held key is heard — and the HUD names which
device spoke last, because a G1 note that says "found the climb hard" means
something different on a stick than on a key.

**What a key does, measured.** The obvious thing to add to a digital key is a
ramp, so a press does not slam the axis to one. It is not built, and the
reason is a number rather than a taste. The flight model already lags every
command by its own time constant — four seconds on pitch, one and a half on
bank, both stretched by the density ratio — and a ramp of any length a hand
would tolerate disappears underneath it. Holding `W` for three seconds
through `step`, at 120 Hz, in still air:

| | from 500 m | from 4,500 m |
| --- | ---: | ---: |
| max climb rate | 6.49 m/s | 2.11 m/s |
| altitude gained, key stepped to 1 | 5.6 m | 1.3 m |
| …with a 0.1 s ramp | 0.18 m less | 0.04 m less |
| …with a 0.3 s ramp | 0.50 m less | 0.12 m less |
| …with a 0.5 s ramp | 0.81 m less | 0.19 m less |

Half a second of ramp is worth eight-tenths of a metre, below anything the
HUD rounds to. What a stick adds is not smoothness but *partial* deflection,
and that is the gamepad's job, not a filter's. The same run says something
about the heaviness the G1 protocol asks the cohort to notice: a one-second
tap of `W`, left to settle, gains 6.5 m at 500 m and 2.0 m at 4,500 m; a
half-second tap of `D` turns the heading 5.0° down low and 4.0° up high. The
lag the model calls "feels heavy" is a factor of three on the vertical and a
fifth on the turn, which is consistent with the density ratio's 0.63 and the
plateau's climb rate of a third — and it says the roll lag is the one the
cohort will feel least, since the camera never banks and the HUD has no bank
readout. That is an observation for the comfort pass, not a change here.

**A default, flagged.** The stick is not inverted: pushing it forward climbs,
because `W` climbs and the G1 cohort has no flight-sim habits to honour. It is
a default and not a finding — `invertPitch` on the gamepad source flips it,
and it is worth a line on the G1 questionnaire rather than a guess.

**What this does not verify.** No gamepad was attached to this machine. The
pad path is tested against a literal shaped like a `Gamepad` — dead zone,
mapping, one press per button-down, forgetting held buttons on disconnect —
and the app's polling of `navigator.getGamepads()` typechecks against the
real interface. It has not been driven by a thumb. That is the first thing
to do with a pad in the room, and it costs a minute.

Test count 367, from 347; 359 of them run without a world (368 and 360 after F34).

## F34 — At native Retina the frame costs 2.13 ms, and the pixels land on the clear and the sky rather than the terrain

F32 priced a fullscreen Retina frame by extrapolating a fit that stopped at
2.76 megapixels, called the result an estimate, and named the command that
would replace it. The command was run on the M3, with the game window in
front, at 3,024×1,964 — the display's native 5.94 megapixels — at the wall-rim
station, twenty samples, the display's own 120 Hz.

| wall-rim, ms | 1080p, 2.07 Mpx (F30) | native, 5.94 Mpx | ratio |
| --- | ---: | ---: | ---: |
| clear | 0.53 | 1.70 | 3.2× |
| terrain, net of clear | 0.43 | 0.44 | 1.0× |
| horizon, net of clear | 0.07 | 0.22 | 3.1× |
| whole scene | 0.81 | 2.13 | 2.6× |
| L0 displaced grid, net | 0.10 | 0.10 | 1.0× |

The instrument re-fitted itself at the new size — 0.272 ms per megapixel plus
0.521 ms per pass, r² 0.96, over 1.48 to 7.92 megapixels — so 5.94 is inside
the sweep this time rather than twice beyond it. F32's extrapolation was 2.3
ms for the whole frame; the measurement is 2.13. Close enough to say the
extrapolation was honest, and different enough to be glad it was labelled one.

**Where the pixels go.** 2.9× the pixels cost 2.6× the frame, and the table
says which passes paid: the empty-frame clear and present tripled, the horizon
ring — a full-screen fragment job, sky and haze — tripled, and the terrain did
not move. Terrain at this station is 261k triangles across 137 instances and
is bound by vertices, not pixels; its fragment shader is cheap enough that
tripling its pixels is invisible under the instrument's floor. So the
resolution question is a question about the passes that are not built yet —
sky, atmosphere, post and weather, the budget's 8 ms of full-screen work —
and not about the terrain that is.

**Decided: `setPixelRatio` stays at 2.** The whole current frame is 2.13 ms of
33.3 at native resolution on an M3, and the pass a cap would actually shrink is
the 1.70 ms clear. Capping to 1.5 would save about a millisecond and cost the
sharpness of every edge in a game whose art direction is faceted terrain. It is
a knob worth keeping named — the comment on the line stays — and not one worth
turning on this evidence. It gets looked at again when the atmosphere lands,
because that is the pass the pixels will land on.

**Decided: the budget is costed at the floor device's native pixel count.**
"1080p" was a Windows laptop's panel and the floor is now a Mac. A budget
denominated in a resolution the floor never draws is not a budget. The
reference floor is a 13-inch M1 at 2,560×1,600 at 2× — 4.10 megapixels — and
the plan's frame table now says so (D27). The capture's default stays 1080p,
because captures are only comparable to each other at a fixed size and every
capture already states its own; the native number is one argument away.

**What this does not verify.** The M1 has still not been captured. This is an
M3's frame at an M3's display; the floor's frame at the floor's display is the
same one-line command on that machine.

Also: a one-station capture printed its resolution as `±NaN ms`. `resolutionMs`
returns NaN on purpose — the spread of one number is not zero, it is
undefined, and a test says so — but the table printed the NaN rather than
saying why. It now says why.

**Addendum — F30 reproduced in a real window.** The same M3 then ran the full
seven-station capture at 1080p from its own Chrome window, at the display's
128 Hz, where F30's had been taken in the tool's browser pane. Whole scene
0.69–1.21 ms against F30's 0.81–1.61; terrain net 0.14–0.78 against
0.19–0.43; clear 0.47–0.85 against 0.52–0.84; resolution ±0.39 ms against
±0.32. Every cell agrees with F30 inside the capture's own resolution except
Wuhan's terrain, 0.78 against 0.31, which is one station's worth of
contention and sits beside a clear of 0.59 and an L0 of 0.46 that are both
that station's highest. The instrument re-fitted at 0.440 ms per megapixel
plus 0.226 per pass, r² 0.96. The conclusion does not move: on this machine
everything drawn is about a millisecond of the 33.3 ms frame, at every
station. It is still not the M1.

**Addendum — the pane cannot be measured in, and the second defence is what
proved it.** F32 recorded that the tool's browser pane throttles to about 1 Hz
and that the capture's frame-rate guard refuses it. That left a question the
refusal could not answer: is the pane merely slow, or is it unmeasurable? It
is unmeasurable, and it took getting past the guard to find out.

The pane runs at 95 Hz while a screenshot is being taken of it and at about
1 Hz otherwise, so a capture started immediately after a burst of screenshots
passes the rate check, and a capture kept under continuous screenshot pressure
runs to completion. One did: three stations at 3,024×1,964, lowest of 12,
reported at 36 Hz. Every number in it is rubbish.

```
instrument: 0.443 ms per megapixel + 0.684 ms per pass, r² 0.8859
            ⚠ POOR FIT — these numbers are not measurements

  station      clear terrain horizon   all
  shanghai      2.47   0.18   0.53    3.76
  wall-rim      7.32  -0.55  -4.73    2.90
  lhasa         2.80   3.36   1.36    4.11

  resolution ±4.84 ms
```

Against the same machine's real window ten minutes earlier: clear 0.47–0.85,
terrain 0.14–0.78, resolution ±0.39. Here `clear` — identical work at every
station — ranges over 4.84 ms, a pass costs negative time, and the fit falls
to r² 0.886 against the 0.95 floor. The report says so itself, on its own
second line, without being asked.

**The cause is the remedy.** Screen capture is GPU work. The screenshots that
keep the pane's animation frames arriving are contending with the very draws
being timed, so the thing that makes the pane fast enough to measure in is the
thing that makes the measurement worthless. There is no setting that separates
them.

**What this says about the instrument.** The two defences are independent and
the second one is not decoration. The frame-rate guard is about *time* — will
this finish, or will it look like a hang — and it can be satisfied by a window
that is fast and noisy. The linearity check is about *trust*, and it caught a
capture the first check had waved through. D25 built both because a number is
either a measurement or it is not; this is the first time only one of them
fired, and the run it rejected is the run that would otherwise have been
written down.

So the pane is closed as a route, not deferred: frame measurements are taken
in a real window on the machine being measured, and nowhere else.

## F35 — The horizon lock was already on, and the thing smoothing was meant to absorb is the aeroplane being thrown upward by the terrain

The comfort pass is on the critical path's "can start early and should" list —
cheap, and motion sickness discovered at G2 is a redesign — and the risk
register moves it up on the first G1 participant who stops for discomfort. F33
added a reason of its own: the roll lag is the one heaviness cue the cohort
cannot feel, because the camera never banks. The GDD names three settings: a
horizon-locked camera option, a field-of-view slider, and camera smoothing.

Two of the three are built. The third could not be, and the measurement that
removed it is the finding.

**Horizon lock was not the option, it was the behaviour.** `placeAt` built its
chase camera out of heading alone —

```ts
const fwd = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
```

— so `bankRad` reached the flight model, the turn rate and nothing else. The
horizon has been locked since the first frame this prototype drew, and there
was nothing to lock. So the work is the *unlocked* camera, and the GDD's
comfort setting is the zero at one end of it: `camera.up` is world-up rotated
about the view axis by `bankFollow × bankRad`, set every frame including at
zero so that turning the lock back on levels the camera rather than leaving
the last tilt baked into the basis.

What the setting is worth, six seconds of full stick at cruise, sea level:

| `bankFollow` | steady horizon tilt | peak roll rate |
| --- | ---: | ---: |
| 0 — horizon locked | 0° | 0°/s |
| 0.35 — eased | 20.5° | 13.3°/s |
| 1 — with the wing | 58.7° | 37.9°/s |

0.35 is a default and not a finding, in the sense F33 used for the stick's
pitch sign: it puts the roll where the cohort can see it at a third of the
rate the wing would. It is a G1 question and belongs on the questionnaire.

**The sign is asserted on screen, not in the number.** It passes through
`applyAxisAngle`, `lookAt` and a projection matrix before it becomes a pixel,
and a flipped one is a camera that rolls the wrong way in every turn — wrong
in a way that looks deliberate, reads as "this felt bad" in a G1 note, and
cannot be found by reading the constant. So the test projects two horizon
points through a real `PerspectiveCamera` and asserts that in a right bank the
right-hand one lands higher, which is what a right turn looks like out of a
windscreen. Confirmed in the browser as well: at `bankFollow` 1 and 36.6° of
bank the camera's up-vector sits 36.6° off world-up, and at 0.35 with 25° of
bank it sits 8.8° off.

**The field of view is free.** Nothing in the scene is frustum-culled.
`Terrain.update` makes a circular disc of tiles resident around the aircraft
and the impostor is a ring; neither reads the camera, so the field of view
cannot move the frame budget. It is also the only one of the three settings
with a mechanism this rig can act on — peripheral optical flow is what drives
vection, and the field of view decides how much of it there is. Cycled rather
than slid, because the prototype's other settings are cycles and a
participant can say "the second one".

It did leave one thing behind it. `probe.ts` converted scanlines to degrees
through a written-down `62`, and a written-down field of view in a build that
has a setting for it is a probe reporting degrees for a frustum nobody is
looking through. It reads the camera now. The capture pins the field of view
the way it pins the resolution — belt and braces, given that nothing is culled,
but three lines that mean a comfort setting can never quietly make two
captures incomparable (D25).

### Camera smoothing had nothing to smooth, and finding out why found something worse

A first-order lag has unity gain at DC. It delays a sustained motion without
reducing it. So before building one it is worth asking what in this rig can
actually *step*, and the answer is almost nothing: heading, bank, airspeed and
vertical rate are all lagged by the flight model already, and horizontal
position is their integral.

Altitude can. `step()` ends with

```ts
const floor = env.groundElevationM + BOUNCE_CLEARANCE_M;
if (state.altitudeM < floor) state.altitudeM = floor;
```

which reads as a safety net. It is not a net. Horizontal motion is multiplied
by the mode's ground gain and vertical motion is not — the asymmetry `scale.ts`
exists to defend, and the whole of F15 and F19 — so at cruise the aeroplane
covers 2,167 m of ground a second while climbing at best 7.1, and **cannot
out-climb a gradient of 0.0033**. Flown over the committed Sea to Sky section:

| | |
| --- | ---: |
| steepest kilometre of the route, uphill | 0.628 — 32.1°, 2,271 → 2,899 m |
| gradient the aeroplane can out-climb at cruise, sea level | 0.0033 — 0.19° |
| ratio | 191× |
| worst single frame the clamp adds, autopilot at 600 m AGL | 20.8 m |
| frames the clamp is lifting the aeroplane | 2.2 % of the route |
| longest unbroken run of them | 60 frames — a full second |

Twenty metres of altitude in a sixtieth of a second is 1,250 m/s of camera,
and it is not one event: one frame in forty-five over a twenty-minute flight,
and a whole second without a break at its worst. In the mountains the clamp is
not catching the aeroplane, it is flying it.

**No filter on the camera can take that out**, and the measurement says so
rather than the argument. Flying the same route with a first-order lag of
tau 0.25 s on the camera's altitude — clamped to 60 m, because an unbounded
lag ends up inside the hill — moved the peak vertical acceleration of the
camera by less than a factor of two, and in one of three policies moved it the
**wrong way**: 4,957 g rigid against 5,607 g smoothed for level flight at
cruise. What a lag has to work on is corners, and the corners here are one
frame wide and arrive sixty times a second. A camera that genuinely filtered
this would be underground.

So there is no camera-smoothing setting, and the reason is not that it was
skipped. The rejected filter is kept as a test rather than as code, so the
claim stays checkable.

**An instrument note, because it nearly became the finding.** The first pass
measured 462 m in a single frame and 170,000 g. Both were the fixture: the
route fixture's ground sampler is `profileM[Math.round(km)]`, a 1 km staircase,
and a staircase read at 36 m a frame reports its own sampling. The renderer
samples its heights bilinearly, so the measurement does too, and every number
above is from the interpolated profile. The staircase numbers were wrong by a
factor of twenty-two.

**What this leaves open, and it is not a camera question.** The GDD promises
"flying into terrain bounces you up with a soft camera shake" and the shove is
neither soft nor a shake. Three ways out, and choosing between them is a
design decision rather than an engineering one:

- **Leave it.** It is one frame in forty-five and no participant has yet
  reported it. The comfort pass now has the settings that might matter more.
- **Soften the clamp in `flight.ts`** — push the aircraft up over a few frames
  instead of assigning the floor outright. Cheaper than it sounds and it is
  the only fix that makes the aeroplane's own altitude continuous, which is
  what every other consumer of it would prefer too.
- **Drive the camera from a smoothed ground profile** rather than from the
  aircraft, which is the standard terrain-following chase camera. It works,
  and it trades the judder for the aircraft bobbing in frame — invisible today
  because no aircraft is drawn, and not invisible the moment one is.

The G1 protocol asks participants to fly low through a gorge. That is exactly
where this fires, so it is worth deciding before the cohort rather than after.

## F36 — The sky is an altimeter and not a map, it is already as strong a cue as a physical sky would be, and the milk the basin is named for only appears at a hundred kilometres

The atmosphere sits on the critical path into G1 because the GDD calls the
deepening sky the first visual cue for altitude, and G1's first pass criterion
is that **six of ten remark on the climb, the thin air or the plane going
heavy without being prompted**. So the atmosphere's job at that gate is one
specific thing, and nothing in the repository had measured whether it does it.
What is built is D12: three region sets — coast, basin, plateau — blended once
per frame at the aircraft, a flat clear colour lerped toward a deep blue as the
air thins, and exponential height haze in the terrain and impostor shaders.

Colour differences below are CIE dE76, where about **2.3** is a just-noticeable
difference and about **10** reads as a different colour at a glance. RGB
distance answers none of these questions: the same step near black and near
white is the same number and nothing like the same sight.

### The cue is real, and it is all altitude

| | dE |
| --- | ---: |
| sea level → 4,500 m, over the eastern plain | 32.1 |
| sea level → 4,500 m, over the Sichuan Basin | 34.7 |
| sea level → 4,500 m, over the plateau | 22.6 |
| the whole country, plain → plateau, at a held 4,000 m | **5.1** |

Where you are is worth a fifth of how high you are. That is not a defect — it
is the GDD's own claim, confirmed — but it does mean the region blend is
almost invisible *in the sky*, and everything D12 buys is in the haze instead.
The plateau's climb cue is the weakest of the three for a reason worth keeping:
its own haze colour is already a blue close to the thin-air colour, so there is
less of the curve left to run by the time you get there.

### It arrives too slowly to be seen arriving

G1's session is twelve minutes from the start: 1,200 m to 3,863 m, and every
kilometre of it over the eastern plain, so the region weights never move and
the whole of the change is the climb.

| minute | altitude | dE since two minutes ago |
| ---: | ---: | ---: |
| 0 | 1,200 m | — |
| 2 | 1,549 m | 2.4 |
| 4 | 2,137 m | 4.1 |
| 6 | 2,655 m | 3.7 |
| 8 | 3,109 m | 3.3 |
| 10 | 3,510 m | 3.0 |
| 12 | 3,863 m | 2.7 |

Nineteen dE end to end, which is plainly visible as a *difference*. Spread over
twelve minutes it is **1.6 dE a minute** — under the threshold at which a
change can be noticed happening at all. So the cue is real and it is not an
event: a player who compared minute 0 with minute 12 side by side would see it
immediately, and a player living through it will not see it move. That is worth
knowing before a cohort is asked to remark on it unprompted, because it is the
difference between a criterion about the sky and a criterion about memory.

### A physical sky would not make it stronger

The obvious response is that the flat clear colour is the problem and the plan's
analytic Rayleigh + Mie sky is the answer. Measured, it is not. A single-
scattering Nishita model on the CPU — Rayleigh at 5.8/13.5/33.1e-6 m⁻¹, Mie at
21e-6 with g = 0.76, scale heights 8,000 m and 1,200 m, sun 45° up, looking away
from it — gives this for the same climb:

| exposure | horizon | 10° up | 30° up | zenith | mean over 0–35°, the band the camera sees |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 17.3 | 18.5 | 31.6 | 9.9 | 24.0 |
| 12 | 17.6 | 19.6 | 34.0 | 11.2 | 25.5 |
| 18 | 16.9 | 19.9 | 35.6 | 12.5 | 26.2 |
| 26 | 15.1 | 19.2 | 35.8 | 13.8 | 25.7 |
| 40 | 11.5 | 17.1 | 33.8 | 15.3 | 23.5 |

**The shipped flat sky is worth 32.1 over the same climb, across the whole
screen at once.** A physical sky beats it in one narrow band — 30° up, which a
chase camera aimed slightly above the aircraft barely sees — and is worth two
thirds as much everywhere else. The band the camera actually looks through
averages 23.5 to 26.2 dE, and that range is flat across a fivefold sweep of
exposure, so the conclusion is not an artefact of a tone curve I chose.

Two things this does not say. It is a single-scattering model: multiple
scattering fills in the dark zenith and would *narrow* the gap between
altitudes further, so the figures above are, if anything, generous to the
physical sky. And it is one sun angle. A physical sky's real payoff is a low
sun — sunrise, sunset, the hour either side — which is phase 3's *seasons and
time of day*, not G1's altitude cue.

So the analytic sky is a looks item and not a gate item, and it belongs where
its payoff is.

### Milk and glass is a long-range effect

The other half of D12 is the claim that the basin reads as milk and the plateau
as glass. That is a haze-density claim — coast 3.5e-6, basin 7.0e-6, plateau
8.5e-7 per real metre, an 8.2× spread — and it had also never been measured.

| | half-visible at 1,000 m | at 4,000 m |
| --- | ---: | ---: |
| Yangtze & East coast | 234 km | 386 km |
| Sichuan Basin | 117 km | 193 km |
| Qinghai-Tibet Plateau | 963 km | 1,588 km |

How much more of a ridge the plateau's air leaves than the basin's, at 4,000 m:

| distance | 40 km | 100 km | 200 km | 400 km |
| --- | ---: | ---: | ---: | ---: |
| the ridge keeps | 1.13× | 1.4× | 1.88× | 3.5× |

At forty kilometres — eighteen seconds of cruise, which is *near field* in a
game that crosses 2,167 real metres a second — the basin is 13 % hazed and the
plateau 2 %, and both read as clear. **The basin does not read as milk while
you are in it. It reads as milk when you look across it**, and by then you are
looking at the horizon impostor rather than at streamed terrain. That is not
wrong, and it is not what the sentence in the plan implies.

### One thing that fell out of it: the world's outer edge

The impostor stops at 1,200 km (D15). How visible its last ridge line is
depends entirely on whose air you are in — eye at 5,000 m, ridge at 6,000 m:

- coast: **81 % hazed**, and the world ending there is nothing to see
- plateau: **34 % hazed**, so the outermost skyline is a real line with clear
  sky behind it and no terrain behind that

This is F1's 1,312 km reveal seen from the other end: the same clean plateau
air that makes the wall worth showing from far away is the air that makes the
edge of the drawn world legible. Not acted on here — it is a reach question and
F1 already owns it — but it is now a number rather than an intuition.

### Instrument notes

Two, and both mattered. The first pass at the physical sky used a linear
exposure and clipped four of its twenty cells to white, which compresses
exactly the differences being measured and made the zenith look like the
strongest cue; `1 - exp(-L·k)` fixed it and moved the answer. And the whole
comparison is in Lab rather than RGB, which is why the region blend comes out
at 5.1 rather than looking respectable.

### What moves

The atmosphere comes off the critical path into G1. Not because it is
unimportant — because the criterion it was there to serve is already served as
well as a physical sky would serve it, and what a physical sky adds is a low
sun, which is phase 3. What was built here instead is the measurement's own
scaffolding, so none of this can quietly rot: the blend moved out of `main.ts`
into `engine/src/gfx/aerial.ts`, a perceptual-difference helper went in beside
it, and nine tests pin the numbers above — including the no-seam rule, that the
clear colour and the colour terrain fades into are the same value, which is now
checked rather than asserted in a comment.

## F37 — Asking where the aircraft *is* loses a discovery in four at boost, and Expedition 1 flies past none of the cards it has

The discovery trigger is workstream D's four-week item and it sits on the
critical path into the expedition runner without depending on G1, so it is
buildable now. The plan's line for it is one sentence: *uniform spatial grid
over the ~150 point triggers, polled at 4 Hz, per-entry radius, single-card
queue with cooldown, seen-set persisted.* Two of those four changed on
measurement, one turns out to cost nothing, and the content it runs over
turned out to have a hole in it.

### A point poll flies straight through small catchments

Horizontal motion carries the mode's ground gain and vertical motion does not
— the asymmetry `scale.ts` exists to defend — so the aircraft crosses real
ground very fast indeed. What 4 Hz means in metres:

| | `low` | cruise | boost |
| --- | ---: | ---: | ---: |
| ground between polls at 4 Hz | 181 m | 542 m | 1,083 m |
| smallest catchment a dead-centre pass can slip through | 0.09 km | 0.27 km | **0.54 km** |

Randomising the poll phase and the impact parameter over crossings that
genuinely happen, and counting how many get reported:

| catchment radius | point poll, cruise | point poll, boost | swept segment |
| --- | ---: | ---: | ---: |
| 0.5 km | 94.8 % | **69.8 %** | 100 % |
| 1 km | 98.8 % | 95.0 % | 100 % |
| 2 km | 99.7 % | 98.9 % | 100 % |
| 5 km | 100 % | 99.8 % | 100 % |

Three flights in ten through a 500 m catchment at boost are never reported.
That is not a rounding error in a HUD, it is **a discovery that silently does
not happen** — the worst failure this system has, because nothing downstream
can tell it apart from a player who did not go there.

The three cards in the repository are 15 km and 120 km, so none of them is at
risk today. The schema is what is at risk: `radius_km` has no floor, and the
first author who writes a tight catchment for a small landmark gets a card
that fails one flight in twenty with nothing to show for it.

So the question asked is not *where is the aircraft* but *where has it been*:
the distance from each catchment to the segment travelled since the last
update. That reports every crossing at every radius at every speed, and it
makes the poll rate a cost decision rather than a correctness one. Entry is
reported as a fraction along the segment rather than a yes, so a single update
that crosses several catchments hands them over in the order they were flown
into rather than in array order.

### The grid is not needed, and neither is 4 Hz

A linear scan of **230** catchments with the segment test costs **1.28 µs** an
update — 0.0005 % of a core at 4 Hz, 0.008 % at 60. There is no spatial index
here and none is wanted; the note in the plan should be read as a budget that
was never spent rather than a design. And since the cost is nil and the
segment test makes the rate irrelevant to correctness, the sensible rate is
every frame: shorter segments, no accumulator, one less thing running on its
own clock.

### A swept test needs a seam, and a map jump is where

The segment is also the bug. The GDD's free flight lets the player *jump to
any map pin with a three-second fade rather than fly back across the country*,
and a jump asked as a flight is a 2,900 km segment: every catchment within
radius of the straight line from Shanghai to Lhasa would be collected at once.
Measured on 230 strung-out catchments, the same call hands back ten as a
flight and none as a jump. So `advance` and `moveTo` are different verbs, and
`moveTo` still fires what the player has landed inside, because they really
are there. This is the same seam the comfort pass needed for the camera (F35):
anything that remembers where you were has to be told when you did not travel.

### Projecting a circle costs 2.5 % and buys a haversine per poll

Catchments are authored as a latitude, a longitude and a radius in kilometres;
the flight is in Albers metres. Projecting the centre once at load and keeping
the radius in metres tests a circle in the plane, which is not quite the circle
on the sphere — Albers is equal-area and not conformal. Walking 15 km in every
direction and measuring the result in the projection:

| | radius comes back as | out of round |
| --- | --- | ---: |
| Wulingyuan (29.3 N) | 14.87 – 15.12 km | 1.65 % |
| Heihe, the NE corner | 14.77 – 15.28 km | 3.43 % |
| Hainan, the worst in the country | 14.58 – 15.38 km | **5.34 %** |

2.5 % of largest radial error, on a radius an author picked by feel, against a
haversine per catchment per poll. Recorded so that nobody later "fixes" it.

### The thing the measurement did not expect: no card fires on Expedition 1

`npm run content:discoveries` flies each authored route past the whole card
set. A report and never a gate, for the same reason `content:teaches` is one.

```
  sea-to-sky · 2931 km · 3 card(s) in the set
    ⚠ no card fires on this route
    not passed:
      ayding-lake                 1476 km away at its nearest · radius 15 km
      qinghai-tibet-plateau        476 km away at its nearest · radius 120 km
      wulingyuan                    91 km away at its nearest · radius 15 km
```

Ayding Lake is in Turpan and belongs to another expedition; that one is fine.
The other two are not.

**Wulingyuan misses by 76 km** — 91 km off the Wuhan–Chongqing leg against a
15 km catchment. It is the kind of miss a route tweak or a second landmark
fixes, and it is the ordinary case this report exists to surface.

**The plateau card is a different problem.** Expedition 1 spends its last third
on the Qinghai-Tibet Plateau, and the card called *Qinghai-Tibet Plateau* does
not fire, because it is 476 km away. It is not misplaced: 33.0 N 88.0 E is the
middle of the Changtang, which is exactly where the plateau is flattest and
exactly where F29 already found the route does not go. The fault is the
*shape*. A region is not a disc, and the schema gives it the same
`{lat, lon, radius_km}` a landmark gets, so a card about 2.5 million km² is
represented by a 120 km spot and a player who crosses the plateau is never
told they are on it. That is the discovery layer failing its single most
important card on the flagship route.

Worth naming, because it is nearly free: the renderer already knows.
`standInRegionWeights` decides coast, basin or plateau from ground elevation
and distance inland, every frame, to blend the air (F36). A region card that
fired on that weight crossing a threshold would be right everywhere by
construction, and would need no coordinates at all. Which of that, a polygon,
or simply a much larger radius is right is a schema decision, and it is in
*Open questions* rather than here.

## F38 — The route check guarantees a flight the player can opt out of with one key, and progress along a route is not a position

The expedition runner is the workstream D item every other phase-2 system
converges on, and most of it exists already: `flyRoute` flies an authored
route over real ground, `climbFloor` says how high it has to be, `validateRoute`
runs both halves in CI, and F37's trigger field watches for the things beside
it. What was missing is the part that runs while somebody is holding the
stick — where along the route the aircraft has got to, which leg it is on,
and what fires when.

Four things came out of building it. One is a hole in a guarantee this
repository has been quoting since F18.

### The route's numbers were all measured at one pacing, and the player has a key for it

`npm run content:validate` prints, on every commit: *clears by 333 m at
2366 km · arrives 264 m up against an authored 300*. Both halves of that are
flown at the shipped cruise pacing, 130 km/min, because that is what
`flyRoute` defaults to and nothing in the expedition file says otherwise. The
running game binds `P` to a three-way toggle over {80, 130, 190}.

Flying the authored profile — `low / low / cruise / cruise` plus the
approach — at each pacing, through the same `validateRoute` the gate uses:

| cruise km/min | clears the ground | worst clearance | gets down onto Lhasa | lowest arrival |
| ---: | --- | ---: | --- | ---: |
| 60 | yes | 1,075 m | yes | 299 m |
| 73 | yes | 960 m | yes | 306 m |
| 80 | yes | 889 m | yes | 291 m |
| 100 | yes | 671 m | yes | 297 m |
| **130 — authored** | yes | **333 m** | yes | **251 m** |
| 160 | yes | 13 m | **no** | 592 m |
| 190 | **no** — contact at km 2,359 | **−210 m** | no | — |

Two failures, and they arrive in the order nobody would guess. **The arrival
breaks first.** At 160 the aeroplane still clears the ground — by thirteen
metres — and can no longer descend into Lhasa, finishing 592 m up against an
authored 300, because getting down is a matter of seconds and there are fewer
of them (F23, F31). Only at 190 does the terrain win, and where it wins is
F17's crash again: km 2,359, in the Nyainqêntanglha, 210 m inside the ridge at
the worst of it.

The guarantee is one-sided. Slower is safe on this route all the way down to
60 km/min; faster is a different flight from the one CI checked. So an
expedition is flown at or below the pacing its route was checked at (D31), the
bundle carries that number so the runtime can enforce it, and free flight —
which is what a G1 session is — keeps all three candidates. The HUD says when
it is holding: `cruise 190 km/min ◂ held at 130 for sea-to-sky`.

Worth being plain about what this was before today: the number 130 appears in
no expedition file. It is a constant in `scale.ts` that the check happens to
default to, and every "this route clears by 333 m" in this repository has been
a claim about it. The bundle now writes it down. Whether an author should be
able to *set* it — a route validated at 80, say — is a schema question and is
in *Open questions*.

### A kilometre off the line, the route is describing a different mountain

Everything a route knows is indexed by distance along it: the altitude floor,
the arrival ceiling, the remaining minutes, the clearance. The aircraft is not
on the line. Sampling the built corridor either side of Expedition 1 and
comparing with the route's own profile, at 2 km stations:

| off the line | ground differs by > 100 m | > 300 m — the margin the route keeps | > 1,000 m |
| ---: | ---: | ---: | ---: |
| 1 km | 25 % | **4 %** | 0 % |
| 2 km | 36 % | 14 % | 0 % |
| 5 km | 48 % | 23 % | 3 % |
| 25 km | 56 % | 35 % | 7 % |
| 50 km | 60 % | 40 % | 10 % |

So the runner's kilometre is a position *along the route*, and nothing more.
Anything that needs to know what is under the aircraft asks the terrain, which
the HUD already does. Every route-indexed number the runner reports carries
`crossTrackM` beside it, because that is the distance between the player and
the thing the number is about.

### The projection needs a memory, and a corridor cannot be tighter than the aeroplane's turn

Nearest-point projection onto a polyline is ambiguous inside a corner: the
line bends towards the aircraft, so a point off to the side reads as further
along than the station it came from. Swept over every kilometre of
Expedition 1 and both sides of it:

| off the line | worst error in credited distance | where |
| ---: | ---: | --- |
| 5 km | 3.5 km | the run-up to Chongqing |
| 25 km | 17.7 km | " |
| 50 km | 35.5 km | " |

**0.71 km of credit per kilometre off the line**, at the 39.1° turn into
Chongqing, which is this route's sharpest. A straight cut across that corner —
60 km before to 60 km after — flies 113.1 km and is credited 120.0.

The other half of the geometry is the one a longer route makes worse. Sea to
Sky's closest non-adjacent legs pass **266 km** apart, and at cruise 266 km is
**two minutes of flying**. An unwindowed projection is therefore one ordinary
detour away from crediting several hundred kilometres nobody flew. So progress
is monotonic, and one update may credit at most 1.5× what it covered.

How wide should the corridor be — the band inside which a player still counts
as flying the route? Not a number picked by feel: the aeroplane cannot hold a
line tighter than it can turn. A full-bank reversal, measured through the
flight model:

| | at 1,200 m | at 4,500 m |
| --- | ---: | ---: |
| `low` | 5.3 km | 7.8 km |
| cruise | 16.2 km | 23.3 km |
| boost | 36.0 km | 23.3 km — boost is locked out up here (F16) |

Anything under about 20 km would report every sightseeing turn as leaving the
route. 25 km is wider than every cruise reversal and narrower than the 266 km
that would let the projection jump legs.

### The window, on its own, is a trap

The first version froze. A detour outside the corridor stops progress — which
is right — and then the player rejoins the route forty kilometres further on,
and the window is `[wherever progress stopped, + a little]`, so everything
ahead is outside it, forever. The expedition simply ends without saying so.
The test that caught it is the detour case; the fix is that rejoining the
route ahead of where progress stopped is allowed, and is treated as what it
is — *arriving somewhere without having flown the route to get there*, which
is the same seam F37 needed for a map jump, in the coordinate a route has.

### A beat is a kilometre, not a disc

A discovery card is a catchment because free flight has nothing to measure
against. On a route there is: asking whether progress has passed a kilometre
cannot miss at any frame rate or speed, needs no radius an author has to
guess, and fires in route order by construction.

What a detour does to narration then has a clean answer. Beats between where
the player left the route and where they rejoined it are marked heard and
**not played** — going round Wuhan and being told about Wuhan eighty
kilometres the far side is exactly the desync the plan's "location-triggered
beats" line is there to prevent. They are reported as `skipped`, so a journal
can one day say the player went round rather than through. Arriving counts as
passing the last beat, which every route has: the destination.

### What is connected, and what is not

`npm run content:expeditions` cuts the authored file into
`app/public/expeditions.json` — the same legs the content gate flies, with the
approach split and the pacing it was checked at — and the app fetches it. `X`
flies it: the legs set the speed mode, the pacing is capped, beats play
through F37's single-card queue. Off, which is the default and what G1 uses,
it tracks: progress, leg, cross-track, no cap and no mode override.

`__ns.jumpToKm(900)` puts the aircraft on the route facing along it, which is
the operator control F28's own session protocol implies and could not have
without a runner.

What is not connected is what a beat looks like to a player. The HUD prints
its name and that is all it should do: the card reader is the journal, in
phase 2. The beats themselves are the route's waypoints, which need no author
— passing Wuhan is an event the file already describes. Narration text is a
schema field and a writer's, and neither exists yet.

## F39 — "Resumes at the last beat" costs a third of Expedition 1, and the floor the route ships is what makes a resume answerable

The save layer is workstream D's progression row — *IndexedDB, versioned
schema, 3 local profiles, autosave every 15 s and on every beat* — and it is
the piece that makes the expedition runner's own spec true: F38 built
`snapshot()` and `restore()`, and until now there was nowhere to put them.

### The GDD asks for two different resumes, and they differ by thirteen minutes

Two sentences, both in the design: *the game saves position continuously;
quitting mid-air is fine*, and *quitting mid-expedition saves at the last beat
and resumes there*. Measured against the route, the second is expensive. The
beats are the authored waypoints, and on the authored speed profile they fall
like this:

| beat | km | minute of the flight | gap since the last |
| --- | ---: | ---: | ---: |
| Shanghai | 0 | 0.0 | — |
| Wuhan | 679 | 13.5 | **13.5 min** |
| Chongqing | 1,427 | 26.9 | 13.4 min |
| Chengdu | 1,692 | 28.5 | 1.6 min |
| Lhasa | 2,931 | 36.6 | 8.2 min |

A player who stops at minute 13.4 — one minute short of Wuhan — is put back at
Shanghai, and 679 km they flew did not happen. That is 37 % of a 36.7-minute
expedition, and the gaps are uneven enough that the cost is unguessable from
inside the game: stop just before Chengdu and you lose ninety seconds.

An autosave every fifteen seconds costs a quarter of a minute, and costs it
evenly, because it is a clock rather than a distance. Fifteen seconds is
10.8 km at `low`, 32.5 at cruise and 65.0 at boost, and the player loses the
same fifteen seconds in all three — a save keyed to kilometres would charge
four minutes of plateau crawling for the same interval it charges fifteen
seconds of coast.

So a save holds a position, and the beats already heard sit beside it rather
than instead of it (D33). Resuming at the last beat is still available — the
beat kilometres are in the bundle — and it is now a narrative choice rather
than the only thing the save layer can offer.

### What a save costs the frame, measured in the running game

| | |
| --- | ---: |
| a whole profile, mid-expedition | **325 bytes** |
| IndexedDB write, first of a session | 1.3 ms |
| IndexedDB write, thereafter | **0.1 – 0.2 ms** |
| how often | every 15 s, and on every beat |

Two tenths of a millisecond is 0.6 % of one frame at 30 fps, once every nine
hundred frames. The measurement is the main-thread cost — the transaction
resolving, not the disk flushing — which is exactly the number the frame
cares about and exactly not a durability guarantee. A tab closed hard can
lose the last write, which is the other half of why the interval is fifteen
seconds and not a minute.

### A saved kilometre is only worth anything if the route has not moved

`km: 1500` means a place only while the waypoints it is measured along stay
put. Move one, and the same number is somewhere else — over ground nobody
checked, at an altitude the floor there does not support. This is the argument
a route section already makes about its own elevations (D21) one level up, so
it gets the same treatment: the plan carries a fingerprint over the waypoints,
the leg ends and modes, and the pacing, and a run saved against a different
one keeps its beats — those are places the player really was told about — and
drops its kilometre.

The profile is refused outright in the other cases, and refusing is the point:
a save is the one file in this game written by an older version of it, and the
failure it must not have is the quiet one. Wrong version, missing id, a
position with a missing number — none of those half-load.

### The floor had to ship, because computing one sample means flying the rest

The GDD says a resume "has to be able to say it cannot", and F19 measured why:
Expedition 1's tightest moment has eighteen seconds of nose-down in it. The
quantity that answers it is the altitude floor — the lowest altitude the rest
of the route still clears from — and `climbFloor` computes one sample by
flying the remainder, about 3.5 ms. That is a build step, not a frame.

So the route ships its floor (D18, finally literal), sampled at one kilometre,
which is the resolution its ground profile has and therefore the finest the
number can honestly claim. Sampling coarser was measured:

| stride | samples | bytes | reads *below* the true floor by, over the body | inside the last 100 km |
| --- | ---: | ---: | ---: | ---: |
| 1 km | 2,932 | 15 kB | 0 | 0 |
| 2 km | 1,467 | 7.3 kB | 83 m | 166 m |
| 5 km | 588 | 2.9 kB | 129 m | 268 m |

Reading below the true floor is the one error this table must not make: it
tells a player they can finish when they cannot. The approach taper is where
it bites — the floor moves 409 m in a single kilometre at km 2,898, coming
down onto Lhasa (D20) — and 15 kB against a 67 MB world is not a trade worth
thinking about. The cut takes ten seconds a route.

In the game the floor is an array lookup, so the HUD carries the margin
continuously: `2.3 km of room`, or `4,354 m below the floor`. That number is
F19's hand-off budget, asked at the kilometre the aircraft is actually on
rather than offline about the whole route.

### It caught the first thing it was pointed at

`__ns.jumpToKm(1500)` — the operator control F38 added for starting a session
partway — kept the aircraft's current altitude, which was 1,200 m. The floor
at km 1,500 is 5,554 m, and the HUD said so: **4,354 m below the floor**. That
is F28's hazard exactly ("1,200 m in front of the Hengduan is a crash"), and
it had been sitting in the operator tool since it was written. The jump now
places the aircraft no lower than the floor, and an operator who wants the
altitude a whole expedition would have at that kilometre has it printed by
`npm run content:sessions`.

### What else got connected

The card catchments ship in the same bundle, so the trigger field built in
F37 is now running in the game rather than only in its report — free flight is
where most cards are met, and the seen set is what a profile is for. Nothing
in the corridor's three cards is within reach of Expedition 1 (F37), so the
HUD reads `0 of 3 card(s)` and will keep reading it until that content
decision is made.

What is not built is the menu: one profile is created, and the schema holds
three. Choosing between them is a screen, and screens are phase 2.
`__ns.newProfile()` is what an operator needs between participants, which is
the only reason a prototype needs more than one.

## F40 — The atlas plans 228 entries and the discovery system can reach 150 of them; the page G2 is scored on validates green and is wrong in every field

The journal is phase 2's *journal skeleton* and the last unbuilt node on the
critical path into G2 — `D[Discovery + journal] --> E`, whose other half
shipped in F37. The GDD is blunt about what it is for: *everything feeds the
journal; the journal is the progression.* So this is a counting layer over two
sets, the entries that exist and the entries a profile has met, and almost
everything interesting is about the first set.

### One trigger shape, five kinds of entry

The GDD's volume table names eight entry types and, beside each, how it fires.
Written down as data (`ENTRY_PLAN`) rather than as prose, they do not agree
with each other:

| type | planned | how it fires | shape |
| --- | ---: | --- | --- |
| Hero landmark | 40 | within 15 km | a circle |
| Point of interest | 80 | within 5 km | a circle |
| City | 30 | overflight | a circle |
| Food | 25 | overflying the city that owns it | a circle **on another entry** |
| People & culture | 20 | region entry or landmark | a circle **on another entry** |
| Region | 9 | crossing the region boundary | an area |
| Weather event | 12 | experiencing it | a state |
| Comparison spread | 12 | end of the linking expedition, or both regions complete | a rule |

228 entries. The discovery system built in F37 tests one shape — the distance
from the swept segment to a circle on the ground (D30) — and **150 of the 228
are that shape and nothing else**. Another 45 are that shape sitting on top of
an entry that is already there, and **33 are not places at all**: the nine
regions, twelve weather events and twelve spreads.

The nine regions are already an open schema question (F37: the plateau card
never fires, because a region got the `{lat, lon, radius_km}` a landmark gets
and 120 km around 33.0 N 88.0 E is a spot in the Changtang). What this adds is
the size of it. It is not one card filed oddly; it is a seventh of the atlas,
and the twelve weather events and twelve spreads are a second and third kind
of the same gap rather than more of the first.

### The rule against stacking forbids forty-five planned entries

The 45 on top of another entry are worse than unbuilt, because the schema
actively refuses them. `RULES.minTriggerSeparationKm` is 3 km — *two cards
closer than this would both fire and stack* — and the GDD's own trigger for a
food card is "overflying the city that owns it". Run rather than argued, with
a Chongqing city card and a Chongqing hotpot food card at the same
coordinates:

```
A food card authored at the city that owns it: rejected —
  "only 0.0 km from chongqing-hotpot; cards would stack".
```

That rule was written before there was a queue. There is one now: F37's
`CardQueue` holds cards in the order they were flown into and shows them one
at a time with a cooldown, precisely so that two catchments entered together
do not stack. The rule the queue replaced is still refusing content — 25 food
cards and 20 people cards, a fifth of the atlas — and the fix is a rule about
*what may share a place*, not about distance. That is a schema decision and
it is on the actions list.

### Two of the three authored cards were filed under a region that does not exist

`region` was a free string. The GDD's table names nine, with an en dash:
*Qinghai–Tibet Plateau*, *Yunnan–Guizhou*. Two of the three cards in the
repository wrote a hyphen. Nothing could see it, because nothing had ever
grouped by that field — and a journal that groups by it shows **eleven regions
for a nine-region game**, with `Qinghai-Tibet Plateau 1 of 1` sitting beside
an empty `Qinghai–Tibet Plateau 0 of 0`.

So the nine are a closed vocabulary now, keyed by ASCII kebab-case ids like
every other id here, with the display name in one place instead of in 228
files. What this cannot catch is a card filed under the *wrong* region, which
is a reading of the map rather than a spelling of it.

It leaves one gap standing: **the nine region names have no Chinese.** The GDD
shows place names in characters and English everywhere, and a region is a
place name. Nine strings, and they are a writer's.

### Nothing in the build can say which of the nine regions the aircraft is in

The journal needs that for three things the GDD asks for by name: the
per-region count on the page, *first discovery in each of the nine regions*
unlocking that region's music, and a soft hint that says "somewhere along the
Tian Shan" rather than "somewhere in Xinjiang". The only position → region map
in the repository is `standInRegionWeights`, the three-way blend that mixes
the air (D14's placeholder), and it cannot be borrowed:

- It knows **three** regions where the journal counts nine.
- Its middle region is called the Sichuan Basin and has **zero weight over
  every kilometre of Expedition 1**, including the 265 km from Chongqing to
  Chengdu, which is the Sichuan Basin. Its band is an east-coordinate window
  crossed with low ground, and the route is never inside both at once.
- Evaluated at low ground so only the band decides, that window sits over
  **Golmud, Dunhuang and Yumen** — the Hexi Corridor and the Qaidam, 800 to
  1,200 km northwest of Sichuan. Chengdu and Chongqing score 0.00.

None of that is a bug in what shipped: the file says *REPLACED BY THE REGION
RASTER (build plan D14)* and its stated job was to prove the plateau's air
reads clean and the basin's as milk, which F36 measured against the parameter
table rather than against the route. What it means is that **D14 is now on the
journal's path as well as the atmosphere's**, and that the basin parameter set
F36 costed has never actually been seen in flight.

Until there is a raster, the atlas groups by the region a card was *filed*
under — a fact about the card, not about the aircraft — and an entry with no
authored hint falls back to `somewhere in <region>`, which is the weakest
sentence that can be said and is a pin for nobody. All three authored cards
are on that fallback.

### The page G2 is scored on does not exist, and the slot for it validated green

G2's fourth pass criterion is *the full-screen comparison spread is read
rather than dismissed by a majority*. **Zero of twelve are authored.** That
alone is a content gap, and the report says so. What makes it a finding is the
slot that was waiting for them.

`comparison` was one of `CARD_TYPES`, so a spread could be written as a card —
and a spread written as a card **passes every check in the validator**:

- one `figure`, where the GDD asks for five numbers plus a dish and a sketch,
  **on each of two sides**;
- a `trigger` circle, which must be at one of its two subjects, so the page
  fires as a flyover fifteen kilometres from the Bund instead of at the end of
  the expedition;
- nowhere at all to name the other side.

Green CI over content that cannot be the thing it claims to be is the worst
shape this class of error takes. F28 and F29 each found a gate criterion that
could not be scored because the event could not occur; this is the third, and
it is the one where the repository was answering *yes* to the question.

So a spread is its own file type with two sides and the same measures on both
(D34), and the rule that makes it a comparison rather than two cards side by
side is enforced: a number on one side and not the other is a row the page
cannot draw, and CI says which.

### Of the five numbers a spread carries, exactly one is already here

The measures are elevation, January and July mean temperature, annual
rainfall and population density, plus a dish and a landscape sketch. Four of
the five numbers are a writer's, with sources, like every other claim in the
content. The first is not: the route sections committed beside each
expedition hold the ground at one-kilometre spacing along it (D21), signed by
the machine that cut them (D23). Where a spread pairs the ends of an
expedition — which is the case the GDD names, *Shanghai–Lhasa after Sea to
Sky* — the authored elevation can be checked against the ground the route was
actually flown over, in CI, with no world:

| place | route section | published |
| --- | ---: | ---: |
| Shanghai | 9.9 m at km 0 | 4 m |
| Lhasa | 3,651.8 m at km 2,931 | 3,650 m |

Within the Lhasa golden probe's own 30 m, which is the same number F26 checked
the section against. The tolerance is 25 m, because a city's published
elevation is a datum somebody chose and the section holds a kilometre of
ground averaged — so this catches a wrong place or a wrong unit, not a
disagreement about where the middle of a city is.

### Making the journal the record showed that two sets had drifted apart

The save layer wrote the profile's `seen` from the trigger field, which knows
which catchments have been *entered*. The atlas knows which entries have been
*collected*, and it is the superset, because a spread is an entry with no
catchment. Switching the writer made them disagree — and the reason was a
teleport seam, in the place D30 was written about:

- `discoveries.moveTo(...)` returns what the player landed inside, and **all
  three callers threw it away**. A jump onto Ayding Lake marked the catchment
  entered so it would never fire again, and told the player nothing.
- `__ns.goTo` and `__ns.goToAnchor` — the operator's drop-a-participant-here
  controls, which are where a teleport actually happens in a playtest —
  assigned the position straight onto the flight state and never used the
  teleport verb at all, so the *next frame's* `advance` swept the whole jump
  line. That is exactly the failure D30 exists to prevent: ten catchments of
  ten collected for a 2,900 km jump against none for a flight.

Both are one function now, and a jump fires what it landed on and nothing
else. Verified in the running game: `__ns.goTo` onto Wulingyuan shows the
card, moves the journal from 1 of 3 to 2 of 3, completes the second region,
and survives a reload.

### What is built

`engine/src/journal/atlas.ts` is counts over the two sets — per region,
including the empty ones, because hiding them hides the shape of the game —
plus the hint fallback and the seen set the profile writes.
`engine/src/journal/spread.ts` is the unlock, which has two arms of different
kinds: an arrival, which the runner already reports (F38), and a state
re-read whenever a card is found. One guard matters enough to be a method:
**a region with nothing in it is not complete**, because six of the nine hold
nothing today and the vacuous reading opens nine of the twelve spreads to a
player who has found nothing at all. A condition that passes because nothing
can fail it is the same defect as a check that silently skips (F24, F28).

The bundle carries the journal beside the routes (version 2), so the app is
running the real thing rather than a fixture, and `npm run content:atlas`
prints every number above. Thirty-five tests; 481 in all, 472 of them without
a built world.

What is not built is the reader: the page a player looks at, the comparison
spread rendered full-screen, and the map pins. A spread currently arrives
through the same placeholder the narration beats use. That is phase 2's UI
work, and it is the first thing in this repository that is waiting on content
rather than on engineering — the twelve pages and the ~225 unwritten entries.

## F41 — Expedition 1 leaves Shanghai after sunrise and lands at Lhasa before it, because thirty-seven minutes of clock crosses two hours of sun

The HUD row of workstream D asks for *altitude, ground elevation,
temperature, humidity, density bar, Beijing clock + local solar time in the
overlay*. Five of those six have been on screen since phase 0. The sixth had
nothing behind it: **there was no clock.**

That turned out to be why two authored fields had no reader.

### A month in two places, and a start hour in none

Every expedition authors `month` and `start_hour`, and the schema has
validated both since the day it was written. Neither reached the game. The
month was a constant in `app/src/main.ts` —

```ts
const MONTH = 11; // late autumn: thick Sichuan fog, clear plateau (GDD, Sea to Sky)
```

— with Expedition 1's own value copied into the comment beside it and nothing
keeping the two equal. The start hour had no reader anywhere in the
repository, because nothing measured time of day. Both are in the bundle now
(version 3), the temperature the HUD prints is computed for the expedition's
own month, and free flight has its own fallbacks rather than borrowing a
route's.

### China keeps one time zone across sixty-two degrees of longitude

That is the GDD's own fact — *Beijing time, which is the only time zone China
has* — and it is arithmetic, not astronomy. Beijing time is the meridian at
120 E, so every degree a place sits west of it puts the sun four minutes
later. In November, with the equation of time running fifteen minutes fast:

| place | longitude | offset from the clock | solar noon, Beijing time |
| --- | ---: | ---: | ---: |
| Fuyuan, Heilongjiang | 134.29 E | +57 min | 10:48 |
| Shanghai | 121.47 E | +6 min | 11:39 |
| Wuhan | 114.31 E | −23 min | 12:08 |
| Chongqing | 106.55 E | −54 min | 12:39 |
| Chengdu | 104.07 E | −64 min | 12:49 |
| Lhasa | 91.10 E | −116 min | 13:40 |
| Kashgar | 75.99 E | −176 min | 14:41 |

**3 hours 53 minutes from end to end, on one clock.** Expedition 1 crosses
**2 hours 2 minutes** of it, between Shanghai and Lhasa alone.

That number needs no decision about how fast the world's clock runs, because
it is not about time passing. It is about moving.

### So the aeroplane outruns the sunrise

Flown as authored — November, leaving at 07:00 — with the clock running at
the rate the player's own does:

| | clock | sundial | sun |
| --- | --- | --- | ---: |
| Shanghai, km 0 | 07:00 | 07:21 | **+6.8°** |
| Wuhan, km 679 | 07:08 | 07:01 | +3.2° |
| Chongqing, km 1,427 | 07:18 | 06:39 | −0.8° |
| Chengdu, km 1,692 | 07:21 | 06:33 | −2.5° |
| Lhasa, km 2,931 | 07:37 | 05:56 | **−9.8°** |

The aircraft takes off thirty-nine minutes after sunrise and lands
forty-seven minutes before one. Sunrise at Shanghai that morning is 06:26 on
the clock and sunrise at Lhasa is 08:24 — **one hour fifty-eight minutes
apart, on the same clock, on the same morning** — and the flight is faster
than the difference.

This is not a bug and it is not the compression being unfair. It is the
lesson, arriving through the one sense the game had not used: fly far enough
west and the sun goes *backwards*.

### The sentence in the file was never true, at any rate

Expedition 1's own comment says what the two fields are for:

> Beijing time, the only time zone China has. Leaving Shanghai just after
> sunrise puts Lhasa in the early afternoon by the clock and mid-morning by
> the sun, which is the lesson the HUD clock is there to teach.

Half of it is right: the clock reads later than the sun, and the author
understood why. The magnitudes are not. "Early afternoon by the clock,
mid-morning by the sun" asks for a gap of about three and a half hours. **The
gap at Lhasa in November is 1 hour 40 minutes** — 115.6 minutes of longitude
less 15.1 of equation of time — and it is fixed by geography. No start hour
and no clock rate moves it, so the sentence is false in every version of this
game. What is true is the direction, and a bigger number than the author
expected in the other direction: the clock barely moves while the sun moves
two hours.

### The clock rate is a real decision, and the candidates are 24× apart

Nothing in the repository had one, and the moment a clock exists it must run
at *some* rate.

**1×** — the world's clock is the player's. An expedition happens inside one
part of one day, `start_hour` names which, and every number the route gate
prints stays a number about a flight in daylight.

**Aircraft time** — the world's clock is the aeroplane's. Horizontal distance
is compressed by a large gain (THE ASYMMETRY, `scale.ts`), and the aircraft
really is flying at 38 to 52 m/s indicated. Integrating the flown track at
the true airspeed it actually has at each kilometre, Expedition 1 takes
**14.6 hours — 23.8× the session** — and the ratio is not constant, because
true airspeed rises as the air thins.

At that rate the arrival is 21:33 Beijing, with the sun 30° below the
horizon. So **both readings land this expedition in the dark**, for different
reasons, and the difference between them is whether time of day is a setting
an expedition is flown at or something it passes through.

Shipped at 1×, which is the choice that changes nothing else. The alternative
is a design decision about what an expedition *is*, and it belongs with
phase 3's seasons and time of day — which is also where D29 booked the
analytic sky, against a low sun. It is on the actions list.

### One number fixes the authored flight, and it is not the rate

At 1×, the earliest start hour that puts the sun above the horizon at **both**
ends of Expedition 1 is **08:00** — and only just, arriving at Lhasa with the
sun 2.6° up, about twelve minutes after it rises there.

| start | sun at Shanghai | arrive | sun at Lhasa |
| --- | ---: | --- | ---: |
| 06:00 | −5.0° | 06:37 | −22.4° |
| **07:00** *(authored)* | +6.8° | 07:37 | **−9.7°** |
| **08:00** | +17.8° | 08:37 | **+2.6°** |
| 09:00 | +27.5° | 09:37 | +14.2° |

Which of the start hour, the comment and the claim moves is a writing
decision, and it is on the actions list with the numbers beside it.

### What is on screen, and what is not

The HUD carries three things now — `07:00 Beijing · 07:21 by the sun · sun 7°`
— and reading them at the two ends of the route at the same instant is the
whole finding:

```
Shanghai   07:00 Beijing · 07:21 by the sun · sun 7°
Lhasa      07:00 Beijing · 05:20 by the sun · sun −17° below
```

What is **not** built is the consequence: the sky does not know. The
atmosphere blends a region tint and deepens with altitude (F36); it has no sun
direction and no night, so the HUD currently says it is dark over Lhasa while
the screen shows a blue morning. That is phase 3's work and the finding is
recorded here so it is not discovered again from the other end.

The astronomy is NOAA's solar position algorithm in real time and real
degrees — the world is compressed horizontally and the sun is not, so nothing
in `solar.ts` knows about the scale. It needed one thing the engine did not
have: `unprojectAlbers`, because the aircraft flies in projected metres and
solar time is a function of longitude. It round-trips against the forward
projection to under a nanometre across every point in the committed
projection table.

Twenty-two tests; 503 in all.

## F42 — The map is the surface D30's teleport verb was built for, nothing recorded where the aircraft had been, and the first version of the overlay cost a whole frame

The map overlay is phase 2's, and two decisions have been made in
anticipation of it without it existing. D30 split `advance` from `moveTo`
because *"free flight jumps to map pins, and a 2,900 km jump asked as a
flight collects every catchment near the line"* — a map jump, from a map
there was not. And the horizon field's own comment asks for it: *"having the
map and the horizon read the same array is the point: the wall you fly
towards and the wall drawn on the map cannot disagree."*

So most of what a map needs was already built and already in world metres.
One thing was not.

### Nothing knew where the aircraft had been

The runner knows how far along a route the aircraft is (F38), the profile
knows where it stopped (F39), the atlas knows what it found (F40). None of
them knows the path. In free flight — which is where most of the atlas is met
— there was no record of it at all.

The GDD asks for *a live elevation profile sampled from the resident tile
cache over the last 200 km*, and the cache can answer: the terrain makes a
**disc** of radius six tiles resident, 384 km, and re-makes it every frame, so
the last 200 km of ground is always in memory and is never the layer an
insert evicts. What is not in memory is *which* 200 km. Sample the cache along
a straight line back from the aircraft and the first turn makes it fiction.

So the path is recorded as it is flown, at **one sample a kilometre** —
the resolution the ground itself has (D21), against 5,500 points for the same
200 km if it were recorded per frame at cruise.

### A teleport lifts the pen, for the third time

The same seam as the route (D32) and the card catchments (D30, F40), now on
the one surface whose entire job is to say where the player has been: a track
that joined the two ends of a jump would draw a line across China that nobody
flew.

Writing that produced a second bug immediately, and the profile said so out
loud. The first version recorded a point *at* the teleport, and the profile
read `ground 0–0 m` in the middle of the Hengduan — because the tile under a
jump is not resident on the frame the jump happens, so the ground reads null
and a coerced zero is sea level. `moveTo` records nothing now; it lifts the
pen and moves the distance reference, and the next `advance` writes the first
point of the new leg with ground the terrain has actually loaded. A sample
whose ground is still unknown is skipped rather than invented, which also
covers the edge of the built corridor.

### 200 km is between forty-six seconds and nine minutes of flying

| mode | ground per minute | 200 km is |
| --- | ---: | ---: |
| `boost` | 260.0 km | 0.77 min |
| `cruise` | 130.0 km | 1.54 min |
| `low` | 43.3 km | 4.62 min |
| `approach` | 21.7 km | 9.23 min |

Twelve times, across one window. F39 reached the opposite conclusion about a
save — *an autosave is a clock, not a distance* — and the two are consistent
rather than in tension: **a save is about what the player did, so it is
measured in their time; a profile is about what the ground did, so it is
measured in ground.** Two hundred kilometres of the Hengduan is the same
amount of terrain whether it took ninety seconds or nine minutes.

### The ground inside that window varies seventy-eight-fold

Measured over Expedition 1, the relief inside the trailing 200 km:

| | relief | where |
| --- | ---: | --- |
| flattest | **57 m** | km 900, the eastern plain |
| roughest | **4,464 m** | km 1,867, the Hengduan |

An axis fitted to the window would draw the plain's 57 m of noise at the full
height of the widget and make farmland look like the Hengduan. That is F14's
mistake with a different instrument — a drama setting tuned on a stand-in
world 15× smoother than China. So the profile is drawn at a **fixed 6,000 m**
and the renderer is handed the band rather than an autoscale (D36).

### The horizon field is the map's picture and not its profile

The base layer needed nothing new: the 8 km country reduction the impostor
reads is 841 × 553 samples, 908 kB, already loaded at boot. But it cannot
supply the elevation profile, and the reason is the thing that makes it good
at its own job. `SILHOUETTE_BIAS` is 0.6 — biased toward the cell maximum, so
a distant range keeps its crests instead of arriving as a low hump.

Against the 1 km ground actually under Expedition 1, it reads **high at 92 %
of kilometres, by 229 m on average and 1,826 m at worst**. Right for the wall
ahead; wrong for the ground just flown over, where it would tell a player they
cleared a ridge by nearly two kilometres more than they did. The map's picture
and the map's profile want different arrays, and saying so is the whole of it.

What the base cannot do yet is be a country. The corridor fills **11.6 %** of
the country grid, so most of the map is empty until phase 2 builds the rest —
a data gap, not a drawing one.

### The first version of the overlay cost 36.7 ms

One `fillRect` per 8 km cell, every frame: **89,088 cells, 36.7 ms** — more
than the whole 33.3 ms frame budget, for a picture that does not change.

The field is rasterised once at its own resolution, one pixel per cell —
336 × 264 for the corridor window — into an offscreen canvas, and the frame
blits it with a single scaled `drawImage`. Rebuilt only when the widget or the
bounds change, which is on open and on resize.

**36.7 ms → 0.20 ms.** A hundred and eighty times, from a frame budget to
0.6 % of one, and it looks better: the blit is smoothed where 89,088 rectangles
were not. Closed, the overlay costs nothing at all, because it is not drawn.

`__ns.mapMs()` reports it, in the same spirit as `fieldMs`.

### What is on it

Route from the plan's projected waypoints — the ones the content gate flew.
Pins for **found** entries only, because a pin for a card nobody has met is
the exact pin the GDD refuses to give (F40). The track, pen up across
teleports. The Heihe–Tengchong line, drawn from the same two endpoints the
pipeline's equal-area probe measures the 57/43 land split against, with a test
that reads them out of `probes.py` so the two cannot drift. A scale bar from
the view's own metres per pixel. And `M` opens it, which is the key the GDD's
first five minutes ends by showing the player.

One rule in the transform: **it never stretches.** The projection is
equal-area by D1 — *"honest scale" is an equal-area claim; Xinjiang has to be
bigger* — and a map that fitted the widget by scaling each axis on its own
would throw that away on the one surface where two provinces are visible at
once. It letterboxes.

Twenty-one tests; 524 in all.

## F43 — Six primitives, four behaviours, and an aeroplane that cannot turn inside a gorge

The build plan's challenges row is one sentence: *"six objective primitives
(land-in-radius, gate sequence, reach-before-time, hold-altitude,
stay-on-instruments, follow-line) cover all twelve. Instant retry, timer off
by default."* The GDD names four of the twelve and nothing else about them:
*land at a 4,411 m airport, thread a gorge at low speed, cross a dust storm on
instruments, race the sunset along the Great Wall.*

Every one of those four was measured before a line of the schema was written,
because "cover all twelve" is a claim about twelve things of which four exist
as sentences and zero as files. **One of the four can be authored today. One
needs a decision. One needs the 90 m hero grid. One needs weather.** And the
sixth primitive is not a primitive.

### The six are four, and the sixth is a modifier

*Reach-before-time* is *land-in-radius* with the landing conditions off and a
deadline above it — and the deadline cannot belong to the objective, because
the GDD says in the same breath that *"the timer is off by default with a
toggle for players who want it"* and that one of the twelve is a race against
the sunset. A timer that can be switched off cannot be that race's deadline.

So there are two clocks and they are different things:

| | what it is | shown |
| --- | --- | --- |
| **deadline** | part of the challenge, authored, ends the attempt | always, where there is one |
| **stopwatch** | how long this attempt has taken, scored against nothing | off by default |

With them apart, the fifth and sixth collapse too. *Stay-on-instruments* is
*hold-altitude* with a heading beside it: the obscuring half is weather the
aeroplane flies through, not anything an objective can test, and what is
actually scored either way is a band held for a duration. **Six names an
author needs; four behaviours an engine has.** The schema keeps all six
because they are six different things to write down, and `ObjectivePlan` has
four members, which is where the finding lives in the type system.

### There is no landing, and this is the second time

`flight.ts` bounces the aeroplane off terrain at **ground + 25 m** rather than
crashing it, which is the GDD's own rule — *no stalls, no crashes; flying into
terrain bounces you up with a soft camera shake.* The consequence for a
*land-in-radius* objective is exact: 25 m above the ground is not a difficult
altitude, it is the only altitude below which nothing exists. An objective
authored under it can never be met; one authored at it is met by flying at the
hill.

This is F22's wall reached from the other side. There is no `landing` kind in
the expedition schema because the altitude floor keeps its terrain margin to
the threshold and the lowest legal trajectory over flat ground still arrives
300 m up. Different arithmetic, different system, same conclusion: **this
game's aircraft does not land.** The schema refuses `max_agl_m ≤ 25` by name
and the challenge that ships is a low pass.

### The four the GDD names, priced

**Land at a 4,411 m airport — authorable, and the number survives.** Daocheng
Yading, 29.32 N 100.05 E, the highest civil airfield in the world, and it is
inside the built corridor:

| | published | our 1 km grid | gap |
| --- | ---: | ---: | ---: |
| Daocheng Yading | 4,411 m | **4,387.7 m** | −23.3 m |
| Lhasa Gonggar | 3,570 m | 3,581.2 m | +11.2 m |

The aeroplane can get there: the ceiling is **6,197 m** at 0.5 m/s of residual
climb, and at 4,411 m it still has **2.20 m/s** against 7.11 at the sea. What
makes it a challenge is what is left over — the highest ground within a
hundred kilometres of the field is **5,667 m**, so the margin under the
ceiling is **530 m**, and every control lag is 1.6× longer up here. The field
itself sits in a shallow bowl whose rim ten to twenty kilometres out stands at
4,450–4,800 m, so the descent onto it is two hundred metres and nothing. The
bite is the air, not the geometry, which is the game's own thesis.

**Thread a gorge at low speed — no, and not for a reason more terrain data
fixes.** Two separate problems, and the second is the one that does not go
away.

The grid has filled the gorge in. Tiger Leaping Gorge, nine cross-sections
along its own axis, on the 1 km grid:

| along | floor | rim | depth | channel within 400 m of the floor |
| ---: | ---: | ---: | ---: | ---: |
| 0 % | 1,927 m | 3,488 m | 1,561 m | 4.8 km |
| 25 % | 2,145 m | 4,799 m | 2,654 m | 8.0 km |
| 50 % | 2,165 m | 4,842 m | 2,677 m | 1.8 km |
| 75 % | 2,150 m | 4,439 m | 2,289 m | 1.5 km |
| 88 % | 2,028 m | 4,190 m | 2,162 m | **1.3 km** |

The published river runs at about 1,800 m and the walls stand at 5,396 and
5,596 m; ours reads 2,448 m at the river and 4,508 / 5,192 m at the walls. So
the grid has raised the floor by six hundred metres and lowered the walls by
four hundred to nine hundred — F12's finding about Everest, in a landform
where it costs the whole feature. That half the hero grid fixes.

The half it does not: **the aeroplane's turn is wider than the gorge.** At the
airspeed it holds, a full-bank turn at `low` is about 200 m across — and the
aeroplane does not move at its airspeed. Horizontal motion carries the mode's
ground gain, 19× at `low` and 42× at cruise, so the turn the terrain sees is
the ground-speed one. Measured through the flight model at gorge altitude:

| at 2,500 m | settled at the mode | arriving from cruise |
| --- | ---: | ---: |
| `approach` | 2.5 km | 3.1 km |
| `low` | 5.1 km | 6.1 km |

Against a channel that is **1.3 to 8.0 km wide and 1.8 km at its middle**. At
the speed the GDD names, one reversal is two to four times the width of the
gorge. Nothing can be threaded; it can only be flown straight through. The
only mode that would fit is `approach`, which is not in `SPEED_MODES` and
cannot be selected by a player — D26 keeps it that way on purpose, because it
is a local change of scale rather than a change of speed.

> **Corrected, 21 September 2026.** The left-hand side of that comparison
> stands — the reversal widths are the flight model's own and have had a test
> since F38. The right-hand side does not. The cross-section table above was
> taken along an axis through 26.87 N, 100.75 E, which F49 then measured as
> **71 km from Tiger Leaping Gorge**, and on the 1 km grid, which F50 and F52
> then showed fills a gorge in. The script that produced it is not in this
> repository and cannot be re-run, which is the third thing wrong with it.
>
> Measured where the gorge is, on the 90 m grid, by a tool that is committed:
> the aeroplane has **0.36 km** of room to turn a hundred metres over the
> water and 1.15 km at four hundred, against the 1.3 to 8.0 km here. The
> conclusion survives and gets worse — `approach` does not fit inside this
> gorge either, and the ordering of the two candidate gorges reverses. See
> F55.
>
> **And again, 22 September 2026.** *"It can only be flown straight
> through"* is wrong too, in the other direction: both gorges can be flown
> through, and not straight — the aeroplane follows their bends at `low`,
> under their walls, in flights found by a search over the stick through
> `step` itself. What this section shows cannot be done is turning round. See
> F57.

F38 had already written the general form of this down — *a corridor narrower
than the aeroplane's own turn is not a corridor* — and a gorge is exactly
that. Which of the flight model, the speed modes and the challenge moves is a
design decision.

**Cross a dust storm on instruments — the objective is built; the storm is
three orders of magnitude away.** The holding half runs today: a band, a
heading, a duration, tested. The obscuring half needs a visibility the
atmosphere cannot produce. At the shipped `DEFAULT_HAZE_DENSITY_PER_M` of
2.75 × 10⁻⁶, the air is **95 % obscured at 1,184 km** at 500 m altitude. A
dust storm is a kilometre of visibility, and because visibility goes as 1/ρ
the factor is exactly the ratio of those two distances: **1,184× the shipped
haze**, and local rather than global, where the haze is one uniform for the
whole world. That is phase 3's weather, and it is worth knowing it is a factor
of a thousand rather than a tuning pass.

**Race the sunset along the Great Wall — a race at exactly one clock rate, and
the rate is undecided.** Shanhaiguan to Jiayuguan is **1,802 km**. Because
China keeps one clock across all of it, the sun sets later in the west by four
minutes a degree, and the head start is almost the same all year — it is
longitude, not season:

| month | sunset, east end | sunset, west end | head start |
| ---: | ---: | ---: | ---: |
| March | 18:07 | 19:33 | 86.0 min |
| June | 19:31 | 20:56 | 85.4 min |
| September | 18:11 | 19:37 | 85.7 min |
| December | 16:37 | 18:03 | 86.4 min |

Against 86 clock minutes of head start, the flight costs 41.6 minutes at
`low`, 13.9 at cruise and 6.9 at boost. At the shipped **1× clock the player
wins by 72 minutes** at cruise and arrives in broad daylight; at **aircraft
time (23.8×) they lose by four hours** at every mode. It is a contest only
where those cross:

| mode | dead heat at |
| --- | ---: |
| `low` | ×2.06 |
| cruise | ×6.18 |
| boost | ×12.36 |

So the GDD's one explicitly timed challenge is scored on a number nobody has
chosen — *how fast does the world's clock run* is still open from F41 — and
the answer changes it from trivial to impossible with nothing in between. The
Great Wall is also outside the built corridor, so it cannot be authored until
phase 2 in any case.

### The aeroplane's turn, and F38's table explained

`reversalWidthM` is in `flight.ts` now rather than in somebody's scratch
file. It flies the model — full stick, level, until the heading has come
through 180° — because the roll-in lag is a third of the answer and no closed
form has it.

It reproduces F38's six published figures **to the decimal**, and finding out
why took a second parameter. F38 measured the reversal of an aeroplane that
had *just changed speed mode*; indicated airspeed decays over `TAU_SPEED_S`
and the turn happens during the decay:

| | settled at the mode | from cruise (F38's table) |
| --- | ---: | ---: |
| `low`, 1,200 m | 4.4 km | **5.3 km** |
| `low`, 4,500 m | 6.3 km | **7.8 km** |
| cruise, 1,200 m | 16.2 km | **16.2 km** |
| cruise, 4,500 m | 23.3 km | **23.3 km** |
| boost, 1,200 m | 42.2 km | **36.0 km** |
| boost, 4,500 m | 28.8 km | **23.3 km** |

Cruise matches both ways because it *is* cruise. Both numbers are real: the
settled one is the narrowest the aircraft can ever manage, the transient one
is what a player gets, and the authoring check uses the wider.

### A disc can be tested at a point; a gate cannot

At 30 fps the aircraft moves **12 m per frame at `approach`, 24 at `low`, 72
at cruise and 144 at boost**. A disc wider than about 150 m therefore always
contains a sample and its conditions can be read there. A gate has no width at
all in the direction of flight, so it is never sampled and only a crossing
test finds it — which makes this the first place in the build where a point
test is wrong at *every* frame rate rather than only at the fast ones. D30 was
about a poll rate; this is about geometry.

So discs are tested by containment and gates by crossing, and both take the
two verbs everything else that watches the aircraft takes. A `ReachDisc` that
sees a segment cross its circle with no sample inside it counts that
separately — `clippedWithoutSample` — because that is the instrument failing
rather than the player passing or failing.

**A teleport credits nothing.** The fourth instance of D30's seam, and the
first where it is about credit rather than about narration: `__ns.goTo`
exists, the map has pins, and an operator drops a playtester at km 900 (F28).
A challenge is something the player is *credited with*, so `jump` re-seats the
position, clears anything mid-hold, and scores nothing at all.

### A challenge is not data until something has completed it

D17's rule, one level down. *Below 200 m over a 4,411 m airfield* is an
approach or an impossibility depending on the descent rate, the density lag
and the rim of the bowl — none of which are in the file, and none of which a
parser can reach. So `flyChallenge` flies an autopilot along the course and
scores the objectives exactly as the game does.

It earned its place on the first run. The authored gate started at 4,900–5,800
m over a rim twenty kilometres from the field, and **the challenge could not
be completed**: crossing the rim at 5,350 m leaves 862 m to lose in the 27
seconds those twenty kilometres last, against a descent that asymptotes at
18 m/s. The gate band came down to 4,800–5,000 and it flies. Nobody would have
found that by reading the file.

Flown in the browser by hand afterwards, the same challenge completes in
**70.7 s against the probe's 69** — which is the cross-check that matters,
because it says the offline gate and the game are the same experiment.

### What the check measures

`npm run content:challenges`, and `make challenges`. Per challenge: the ground
the world puts under every place it names, every authored width against a
full-bank reversal at its own speed and altitude, the flown result with the
lowest height above ground it reached, and — for a sunset — the deadline
computed where the challenge ends and priced at every clock rate.

It is a gate rather than a report, unlike `teaches` and `atlas`: a challenge
whose objectives cannot be met is broken rather than unwritten. It is **not**
in CI, and the reason is a gap: a challenge is a set of points rather than a
route, so there is no committed section under it the way D21 gives every
expedition. The structural half — the bounce floor, the gate bands, the
deadline — runs everywhere with the rest of content validation.

### What the save keeps

`SAVE_VERSION` 1 → 2, one field: the ids of challenges finished. The GDD is
explicit that there is nothing else to keep — *"each is done or not done; no
medals or leaderboards"* — so a best time is deliberately not stored, because
a stored best time is the first half of a leaderboard. The stopwatch is scored
against nothing and the profile does not know it exists.

**Built.** `engine/src/challenge/` — `objectives.ts` (the four behaviours),
`challenge.ts` (the run, the two clocks, the retry), `plan.ts` (the bundle
form), `fly.ts` (the probe); `reversalWidthM` in `flight.ts`; the challenge
schema and its refusals in `content/schema.ts`; `tools/challenge.ts` and
`tools/challengeCheck.ts` with `tools/challenges.ts` as the report; one
authored challenge; `G`, `T` and `Y` in the binding table; `__ns.startChallenge`,
`getChallenge` and `retryChallenge`. Bundle version 3 → 4. **576 tests, up
from 524.**

**Action.** Three of the GDD's four named challenges are blocked and the
blocks are different in kind — the gorge is a design decision, the dust storm
is phase 3's weather, the sunset is the clock-rate decision plus the
full-country build. The eleven unwritten challenges are a writer's. And the
flown gate wants a way to run in CI, which means the challenge equivalent of a
route section: the ground under a challenge's own places, committed beside it.

---

## F44 — The ground under a challenge, and the hole that reported a safer flight

**Question.** F43 left the flown challenge gate outside CI, and the reason
looked structural: a challenge is a set of points rather than a route, so there
is nothing to commit beside it the way D21 commits a profile beside every
expedition. Is that true, and if it is not, what is the artefact?

### A route asks the world a one-dimensional question; a challenge does not

D21 works because `profileAlong` has already reduced the corridor to 2,932
numbers before the first flight starts. The check never asks the world anything
with two dimensions in it — it asks for the ground at a distance along a line,
and those answers *are* the section.

A challenge has no line. The path between its points is discovered by flying,
so there is no distance to index by. What there is, is a lattice: the world is
Int16 samples one kilometre apart in the Albers grid and `groundAt` is bilinear
between four of them. So the two-dimensional question has a finite answer too —
**the cells a flight can reach** — and the artefact is a swath of the world's
own lattice, one row of spans per kilometre of northing, following the course
the probe is steered along.

The flown gate now runs everywhere. `high-airfield` is **12.2 kB** of committed
JSON, 1,726 cells in 23 rows, against the corridor's 9.76 MB and 4.88 M lattice
samples — **0.035 % of the ground it was cut from**.

### The patch is a subset of the world, not a resampling of it, and that buys exactness

This is the difference from a section, and it is the whole reason the artefact
is shaped this way. A section stores *answers*: elevations interpolated at
stations along a line that crosses the lattice diagonally, at points no raster
cell is centred on. It therefore has a rounding to choose, and F24 measured
what the choice costs — whole metres move Expedition 1's lowest arrival by
3.2 m, decimetres by 14 mm.

A patch stores the numbers the pipeline wrote. There is no rounding to choose,
and so none to defend:

| | route section | ground patch |
| --- | --- | --- |
| what is stored | interpolated elevations along a line | the lattice samples themselves |
| precision | decimetres, measured (F24) | whole metres, exact |
| agreement with the world | 0.05 m tolerance | **0 m, at all 4,740 ground reads a flight makes** |
| the flight it produces | the same to a tolerance | `done in 68.9333 s`, `45.4635 m`, both ways |

Zero is not a tolerance that happened to hold. Bilinear interpolation over the
patch and over the corridor are the same arithmetic over the same integers, so
`PATCH_DRIFT_TOLERANCE_M` is `0` and any disagreement at all is a rebuilt world
that never reached the artefact.

### The shape is the swath and not the box

A bounding box would have been three lines shorter. The one authored challenge
does not care — its swath is 83 % of its box. The next challenge the GDD names
does:

| course | margin | swath | bounding box | swath as % of box |
| --- | ---: | ---: | ---: | ---: |
| high airfield, 69 km | 9 km | 1,726 | 2,070 | 83 % |
| Shanhaiguan → Jiayuguan, 1,801 km | 9 km | 36,535 | 216,818 | **17 %** |
| the same, allowed to follow the Wall | 10 km | 38,853 | 680,400 | **6 %** |

So the box is wrong by six to seventeen times for the Great Wall sunset race,
and the row-span form costs nothing on the compact case.

### How wide: the aeroplane's own turn, measured against what it needs

The margin is the full-bank reversal from cruise at the challenge's own speed
and starting height — the same number F43 measures a gate against, used for a
second purpose. It is the widest a probe steering towards a course point can be
displaced by a turn it is able to make, and it is derived from the challenge
alone, so a reader with no world recomputes it and a changed speed invalidates
the patch by itself.

What the flight actually needs is much less. `high-airfield` strays **200 m**
from its course and flies identically on **half a kilometre** either side:

| margin | rows | cells | the flight |
| ---: | ---: | ---: | --- |
| 0.25 km | 5 | 154 | never completes — 32,708 frames with no ground |
| **0.5 km** | 7 | 224 | `done` in 68.93 s, lowest 45.5 m — identical |
| 3 km | 11 | 614 | identical |
| **9 km** (committed) | 23 | 1,726 | identical |

Eighteen times what it needs, for 10 kB. The case for that is the next section:
the failure it buys off is invisible.

### The hole that reported a safer flight

Cutting the ground found a hole in the gate that cut it. Delete **one row** from
the committed patch — one kilometre of northing, 90 cells, **5 % of the file**,
which is what a rebuilt window or a badly resolved merge leaves behind:

| patch | state | seconds | lowest above ground | objectives | frames with no ground |
| --- | --- | ---: | ---: | --- | ---: |
| whole | done | 68.93 | **45.5 m** | both met | 0 |
| without row 1314 | done | 68.93 | **169.8 m** | both met | 1,290 |
| without row 1315 | done | 100.60 | 173.4 m | both met | 1,357 |
| every row trimmed to 10 cells | *flying* | 1,200 | — | — | 35,710 |

The last row is the reassuring one: a patch that is obviously broken starves
the aeroplane at once and the flight times out. **The dangerous cut is the
small one.** With one row missing the challenge finishes in the same 68.93
seconds with both objectives met, and the number an author would actually read
is not merely wrong but wrong in the reassuring direction — the low pass looks
like it cleared by 170 m when the real flight clears by 45, because *the frames
where the aeroplane was lowest are the frames it had no ground for*.

Every part of that behaviour is individually correct. `groundM` is `null` and
not `0` where nothing is built (F42). `conditionsHold` refuses to credit an
objective whose height it cannot measure. `minAglM` only records frames it has
ground for. Correct at every reading, and the composition is a silent pass —
which is exactly what `firstUncoveredKm` refuses one level up, and exactly what
`pickWorld` refuses one level out. `ChallengeFlight` simply had no field for
ground it could not read; it has one now, and any frames at all fail the gate,
fail the cutter, and are refused before a patch is written.

### The cutter flies what it cut

A section is complete by construction: it is one-dimensional and every number
in it is read. A patch is two-dimensional, only a few hundred of its cells are
ever read, and which ones is decided by a flight nobody has run yet — so the
guarantee cannot come from the geometry. `npm run content:patches` therefore
does in advance exactly what CI will do: flies the challenge over the world,
flies it again over the patch it just cut, and refuses to write anything if the
two disagree on state, seconds, lowest pass, bounces, or ground it could not
read.

**Built.** `tools/patch.ts` (the artefact, cut, verify, render, and the patch as
a `GroundField`), `tools/cutChallenges.ts` (`npm run content:patches`, and `make
patches`, now a stage of `make world`), `sampleAtKm` and `GroundField` split out
of `Corridor`, `framesWithoutGround` on `ChallengeFlight`, the two-source ground
resolution in `checkChallenge`, `npm run content:challenges` in CI and in `npm
run check`, and `content/patches/high-airfield.json`. **603 tests, up from 577 —
and 586 of them run without a world, up from 564, because the check that a
challenge can be completed at all is no longer gated on 13.9 GB.**

**Action.** None outstanding for engineering. The eleven unwritten challenges
get their ground for free the moment they are authored over built terrain; the
three that F43 blocked are blocked on the same things as before. What this does
retire is the gap F43 recorded, and what it adds is a smaller one: a challenge
authored outside the corridor still cannot be cut, which is the same
full-country build that D14's region raster and the Great Wall are waiting on.

## F45 — The comfort row asked whether a colour-blind reader can use the map, and the first honest answer was that nobody had ever measured the map at all

**Question.** The comfort and accessibility row of workstream D is half built
(D28): the camera settings are there and the measurement that removed camera
smoothing is written down. The other half is *text scaling, colour-blind-safe
map, no strobing, metric default with imperial toggle*, and the critical path
says do it before the cohort rather than after. What does it cost, and what
does asking the question find?

### The instrument existed and the question had never been asked

`perceptual.ts` has been in the engine since F36, and its own docstring says
what it is for: *"does the sky change enough for a player to notice they have
climbed, **are two elevation steps distinguishable to a colour-blind
reader**"*. The second half had no way to be asked, because `deltaE` compares
two colours as a trichromat sees them.

So `gfx/cvd.ts` is the missing half — Viénot, Brettel and Mollon's projection
onto the plane a missing cone leaves behind, in linear light, which is the
space `deltaE` and a `three` Color already work in. It is checked before it is
believed, the way F30's GPU timer was, because a simulation that returned its
input would pass every palette test ever written:

| property | asserted | measured |
| --- | --- | --- |
| a grey is unchanged | < 0.01 dE | 0.003 |
| the projection is idempotent | < 0.01 dE | 0.007 |
| red against green, normal vision | > 100 dE | 116.8 |
| the same pair, deuteranopia | < 15 dE | 12.6 |
| blue against yellow, either deficiency | > 140 dE | 152.9 / 158.3 |
| protanopia darkens red | nothing asked for it | L\* 46.5 → 36.2 |

The last row is the one that makes it an instrument rather than a filter.
Protanopic luminous efficiency really is reduced at long wavelengths, and these
matrices were not fitted to that — a deuteranope's red comes back within 6 L\*
of where it started, a protanope's does not.

It models **dichromacy**, which is the severe end: perhaps 8 % of men and 0.5 %
of women have some red-green deficiency but most of it is anomalous
trichromacy. Designing against the severe end is the only version of this test
worth writing. A ten-person cohort contains at least one person with some
red-green deficiency about a third of the time, which is a protocol question
rather than an engineering one and is recorded as one.

### G1's own cue is safe, and by luck rather than by design

The gate's first pass criterion is that six of ten remark on the climb, the
thin air or the plane going heavy without being prompted, and the cue that
carries it is the sky: F36 measured dE 32.1 across a climb to 4,500 m.

| seen by | sky, sea level → 4,500 m | ground colour, same climb |
| --- | --- | --- |
| trichromat | 32.1 | 32.7 |
| protanopia | 31.5 | 25.5 |
| deuteranopia | **34.9** | 24.3 |
| tritanopia | 51.3 | 63.2 |

The sky's cue survives intact, and a deuteranope sees slightly *more* of it,
because a deep blue against a pale haze is a blue-yellow difference and
blue-yellow is the axis a red-green dichromat keeps. Nothing was designed that
way; it is worth recording precisely because the opposite would have been a
gate scored on a cue a twelfth of the cohort could not see.

The ground is a different story, and it is a local one. How much climb it takes
before the ground under you is a different colour:

| from | trichromat | protanopia | deuteranopia |
| --- | --- | --- | --- |
| 200 m | 70 m | **354 m** | 162 m |
| 500 m | 68 m | **455 m** | 145 m |
| 1,000 m | 161 m | 164 m | 154 m |
| 2,000 m | 435 m | 469 m | 436 m |
| 3,000 m | 448 m | 475 m | 443 m |

Between 200 m and 800 m the ramp turns green to tan, which is a move along the
axis protanopia loses, and that band is the eastern plain — **58 % of
Expedition 1's flying time** (F29). Above a thousand metres the ramp is a
lightness ramp and all three readers get the same answer to within a tenth.

The ramp survives as a whole: its worst pair of stops anywhere is farmland
against loess at **4.1 dE** for a protanope, which is above the threshold at
which a difference exists and below the one at which it is noticed at a glance
— and 20.3 for everyone else. The palette is low-saturation earth tones, which
is what saves it. **It loses little to dichromacy because it was never carrying
much colour to begin with.**

### The map had two faults and neither of them was a colour-blindness fault

This is the finding. Checking the map for colour-vision safety was the first
time anything had computed its contrast at all, and what the threshold caught
was broken for every reader.

**The route fades out as the ground rises.** It was pale ink at 30 % alpha, and
the base got paler with elevation:

| ground under it | route against it, dE |
| --- | --- |
| sea | 28.7 |
| 1,000 m | 17.7 |
| 2,000 m | 14.5 |
| **3,650 m — Lhasa, where Expedition 1 ends** | **9.8** |
| 6,000 m | 3.9 |

Within 0.3 dE for every vision type: not a colour-vision failure, a structural
one. Any translucent mark over a base whose lightness changes has a contrast
that changes with it. So the route is a cased line now — a dark stroke wide
enough to show at the edges and a near-opaque core on top — and it measures
**43.4 to 76.2 dE against every ground**, with 72 to 80 between its own two
strokes. Pins and the aircraft needed the same treatment for the same reason: a
pale pin on snow is **2.7 dE**, which is no difference at all.

**The map painted three different things as the sea.** It tested `m <= 0`, and
zero is what the DEM writes for the ocean, for a cell no source raster was ever
fetched for, and for everything outside the built window.

| in the frame the map draws | cells | share |
| --- | --- | --- |
| land | 54,150 | 60.8 % |
| zero, east of Shanghai — plausibly sea | 5,882 | 6.6 % |
| zero, inside the window but west of it | 13,888 | 15.6 % |
| zero, outside the window entirely | 15,168 | 17.0 % |

**Five of every six blue cells were not water.** Nothing published separates
them — GLO-30 writes the ocean as zero and absent data as zero, and the
corridor manifest records how many of its tiles have land but not which — so
the map now says the only thing it knows: no elevation here. The coastline
still reads, because it is the edge of the land. A real coastline needs a water
mask, which is phase 2's rivers and lakes.

Below sea level is land again, too. `m <= 0` drew **Ayding Lake at −154 m**,
China's lowest exposed land, as ocean — a place with a written card and a
golden probe in the pipeline aimed at it.

### The shader had the same bug from the other end, and nothing could have caught it

Moving the map onto the shared elevation ramp meant reading the ramp, and the
ramp could only be executed by a GPU. `palette.ts` states one rule — the ramp
is never duplicated, because a second copy is a second set of stops waiting to
drift — and that was the one rule it could not enforce. The map had gone and
written a second ramp (F42).

The stops are data now and the GLSL is generated from them. The first thing a
test found once it could read the ramp was in the sub-sea-level branch:

```glsl
if (m < 0.0) return mix(saltPan, plain, clamp(m / -160.0, 0.0, 1.0));
```

The two ends are the wrong way round. The floor of a depression comes out plain
green and its shoreline comes out salt pan, with a **40.6 dE step** across the
shore between the shoreline and the sea-level cell beside it.

It has been on screen the whole time, and the reason nobody saw it is
arithmetic: the corridor holds **25 samples below sea level out of 4,879,875**
— one at −4 m, five at −2 m, nineteen at −1 m, all of them on the coastal
plain. One cell in 195,000, each painted salt-pan pale against green farmland.
The place where it would be a landscape rather than a speck is Ayding Lake's
basin, which the renderer has never drawn and which the same bug drew as ocean
on the map.

### The HUD's contrast had been measured against a background it never has

The first pass of this check measured every HUD ink against the page's
background colour and found 72 to 89 dE, which is a comfortable pass and the
wrong question. `#0d1117` is visible for one frame at boot. What the HUD is
drawn over is the sky.

| ink | sky at sea level | sky at 5 km |
| --- | --- | --- |
| the HUD's cream, `#f2ede4` | **6.1–7.1** | 41.7 |
| the density bar's track, white at 18 % | **1.3–1.6** | 7.9 |
| the density bar's thin-air blue | 31.6 | **5.2** |

Three failures, and each one is worst exactly where it matters. The ink is
unreadable at low altitude, which is where G1's twelve minutes are spent. The
bar's track is invisible against a pale sky, so the bar is a stripe with no
frame. And the bar turns blue to say the air is thin at an altitude where the
sky is the same blue — **the cue is camouflaged by the other cue for the same
fact.**

All three are the route's fault in different clothes: something drawn over a
background that changes, with no casing. The text is haloed (87 dE from ink to
halo, 66 to 86 from halo to sky, at every altitude over every region) and the
bar is given a dark ground (47 to 60 dE against every sky, with both fills 48
or better against it).

### And the panel that was never hidden

Making the map's panel opaque — it had been 88 % over the sky, which is dark
enough to read as part of the picture — showed something that had been true
since F42. `[hidden]`'s `display: none` comes from the user agent, and `.map`
sets `display: flex`, which beats it. **The map panel has been on screen the
whole time: 780 × 656 of it, over the middle of the view.** Pressing `M`
toggled only whether `drawMap` ran. One line of stylesheet.

### No strobing, measured rather than promised

Two ways a screen flashes. The first is an input repeating, and the build was
already safe: both sources edge-detect, so a key held through a hundred
auto-repeats fires one action and a pad button held for sixty frames fires one.

The second is a state derived by comparing a continuous quantity against a
threshold, and that one was not safe. The density bar changes colour at
σ = 0.70, which is 3,564 m; an aeroplane holding altitude there — which is what
a player testing boost does — pins the value to the line.

| flown against the threshold | colour changes | worst one second |
| --- | --- | --- |
| as built | 508 in 120 s | 16 changes = **8 full flashes** |
| through `SteadyFlag` | 193 | 2 changes = 1 flash |

WCAG 2.3.1's limit is three flashes in any one second, and the average was
never the number to look at: the limit cycle is uneven, so the mean is two a
second and its worst second is eight. **The aeroplane moves seven centimetres
while it happens.**

The fix is not hysteresis on the threshold — boost's lockout is meant to come
out of the density formula rather than out of a pair of altitudes — but a rate
limit on the *showing* of it. A change commits immediately if the flag has been
still and otherwise waits its turn, so a real transition is never delayed and
chatter cannot flash. It also makes a guarantee the HUD had been relying on by
coincidence: the bar's colour and the words "air too thin for boost" are one
fact shown twice, and they now come from one flag and one constant rather than
from two copies of `0.7`.

### Text size and units, and the line between a reading and a setting

Text scales from one custom property, so a readout added later scales without
being told to. It scales the player's HUD only: the debug column and the
generated help block are the prototype's own furniture, are not in the shipped
HUD, and are already the largest things on screen — scaled with everything
else, the help block at 150 % wraps across the window and lands on the
altimeter.

Units draw the same line, and it is worth stating because it is not the obvious
one. The toggle moves **what the world is doing where the player is** —
altitude, ground, temperature, climb, map distances. It leaves **what the
operator has set the build to** — the pacing cycle's 80 / 130 / 190 km/min, the
trip length in minutes, the warning that no speed above 73 flies Expedition 1.
Those are the numbers F16 to F19 are written in, and a G2 session log that
converted them could not be read against the plan that scheduled it.

Imperial here is the domestic one — feet, miles, Fahrenheit, feet per minute —
rather than aviation's feet, knots and nautical miles, because the cohort is
people with no flight-sim experience and knots would be a third system neither
half of the audience reads. That is a default and not a finding, in the sense
F33 used the word. The scale bar picks its own round number in whichever system
is on, because 500 km is 311 miles and a bar labelled 311 is not a scale bar —
and the old bar was a hard-coded 500 km that happened to suit one canvas width.

**Built.** `gfx/cvd.ts` and `map/palette.ts` (every map colour, with the
threshold on it), `hud/units.ts`, `hud/steady.ts`, the elevation stops as data
with the GLSL generated from them, a cased route and cased pins, haloed HUD
text and a framed density bar, `Z` and `U` on the binding table, and
`[hidden] { display: none !important }`. **656 tests, up from 603, and 639 of
them run without a world.**

**Action.** Two, both somebody else's. Whether the G1 cohort is screened for
colour vision is a protocol question — the instrument now exists to say what a
participant with a deficiency would and would not see, and the answer is that
the gate's own cue is safe and the ground's altitude colour is not. And the
elevation ramp itself is the world's look: a protanope gets a fifth of its
altitude information across the eastern plain, and whether that is worth
changing the hypsometric palette for is a design decision rather than an
engineering one. Nothing else here is outstanding.

## F46 — The HUD's one sentence asks the numbers to confirm what the player feels, and not one of them could be read; asking why found a humidity readout that called Shanghai a desert

**Question.** Workstream D's HUD row is built except for one clause: *what is
left in this row is a player-facing treatment of the five readouts the debug
HUD has carried since phase 0*. The GDD's whole HUD paragraph is two
sentences, and the second is the specification — *"Numbers are there to
confirm what the player already feels, not to be read first."* What does it
take to meet that, and what does asking find?

### Nobody had ever asked whether the numbers could be read

There is no test anywhere in the repository on what the six readouts say. So
the first thing to do was fly the authored route at sixty frames a second —
the rate the screen actually asks — and count how often each one changed what
it said. Expedition 1, thirty-seven minutes, 133,079 frames, over the ground
committed beside the route:

| readout | metric mean /s | worst second | seconds over 2/s | imperial mean /s | worst second | seconds over 2/s |
| --- | --- | --- | --- | --- | --- | --- |
| ALT | 2.5 | 6 | 956 of 2,219 | 8.2 | 19 | **2,162 of 2,219** |
| GND | 27.2 | **60** | 1,619 of 2,219 | 36.2 | **60** | 1,911 of 2,219 |
| TEMP | 0.2 | 1 | 0 | 0.3 | 1 | 0 |
| HUM | 0.0 | 1 | 0 | 0.0 | 1 | 0 |
| AIR | 0.0 | 1 | 0 | 0.0 | 1 | 0 |
| CLIMB | 0.2 | 15 | 41 of 2,219 | 2.3 | **61** | 131 of 2,219 |

Sixty in a second is every frame. The longest the altimeter ever held still
was five seconds in metres and **two in feet**.

The ceiling those columns are counted against is not borrowed from anywhere:
it is this HUD's own. F45 put the density flag behind `HUD_HOLD_S`, half a
second, and wrote the reason beside the constant — *"two changes a second at
the very most, from any input"*. That sentence was true of the one boolean it
was written for and false of the six numbers beside it. **F45 rate-limited the
smaller half of "no strobing" and left the larger half changing sixty times a
second.**

### The imperial toggle was the thing that made the altimeter unreadable

43 % of the flight's seconds in metres against **97 % in feet**, for the same
aeroplane on the same flight. A foot is 0.3048 m, so a display that steps in
whole feet turns its last digit over 3.28 times as often as one that steps in
whole metres, and feet per minute is worse again: one metre per second is
196.9 ft/min, which is why the climb readout managed sixty-one changes in a
second. The comfort row asked for an imperial toggle and F45 built one; what
it did not do was ask what the toggle costs the thing it is toggling.

### Two mechanisms, because there are two questions

**How often may a number change?** `HUD_HOLD_S`, the answer already in the
file. A change is committed at once if the value has been still and otherwise
waits its turn, exactly as the flag does — so `SteadyFlag` became
`Steady<T>` and the numbers are the same class with a different `T`. That is
also the half that survives a player: everything measured here is an
autopilot's flight, and a hand on the stick is jumpier than that, not
smoother.

**How much may it change by?** The step. Between two updates the quantity
moves by `rate × HUD_HOLD_S`, so anything finer than that turns over at every
single update and carries nothing a reader can use. The step is that distance
at the 95th percentile of the route's own measured rate, rounded up the same
1-2-5 ladder the map's scale bar picks from — one step per update rather than
several. The ladder is now one function with two directions, because a scale
bar wants the longest step that fits and a readout the shortest that is
legible.

| readout | rate p50 | p95 | max | p95 × hold | step | was |
| --- | --- | --- | --- | --- | --- | --- |
| altitude | 2.15 m/s | 5.08 | 5.66 | 2.54 m | **5 m** | 1 m |
| ground | 17.85 m/s | 536.36 | 1,862.78 | 268 m | **10 m**, clamped | 1 m |
| temperature | 0.01 °C/s | 0.03 | 0.04 | 0.015 °C | 0.1 °C | 0.1 °C |
| humidity | 0.00 %/s | 0.02 | 0.03 | 0.01 % | 1 % | 1 % |
| density | 0.00 /s | 0.00 | 0.00 | 0.000 | 0.01 | 0.01 |
| climb | 0.00 (m/s)/s | 0.03 | 1.89 | 0.015 m/s | 0.1 m/s | 0.1 m/s |

Three rows were already coarser than the rule asks and are left alone — the
measurement condemns nothing there, and changing them would be taste. One row
is clamped, and it is the interesting one.

### Ground elevation is the readout the compression defeats

Its rate is not set by the aeroplane. It is set by how fast the world goes
underneath: at 130 km/min the aircraft crosses a kilometre of the 1 km grid
every 0.46 s, and the corridor steps **33 m between adjacent kilometres at the
median, 291 at the 95th percentile and 639 at its worst**, over 2,931 km. The
rule's own answer is a 500 m step — and the GDD's *"this is a hole"* row is
written against Turpan's −154 m, which a 500 m step rounds to zero.

So this one is clamped to the median step instead, 10 m, and the honest
statement is the one the clamp admits: **twice a second GND is a true reading
of the ground under the aircraft, and in the mountains consecutive readings
differ by hundreds of metres, because the ground under a 1:8 aircraft really
is moving at up to 1.9 km/s.** What is deliberately not done is smoothing it.
A held sample is the true value at the moment it was taken; an average is a
number the world never had, and the ground under a wing is exactly where that
matters.

### Imperial follows metric rather than being measured again

F45's line is that the toggle changes the units and not the reading. Measured
separately, the imperial altimeter's own answer is 10 ft — 3.05 m, *finer*
than the metric step — and the player would be told the world is known more
precisely in one system than in the other. So the metric step comes from the
measurement and the imperial one is the smallest ladder step that is not
finer:

| readout | metric | imperial | its own measurement would have given |
| --- | --- | --- | --- |
| altitude | 5 m | 20 ft | 10 ft |
| ground | 10 m | 50 ft | 1,000 ft |
| climb | 0.1 m/s | 20 ft/min | 5 ft/min |
| temperature | 0.1 °C | 0.2 °F | 0.05 °F |

### What it reads like now

The same flight, the same counting:

| readout | metric mean /s | worst second | imperial mean /s | worst second | longest still, m → ft |
| --- | --- | --- | --- | --- | --- |
| ALT | 0.5 | 2 | 0.4 | 1 | 10 s → 13 s |
| GND | 1.2 | 2 | 1.1 | 2 | 83 s → 94 s |
| TEMP | 0.2 | 1 | 0.1 | 1 | 31 s → 24 s |
| HUM | 0.0 | 1 | 0.0 | 1 | 215 s |
| AIR | 0.0 | 1 | 0.0 | 1 | 287 s |
| CLIMB | 0.1 | 2 | 0.1 | 2 | 117 s |

Not one second of the flight, in either system, has a readout change more than
twice — which is the assertion the suite now carries, flown, rather than a
sentence. And the altimeter in feet now changes *less* often than the one in
metres, because 20 ft is 6.1 m: the toggle has stopped being a legibility
setting. Checked in the browser as well as in the sim — ten seconds of the
running prototype at 46 fps, and GND's worst second is 2.

One thing the step cannot cover, and it belongs to an open decision rather
than to this one. `step()` clamps a touching aircraft to ground + 25 m, and at
cruise that lifts it **20.8 m in a single frame, on one frame in forty-five** —
four steps of the altimeter at once, 1.3 times a second. The hold bounds how
often the number moves and nothing here bounds how far. That is the terrain
clamp, which is already in the plan as the user's call and is a flight-model
question; it is now also visible on the instrument.

### The GDD's five sensations, against what this build can show

The HUD paragraph is followed by a table of five sensations and the reading
that confirms each. Nothing had ever checked it against a flight, so:

| sensation | the GDD's confirmation | Expedition 1 |
| --- | --- | --- |
| "this is high" | altitude 4,800 m, temp −4 °C, density low | **18.1 of 37.0 minutes** at or above 4,800 m; peak 5,849 m, σ to 0.55, air to −30.0 °C |
| "this is a hole" | ground −154 m, temp 42 °C | never: ground 0 to 5,558 m, warmest air −1.0 °C. Turpan is not on this route and is a phase-2 probe |
| "this is wet" | humidity 90 % | **0 to 7 %, and Lhasa was the wettest place on the route** |
| "this is empty" | map: nearest city 400 km | needs cities — not built |
| "this is crowded" | map: 8 cities within 100 km | needs cities — not built |

The first row is comfortably delivered and is the one G1 is scored on. The
second is a different expedition. The third was a bug.

### The humidity readout called Shanghai a desert

`standInPrecipMm`'s first parameter is named `inlandKm` and the app passed the
aircraft's projected **easting** — a coordinate measured from a false origin
3,456 km west of the central meridian, so it grows *toward* the sea rather
than away from it — and the saturation at 3,200 km then flattened everything
east of the Ordos to zero. The function's own docstring says *"wet southeast,
dry northwest"*. It delivered the exact opposite:

| place | humidity, November — before | after | July — after |
| --- | --- | --- | --- |
| Sanya | 0 % | 34 % | **96 %** |
| Shanghai | 0 % | 30 % | 86 % |
| Wuhan | 0 % | 26 % | 75 % |
| Chongqing | 0 % | 23 % | 64 % |
| Chengdu | 0 % | 20 % | 58 % |
| Harbin | 0 % | 19 % | 53 % |
| Lhasa | 7 % | 14 % | 41 % |
| Turpan | 7 % | 6 % | 18 % |
| Kashgar | **22 %** | 3 % | 9 % |

Six of the nine read exactly zero in every month of the year, and Kashgar — in
the Taklamakan — read the wettest of them. The GDD's *"this is wet — humidity
90 %"* was unreachable anywhere in China, and Expedition 1's own authored note
about thick Sichuan fog was contradicted by its own HUD two minutes into the
flight.

The shape is untouched calibration and stays: the 240 mm cap, the exponent,
the monsoon term. What changed is that `dryness` rises toward the northwest,
which is what the line above it always claimed, and that the function takes a
**named place** rather than two bare numbers — `unprojectAlbers` already
returns exactly that shape, so handing it grid metres is now a type error
rather than arithmetic.

That second half matters more after the fix than before it. The original bug
at least failed loudly — every populated place read a flat zero. Feed the
corrected function the same grid metres and Shanghai in July comes back as
**79 mm**, which is wrong and looks entirely reasonable. Fixing the direction
without fixing the signature would have made the next transposition of these
two numbers invisible.

It is still a stand-in — the climate atlas replaces it in phase 2 and no card
may quote it — so what the tests hold it to is an ordering rather than a
forecast: wet southeast, dry northwest, monsoon in summer, and the driest
desert in China never the wettest reading on screen. The residual is recorded
rather than hidden: Turpan reads wetter than Kashgar, because longitude and
latitude cannot tell a basin from its surroundings.

**The thermometer beside it was already the right way round and is left
alone.** Two things about it are now written down. Its `/ 3400` is the
*synthetic* world's north extent and the real grid is 4,416 km tall, so
everything north of Harbin reads the same sea-level temperature — the far
northeast has no gradient at all. And re-anchoring it to the real grid moves
Harbin in January from −21.3 °C to −13.3 °C, which is *away* from the −25 °C
the GDD's Ice to Coconuts is built on. That is a calibration for the atlas to
make, not a sign error to fix here.

Neither function had a test. That is how one of them ran backwards for as long
as it existed: they are the only two inputs to the simulation with nothing
asserted about them, and they feed two of the five readouts.

### The operator's column was ninety-two per cent of the HUD

The GDD's word for its HUD is *minimal*. Measured in the running prototype at
1,280 × 800:

| | area | characters |
| --- | --- | --- |
| the player's — five readouts, a bar, the mode | 43,621 px² | 150 |
| the operator's — debug column and help block | **473,779 px²** | **2,282** |

**91.6 % of the HUD's ink and 46.3 % of the screen**, none of it in the GDD's
HUD paragraph, all of it always on. A cohort flying this reads the instrument
rather than the game, which is the confound F15 moved the chase camera and the
haze into real units to avoid.

So the two blocks are one element behind `O`, off by default, and the one line
of the mode block that was an operator's — km/min, max climb, and F19's "1 s
down = N s up" — moved in with them. What is left always on is the GDD's list
and nothing else: **2.9 % of the screen.** Off by default is a default rather
than a finding, in F33's sense — it is one line if the prototype would rather
boot with its instruments showing.

**Built.** `hud/readout.ts` (the step table with its measurement on it, the
quantiser and the held readout), `SteadyFlag` generalised to `Steady<T>`, the
1-2-5 ladder as one function with two directions, `standInPrecipMm` taking a
place instead of two numbers, `O` on the binding table, an `#operator` element
the five readouts are no longer buried in, and the first tests either climate
stand-in has ever had. **679 tests, up from 656.**

**Action.** None outstanding that is engineering. The terrain clamp is now
visible on the altimeter as well as in the camera, which strengthens an item
already on the list as the user's. "This is a hole" and the two map rows of the
GDD's sensation table need a different expedition and the city bake, both
phase 2, and are already tracked as such.

## F47 — The key that hid the prototype's instruments hid the map and everything the game says along with them, because "the operator's" was written as a wrapper rather than as a list

**Question.** F46 took 92 % of the HUD's ink off the screen and put it behind
`O`. A change that large deserves the question it did not get on the day:
with the key in, what is actually left in front of a player, and is all of it
meant to be there?

### The wrapper hid what was inside it, not what was measured

F46 measured two things — the debug column and the generated help block — and
hid them by wrapping them in a `<div id="operator" hidden>`. Nested inside
that wrapper were two more elements that were never in the measurement and
are not the operator's at all: the map overlay and the narration beat.

A wrapper hides whatever is in it. Measured in the running prototype at
1280 × 800:

| with `O` off | `hidden` | `checkVisibility()` | box |
| --- | --- | --- | --- |
| `#map` after pressing `M` | `false` | **`false`** | **0 × 0** |
| `#beat` with a beat showing | `false` | **`false`** | **0 × 0** |

`M` still worked, in the sense that the toggle ran, `mapOpen` became true and
`drawMap` went on running every frame for as long as the player left it
"open". What it drew into was an element with no geometry. On screen that
panel is **522,000 px², half of a 1280 × 800 window** — on its own larger than
the 473,779 px² of instrumentation the key exists to hide. F45 had already
found this map on the wrong side of a visibility bug in the other direction:
`.map { display: flex }` beat the user agent's `[hidden] { display: none }`,
so the panel had been on screen permanently since it was built, and the fix
was `[hidden] { display: none !important }`. Six weeks of work later the same
panel was permanently *off*, and for a reason that rule cannot reach — an
ancestor's `display: none` is not something a descendant's own computed style
can see, which is also why checking `getComputedStyle(map).display` after the
F46 change reported a healthy `flex` and confirmed nothing.

### Everything the game says over Expedition 1 is four words, and all four went into that box

`#beat` is where the single-card queue's output lands: narration beats,
discovery cards and comparison spreads, all three through the same element.
Counted against the authored content rather than assumed:

| over Expedition 1, 36.7 minutes | count |
| --- | --- |
| narration beats (waypoint passages) | **4** — Wuhan, Chongqing, Chengdu, Lhasa |
| discovery cards that fire | **0** — `content:discoveries` says so: 91, 476 and 1,476 km off |
| comparison spreads that open | **0** — none of the GDD's twelve is authored |

So the whole voice of the game, on its only authored expedition, is four city
names in thirty-seven minutes — and with the operator column off, a player
heard none of them. That is not a small consequence of a display bug. It is
the entire teaching surface of a game whose thesis is that flying over real
China teaches something.

### The clock is in the GDD's own list, and it was inside the column too

The GDD has a section for it: *"**Time on the HUD.** The clock shows Beijing
time, which is the point; the map overlay adds local solar time beside it so
the Kashgar surprise can be understood on the spot."* That is a two-place
specification, and the prototype had it in one place and the wrong one — all
three numbers on one line of the debug column, 48 characters, now off screen.

Split as the GDD writes it, the HUD line is five characters and the other
forty-three are on the map:

| | before | after |
| --- | --- | --- |
| HUD | `07:02 Beijing · 05:41 by the sun · sun −13° below`, inside `#debug` | `TIME 07:02 Beijing` |
| map overlay | — | `05:41 by the sun · sun −13° below`, top right of the panel |

This is not the same instrument shrunk. A HUD line that already says the sun
is an hour and twenty behind the clock has answered the question the map
exists to ask, and it answers it on a screen with no longitude on it to
attach the answer to. On the map there is a country under the number.

### Membership is a list now, and a test holds the list to the markup

The bug is not that the wrong elements were nested; it is that "which blocks
are the operator's" was expressed as *where they sit in the document*, where
nothing can check it. It is a declaration in `app/src/hudBlocks.ts` now —
`OPERATOR_BLOCKS` is the two blocks that were measured, `PLAYER_IDS` is what
the GDD puts in front of a player, each with the sentence that puts it there —
and `test/hud/blocks.test.ts` parses `index.html` and holds one to the other:
every declared id exists, every block on the HUD is classified exactly once,
and **no player-facing id is a descendant of a block `O` hides**. Reinstating
the F46 shape fails it in the words of the bug:

```
#map is inside debug, which O hides: expected [ 'debug' ] to deeply equal []
```

The same suite reads `main.ts` for every `el("…")` it asks the document for
and fails on any id the document does not have, because `el` ends in a
non-null assertion: a renamed element is not a type error and not a runtime
error either, until the frame that writes to it.

### The challenge banner's first placement failed the way F45's help block failed

A challenge's objectives are the player's — objectives nobody can see are not
objectives — so they came out of the column too, and the obvious place for a
one-line objective banner is across the top centre. Measured at 1024 × 768
before being believed:

| text size | gap to the readouts | with `O` on |
| --- | --- | --- |
| 100 % | 42 px | lands on the debug column |
| 125 % | **−5 px** | lands on the debug column |
| 150 % | **−52 px** | lands on the debug column |

Which is F45's own lesson about the help block — *"scaled with everything
else, the help block at 150 % wraps across the whole window and lands on top
of the altimeter"* — repeated on a different block. Both lines the game says
share one centred column at the bottom instead, so neither can be placed on
top of the other, and the column's distance from the bottom is in `em` so the
stack lifts with the text rather than climbing into the mode block. At
1024 × 768 with the operator column off it clears everything at all three
text sizes. With `O` on the help block still lands on it, at every size —
that is the operator's screen, and it is the same block F45 recorded landing
on the altimeter.

### What is on screen now

At 1280 × 800, with the operator column off:

| | px² | characters | share of the screen |
| --- | ---: | ---: | ---: |
| the player's, always on — six readouts, the bar, the clock, the mode | 34,154 | 105 | **3.3 %** |
| the player's, on demand — the map | 522,000 | — | 51.0 % while `M` is held open |
| the operator's — debug column and help block, behind `O` | 560,094 | 2,539 | 54.7 % when asked for |

**Built.** `app/src/hudBlocks.ts` (the two lists, each entry carrying the GDD
sentence that put it there), the `#operator` wrapper replaced by a `hidden`
applied from that list at boot and by `O`, the map and the narration beat back
on the player's side, a `#messages` column that holds the beat and the
challenge banner so neither can be placed on the other, the clock split into
Beijing on the HUD and the sun on the map, and `MapScene.caption` to carry it.
**686 tests, up from 679; 669 of them without a world, up from 662.**

**Action.** None outstanding. The next clause of this row is a look rather
than a readout and is the journal's, as it was before — but the measurement
above changes what that clause is worth: the reader is not waiting on content
alone. Four beats in thirty-seven minutes is what the game currently says with
its display working.

## F48 — The golden probe that guards "rivers are carved, not painted" passes at every search radius including none, and the stage it guards has never run

**Question.** Workstream D is built and the next unblocked engineering is in
the pipeline, so: what is actually built of workstream A, and what are its
gates worth? Stage 3 — *hydro-condition: burn HydroSHEDS centrelines, enforce
monotonic non-increasing elevation downstream, flatten named lakes* — is the
stage where the GDD's *"rivers are carved, not painted"* stops being a
sentence. It sits between two stages that are built. It is not built. And
phase 0's exit gate is *"the two corridor golden probes pass"*, one of which
is the Yangtze monotonic probe, whose source note read **"HydroSHEDS
centreline, monotonicity enforced in stage 3"**.

### The probe passes, and nothing it does is why

Against the built corridor, the probe reads seven waypoints, takes the lowest
cell within 2 km of each, and checks the seven numbers descend. `probe.py`
justifies that 2 km search at length: a waypoint is quoted to two decimals,
which is ±550 m, and a 1 km cell straddling a gorge reports the wall as
readily as the water. Taking the same verdict at other radii:

| search radius | verdict |
| --- | --- |
| point sample, no search at all | pass |
| 2 km (what is shipped) | pass |
| 5 km | pass |
| 10 km | pass |
| 25 km | pass |

**The verdict never moves.** The machinery with the careful justification
changes nothing, because seven numbers 500 km apart descend whatever you do
to them at the metre scale. Shanghai is 7 m and the Tuotuo He is 5,722 m;
there is no radius at which that stops being downhill.

### Walked any more finely it stops being a river

The other half of the same question is what happens between the waypoints,
because a clipped meander between two of them is the exact failure stage 3
exists to prevent. Re-walking the same polyline in the projected plane:

| spacing | samples | uphill steps | total uphill | verdict |
| --- | ---: | ---: | ---: | --- |
| 500 km (what it is written at) | 7 | 0 | 0 m | pass |
| 100 km | 35 | 14 | 4,193 m | would fail |
| 25 km | 137 | 61 | 11,961 m | would fail |
| 5 km | 677 | 303 | 38,191 m | would fail |
| 1 km, the grid's own resolution | 3,382 | 942 | 56,988 m | would fail |

The obvious reading of that table is wrong and worth saying out loud, because
it is the trap: **those 942 uphill steps are not the Yangtze running uphill.**
The probe's waypoints are a hand-placed chord, and a straight reach from Tiger
Leaping Gorge to Chongqing crosses mountains the river goes around. The chord
is **3,380 km against the Yangtze's published 6,300** — 54 % of the river's
length, which is what a shortcut looks like. Walk it finely and you are
measuring the ground under a shortcut.

So the two halves meet: the probe passes at the only spacing it can honestly
be checked at, and it cannot be made stricter without failing for a reason
that has nothing to do with hydrology. **A probe that cannot be made stricter
is not a strict probe.** It reads **175 cells of the corridor's 4,735,745** —
0.0037 % of the built grid.

### The channel search is a proxy, and it fails where a river is interesting

One column of the report already showed the damage resampling does, and its
size is worth naming. At Tiger Leaping Gorge the answer depends entirely on
how far you look:

| search radius at 26.87 N, 100.75 E | reads |
| --- | ---: |
| point sample | 3,028 m |
| 2 km | 2,712 m |
| 5 km | 2,312 m |
| 10 km | 1,711 m |
| 25 km | 1,572 m |

A proxy whose answer moves by a kilometre and a half with a radius nobody
derived is not finding a channel; it is finding a minimum. The same widening
at Shanghai reads 0 m at 25 km, which is the sea. The centreline that would
end the argument is stage 3's.

> **Corrected, 21 September 2026.** This paragraph first read that the
> shipped 2 km search sits "roughly 900 m above the water", comparing the
> reading at this waypoint against a published figure for Tiger Leaping
> Gorge. The waypoint is not at Tiger Leaping Gorge — it is 71 km away, which
> F49 measured and which is a larger finding than this one. Against the
> source's own 30 m within the same 2 km, the 1 km grid reads **216 m** high
> here, not 900. The table above is unchanged; what was wrong was the
> sentence under it.

### What changed

Nothing about the verdict: the probe passes, phase 0's gate stands, and this
is not a regression in the world. What changed is that a pass no longer
arrives without its own limits beside it.

- The source note stops describing a stage that has never run. It says what
  is true — hand-placed waypoints, no centreline data, no hydro-conditioning
  in the build — because provenance for a number that has none is worse than
  no note.
- `MonotonicProbe` carries `stride_km`, which is `None` and means *this may
  not be densified*. Stage 3 turns it into a number, and that is the day the
  probe becomes the check it has always claimed to be.
- `GridSampler.walk` samples a polyline at a fixed spacing in the projected
  plane, so a spacing is kilometres of ground rather than however far apart
  somebody put the waypoints.
- `probe.py` prints both sweeps and the coverage figure under every monotonic
  verdict — on a pass as readily as on a failure. A probe that only explains
  itself when it fails has already been believed.
- Four tests state the limits in the suite that runs with no elevation at
  all, including the one that matters: a true profile that climbs 500 m
  between Chongqing and Yichang and comes back down is handed to the probe as
  seven descending numbers and **passes**.

**Built.** The probe's own declaration of what it covers, the polyline walk,
the two sensitivity sweeps in the report, and the regenerated
`docs/probe-report.md`. **66 Python tests, up from 59.**

**Action.** One, and it is the stage itself: **stage 3 needs the HydroSHEDS
river network and nobody has downloaded it.** That is a fetch of a public
dataset rather than a decision, so it is engineering — but it is a download,
and the acquire step for it does not exist. Until it does, this probe covers
what the table above says it covers and the report says so on every run.

> **Corrected, 22 September 2026.** It is a decision. HydroSHEDS is not
> published under an attribution licence. It comes under a bespoke agreement,
> and downloading the data accepts that agreement. There are three river
> networks the stage could read, under three licences, so which one to fetch
> is a licence choice before it is a download. The acquire step exists now,
> and it will not run until the command names the licence it accepts. See F59.

## F49 — The anchor named after the world's deepest gorge was 71 km from it, and the 1 km grid runs the Yangtze uphill through the real one

**Question.** F48 left stage 3 blocked on a download, so the next stage that
could run on the bytes already here is stage 6, the 90 m hero areas — four of
its five places sit inside the corridor box. The measurement that decides
whether stage 6 is worth building is what 90 m holds that 1 km loses, and
Tiger Leaping Gorge is the place this repository has always named for it. So:
read the same ground at 30 m, at 90 m and at 1 km.

### The gorge was not where the repository said it was

The first reading came out wrong in a way that was not about resolution. At
the coordinate the repository calls `tiger-leaping-gorge` — 26.87 N,
100.75 E — the source's own 30 m bottoms at 2,496 m within 2 km. At Tiger
Leaping Gorge it bottoms at 1,775 m. The two are **71 km apart**, and the
shape of the ground says which is which:

| | lowest within 2 km, at 30 m | relief in a 20 km box |
| --- | ---: | ---: |
| the anchor as shipped (26.87 N, 100.75 E) | 2,496 m | 1,642 m |
| Tiger Leaping Gorge (27.18 N, 100.13 E) | 1,775 m | **3,823 m** |

A gorge between two 5,400 m massifs has 3,823 m of relief in a 20 km box. A
highland has 1,642. That one coordinate had reached four places: the manifest
anchor the operator's `goToAnchor("tiger-leaping-gorge")` teleports to, the
Yangtze golden probe's third waypoint, the committed projection reference
table `make reference` writes, and three findings — including phase 0's own
*"Tiger Leaping Gorge is +523 m, which is the strongest argument in this
document for the 90 m hero areas"*, computed 71 km from the gorge. F48's
"roughly 900 m above the water" was the same mistake, four days old. All three
are corrected in place above.

Nothing could have caught it, because nothing compared the name to the ground.
The coordinates were three separate literals that happened to agree, and a
table of coordinates cannot tell you one of them is in the wrong valley.

### The real gorge says something much sharper

With the coordinate right, the reading is the one stage 6 was always supposed
to produce — and it is bigger than the one it replaces:

| on the Jinsha, 40 km apart | 30 m source | 90 m | the 1 km grid |
| --- | ---: | ---: | ---: |
| Shigu, where the river turns north | 1,816 m | 1,816 m | 1,826 m |
| Tiger Leaping Gorge | 1,775 m | 1,788 m | **2,152 m** |
| **downstream, Shigu → the gorge** | **−41 m** | **−28 m** | **+326 m** |

> **Corrected, 21 September 2026 (F50).** These three columns read the gorge
> through a 2 km channel search from a waypoint that was **1,260 m up the
> gorge wall** — the search found the river, so the numbers are coherent, but
> the search was doing the placing and its answer sat at the rim of the disc
> at every resolution. With the waypoint on the water the conclusion holds and
> the figure is **+221 m**, not +326. The rest of this section is left as it
> was written; the direction, the mechanism and the argument for stage 6 all
> survive, and F50 carries the corrected sweep.

One river, two places, three resolutions. Through a broad valley the 1 km grid
is right to 10 m. Through the gorge it lifts the water 377 m — and the two
together mean **the 1 km grid runs the Yangtze uphill**, 326 m of climb in
40 km of downstream river.

That is not a subtle artefact. It is the exact thing the monotonic golden
probe exists to catch — *"A river must not run uphill after resampling and
carving"* — happening on the built corridor, in the most famous gorge in the
country, while the probe passes. It passes because neither of those two points
is on its waypoint list: F48 measured that the probe cannot see between its
waypoints, and this is what was between them.

### What changed

**One table of places.** `pipeline/nineskies/places.py` holds every named
place once — id, name, coordinates, what landform it claims to be, and where
the coordinate came from. The manifest's anchors are derived from it, the
golden probes' named waypoints read it by id, and the projection reference
follows the anchors. A second coordinate for the same name is now something
you cannot write down.

**The report checks the name against the ground.** Every run prints what the
built world reads at every place, with the relief around it beside the
landform it claims to be:

| Place | Claims to be | Lowest within 2 km | Relief in a 20 km box |
| --- | --- | ---: | ---: |
| Chengdu | city | 500 m | 88 m |
| Tiger Leaping Gorge | gorge | 2,152 m | 3,352 m |
| Shigu | valley | 1,826 m | 2,115 m |

That table is what would have caught this, so it is not optional and it does
not wait for a failure.

**A seventh golden probe, deferred rather than failed.** *Jinsha through
Tiger Leaping Gorge* is the shortest monotonic probe that can exist — two
points on one river — and at 1 km it is unpassable for the same reason
Everest is unpassable at 1 km: the cell containing the feature is mostly not
the feature. F12's rule applies unchanged, so it is declared `grid="hero"` and
appears in the report's *not runnable* table with the number on it, instead of
being a known failure nobody wrote down. At 90 m it reads −28 m and passes,
which is measured rather than hoped, and that is also the case for stage 6:
**the hero grid is not a fidelity nicety, it is what stops a golden probe
failing.** Stage 3 carving the channel at 1 km would fix it too, and this
probe is the check that says which of the two the world still needs.

**Built.** `places.py`, the anchors and probe waypoints derived from it,
`GridSampler.relief_m`, the named-places table in the probe report, the gorge
probe, and seven tests including the one that states the bug: the stale
coordinate appears in no place and no probe. The world's elevation is
untouched — `heights.bin` hashes to the same `ec5a5e1b…` it did before, and
only the names attached to it moved. **73 Python tests, up from 66.**

**Action.** Stage 6, and it is now a probe failure rather than a fidelity
preference. Four of the five hero areas — Guilin, Zhangjiajie, the Three
Gorges and Tiger Leaping Gorge — are inside the corridor box whose source is
already on disk. Everest is not: its own one-degree cell is there but its
three neighbours are not, so the summit's hero tile needs a small download,
and Everest is the probe F12 deferred to this grid.

> **Corrected, 21 September 2026 (F50).** It is **three**, not four. Guilin
> sits 0.27° north of the corridor box's southern edge, so a 64 km area around
> it reaches into latitude 24 and those cells were never fetched. Stage 6 is
> built and the gorge area is cut; what the count above got wrong is which of
> the remaining four can follow it without a download.

## F50 — The gorge waypoint was 1,260 m up the gorge wall, and stage 6 is built

**Question.** F49 left stage 6 as the next thing to build and said why: at
1 km the Jinsha climbs through Tiger Leaping Gorge where the source runs it
down, so the seventh golden probe cannot pass on the artefact the game ships.
The build plan left one question open — how a hero tile is addressed against a
64 km country tile, which 11.52 km does not divide — and one number unexamined:
90 m, written down before anything measured it. So: measure what the hero grid
has to be, then build it.

The first measurement said something else.

### The waypoint was on the wall, and a search radius was hiding it

At the gorge coordinate F49 established — 27.18 N, 100.13 E — a **point sample
of the source's own 30 m reads 3,036 m**. The Jinsha there is at about 1,776 m.
The waypoint stood **1,260 m up the gorge wall**, and F49's whole argument had
been computed on it.

It read the river anyway, because `channel_m` searches for the lowest cell
within 2 km and found one. The tell is where:

| resolution | lowest within 2 km | how far away it was |
| --- | ---: | ---: |
| 30 m | 1,779 m | 2.10 km |
| 60 m | 1,782 m | 2.23 km |
| 90 m | 1,789 m | 2.18 km |
| 1 km | 2,143 m | 2.48 km |

The minimum sits at the **rim of the disc at every resolution**. A search whose
answer is always at its own edge is not finding the channel; it is reporting
the lowest point of whatever circle you drew, and the circle was doing the
placing. Widen it and the answer keeps moving: 3 km finds 1,763 m, 5 km finds
1,724 m.

F49 added the relief column precisely to catch a misplaced name, and relief
could not catch this one — **a gorge floor and the cliff above it sit in the
same 20 km box and both report about 3,800 m**. The column that separates them
is how far a point stands above the lowest ground near it. It is in the report
now, and it reads 2 m at Shigu and 1,260 m at the old waypoint.

### Where the gorge is, by what makes it a gorge

Rather than move the coordinate by eye, the gorge was located by its own
geometry — the Jinsha running between two massifs — and the built world was
asked where those are. Inside a 40 km box there are three summits above
5,000 m: **Haba Xueshan at 5,341 m** (27.32 N, 100.11 E) and **Yulong Xueshan
at 5,399 m and 5,445 m** (27.14 N, 100.16 E). Ranking every cell below 1,900 m
by the depth of the trench around it puts the deepest reach between them, and
the channel cell nearest its middle is **27.2107 N, 100.1253 E at 1,757 m**,
3.45 km from where the waypoint was. Shigu moved 0.58 km onto the water by the
same rule; it had only ever been 9 m above it, which is why the identical fault
was invisible there.

A river waypoint says so in the table now. `Place.on_channel` is a promise that
the coordinate is on the water, and the probe report holds every such place to
it against the built world.

**The tolerance is not zero and cannot be.** Two things lift the reading with
no help from the coordinate. A river falls — through this gorge the Jinsha
drops 46 m across the window at the source's own 30 m, against 1 m at Shigu
where the same river runs flat. And a cell wider than the water is mostly not
water, so the same waypoint reads 63 m at 90 m and **186 m at 1 km on ground
that has not moved**. Measured at three resolutions the floor is about
`42 + 0.14 × cell`, so the tolerance is twice that: every honest reading sits
near half of it, and the 1,260 m fault clears it by 3.4× even on the coarsest
grid. A fixed 200 m — the first number tried — would have passed the 1 km
reading by 14 m, which is a threshold that happens not to have fired rather
than one that holds.

### With the waypoint on the water, what the resolution sweep actually says

The probe is now a point sample and needs no search at all. Over sixteen
sub-cell grid phases at each resolution — F12's method, because grid phase
alone swung Everest by 153 m — the downstream drop from Shigu to the gorge:

| resolution | worst phase | best phase | verdict |
| --- | ---: | ---: | --- |
| 30 m | −39.5 m | −46.7 m | passes at every phase |
| 60 m | −29.5 m | −42.4 m | passes at every phase |
| 90 m | −13.9 m | −25.3 m | passes at every phase |
| 100 m | −7.7 m | −21.9 m | passes at every phase |
| 120 m | **+0.9 m** | −23.2 m | fails at some phase |
| 200 m | +49.2 m | +18.7 m | fails at every phase |
| 1 km | +379.7 m | +213.9 m | fails at every phase |

So the probe flips between 100 m and 120 m, and F49's headline number is
corrected by the move: the 1 km grid runs the Jinsha uphill by **221 m**
between these two waypoints, not 326 — the larger figure was measured from the
cliff.

### 90 m is right, and it was nearly talked out of it

100 m is the tempting answer, because it is the one resolution that nests: ten
hero cells to a country cell, 12.8 km tiles exactly five to a 64 km country
tile, every country sample also a hero sample. 90 m nests in nothing —
`gcd(90, 64000)` is 10, so country samples land on hero samples only every
9 km and **no tile size of 90 m cells would fix it**.

What settles it is the second probe. Everest also reads this grid, and the two
pull opposite ways: the gorge wants the valley floor left alone, a summit wants
the ridge kept. Sweeping the silhouette bias at each resolution gives the
window where both pass at once — the summit half measured on Yulong and Haba,
the two massifs this gorge runs between, standing in for Everest, whose own
source cells are not on disk:

| resolution | bias window where both pass | best margins | MB per 64 km area |
| --- | --- | --- | ---: |
| 60 m | **every value tested, 0.00–0.75** | gorge 11.7 m, summit 11.1 m | 2.3 |
| 90 m | 0.25–0.45 | gorge 4.4 m, summit 3.6 m | 1.0 |
| 100 m | **0.35 alone** | gorge 3.0 m, summit 1.0 m | 0.8 |
| 120 m | none | — | 0.6 |

100 m is not a setting, it is a coincidence: one value of a continuous knob,
with a metre to spare on a 5,337 m mountain. The nesting is worth having and it
is not worth that. **90 m stands, now for a measured reason rather than an
inherited one**, and its bias is **0.40** — its own number, not stage 2's 0.25,
which sits at the very edge of the window.

The honest caveat is in the table: at **60 m the knob stops mattering
altogether**, both probes pass at every bias, and the margins triple. It costs
2.3 MB per area against 1.0 — about 6.5 MB across five areas, on a line the
plan budgets at ~9 MB and which is not on the critical path to first flight.
That is a budget decision rather than an engineering one, so it is recorded
here and listed as an open item rather than taken.

### How a hero tile is addressed: it is not

The build plan's open question has a factual answer rather than a preferred
one. At 90 m there is no nesting available at any tile size, so the hero
lattice stands on its own and shares only the country grid's origin, which is
what keeps both indexed from the same corner. `country_tiles_under` answers
"where does this tile sit" with a span of one, two or four country tiles rather
than an index.

What makes that safe is not shared samples but the skirts the engine already
has. `terrain.ts` drops a ring `900 * verticalExaggeration` below every tile
edge, commented "Skirts must out-reach the worst height disagreement between
LODs" — so the cut measures its own boundary against the country grid and
refuses to write an area that exceeds it. For the gorge area: **mean 71 m,
worst 333 m, against 900 m of skirt.** Checked rather than assumed, which is
the only reason a non-nesting grid is allowed to exist here.

### Two faults found on the way in

**The sampler's radii were cells wearing the name of kilometres.**
`GridSampler` converted every radius with `grid.RESOLUTION_M`, a frozen 1,000.
On the 1 km grid a radius in cells and a radius in kilometres are the same
number, so nothing ever showed; pointed at the 90 m hero grid, a 2 km search
reached **180 m**. Measured against a synthetic cone it read 0.28 km for a
stated 2 km. The resolution comes from the opened raster now. This is F46's
`inlandKm` again — a unit that was correct by coincidence on the one input
anybody tried. The same measurement showed the window is a **square**, so a
"2 km" search reaches 2.83 km into its corners; that is in the docstring and
in the report rather than quietly in the arithmetic.

**F49's one-table fix had not reached the point probes.** It moved the
monotonic probes' waypoints and the manifest anchors onto `places.py` and left
`PointProbe` and `FlatnessProbe` carrying their own `lat`/`lon` — so **Lhasa's
coordinate was written out twice, identically, in two files**, which is the
exact duplication F49 exists to end, surviving the fix for it. Every probe
names a place now and the dataclasses have no coordinate fields at all, so a
second copy cannot be written. Five places came in with them — Everest, Ayding
Lake, Qinghai Lake, Heihe and Tengchong — all with `anchor=False`, because they
are things to measure rather than places to be sent, and the manifest's eight
anchors are unchanged.

### What was built

Stage 6 exists. `hero.py` cuts 90 m areas on the lattice above, in the same
129 × 129 tile layout and the same north-running `j` as a country tile so the
engine's heightmap reader needs no second convention. The gorge area is **24
tiles, 0.80 MB, 1,581–5,440 m**, and:

> **the seventh golden probe passes — −80 m downstream on the channel, −11 m as
> a bare point sample, at every search radius from none to 25 km.**

Which is the shape F48 asked for: the search no longer decides the verdict.

An area is sited on places from `places.py` and refuses to be cut if it does
not contain them. **Two of the plan's five are sited; three are not**, and that
is deliberate — Guilin, Zhangjiajie and the Three Gorges have no coordinate in
this repository that anything has ever checked against the ground, and writing
three from memory is precisely what F49 and F50 cost. They are listed in
`hero.UNSITED` with what siting each needs, and the hero report prints them.
Everest is sited and refuses to cut: three of its four one-degree cells are not
on disk.

Also corrected: F49's claim that four of the five areas need no download. It is
**three**. Guilin sits 0.27° north of the corridor's southern edge, so a 64 km
area around it reaches into latitude 24, which was never fetched.

`make hero` cuts the areas, `make probes` now runs both grids and writes
`docs/probe-report.md` and `docs/probe-report-hero.md` — both, because a probe
deferred from one grid to the other is only answered on the second, and running
one gate would make the seventh probe invisible again. The Makefile's own stage
numbering is fixed with it: it had been calling the route-section cut "Stage 6",
which is the number the hero grid actually has.

**106 Python tests, up from 73.** The two faults are reproduced rather than
asserted: putting the old coordinate back fails `test_the_gorge_is_no_longer_on
_the_wall_above_the_gorge`, and removing the `on_channel` promise fails three
more. `test_the_fixture_is_not_saturated` is there because the first version of
the tile-layout test encoded `row * 1000 + col`, overflowed Int16, and passed
its shared-edge assertion by comparing 32,767 to itself.

**The world's elevation is untouched.** `heights.bin` still hashes to
`ec5a5e1b83247978`; only the names attached to it moved.

## F51 — The hero grid reaches the engine, and it cannot be drawn over or under the one it replaces; the drama setting was chosen against ground three times coarser

**Question.** F50 built stage 6 and left the artefact unread: `hero.py` writes
129 × 129 Int16 tiles and a manifest, and nothing loads them. The build plan
recorded what it thought was needed — *a source that answers by position rather
than by tile index, and a rule for which grid wins where they overlap* — and
added that "this is a streaming and addressing job rather than a rendering
one". Two of those three are right.

### It is a second lattice, not a second source

`TileSource` is asked by country tile index, and 90 m nests in no country tile
at any tile size (D47). That much the plan had. What it did not have is that
the engine bakes *one* lattice into three places that cannot be talked out of
it:

| where | what is baked in |
| --- | --- |
| `HeightTileArray` | a texture array has one width and one height for every layer in it — 65 × 65 |
| `buildGrid(segments, 65)` | the texel stride is a vertex attribute, built once per LOD |
| `uTileWorldSize` | one uniform, one material, 64 km |

So a hero tile cannot ride in the country grid's draw. It gets its own texture
array, its own four buckets and its own material, and `Terrain` holds both and
keeps one rebase point between them. That is a rendering job, and the estimate
in the plan was wrong; it is recorded here rather than quietly fixed because
the same reasoning will be applied to the next grid somebody adds.

Two things did fall out for free. The LOD ladder still works — 128 divides
128 at every level, so every hero LOD lands on real samples — and the haze,
the palette, the skirts and the flat-shading are shared code that neither
knows nor cares which lattice it is drawing.

The hero ladder is **not** the country one. `LOD_SEGMENTS` starts at 64, which
over 129 samples strides by two: 180 m ground, at an area cut for 90. The hero
ladder is `[128, 64, 32, 16]`.

### Neither grid can be drawn over the other

The obvious cheap rule — draw the fine grid on top and let the depth buffer
sort it out — is not available, and the reason is measurable. Over the gorge
area, sampled on the hero lattice's own 90 m cells (393,216 of them):

> **hero − country spans −764.5 m to +390.0 m.**

The country grid fills the gorge in from above by up to 764 m and its ridges
sit up to 390 m below the hero grid's. Drawn together, the 1 km surface would
roof over the gorge the player is meant to thread and the 90 m ridges would
spear up through it. So where a hero area is drawn, the country grid is
**removed**: the terrain shader takes the area rectangles as uniforms and
discards fragments inside them.

Per-fragment rather than per-vertex because a country tile's vertices are 1 km
apart at the finest LOD and 8 km at the coarsest, and the rim of a hero area
is a straight line at neither spacing. The cost is that a shader containing
`discard` gives up early-Z on most hardware whether the branch is taken or
not — so the material is **generated**, and the one with no holes to cut is
compiled without one. Every build that has no hero cover, which is every build
before this one, draws the shader it always drew.

The invariant that makes the hole safe is that **an area is drawn whole or not
at all.** An area streamed in tile by tile would show sky through its
unfinished half, so the cut is published from the list of areas that were
actually drawn this frame, and an area that could not be drawn whole is not
cut. It costs nothing to promise: the gorge cover is 0.80 MB and is resident in
one piece.

### The seam, measured a second way

The cutter measures its own rim against the country grid and refuses to publish
an area that disagrees by more than the 900 m the skirts drop. Read back
independently here — bilinear, 45 m inside the rim, through the same sampling
the HUD uses — the rim disagrees by **mean 71.4 m, worst 339.4 m**, against the
cutter's own 71.3 and 333.2 from the other side. The two halves of the contract
agree, and `SKIRT_DEPTH_M` is now one exported constant that the pipeline's
test reads rather than a 900 written twice.

### What it costs the frame

Measured over the real gorge cut, at the view radius the app flies:

| | draws | instances | triangles |
| --- | ---: | ---: | ---: |
| country grid alone | 3 | 123 | 252k |
| both, gorge under the aeroplane | 5 | 147 | **712k** |

Against a budget of 8 draws and 1,200k triangles. The hero area is 460k of
that and it should be — 24 tiles of 90 m ground the player is flying through is
what the whole stage is for. Approaching it:

| distance | hero triangles | frame total |
| ---: | ---: | ---: |
| 300 km | 16k | 268k |
| 120 km | 34k | 286k |
| 60 km | 81k | 333k |
| 25 km | 265k | 517k |
| 0 km | 460k | 712k |

An area is drawn as soon as it is within the country lattice's own reach, so
the fine ground never appears later than the coarse ground it replaces and
there is no distance at which the swap can be seen happening.

### The drama setting was chosen against ground three times coarser

This is the finding, and it is not an engineering one.

Facet angle is `atan(A · dh/dx)` where `A` is compression × exaggeration
(F14). A real slope renders the same at any cell size — but a finer grid
*resolves steeper real slopes*, because a 1 km cell is the average of 123 of
them. Measured in the same box, the gorge area, on both grids:

| grid | A | p50 | p90 | over 60° | over 75° |
| --- | ---: | ---: | ---: | ---: | ---: |
| country 1 km | 6 (shipped) | 42.0° | 67.6° | 22.7 % | 1.1 % |
| country 1 km | 12 (what F14 rejected) | 60.9° | 78.3° | 51.4 % | 19.3 % |
| **hero 90 m** | **6 (shipped)** | **53.1°** | **75.3°** | **42.1 %** | **11.1 %** |
| hero 90 m | 3.8 | 40.2° | 67.4° | 22.5 % | 1.4 % |

F14 measured the shipped 1:8 × 1.5 over the flown route at 35.6 % past 60° and
11.2 % past 75°, called it "spikes, not mountains" and moved the default to
A = 6 to fix it. **The hero grid at A = 6 is 42.1 % and 11.1 %** — in the same
box it is two-thirds of the way from the picture the project ships to the
picture it threw out, and on the 75° measure it is all the way there. It looks
like it: a rock forest where the 1 km ground beside it is rounded hills. F14's
own A/B renders in `docs/ab/` are from 1,400 m over this exact gorge, which
makes the comparison as direct as it can be.

**A = 3.8 puts the 90 m ground where the 1 km ground sits today** — both the
60° and the 75° share solve to within 0.15 of each other, which is a firmer
answer than a single percentile would be.

**The hero grid cannot have its own exaggeration**, so this is one number for
the whole world and not a per-area setting. At the rim the two grids disagree
about real elevation by up to 333 m, which the skirt hides; drawn at different
vertical scales they would disagree by `h · (v_country − v_hero)`, which passes
`900 · v_country` at **2,454 m of real elevation** and reaches 2.2 × the skirt
at the area's 5,440 m summits. The area runs 1,581–5,440 m, so most of it would
open.

So it is the same knob D28 and F14 left with the G1 cohort, and it now has a
second thing riding on it. Recorded as an open item rather than moved.

### Two consequences that are not fixed here

**The ground under the aeroplane steps at the rim.** `groundElevationM` reads
whichever grid is on screen, which is right — the HUD and the picture cannot
disagree — and that means crossing into a hero area moves the ground reading
by the rim disagreement: mean 71 m, worst 339 m. `step()` clamps the aircraft
to `ground + 25`, so that is a clamp event of up to 339 m in one frame, which
belongs with the terrain-clamp decision already open rather than beside it.

**The cockpit and the content gate now read different ground.** `Terrain`
prefers the hero grid; `tools/corridor.ts`, which is what cuts route sections
and challenge patches and what CI flies, knows only the country grid. No
authored content touches a hero area today, so nothing is wrong yet — but the
first challenge authored in the gorge would be checked against ground the game
does not use. Cutting a patch from the finest grid available is a content
decision with D23 signatures and D24 digests behind it, not a change to make in
passing.

### What was built

`heroSource.ts` holds every area published for a corridor as one
position-addressed source — `tileAt`, `covers`, `bounds` in the metres the
aeroplane flies in — and refuses areas that disagree about the lattice, the
origin or their own size rather than merging them. `hero.py` writes
`hero/index.json` beside the areas so the engine knows what to fetch; it is a
separate file rather than a line in the corridor manifest because that manifest
is hashed into every route section's signature (D23), and an area appearing
must not change what a section verifies against.

`tools/heroCover.ts` is the same loader over `node:fs`, for the tests and for
whatever content tooling wants it next.

Nothing imports across the Python/TypeScript boundary, so the index's shape is
checked the way the skirt depth is — from the Python side, against the
interface the engine declares. That guard needed two goes: matching a field
name as a bare substring passed a rename of `tileM` to `tileMetres`, because
the old name is a prefix of the new one. **109 Python tests, up from 106.**

**709 TypeScript tests in 60 files, up from 686 in 59**, and the four load-bearing behaviours are
reproduced rather than asserted: draw an area that is a tile short and
`will not punch a hole it cannot fill` fails; take the hero grid out of
`groundElevationM` and the gorge reads 2,197 m again; give the hero lattice the
country ladder and `reads every 90 m sample at the finest level` fails; compile
the cut into every material and `is the world as it was when nothing is
published` fails. The gorge case runs against the artefact on disk and is
skipped, loudly, where there is no world — after the first version of it broke
every build that has none, because `describe.skipIf` still runs a skipped
suite's body to collect it and the fixture was read at the top of the block.
`test/route/fixture.ts` carries that warning in a comment and it was read after
the fact rather than before. Checked by measurement rather than by reading the
code: with `dist-world/` moved aside the suite is **688 passed, 21 skipped, 60
files green**.

## F52 — The Three Gorges were measured out rather than remembered; Wulingyuan cannot be from this source; and a second area made a golden probe pass over nothing

*21 September 2026, on `real-elevation-pipeline`.*

The build plan's item said this was *engineering, and the work is a measurement
rather than a lookup*. That was right, and the measurement is now a module
rather than a session: `pipeline/nineskies/siting.py`, run by `make siting`.
Twice a coordinate written from memory has been wrong in a way nothing caught —
71 km off, then 1,260 m up a cliff (F49, F50) — and both times the fix was a
measurement that was then thrown away. This one is kept, because the next
coordinate is Guilin's.

### What the source states outright, and what it does not

Nothing in this repository is a gazetteer and nothing here will be. What a
measurement can do is hold a coordinate to the claim its *landform* makes, and
for the Three Gorges the source states the landform outright: the reservoir
behind the dam is flat to the metre for 190 km. Grouping every still block — a
240 m block whose own 30 m samples agree within a metre — by its elevation
finds it in one pass:

| Level | Still area in the box | Longitudes | Latitudes |
| ---: | ---: | --- | --- |
| **158 m** | **98 km²** | 109.000 – 110.951 E | 30.889 – 31.080 N |
| 32 – 37 m | 167 km² | 111.304 – 111.998 E | 30.002 – 30.676 N |

Two water levels 120 m apart, meeting at 111.00 E. That step **is** the dam,
and it is the only fact in this whole finding that came from the ground rather
than from a name. The lower surface runs east out of the box past Yichang,
which is already in `places.py`.

**A gorge is a narrow trench, so the radius is the measurement.** Wall height
above the water at 4 km reads within a couple of hundred metres everywhere
along the reach; at 1 km it separates the narrows from the open water between
them by a factor of two. Ranked at the near radius, twelve kilometres apart:

| Point | Water | Wall within 1 km | Wall within 4 km |
| --- | ---: | ---: | ---: |
| 31.0222 N 109.6089 E | 158 m | **1,137 m** | 1,255 m |
| 30.9511 N 110.7756 E | 158 m | 1,023 m | **1,698 m** |
| 31.0689 N 109.9467 E | 158 m | 1,022 m | 1,366 m |
| 31.0156 N 110.2622 E | 158 m | 915 m | 1,594 m |
| 31.0244 N 110.0644 E | 158 m | 766 m | 1,531 m |
| 30.8853 N 110.8847 E | 157 m | 643 m | 1,365 m |

Each answer is then moved the last few cells onto the water at 30 m, because a
240 m block on a river is mostly not river — the same fault
`probe.channel_tolerance_m` scales for, one stage earlier.

**The three names rest on the shape of the reach, and that much is checkable.**
Walking the near wall along the pool, the runs where it holds above 600 m are,
going downstream: **4.8 km**, then **47.7 km** in two runs either side of a
5 km opening, then **14.3 km**, and then the water widens to the dam. Short,
long, short — which is the order and roughly the proportion Qutang, Wu and
Xiling are given in. Qutang's 4.8 and Wu's 47.7 match their usual 8 and 45.
Xiling's do not: it is normally given as four times its 14.3 km of narrows,
because most of it is drowned and open now. So that one is identified by
position — the reach between the last narrows and the dam — and `places.py`
says so rather than implying the length agreed.

### What the coordinates read, at 30 m and at 1 km

`make siting` now writes `docs/siting-report.md`: every coordinate this
repository ships, in a 10 km box at the source's own resolution. It is the
question `probe.py` asks of the *built* world, asked where it can be answered —
1 km ground cannot tell a gorge from the county it sits in.

| Place | Claims to be | Relief | Past 45° | Past 60° |
| --- | --- | ---: | ---: | ---: |
| Shanghai | city | 47 m | 0.0 % | 0.00 % |
| Chengdu | city | 63 m | 0.0 % | 0.00 % |
| Lhasa | city | 1,038 m | 0.2 % | 0.00 % |
| Shigu | valley | 1,439 m | 4.0 % | 0.09 % |
| **Qutang Gorge** | gorge | 1,314 m | 5.2 % | 0.40 % |
| **Xiling Gorge** | gorge | 1,786 m | 7.1 % | 0.68 % |
| **Wu Gorge** | gorge | 1,458 m | 7.3 % | 0.69 % |
| Tiger Leaping Gorge | gorge | 3,574 m | 20.6 % | 2.52 % |
| Everest summit | summit | 3,532 m | 21.2 % | 4.79 % |

A city on the plain reads under a fifth of a percent past 45°; a gorge reads
five to twenty. The column separates them, which is the whole reason to print
it.

And the reason the area exists at all is the gap between the grids. At 1 km the
reservoir reads **237 to 298 m** where the source runs it at 156 to 158 — the
water the player would fly along is filled in by 80 to 140 m and the walls come
down with it. From the cockpit, with the area cut and flying:

| Waypoint | Country grid | Hero grid | Drop |
| --- | ---: | ---: | ---: |
| Qutang | 462.2 m | 158.0 m | 304.2 m |
| Wu | 433.0 m | 159.8 m | 273.2 m |
| Xiling | 419.1 m | 158.0 m | 261.1 m |

The seam holds: the area's boundary stands **mean 80.1 m, worst 330.1 m** from
the country grid it is dropped into, against 900 m of skirt — the same order as
the gorge already cut (71.3 / 333.2).

### One area, not three, and the number that decided it

The build plan left this open: *it is three gorges over ~120 km, so it may want
to be three areas rather than one.* Three areas would save 11 tiles — **0.37
MB** — and cost five more rim crossings, because F51's ground reading steps by
the grids' disagreement wherever hero cover starts or stops. A flight down this
reach would take six of those instead of two, at the mouth of the gorge the GDD
wants threaded. One area, 12 × 3 tiles, 1.20 MB.

It would not have bought a cheaper frame either. **The reach that decides
whether an area draws is 384 km** — `viewRadiusTiles` *country* tiles, six of
64 km — so two areas within a few hundred kilometres of each other are one area
as far as a frame is concerned. Three would all have drawn together anyway.

The cover is now **60 tiles, 2.00 MB**, across two areas.

### Wulingyuan cannot be sited from this source, and the reason is not the coordinate

A coordinate for it already exists — `content/cards/wulingyuan.yaml` carries
`trigger: { lat: 29.33, lon: 110.48 }`, which is a fourth place a coordinate
lives and the duplication F49 was written about. Nothing has ever checked it.
Checking it is what this measurement is for, and the answer is not the one the
item expected:

| 10 km box | Relief | Past 45° | Past 60° |
| --- | ---: | ---: | ---: |
| the card's trigger, 29.33 N 110.48 E | 870 m | 4.4 % | 0.21 % |
| 50 km north | 1,372 m | 5.8 % | 0.19 % |
| 50 km south | 697 m | 3.2 % | 0.04 % |
| 50 km east | 713 m | 1.2 % | 0.01 % |
| 50 km west | 582 m | 1.0 % | 0.02 % |
| Shigu, which `places.py` calls a broad valley | 1,439 m | 4.0 % | 0.09 % |

**The card's coordinate reads like Shigu** — the control the hero grid was
deliberately not cut for — and its own neighbour 50 km north is steeper. Sweeping
10 km windows over the whole surrounding degree, the steepest ground in it is
at **29.656 N 110.539 E, 36 km from the card** — and measured there the same
way as the table above, it reads **1.39 % past 60°**, still half Tiger Leaping
Gorge's 2.52 %.

The card promises "more than three thousand quartz-sandstone pillars, some of
them rising two hundred metres from the valley floor". If those were resolved,
a 10 km box would read several percent of its cells near-vertical from the
pillar walls alone; it reads 0.21 %. A detector for towers — 600 m-scale local
maxima standing a given drop above their own surroundings — was swept over
sixteen settings of radius and drop, and its answer moved anywhere in a **104
by 91 km box**. That is F50's fault exactly, in a new instrument: when the
search moves the answer, the search is doing the placing.

So the item's own framing was wrong and that is the finding. Zhangjiajie is not
waiting on a coordinate; it is waiting on a source that resolves what it is
named for. **A 90 m grid cut here would draw hills**, because the 30 m it would
be cut from draws hills. Whether to fetch a finer source or drop the area is a
decision, and it is recorded as one. Guilin is likely to be the same shape of
problem — karst towers are the same size of feature — and it is still blocked
first on three one-degree cells below 25 N, about 120 MB, which nothing here
will fetch without being asked.

### The second area made a golden probe pass over nothing

Adding it turned the hero report green over an empty raster. Every hero probe
runs against every hero area, and the Jinsha probe — 1,200 km away in Yunnan —
ran against the Three Gorges, read `nan m` at both waypoints, and reported
**pass**:

```
| Jinsha through Tiger Leaping Gorge | monotonic non-increasing | 2 waypoints | pass |
| 26.8747 N, 99.9625 E | nan m | nan m | — |
| 27.2107 N, 100.1253 E | nan m | nan m | nan m |
```

NaN compares false against every threshold a check can set, so *monotonic
non-increasing* over nothing at all is satisfied. This is F44's fault — a
challenge flown over a hole at ten kilometres below sea level reporting `done` —
one artefact along, and one area had hidden it because the only area there was
happened to contain the only probe there was.

`probe.on_this_artefact` now asks, before running anything, whether the
coordinates a probe reads are on this raster. All off, and it is listed under
*Not on this artefact* rather than passed. **Some on and some off is a
failure**, not a skip: a check that returns a verdict on the half it can see is
a green light for a raster cut too small.

The same counting argument applies to the texture array. Every published tile
is a layer, because an area is drawn whole and nothing is ever evicted; WebGL2
guarantees 256 layers. Eight areas of the Three Gorges' size would be 288, and
`Terrain` now says so at construction rather than letting it fail at upload,
where it would read as a driver problem.

### What was built

`siting.py` is arithmetic above the GDAL line, on the same rule as `grid.py`
and `hero.py`: `slope_degrees` takes the steeper axis rather than the gradient
magnitude, because a cliff that falls along one axis is a cliff; `box_max` and
`box_min` wrap at the edge of the box and every caller masks a margin, which is
stated in a test rather than left to be discovered; `box_share` shrinks at the
edge instead, and uses a float64 running sum because a float32 one over a
hundred million cells loses the last cells entirely. `block_reduce` keeps the
*lowest* as well as the mean, which is the only reason a river survives a
reduction at all.

**139 Python tests, up from 109**, and the load-bearing ones were reproduced
before being trusted: averaging the two axes instead of taking the steeper
fails the slope tests; quoting a gorge to two decimals instead of four fails
`a coordinate is quoted finely enough to mean a cell`; disabling the probe
filter makes the runner report `pass` over NaN again, and two guards fire.

**718 TypeScript tests in 60 files, up from 709**, and with `dist-world/` moved
aside, **692 passed, 26 skipped**. The check a screenshot made for F51 is made
headlessly here, because two areas are what makes it possible to get wrong: the
cut rect published while flying the Three Gorges has to contain the camera and
be the size of *that* area — publish it off the list of areas that exist rather
than the list actually drawn, and the hole lands in Yunnan while the fill is on
the Yangtze. `heights.bin` rebuilt byte-for-byte
identical (`ec5a5e1b83247978…`) after `make tiles`, so the three new anchors
reach the manifest without moving anything a committed section is signed
against — checked by hashing rather than assumed, since the alternative was
invalidating every section in the repository.

## F53 — The cockpit and the content gate read different ground, and the gap in the dangerous direction is larger than the only clearance anything is checked to keep

*21 September 2026, on `real-elevation-pipeline`.*

The build plan listed this as *engineering, and it is a content decision before
it is a code change.* Both halves of that are right, and they are separable: the
decision is which grid content is cut from, and it stays the user's. What was
not separable is that **nothing measured the gap**, so "nothing is wrong yet"
was a sentence rather than a check — and this repository has now twice shipped
a claim that was true when written and false later without anyone noticing
(F49's 71 km, F50's 1,260 m), plus a golden probe that reported `pass` over a
raster it could not read (F52).

### The two surfaces

Since stage 6 this world has two elevation grids. `Terrain.groundElevationM`
prefers the fine one, because the HUD and the picture must not disagree about
what is under the aeroplane. `cutSection` and `cutPatch` read `groundAt`, which
is the country grid, because every committed artefact in `content/` was cut
from it and re-cutting them all re-signs all of them (D23, D24).

Measured every 250 m across each published area:

| Area | Points | Mean gap | **90 m above 1 km** | 1 km above 90 m |
| --- | ---: | ---: | ---: | ---: |
| tiger-leaping-gorge | 51,245 | 72.2 m | **374 m** | 695 m |
| three-gorges | 76,867 | 74.5 m | **301 m** | 512 m |

Only one of those two columns is dangerous, and it is not the larger one. The
coarse grid standing *above* the fine one is a section that says the ground is
higher than the game draws it: the route flies safe and looks wrong. The fine
grid standing above the coarse one is a section that says the ground is **lower
than the aeroplane actually meets** — a clearance check passing over terrain
that is there.

**374 m, against the 333 m Expedition 1 clears its own worst terrain by.** A
route through Tiger Leaping Gorge, cut and checked exactly the way Expedition 1
is, can clear by 333 m in CI and be forty metres inside the wall in play. That
is the number this finding exists for, and it was not knowable before two areas
and a measurement existed at once.

### The guard, which is not the fix

The fix is to cut content from the ground the game draws, and it is not mine to
make: it invalidates every committed section and patch at once, which is a
decision about D23 and D24 rather than a repair. What is buildable without
pre-empting it is a refusal.

`cutSection` gained a fourth refusal and `cutPatch` a third, beside the ones
that already exist for a route leaving its corridor and a heightfield that does
not match its own manifest. Proved by authoring the route the GDD asks for —
Yichang out through Xiling, Wu and Qutang:

```
122 of 169 stations are over three-gorges, which the game draws at 90 m.
A section cut from the 1 km grid would put the ground 351 m from what the
player flies over at its worst (530 m against 179 m). Which grid content is
cut from is an open decision (F51, F53)
```

and the challenge version, a low pass over Wu Gorge, which is the most obvious
place in the built world to author *thread a gorge at low speed*:

```
1092 of 1092 cells are under three-gorges, which the game draws at 90 m …
272 m from what the player flies over at its worst (619 m against 347 m)
```

**The refusal is what makes CI able to see this, and no new committed artefact
was needed for it.** CI has no world and no `hero/`, so it cannot compare the
two grids itself. It does not have to. Moving a waypoint into the gorge changes
the route, `verifySection` compares the committed section's waypoints against
the expedition's to 1e-9, and a stale section is already a CI failure telling
the author to re-cut. The re-cut is then refused on the machine that has the
world, and CI's next complaint is *no ground to fly it over* — which is also
already a failure (D21). The loop closes on machinery that was all there; what
was missing was the one refusal in the middle of it.

Run rather than reasoned about, by moving Expedition 1's Chongqing waypoint
into Wu Gorge and putting `dist-world/` aside to stand for CI:

```
✗ sea-to-sky · section: waypoint 2 (chongqing) has moved to 31.0689, 109.9467
  since the section was cut at 29.57, 106.55
1 committed section(s) no longer describe their route.
Re-cut them with `npm run content:sections` on a machine with a world.
```

and the re-cut CI asks for is the thing that refuses:

```
– sea-to-sky not cut — 139 of 2891 stations are over three-gorges, which the
  game draws at 90 m. A section cut from the 1 km grid would put the ground
  255 m from what the player flies over at its worst (437 m against 182 m).
```

Three different machines, three different messages, and no way through any of
them that ends in a committed number nobody chose.

### What the pass covers

Both gates now print it rather than implying it, in the habit F48 put on the
probe report:

```
✓ sea-to-sky over sea-to-sky (world) · 36.7 min · clears by 333 m at 2366 km · arrives 264 m up against an authored 300
    90 m cover beside it: tiger-leaping-gorge, three-gorges (60 tiles at 90 m) · 0 of 2932 stations over it
```

Zero of 2,932 stations and zero of 1,726 committed cells. That is the whole of
the current content, and it is a fact about the content as it stands rather
than a property of anything — which is why `make ground` writes
`docs/ground-report.md` on every build instead of anyone remembering it.

**A count of zero and no cover at all are different sentences.** `DrawnGap`
carries `cover` for exactly that reason: a world built before stage 6 reports
`over: 0` because there is no second grid to disagree with, which must not read
as a check that ran and found nothing. This is F52's rule — a probe that reads
nothing reports nothing — applied before the fault rather than after it.

### One bilinear rule, so the two readers cannot drift

The renderer samples a resident layer of a texture array; the content tooling
samples an area held whole in memory. Those were about to be two copies of the
same arithmetic, and the first time they disagreed would have been the first
time anyone looked — so `HeightTileArray.sample` and the new `HeroCover.groundAt`
both call one exported `bilinearSample`. The cross-check is a test rather than
a comment: over Wu Gorge the cockpit's `groundElevationM` and the tooling's
`Corridor.drawnAt` agree to nine decimal places, and both give 159.8 m where
the country grid gives 433.0.

### What it cost, and what it did not

**729 TypeScript tests in 61 files, up from 718**; with `dist-world/` moved
aside, 695 passed and 34 skipped. Every guard was reproduced as a failure
before being trusted: disabling either cutter's refusal fails the two
refusal tests; making `HeroCover.groundAt` nearest-neighbour instead of
bilinear fails the agreement test; making `Corridor.drawnAt` prefer the coarse
grid fails the cockpit cross-check.

Nothing already committed moved. `npm run content:sections` and
`npm run content:patches` both re-cut and reported `unchanged`, which is the
point: this guard is invisible until the day it is not.

### What is still the user's

Which grid content is cut from. The choice has a price either way — cutting
from `drawnAt` re-signs every section and patch and makes a committed artefact
depend on which hero areas were published when it was cut, and leaving it means
no authored content may enter a hero area at all, including the gorge the GDD
names. The guard makes the choice arrive when the first piece of content needs
it, and that is all it does.

## F54 — The mirror has been saying where the water is since stage 1, and nothing had read it; one blue cell in twelve is sea

*21 September 2026, on `real-elevation-pipeline`.*

The build plan listed this as *engineering, and it waits on the same
full-country build as D14* — with one clause at the end saying otherwise: *a
per-tile coverage record in the manifest would be the cheap half of it.* That
clause is right and the wait was not. The cheap half needs no download, no
second source and no country build. It needs a file that has been on disk since
the first `make acquire`.

### What Copernicus already told us

GLO-30 publishes a one-degree cell only where there is something to publish.
`acquire.py` has known this since stage 1 — its own docstring says *"Cells
present in the bucket. Ocean-only cells are simply absent"* — and 263 of the
2,232 cells over China are absent for that reason. **Nine of this corridor's
340**, and they are exactly where you would put them by hand:

| Absent from the mirror | |
| --- | --- |
| 25 N 120 E · 26 N 121-122 E · 27 N 122 E | East China Sea, off Zhejiang |
| 32 N 122 E · 33 N 121-122 E · 34 N 121-122 E | Yellow Sea, off Jiangsu |

That is the publisher's own statement about where the water is, and it was
being thrown away at the mosaic. `warp_window` even says so in a comment:
*"The destination is already zeroed, so anywhere the warp does not reach is
sea."* It is not. Most of where the warp does not reach is where nobody asked
it to go.

### Four states, because three of them are not water

`coverage.py` classifies every published tile by the cells under it. A 64 km
tile against 111 km cells straddles them, so the mixed cases get their own
names rather than being folded into the nearest clean one:

| | Tiles | With land | |
| --- | ---: | ---: | --- |
| `d` every cell fetched | 783 | 782 | its zeros are elevations |
| `o` no cell in the mirror | **45** | **0** | open ocean |
| `c` fetched one side, absent the other | 31 | 14 | a shoreline at one degree |
| `e` a cell exists that this build did not fetch | 296 | 127 | nothing may be concluded |

**45 of 45, with nothing tuned to make it so.** The mirror's claim about water
and the heightfield the warp produced agree completely, which is the only
reason the map is allowed to draw blue at all — and `make tiles` now refuses to
publish a world where they disagree, rather than painting a blue rectangle over
a mountain. Proved by claiming one plainly-land tile is ocean: the build stops.

`UNREACHED` beating everything is the ordering that matters. A tile with one
unfetched cell and three absent ones is a tile nothing may be concluded about;
calling it a coast because most of it is missing would be the map painting the
corner of a rectangle blue all over again.

### What the map actually gains

F45's frame, re-measured with the record read. Same 89,088 cells, same 39.2 %
that was one colour:

| | cells | % of frame | % of the blue |
| --- | ---: | ---: | ---: |
| land | 54,150 | 60.8 % | |
| outside the window | 15,168 | 17.0 % | 43.4 % |
| inside it, never fetched | 14,700 | 16.5 % | 42.1 % |
| **open ocean** | **2,880** | **3.2 %** | **8.2 %** |
| coast, still ambiguous | 1,792 | 2.0 % | 5.1 % |
| fetched and reading zero | 398 | 0.4 % | 1.1 % |

F45 said five of every six blue cells were not water and estimated 5,882 of
them were sea "east of Shanghai". The measured answer is **2,880** — the
eyeball was twice as generous as the source. **Eleven blue cells in twelve are
not water**, and the twelfth is now blue for a reason that can be named.

`SEA` is back in `palette.ts` after F45 took it out, and it is drawn for the
`ocean` state and nothing else. `unrecorded` is not `ocean` and must never
become it by default, which is the test that fails when the default slips.
It clears 10 dE from the no-data grey, the panel and every stop of the land
ramp through all four eyes — checked by putting it in `baseSamples`, so every
mark on the map was swept against it without anybody remembering to.

What this does **not** do is draw a coastline. The ocean inside a fetched
raster is a real zero in a real cell, and at 1 km with a `max` reduction the
shore is a land sample anyway. That is `coast`, it is 31 tiles, and it is still
phase 2's water mask.

### And then the record found something that was never about the map

A corridor window is the bounding rectangle of a *curved* quadrilateral, so its
edges are published tiles, inside the window, partly made of samples no raster
ever reached. `covers()` says yes. `groundAt` says 0 m. A route across one is
flown over sea level and clears everything above it — F44's failure a stage
earlier, and this is the first time anything could see it.

Flown out to the window's north-west corner: **209 stations reading 0 m from
km 2,302**, on a route whose ground rises to 5,284 m. Nothing before this could
tell those zeros from the genuine sea-level zeros at km 66 outside Shanghai,
and a section would have been cut and signed with both in it.

**Neither half of the test is enough and that is measured, not argued.** The
tile record is 64 km and says a tile is *partly* unfetched — on that route
1,166 of 1,167 stations over such tiles are over real ground, so a tile-level
refusal is 1,166 false positives. The elevation alone cannot say either,
because zero is a real elevation for most of the eastern third of this
corridor. Together: a zero inside a tile the source only partly reached.
Removing either half fails a different test — the first stops the guard finding
the hole, the second makes it refuse every route that starts at the coast.

`cutSection` and `cutPatch` refuse it, which is not the decision F53 left open:
there is no open question about whether ground nobody fetched is ground.

### What it cost

**746 TypeScript tests in 62 files, up from 729**, 704 of them with
`dist-world/` moved aside; **152 Python tests, up from 139**. The world's
elevation is untouched — `sea-to-sky-1km.tif` rebuilt byte-for-byte identical
through a full `make grid`, and `heights.bin` still hashes to
`ec5a5e1b83247978…` — so nothing a committed section is signed against moved,
and the section and the patch both re-cut `unchanged`.

One thing the manifest had been publishing since the first corridor and the
engine's type had never declared: `heights.tilesWithLand`. It is in the type
now, which is how the 232 blank tiles could be checked against the four states
adding up to them.

## F55 — The gorge the aeroplane cannot turn inside was measured 71 km from the gorge, on the grid that fills gorges in, by a script that is not in the repository — and the other gorge can be threaded

*21 September 2026, on `real-elevation-pipeline`.*

The build plan's *the gorge is narrower than the aeroplane's own turn* is the
user's decision, and it has been carrying one clause nobody could act on: *a
second candidate exists since F52 — the Three Gorges are cut and their water
is a reservoir rather than a river, which is a different channel entirely; how
wide, against the same full-bank reversal, is unmeasured.*

It is measured now, and measuring it found that the first candidate's number
was wrong three ways over.

### What F43 compared, and which half of it survives

F43 put two numbers beside each other. The aeroplane's full-bank reversal at
`low` — 5.1 km across the ground settled, 6.1 arriving from cruise — and a
channel "1.3 to 8.0 km wide and 1.8 km at its middle".

The first is the flight model's own and has had a test since F38. It
reproduces to the decimal today: at 2,607 m, `reversalWidthM(alt, "low")` is
5.13 km, which is F43's 5.1.

The second was measured along an axis through **26.87 N, 100.75 E**. F49 then
measured that coordinate as **71 km from Tiger Leaping Gorge** — a highland
with 1,642 m of relief against the gorge's 3,823. It was measured on the
**1 km country grid**, which F50 and F52 then showed raises a gorge floor by
six hundred metres and cuts four to nine hundred off its walls. And the script
that produced it is not in this repository: the table could be read and never
re-run, which is why the only reason it was ever checked is that two other
findings happened to walk past it.

Three faults, one number, and the number is the one the decision rests on.

### What replaces it, and why it is not a width

A cross-section width needs an axis somebody has to draw, and F48 has already
said what a hand-drawn axis is worth — a chord across country is not a
centreline. So the measurement is geometric instead, and needs no axis at all:

> A full-bank reversal needs a level disc of its own diameter with no ground
> in it. At flight altitude `A`, what is the diameter of the largest such disc
> that the aeroplane's own position lies inside?

In a straight channel that *is* the channel's width, which is what makes it
comparable to F43's table; at a bend or a confluence it correctly finds the
extra room a cross-section cannot see. "With no ground in it" is the game's
rule rather than an aviator's: `flight.ts` bounces the aeroplane at
`BOUNCE_CLEARANCE_M` above the ground, so a cell is in the way when
`ground + 25 >= A`.

The disc must **contain** the aeroplane, because *threading a gorge* means
turning round in the gorge. The largest disc anywhere in the reachable air is
a different and much larger number: four hundred metres over the reservoir it
is 4.90 km against 1.45, and it sits in open country forty kilometres away.

Underneath it is an exact squared Euclidean distance transform —
Felzenszwalb and Huttenlocher's separable lower envelope, O(cells) — rather
than the obvious two-pass chamfer, which is a few per cent wrong on the
diagonal and at 90 m cells that is tens of metres of gorge. The first version
seeded its parabolas with `Infinity`; the envelope subtracts two of those, and
`Infinity − Infinity` is `NaN`, which does not throw and reported a whole area
as clear air — 33 km of turning room a hundred metres above the Yangtze. The
test that fails without the finite stand-in is in the suite.

### The subjects are not a list in the tool

A hero area is cut to hold named places (`hero.py`'s `holds`), and the
corridor manifest carries every place the world was built with. So the tool
measures *every named place the 90 m grid covers*, and publishing an area over
a place measures it. There is no second table to keep in step, which is the
fault D46 was written about.

That also means the control arrives for free. `shigu` is a broad valley on the
same river 41 km above Tiger Leaping Gorge, and it is in the report because
the gorge's own rectangle reaches it rather than because anybody chose a
control.

| place | 90 m ground | 1 km grid | wall within 1 km | within 4 km |
| --- | ---: | ---: | ---: | ---: |
| `qutang-gorge` | 158 m | 462 m (+304) | +837 m | +1,247 m |
| `wu-gorge` | 160 m | 433 m (+273) | +964 m | +1,358 m |
| `xiling-gorge` | 158 m | 419 m (+261) | +702 m | +1,397 m |
| `tiger-leaping-gorge` | 1,807 m | 2,197 m (+390) | +900 m | +2,869 m |
| `shigu` (the control) | 1,819 m | 1,852 m (+34) | +182 m | +1,136 m |

The 90 m column corroborates two things measured elsewhere and not tuned to
each other: the reservoir reads 158–160 m where the source runs it at 156–158
(F52), and Tiger Leaping Gorge reads 1,807 m, which is the number
`docs/probe-report-hero.md` prints for it.

### Room to turn round

| place | +100 m | +200 m | +400 m | +800 m | +1,600 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| `qutang-gorge` | 0.80 km | 1.02 km | 1.45 km | 2.42 km | 28.44+ km |
| `wu-gorge` | 0.74 km | 0.97 km | 1.61 km | 4.45 km | 26.24 km |
| `xiling-gorge` | 0.90 km | 1.15 km | 1.80 km | 5.25 km | 31.65 km |
| **`tiger-leaping-gorge`** | **0.36 km** | 0.65 km | 1.15 km | 2.35 km | 5.47 km |
| `shigu` (the control) | 1.71 km | 2.20 km | 3.14 km | 5.37 km | 26.63 km |

The reversal at `low` over this range is 4.02 to 5.60 km, widening with
altitude because true airspeed does. A `+` means the hero area's own edge
stopped the disc and the number is a floor — beyond an area there is no 90 m
ground, and ground nobody has is not ground known to be clear.

**Tiger Leaping Gorge is three hundred and sixty metres wide** where the
aeroplane would fly it, not 1.3 km and not 1.8. The control reads 4.8× that at
the same height, which is what a control is for.

### The lowest height at which the turn fits

Climbed in 25 m steps. Both sides of the comparison move: the gorge opens and
the air thins, so the turn widens as the room does.

| place | `low`, settled | against the wall |
| --- | ---: | --- |
| `wu-gorge` | **+800 m** | **164 m below the near rim** |
| `xiling-gorge` | +750 m | 48 m above the near rim, 647 m below the far one |
| `qutang-gorge` | +950 m | 113 m above the near rim, 297 m below the far one |
| `tiger-leaping-gorge` | **+1,625 m** | **725 m above the near rim** |
| `shigu` (the control) | +775 m | 593 m above the near rim |

And `approach` — the mode F43 called "the only mode narrow enough", which D26
deliberately keeps out of `SPEED_MODES` — fits at +550 m at Wu Gorge and at
**+900 m at Tiger Leaping Gorge, which is exactly its near rim.** So F43's one
escape route does not fit inside the gorge it was proposed for either. That
conclusion is F43's, reached at the right coordinate and made worse by it.

**The ordering of the two candidates reverses.** Tiger Leaping Gorge is the
one the GDD's challenge is named for and the one this repository has always
reached for; it cannot be threaded at any authorable speed. The Three Gorges
— cut by F52 for a different reason entirely, and 190 km long — can be: at
Wu Gorge the aeroplane can reverse at `low` eight hundred metres over the
water with a wall still standing 164 m above it, and from cruise at +825 m
with 139 m of wall. That is a gorge run flown inside a gorge.

> **Corrected, 22 September 2026.** Tiger Leaping Gorge is not "the one the
> GDD's challenge is named for": the GDD names no gorge for the challenge, and
> the one it names for threading at all is Qutang, in Expedition 5. And
> "cannot be threaded" holds for the reading measured here — turning round
> inside the gorge. Flown *through* at `low`, it is threaded at 1,985 m, 722 m
> under its near rim, and the whole Three Gorges reach is threaded fifty
> metres over the water. The narrowest place on that reach is 0.36 km, at the
> head of Qutang rather than at any of the three points above. See F57.

### The two directions of the grid disagreement are dangerous for different checks

F53 measured the 90 m and 1 km grids against each other and named the
dangerous direction: the fine grid standing *above* the coarse one is a
clearance check passing over terrain the aeroplane meets. This measurement
runs into the other direction, and it is dangerous too.

| at +800 m | 90 m room | 1 km room |
| --- | ---: | ---: |
| `wu-gorge` | 4.45 km | **11.68 km** |
| `xiling-gorge` | 5.25 km | 6.05 km |
| `tiger-leaping-gorge` | 2.35 km | 2.17 km |

The coarse grid shaves ridges (F51: 390 m below the fine grid's), so above the
valley floor it reports **2.6× the room that is there**. Coarse-above-fine
flies safe for clearance and generous for turning; fine-above-coarse is the
reverse. One disagreement, two checks, opposite signs — which is the argument
for the rule F53 arrived at rather than for either grid.

And below the rim the coarse grid has no gorge at all. **A hundred and two
hundred metres over the Three Gorges it reports zero room**, because at 258 m
the aeroplane is two hundred metres inside the hill that grid draws where the
reservoir is. Measuring a gorge on the country grid answers a question about
resampling.

### What this does not say, and what it does not change

It does not say what a whole reach does. These are five sited points; a course
is flown between them and the narrowest place on the water binds. Finding that
wants the channel centreline stage 3 would bring (D45, F48), and a chord
between two of these is not it.

Nor is the disc a circle between two walls. At Wu Gorge it is 4.45 km across
while the wall a kilometre away stands 964 m over the water, so the turn is
using the reservoir where it opens out — F52's own note says that reach is
47.7 km of narrows "in two runs either side of a 5 km opening". The rim
figures are the highest ground within 1 km and within 4 km, which is what
`siting.py` reports and not a claim about the whole circle. What the number
says exactly is what it says: a level circle of that diameter, with no ground
in it, that the aeroplane is inside.

It changes nothing that is built and gates nothing. A gorge challenge is not
authorable today whatever these numbers say — a patch is cut from the 1 km
grid and `cutPatch` refuses to write one over a hero area (D52, F53) — and
which of the flight model, the speed modes and the challenge moves stays the
user's decision. What it changes is that the decision now has both candidates
priced, and the number it was resting on was wrong.

### What it cost

**761 TypeScript tests in 63 files, up from 746**, 714 of them with
`dist-world/` moved aside — ten of the fifteen are the arithmetic over
synthetic ground and need no world, which is deliberate: a straight channel of
a known width is the one case where the answer is knowable without measuring
anything, and it is the case that catches the transform seeded with `Infinity`.

`tools/gorge.ts` is the measurement and `tools/gorgeReport.ts` writes
`docs/gorge-report.md`; `npm run content:gorges`, `make gorges`, last in
`make world` beside `ground`. Nothing in the pipeline moved and no artefact
was re-cut: this reads the world that is built and writes a report. The one
edit outside the new files is a comment in `test/sim/reversal.test.ts` that
repeated F43's "roughly 2 km between its walls".

## F56 — The lake half of stage 3 was already true, the river half is worse than anybody had measured, and the centreline the probe has been missing was in the grid the whole time

*21 September 2026, on `real-elevation-pipeline`.*

Stage 3 is the one unbuilt stage between two built ones, and the build plan
has it blocked on a fetch nobody has made: HydroSHEDS for the centrelines,
plus a named-lake elevation table. That is true of the *carve*. It is not true
of everything the stage claims, and the way to find out which parts is to take
the three bullets one at a time against the corridor that is already on disk.

One of the three turns out to be done. One turns out to be much larger than
the number standing in for it. And the thing the plan says only a download can
provide — a centreline — was derivable from the grid in fifteen seconds.

### Flatten named lakes: the source is not noisy, it is exactly flat

> *Flatten named lakes to a table of real surface elevations (Qinghai 3,196 m,
> Namtso 4,718 m, Poyang 13 m, …) rather than to the DEM minimum, which is
> noisy.*

The premise is checkable and it is wrong for this source. Eight lakes inside
the Sea to Sky corridor, grown cell by cell from an anchor with a **purely
local** rule — a neighbour joins if it is within 0.05 m of the cell it joins
from, so nothing bounds how far the far shore is allowed to drift:

| lake | km² | level | span | std dev | distinct values |
| --- | ---: | ---: | ---: | ---: | ---: |
| Namtso | 1,808 | 4,725.50 m | 0.00 m | 0.000 | **1** |
| Tai | 1,773 | 0.50 m | 0.00 m | 0.000 | **1** |
| Siling Co | 1,214 | 4,544.50 m | 0.00 m | 0.000 | **1** |
| Poyang | 1,204 | 11.50 m | 0.04 m | 0.001 | 2 |
| Hongze | 904 | 8.50 m | 0.06 m | 0.005 | 14 |
| Chao | 669 | 6.50 m | 0.00 m | 0.000 | **1** |
| Ngoring Hu | 457 | 4,272.00 m | 0.00 m | 0.000 | **1** |
| Gyaring Hu | 436 | 4,292.00 m | 0.00 m | 0.000 | **1** |

Six of the eight are **a single float32 value across their whole surface**.
Namtso is 1,808 km² of water and one number. Copernicus flattens water bodies
in production, and stage 2 preserves it exactly, for a reason worth stating
because it is not luck: the reduction is mean plus 0.25 of (max − mean), and
over a flat surface max *is* mean, so the bias adds nothing. Measured over
Namtso and Poyang, the bias adds a median of **0.00 m on the water** and never
more than 0.49 m.

So the Qinghai Lake golden probe's flatness half — *flat across the polygon,
±2 m, std dev < 1 m* — passes on every lake in this corridor **before any
conditioning at all**, and would have passed on the day stage 2 first ran.

What the bias does touch is the shore. The first ring of cells outside the
water, at the two lakes re-warped twice to separate the two:

| | rim cells | median lift | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| Namtso, a plain mean | 252 | 1.78 m | 15.07 m | 74.53 m |
| Namtso, as built at 0.25 | 252 | **5.25 m** | 36.76 m | 127.22 m |
| Poyang, a plain mean | 542 | 0.46 m | 8.33 m | 61.69 m |
| Poyang, as built at 0.25 | 542 | **3.44 m** | 21.18 m | 94.10 m |

The bias roughly triples the lip at the median. That is the bias doing its job
— a shore cell is half hillside and the silhouette bias exists to keep
hillsides — and it is worth knowing rather than fixing.

**What a lake table would actually do is move the level**, and the numbers it
would move it to are the ones this repository has learned twice not to trust.
The plan's table says Namtso 4,718 m; the source says **4,725.50**, flat to the
bit over 1,808 km². It says Poyang 13 m; the source says **11.50**, and
Poyang's surface swings by many metres between seasons, so 13 is not a constant
of nature to correct a measurement with. Overwriting a measured, internally
consistent, exactly flat surface with a remembered figure is the same move as
`tiger-leaping-gorge` at 26.87 N (F49) and its replacement 1,260 m up the wall
(F50), in an elevation instead of a coordinate. **The lake table's job is to
check the source and to name where it disagrees, not to overwrite it.**

### An eighth of the corridor has nowhere for water to go

The second bullet is monotonic descent, and until now the only number under it
was a chord of seven waypoints. A priority-flood answers the whole-grid
question directly: fill every pit to the lowest saddle it can escape over, and
`filled − ground` is how deep the water stands where it cannot leave.

| | sea-to-sky, 1 km |
| --- | ---: |
| Cells with no outlet | 598,780 of 4,735,745 — **12.64 %** |
| Separate closed basins | 74,019 |
| …of 10 km² or more | 5,407 |
| Water to fill them | 30,120 km³ |
| Deepest | 918.8 m |

The connectivity is not a detail and is worth one line of its own. At four
neighbours the same grid reads **19.51 %** in 161,964 basins, because a channel
running diagonally through a single cell has no four-connected path at all.
Two thirds of the difference between those two numbers is the arithmetic and
not the world, which is why flow routing is D8 everywhere it is done seriously
and why this is.

The largest basin is the one that matters to this game:

| km² | deepest | mean | floor | at |
| ---: | ---: | ---: | ---: | --- |
| **98,062** | 340.9 m | 113.5 m | **157.5 m** | 29.891 N, 107.735 E |
| 27,567 | 17.6 m | 4.9 m | 13.5 m | 30.053 N, 115.252 E |
| 8,207 | 163.2 m | 60.1 m | 3,354.0 m | 34.217 N, 101.476 E |

Ninety-eight thousand square kilometres with its floor at 157.5 m is the middle
Yangtze and the Sichuan Basin above it, **sealed**. At 1 km the river's way out
through the Three Gorges is not resolved, so nothing upstream of it drains to
anywhere. The floor is the reservoir's own level, which `siting.py` measured
independently at 158 m (F52). Expedition 1 flies the length of it.

And the number that stops this being a to-do list: **a closed basin is not by
itself a fault.** Namtso is 2,545 km² of closed basin 36.3 m deep in this
table, and Namtso is endorheic in life — nothing drains out of it. A
resampling artefact and a real closed basin are identical from inside the
grid. Telling them apart is precisely what a mapped river network is for, so
the 12.64 % is **the price of the stage** and not a bug list. Nothing here is
carved, and filling everything would drain the plateau.

### The centreline was in the grid

The third bullet is where the surprise is. The plan says the centreline comes
from HydroSHEDS. But HydroSHEDS was itself derived from SRTM this way, and a
mosaicked grid is already a complete statement about where water would run.

Priority-flood does the work twice over if one array is kept. The flood grows
outward from the map edge in order of water level, so the cell a given cell is
*first reached from* is a valid receiver — never higher, and on a path to the
edge. Recording that parent turns the fill into a drainage tree in the same
pass. Sum the tree and you have catchment area; walk up it always taking the
larger catchment and you have the grid's largest river. Fifteen seconds over
4.7 million cells, and no fetch.

**Is it the Yangtze?** Nothing in that arithmetic knows what a Yangtze is, so
the answer has to come from outside it. Nine places this repository already
ships — five measured onto the water off the source's own 30 m (F50, F52), four
city centres — against the derived stem:

| km upstream | place | on channel | km to stem | place reads | stem reads |
| ---: | --- | :---: | ---: | ---: | ---: |
| 0 | `shanghai` | — | 115.2 | 9.8 m | 1.3 m |
| 954 | `wuhan` | — | 18.5 | 19.0 m | 29.2 m |
| 1,370 | `yichang` | — | 1.0 | 72.5 m | 58.9 m |
| 1,445 | `xiling-gorge` | yes | **0.5** | 355.2 m | 237.3 m |
| 1,541 | `wu-gorge` | yes | **0.2** | 258.4 m | 283.3 m |
| 1,581 | `qutang-gorge` | yes | **0.4** | 525.9 m | 364.9 m |
| 1,986 | `chongqing` | — | 2.3 | 223.1 m | 250.3 m |
| 3,479 | `tiger-leaping-gorge` | yes | **0.7** | 2,144.4 m | 2,144.4 m |
| 3,524 | `shigu` | yes | 2.1 | 1,826.0 m | 1,987.0 m |

Four of the five channel places inside a kilometre and a half, and **all nine
in order, coast first**. The three gorges arrive 96 km and 40 km apart in the
order `siting.py` sited them. It is the Yangtze.

`shigu` is the one miss, at 2.1 km and 161 m above the place, and it is the
best line in the table. Shigu is where the Jinsha climbs 221 m in the 41 km
below it at 1 km resolution — the failure F49 and F50 measured, and the reason
the seventh golden probe had to move to the 90 m hero grid to pass at all. **The
one place the derived channel loses the river is the one place the river is
already known to be lost.** A channel derived from heights is only as good as
the heights, and here it fails exactly where they do.

### What the chord could not see

Now the two can be put side by side. Same grid, same run, and the chord read
through `GridSampler.walk` with the probe's own 2 km channel search rather than
through anything written for this:

| | the chord, as written | the chord at 1 km | the centreline |
| --- | ---: | ---: | ---: |
| Samples | 7 | 3,364 | 4,233 |
| Length | 3,363 km | 3,363 km | **5,335 km** |
| Steps that climb going downstream | 0 | 954 (28.4 %) | **1,980 (46.8 %)** |
| Total ascent | 0 m | 55,649 m | **90,841 m** |
| Worst single step | — | 548.1 m | 394.1 m |
| Channel search needed | 2 km | 2 km | **none** |
| Verdict | pass | *not evidence* | would fail |

F48 established that the middle column is a trap: a straight reach from Tiger
Leaping Gorge to Chongqing crosses mountains the Yangtze goes around, so
walking it finely measures the shortcut and not the river. That objection does
not reach the right-hand column, where every cell is on the grid's own channel.
**1,980 uphill kilometres in a river with 5,077 m of net fall** — the gross
ascent is 1,789 % of the drop — and **3,963 of the centreline's 4,233 cells,
93.6 %, stand under a closed basin's water**, the deepest by 419.1 m. That is
the GDD's *"rivers are carved, not painted"* costed out.

Two smaller things fall out of the same table.

The middle column is F48's own measurement recomputed rather than quoted, and
it does not reproduce: F48 read 3,382 samples, 942 climbs and 56,988 m. The
whole of the difference is one waypoint. `tiger-leaping-gorge` was still 71 km
from the gorge when F48 ran, and F49 and F50 moved it. Put that coordinate back
and this code reproduces F48 **to the metre** — 3,382, 942, 56,988 m — which is
worth more than agreement would have been, because it dates the drift.

And the `channel search needed` row is the quiet one. The 2 km search exists
because a 1 km cell straddling a gorge reports the wall as readily as the
water; `sample.channel_m` has always called it a measurement aid and named
stage 3's centreline as what replaces it. It is a **proxy for a centreline**,
and this is the first measurement in the repository able to put the proxy
beside the thing it stands in for. The centreline needs none of it.

### Inside a flat, the tie-break draws the channel

One implementation decision earned a test of its own, because the first
version of it was quietly wrong.

Every cell inside a filled basin has the same water level, so the comparison
that orders them is the tie-break — and the tie-break is therefore what draws
the channel across a flat. Breaking on the cell's index makes the flood scan;
breaking on arrival order makes it cross as a breadth-first wave from the point
it entered, which is the shortest way over. The fills are **bit-identical**
either way. The channels are not:

| | arrival order | cell index |
| --- | ---: | ---: |
| Derived stem passes `chongqing` | **2.3 km** | 28.2 km |
| Derived stem's own mouth, from Shanghai | **34.3 km** | 115.2 km |
| Derived stem, cells | 4,233 | 5,511 |
| Uphill steps | 1,980 | 2,646 |

Both are correct fills and only one of the two trees is a river. The invariant
is testable without any of that: on a flat plateau walled in but for one entry,
a cell's depth in the drainage tree must equal its Chebyshev distance from the
entry. Arrival order gives exactly that — worst excess **0** hops over an 11 × 11
plateau — and cell index gives a worst excess of 2 and a deepest path of 11 hops
where the wave gives 9.

### What this does not do, and what still needs the fetch

It does not carve. Nothing in the world moved: `make hydro` reads the grid that
is built and writes `docs/hydro-report.md`, and `make world` runs it after the
probes. The Yangtze golden probe keeps `stride_km = None` and its
seven-waypoint chord, because a probe that fails 1,980 times on purpose is not
a gate — the centreline is evidence *for* stage 3 and cannot stand in for it.

What still needs HydroSHEDS is the half this cannot reach: which of 74,019
closed basins is a clipped meander and which is a lake that has never had an
outlet. That is external knowledge and the report says so where it would
otherwise be tempting to guess. What has changed is that the fetch now has a
price list in front of it instead of a sentence.

### What it cost

**175 Python tests, up from 152** — 23 new, all of them on grids small enough
to know the answer to by hand, which is the point: the corridor measurement is
4.7 million cells and unverifiable by eye. Three of the twenty-three failed
first and all three were the fixture rather than the code: a spillway that did
not reach the edge, a "diagonal escape" that ran uphill over its own sill, and
an off-by-one in the breadth-first invariant.

`pipeline/nineskies/hydro.py` is the module and `docs/hydro-report.md` the
report; `make hydro`, and in `make world` after `probes`. The 761 TypeScript
tests are untouched — nothing in the engine, the content or the manifest moved,
and no artefact was re-cut. The one number this finding leaves behind for
somebody else is the run cost: 13 s over the corridor's 4.7 M cells, which at
the full country's 29.7 M is the first thing here that will want a second look
in phase 2.

## F57 — Both gorges can be flown through at `low`, which is how the GDD writes *thread*, and neither can be turned round in; the Three Gorges pass is bound by a bend rather than by the narrowest place, and the 90 m grid dams the Jinsha between the seventh probe's two points

*22 September 2026, on `real-elevation-pipeline`.*

F55 measured the room to turn round at the five places the two hero areas
were cut to hold, and ended on what it could not reach: *a course is flown
between them, and the narrowest place on the water is what binds; finding it
wants the channel centreline stage 3 would bring.* F56 then showed that a
centreline does not have to be downloaded. So this walks one, through each
area, on the 90 m ground the game draws.

The narrowest place is found, and it is where F55 expected it to matter
least: at the head of Qutang Gorge, half the width of any of the three sited
points. But walking the course asked a question the turning room cannot
answer. The GDD's word is *thread*, and a thread is passed through, not turned
round in. Measured that way, **both gorges can be threaded at `low` today**:
the whole Three Gorges reach, 164 km of it, is flown 50 m over the water in
three and a half minutes, and Tiger Leaping Gorge is flown under walls standing
seven hundred metres above the aeroplane. Neither can be turned round in below
the rim, anywhere on either course, except at the one reach of Wu Gorge F55
already found.

### What the GDD asks, in its own words

Three sentences in the design say what a gorge is for, and none of them is
about turning round:

- the challenge list: *thread a gorge at low speed*;
- Expedition 5, *Yichang → the gorges → Chongqing, low and slow*, whose
  challenge column reads **"Threading Qutang Gorge at low altitude"**;
- and the speed modes: low speed *"is for a few minutes in a gorge, not for
  crossing anything."*

F43 read *thread* as the aircraft manoeuvred inside a channel against a
full-bank reversal, and F55 measured that reading and kept it: *it has to
contain the aeroplane because threading means turning round in the gorge*
(D54). That is one reading. The plainer one — the one a needle is threaded by
— is a pass, and a pass needs no reversal. It needs the aeroplane to follow the
channel's bends with the turn it has. Neither reading is this finding's to
choose; both are now priced.

**F55 also said Tiger Leaping Gorge is "the one the GDD's challenge is named
for". It is not.** The GDD names no gorge for the challenge, and the one gorge
it names for threading at all is Qutang. Tiger Leaping Gorge is a landmark and
a hero area, and it is the gorge this repository reached for from F43 on.
Corrected there and in the test that repeated it.

### The course, from the places and not from a table

`tools/reach.ts`. A hero area is cut to hold named places on a river, so the
river is the lowest ground that joins them, and no table of reaches is kept
anywhere — publishing an area over places on a river measures that river,
which is D46's rule applied once more.

A flood outward from the places, in order of height, reaches the area's edge
first at one crossing; the first edge cell it reaches five kilometres clear of
all of that crossing is the other end, and the lower end is downstream.
Between them the course keeps to the middle of the lowest ground that joins
them — F56's priority-flood, seeded at the outlet alone, because seeded at
every edge cell it would split a flat reservoir between its two ends and drain
half of it upstream.

| Area | Course | Upstream end | Downstream end | Places along it |
| --- | ---: | --- | --- | --- |
| `three-gorges` | 166.1 km | 158 m, west edge | 155 m, east edge | Qutang km 23.4 (69 m off), Wu 60.3 (183 m), Xiling 153.3 (55 m) |
| `tiger-leaping-gorge` | 103.2 km | 1,834 m, west edge | 1,607 m, north edge | Shigu km 31.3 (163 m off), Tiger Leaping Gorge 81.0 (117 m) |

Nobody told it which way either river runs, and both come out right: the
Yangtze west to east through all three gorges in order, the Jinsha down to
Shigu and then north-east through the gorge.

### The narrowest place, which is what F55 wanted

The turning room at every station of the course, level at each height over
the water — the same air the pass below is flown in. The narrowest leaves out a
kilometre at each end, where the area's edge rather than the ground can be what
stops a disc.

| `three-gorges` | Narrowest | Where | Reversal at `low` | Fits over | Under a wall |
| --- | ---: | --- | ---: | ---: | ---: |
| +100 m | **0.36 km** | km 21.2, 2.1 km above `qutang-gorge` | 4.02 km | 0 km | 0 km |
| +200 m | 0.51 km | km 20.9 | 4.06 km | 0 km | 0 km |
| +400 m | 0.97 km | km 81.6, 21.4 km below `wu-gorge` | 4.14 km | 20.5 km | 0 km |
| +800 m | 2.42 km | km 23.2, at `qutang-gorge` | 4.31 km | 151.6 km | 1.6 km |

At a hundred metres over the water the three sited gorges read 0.74 to
0.90 km (F55). The course's narrowest is **0.36 km — half the narrowest of
them** — at the head of Qutang, the gate the gorge is named for, two kilometres
above the point `siting.py` chose because it had the most wall within a
kilometre rather than the least water. And the turn round does not fit
**anywhere on 166 km** at a hundred or two hundred metres. At four hundred it
fits over twenty kilometres, none of them with a wall standing over the
aeroplane; at eight hundred it fits almost everywhere and has a wall above it
for 1.6 km, which is F55's Wu Gorge result seen from the whole reach.

Tiger Leaping Gorge, level over its own sill (below): the turn fits under a
wall over 0.4 km of 103 at +100 m and 0.9 km at +200 and +400, near its lower
end where the valley opens.

### Flying it through

The other reading is answered by flying it. A search over the stick, through
`flight.ts`'s own `step`, at `low`, level: each roll input is held for eight
frames of 1/30 s, bank lags the stick exactly as it does in the game, and
contact is any frame whose ground — the bilinear 90 m surface the game draws —
plus the 25 m bounce reaches the aeroplane. It runs from a kilometre inside one
end of the course to a line across it a kilometre inside the other. *Room
either side* is how far to each side of the track the ground must also stay
clear: the flights the search finds graze the ground, because it asks for
clearance rather than comfort, so this is the number that says how exactly a
pass would have to be flown.

| Area | Level | Flown with | Takes | Under a wall |
| --- | ---: | ---: | ---: | ---: |
| `three-gorges` | 208 m (+50 over the water) | 25 m either side | 3 min 31 s | 99 % |
| `three-gorges` | 258 m (+100) | 50 m either side | 3 min 31 s | 99 % |
| `three-gorges` | 358 m (+200) | 100 m either side | 3 min 32 s | 90 % |
| `tiger-leaping-gorge` | 1,985 m (+50 over the sill) | 0 m | 1 min 58 s | 91 % |
| `tiger-leaping-gorge` | 2,035 m (+100) | 25 m either side | 1 min 58 s | 82 % |
| `tiger-leaping-gorge` | 2,135 m (+200) | 100 m either side | 1 min 58 s | 59 % |

A hundred metres either side is the widest the report asks for. *Under a wall*
is the share of the course with ground within a kilometre standing above the
aeroplane. So the whole Three Gorges reach is threaded fifty metres over the
reservoir with 650–910 m of wall above at the three sited gorges, and in three
and a half minutes, which is the GDD's *"a few minutes in a gorge"* measured
rather than guessed. Tiger Leaping Gorge is threaded at 1,985 m — 178 m over
its water and **722 m under its near rim**. It is the gorge F55 said cannot be
threaded at any speed this game can offer. It cannot be *turned round in*; it
can be flown through.

### What binds a pass is a bend before it is the narrowest place

Widen the room either side one step past the widest flown, and the searches
over the Three Gorges get furthest to the same place at both +50 and +100 m:
**km 69.3–69.5**, nine kilometres below the Wu Gorge anchor. It is not narrow — 0.76 km at +100 m, twice the narrowest. It
is a bend: the course's radius there is 1.3 to 1.5 km over a 1.4 km chord,
against the aeroplane's own steady full-bank turn at `low` of **1.88 km**, so
a pass has to cut across the channel's width to make it. The narrowest place,
at the head of Qutang, sits on a straight of 2.9 km radius, and a pass goes
through it at +100 m with fifty metres either side.

The narrows do bind, later. Asked for a hundred metres either side at +50 m,
the search does not get past **km 20.8** — the head of Qutang — and the same
at 150 m and +100. So F55's *the narrowest place binds* is true of a turn
round, and of a pass flown with a lot of room to spare; for the pass the
numbers above describe, the bend binds first. The two readings of *thread* are
bound by different places on the same river. In Tiger Leaping Gorge they
coincide: the pass stops being found at km 76.8–77.6, which is the narrowest
place, and that is the next section.

### The 90 m grid has dammed the Jinsha

The lowest path between the two ends of the Tiger Leaping Gorge course rises
to **1,935 m at km 77.0**, four kilometres above the gorge's anchor. That is
**116 m over the water at Shigu** and 128 m over it at the gorge: every path
between those two places on this grid crosses it, so no water released at
Shigu reaches the gorge without rising 116 m first. The 90 m cell is wider
than the gorge floor, and a bias of 0.40 averages the walls into it.

The seventh golden probe reads the river at exactly those two places, and it
falls between them — −80 m on the channel, −11 m as a point sample — so it
passes, as F50 recorded. It cannot see the sill for the reason F48 gave about
the Yangtze probe: a probe that reads a river at two points is silent about
what lies between them. The probe report already walks its chord more finely
and prints *would fail* at 25 km spacing, and blames the chord for crossing
country. The chord is not the whole of it. Along the lowest ground there is,
the grid still climbs.

The dam is the grid's and not the gorge's, and that was measured rather than
assumed. On the source's own 30 m, the lowest ground within 300 m of the sill
is **1,780 m — 155 m under it** — and from km 70 to km 85 the 30 m floor beside
the course falls from 1,800 m to 1,705 m, never within 130 m of 1,935. The
Jinsha does not climb there. The 90 m cell straddling it does.

This is also what sets the lowest pass through the gorge. The sill plus the
bounce is **1,960 m**, and no level flight below it joins the two ends of the
course — that one is a proof rather than a search result, because every path
crosses the sill. The 1,985 m pass is 25 m above it. So the lowest pass
through Tiger Leaping Gorge on the ground the game draws is set by a dam the
source does not have, and whatever stage 3 or a finer grid does to that
cell moves it.

> **Corrected, 22 September 2026.** The source has the dam too. Both numbers
> above stand — the lowest 30 m ground within 300 m of the sill is 1,780 m,
> and the floor beside the course falls from 1,800 m to 1,705 m — and neither
> says what it was read as saying. The lowest ground near a sill is the water
> below it as readily as a way through it, which is the window-minimum fault
> F50 found in the probe itself. Asked of a flood instead, every path on the
> source's own cells between the two cells the probe compares crosses
> **1,868 m** at the same place, 52 m over the water at Shigu; the 1,780 m is
> 250 m downstream of it. The 90 m grid raises that dam by 67 m rather than
> making it, and a finer grid lowers it without removing it — 1,909 m at
> 60 m, 1,881 m at 30 m. Only a carve removes it. See F58.

### What a search can say, and what it cannot

A flight the search finds is replayed from its first frame, with nothing from
the search but the stick inputs, before it is printed. So *flown* means the
model flies it, and a test replays one independently to hold that true.

*Not found* is not a proof, and this was measured rather than assumed. The
search keeps one state per 90 m cell, 3° of heading and 7.5° of bank, and in a
channel a few cells wide the state it drops can be the one that fits. At +50 m
over the Three Gorges one search order found **no** flight with nothing either
side and **did** find one with 25 m either side — which is a strictly harder
question. So the search is run in two orders, middle of the channel first and
shortest line first, because each finds flights the other prunes; the ladder
is climbed down from the widest margin, because a flight with room either side
is a flight with less; and *not found* in the report means neither order found
one. How far they got is printed beside it, because the place has held where
the verdict has not: one step past the widest margin flown it is km 69.3–69.5
in the Three Gorges and 76.8–77.6 in Tiger Leaping Gorge, at every level, and
further out it is the head of Qutang.

What the search does promise is that it cannot thread what the flight model
cannot fly. A synthetic channel that turns a right angle in 450 m, against a
turn kilometres across, is searched to exhaustion and not flown; the same
corner with room to swing through it is.

### What went wrong first

Four things, all in how the question was asked rather than in the answer.

**A pilot measures itself.** The first attempt flew the course with a
pursuit autopilot chasing a point ahead on the water. It touched a wall at
every height up to +800 m and every lookahead from 0.5 to 3 km, where the
search then found the same reach flown at +50 — the bank lag makes a pursuit
pilot oscillate, and its verdict was about the pilot. That is why the pass is
a search over the stick and not a controller.

**The edge is not ground.** A run started on the area's edge failed its first
frame, because the room-either-side check reached outside the area, where there
is no 90 m ground. Started instead a kilometre in along the steepest line
towards the outlet, it failed against the bank that line hugs. It starts on the
course now, which keeps to the middle.

**A finish is a line, not a place.** With the finish as the cells within a
kilometre of the outlet, a flight covered 165 of 166 km at +50 m and stalled
0.1 km short, against a target pressed into the area's corner. The finish is a
line across the course now.

**One crossing is not two ends.** The first rule took the ends to be any two
edge cells five kilometres apart, and a synthetic flat meeting the edge along
eight kilometres produced a course running up the edge from one to the other.
The real areas never do this — their crossings are three and eight cells wide
— but a lake at an edge would. The second end is now clear of *all* of the
first crossing, and each end is the middle of its crossing's lowest cells.

### What it changes, and what it does not

It changes the decision, not the build. The build plan's *the gorge is
narrower than the aeroplane's own turn* item had both candidate gorges priced
for a turn round. It now has both priced for a pass as well, and the pass is
available in both: the GDD's own Qutang Gorge, and the gorge F55 wrote off.
Which reading the challenge means is the user's, and so is everything F43 and
F55 listed under it.

Nothing is authorable because of it. A patch is cut from the 1 km grid, and
`cutPatch` refuses to write one over a hero area (D52, F53), so no gorge
challenge — pass or turn — reaches content until *which grid is authored
content cut from* is answered.

The seventh golden probe's report does not yet print the sill between its
waypoints beside its verdict, which is what F48 made the corridor probe do. The
gorge report prints it on every `make world`; the probe report should too.
Recorded, not done here.

### What it cost

**782 TypeScript tests in 64 files, up from 761 in 63** — 21 new, 15 of them
on synthetic ground that needs no world, because a river that falls, a dam
across one, a flat reservoir and a right angle too tight to turn are the cases
whose answers are knowable without measuring anything; 729 pass with
`dist-world/` moved aside. Two of the twenty-one failed first, and both were the
fourth mistake above. A fifth fault was found by reading the code rather than
running it: a crossing that turns the corner the edge is numbered from was split
in two and its middle put on the wrong edge. No real area has one; the test
that holds it fails on the old code, which was checked rather than assumed.

`tools/reach.ts` is the course, the walk and the search; `tools/gorgeReport.ts`
writes all of it into `docs/gorge-report.md` beside F55's table, which is now
titled for both readings. `make gorges` takes **3 min 13 s**, almost all of it
searches, and is the slowest report `make world` runs. Nothing in the pipeline
moved and no artefact was re-cut. The report is the same to the byte across
three runs: the search has no randomness and its budget is counted in states,
not seconds. `tools/gorge.ts` gained one helper, `heroAreas`, so the two tools
read each area onto the same lattice the same way.

## F58 — The seventh probe passes at the two cells it reads and on no path between them, on the grid and on the source it was cut from; five of the Yangtze probe's six reaches are dammed at 1 km; and the hero report had been counting its reads in kilometre cells

*22 September 2026, on `real-elevation-pipeline`.*

F57 left one engineering item: F48 made the corridor probe print what its
pass covers, and the seventh probe's report should print the sill between
its two waypoints beside its *pass*. It does now, and so does the sixth
probe's. Doing it corrected F57 about whose dam the Jinsha's is, and it
found a coverage figure in the same report that was 88 times too small.

### What a pass between two waypoints covers

A monotonic check compares one cell near each waypoint — the lowest in a
2 km window — and passes if each is no higher than the last. Between two such
cells the ground has a **sill**: the highest ground on the lowest path that
joins them. Every path between the two crosses it: the river's, a chord's,
any other. So a sill above the upstream cell proves that **nothing between
the two cells runs downhill**, however finely it is walked. That is the
hydrology result F48's chord walk said it could not be, because a chord
crosses country the river goes around. A sill does not depend on the chord.
It also bounds paths across the bilinear surface between cell centres, not
only paths along the cells. A point of that surface is a weighted mean of
four cells that all touch each other, so ground below a level anywhere on
the surface means a cell below it beside that point.

The sill is F56's priority-flood started from one cell instead of from the
map edge. It stops at the other cell, since a cell's level is final the
first time the flood reaches it. Neighbours and tie-breaks are the same as
F56's. The one difference is that NaN is a wall. Left to compare, NaN would be
crossed at whatever level the water already stood at.

### The seventh probe

| Reach | Read on | Compared | Sill | Over the upstream cell | Where the sill is |
| --- | --- | ---: | ---: | ---: | --- |
| `shigu` → `tiger-leaping-gorge` | the hero grid, 90 m | 1,816 m → 1,736 m | 1,935 m | 119 m | 27.1825 N, 100.1055 E, 3.7 km from the gorge |
| | the source, 1″ | 1,816 m → 1,724 m | 1,868 m | 52 m | 27.1825 N, 100.1050 E, 3.7 km from the gorge |

The probe passes, and it should: it compares two cells and they fall, by
80 m. What a reader can learn from that pass about the river between them is
nothing. On the ground the game draws, every path from the cell it reads at
Shigu to the cell it reads in the gorge climbs 119 m first. That is F57's
sill measured from the probe's own cells. F57's figure was 116 m because it
was measured against the course station nearest Shigu, at 1,819 m, not
against the lowest cell in Shigu's window, at 1,816 m.

### The source has it too, and F57 said it did not

F57 called the dam *the grid's and not the gorge's* on two numbers. The
lowest 30 m ground within 300 m of the sill is 1,780 m, and the 30 m floor
beside the course falls from 1,800 m to 1,705 m. Both numbers are right.
Neither shows a way through, because the lowest ground near a sill is the
water below it as readily as a path past it. That is the fault F50 found in
the probe: a window's minimum finds the water from anywhere, including from
the wrong side of a dam. The 1,780 m cell is 248 m from the source's own sill,
on the far side of it, and reaching it from Shigu means crossing 1,868 m.
The same flood, run on the source's own cells, gives the table's second row.
Its sill is 47 m from the grid's.

At 30 m the head of the gorge is a V-shaped trough. Its floor along the
lowest path rises from 1,817 m to 1,868 m and falls to 1,780 m. For about
4 km — 136 cells — that path stands more than 10 m over the water at Shigu.
The Jinsha does not climb there. Copernicus GLO-30 is a radar surface model,
not a hydrologically conditioned one. Nothing in it promises that a river
runs downhill, and here it does not see the water. That is F52's finding about Wulingyuan's pillars from the other side: the
source does not resolve the feature.

So the grid did not make the dam; it raised it. Re-cut at other cells and
biases from the same source, the sill falls toward the source's own 1,868 m
and never goes away:

| Cell | Bias 0 | Bias 0.4, as shipped |
| --- | ---: | ---: |
| 90 m | 1,908 m (+92) | 1,935 m (+119) |
| 60 m | 1,888 m (+72) | 1,909 m (+93) |
| 30 m | 1,875 m (+59) | 1,881 m (+65) |

The 90 m, 0.4 row reproduces the built grid to the decimetre, which is the
check that the re-cut is the build's. Two things follow. First, the lowest
pass through Tiger Leaping Gorge is set by a dam the source has as well,
and the 60 m grid F50 priced would lower that dam by 25 m without removing
it. Second, *the Jinsha between Shigu and the gorge runs downhill* is not
true of any grid made from this source, including the source itself. It
needs stage 3's carve. That is F48's conclusion about the Yangtze probe,
reached one river over and two grids finer.

### Five of the Yangtze probe's six reaches are dammed at 1 km

The sixth probe uses the same report code, so it prints the same table.
Nothing here is new about the world; F52 and F56 already measured the
filled reservoir and the closed basins. What is new is that the probe now
says it, next to its own pass:

| Reach | Compared | Sill | Over the upstream cell | Where the sill is |
| --- | ---: | ---: | ---: | --- |
| headwaters → upper Jinsha | 5,722 m → 3,507 m | 5,722 m | 0 m | the upstream cell itself |
| upper Jinsha → `tiger-leaping-gorge` | 3,507 m → 2,011 m | 3,524 m | 18 m | 6.0 km from the upper Jinsha waypoint |
| `tiger-leaping-gorge` → `chongqing` | 2,011 m → 211 m | 2,186 m | 175 m | 6.0 km from the gorge |
| `chongqing` → `yichang` | 211 m → 49 m | 498 m | 287 m | 10.1 km from `wu-gorge` |
| `yichang` → `wuhan` | 49 m → 18 m | 76 m | 27 m | 16.9 km below Yichang |
| `wuhan` → `shanghai` | 18 m → 7 m | 31 m | 13 m | 29.96 N, 115.39 E |

The Three Gorges reach is the largest. On the 1 km grid, every path from
Chongqing's cell to Yichang's climbs to 498 m, 10 km from Wu Gorge. That is
F52's reservoir, which reads 80–140 m too high at 1 km, seen as a dam. The
first reach's sill is its own upstream cell, the headwater cell the probe
starts on, at 5,722 m. That rules a dam out and says nothing more: a path that never stands
above its start can still fall and rise on the way.

### The hero report counted its reads in kilometre cells

*What this verdict covers* told the hero report's reader that the check
reads **50 cells of 394,497**. It reads 4,418. The line converted the
channel search's 2 km into cells using `grid.RESOLUTION_M`, the frozen 1,000
that F50 removed from the sampler, and on the 1 km grid it happens to be
right (5 × 5 × 7 = 175). It survived F50 because it was a count kept beside
the search, not one taken from it. It is F46's `inlandKm` and F50's search
radius once more: a unit that is right by coincidence on the one artefact
anyone had looked at. The count now comes from the windows the search
reads. There is one definition of the window, and every window read in the
sampler uses it.

### What was tried and is not in the report

**Whether any path runs downhill at all** would seem to be the exact
question, and a breadth-first search over steps that never rise answers it
cheaply. It answers *no* before it starts. Each cell the check compares is
the lowest in its window. From five of the seven upstream cells, across
both grids, there is not even a first step, and from the other two the
search stops within 37 cells. The probe's own cells are pits by
construction.

**The least total climb of any path** is the other exact measure: the path
that climbs least, and how much it climbs in all. Measured once: on the hero
grid, 403 m in 69 rises, the largest 44 m; on the source, 259 m in 92 rises,
the largest 15.5 m. So the sill is not the only obstruction, and a carve has
to enforce descent along the whole reach rather than breach one dam. It is
not printed. At 1 km it costs about 40 s, against 5.7 s for the whole
gate. It also
counts every rise the size of the surface model's noise, so on the source it
measures roughness as much as dams. The sill is the proof, and the least
climb is only a size.

### What it changes

No verdict. Both probes pass, both are printed beside their sills, and the
sentence under each result says how many of its reaches are dammed. Should a
river probe check the sill rather than two cells? That is a question about
what a golden probe is for, so it is the user's. Priced: today the seventh
would fail on every grid in the build and on its own source, and the sixth
on five of six reaches. Nothing short of stage 3 passes either one. Until
then the sill is printed and not checked, which is what F48 did with the
chord walk.

The rule, as a decision (D59): whether water, or ground below a level,
joins two places is asked of a flood, never of the lowest ground near them.
The source a grid is checked against is read on its own cells, never
warped, since a warp is the resampling under test.

### What it cost

**206 Python tests, up from 175.** The 31 new tests are:

- 11 on the sill, including a check against the definition itself — the
  lowest level at which the two cells are joined, found by trying every
  level — on forty irregular grids.
- 19 on real synthetic rasters for the sampler's windows, the source read
  and the report, written to a temporary directory rather than faked,
  because the arithmetic between a file and a report is what is under test.
- One more on the fake raster in `test_probes.py`, where a probe half on an
  artefact now prints *not on this artefact* for its reach instead of
  measuring from nowhere.

The fake had to learn the new surface to keep the half-on test running.

`hydro.py` gained `sill` and `sills`. `sample.py` gained one window
definition, the cell `channel_m` reads, a count of the cells read, and
`SourceSampler`: the area's own VRT, read over the area's projected
footprint, with NaN outside it. `sample.py` also moved its point transforms
to `@`. `affine` 3 warns on `*`, and the new tests are the first to drive
the sampler with a real raster, so they were the first to show the
warning. `make probes` takes **5.7 s, up from 0.6 s**. Both reports are the
same to the byte across three runs. `tools/gorgeReport.ts` no longer blames
the 90 m cell alone for the sill; it points at the probe report, which
answers that question. A hero area whose source is not on disk says so above
its sills instead of printing a table that looks complete.

## F59 — Stage 3's fetch is a licence before it is a download: three river networks priced, and HydroSHEDS' own rule leaves 3,710 of the 74,019 closed basins for any of them to decide

*22 September 2026, on `real-elevation-pipeline`.*

Every engineering item left in the build plan waits on something other than
engineering. The one nearest the critical path is stage 3's carve. F48 filed
it as a fetch of a public dataset rather than a decision, blocked only
because the acquire step for it did not exist. So the acquire step was the
item. Pricing it meant reading the licence, and the licence turned out to be
the larger cost.

### What the fetch is

Three sources carry what stage 3 is still missing: which closed basin is a
clipped meander, and which is a lake that never had an outlet. Each file was
priced by a HEAD request, or through figshare's metadata API, which is where
figshare publishes its checksums. No data file was downloaded.

| Source | File | Bytes | The publisher's own digest |
| --- | --- | ---: | --- |
| HydroRIVERS v1.0, Asia | `HydroRIVERS_v10_as_shp.zip` | 90,510,995 | SHA-1 `71a92a2d…`, as `x-bz-content-sha1` |
| RiverATLAS v1.0 | `RiverATLAS_Data_v10_shp.zip` | 2,418,581,202 | MD5 `7a6d7422…`, through the figshare API |
| Natural Earth rivers, 1:10m | `ne_10m_rivers_lake_centerlines.zip` | 2,079,507 | MD5 `686e256c…`, as the ETag |
| Natural Earth lakes, 1:10m | `ne_10m_lakes.zip` | 2,349,685 | MD5 `06c43024…`, as the ETag |

Every publisher hands over a checksum, as S3 did for GLO-30 (D24), and each
does it differently. data.hydrosheds.org is Backblaze B2 behind Cloudflare,
and B2 serves the SHA-1 of a file uploaded in one piece. The *global*
HydroRIVERS file, 544 MB, is served with `x-bz-content-sha1: none`. That is
B2's large-file upload, and it is the same shape as the multipart ETag D24
guards against: a file with no whole-file digest. The regional file has one.
figshare's download link answered a HEAD with a 202 and no length. Its API
publishes `computed_md5` for every file in the article. Natural Earth is S3
behind CloudFront, where a single-part upload's ETag is its MD5. Whether each
digest agrees with its bytes can only be checked by downloading them, so that
check happens on arrival.

One thing about the publishers was in no documentation. data.hydrosheds.org
answers Python's default agent, `Python-urllib/3`, with a 403, and any other
agent with the file; curl gets a 200 from the same URL. The pipeline names
itself, `nineskies-pipeline/1`, rather than borrowing a browser's name.

### What downloading it agrees to

**HydroRIVERS** is covered by the HydroSHEDS version 1 License Agreement,
Appendix A of the HydroSHEDS Technical Documentation v1.4 (April 2022).
HydroRIVERS' own documentation says the same agreement covers it. The
summary line, free for commercial use, is true, and it is not the whole of
it. Exercising any right in the data accepts the agreement, and the product
page says downloading does. What it asks of a build that ships something
made from the data:

- distribution only inside a derivative work, never stand-alone, and only
  to end users under an end-user licence at least as protective (2.1.2);
- no reverse engineering, with the same restriction passed to end users,
  and the data protected against unauthorised copying as carefully as the
  licensee's own confidential information (2.1.3);
- WWF's copyright statement in the product's documentation or metadata
  (2.2, Exhibit B);
- WWF owns modifications and improvements of the data, however developed (3);
- the licensee indemnifies WWF against claims from its own or its end
  users' use (5.2);
- WWF may terminate the licence at its sole discretion, and end-user
  licences already granted survive it (7.1, 7.2);
- two years of records of sales and of each end user's identity and
  address, open to WWF's inspection (10.7).

**RiverATLAS** is the same reach network with the same HydroRIVERS columns,
plus 281 environmental attributes, published as part of HydroATLAS.
HydroATLAS is licensed CC BY 4.0 *as a collective database*. Its technical
documentation (v1.0.1, 4.1) then says its parts keep their own licences.
Every attribute column is CC BY 4.0 or ODbL 1.0, named column by column in
the catalog, and permission was obtained wherever an original licence
differed. It also says the underpinning datasets in their original format
are unaffected. That is why HydroRIVERS as its own download is still under
the agreement above. Which of the two licences covers the reach geometry
inside RiverATLAS is not stated column by column. ODbL is the share-alike
licence D9 turned OpenStreetMap down for, so the file carries columns this
build must not use.

**Natural Earth** is public domain: no permission is needed and no credit is
required.

This is not a legal reading, and nothing here settles one. Does a carved
elevation tile *incorporate* the licensed data? Can a free web build meet
2.1.2 and 10.7? Both belong to the build plan's licence review, which has
been open since phase 0 and is due at the end of phase 1. What this finding
corrects is what the repository believed. F48 called the fetch a fetch of a
public dataset rather than a decision. The pipeline README listed HydroSHEDS
as *Attribution*. D9 chose HydroSHEDS beside Natural Earth because it has no
share-alike terms. That is true, and it is not what the terms are about.

### What each carries

| | HydroRIVERS, Asia | RiverATLAS | Natural Earth |
| --- | --- | --- | --- |
| Endorheic flag | `ENDORHEIC`, and `NEXT_DOWN = 0` where a network ends | the same columns | none |
| Stream order | Strahler, classical and by discharge | the same | a scale rank |
| Names | none | none | yes |
| Drawn from | 15″ flow directions, every reach draining 10 km² or 0.1 m³/s | the same | World Data Bank 2, adjusted by hand to SRTM Plus relief; the basic rivers work well to about 1:30 million, by its publisher's account |
| Download | Asia alone, 90.5 MB | the whole globe, 2.42 GB | 4.4 MB with the lakes |
| Licence | the HydroSHEDS agreement | CC BY 4.0 as a collection, ODbL columns inside | public domain |

The endorheic flag is the outside knowledge the fetch was always for.
HydroSHEDS' natural sinks were decided by a person, checking each candidate
by eye against mapped rivers and lakes, and its documentation counts more
than 16,000 of them worldwide. Natural Earth has no such flag. It can only
decide a basin its rivers cross or end in, or its lakes fill. How far its
lines sit from the channels this grid draws is unmeasured until it is
fetched.

### How much of the question there is

HydroSHEDS drew its own line for which sinks deserved a look (Technical
Documentation v1.4, 3.3). A sink deeper than 10 m *and* larger than 10 km²
was put in front of a person, and every other sink was filled without
looking. Applied to this grid:

| Closed basins | Basins | km² |
| --- | ---: | ---: |
| filled without looking | 70,309 | 203,579 |
| looked at, 10–100 km² | 3,275 | 89,890 |
| looked at, 100–1,000 km² | 392 | 97,911 |
| looked at, over 1,000 km² | 43 | 207,400 |

So "which of 74,019" is **3,710 of them**, covering 395,201 km² of the
598,780 km² that is closed. The 43 largest hold more than half of that area.
The first is the middle Yangtze, sealed at 1 km, and every candidate draws
the Yangtze. HydroSHEDS applied the rule at 3″ and this applies it at 1 km,
so the count is a price rather than a verdict. `make hydro` prints it.

### What was built

`pipeline/nineskies/vectors.py` is the acquire step F48 said was missing,
for one file per source.

- **The price list as data.** Each candidate is pinned to its bytes and to
  its publisher's own digest as measured when priced, with its licence and
  the licence's terms paraphrased section by section. `make vectors` prints
  the list with no network, then sends one request per source to check that
  each publisher still serves the priced bytes. All four do today.
- **A fetch that names its licence.** `make vectors FETCH=<id>
  ACCEPT=<licence>` refuses before any request unless `ACCEPT` is that
  source's licence. For two of the three sources the download is the
  acceptance. The acceptance is always in a command somebody typed, and never
  a side effect of `make world`, which does not call this (D60).
- **The pin is the check.** A HEAD that disagrees with the pin refuses
  before the download, because a file replaced under the same name is a
  different source. Bytes that do not hash to the pin are never written, not
  even as a part-file. A file already on disk that hashes to the pin is not
  asked for again.
- **The record names the terms.** A fetch writes
  `pipeline/sources/vectors.json`, one line per source: the bytes, both
  digests, and the licence it was accepted under. It does not exist yet,
  because nothing has been fetched.

`hydro.inspected` is HydroSHEDS' rule, and `docs/hydro-report.md` prints
its count. The pipeline README's licence row is corrected.

### What it changes

Stage 3's carve is blocked on a decision, and the decision is the user's:
which licence the build takes on, at what download cost. Priced:

- **HydroRIVERS**, 90.5 MB. Exactly the data, under the agreement above,
  accepted by whoever runs the fetch.
- **RiverATLAS**, 2.42 GB, 27 times the bytes. The same network under a
  licence written for reuse, as far as its documentation says. The
  geometry's own licence is not stated column by column, and the file
  carries ODbL columns that must not be used.
- **Natural Earth**, 4.4 MB. No terms at all, and D9 already names it for
  coasts and lakes. It has no endorheic flag and no stream order, and its
  publisher rates the basic rivers to about 1:30 million.

The recommendation is to fetch Natural Earth first, because D9 wants it
anyway and it binds nothing. Then measure what it decides of the 43 largest
basins, and how far its lines sit from the grid's own channels. Put the
HydroSHEDS agreement into the licence review with one question: can a free
web build meet 2.1.2 and 10.7? Choose between RiverATLAS and HydroRIVERS
only if Natural Earth leaves the large basins undecided. Whichever is
chosen, the choice is a word in a command, and the record says which
licence was taken.

The licence review has one of its four sources read now, and the reading is
not the one the repository assumed. The other three — CHELSA and ERA5, GHSL
and Copernicus — are still unread.

As a decision (D60): a source whose download accepts terms is fetched only
by a command that names them, and it is pinned to its publisher's own
digest when it is priced, not when it arrives.

### What it cost

**224 Python tests, up from 206.** Seventeen are on the fetch, against a
local server that plays each publisher, so none touches the network. Each
property was checked by breaking it:

- with the gate removed, three tests fail;
- with the pin comparison removed, one fails;
- with the HEAD before the download removed, four fail.

One more test holds HydroSHEDS' rule at both bounds, at 90 m as well as at
1 km. It uses strict bounds, as the documentation writes them. A first
count with *at least* 10 km² gave 4,073.

Pricing used HEAD requests and figshare's metadata API, never a GET of a
data file. `data/source/` holds what it held before. Reading the terms meant
fetching three technical documents (HydroRIVERS, HydroSHEDS and HydroATLAS,
0.5, 0.5 and 3.5 MB), which were read and not kept in the repository.
`make hydro` is the same to the byte across two runs. It differs from the
committed report by its date and by the new row and paragraph.

## F60 — Natural Earth draws the big rivers where the valleys are and decides the basins they cross, and touches none of the others; an open-source build rules HydroSHEDS out and keeps GLO-30

*22 September 2026, on `real-elevation-pipeline`.*

The user took F59's recommendation, fetch Natural Earth first, and decided
the project is MIT-licensed open source. This finding acts on both. The two
Natural Earth files were fetched through `make vectors`, its first fetch, and
then measured against the grid. The licence review now has an answer to
check each source against.

### The fetch

Both files arrived and hashed to the MD5 their publisher serves as the ETag:
2,079,507 bytes of rivers and 2,349,685 of lakes. So the ETag is the MD5 here,
measured on arrival rather than assumed. `pipeline/sources/vectors.json`
records both, with `licence: public-domain` beside the digests.

The files hold more than the dataset's page lists: 1,473 river lines and 1,355
lake outlines, each with a `name_zh` among twenty-odd languages. The pipeline
has no vector driver, so `shapefile.py` reads the two formats with the
standard library and numpy, in 0.08 s for both files. The README had expected
fiona here, which would have brought a native library with it.

Only 78 of the river lines touch this corridor, 9 of them centrelines drawn
through lakes. At 1:10 million that is the big rivers and little else.

### Where its lines sit

Against the five places sited on the water from the 30 m source,
independently of both the map and the grid:

| Place | Natural Earth | The grid's own river (F56) |
| --- | ---: | ---: |
| `qutang-gorge` | 0.43 km | 0.4 km |
| `wu-gorge` | 0.22 km | 0.2 km |
| `xiling-gorge` | 0.29 km | 0.5 km |
| `tiger-leaping-gorge` | 0.59 km | 0.7 km |
| `shigu` | 1.72 km | 2.1 km |

Four of five are inside 1.5 km, as with the grid's own river, and neither
reaches Shigu.

Against the grid's own large channels, those with a thousand square kilometres
or more draining through them, on fetched ground only: across 31,416 km of
mapped line the median offset is **1.02 km** and 69 % is within 2 km. The
mountain rivers sit on the grid's valleys:

- the Dadu, median 0.70 km, 98 % within 2 km;
- the Yalong, 0.69 km, 94 %;
- the Mekong, 0.66 km, 97 %;
- the Jinsha, 0.87 km, 88 %.

The lowland ones do not:

- the Yangtze, median 1.89 km, 50 % within 2 km;
- the Jialing, 1.23 km, 46 %;
- the Tuo, 2.54 km, 36 %.

That is where the grid's channel is the flood's tie-break across a sealed
basin (D56), so the lowland offset measures the grid as much as the map. It is
also the ground a carve is for.

### What it decides

Of the 3,710 basins HydroSHEDS' rule would have had a person look at (F59),
3,436 stand wholly on fetched ground. A sample on a tile any part of which
was never fetched is a zero nobody measured (F54), so the other 274 are left
out rather than decided.

| Natural Earth | Basins | km² |
| --- | ---: | ---: |
| a mapped river system ends inside it | 1 | 27 |
| a mapped river crosses its rim twice or more | 423 | 214,935 |
| a mapped lake lies in it | 10 | 10,255 |
| a mapped river crosses its rim once | 2 | 30 |
| nothing mapped touches it | 3,000 | 143,342 |

By area it decides most of the question: 225,217 km² of 368,589, or 61 %. By
count it decides almost none of it: 3,000 of 3,436 basins are touched by
nothing it draws. Of the 36 basins over 1,000 km²:

- 20 are crossed by a named river. They include the sealed middle Yangtze
  (the Yangtze, Min, Jialing, Wu, Tuo and Dadu) and the Dongting flats (the
  Yangtze, Han, Xiang and Yuan, with Dongting Lake in them).
- 4 hold a mapped lake and no mapped river, Namtso and Chao Lake among them.
- 12 are silent.

The file carries no direction. 20 of the 77 lines wholly inside the corridor
run uphill from first vertex to last. And 186 of the 280 line ends near the
corridor meet no other line exactly; a quarter of those lie within a
kilometre of one, because Natural Earth stops some tributaries short of the
river they join. So direction is read off the ground. Lines whose ends come
within 2 km of each other are one system, and a system's mouth is its lowest
free end. A mouth can be named only for a system wholly on fetched ground,
and 6 are.

Two of the 36 large basins read wrongly, one for each kind of error the
method has:

- **Yamdrok** (2,717 km²) reads as crossed. An unnamed tributary of the
  Yarlung rises on its rim at 4,669 m. It runs along the rim, in and out
  seven times, then down to within 0.7 km of the Yarlung at 4,357 m. A river
  that wanders along a basin's rim crosses it as often as one passing
  through, and Yamdrok Tso has no outlet.
- **Chao Lake** (2,095 km²) reads as a lake with no river. It drains to the
  Yangtze through a river Natural Earth does not draw. At this scale, a lake
  with no mapped river is not evidence of a sink.

`make rivers` writes all of it to `docs/rivers-report.md`, including the 36
large basins one by one with the names that decided each.

### What it changes

**Stage 3's carve has a source** for the rivers Natural Earth draws. The
basins those rivers cross hold 214,935 km², the sealed middle Yangtze and the
Dongting flats among them. In the mountains the lines sit within a cell of
the grid's own valleys. The carve itself is engineering and is next.

**The lake question is not answered.** 3,000 basins covering 143,342 km² are
silent, and a lake with no mapped river is no evidence of a sink. HydroRIVERS
answers exactly that question, and it is ruled out. Its agreement requires:

- an end-user licence at least as protective as its own;
- protection of the data against copying;
- two years of records of each end user's identity and address (F59).

An MIT-licensed open-source project can give none of these. RiverATLAS
carries the same network under CC BY 4.0, at 2.42 GB, but the reach
geometry's own licence is not stated column by column. The other way out is
HydroSHEDS' own default for the sinks it did not inspect: fill them. Which
of the two to take is the user's.

> **Decided, 22 September 2026.** Neither: fill them, but keep the lakes
> Natural Earth draws. That is wrong where a real closed lake is too small
> for it to draw, and at Chao Lake, which drains through a river it leaves
> out. See D62.

**The licence review has its criterion.** The code is MIT; data keeps its
source's terms. GLO-30 as the AWS mirror serves it is under the licence for
COP-DEM-GLO-30-F, *Full, Free & Open*. That licence grants reproduction,
distribution, communication to the public and adaptation, free of charge,
worldwide and without limit in time. In return it asks for:

- a credit notice, with its own wording for modified data (6a, 6b);
- a sentence disclaiming the programme's liability, in any licence or notice
  that covers redistribution (6c);
- no implied endorsement (6d);
- the same obligations passed to anyone given the right to redistribute (6e);
- the licensee's own protection of the programme against claims (7).

None of that stands in the way of an open-source world. `LICENSE` (MIT) and
`NOTICE.md` (the data's own terms, with the notices written out) are added,
and the copyright line names the repository's git author. Natural Earth
needs no notice. CHELSA, ERA5 and GHSL are still unread.

**The game credits nobody for its ground.** Article 6(a) asks for the notice
wherever the data is communicated to the public, and an open release does
that. The screen it belongs on is the pause menu the GDD names, which is not
built, so it is recorded rather than done.

> **Decided, 22 September 2026.** Not in the game: the credit goes on the
> game's website, live by the first public build, and `NOTICE.md` keeps it
> with the source.

### What it cost

**252 Python tests, up from 224.** The new tests are:

- 10 on the shapefile reader, against files written byte by byte from the
  specification;
- 15 on the measurement, on a 40 × 60 km slope with four pits whose verdicts
  are known;
- 2 on the coverage mask's shared-edge rule;
- 1 on `hydro.basins`, which now returns labels beside the list.

The hydrology report is unchanged to the byte by the last of those. One of
the fifteen failed first, and it was the fixture: the test lake was drawn
with its rings turned the wrong way round, and a shapefile writes outer rings
clockwise.

`make rivers` takes about 13 s and is the same to the byte across two runs.
It is not in `make world`, which must never depend on a download somebody
has to accept (D60). This finding made two downloads, 4.4 MB, both public
domain and both approved. The GLO-30 licence was read from the Copernicus
data space, a 0.5 MB document not kept in the repository.

## F61 — Stage 3 carves: every mapped river runs downhill down its own valley, the Yangtze probe's five dams are gone and the mapped lakes keep their level; the fill D62 chose is the largest thing the stage does, and was kept with its price known

*22 September 2026, on `real-elevation-pipeline`.*

F60 left the carve as the next engineering item, and D62 had given every
closed basin a rule before it started:

- a basin a mapped river crosses is carved along the river;
- one a mapped lake lies in keeps its level;
- every other one is filled.

This finding builds that as stage 3 (`carve.py`, `make carve`). It sits
between the grid and the tiles, so every world, probe, section and patch is
now cut from its output, and it is measured the way stage 2 was.

One clause cost more than F60 said it would. F60 priced filling the
untouched basins as costing nothing, meaning no download and no licence. On
ground the game draws it is the largest change the stage makes. That was put
to the user with the numbers, and the user kept it.

### How a river is carved (D63)

**The channel is the valley, not the line.** Natural Earth is drawn at
1:10 million. It is a cell or two off its valleys in the mountains (F60), and
further where it has been simplified. So each run of mapped line over
measured ground is given a band of cells either side of it. A priority-flood
from the run's lower end grows up through the band, ordered by water level
and then by each cell's own height, and the path it takes to the upper end
is the channel. Inside a hollow the flood finds the floor before the walls,
and it leaves by the lowest way there is. Runs are cut lowest first, and any
channel already cut is a place a later one may end, which is how a
tributary finds its river.

**The band is 5 km, because that is where the deepest cut stops falling.**
Swept over the corridor with nothing else changed:

| Band | Cells cut | km³ | Deepest | Cut over 1,000 m | Channel from line, median / 90th / worst |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 km | 27,753 | 2,153 | 2,660 m | 64 | 1 / 1 / 2 cells |
| 2 km | 27,900 | 1,963 | 2,660 m | 31 | 1 / 2 / 3 |
| 3 km | 28,212 | 1,896 | 2,009 m | 6 | 1 / 2 / 4 |
| 4 km | 28,183 | 1,883 | 1,166 m | 2 | 1 / 2 / 5 |
| **5 km** | 28,208 | 1,877 | 968 m | 0 | 1 / 2 / 6 |
| 6 km | 28,333 | 1,874 | 968 m | 0 | 1 / 3 / 7 |
| 8 km | 28,442 | 1,886 | 968 m | 0 | 1 / 3 / 9 |

At 2 km, the width this plan once wrote down for the burn, the deepest cut
is **2,660 m** at 29.77 N 95.36 E. Natural Earth draws the Yarlung straight
across the neck of the Great Bend, which the river goes round, and the
channel follows it through a 4,018 m ridge from floor at 1,358 m to floor at
1,232. At 5 km the deepest cut is 968 m, in the Dadu's own gorge between Hanyuan
and Jinkouhe, and the channel still stays within two cells of the line for nine
cells in ten. (The sweep predates measuring coverage a sample at a time,
below, which lengthened the runs; the final numbers are in the next section.)

**Lower only, and never below the water.** Every cell on a channel is
lowered to the lowest ground upstream of it on the same channel, and no
further. Stage 2's reduction is mean plus a quarter of (max − mean), which
is never below the lowest 30 m pixel in a cell, and in a cell a river runs
through, the water is the lowest pixel. So a 1 km cell can only ever read a valley floor high, never low,
and the lowest ground upstream of a point is never below where the river
really runs.

**Other choices:**

- **Direction comes from each run's own two ends**, each read as the lowest
  ground within 5 km of it, not from the river system. A system is joined by
  a tolerance, and one mistaken join would turn a whole river round.
- **No fixed burn depth and no stream order.** Natural Earth carries a scale
  rank, not an order (F59), and a constant cut would lower ground everywhere
  a river already runs downhill.
- **A channel is four-connected.** Where the path steps diagonally, the lower
  of the two cells beside the step is cut too. The surface the game draws
  between four samples puts the two cells across a diagonal step in the
  middle of the channel as a dam, even though eight-neighbour water would
  pass.
- **A lake is protected.** Inside a mapped lake's outline nothing is cut
  below the lake's lowest ground, and a river's band never enters a lake the
  river does not itself touch. That is what keeps the unnamed river rising
  on Yamdrok's rim (F60) from draining Yamdrok.

### Where the source reached, a sample at a time

The first runs measured coverage by tile, as the rivers report does (F54,
F60). A tile on the corridor's rim is `UNREACHED` if any one-degree cell
under it was never fetched. But the samples in it that stand on a fetched
cell are real ground: **247,922 of them, 5.2 % of the grid**. Among them was
the Tongtian, the Yangtze's own headwaters near 34.5 N. There the derived
river still climbed 27 steps, because the carve had stopped at the tile's
edge.

`coverage.sample_states` now asks the cell under each sample's own centre.
3,536,331 samples are fetched ground, against 3,329,409 for the tile rule's
fully fetched and coastal tiles. Ocean samples are all exactly zero, and
only 3,433 unfetched samples read anything else.
Water that reaches the sea or unfetched ground leaves the world there, and
nothing there is changed. The tile rule still decides what the map draws,
where a guess is the fault F54 was about.

### What it did

`docs/carve-report.md`, the same to the byte across two runs:

- **98 channels** from 98 runs of mapped line, 37,241 cells of channel.
  **29,832 cells cut**, 1,929 km³, the deepest **968 m**. 644 cells are cut
  by more than 300 m, the deepest where a valley is narrower than a cell: the Dadu,
  the Salween, the Jinsha at 27.27 N (Tiger Leaping Gorge), the Yalong, the
  Wu, and the Yangtze at 31.02 N 109.62 E (Qutang).
- **None of the Yangtze probe's six reaches is dammed.** On stage 2's grid
  five were: by 18, 175, 287, 27 and 13 m (F58).
- **The grid's own largest river** climbs 7 steps and 5 m, where it climbed
  1,980 steps and 90,841 m. It meets all five channel places within 1.5 km,
  Shigu included, where before it met four. 391 of its cells still stand
  under water, all in the basins of kept lakes: 374 by less than 0.3 m on
  the lower Yangtze, and 17 by up to 2.1 m at the Dongting outlet.
- **0.75 % of the corridor has no outlet** (35,607 cells in 183 basins),
  where 12.64 % had (598,780 cells in 74,019 basins). Every one of the 183
  holds a kept lake.
- **50 lakes are kept.** 58 mapped lakes stand on measured ground and 10 of
  them lie on a carved channel. The 50 still closed afterwards keep their
  basins: Tai, Hongze, Poyang, Namtso, Gaoyou, Chao, Dongting, Yamdrok,
  Qiandao and 41 more. Chao is D62's named failure, kept closed because the
  river it drains by is not drawn.

### The fill costs more than F60 said

Measured on the same carved grid, each rule for the basins no mapped river
drains and no mapped lake lies in:

| Rule | Cells raised | Cells lowered | km³ | Deepest | Moved over 100 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| **fill** (D62) | 387,919 | 0 | 11,750 | 542 m | 25,472 |
| leave | 0 | 0 | 0 | 0 m | 0 |
| breach | 0 | 193,316 | 4,548 | 542 m | 8,196 |

**Fill** raises every hollow to the lowest point of its rim, which is
HydroSHEDS' default for sinks nobody inspected. It is right for a grid
whose job is to route water. On ground that is drawn, it pours a flat floor
into each valley the 1 km grid sealed. The deepest is 542 m, at 27.81 N
92.50 E in the eastern Himalaya, and 8.2 % of the grid moves.

**Breach** lowers each hollow's lowest way out to its floor instead. That
restores a sealed valley, but it also cuts an outlet for a real closed
basin. **Leave** keeps every hollow stage 2 made where no mapped river runs:
79,511 closed basins, the kept lakes' 183 among them. It is the only rule
that is right for a basin that really has no outlet.

The corridor is not where the difference matters most. Natural Earth draws
no lake in the Turpan depression, and none at the Tarim's end, where its
river stops inside the basin. Under fill the full-country build raises both
to their rims, and the Turpan golden probe (−154 m ± 15) fails. The Qaidam
and Junggar have lakes it draws, and are kept.

> **Decided, 22 September 2026.** Fill, as D62 has it, with these prices in
> front of the decision. The Turpan and Tarim consequence is recorded against
> phase 2 rather than solved here.

### What else moved

**Expedition 1 is unchanged where it binds.** 712 of its 2,932 stations
moved: 611 raised, by up to 270 m at km 1,140, and 101 lowered, by up to
288 m at km 2,290. It still clears by 333 m at km 2,366 and arrives 264 m up.
The section was re-cut and re-signed.

**The high airfield** changed in 87 of its 1,726 cells, by up to 178 m. It
still flies: done in 69 s, lowest 45 m above the ground.

**The 1 km grid through the gorges came down, and the two grids disagree
more** (`docs/ground-report.md`, `docs/gorge-report.md`).

| Place | 1 km before | 1 km after | 90 m grid |
| --- | ---: | ---: | ---: |
| Qutang | 462 m | 190 m | 158 m |
| Wu | 433 m | 354 m | 160 m |
| Xiling | 419 m | 173 m | 158 m |
| Tiger Leaping Gorge | 2,197 m | 1,910 m | 1,807 m |

Wu's coordinate is a cell off the carved channel.

At a hundred metres over the water, the 1 km grid now has room at Qutang
(0.51 km) and Xiling (0.54 km), where it had none. The 90 m grid is still
the one the gorge questions are measured on.

The cut goes the other way too. The 90 m ground now stands up to **557 m**
above the 1 km ground at Tiger Leaping Gorge, where it stood 374 m, and
**628 m** in the Three Gorges, where it stood 301 m: the 1 km channel is
cut down beside walls the 90 m grid draws. A route cut from the 1 km grid
through a hero area would be checked against ground that much lower than
what is drawn. So *which grid authored content is cut from* costs more
than it did.

**The hero seams hold.** Tiger Leaping Gorge's edge stands mean 71.6 m and
worst 352.8 m from the country grid it is dropped into, against 71.3 / 333.2
before. The Three Gorges' stands 83.0 m and 330.1 m, against 80.1 / 330.1.
Both are well inside 900 m of skirt.

**The Jinsha probe would pass at 1 km now, and by nothing.** Its two channel
cells both read 1,826 m on stage 3's grid, where the source falls 41 m. It
stays on the 90 m grid. Stage 3 does not carve that grid, so the 1,935 m
sill 119 m over Shigu is still there (F58).

**The route's steepest kilometre** starts 16 m lower, 2,255.5 m to 2,899.2 m.
It now out-climbs the aeroplane 196 times over, against 191.

### What a world now says about itself

- The conditioned grid is `sea-to-sky-1km-conditioned.tif`, beside stage 2's.
- `hydro` and `rivers` go on measuring stage 2's grid as the before.
- Stage 3 writes a record of the rule, the band and the two vector files'
  SHA-256 as `make vectors` recorded them, with one digest over all of it.
  The manifest carries it.
- A section (now v4) and a patch (v2) sign that digest beside the rasters'
  (D24), so the same rasters carved with another rule are a different world
  in every signature.
- The tiler refuses a conditioned grid made from a different stage 2 grid.

### What it cost

**276 Python tests, up from 252:**

- 21 on the carve, on valleys, dams, lakes and rules small enough to work by
  hand;
- 3 on per-sample coverage;
- 0 net from the probe tests, where one was rewritten because stage 3 now
  exists.

**782 TypeScript tests.** Seven were re-pinned because they measure the 1 km
ground and stage 3 changed it:

- the three gorge readings;
- Tiger Leaping Gorge from the cockpit;
- the reservoir route's drawn gap;
- the map profile's relief;
- the terrain clamp's steepest kilometre.

Each comment keeps the stage 2 value beside the new one.

`make carve` takes about two minutes, most of it the report pricing all
three rules. The hydrology report's numbers are the same to the byte after
`hydro.flood` learned outlets and a preference; only its text moved, to say
that it is the before. Nothing was downloaded.

## F62 — Every source the plan names can travel with an open build under its own terms; CHELSA is public domain rather than CC BY, ERA5 has to be downloaded by a person with an account, and one GHSL layer carries JAXA's terms inside it

*22 September 2026, on `real-elevation-pipeline`.*

The licence review had three sources unread after F60: CHELSA, ERA5 and
GHSL. A fourth, ESA WorldCover, was never on the review's list at all. The
pipeline README called it CC BY 4.0, which is how it described HydroSHEDS
until F59 read it. All four were read today from their publishers' own
pages, against the test D61 sets: can data derived from the source travel in
public under the source's own terms? "In public" here means three things:
beside MIT code in a public repository, in a free web build, and inside a
paid desktop build on Steam. Nothing was downloaded, no account was made and
nothing was accepted. The texts read are kept outside the repository.

| Layer | Source | The README said | The publisher says | To get it |
| --- | --- | --- | --- | --- |
| Climate | CHELSA V2.1 climatologies, tas and pr | CC BY 4.0 | **CC0 1.0**, a public-domain dedication | open, no account |
| Wind | ERA5 monthly means, 10 m u/v | "Copernicus licence" | **CC BY 4.0**, since 2 July 2025 | a Climate Data Store account, and the licence accepted in the holder's name |
| Population, built-up | GHSL R2023A: GHS-POP, GHS-BUILT-S, GHS-BUILT-H | CC BY 4.0 | CC BY 4.0 | open, no account |
| Land cover | ESA WorldCover 2021 v200 | CC BY 4.0 | CC BY 4.0 | open: AWS without signing, and Zenodo |

### What each one asks

**CHELSA asks for nothing.** Both the CHELSA site and its EnviDat record
(DOI 10.16904/envidat.228) give the climatologies as CC0 1.0. That waives
every right for any purpose, commercial use included, and asks nothing in
return. The publisher does ask for a citation, Karger et al. (2017) in
*Scientific Data*, but as a request rather than a condition. CC BY 4.0
appears on the CHELSA site only against its drought indices, which may be
where the README's line came from. D8 chose CHELSA over WorldClim to avoid
share-alike, and the reason stands: WorldClim is CC BY-SA, and CHELSA is not
even attribution.

**ERA5 is open data behind a closed door.** On 2 July 2025 the Climate Data
Store replaced the *Licence to use Copernicus Products* with CC BY 4.0 for
everything it serves. ECMWF announced this on 13 June and confirmed on 2 July
that it had been implemented. But getting the data is not open:

- the store's terms of use say "Download of Content requires prior
  registration";
- the dataset's download form refuses a request until the licence is accepted
  on the dataset's own page;
- those terms bind the account holder personally. A licence accepted there
  "only applies to its named holder", the terms change when a new version is
  posted, and disputes go to arbitration in London.

So the data can travel with an open build. The fetch cannot be a pipeline
step or anything done on the user's behalf, because it is an account and an
acceptance in a person's name. The store prescribes the credit as its own
sentence: "Generated using or contains modified Copernicus Climate Change
Service information" and the year, followed by a sentence disclaiming the
Commission's and ECMWF's responsibility, and the dataset's citation (DOI
10.24381/cds.f17050d7). NCAR's GDEX (d633001) mirrors the monthly means under
CC BY 4.0; whether it needs a login was not checked.

**GHSL is CC BY 4.0, and one of its layers is not only GHSL's.**

- The GHSL site gives its data as CC BY 4.0, "for any purpose, including
  commercial uses".
- The JRC Data Catalogue gives the Commission's reuse notice instead.
  Commission Decision C(2019) 1655 adopted CC BY 4.0 as that notice's open
  licence, so the two statements agree.
- Credit means citing the release's reference paper and each product's own
  DOI; the site calls a generic citation of the website "inappropriate".
- GHS-POP rests on CIESIN's census grid, GPW v4.11, which is also CC BY 4.0.
- **GHS-BUILT-H is derived from JAXA's AW3D30**, among others. It holds the
  building heights the city baker was going to read. JAXA's data policy asks
  anyone who distributes a derivative to credit JAXA, and anyone who uses the
  data commercially to notify JAXA in advance. Nothing in GHSL's texts says
  whether that reaches GHSL's own users. The paid build is the case it would
  bind.

**WorldCover is CC BY 4.0** and is provided "without restriction of use".
It asks for a credit line of its own: "© ESA WorldCover project 2021 /
Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover
consortium". The website's terms-of-use footer is VITO's and speaks of
personal, non-commercial use of the site's own information. Nothing ties it
to the data served from AWS or Zenodo.

### One clause the paid build should know about

CC BY 4.0 section 2(a)(5)(B) forbids applying technical protection to "the
Licensed Material" where that restricts what a recipient may do with it. The
game would ship textures and buffers baked from these sources, which is
*adapted* material, and the adapted-material clause (3(a)(4)) asks only that
the adapter's own licence not stop recipients complying. So the clause's
wording does not reach a baked atlas. It would reach a file that was only
converted from one format to another, which section 2(a)(4) says never
becomes adapted material. Whether anything shipped is only a format change
is a question for when stages 7–9 exist, and whether Steam's protection
touches data files at all is a fact about Steam. Both are recorded here and
decided nowhere.

### What it changes

- **The licence review has read every source the plan names**, and every
  one can travel with an MIT build under its own terms (D61). Two questions
  it leaves are the user's rather than a reader's:
  - who downloads ERA5, since it takes an account and an acceptance in a
    named person's hands;
  - whether the city baker reads GHS-BUILT-H, given JAXA's notice clause.
    The alternatives are to notify JAXA before a paid build, or to derive
    heights some other way.
- **The pipeline README's source table is corrected.** CHELSA is CC0, not
  CC BY 4.0, and ERA5 is CC BY 4.0 rather than "Copernicus licence". Each row
  now says what the publisher says, with a pointer here.
- **D8's reason is corrected to match.**
- **`NOTICE.md` is unchanged.** It lists what the repository's data is
  produced from, and nothing from these four has been built yet. Each
  source's credit joins it with the stage that first reads it.


## F63 — Stage 3 carves the hero areas as stage 6 cuts them, and the 1,935 m sill in Tiger Leaping Gorge is gone: the seventh probe's reach goes from 119 m of dam to none, on a grid whose source still has 52

*22 September 2026, on `real-elevation-pipeline`.*

F61 built stage 3 and left one thing undone. A hero area is cut from the
source, not from the country grid, so the carve never reached one: Tiger
Leaping Gorge still crossed a **1,935 m sill, 119 m over the cell the seventh
golden probe reads at Shigu**, and every path between the probe's two cells
crossed it (F58). The probe passed anyway, because it compares two cells and
they fall.

Stage 3 now runs on each area as stage 6 cuts it — the same module, the same
vectors, the same rule, the band in metres — and what is written, probed and
drawn is the conditioned area. `docs/carve-report-hero.md` is its report and
`make hero` writes it.

### Where a line leaves the grid, the river's crossing is not the line's

The carve at 1 km follows a band 5 km either side of a Natural Earth line and
takes the run's own end cells as the channel's ends (D63). At 90 m the second
half of that fails, and the geometry says why. On the west edge of the Tiger
Leaping Gorge area the Jinsha crosses at **1,834.5 m**; the line crosses
**4.4 km along the edge from it** — 2.4 km from the line, which the band
covers — and **276 m up the wall**, at 2,110.8 m. Carved from there the
channel starts on the wall, and the river above where it joins the valley is
left for the rule to deal with. The same at the other end, where the line
leaves 0.8 km from the river and the channel stopped 2 km short of the edge,
in a pit the fill then flattened.

So an end of a run **on the grid's own edge** is moved to where the river
crosses:

- **where it leaves**, the lowest ground on the edge within the band;
- **where it enters**, the first ground on the edge within the band that the
  flood from the lower end settles — the lowest way in, but never one reached
  over a ridge. Taking the lowest outright would be a trench waiting to
  happen: a notch on the same edge, lower than the river and walled off from
  it, would become the head of the channel and everything downstream would be
  cut to its floor. A test holds that.

**Nothing on the corridor moves.** No measured cell is on the 1 km grid's own
edge — 0 of 9,728 — because the corridor's window is tile-aligned and reaches
past the fetched cells, so no run ends there. The conditioned 1 km grid is
identical to the byte with the new rule, which was checked rather than
argued, so no section or patch is re-cut or re-signed.

### The band is the same 5 km, and at 90 m that is 56 cells

`RADIUS_M` is the constant now and `RADIUS_CELLS` is derived from it: the
band is how far the map can be from its valley, which is a fact about the map
and not about a grid. Swept over the gorge area with nothing else changed:

| Band | Where the channel starts | Cells cut | Deepest | Cut over 100 m | From the line: median / 90th / worst |
| ---: | --- | ---: | ---: | ---: | ---: |
| 0.18 km | 2,174 m — and the run is turned round | 1,399 | 1,301 m | 1,336 | 0.25 / 0.32 / 0.32 km |
| 0.45 km | 2,121 m, on the wall | 1,019 | 1,020 m | 416 | 0.54 / 0.65 / 0.70 |
| 0.99 km | 2,078 m | 873 | 487 m | 78 | 0.77 / 1.37 / 1.47 |
| 1.98 km | 2,065 m | 704 | 171 m | 23 | 0.81 / 1.80 / 2.50 |
| 2.97 km | 1,881 m | 702 | 171 m | 23 | 0.80 / 1.80 / 2.50 |
| 3.96 km | 1,840 m | 695 | 171 m | 23 | 0.80 / 1.78 / 2.50 |
| **5.04 km** | **1,834.5 m, the river** | **695** | **171 m** | **23** | 0.80 / 1.78 / 2.50 |
| 9.00 km | 1,834.5 m | 695 | 171 m | 23 | 0.80 / 1.78 / 2.50 |

The river's own crossing is in reach from 4.5 km and nothing changes out to
9 km, so D63's 5 km lands inside the same window one grid finer. Below it the
channel starts up the wall, and at a fifth of a kilometre — the width a burn
would have had — the run is *turned round*, because both its ends are read on
walls and the northern one is higher. The Three Gorges area is insensitive:
its line crosses both edges on the water, and from 2 km on nothing is cut at
all.

### What it did

`docs/carve-report-hero.md`, the same to the byte across two runs:

- **Tiger Leaping Gorge.** One channel, 1,498 cells, from 1,834 m on the west
  edge to 1,598 m on the north, which the cut takes to 1,581. **695 cells
  cut, 0.12 km³, the deepest 171 m** — at 27.1825 N 100.1046 E, which is the
  sill. The sill between where the river enters the area and where it leaves
  was **1,935 m, 100 m over the way in**; it is now the way in itself.
- **The seventh golden probe's reach: 119 m of sill over its upstream cell,
  and now 0 m.** The source row beside it is unchanged — 1,868 m, 52 m over —
  which is what the carve was applied to and what F58 measured the grid
  against.
- **The Three Gorges.** One channel, 2,332 cells, and **nothing cut**: the
  Yangtze already ran downhill through all three gorges on the 90 m grid,
  which is what the gorge report had been saying with its sill at the
  upstream end. The stage's answer agrees with a measurement taken another
  way.
- **The channel stays near the line**: median 0.80 km from it, 2.50 km at
  worst in the gorge area, and 0.36 / 2.36 in the Three Gorges.

### One world, one rule

Each area's manifest now carries what stage 3 read and did, as the country
manifest does: the rule, the band, the two vector files by SHA-256, one digest
over them, and the counts. Nothing signs it — a section or a patch refuses to
be cut over a hero area (D52) — so it is provenance rather than a key. What it
does buy is a refusal: the cut reads the country grid's own conditioning
record and stops, naming both, if the grid the area is dropped into was carved
with another rule or from other vector files. A world carved two ways would
otherwise draw two rules across one seam and say so nowhere.

### What D62's rule costs at 90 m

The fill is decided (D62, confirmed with its 1 km price in F61) and the
report prices all three rules on each area, as the country one does:

| Area | Rule | Cells raised | Cells lowered | km³ | Deepest | Within 2 km of the river |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `tiger-leaping-gorge` | **fill** | 24,126 | 0 | 6.39 | 201 m | 365 cells, ≤ 28.9 m |
| | leave | 0 | 0 | 0 | — | nothing |
| | breach | 0 | 3,634 | 0.28 | 201 m | 285 cells, ≤ 28.9 m |
| `three-gorges` | **fill** | 18,721 | 0 | 3.11 | 155 m | 756 cells, ≤ 71.1 m |
| | leave | 0 | 0 | 0 | — | nothing |
| | breach | 0 | 10,176 | 1.45 | 155 m | 2,086 cells, ≤ 119.0 m |

Fill raises 6.1 % of the gorge area and 3.2 % of the Three Gorges, against
8.2 % of the corridor at 1 km, and it is nearly all away from the water: the
deepest fills are a 15 km² basin 22 km from the river raised 201 m, and a
57 km² one 8.7 km away raised 79 m. Within the 2 km a river probe searches it
moves 365 cells by at most 29 m in the gorge area.

**Breach is worse here than it is at 1 km, and the reason is in the source.**
Side canyons off the Three Gorges reservoir read **113 to 136 m** where the
water stands at 157.5 — below the reservoir, on a surface model that has been
void-filled — and they are sealed from it by the 90 m cell. Breaching lowers
the way out of such a pit to its floor, which cuts a trench along the
reservoir the player flies down: 1,730 cells moved within a kilometre of the
river and one of them by 119 m, against fill's 175 and 47 m. Filling pours a
flat floor into the canyon instead, as much as 111 m above the water. Neither is the ground; the rule is
D62's and the price is now on both grids.

### What else moved

**The gorge report.** The course through Tiger Leaping Gorge is 105.1 km
rather than 103.2, ends at 1,581 m rather than 1,607, and **passes its two
places at 59 m and 41 m where it passed them at 163 and 117** — the carved
channel pulls the walked course onto the river. Its sill paragraph now reads
like the Three Gorges': *the sill is the upstream end itself*.

The run ladder is climbed from the sill, so its levels came down 101 m with
it. The pass the report flew at 2,035 m with 25 m either side is flown at
**2,034 m with 25 m either side** — the same air, one metre apart — and the
two rungs below it are new questions whose answer is *not found*: at 1,884 m
and 1,934 m neither search order gets past km 4.5 and km 33.9, in the narrow
reach above and below Shigu. Nothing that could be flown has stopped being
flyable; the floor the ladder starts from moved down to where the ground
actually is. At +100 m the narrowest place on the course reads **0.18 km**,
which is the carved channel: two cells wide, at the head of the gorge.

**The ground report.** The two grids agree slightly better: mean gap 72.0 →
70.0 m over the gorge area and 77.2 → 76.5 over the Three Gorges, and the
worst place where the *1 km* grid stands above the 90 m one falls from 568 m
to 524. The direction that matters for a clearance check — 90 m above 1 km,
557 m and 628 m — does not move, because those are walls and nothing here
raises a wall.

**Three TypeScript tests** were re-pinned, each with what it used to say:
the cockpit reading over Tiger Leaping Gorge (1,807.3 → 1,804.0 m, and the
gap to the country grid 103 → 106 m); the course's sill, which asserted the
dam and now asserts its absence; and the pass through the gorge, flown 200 m
over the sill rather than 100 because the sill moved.

### What it cost

**286 Python tests, up from 276.** The ten new ones are the ways in and out
on an edge — a line crossing away from its valley, a line that stops inside
the grid, and a channel cut to the edge it leaves by — the flood settling the
lowest of several ways in, the notch that would be a trench, the band as a
distance rather than a count of cells, and four on the refusal to carve an
area one way and the grid around it another.

**782 TypeScript tests**, three of them re-pinned above.

`make hero` takes **15 s** for both areas, report and all, and writes the same
report, rasters and tiles to the byte on a second run. `make gorges` is the
cost of the change, at three minutes of searches, and it is the report that
moved most. Nothing was downloaded, the country grid was not rebuilt, and no
committed artefact changed.
