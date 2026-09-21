"""Golden probes for the terrain pipeline (build plan, workstream A).

Six probes. If they pass, the georeferencing, the projection, the
hydro-conditioning and the equal-area claim are all correct. If any fails, the
world is wrong and no amount of shader work will fix it.

Only two can run against a corridor build. Three more need the full-country
grid and first run in phase 2. The sixth -- Everest -- needs the 90 m hero
grid from stage 6, because at 1 km it cannot pass at any tolerance; see
`docs/prototype-findings.md`, F12.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal, Sequence

Phase = Literal["corridor", "full"]

#: Which built artefact a probe reads. The country grid is 1 km (stage 2);
#: the hero grid is 90 m over a handful of named places (stage 6). A probe
#: sampled from the wrong one is not a weaker test, it is a different test.
Grid = Literal["country", "hero"]


@dataclass(frozen=True)
class PointProbe:
    """A named place whose elevation we know independently of our own pipeline."""

    name: str
    lat: float
    lon: float
    expected_m: float
    tolerance_m: float
    phase: Phase
    source: str
    grid: Grid = "country"
    #: What a player would look up, where that differs from `expected_m`.
    #: Recorded so the gap stays visible instead of looking like a typo.
    published_m: float | None = None
    note: str = ""

    def check(self, sample_m: float) -> str | None:
        if abs(sample_m - self.expected_m) > self.tolerance_m:
            return (
                f"{self.name}: got {sample_m:.1f} m, "
                f"expected {self.expected_m} +/- {self.tolerance_m} m"
            )
        return None


@dataclass(frozen=True)
class FlatnessProbe:
    """A lake surface must be flat, and at its real elevation."""

    name: str
    lat: float
    lon: float
    radius_km: float
    expected_m: float
    tolerance_m: float
    max_std_dev_m: float
    phase: Phase
    source: str


@dataclass(frozen=True)
class MonotonicProbe:
    """A river must not run uphill after resampling and carving.

    What this probe can see is bounded by what it walks, and what it walks is
    a chord through a handful of waypoints rather than a centreline. Finding
    F48 measured both halves of that on the built corridor: at the spacing it
    is written at it passes, at 100 km spacing it finds fourteen uphill steps
    and at 1 km it finds 942 -- and none of those is evidence about the river,
    because a straight line from Tiger Leaping Gorge to Chongqing crosses
    mountains the Yangtze goes around. It also passes at every channel search
    radius from a bare point sample to 25 km, so the machinery that looks for
    the channel changes the verdict not at all.

    A probe that cannot be made stricter is not a strict probe. This one reads
    175 cells of the corridor's 4.7 million, and the claim it can support is
    the narrow one in `stride_km` below. The wide claim needs stage 3, which
    is where the centreline comes from and which has never run.
    """

    name: str
    # Ordered source -> mouth, as (lat, lon).
    waypoints: Sequence[tuple[float, float]] = field(default_factory=tuple)
    phase: Phase = "full"
    source: str = ""
    #: How finely the polyline may honestly be walked, kilometres. `None`
    #: means "at the waypoints and nowhere else", which is the only honest
    #: setting for a chord: densifying it would fail on terrain the river is
    #: not in, and would read as a pipeline bug. Stage 3 replaces the chord
    #: with a HydroSHEDS centreline, and this becomes a number that turns the
    #: probe into the check it has always claimed to be.
    stride_km: float | None = None
    #: What the probe is known not to cover, printed in the report beside the
    #: verdict so a pass is never read as more than it is.
    note: str = ""

    def check(self, elevations: Sequence[float]) -> str | None:
        violations = [
            (i, elevations[i], elevations[i + 1])
            for i in range(len(elevations) - 1)
            if elevations[i + 1] > elevations[i] + 1e-6
        ]
        if violations:
            i, a, b = violations[0]
            return (
                f"{self.name}: runs uphill at waypoint {i} "
                f"({a:.1f} m -> {b:.1f} m); {len(violations)} violation(s)"
            )
        return None


@dataclass(frozen=True)
class AreaRatioProbe:
    """The Heihe-Tengchong line: 57 % of the land west, 43 % east.

    This is the probe that proves the projection is equal-area. Get it wrong
    and the GDD's "honest scale" pillar is a lie the player cannot see.
    """

    name: str
    expected_west_pct: float
    tolerance_pct: float
    phase: Phase
    source: str
    # The line, roughly Heihe (Heilongjiang) to Tengchong (Yunnan).
    north_end: tuple[float, float] = (50.25, 127.48)
    south_end: tuple[float, float] = (25.02, 98.49)

    def check(self, west_pct: float) -> str | None:
        if abs(west_pct - self.expected_west_pct) > self.tolerance_pct:
            return (
                f"{self.name}: {west_pct:.1f} % west, "
                f"expected {self.expected_west_pct} +/- {self.tolerance_pct}"
            )
        return None


POINT_PROBES: tuple[PointProbe, ...] = (
    PointProbe(
        name="Lhasa",
        lat=29.65,
        lon=91.10,
        expected_m=3650,
        tolerance_m=30,
        phase="corridor",
        source="Encyclopaedia Britannica; municipal elevation",
    ),
    PointProbe(
        name="Everest summit",
        lat=27.9881,
        lon=86.9250,
        # Not the survey height. GLO-30 is 111 m below it before the pipeline
        # touches the data -- TanDEM-X radar penetrates snow and averages the
        # summit pyramid across its cell -- so a probe against 8,849 m would
        # test the radar forever and call the result a pipeline bug (F12).
        # This is the source's own highest 30 m sample at the summit, and the
        # claim is the only one a pipeline can be held to: it does not lose
        # the summit the source gives it.
        expected_m=8737.8,
        # Measured, not guessed. Reducing 30 m -> 90 m with the stage-2 bias
        # costs 9.1 m at this summit, and shifting the destination grid
        # sub-cell moves the answer by at most 8.4 m. 25 m covers both with
        # headroom and still fails by an order of magnitude if the probe is
        # ever pointed at the 1 km grid, which reads 235-388 m low.
        tolerance_m=25,
        phase="full",
        grid="hero",
        published_m=8848.86,
        source="Copernicus GLO-30 at native 30 m; published height from the "
        "2020 China-Nepal joint survey",
        note="At 1 km this probe is unpassable at any tolerance: grid phase "
        "alone swings the summit by 153 m. It needs the 90 m hero grid.",
    ),
    PointProbe(
        name="Ayding Lake, Turpan",
        lat=42.68,
        lon=89.26,
        expected_m=-154,
        tolerance_m=15,
        phase="full",
        source="Lowest exposed land in China",
    ),
)

FLATNESS_PROBES: tuple[FlatnessProbe, ...] = (
    FlatnessProbe(
        name="Qinghai Lake surface",
        lat=36.90,
        lon=100.20,
        radius_km=25,
        expected_m=3196,
        tolerance_m=2,
        max_std_dev_m=1.0,
        phase="full",
        source="Lake surface elevation; flattened by the lake table, not the DEM minimum",
    ),
)

MONOTONIC_PROBES: tuple[MonotonicProbe, ...] = (
    MonotonicProbe(
        name="Yangtze, source to mouth",
        waypoints=(
            (33.45, 91.10),   # Tuotuo He, headwaters
            (31.80, 98.60),   # upper Jinsha
            (26.87, 100.75),  # Tiger Leaping Gorge
            (29.57, 106.55),  # Chongqing
            (30.70, 111.29),  # Yichang, below the Three Gorges
            (30.59, 114.31),  # Wuhan
            (31.23, 121.47),  # Shanghai
        ),
        phase="corridor",
        # Not "monotonicity enforced in stage 3": stage 3 has never run, and
        # a source note that describes a stage nobody has built reads as
        # provenance for a number that has none (F48). What these seven
        # coordinates are is a hand-placed chord along the river's course.
        source="Waypoints placed by hand along the river's course; no "
        "centreline data and no hydro-conditioning in the build yet",
        stride_km=None,
        note="Seven waypoints 500 km apart, 175 cells of 4.7 M. It cannot "
        "see a clipped meander between two of them, which is the failure "
        "stage 3 exists to prevent, and it passes at every channel search "
        "radius including none.",
    ),
)

AREA_PROBES: tuple[AreaRatioProbe, ...] = (
    AreaRatioProbe(
        name="Heihe-Tengchong land split",
        expected_west_pct=57.0,
        tolerance_pct=1.0,
        phase="full",
        source="Hu Huanyong line, 1935; 94 % of people on 43 % of the land",
    ),
)


def probes_for(phase: Phase) -> list[object]:
    """Every probe runnable at a given build phase.

    A corridor build can only reach probes inside the corridor, so phase 0's
    gate is two probes, not six. Claiming otherwise would make the gate
    unpassable and hide a real failure behind a scheduling error.
    """
    everything: list[object] = [
        *POINT_PROBES,
        *FLATNESS_PROBES,
        *MONOTONIC_PROBES,
        *AREA_PROBES,
    ]
    if phase == "full":
        return everything
    return [p for p in everything if getattr(p, "phase", "full") == "corridor"]


def runnable_on(phase: Phase, grid: Grid = "country") -> list[object]:
    """Every probe runnable against a built artefact.

    `probes_for` answers "has this probe's data been built yet?". This answers
    the narrower question the runner actually has to ask: "can I read this
    probe from the file in my hand?". Keeping them apart is what stops the
    Everest probe being sampled from the 1 km grid, where it cannot pass at
    any tolerance and would read as a pipeline bug (finding F12).
    """
    return [p for p in probes_for(phase) if getattr(p, "grid", "country") == grid]


def deferred_on(phase: Phase, grid: Grid = "country") -> list[object]:
    """Probes this phase has built data for, but not on *this* grid."""
    runnable = {id(p) for p in runnable_on(phase, grid)}
    return [p for p in probes_for(phase) if id(p) not in runnable]


Sampler = Callable[[float, float], float]


def run_point_probes(
    sampler: Sampler, phase: Phase = "full", grid: Grid = "country"
) -> list[str]:
    """Check every point probe readable from this grid. Returns failures."""
    failures: list[str] = []
    for probe in POINT_PROBES:
        if phase == "corridor" and probe.phase != "corridor":
            continue
        if probe.grid != grid:
            continue
        problem = probe.check(sampler(probe.lat, probe.lon))
        if problem:
            failures.append(problem)
    return failures
