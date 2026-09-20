# One command rebuilds any subset of the world from source rasters, because a
# pipeline nobody can re-run is a pipeline nobody will fix (build plan, D1).
#
#   make world                      # the phase 0 corridor, end to end
#   make world CORRIDOR=china       # the full country (phase 2, ~70 GB)
#   make probes                     # golden probes against what is built
#   make sections                   # re-cut the committed route sections
#   make routes                     # every expedition flown over the world
#   make test                       # every suite, TypeScript and Python
#
# Source rasters land in data/source/ and intermediates in data/work/, both
# gitignored. Set NINESKIES_DATA to put them on another disk.

CORRIDOR ?= sea-to-sky
VENV := pipeline/.venv
PY := $(VENV)/bin/python
PIPELINE := PYTHONPATH=pipeline $(PY)
WORLD_OUT := dist-world/$(CORRIDOR)

.PHONY: world acquire grid tiles probes sections routes test test-ts test-py typecheck dev clean-work help

help:
	@sed -n '1,10p' Makefile | sed 's/^# \{0,1\}//'

$(PY): pipeline/requirements.txt
	python3 -m venv $(VENV)
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r pipeline/requirements.txt
	@touch $(PY)

## Stage 1 — fetch Copernicus GLO-30 from the AWS Open Data mirror.
acquire: $(PY)
	$(PIPELINE) -m nineskies.acquire --corridor $(CORRIDOR)

## Stage 2 — mosaic and reproject to Albers 1 km.
grid: $(PY)
	$(PIPELINE) -m nineskies.mosaic --corridor $(CORRIDOR)

## Stages 4 and 5 — cut 64 km tiles and reduce the horizon field.
tiles: $(PY)
	$(PIPELINE) -m nineskies.tiles --corridor $(CORRIDOR)

## The gate: golden probes against the built grid, with a report.
probes: $(PY)
	$(PIPELINE) -m nineskies.probe --corridor $(CORRIDOR) \
		--report docs/probe-report.md

## Stage 6 -- cut the committed route sections out of what was built (D21).
## Part of `world` rather than a thing to remember, because a corridor rebuild
## that leaves the sections behind is exactly the drift the gate then reports.
sections:
	npm run content:sections

world: acquire grid tiles probes sections
	@echo "world built: $(WORLD_OUT)"

## The other gate: every authored route flown over real ground. Needs no flag
## and no world -- the ground is committed in content/sections/ -- which is
## what makes it the same check here and in CI.
routes:
	npm run content:validate

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
