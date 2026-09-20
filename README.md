# Nine Skies

A relaxed 3D flying game across a geographically faithful China. See
[the design document](Nine%20Skies%20%E2%80%94%20Game%20Design%20Document.md) for what it is
and [the build plan](Nine%20Skies%20%E2%80%94%20Build%20Plan.md) for how it gets built.

Current stage: **phase 0, foundations**. The simulation is complete and tested;
the terrain spike (build plan D3/D4) and the horizon impostor (D15) are
validated in the browser; the data pipeline is scaffolded but not yet fed real
elevation.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. Controls: `W`/`S` pitch, `A`/`D` roll, `1`/`2`/`3`
for low / cruise / boost, `C` to cycle the horizontal compression (the gate G1
A/B), `H` to toggle the horizon impostor, `R` to reset to the coast.

The world you fly over is **stand-in terrain**, not real elevation — it is
shaped like China's three great steps so the prototype can answer G1's question
before the DEM pipeline lands. Anything it says about a specific place is
fiction; see `engine/src/terrain/syntheticTiles.ts`.

```bash
npm run check     # typecheck + tests + content validation
npm test          # 110 unit tests
```

## Layout

| Path | What |
| --- | --- |
| `engine/src/sim` | Atmosphere, aircraft performance, arcade flight model, world scale |
| `engine/src/terrain` | Shared grid, heightmap texture array, shaders, streaming, horizon impostor |
| `app` | Prototype shell: renderer, chase camera, HUD, framebuffer probes |
| `content` | Card schema and validator |
| `pipeline` | Offline DEM → tile pipeline (Python + GDAL) |
| `test` | Unit tests, including the golden reference tables |
| `docs` | Running findings for each gate |

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

**Colour and light live in one file.** The hypsometric ramp, the aerial
perspective integral and the ground lighting are shared GLSL chunks, because
the terrain and the horizon impostor drawing the same mountain have to agree
about it — and because a colour stop is a factual claim. See
`engine/src/terrain/palette.ts`.

## Findings so far

[docs/prototype-findings.md](docs/prototype-findings.md) — nine findings from
phase 0. The one worth reading first is F1, which was wrong twice before it was
right, and F9, which had been invisible under everything else for the whole
spike.
