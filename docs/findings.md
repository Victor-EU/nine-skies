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
