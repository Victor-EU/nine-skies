# Room to turn round, and room to fly through

A full-bank reversal needs a level disc of its own diameter with no ground in
it. This is the diameter of the largest such disc the aeroplane's own position
lies inside, at each height above the ground under it — the room to turn round
*in the gorge*, which is what *threading* one means.

Corridor `sea-to-sky` · tiger-leaping-gorge, three-gorges (60 tiles at 90 m)

## The places this grid covers

Not a list in the tool: a hero area is cut to hold named places, so publishing
an area over a place measures it. `shigu` is here because the gorge's area
reaches it, and it is the control — a broad valley on the same river, 41 km up.

| Place | Area | 90 m ground | 1 km grid | wall within 1 km | within 4 km |
| --- | --- | ---: | ---: | ---: | ---: |
| `qutang-gorge` | three-gorges | 158 m | 190 m (+32) | +837 m | +1,247 m |
| `wu-gorge` | three-gorges | 160 m | 354 m (+194) | +964 m | +1,358 m |
| `xiling-gorge` | three-gorges | 158 m | 173 m (+15) | +702 m | +1,397 m |
| `tiger-leaping-gorge` | tiger-leaping-gorge | 1,804 m | 1,910 m (+106) | +903 m | +2,872 m |
| `shigu` | tiger-leaping-gorge | 1,819 m | 1,845 m (+26) | +182 m | +1,136 m |

## Turning room, height by height

Both columns are measured inside the same rectangle, so they compare grids and
not extents. `+` means the area's own edge stopped the disc and the number is a
floor. **0** means the aeroplane is inside the ground at that height.

| Place | Height | 90 m room | 1 km room | reversal at `low` |
| --- | ---: | ---: | ---: | ---: |
| `qutang-gorge` | +100 m | 0.80 km | 0.51 km | 4.02 km |
| `qutang-gorge` | +200 m | 1.02 km | 0.97 km | 4.06 km |
| `qutang-gorge` | +400 m | 1.45 km | 1.66 km | 4.14 km |
| `qutang-gorge` | +800 m | 2.42 km | 3.78 km | 4.31 km |
| `qutang-gorge` | +1,600 m | 28.44+ km | 30.42+ km | 4.69 km |
| `wu-gorge` | +100 m | 0.74 km | **0** km | 4.02 km |
| `wu-gorge` | +200 m | 0.97 km | **0** km | 4.06 km |
| `wu-gorge` | +400 m | 1.61 km | 1.45 km | 4.14 km |
| `wu-gorge` | +800 m | 4.45 km | 11.68 km | 4.32 km |
| `wu-gorge` | +1,600 m | 26.24 km | 32.97 km | 4.69 km |
| `xiling-gorge` | +100 m | 0.90 km | 0.54 km | 4.02 km |
| `xiling-gorge` | +200 m | 1.15 km | 1.02 km | 4.06 km |
| `xiling-gorge` | +400 m | 1.80 km | 1.85 km | 4.14 km |
| `xiling-gorge` | +800 m | 5.25 km | 6.05 km | 4.31 km |
| `xiling-gorge` | +1,600 m | 31.65 km | 32.55 km | 4.69 km |
| `tiger-leaping-gorge` | +100 m | 0.36 km | **0** km | 4.76 km |
| `tiger-leaping-gorge` | +200 m | 0.65 km | 0.74 km | 4.81 km |
| `tiger-leaping-gorge` | +400 m | 1.15 km | 1.37 km | 4.91 km |
| `tiger-leaping-gorge` | +800 m | 2.35 km | 2.26 km | 5.13 km |
| `tiger-leaping-gorge` | +1,600 m | 5.47 km | 6.66 km | 5.59 km |
| `shigu` | +100 m | 1.71 km | 1.21 km | 4.77 km |
| `shigu` | +200 m | 2.20 km | 2.10 km | 4.82 km |
| `shigu` | +400 m | 3.14 km | 3.48 km | 4.92 km |
| `shigu` | +800 m | 5.37 km | 6.29 km | 5.14 km |
| `shigu` | +1,600 m | 26.63 km | 28.53 km | 5.60 km |

## The lowest height at which the turn fits

Climbed in 25 m steps to +2,500 m, on the 90 m grid.
Both sides move with height: the air thins, so the reversal widens as the gorge
does. The right-hand column is the one the challenge turns on — a turn that only
fits above the rim is a turn made out of the gorge.

| Place | Turn | Fits from | Reversal there | Room there | Against the wall |
| --- | --- | ---: | ---: | ---: | --- |
| `qutang-gorge` | low, settled | **+950 m** | 4.38 km | 4.92 km | 113 m above the near rim, 297 m below the far one |
| `qutang-gorge` | low, from cruise | **+1,000 m** | 5.25 km | 5.59 km | 163 m above the near rim, 247 m below the far one |
| `qutang-gorge` | approach, settled | **+700 m** | 2.14 km | 2.17 km | 137 m below the near rim |
| `wu-gorge` | low, settled | **+800 m** | 4.32 km | 4.45 km | 164 m below the near rim |
| `wu-gorge` | low, from cruise | **+825 m** | 5.15 km | 5.16 km | 139 m below the near rim |
| `wu-gorge` | approach, settled | **+550 m** | 2.10 km | 2.11 km | 414 m below the near rim |
| `xiling-gorge` | low, settled | **+750 m** | 4.29 km | 4.72 km | 48 m above the near rim, 647 m below the far one |
| `xiling-gorge` | low, from cruise | **+800 m** | 5.14 km | 5.25 km | 98 m above the near rim, 597 m below the far one |
| `xiling-gorge` | approach, settled | **+525 m** | 2.10 km | 2.17 km | 177 m below the near rim |
| `tiger-leaping-gorge` | low, settled | **+1,625 m** | 5.61 km | 6.30 km | 722 m above the near rim, 1,247 m below the far one |
| `tiger-leaping-gorge` | low, from cruise | **+1,725 m** | 6.93 km | 7.10 km | 822 m above the near rim, 1,147 m below the far one |
| `tiger-leaping-gorge` | approach, settled | **+900 m** | 2.59 km | 2.68 km | 3 m below the near rim |
| `shigu` | low, settled | **+775 m** | 5.12 km | 5.18 km | 593 m above the near rim, 361 m below the far one |
| `shigu` | low, from cruise | **+975 m** | 6.35 km | 8.79 km | 793 m above the near rim, 161 m below the far one |
| `shigu` | approach, settled | **+250 m** | 2.42 km | 2.45 km | 68 m above the near rim, 886 m below the far one |

Nothing here is a gate. Which of the flight model, the speed modes and the
challenge moves is the build plan's open question, and these are the numbers it
was missing rather than an answer to it.

## The whole reach

Everything above is five points, and a course is flown between them. This walks
the river through each area instead. There is no table of reaches: an area is
cut to hold named places on a river, so the course is the lowest ground that
joins them, run out to the area's edge at both ends and kept to its middle. A
flood from the places reaches the edge first at one crossing; the first edge
cell it reaches 5 km clear of all of that crossing is the other. The lower
end is downstream.

| Area | Course | Upstream end | Downstream end | Sill | Places along it |
| --- | ---: | --- | --- | --- | --- |
| `tiger-leaping-gorge` | 105.1 km | 1,834 m, west edge | 1,581 m, north edge | 1,834 m at km 0.0 | `shigu` km 31.7 (59 m off) · `tiger-leaping-gorge` km 82.3 (41 m off) |
| `three-gorges` | 166.1 km | 158 m, west edge | 155 m, east edge | 158 m at km 0.0 | `qutang-gorge` km 23.4 (69 m off) · `wu-gorge` km 60.3 (183 m off) · `xiling-gorge` km 153.3 (55 m off) |

The **sill** is the highest ground the lowest path between the two ends has to
cross. Every path crosses it, so no level flight below it plus the bounce joins
the ends at all, which makes it the one floor here that is a proof rather than a
search result.

`tiger-leaping-gorge`: the sill is the upstream end itself — nothing on the
lowest path between the ends stands above the water where the river enters — so
water can drain the whole way on this grid, and a level over the sill is a
height over the water.

`three-gorges`: the sill is the upstream end itself — nothing on the lowest path
between the ends stands above the water where the river enters — so water can
drain the whole way on this grid, and a level over the sill is a height over the
water.

### The narrowest place, and where a turn round fits

The turning room of the table above at every station of the course, level at
each height over the sill — the same air the run below is searched in. The
narrowest leaves out 1 km at each end, where the area's edge rather than the
ground can be what stops a disc. *Under a wall* is the part of *fits over* with
ground within a kilometre standing above the aeroplane: a turn made in the gorge
rather than over it.

| Area | Level | Narrowest | Where | Reversal at `low` | Fits over | Under a wall |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| `tiger-leaping-gorge` | 1,934 m (+100) | 0.18 km | km 78.0, 4.3 km above `tiger-leaping-gorge` | 4.78 km | 0.0 km | 0.0 km |
| `tiger-leaping-gorge` | 2,034 m (+200) | 0.25 km | km 78.2, 4.1 km above `tiger-leaping-gorge` | 4.83 km | 6.0 km | 0.4 km |
| `tiger-leaping-gorge` | 2,234 m (+400) | 0.72 km | km 79.1, 3.3 km above `tiger-leaping-gorge` | 4.93 km | 8.4 km | 1.0 km |
| `tiger-leaping-gorge` | 2,634 m (+800) | 1.66 km | km 79.6, 2.8 km above `tiger-leaping-gorge` | 5.15 km | 66.1 km | 0.7 km |
| `three-gorges` | 258 m (+100) | 0.36 km | km 21.2, 2.1 km above `qutang-gorge` | 4.02 km | 0.0 km | 0.0 km |
| `three-gorges` | 358 m (+200) | 0.51 km | km 20.9, 2.5 km above `qutang-gorge` | 4.06 km | 0.0 km | 0.0 km |
| `three-gorges` | 558 m (+400) | 0.97 km | km 81.6, 21.4 km below `wu-gorge` | 4.14 km | 20.5 km | 0.0 km |
| `three-gorges` | 958 m (+800) | 2.42 km | km 23.2, at `qutang-gorge` | 4.31 km | 151.6 km | 1.6 km |

### Flying it through

The other reading of *thread*. A pass needs no reversal: it needs the aeroplane
to follow the channel's bends with the turn it has. So it is answered by flying
it — a search over the stick through `flight.ts`'s own `step`, at `low`, level,
each roll input held for 8 frames of 1/30 s, from 1 km inside one end of
the course to 1 km inside the other, with contact wherever the ground the game
draws plus the bounce reaches the aeroplane. *Room either side* is how far to
each side of the track the ground must also stay clear. The flights the search
finds graze the ground, because it asks for clearance and not comfort, so this
is the number that says how exactly a run would have to be flown — and a flight
with room either side is a flight with less, so the widest of 0, 25, 50, 100 m flown
at a level settles every margin under it.

A flight it finds is replayed from its first frame before it is printed, so
*flown* means the model flies it. *Not found* is not a proof: the search keeps
one state per 90 m cell, 3° of heading and 7.5° of bank, and in a channel a few
cells wide the state it dropped can be the one that fits. It is run in two
orders — middle of the channel first, and shortest line first — because each
finds flights the other prunes, and *not found* means neither did. How far
they got is printed beside it, because the place has held where the verdict
has not.

| Area | Level | Flown with | Takes | Not found with | Stalled at | Under a wall |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `tiger-leaping-gorge` | 1,884 m (+50) | — | — | 0 m | km 4.5, 27.2 km above `shigu` (both orders tried every state they kept) | 95 % |
| `tiger-leaping-gorge` | 1,934 m (+100) | — | — | 0 m | km 33.9, 2.1 km below `shigu` (both orders tried every state they kept) | 94 % |
| `tiger-leaping-gorge` | 2,034 m (+200) | **25 m** either side | 1 min 58 s | 50 m | km 78.9, 3.4 km above `tiger-leaping-gorge` (both orders, 400,000 states each) | 88 % |
| `three-gorges` | 208 m (+50) | **25 m** either side | 3 min 31 s | 50 m | km 69.5, 9.2 km below `wu-gorge` (both orders, 400,000 states each) | 99 % |
| `three-gorges` | 258 m (+100) | **50 m** either side | 3 min 31 s | 100 m | km 69.3, 9.0 km below `wu-gorge` (both orders, 400,000 states each) | 99 % |
| `three-gorges` | 358 m (+200) | **100 m** either side | 3 min 32 s | — | — | 90 % |

Nor is a gorge challenge authorable today whatever these numbers say: a patch is
cut from the 1 km grid, `cutPatch` refuses to write one over a hero area, and
the 1 km column of the turning-room table above is why that refusal is right
(D52, F53).
