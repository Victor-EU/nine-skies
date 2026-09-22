# One command rebuilds any subset of the world from source rasters, because a
# pipeline nobody can re-run is a pipeline nobody will fix (build plan, D1).
#
#   make world                      # the phase 0 corridor, end to end
#   make world CORRIDOR=china       # the full country (phase 2, ~70 GB)
#   make hero                       # the 90 m hero areas (stage 6)
#   make siting                     # every shipped coordinate, against the source
#   make probes                     # golden probes against what is built
#   make hydro                      # where the water cannot go, and the river it has
#   make sources                    # record the source raster digests
#   make sections                   # re-cut the committed route sections
#   make patches                    # re-cut the committed ground under each challenge
#   make cut-key                    # generate this machine's cutting key
#   make reference                  # re-cut the projection reference table
#   make routes                     # every expedition flown over the world
#   make sessions                   # what a playtest session of N minutes contains
#   make teaches                    # what each route shows against what it claims
#   make atlas                      # what the journal can show, and what it cannot yet
#   make challenges                 # every authored challenge flown, and whether it can be done
#   make ground                     # the two grids, and what is authored over them
#   make gorges                     # room to turn round in a gorge, and to fly through it
#   make stations                   # re-cut where the frame budget is measured
#   make test                       # every suite, TypeScript and Python
#
# Source rasters land in data/source/ and intermediates in data/work/, both
# gitignored. Set NINESKIES_DATA to put them on another disk.

CORRIDOR ?= sea-to-sky
VENV := pipeline/.venv
PY := $(VENV)/bin/python
PIPELINE := PYTHONPATH=pipeline $(PY)
WORLD_OUT := dist-world/$(CORRIDOR)

.PHONY: world acquire grid tiles hero siting probes hydro sources sections patches cut-key reference routes sessions teaches atlas challenges ground gorges stations test test-ts test-py typecheck dev clean-work help

# Prints the whole leading comment block, however long it grows. It used to
# print the first ten lines, which stopped being all of them some targets ago
# and silently hid the rest.
help:
	@awk '/^#/ { sub(/^# ?/, ""); print; next } { exit }' Makefile

$(PY): pipeline/requirements.txt
	python3 -m venv $(VENV)
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r pipeline/requirements.txt
	@touch $(PY)

## Stage 1 — fetch Copernicus GLO-30 from the AWS Open Data mirror.
acquire: $(PY)
	$(PIPELINE) -m nineskies.acquire --corridor $(CORRIDOR)

## The digests of the source rasters, checked against the mirror's own ETags
## (D24). One HEAD per tile and no download; needs the rasters on disk. The
## build refuses to run on tiles that do not match what this recorded, so a
## corridor is always built from nameable bytes.
sources: $(PY)
	$(PIPELINE) -m nineskies.sources --corridor $(CORRIDOR)

## Stage 2 — mosaic and reproject to Albers 1 km.
grid: $(PY)
	$(PIPELINE) -m nineskies.mosaic --corridor $(CORRIDOR)

## Stages 4 and 5 — cut 64 km tiles and reduce the horizon field.
tiles: $(PY)
	$(PIPELINE) -m nineskies.tiles --corridor $(CORRIDOR)

## The gate: golden probes against every built grid, with a report each.
## Both, because a probe deferred from the 1 km grid to the 90 m one is only
## answered on the second -- run one of these and the seventh probe is
## invisible again, which is the failure F49 found in the first place. The
## hero report also reads each area's source mosaic, so the sill under a river
## probe's pass has the source's beside it (F58).
probes: $(PY)
	$(PIPELINE) -m nineskies.probe --corridor $(CORRIDOR) \
		--report docs/probe-report.md
	$(PIPELINE) -m nineskies.probe --area all \
		--report docs/probe-report-hero.md

## Stage 3's measurement half, which is all of stage 3 that needs no
## download. Priority-floods the built grid to find where water cannot
## leave, then follows the drainage tree the fill grew along to the grid's
## own largest river -- a centreline the Yangtze probe has never had, and
## which is checked against nine places sited independently of it (D55, F56).
##
## A report and never a gate. The centreline finds 1,980 uphill kilometres
## in a river the seven-waypoint chord passes clean, and a probe that fails
## on purpose is not a probe: what carves them is stage 3 proper, which
## still wants the fetch.
hydro: $(PY)
	$(PIPELINE) -m nineskies.hydro --corridor $(CORRIDOR) \
		--report docs/hydro-report.md

## The projection table the engine checks itself against (D22). Needs PROJ
## rather than a built world: it is the pipeline publishing the one thing only
## it owns, so that `projectAlbers` can be checked without either.
reference: $(PY)
	$(PIPELINE) -m nineskies.reference

## Stage 6 -- the 90 m hero areas over a handful of named places. Not a
## fidelity preference: the seventh golden probe cannot pass on the 1 km grid,
## where the Jinsha runs 221 m uphill through Tiger Leaping Gorge (F49, F50).
## `--list` says which areas are sited, which have their source cells, and
## which the build plan names but nothing has ever given a checked coordinate.
hero: $(PY)
	$(PIPELINE) -m nineskies.hero --corridor $(CORRIDOR)

## Where a coordinate goes, measured off the source rather than recalled.
## `probes` asks the same question of the built world, which is 1 km ground
## and cannot tell a gorge from the county it sits in; this asks it at 30 m,
## where it can. Twice a coordinate written from memory has been wrong in a
## way nothing caught (F49, F50), and the three Yangtze gorges are the first
## that were measured out instead (F52).
##
## The module also has `drama`, `scan`, `pools` and `walls` for siting the
## next one -- see its docstring.
siting: $(PY)
	$(PIPELINE) -m nineskies.siting places --report docs/siting-report.md

## Cut the committed route sections out of what was built (D21). Not one of
## workstream A's numbered stages -- it cuts content out of the world rather
## than building the world -- and it used to be labelled "Stage 6" here, which
## is the number the hero grid above actually has.
## Part of `world` rather than a thing to remember, because a corridor rebuild
## that leaves the sections behind is exactly the drift the gate then reports.
sections:
	npm run content:sections

## Cut the committed ground patches out of what was built (D39), and see the
## note above about the numbering.
## The challenge equivalent of `sections`, and the one place in this repository
## where cutting an artefact also flies it: only a few hundred of a patch's
## cells are ever read and which ones depends on a flight, so the guarantee
## cannot come from the geometry. A patch that does not fly like the world it
## came from is refused rather than written.
patches:
	npm run content:patches

## The key a section is signed with (D23). Run once per machine that builds
## worlds; the public half is committed and the private half never is. A
## machine that only reads sections -- CI, a writer's laptop -- needs neither.
cut-key:
	npm run content:cut-key

world: acquire sources grid tiles hero siting probes hydro sections patches ground gorges
	@echo "world built: $(WORLD_OUT)"

## The other gate: every authored route flown over real ground. Needs no flag
## and no world -- the ground is committed in content/sections/ -- which is
## what makes it the same check here and in CI.
routes:
	npm run content:validate

## What a cohort actually flies. MINUTES=12 is the G1 protocol; G2 flies the
## whole expedition. Reads the committed sections, so it needs no world and
## the answer is the same everywhere (D17, F28).
MINUTES ?= 12
sessions:
	npm run content:sessions -- $(MINUTES)

## The claimed lesson against the measured ground (G2, F29). A report and
## never a gate: a route crossing honest ground is not broken by a sentence
## written above it, and which of the two moves is a writing decision.
teaches:
	npm run content:teaches

## The planned atlas against the trigger that exists (F40). Counts the 228
## entries by how each is meant to fire, the regions that hold anything, the
## entries with no authored hint, and the comparison spreads -- of which G2
## scores one. A report, for the same reason: every gap it finds is closed by
## writing rather than by code.
atlas:
	npm run content:atlas

## Every authored challenge flown by an autopilot, and whether it can be done
## at all (D38). Unlike `atlas` and `teaches` this one is a gate: a challenge
## whose objectives cannot be met, or whose gate is narrower than the
## aeroplane's own turn, is broken rather than unwritten. Needs no world and no
## flag: the ground is committed in content/patches/ (D39), which is what makes
## it the same check here and in CI.
challenges:
	npm run content:challenges

## The two elevation grids this world has, and which of them every authored
## thing is checked against. Last in `world` because it reads the artefacts
## the two cutters above have just written.
##
## A report and a gate at once, in the sense that the gate is elsewhere: the
## cutters refuse to write a section or a patch over a hero area, so the only
## thing this can ever print in its right-hand column is zero. What it is for
## is saying so out loud. The cockpit prefers the 90 m grid and every
## committed artefact is cut from the 1 km one, and through Tiger Leaping
## Gorge the fine grid stands 374 m above the coarse -- more than the 333 m
## Expedition 1 clears its own worst terrain by (F53).
ground:
	npm run content:ground

## Whether the GDD's *thread a gorge at low speed* has a gorge to be threaded
## in, both ways of reading *thread*. Turning round: a full-bank reversal needs
## a level disc of its own diameter with no ground in it, so this measures the
## largest such disc the aeroplane's own position lies inside, at heights above
## the water, on both grids -- at the places, and then at every station of the
## river's course through each area. Flying through: a search over the stick,
## through the flight model's own step, for any flight down the whole course.
## The searches make it the slowest report here, three or four minutes.
##
## A report and never a gate: every number feeds the open question of which
## reading the challenge means and which of the flight model, the speed modes
## and the challenge moves (F43, F55, F57). Needs the 90 m cover -- on the 1 km
## grid a hundred metres over the Three Gorges is inside the hill that grid
## draws there, so the answer would be about resampling rather than about a
## gorge.
gorges:
	npm run content:gorges

## Where the frame budget is measured (D25). Cut from the route, committed,
## and deliberately not part of `world`: a capture is only worth taking if it
## can be compared to the last one, and stations that move underneath two
## milestones make a regression and an improvement look the same.
##
## Taking the capture itself needs a GPU and a browser, so it is not a target:
##   make dev, then in the console
##   __ns.frameCost().then((r) => console.log(__ns.frameCostTable(r)))
stations:
	npm run content:stations

typecheck:
	npm run typecheck

test-ts:
	npm test

test-py: $(PY)
	$(PY) -m unittest discover -s pipeline/tests

test: typecheck test-ts test-py routes

dev:
	npm run -w app dev

## Intermediates only. Never touches data/source/, which took an hour to fetch.
clean-work:
	rm -rf data/work dist-world
