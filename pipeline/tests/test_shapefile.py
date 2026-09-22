"""Shapefiles read with the standard library and numpy (F60).

Each file here is written byte by byte from the ESRI specification by the
helpers below, so what is tested is the reader against the format, not the
reader against itself: parts, rings, a null shape keeping its row, a Z variant
whose extra arrays are skipped, and the attribute table's text, numbers and
blanks.
"""

from __future__ import annotations

import io
import struct
import sys
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import shapefile  # noqa: E402


def shp(records: list[tuple[int, list[list[tuple[float, float]]]]], z: bool = False) -> bytes:
    """A .shp of polylines or polygons; a record with no parts is a null shape."""
    body = io.BytesIO()
    kinds = {kind for kind, parts in records if parts}
    file_type = kinds.pop() if kinds else 0
    for number, (kind, parts) in enumerate(records, start=1):
        if not parts:
            content = struct.pack("<i", 0)
        else:
            points = [p for part in parts for p in part]
            xs, ys = [p[0] for p in points], [p[1] for p in points]
            content = struct.pack("<i4d", kind, min(xs), min(ys), max(xs), max(ys))
            content += struct.pack("<2i", len(parts), len(points))
            at = 0
            for part in parts:
                content += struct.pack("<i", at)
                at += len(part)
            for x, y in points:
                content += struct.pack("<2d", x, y)
            if z:
                content += struct.pack("<2d", 0.0, 9.0)
                content += struct.pack(f"<{len(points)}d", *([9.0] * len(points)))
        body.write(struct.pack(">2i", number, len(content) // 2))
        body.write(content)
    records_bytes = body.getvalue()
    header = struct.pack(">7i", 9994, 0, 0, 0, 0, 0, (100 + len(records_bytes)) // 2)
    header += struct.pack("<2i", 1000, file_type) + struct.pack("<8d", *([0.0] * 8))
    return header + records_bytes


def dbf(fields: list[tuple[str, str, int, int]], rows: list[list[str]]) -> bytes:
    """A dBase III table; every value is given already formatted, as text."""
    header_length = 32 + 32 * len(fields) + 1
    record_length = 1 + sum(length for _, _, length, _ in fields)
    out = struct.pack("<B3BIHH20x", 3, 126, 9, 22, len(rows), header_length, record_length)
    for name, kind, length, decimals in fields:
        out += name.encode("ascii").ljust(11, b"\0") + kind.encode("ascii")
        out += struct.pack("<4xBB14x", length, decimals)
    out += b"\x0d"
    for row in rows:
        out += b" "
        for (_, kind, length, _), value in zip(fields, row):
            raw = value.encode("utf-8")
            out += raw.rjust(length) if kind in "NF" else raw.ljust(length)
    return out + b"\x1a"


FIELDS = [("name", "C", 20, 0), ("scalerank", "N", 2, 0), ("min_zoom", "N", 4, 1), ("wet", "L", 1, 0)]


class TestTheGeometry(unittest.TestCase):
    def test_a_line_in_two_parts_comes_back_as_two_arrays(self) -> None:
        parts = [[(100.0, 30.0), (101.0, 30.5)], [(102.0, 31.0), (103.0, 31.5), (104.0, 32.0)]]
        [(kind, found)] = shapefile.geometries(shp([(3, parts)]))
        self.assertEqual(kind, "line")
        self.assertEqual([len(p) for p in found], [2, 3])
        np.testing.assert_array_equal(found[1][2], [104.0, 32.0])

    def test_a_polygon_keeps_its_hole_as_a_second_ring(self) -> None:
        outer = [(0.0, 0.0), (0.0, 4.0), (4.0, 4.0), (4.0, 0.0), (0.0, 0.0)]
        hole = [(1.0, 1.0), (3.0, 1.0), (3.0, 3.0), (1.0, 3.0), (1.0, 1.0)]
        [(kind, rings)] = shapefile.geometries(shp([(5, [outer, hole])]))
        self.assertEqual(kind, "polygon")
        self.assertEqual(len(rings), 2)
        np.testing.assert_array_equal(rings[1][0], [1.0, 1.0])

    def test_a_null_shape_keeps_its_place(self) -> None:
        """Rows pair with shapes by position, so a null must not be dropped."""
        found = shapefile.geometries(shp([(3, [[(0, 0), (1, 1)]]), (0, []), (3, [[(2, 2), (3, 3)]])]))
        self.assertEqual([kind for kind, _ in found], ["line", "null", "line"])

    def test_a_z_variant_reads_as_its_plain_shape(self) -> None:
        parts = [[(10.0, 20.0), (11.0, 21.0)]]
        plain = shapefile.geometries(shp([(3, parts)]))
        with_z = shapefile.geometries(shp([(13, parts)], z=True))
        self.assertEqual(with_z[0][0], "line")
        np.testing.assert_array_equal(with_z[0][1][0], plain[0][1][0])

    def test_a_point_file_is_refused_rather_than_half_read(self) -> None:
        point = struct.pack(">2i", 1, 10) + struct.pack("<i2d", 1, 5.0, 6.0)
        header = struct.pack(">7i", 9994, 0, 0, 0, 0, 0, (100 + len(point)) // 2)
        header += struct.pack("<2i", 1000, 1) + struct.pack("<8d", *([0.0] * 8))
        with self.assertRaises(shapefile.Unreadable):
            shapefile.geometries(header + point)

    def test_a_truncated_file_is_refused(self) -> None:
        whole = shp([(3, [[(0, 0), (1, 1)]])])
        with self.assertRaises(shapefile.Unreadable):
            shapefile.geometries(whole[:-8])


class TestTheAttributes(unittest.TestCase):
    def test_text_numbers_and_blanks(self) -> None:
        rows = shapefile.records(
            dbf(FIELDS, [["Yangtze", "1", "2.0", "T"], ["金沙江", "", "", "?"]])
        )
        self.assertEqual(rows[0], {"name": "Yangtze", "scalerank": 1, "min_zoom": 2.0, "wet": True})
        # A blank rank is no rank, not rank zero; the name is UTF-8, whole.
        self.assertEqual(rows[1], {"name": "金沙江", "scalerank": None, "min_zoom": None, "wet": None})

    def test_shapes_and_rows_that_disagree_are_refused(self) -> None:
        with self.assertRaises(shapefile.Unreadable):
            shapefile.read(shp([(3, [[(0, 0), (1, 1)]])]), dbf(FIELDS, []))


class TestTheZip(unittest.TestCase):
    def archive(self, folder: Path, members: dict[str, bytes]) -> Path:
        path = folder / "rivers.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in members.items():
                archive.writestr(name, data)
        return path

    def test_the_encoding_comes_from_the_cpg(self) -> None:
        geometry = shp([(3, [[(99.9, 26.9), (100.1, 27.2)]])])
        table = dbf(FIELDS, [["金沙江", "3", "1.5", "F"]])
        with TemporaryDirectory() as folder:
            path = self.archive(
                Path(folder),
                {"ne.shp": geometry, "ne.dbf": table, "ne.cpg": b"UTF-8", "ne.README.html": b"<p/>"},
            )
            [shape] = shapefile.read_zip(path)
        self.assertEqual(shape.record["name"], "金沙江")
        self.assertEqual(shape.kind, "line")

    def test_a_zip_with_two_shapefiles_is_refused(self) -> None:
        geometry, table = shp([(3, [[(0, 0), (1, 1)]])]), dbf(FIELDS, [["a", "1", "1.0", "T"]])
        with TemporaryDirectory() as folder:
            path = self.archive(
                Path(folder), {"a.shp": geometry, "a.dbf": table, "b.shp": geometry, "b.dbf": table}
            )
            with self.assertRaises(shapefile.Unreadable):
                shapefile.read_zip(path)


if __name__ == "__main__":
    unittest.main()
