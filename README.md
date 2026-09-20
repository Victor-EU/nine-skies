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
for low / cruise / boost, `C` to cycle the horizontal compression (the gate G1
A/B), `H` to toggle the horizon impostor, `R` to reset to the start.

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
make test         # 310 TypeScript tests and 52 Python tests
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
302 of the 310 TypeScript tests run without the world; the eight that do not
are the ones whose subject is the world itself.

A section is also signed by the machine that cut it, and one that does not
verify against the committed public key is refused rather than flown — so the
only way to change the ground under a route is to cut it from a world again
(D23). The signature says where the numbers came from and cannot say they are
real: that is the probes' job, and where a route flies over a probe's
coordinates, that probe now runs against the committed file with no world
(Lhasa, 3,651.8 m against a published 3,650). The projection the sections
depend on is checked the same way, from both ends: the pipeline commits a
table of points PROJ has answered for, Python re-derives it where PROJ exists
and the engine checks `projectAlbers` against it where PROJ does not (D22).

## Layout

| Path | What |
| --- | --- |
| `engine/src/sim` | Atmosphere, aircraft performance, arcade flight model, world scale |
| `engine/src/terrain` | Shared grid, heightmap texture array, shaders, streaming, horizon impostor |
| `app` | Prototype shell: renderer, chase camera, HUD, framebuffer probes |
| `content` | Card and expedition schema, the committed route sections, and the validation gate |
| `pipeline` | Offline DEM → tile pipeline: acquire, reproject, tile, probe, and the committed projection reference |
| `tools` | Node-only authoring tools: corridor reader, route sections and their signatures, route check |
| `test` | Unit tests, including the golden reference tables |
| `docs` | Running findings for each gate, and the golden probe report |
| `Makefile` | `make world`, `make probes`, `make sections`, `make cut-key`, `make reference`, `make routes`, `make test` |

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
from phase 0, and [the golden probe report](docs/probe-report.md) from the
corridor build.

Three worth reading first. **F1** was wrong twice before it was right. **F12**
found that the Everest golden probe can never pass, because Copernicus GLO-30
reads 111 m below the surveyed summit before the pipeline touches it — a probe
that would have failed forever while looking like a pipeline bug. And **F13**
found that the stand-in world is fifteen times smoother than the real China now
flying over it, which means gate G1's central question has not actually been
asked yet.
