"""Run the golden probes against a built grid, and write a report.

The unit suite tests probe *logic* against a synthetic sampler and runs
anywhere. This runs the same probes against ~14 GB of real elevation and
cannot run in CI, so it writes `docs/probe-report.md` — the artefact that
carries the result to somebody who does not have the data.
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from . import hydro, places, probes
from .acquire import data_root
from .sample import GridSampler, SourceSampler

#: How far a river waypoint may be from the cell that holds its channel.
CHANNEL_RADIUS_KM = 2.0

def channel_tolerance_m(resolution_m: float) -> float:
    """How far an `on_channel` place may stand above the water, by cell size.

    **Not zero, and not a constant.** The metric is the point against the
    lowest ground in a window reaching 2.83 km, and two things lift it that
    have nothing to do with the coordinate. A river falls: through Tiger
    Leaping Gorge the Jinsha drops 46 m across that window at the source's
    own 30 m. And a grid loses the channel in proportion to its cell, because
    a cell wider than the water is mostly not water — the same waypoint reads
    63 m at 90 m and **186 m at 1 km**, on ground that has not moved.

    Measured at those three resolutions the floor is about `42 + 0.14 * cell`,
    so this is twice that, rounded: every honest reading sits near half of it
    at every resolution, and F50's fault — a waypoint **1,260 m** up the gorge
    wall — clears it by 3.4x even on the coarsest grid here. A fixed 200 m
    would have passed the 1 km reading by 14 m, which is a threshold that
    happens not to have fired rather than one that holds.
    """
    return 100.0 + 0.3 * resolution_m

#: Spacings the monotonic chord is re-walked at, to show what the verdict at
#: the waypoints is worth. Not a gate: see `monotonic_sensitivity`.
STRIDE_SWEEP_KM = (500.0, 100.0, 25.0, 5.0, 1.0)

#: Channel search radii the same verdict is re-taken at. Zero is a bare point
#: sample, which is the control: if the verdict never moves, the search is not
#: what is producing it.
RADIUS_SWEEP_KM = (0.0, 2.0, 5.0, 10.0, 25.0)


def reads(probe) -> tuple[tuple[float, float], ...]:
    """The coordinates a probe samples, for asking whether it can read at all.

    Not the same question as `runnable_on`, which is a declaration about a
    *grid*. This is about one artefact: the hero grid is not one raster but a
    handful of small ones, and a probe declared runnable on it is only
    runnable on the area that contains its subject.
    """
    if isinstance(probe, probes.MonotonicProbe):
        return tuple(probe.waypoints)
    if isinstance(probe, probes.AreaRatioProbe):
        return (probe.north_end, probe.south_end)
    return ((probe.lat, probe.lon),)


def on_this_artefact(sampler: GridSampler, probe) -> tuple[bool, int, int]:
    """(readable, points off the raster, points in all).

    The fault this exists to stop is F44's, one artefact along. A probe whose
    subject is nowhere near this raster reads NaN at every waypoint, and NaN
    fails every comparison a check makes — so *monotonic non-increasing* over
    nothing at all comes back `pass`. It did: adding a second hero area made
    the Tiger Leaping Gorge probe run against the Three Gorges, 1,200 km away,
    where it read nothing and passed (F52). One area had hidden it, because
    the only area there was happened to contain the only probe there was.
    """
    points = reads(probe)
    missing = sum(1 for lat, lon in points if math.isnan(sampler.elevation_m(lat, lon)))
    return missing == 0, missing, len(points)


@dataclass(frozen=True)
class Reach:
    """Two consecutive cells a monotonic check compares, and the sill between.

    `None` throughout when the check cannot read one of the two here: a
    probe half on an artefact still runs, and still fails, and its table
    should say where rather than crash on the half it cannot see.
    """

    first: int
    on: str
    upstream_m: float | None = None
    downstream_m: float | None = None
    sill_m: float | None = None
    #: (lat, lon) of the cell that sets the sill, and whether it is the
    #: upstream cell itself.
    where: tuple[float, float] | None = None
    at_upstream: bool = False

    @property
    def over_m(self) -> float | None:
        """How far the sill stands over the upstream cell; never below zero."""
        if self.sill_m is None or self.upstream_m is None:
            return None
        return self.sill_m - self.upstream_m


def reaches(sampler, probe, source: SourceSampler | None = None) -> list[Reach]:
    """The sill between each two consecutive cells a monotonic check compares.

    **What a pass covers, from the ground rather than from the chord.** The
    check reads one cell near each waypoint and asks that each is no higher
    than the last. Between two of those cells every path -- the river's, the
    chord's, any other -- crosses the sill, so a sill above the upstream cell
    means no path between them runs downhill on this grid, however finely it
    is walked (F58). The chord walk cannot say that, because the chord
    crosses country the river goes around, and a denser chord fails on
    ground that is not river.

    With `source`, the same question is asked of the source cells a hero area
    was cut from, between the lowest of them inside the same two windows the
    grid's check reads. A sill in both is the source's; what differs between
    the two is what the grid added.
    """
    rasters: list[tuple[str, object, list[int | None]]] = [(
        f"this grid, {sampler.resolution_m:,.0f} m",
        sampler,
        [sampler.channel_cell(lat, lon, CHANNEL_RADIUS_KM) for lat, lon in probe.waypoints],
    )]
    if source is not None:
        cells: list[int | None] = []
        for lat, lon in probe.waypoints:
            box = sampler.window_m(lat, lon, CHANNEL_RADIUS_KM)
            cells.append(None if box is None else source.lowest_within(*box))
        rasters.append((source.LABEL, source, cells))

    out: list[Reach] = []
    for label, raster, cells in rasters:
        pairs = list(zip(cells, cells[1:]))
        readable = [(a, b) for a, b in pairs if a is not None and b is not None]
        found = iter(hydro.sills(raster.array, readable))
        flat = raster.array.ravel()
        for first, (a, b) in enumerate(pairs):
            if a is None or b is None:
                out.append(Reach(first, label))
                continue
            crossing = next(found)
            if crossing is None:
                out.append(Reach(first, label, float(flat[a]), float(flat[b])))
                continue
            out.append(Reach(
                first, label, float(flat[a]), float(flat[b]), crossing.level_m,
                raster.cell_latlon(crossing.at), crossing.at == a,
            ))
    return out


def dammed(found: list[Reach], on: str) -> list[Reach]:
    """The reaches on one raster whose sill stands above their upstream cell.

    From half a metre, which is where the table's whole metres stop printing
    zero: a reach reported as dammed by 0 m would contradict itself on the
    page. It is a threshold on what is called a dam, not on what is printed.
    """
    return [r for r in found if r.on == on and (r.over_m or 0.0) >= 0.5]


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle kilometres, which is plenty for saying where a sill is."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def _nearest(point: tuple[float, float], probe, first: int) -> str:
    """Where a sill is, against the nearest thing a reader can find.

    The reach's own two waypoints and every place in `places.py`, so a sill
    in a sited gorge is named by the gorge rather than by its distance from
    a city a hundred kilometres off. A waypoint that is a place is named by
    its id; one that is not, by its number.
    """
    named: list[tuple[str, tuple[float, float]]] = []
    for k in (first, first + 1):
        waypoint = tuple(probe.waypoints[k])
        ids = [p.id for p in places.PLACES if (p.lat, p.lon) == waypoint]
        named.append((f"`{ids[0]}`" if ids else f"waypoint {k + 1}", waypoint))
    named += [(f"`{p.id}`", (p.lat, p.lon)) for p in places.PLACES]
    name, where = min(named, key=lambda item: _km(point, item[1]))
    return f"{_km(point, where):.1f} km from {name}"


def run(
    sampler: GridSampler,
    phase: probes.Phase = "corridor",
    grid: probes.Grid = "country",
    source: SourceSampler | None = None,
) -> tuple[list[str], list[str]]:
    """Returns (failures, report lines)."""
    failures: list[str] = []
    lines: list[str] = []

    runnable = probes_by_type(phase, grid)
    elsewhere: list = []
    for kind, group in runnable.items():
        keep = []
        for probe in group:
            readable, missing, total = on_this_artefact(sampler, probe)
            if readable:
                keep.append(probe)
            elif missing == total:
                elsewhere.append(probe)
            else:
                # Half on and half off is worse than all off: the check would
                # return a verdict on the half it can see. It runs, and it
                # fails, and the NaNs in its own table say where.
                failures.append(
                    f"{probe.name}: {missing} of {total} points it reads are "
                    f"off the edge of this artefact"
                )
                keep.append(probe)
        runnable[kind] = keep

    lines.append("| Probe | Expected | Measured | Result |")
    lines.append("| --- | ---: | ---: | --- |")

    for probe in runnable["point"]:
        got = sampler.elevation_m(probe.lat, probe.lon)
        problem = probe.check(got)
        if problem:
            failures.append(problem)
        published = ""
        if probe.published_m is not None and abs(probe.published_m - probe.expected_m) > 1:
            published = f" (published {probe.published_m:,.0f} m)"
        lines.append(
            f"| {probe.name} | {probe.expected_m:,.0f} m "
            f"± {probe.tolerance_m:.0f}{published} | {got:,.1f} m | "
            f"{'FAIL' if problem else 'pass'} |"
        )

    for probe in runnable["flat"]:
        mean, std = sampler.disc_stats(probe.lat, probe.lon, probe.radius_km)
        bad = (
            abs(mean - probe.expected_m) > probe.tolerance_m
            or std > probe.max_std_dev_m
        )
        if bad:
            failures.append(
                f"{probe.name}: {mean:.1f} m ± {std:.1f} sd, "
                f"expected {probe.expected_m} ± {probe.tolerance_m}, sd < {probe.max_std_dev_m}"
            )
        lines.append(
            f"| {probe.name} | {probe.expected_m:,.0f} m, sd < {probe.max_std_dev_m} "
            f"| {mean:,.1f} m, sd {std:.1f} | {'FAIL' if bad else 'pass'} |"
        )

    for probe in runnable["monotonic"]:
        raw = [sampler.elevation_m(lat, lon) for lat, lon in probe.waypoints]
        channel = [sampler.channel_m(lat, lon, CHANNEL_RADIUS_KM) for lat, lon in probe.waypoints]
        problem = probe.check(channel)
        if problem:
            failures.append(problem)
        lines.append(
            f"| {probe.name} | monotonic non-increasing | "
            f"{len(probe.waypoints)} waypoints | "
            f"{'FAIL' if problem else 'pass'} |"
        )
        lines.append("")
        found = reaches(sampler, probe, source)
        grid_label = found[0].on if found else ""
        dams = dammed(found, grid_label)
        readable = [r for r in found if r.on == grid_label and r.sill_m is not None]
        verdict = "passes" if not problem else "fails"
        if dams:
            worst = max(r.over_m for r in dams)
            if len(readable) == 1:
                which = "its one reach is"
            elif len(dams) == len(readable):
                which = f"all {len(readable)} of its reaches are"
            else:
                which = f"{len(dams)} of its {len(readable)} reaches are"
            crossing = (
                f"every path from that reach's upstream cell to its downstream "
                f"one crosses a sill {worst:,.0f} m above the upstream cell"
                if len(dams) == 1
                else f"in each, every path from the upstream cell to the "
                f"downstream one crosses a sill above the upstream cell, by as "
                f"much as {worst:,.0f} m"
            )
            lines.append(
                f"**It {verdict} at the cells it reads, and {which} dammed on "
                f"this grid:** {crossing}, so none of them runs downhill. "
                f"*What this verdict covers*, below, says where (F58)."
            )
        elif readable:
            lines.append(
                f"**It {verdict} at the cells it reads**, and no reach between "
                f"them crosses a sill above its upstream cell on this grid — "
                f"which rules out a dam, and does not by itself make any path "
                f"run downhill (F58)."
            )
        lines.append("")
        lines.append(
            f"The channel minimum is what is checked, over a square window "
            f"{CHANNEL_RADIUS_KM:.0f} km to a side's half-width — so "
            f"{CHANNEL_RADIUS_KM * 2 ** 0.5:.2f} km into the corners. A 1 km "
            f"cell straddling a gorge reports the wall as readily as the "
            f"water. A waypoint quoted to two decimals is ±550 m from where "
            f"it means, which is why the two on the channel carry four. The "
            f"point sample beside it is what the search "
            f"is worth: the gap between the columns *is* the damage "
            f"resampling does to a river, which stage 3 carves back where a "
            f"mapped river runs (F61). What the search must never be is the thing producing the "
            f"verdict — F50 found this probe reading the Jinsha only because "
            f"a 2 km disc reached it from a waypoint 1,260 m up the gorge "
            f"wall, with the minimum sitting at the rim of the disc at every "
            f"resolution. Both its waypoints are on the water now, and the "
            f"sweep below is where that shows."
        )
        lines.append("")
        lines.append("| Waypoint | Point sample | Channel minimum | Drop |")
        lines.append("| --- | ---: | ---: | ---: |")
        previous: float | None = None
        for (lat, lon), r, c in zip(probe.waypoints, raw, channel):
            drop = "—" if previous is None else f"{c - previous:,.0f} m"
            previous = c
            lines.append(
                f"| {lat:.4f} N, {lon:.4f} E | {r:,.0f} m | {c:,.0f} m | {drop} |"
            )
        lines.append("")
        lines.extend(monotonic_sensitivity(sampler, probe, found))

    place_failures, place_lines = named_places(sampler)
    failures.extend(place_failures)
    lines.extend(place_lines)

    if elsewhere:
        if lines and lines[-1] != "":
            lines.append("")
        lines.append("### Not on this artefact")
        lines.append("")
        lines.append(
            "Runnable on this grid, but their subject is not inside this "
            "raster. Listed rather than skipped, on the same rule as the "
            "table below: a probe that reads nothing and reports `pass` is "
            "the worst of the three outcomes, and NaN compares false against "
            "every threshold a check can set (F52)."
        )
        lines.append("")
        lines.append("| Probe | Where it reads |")
        lines.append("| --- | --- |")
        for probe in elsewhere:
            where = ", ".join(f"{lat:.2f} N {lon:.2f} E" for lat, lon in reads(probe))
            lines.append(f"| {probe.name} | {where} |")
        lines.append("")

    deferred = probes.deferred_on(phase, grid)
    if deferred:
        if lines and lines[-1] != "":
            lines.append("")  # a table butted against a heading stops being one
        lines.append(f"### Not runnable on the {grid} grid")
        lines.append("")
        lines.append(
            "These probes have data built for this phase but cannot be read "
            "from this artefact. They are listed rather than skipped silently, "
            "because a probe that quietly does not run is worse than one that "
            "fails."
        )
        lines.append("")
        lines.append("| Probe | Needs | Why |")
        lines.append("| --- | --- | --- |")
        for probe in deferred:
            lines.append(
                f"| {probe.name} | {getattr(probe, 'grid', 'country')} grid | "
                f"{getattr(probe, 'note', '') or 'sampled from another artefact'} |"
            )
        lines.append("")

    return failures, lines


def monotonic_sensitivity(sampler: GridSampler, probe, found: list[Reach]) -> list[str]:
    """What the pass above is worth: a coverage figure, the sills, two sweeps.

    A verdict with no sensitivity beside it reads as a fact about the world.
    These tables say which parts of it are facts about the probe, and they
    are printed on a pass as readily as on a failure -- a probe that only
    explains itself when it fails has already been believed (F48).
    """
    lines: list[str] = ["#### What this verdict covers", ""]

    # Counted from the windows the search reads, not from a cell size beside
    # it: this line used to take the 1 km grid's constant, and on the 90 m
    # grid it said 50 cells where the search read 4,418 (F58).
    cells = sampler.array.size
    read = sampler.cells_read(probe.waypoints, CHANNEL_RADIUS_KM)
    lines.append(
        f"The check above reads **{read:,} cells of {cells:,}** — "
        f"{read / cells * 100:.4f} % of the built grid — at {len(probe.waypoints)} "
        f"waypoints with a {CHANNEL_RADIUS_KM:.0f} km search around each. "
        f"{probe.note}"
    )
    lines.append("")

    lines.extend(sill_table(probe, found))

    lines.append(
        f"**Walked more finely, along the same chord.** The {len(probe.waypoints)} "
        f"waypoints are a hand-placed line across country, not a centreline, "
        f"so the straight reach between two of them crosses ground the river "
        f"goes around. Read this as the spacing at which the chord stops "
        f"being a river, and not as a hydrology result: it is why the probe "
        f"cannot simply be densified. The sills above are the hydrology "
        f"result — they do not depend on the chord — and a reach dammed "
        f"there fails at every spacing along every path, which is why stage "
        f"3 is the fix. A two-waypoint probe fails the walk sooner than a "
        f"seven-waypoint one for the same reason a short chord is no "
        f"straighter than a long one."
    )
    lines.append("")
    lines.append("| Spacing | Samples | Uphill steps | Total uphill | Verdict |")
    lines.append("| --- | ---: | ---: | ---: | --- |")
    for stride in STRIDE_SWEEP_KM:
        profile = sampler.walk(probe.waypoints, stride, CHANNEL_RADIUS_KM)
        rises = [
            profile[i + 1] - profile[i]
            for i in range(len(profile) - 1)
            if profile[i + 1] > profile[i] + 1e-6
        ]
        lines.append(
            f"| {stride:,.0f} km | {len(profile):,} | {len(rises):,} | "
            f"{sum(rises):,.0f} m | {'pass' if not rises else 'would fail'} |"
        )
    lines.append("")

    lines.append(
        "**The same verdict at other search radii.** Zero is a bare point "
        "sample. If the verdict does not move, the channel search is not "
        "what produces it and its justification above is describing "
        "machinery that changes nothing."
    )
    lines.append("")
    lines.append("| Search radius | Verdict |")
    lines.append("| --- | --- |")
    for radius in RADIUS_SWEEP_KM:
        profile = [
            sampler.elevation_m(lat, lon)
            if radius <= 0
            else sampler.channel_m(lat, lon, radius)
            for lat, lon in probe.waypoints
        ]
        problem = probe.check(profile)
        label = "point sample" if radius <= 0 else f"{radius:,.0f} km"
        lines.append(f"| {label} | {'FAIL' if problem else 'pass'} |")
    lines.append("")
    return lines


def sill_table(probe, found: list[Reach]) -> list[str]:
    """The sills between the cells a monotonic check compares, as a table."""
    if not found:
        return []
    labels = list(dict.fromkeys(r.on for r in found))
    lines = [
        "**Along the lowest ground there is, rather than along the chord.** "
        "The check compares one cell near each waypoint, the lowest in its "
        "window. Between two of them the ground has a *sill*: the highest "
        "ground on the lowest path that joins them, found by flooding from "
        "one cell until the water reaches the other, eight neighbours to a "
        "cell. Every path between the two crosses it, so a sill above the "
        "upstream cell means that nothing between the two cells this check "
        "compares runs downhill, however finely it is walked. A sill level "
        "with its upstream cell proves nothing the other way: the lowest path "
        "never stands above where it started, and it can still fall and rise "
        "on the way.",
        "",
    ]
    if len(labels) > 1:
        lines += [
            "The source rows ask the same question of the 1″ cells this area "
            "was cut from, over the same footprint, between the lowest source "
            "cells inside the same two windows. A sill in both is the "
            "source's; the difference between the two is what the grid added "
            "to it (F58).",
            "",
        ]
    lines += [
        "| Reach | Read on | Compared | Sill | Over the upstream cell | Where the sill is |",
        "| --- | --- | ---: | ---: | ---: | --- |",
    ]
    for label in labels:
        for r in (r for r in found if r.on == label):
            reach = f"{r.first + 1} → {r.first + 2}"
            if r.upstream_m is None or r.downstream_m is None:
                lines.append(f"| {reach} | {label} | — | — | — | not on this artefact |")
                continue
            compared = f"{r.upstream_m:,.0f} m → {r.downstream_m:,.0f} m"
            if r.sill_m is None or r.where is None:
                lines.append(f"| {reach} | {label} | {compared} | — | — | nothing joins them |")
                continue
            if r.at_upstream:
                where = "the upstream cell itself"
            else:
                where = (
                    f"{r.where[0]:.4f} N, {r.where[1]:.4f} E, "
                    f"{_nearest(r.where, probe, r.first)}"
                )
            lines.append(
                f"| {reach} | {label} | {compared} | {r.sill_m:,.0f} m | "
                f"{r.over_m:,.0f} m | {where} |"
            )
    lines.append("")
    return lines


def named_places(sampler: GridSampler) -> tuple[list[str], list[str]]:
    """What the built world reads at every place in `places.py`.

    A table of coordinates cannot tell you one of them is in the wrong
    valley; elevation can. The relief column is the one that does it: a place
    whose landform says `gorge` and whose surroundings are a gentle slope is
    either the wrong coordinate or the wrong name, and for two years one of
    them was — `tiger-leaping-gorge` sat 71 km from the gorge, in a highland
    with 1,642 m of relief where the gorge has 3,823 (F49). This table is
    what would have caught it, so it prints on every run.

    Returns (failures, lines): a place that promises `on_channel` and is not
    fails the run, because a river probe reading from a cliff is a green
    verdict about nothing (F50).
    """
    tolerance = channel_tolerance_m(sampler.resolution_m)
    lines = ["### Named places, as the built world reads them", ""]
    lines.append(
        "`places.py` is the one table these coordinates come from — the "
        "manifest's anchors, the golden probes' named waypoints and the "
        "committed projection reference all read it, so a place has one "
        "coordinate in this repository. What it cannot check is whether that "
        "coordinate is where the name says; the two right-hand columns are "
        "what a reader checks that against."
    )
    lines.append("")
    lines.append(
        "| Place | Claims to be | Ground | Lowest within 2 km | Above it | "
        "Relief in a 20 km box |"
    )
    lines.append("| --- | --- | ---: | ---: | ---: | ---: |")
    failures: list[str] = []
    for place in places.PLACES:
        point = sampler.elevation_m(place.lat, place.lon)
        if point != point:  # off this corridor
            lines.append(
                f"| {place.name} | {place.landform} | — | — | — | outside this build |"
            )
            continue
        low = sampler.channel_m(place.lat, place.lon, CHANNEL_RADIUS_KM)
        above = point - low
        relief = sampler.relief_m(place.lat, place.lon, 10.0)
        mark = ""
        if place.on_channel:
            bad = above > tolerance
            mark = " **off the water**" if bad else " on the water"
            if bad:
                failures.append(
                    f"{place.name}: claims to be on the channel but stands "
                    f"{above:,.0f} m above the lowest ground within "
                    f"{CHANNEL_RADIUS_KM:.0f} km, over the {tolerance:,.0f} m "
                    f"this grid's {sampler.resolution_m:,.0f} m cells allow"
                )
        lines.append(
            f"| {place.name} | {place.landform} | {point:,.0f} m | "
            f"{low:,.0f} m | {above:,.0f} m{mark} | {relief:,.0f} m |"
        )
    lines.append("")
    lines.append(
        f"**Above it** is the column F50 added, and it is the one that would "
        f"have caught F50: relief cannot separate a gorge floor from the "
        f"cliff over it, because both sit in the same 20 km box and both "
        f"report ~3,800 m. A place marked `on_channel` in `places.py` "
        f"promises to be on the water and is held to {tolerance:,.0f} m of it "
        f"on this grid's {sampler.resolution_m:,.0f} m cells — the waypoint "
        f"this probe used to carry stood **1,260 m** above the Jinsha and "
        f"passed every check there was. The tolerance scales with the cell "
        f"because the floor of this measurement does: a river falls (46 m "
        f"through this gorge at the source's 30 m, 1 m at Shigu where the "
        f"same river runs flat) and a cell wider than the water is mostly "
        f"not water (63 m at 90 m, 186 m at 1 km, on ground that has not "
        f"moved). A column that read zero on a steep river would be "
        f"measuring something else."
    )
    lines.append("")
    return failures, lines


def probes_by_type(
    phase: probes.Phase, grid: probes.Grid = "country"
) -> dict[str, list]:
    runnable = probes.runnable_on(phase, grid)
    return {
        "point": [p for p in runnable if isinstance(p, probes.PointProbe)],
        "flat": [p for p in runnable if isinstance(p, probes.FlatnessProbe)],
        "monotonic": [p for p in runnable if isinstance(p, probes.MonotonicProbe)],
        "area": [p for p in runnable if isinstance(p, probes.AreaRatioProbe)],
    }


def run_every_hero_area(args) -> int:
    """Every built hero area, into one report.

    A loop rather than a Makefile loop because which areas exist is a fact
    about `hero.py`, and a gate that has to be told what to check is a gate
    that stops checking the thing nobody remembered to add (F12's rule about
    silence, applied to the runner instead of to a probe).
    """
    from . import hero

    built = [a for a in hero.AREAS if (data_root() / "work" / f"hero-{a.id}.tif").exists()]
    if not built:
        print("no hero area is built; run `make hero`", file=sys.stderr)
        return 1

    failures: list[str] = []
    body: list[str] = [
        f"# Golden probe report — hero grid, {hero.RESOLUTION_M} m",
        "",
        f"{date.today().isoformat()} · {len(built)} of {len(hero.AREAS)} sited "
        f"areas built, {len(hero.UNSITED)} unsited · "
        f"bias {hero.SILHOUETTE_BIAS} · generated by "
        f"`python -m nineskies.probe --area all`.",
        "",
        "This is the artefact stage 6 exists to produce a verdict on. The "
        "seventh golden probe cannot pass on the 1 km grid the game ships — "
        "the Jinsha climbs 221 m through Tiger Leaping Gorge there, where "
        "the source runs it down 41 — so it is deferred to this grid on "
        "F12's rule and this is where it is answered (F49, F50).",
        "",
    ]
    for area in built:
        sampler = GridSampler(data_root() / "work" / f"hero-{area.id}.tif")
        # The source the area was cut from, for the sills' control rows. The
        # mosaic `hero.cut` wrote is the one read, so it is the same cells.
        # Without it the rows are missing and the report says so, rather than
        # printing a table that looks complete (F52's rule about silence).
        vrt = data_root() / "work" / f"hero-{area.id}.vrt"
        missing = hero.missing_cells(area)
        source = SourceSampler(vrt, sampler) if vrt.exists() and not missing else None
        area_failures, lines = run(sampler, args.phase, "hero", source)
        if source is None:
            why = (
                f"{len(missing)} of its source cells {'is' if len(missing) == 1 else 'are'} not on disk"
                if missing
                else "its source mosaic is not on disk"
            )
            lines = [
                f"The source this area was cut from cannot be read here — {why} "
                f"— so any sill below is printed without the source's beside it (F58).",
                "",
            ] + lines
        failures.extend(area_failures)
        body += [
            f"## {area.name}",
            "",
            f"`{area.id}` · {area.count} tiles of {hero.TILE_SAMPLES} x "
            f"{hero.TILE_SAMPLES} at {sampler.resolution_m:.0f} m · "
            f"hero tiles {area.hx0},{area.hy0}–{area.hx1},{area.hy1} · "
            f"holds {', '.join(area.holds)}",
            "",
            area.why,
            "",
        ] + lines
    if hero.UNSITED:
        body += ["## Areas the build plan names that have no coordinate", "",
                 "Siting one means writing a coordinate, and a coordinate "
                 "written from memory is what F49 and F50 cost. Each of these "
                 "needs one checked against the ground before it is cut.", "",
                 "| Area | What it needs |", "| --- | --- |"]
        body += [f"| {name} | {why} |" for _, name, why in hero.UNSITED]
        body.append("")

    report = "\n".join(body) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report)
    print(report)
    if failures:
        print(f"{len(failures)} probe failure(s):", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print("all runnable probes pass")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run golden probes on a built grid.")
    parser.add_argument("--corridor", default="sea-to-sky")
    parser.add_argument("--grid", type=Path, default=None)
    parser.add_argument("--phase", default="corridor", choices=["corridor", "full"])
    parser.add_argument(
        "--grid-kind",
        default="country",
        choices=["country", "hero"],
        help="which artefact --grid points at (hero is stage 6, 90 m)",
    )
    parser.add_argument(
        "--area",
        default=None,
        help="a hero area id, or 'all' for every one that is built; reads "
        "data/work/hero-<id>.tif (implies --grid-kind hero)",
    )
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    if args.area == "all":
        return run_every_hero_area(args)
    if args.area:
        args.grid_kind = "hero"
        path = args.grid or data_root() / "work" / f"hero-{args.area}.tif"
    else:
        # The world the tiles are cut from, which is stage 3's grid and not
        # stage 2's: a probe that passed on the grid before conditioning
        # would be a probe of a world nobody ships (F61).
        from .carve import conditioned_path

        path = args.grid or conditioned_path(args.corridor)
    sampler = GridSampler(path)
    failures, lines = run(sampler, args.phase, args.grid_kind)

    header = [
        f"# Golden probe report — {args.phase} build, {args.grid_kind} grid",
        "",
        f"{date.today().isoformat()} · `{path.name}` · "
        f"bias {sampler.tags.get('bias', '?')} · "
        f"{sampler.resolution_m:.0f} m cells · "
        + (
            f"hero tiles {sampler.tags.get('hx0')},{sampler.tags.get('hy0')}"
            f"–{sampler.tags.get('hx1')},{sampler.tags.get('hy1')}"
            if sampler.tags.get("hx0")
            else f"tiles {sampler.tags.get('tx0')},{sampler.tags.get('ty0')}"
            f"–{sampler.tags.get('tx1')},{sampler.tags.get('ty1')}"
        ),
        "",
        "Generated by `python -m nineskies.probe`. The unit suite tests the probe",
        "logic and runs anywhere; this runs it against real elevation and cannot.",
        "",
    ]
    report = "\n".join(header + lines) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report)
    print(report)

    if failures:
        print(f"{len(failures)} probe failure(s):", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print("all runnable probes pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
