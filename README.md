# Nine Skies

A relaxed 3D flying game across a geographically faithful China. See
[the design document](Nine%20Skies%20%E2%80%94%20Game%20Design%20Document.md) for what it is
and [the build plan](Nine%20Skies%20%E2%80%94%20Build%20Plan.md) for how it gets built.

Current stage: **phase 0, foundations**. The simulation is complete and tested;
the terrain spike (build plan D3/D4) and the horizon impostor (D15) are
validated in the browser; the pipeline builds the Shanghai–Lhasa corridor from
real Copernicus GLO-30 elevation and the two corridor golden probes pass
against it.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. Controls: `W`/`S` pitch, `A`/`D` roll, `1`/`2`/`3`
for low / cruise / boost, `V` to cycle the drama (the gate G1 A/B), `C` the
compression, `P` the cruise pace, `H` to toggle the horizon impostor, `F` the
field of view, `L` the camera's bank, `Z` the text size, `U` metric or
imperial, `O` the operator's column, `M` the map, `X` to fly the authored
expedition rather than free-fly over it, `R` to reset to the start. A gamepad works alongside: left
stick for pitch and roll, forward climbs, face buttons for the modes, d-pad
for the toggles, shoulders for the two camera settings. The help block is generated
from the one binding table (`engine/src/input/bindings.ts`), so it is always
right — and it is behind `O` with the debug column, because the two of them
were 92 % of the ink on screen and none of it is in the GDD's HUD (F46).

`O` hides exactly those two blocks and nothing else, and which two is a list
in `app/src/hudBlocks.ts` rather than a wrapper in the markup. It was a
wrapper for one change, and a wrapper hides whatever is nested inside it: the
map and the narration beat were, so `M` drew every frame into an element
measuring 0 × 0 and all four of the things the game says over Expedition 1
went to a node with no box. `test/hud/blocks.test.ts` parses `index.html` and
fails if a player-facing id is ever a descendant of a block `O` hides (D44,
F47).

`X` is off by default, which is free flight and what a G1 session is. On, the
route sets the speed of each leg and the pacing is held at what that route's
clearance was actually checked at — 190 km/min flies Expedition 1 into the
Nyainqêntanglha (F38).

`F`, `L`, `Z` and `U` are the comfort pass. `L` at its zero end is the GDD's
horizon-locked camera, which is what this prototype did before the setting
existed — the chase camera was built out of heading alone and never rolled, so
the flight model's bank reached the turn rate and nothing else. There is no
camera-smoothing setting: nothing in the rig steps except the terrain clamp,
and the clamp lifts the aeroplane 20.8 m in a single frame, which is out of a
filter's reach (D28, F35).

`Z` scales the player's readouts and leaves the debug column and the help
block alone, which is the same line `U` draws: the toggle moves what the world
is doing where the player is, and leaves the numbers an operator set the build
to in the units the findings are written in (D41, F45). The rest of that row
is not a setting. Every colour the map and the HUD draw is held to 10 dE
against every background it can land on, through normal vision and all three
dichromacies — which is what found a route that faded out over high ground and
a HUD that had been measured against a background it never has. And nothing on
screen can flash more than once a second, because the one state that could
chatter managed eight flashes in a second before it was rate-limited (D40,
F45).

The five readouts are the GDD's list and nothing else, and each is shown at a
step measured off the authored route rather than at whatever precision the
number happens to carry. Flown at sixty frames a second, the ground readout
used to change on **every frame** of its worst second and the altimeter in
feet was over this HUD's own two-a-second ceiling in 97 % of the flight; now
nothing changes more than twice in any second, in either unit system, and the
suite asserts it by flying the route rather than by saying so. `U` no longer
costs legibility: 20 ft is a coarser step than 5 m, so the imperial altimeter
is the steadier of the two (D42, D43, F46).

Beside them is the clock, which the GDD gives a section of its own: *"The
clock shows Beijing time, which is the point; the map overlay adds local solar
time beside it."* So the HUD says `TIME 07:02 Beijing` and the map says
`05:41 by the sun`, which is the pair that teaches the one time zone — and the
half that needs a country under it is drawn on the one place that has one
(F47).

Out of the box you fly **stand-in terrain** — fiction shaped like China's three
great steps, so the prototype can answer G1's question without 14 GB on disk.
Anything it says about a specific place is invented; see
`engine/src/terrain/syntheticTiles.ts`. The HUD always says which world is on
screen.

To fly the real one:

```bash
make world        # ~14 GB download, then ~6 minutes of pipeline
```

That fetches 331 Copernicus GLO-30 tiles for the Shanghai–Lhasa corridor,
reprojects them to the Albers country grid, cuts 1,155 tiles and the horizon
field, and runs the golden probes. No GDAL install and no AWS account: the
bucket serves anonymous HTTPS and `rasterio`'s wheels carry libgdal. Source
rasters live outside the repo in `data/`, and the built world in `dist-world/`.

The corridor ends where the corridor ends. Past its edge tiles simply are not
drawn and the HUD counts them as `off-world`, rather than blending real China
into a plausible invention — which is the one seam a playtest must never be
shown.

```bash
npm run check     # typecheck + tests + content validation
make routes       # fly every authored route over real ground
make challenges   # fly every authored challenge, and price what it asks for
make ground       # the two elevation grids, and what is authored over them
make gorges       # room to turn round, gorge by gorge
make test         # 761 TypeScript tests and 152 Python tests
```

`make routes` is the half of content validation a parser cannot do: every
expedition is flown over the terrain it crosses and fails if the aircraft
meets the ground (D17) or cannot descend onto its destination (D19).

It needs no world. The ground under each route is committed beside it in
`content/sections/` — 22 kB cut out of 9.8 MB of heightfield, one elevation
per kilometre — so the same check runs on a fresh clone, in CI and on the
machine with the rasters, and prints the same metres (D21). A section carries
the waypoints it was cut from, so editing a route invalidates it and says
which waypoint moved; a machine that does have a world re-cuts and compares.
714 of the 761 TypeScript tests run without the world; the forty-seven that do
not are the ones whose subject is the world itself. The HUD's own suite is in
the first group: it flies Expedition 1 at sixty frames a second over the
committed section and counts what each readout says (F46).

`make challenges` is the same rule one level down, and it needs no world
either. A challenge is a set of points rather than a route, so what is
committed beside it is not a profile along a line but a swath of the world's
own 1 km lattice, following the course the probe flies and as wide as the
aeroplane's own full-bank reversal — 12.2 kB for the one authored challenge
(D39). Because that is a subset of the world rather than a resampling of it
there is no rounding to choose, so the flight in CI is the flight the author's
machine ran, to the millisecond. The check flies each challenge with an
autopilot and refuses one whose objectives cannot be met, whose gate is
narrower than the aeroplane's own turn (D38), or that flew any part of itself
over ground the patch did not have — which reports a *safer* flight than the
real one rather than a failed one (F44).

A section is also signed by the machine that cut it, and one that does not
verify against the committed public key is refused rather than flown — so the
only way to change the ground under a route is to cut it from a world again
(D23). The challenge patches carry the same signature from the same key, for
the same reason. It names the source rasters behind it, too, and those are digested
against the mirror's own ETag rather than against ourselves: all 331 tiles of
the corridor match what Copernicus serves today, and a build refuses tiles
that have moved since (D24). The signature says where the numbers came from and cannot say they are
real: that is the probes' job, and where a route flies over a probe's
coordinates, that probe now runs against the committed file with no world
(Lhasa, 3,651.8 m against a published 3,650). The projection the sections
depend on is checked the same way, from both ends: the pipeline commits a
table of points PROJ has answered for, Python re-derives it where PROJ exists
and the engine checks `projectAlbers` against it where PROJ does not (D22).

## Layout

| Path | What |
| --- | --- |
| `engine/src/sim` | Atmosphere, aircraft performance, arcade flight model, world scale, and where the sun is over one time zone |
| `engine/src/terrain` | Shared grid, heightmap texture array, shaders, streaming, horizon impostor |
| `engine/src/gfx` | GPU timer queries and the check that decides whether to believe them, the comfort and accessibility settings, the air at the aircraft, and how different two colours look — to a trichromat and to the three dichromats |
| `engine/src/input` | The binding table, keyboard and gamepad sources, and the intent the frame polls |
| `engine/src/discovery` | Which card catchments the aircraft has flown into, and the one-card queue |
| `engine/src/expedition` | Where along an authored route the aircraft has got to, what fires when, and whether there is room to finish |
| `engine/src/hud` | Metric and imperial, the step each readout is shown at and the measurement behind it, and the rate limit that stops anything on screen changing faster than it reads |
| `engine/src/save` | What survives quitting, and when it is written |
| `engine/src/journal` | The collection: per-region counts, what to say about an entry nobody has found, and when a comparison spread opens |
| `engine/src/map` | Where the aircraft has been, the transform that puts it on a map without stretching it, and every colour it draws with the contrast threshold each one is held to |
| `engine/src/challenge` | What a skill test asks for, how an attempt is scored and retried, and an autopilot that proves it can be done |
| `app` | Prototype shell: renderer, chase camera, HUD, framebuffer probes, frame-cost capture — and which blocks of that HUD are the player's and which two are the operator's, as a list a test can check against the markup |
| `content` | Card, expedition, comparison-spread and challenge schema, the nine regions, the committed route sections and challenge ground patches, and the validation gate |
| `pipeline` | Offline DEM → tile pipeline: acquire, reproject, tile, probe, the committed projection reference and the source raster digests |
| `tools` | Node-only authoring tools: corridor reader, route sections and challenge ground patches with their signatures, route check, playtest session planner, lesson report, atlas report, challenge check, frame-budget stations |
| `test` | Unit tests, including the golden reference tables |
| `docs` | Running findings for each gate, and the golden probe report |
| `Makefile` | `make world`, `make probes`, `make sources`, `make sections`, `make patches`, `make cut-key`, `make reference`, `make routes`, `make sessions`, `make teaches`, `make atlas`, `make challenges`, `make stations`, `make test` |

## What a frame costs

The frame budget is written in milliseconds per pass against 33.3 ms, so it is
measured that way rather than in frames per second — an fps counter is capped
by vsync and cannot tell 1 ms of terrain from 7.9 (D25).

```bash
make dev
# then, in the browser console:
__ns.frameCost().then((r) => console.log(__ns.frameCostTable(r)))
```

It flies nothing. The camera is placed at seven stations cut from the route
and committed in `app/public/capture-stations.json` — the named waypoints plus
the foot and rim of the wall — at a forced 1920×1080, and each pass is timed
with GPU timer queries. Every capture begins by checking the instrument and
prints its own resolution, because a number below that floor has not been
measured however many decimal places it has.

On an Apple M3 the whole visible scene costs 0.98 ms of the 33.3 ms frame at
1080p and 2.13 ms at the display's native 5.94 megapixels, with the L0
displaced grid at 0.10 ms against a 4 ms trip-wire either way — the extra
pixels land on the clear and the sky, not the terrain (F34). The budget is
costed at the floor device's native pixel count, a 13-inch M1 at 4.10
megapixels (D27), and that machine has not been captured yet; pass a size to
capture at any resolution, `__ns.frameCost(20, [3024, 1964], ["wall-rim"])`.
`make stations` re-cuts the stations, which is a deliberate act rather than
part of `make world`, because two captures are only comparable if they stood
in the same places.

## The two things worth knowing before reading the code

**Altitude is not compressed; distance is.** Horizontal position is multiplied
by a large gain so China crosses in under an hour, while climb rate stays real —
7.1 m/s at the coast, 2.1 m/s on the plateau, zero at 6,197 m. A metre of
altitude costs roughly forty times what a metre of distance costs. That
asymmetry is the game's thesis expressed as a constant, not a workaround.
See `engine/src/sim/scale.ts`.

**The plateau is arithmetic.** There is no altitude constant anywhere that says
"the plateau starts here". Engine power follows the Gagg-Farrar piston lapse,
boost is gated on density ratio 0.70, and that threshold happens to fall at
3,564 m. See `engine/src/sim/atmosphere.ts`.

**The pipeline owns the projection; the engine owns nothing about it.** The
game world is Albers Equal Area Conic, 105 °E, 1 km cells, 105 × 69 tiles of
64 km. The engine knows only tile indices and metres; every latitude and
longitude in the project is resolved offline and published in the manifest, so
there is no second opinion about where Lhasa is. The two sides share four
constants, and a Python test reads the TypeScript to prove they still match.
See `pipeline/nineskies/grid.py`.

**Colour and light live in one file.** The hypsometric ramp, the aerial
perspective integral and the ground lighting are shared GLSL chunks, because
the terrain and the horizon impostor drawing the same mountain have to agree
about it — and because a colour stop is a factual claim. See
`engine/src/terrain/palette.ts`.

## Findings so far

[docs/prototype-findings.md](docs/prototype-findings.md) — thirteen findings
from phase 0, and the golden probe reports from the two built grids:
[the 1 km corridor](docs/probe-report.md) and
[the 90 m hero areas](docs/probe-report-hero.md). Beside them,
[the siting report](docs/siting-report.md) — every coordinate this repository
ships, measured against the source's own 30 m rather than taken on trust,
which is how the Three Gorges were placed and how Wulingyuan was found not to
be placeable at all (F52) — and
[the ground report](docs/ground-report.md), which is about having two
elevation grids at once. The cockpit reads the 90 m one over a hero area and
every committed section and patch is cut from the 1 km one, and where they
overlap the fine grid stands up to **374 m above** the coarse — more than the
333 m the only authored expedition clears its worst terrain by. Nothing
authored is over a hero area; that is measured on every build rather than
remembered, and both cutters refuse to write an artefact that would be
(D52, F53). And [the gorge report](docs/gorge-report.md), which asks the two
gorges this world has cut at 90 m whether the aeroplane can be turned round
inside them: Tiger Leaping Gorge is **0.36 km** wide where a player would fly
it, not the 1.3–8.0 km an earlier finding recorded from a coordinate 71 km
away, and the gorge that can actually be threaded is the other one (D54, F55).

Three worth reading first. **F1** was wrong twice before it was right. **F12**
found that the Everest golden probe can never pass, because Copernicus GLO-30
reads 111 m below the surveyed summit before the pipeline touches it — a probe
that would have failed forever while looking like a pipeline bug. And **F13**
found that the stand-in world is fifteen times smoother than the real China now
flying over it, which means gate G1's central question has not actually been
asked yet.
