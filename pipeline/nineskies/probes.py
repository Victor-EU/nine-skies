"""Golden probes for the terrain pipeline (build plan, workstream A).

Six probes. If they pass, the georeferencing, the projection, the
hydro-conditioning and the equal-area claim are all correct. If any fails, the
world is wrong and no amount of shader work will fix it.

Only two can run against a corridor build; the other four need the
full-country grid and first run in phase 2.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal, Sequence

Phase = Literal["corridor", "full"]


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
    """A river must not run uphill after resampling and carving."""

    name: str
    # Ordered source -> mouth, as (lat, lon).
    waypoints: Sequence[tuple[float, float]] = field(default_factory=tuple)
    phase: Phase = "full"
    source: str = ""

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
        expected_m=8849,
        tolerance_m=40,  # 1 km resampling clips a sharp summit
        phase="full",
        source="2020 China-Nepal joint survey, 8,848.86 m",
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
        source="HydroSHEDS centreline, monotonicity enforced in stage 3",
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


Sampler = Callable[[float, float], float]


def run_point_probes(sampler: Sampler, phase: Phase = "full") -> list[str]:
    """Check every point probe available at this phase. Returns failures."""
    failures: list[str] = []
    for probe in POINT_PROBES:
        if phase == "corridor" and probe.phase != "corridor":
            continue
        problem = probe.check(sampler(probe.lat, probe.lon))
        if problem:
            failures.append(problem)
    return failures
