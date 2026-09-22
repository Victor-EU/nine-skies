# Two grids, and what is authored over them

The game draws 90 m ground over a hero area and 1 km ground everywhere else.
Every committed section and patch is cut from the 1 km grid. This is what
that costs where the two overlap, and what is authored over them today.

Corridor `sea-to-sky` · tiger-leaping-gorge, three-gorges (60 tiles at 90 m)

## Where the two grids disagree

Sampled every 250 m across each area. `90 m above 1 km` is the
direction that matters: there, a clearance check reading the 1 km grid passes
over ground the aeroplane actually meets.

| Area | Points | Mean gap | 90 m above 1 km | where | 1 km above 90 m | where |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| tiger-leaping-gorge | 51,245 | 72.0 m | **557 m** | 2982, 1086 km | 523 m | 2981, 1065 km |
| three-gorges | 76,867 | 77.2 m | **628 m** | 4000, 1503 km | 568 m | 3886, 1490 km |

## What is authored over them

| Content | Checked points | Over 90 m ground |
| --- | ---: | ---: |
| expedition `sea-to-sky` | 2932 stations | 0 |
| challenge `high-airfield` | 1726 cells | 0 |

A non-zero count in the right-hand column is a failure rather than a note, and
`cutSection` and `cutPatch` refuse to write the artefact that would carry it.
They refuse rather than cutting from the finer grid because which grid content
comes from is an open decision: changing it re-signs every committed section and
patch at once (D23, D24, F51, F53).
