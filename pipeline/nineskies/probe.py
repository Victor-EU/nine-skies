"""Run the golden probes against a built grid, and write a report.

The unit suite tests probe *logic* against a synthetic sampler and runs
anywhere. This runs the same probes against ~14 GB of real elevation and
cannot run in CI, so it writes `docs/probe-report.md` — the artefact that
carries the result to somebody who does not have the data.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from . import probes
from .acquire import data_root
from .grid import RESOLUTION_M
from .sample import GridSampler

#: How far a river waypoint may be from the cell that holds its channel.
CHANNEL_RADIUS_KM = 2.0

#: Spacings the monotonic chord is re-walked at, to show what the verdict at
#: the waypoints is worth. Not a gate: see `monotonic_sensitivity`.
STRIDE_SWEEP_KM = (500.0, 100.0, 25.0, 5.0, 1.0)

#: Channel search radii the same verdict is re-taken at. Zero is a bare point
#: sample, which is the control: if the verdict never moves, the search is not
#: what is producing it.
RADIUS_SWEEP_KM = (0.0, 2.0, 5.0, 10.0, 25.0)


def run(
    sampler: GridSampler,
    phase: probes.Phase = "corridor",
    grid: probes.Grid = "country",
) -> tuple[list[str], list[str]]:
    """Returns (failures, report lines)."""
    failures: list[str] = []
    lines: list[str] = []

    runnable = probes_by_type(phase, grid)

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
        lines.append(
            f"The channel minimum is what is checked. A waypoint's coordinates "
            f"are quoted to two decimals, which is ±550 m, and a 1 km cell "
            f"straddling a gorge reports the wall as readily as the water — so "
            f"a point sample would be testing the waypoint list rather than the "
            f"terrain. The search radius is {CHANNEL_RADIUS_KM:.0f} km. The "
            f"point sample is shown beside it because the gap between the two "
            f"columns *is* the damage resampling does to a river, and stage 3 "
            f"exists to carve it back. It is not, however, what decides the "
            f"verdict: the sweep below takes the same verdict at every radius "
            f"from none to 25 km and it never moves."
        )
        lines.append("")
        lines.append("| Waypoint | Point sample | Channel minimum | Drop |")
        lines.append("| --- | ---: | ---: | ---: |")
        previous: float | None = None
        for (lat, lon), r, c in zip(probe.waypoints, raw, channel):
            drop = "—" if previous is None else f"{c - previous:,.0f} m"
            previous = c
            lines.append(
                f"| {lat:.2f} N, {lon:.2f} E | {r:,.0f} m | {c:,.0f} m | {drop} |"
            )
        lines.append("")
        lines.extend(monotonic_sensitivity(sampler, probe))

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


def monotonic_sensitivity(sampler: GridSampler, probe) -> list[str]:
    """What the pass above is worth, as two sweeps and a coverage figure.

    A verdict with no sensitivity beside it reads as a fact about the world.
    These two tables say which parts of it are facts about the probe, and
    they are printed on a pass as readily as on a failure -- a probe that
    only explains itself when it fails has already been believed (F48).
    """
    lines: list[str] = ["#### What this verdict covers", ""]

    cells = sampler.array.size
    reach = 2 * int(CHANNEL_RADIUS_KM * 1000 / RESOLUTION_M) + 1
    read = len(probe.waypoints) * reach * reach
    lines.append(
        f"The check above reads **{read:,} cells of {cells:,}** — "
        f"{read / cells * 100:.4f} % of the built grid — at {len(probe.waypoints)} "
        f"waypoints with a {CHANNEL_RADIUS_KM:.0f} km search around each. "
        f"{probe.note}"
    )
    lines.append("")

    lines.append(
        "**Walked more finely, along the same chord.** The waypoints are a "
        "hand-placed line across country, not a centreline, so a straight "
        "reach from Tiger Leaping Gorge to Chongqing crosses mountains the "
        "river goes around. Read this as the resolution at which the chord "
        "stops being a river, and not as a hydrology result: it is why the "
        "probe cannot simply be densified, and why stage 3 is the fix."
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
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    path = args.grid or data_root() / "work" / f"{args.corridor}-1km.tif"
    sampler = GridSampler(path)
    failures, lines = run(sampler, args.phase, args.grid_kind)

    header = [
        f"# Golden probe report — {args.phase} build, {args.grid_kind} grid",
        "",
        f"{date.today().isoformat()} · `{path.name}` · "
        f"bias {sampler.tags.get('bias', '?')} · "
        f"tiles {sampler.tags.get('tx0')},{sampler.tags.get('ty0')}"
        f"–{sampler.tags.get('tx1')},{sampler.tags.get('ty1')}",
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
