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
