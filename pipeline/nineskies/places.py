"""Named places, and their coordinates, once.

A place had three copies of its coordinates in this repository -- the manifest
anchors here, the Yangtze probe's waypoint list, and (via the anchors) the
committed projection reference table -- and nothing checked that they agreed
or that any of them was where its name says. One of them was not. The anchor
called `tiger-leaping-gorge` sat at 26.87 N, 100.75 E, which is **71 km** from
Tiger Leaping Gorge and 721 m above the river through it, and that coordinate
had reached the golden probe, the built world's manifest, `make reference`,
the operator's `goToAnchor` teleport and three findings (F49).

So there is one table. A place has an id, and everything that wants a place
asks for it by id: `probes.py` for the waypoints that are named places,
`tiles.py` for the manifest anchors, `reference.py` through those. A second
coordinate for the same name is now a thing you cannot write down.

What a table cannot do is tell you a coordinate is in the wrong valley. That
needs elevation, so `probe.py` prints what the built world reads at every
place beside what the place claims to be -- see `Place.landform`.

And a landform is not enough either. F49 added the relief column and it
passed a waypoint standing **1,260 m above the Jinsha**, on the wall of the
gorge rather than in it, because a gorge floor and the cliff above it sit in
the same 20 km box and report the same 3,800 m of relief. The column that
separates them is how far a point stands above the lowest ground near it, and
the promise a river place makes is `on_channel` below (F50).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

#: What a place is, which is also what the built world can be asked to
#: confirm. A `gorge` whose surroundings are a gentle slope is either the
#: wrong coordinate or the wrong name, and the probe report says which by
#: printing the relief around it.
Landform = Literal["city", "gorge", "valley", "airfield", "summit", "lake"]


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    lat: float
    lon: float
    landform: Landform
    source: str
    #: Published in the world manifest, so an operator can be sent here by
    #: name. Everything in this table is, for now; the flag exists so that
    #: adding a place for a probe does not silently add a teleport target.
    anchor: bool = True
    #: This coordinate is on the water, not merely near it. A river probe's
    #: waypoints must be, because the thing being checked is whether the
    #: river runs downhill and a point on the wall above it is not on the
    #: river at all. `probe.py` holds every such place to it against the
    #: built world: the ground here must be within `CHANNEL_TOLERANCE_M` of
    #: the lowest ground within 2 km, or the coordinate is on a bank or a
    #: cliff and the probe reading it is measuring its search radius (F50).
    on_channel: bool = False
    note: str = ""


PLACES: tuple[Place, ...] = (
    Place("shanghai", "Shanghai", 31.23, 121.47, "city", "City centre"),
    Place("wuhan", "Wuhan", 30.59, 114.31, "city", "City centre"),
    Place("yichang", "Yichang", 30.70, 111.29, "city",
          "Below the Three Gorges, where the Yangtze meets the plain"),
    Place("chongqing", "Chongqing", 29.57, 106.55, "city", "City centre"),
    Place("chengdu", "Chengdu", 30.66, 104.07, "city", "City centre"),
    Place(
        "tiger-leaping-gorge",
        "Tiger Leaping Gorge",
        27.2107,
        100.1253,
        "gorge",
        "On the Jinsha in the narrows, between Haba Xueshan (5,341 m, 12 km "
        "north-west) and Yulong Xueshan (5,399 m, 8 km south-east); the "
        "channel cell nearest the middle of the reach, at 1,757 m",
        on_channel=True,
        note="Moved twice. First from 26.87 N, 100.75 E, which is 71 km away "
        "in a highland with 1,642 m of relief against this reach's 3,823 "
        "(F49). Then 3.45 km, from 27.18 N, 100.13 E, which was **on the "
        "gorge wall 1,260 m above the water** -- a point sample there reads "
        "3,036 m at the source's own 30 m. The probe had been finding the "
        "river only through a 2 km channel search whose minimum sat at the "
        "rim of the disc at every resolution, so the search was doing the "
        "placing (F50).",
    ),
    Place(
        "shigu",
        "Shigu, the first bend of the Yangtze",
        26.8747,
        99.9625,
        "valley",
        "On the Jinsha where it turns north out of its southward run, at "
        "1,817 m",
        on_channel=True,
        note="The control for the gorge above. Same river, 41 km apart: a "
        "broad valley the 1 km grid reads to within 10 m, against a gorge it "
        "fills in by 220 m. Moved 0.58 km from 26.87 N, 99.96 E onto the "
        "water with the gorge; it was only 9 m above it, which is why the "
        "same fault was invisible here (F50).",
    ),
    Place("lhasa", "Lhasa", 29.65, 91.10, "city", "Municipal elevation"),
    # The five below arrived from `probes.py`, which had been carrying its own
    # coordinates since before this table existed -- and Lhasa's twice over,
    # identically, which is the duplication F49 was written about surviving
    # the fix for it. A probe names its subject now and reads the coordinate
    # from here. None is an anchor: they are things to measure rather than
    # places to be sent, which is the distinction `anchor` exists to keep.
    Place(
        "everest", "Everest summit", 27.9881, 86.9250, "summit",
        "The summit pyramid; 8,849 m by the 2020 China-Nepal joint survey, "
        "8,738 m as the source's own highest 30 m sample",
        anchor=False,
        note="Outside the Sea to Sky corridor box (86.9 E against a western "
        "edge of 89 E), so neither its probe nor its hero area can be built "
        "until its four one-degree cells are fetched.",
    ),
    Place(
        "ayding-lake", "Ayding Lake, Turpan", 42.68, 89.26, "lake",
        "The lowest exposed land in China, -154 m", anchor=False,
    ),
    Place(
        "qinghai-lake", "Qinghai Lake", 36.90, 100.20, "lake",
        "Lake surface at 3,196 m, flattened by the lake table rather than by "
        "the DEM minimum", anchor=False,
    ),
    Place(
        "heihe", "Heihe, Heilongjiang", 50.25, 127.48, "city",
        "North end of the Hu Huanyong line, 1935", anchor=False,
    ),
    Place(
        "tengchong", "Tengchong, Yunnan", 25.02, 98.49, "city",
        "South end of the Hu Huanyong line, 1935", anchor=False,
    ),
)

BY_ID: dict[str, Place] = {p.id: p for p in PLACES}


def at(place_id: str) -> tuple[float, float]:
    """A place's (lat, lon). Raises rather than returning a default: a
    missing place is a typo, and a typo that resolves to somewhere is the
    class of bug this module exists to end."""
    return (BY_ID[place_id].lat, BY_ID[place_id].lon)


def anchors() -> dict[str, tuple[float, float]]:
    """The places published in a world manifest, by id."""
    return {p.id: (p.lat, p.lon) for p in PLACES if p.anchor}


def on_channel() -> tuple[Place, ...]:
    """Places that promise to be on the water, which the report checks."""
    return tuple(p for p in PLACES if p.on_channel)
