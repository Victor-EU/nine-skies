"""Shapefiles, read with the standard library and numpy (F60).

Every river network stage 3 could use arrives as an ESRI shapefile in a zip
(F59). The pipeline has no vector driver: rasterio's wheel carries libgdal and
exposes its rasters only. A shapefile is two plain formats, and this reads
them both. `.shp` is the geometry, a 100-byte header followed by records of
parts and points. `.dbf` is the attributes, one fixed-width text row per
shape. Reading them costs this module instead of a third pip package and the
native library that would come with it.

Geometry is read in two dimensions whatever the file stores: a Z or M
variant's extra arrays are skipped by the record's own length, since nothing
here has a use for them. Point and multipatch files are refused by name
rather than half read.
"""

from __future__ import annotations

import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import numpy as np

#: The shape types read here, by the kind of geometry they carry. The Z and M
#: variants of a polyline or polygon store the same parts and points first,
#: and their extra arrays come after, inside the record's own length.
KINDS = {0: "null", 3: "line", 5: "polygon", 13: "line", 15: "polygon", 23: "line", 25: "polygon"}


@dataclass(frozen=True)
class Shape:
    #: "line", "polygon" or "null".
    kind: str
    #: One (n, 2) array of x, y per part, in the file's own coordinates.
    parts: tuple[np.ndarray, ...]
    record: Mapping[str, object]


class Unreadable(ValueError):
    """A file this reader will not guess at."""


def geometries(shp: bytes) -> list[tuple[str, tuple[np.ndarray, ...]]]:
    """Every record of a `.shp`, as (kind, parts), in file order."""
    code, words = struct.unpack(">i20xi", shp[:28])
    if code != 9994:
        raise Unreadable(f"not a shapefile: file code {code}, not 9994")
    if words * 2 != len(shp):
        raise Unreadable(f"header says {words * 2:,} bytes and the file has {len(shp):,}")
    found: list[tuple[str, tuple[np.ndarray, ...]]] = []
    at = 100
    while at < len(shp):
        _, content_words = struct.unpack(">ii", shp[at : at + 8])
        start, end = at + 8, at + 8 + content_words * 2
        (shape_type,) = struct.unpack("<i", shp[start : start + 4])
        kind = KINDS.get(shape_type)
        if kind is None:
            raise Unreadable(f"shape type {shape_type} is not a line or a polygon")
        if kind == "null":
            found.append((kind, ()))
        else:
            parts_n, points_n = struct.unpack("<ii", shp[start + 36 : start + 44])
            first = np.frombuffer(shp, dtype="<i4", count=parts_n, offset=start + 44)
            points = np.frombuffer(
                shp, dtype="<f8", count=points_n * 2, offset=start + 44 + 4 * parts_n
            ).reshape(points_n, 2)
            bounds = list(first) + [points_n]
            found.append(
                (kind, tuple(points[bounds[i] : bounds[i + 1]].copy() for i in range(parts_n)))
            )
        at = end
    return found


def records(dbf: bytes, encoding: str = "utf-8") -> list[dict[str, object]]:
    """Every row of a `.dbf`, as a dict keyed by field name.

    Text is stripped, numbers are ints where the field has no decimals and
    floats where it has, and a blank number is None rather than zero -- a
    missing scale rank is not rank zero.
    """
    count, header, width = struct.unpack("<IHH", dbf[4:12])
    fields: list[tuple[str, str, int, int]] = []
    for at in range(32, header - 1, 32):
        if dbf[at] == 0x0D:
            break
        name = dbf[at : at + 11].split(b"\0")[0].decode("ascii")
        fields.append((name, chr(dbf[at + 11]), dbf[at + 16], dbf[at + 17]))
    rows: list[dict[str, object]] = []
    for index in range(count):
        at = header + index * width + 1  # past the deletion flag
        row: dict[str, object] = {}
        for name, kind, length, decimals in fields:
            raw = dbf[at : at + length]
            at += length
            row[name] = _value(raw, kind, decimals, encoding)
        rows.append(row)
    return rows


def _value(raw: bytes, kind: str, decimals: int, encoding: str) -> object:
    if kind in "NF":
        text = raw.decode("ascii", "replace").strip()
        if not text or set(text) <= {"*"}:
            return None
        return int(text) if decimals == 0 and kind == "N" and "." not in text else float(text)
    if kind == "L":
        text = raw.decode("ascii", "replace").strip().upper()
        return True if text in ("Y", "T") else False if text in ("N", "F") else None
    return raw.decode(encoding, "replace").rstrip(" \0")


def read(shp: bytes, dbf: bytes, encoding: str = "utf-8") -> list[Shape]:
    shapes = geometries(shp)
    rows = records(dbf, encoding)
    if len(shapes) != len(rows):
        raise Unreadable(f"{len(shapes):,} shapes and {len(rows):,} attribute rows")
    return [Shape(kind, parts, row) for (kind, parts), row in zip(shapes, rows)]


def read_zip(path: Path) -> list[Shape]:
    """The one shapefile inside a zip, with the encoding its `.cpg` names."""
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        stems = sorted(name[:-4] for name in names if name.lower().endswith(".shp"))
        if len(stems) != 1:
            raise Unreadable(f"{path.name} holds {len(stems)} shapefiles, not one")
        stem = stems[0]
        cpg = next((n for n in names if n.lower() == f"{stem}.cpg".lower()), None)
        encoding = archive.read(cpg).decode("ascii").strip() if cpg else "latin-1"
        return read(archive.read(f"{stem}.shp"), archive.read(f"{stem}.dbf"), encoding)
