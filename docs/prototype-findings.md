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
  is a development machine.
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

Three things the build should not forget:

- The floor device measurement is still outstanding and is the one that decides
  whether the 4 ms L0 trip-wire in the risk register is hit. Everything here is
  a development machine.
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
