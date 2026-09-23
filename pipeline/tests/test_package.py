"""Stage 11's tile package (F67).

The codec is checked against itself at the ends of Int16, against the file the
engine's own test decodes, and -- on a machine with a world -- against the
`heights.bin` a package claims to deliver.
"""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import package  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "test" / "terrain" / "tileCodec.fixture.bin"
N = package.SAMPLES


def known_tile() -> np.ndarray:
    """The tile the fixture holds. `tileCodec.test.ts` builds the same one."""
    r, c = np.mgrid[0:N, 0:N]
    t = ((r * 131 + c * 71 + r * c * 3) % 9000 - 200).astype(np.int16)
    # The ends of Int16, placed so that deltas across them wrap both ways.
    t[0, 0] = -32768
    t[N - 1, N - 1] = 32767
    t[32, 0] = 32767
    t[33, 0] = -32768
    return t


class TestTheCodec(unittest.TestCase):
    def test_every_int16_round_trips(self):
        rng = np.random.default_rng(7)
        for tile in (
            rng.integers(-32768, 32768, N * N).astype(np.int16),
            np.full(N * N, -32768, dtype=np.int16),
            np.full(N * N, 32767, dtype=np.int16),
            known_tile(),
        ):
            np.testing.assert_array_equal(package.decode(package.encode(tile)).reshape(-1), tile.reshape(-1))

    def test_a_delta_is_the_sample_less_its_west_neighbour(self):
        t = known_tile()
        d = package.delta(t)
        self.assertEqual(int(d[5, 7]), int(t[5, 7]) - int(t[5, 6]))
        self.assertEqual(int(d[5, 0]), int(t[5, 0]) - int(t[4, 0]))
        self.assertEqual(int(d[0, 0]), int(t[0, 0]))

    def test_the_planes_are_low_bytes_then_high(self):
        d = np.zeros((N, N), dtype=np.int16)
        d[0, 0] = 0x1234
        b = package.planes(d)
        self.assertEqual(len(b), 2 * N * N)
        self.assertEqual((b[0], b[N * N]), (0x34, 0x12))

    def test_the_same_tile_is_the_same_file(self):
        # mtime is zero, so a rebuild does not rename every file in the world.
        self.assertEqual(package.encode(known_tile()), package.encode(known_tile()))
        self.assertEqual(package.encode(known_tile())[4:8], b"\x00\x00\x00\x00")


class TestTheFixtureTheEngineDecodes(unittest.TestCase):
    """`test/terrain/tileCodec.test.ts` decodes this file to the same tile, so
    between them the two tests hold the pipeline's encoder to the engine's
    decoder without either running the other's language."""

    def test_it_is_gzip_and_holds_the_known_tile(self):
        data = FIXTURE.read_bytes()
        self.assertEqual(data[:2], b"\x1f\x8b")
        np.testing.assert_array_equal(package.decode(data), known_tile())


class TestPacking(unittest.TestCase):
    def world(self, tiles: np.ndarray) -> Path:
        d = Path(tempfile.mkdtemp())
        raw = tiles.astype("<i2").tobytes()
        (d / "heights.bin").write_bytes(raw)
        (d / "manifest.json").write_text(
            json.dumps(
                {
                    "window": {"tx0": 3, "ty0": 4, "tx1": 5, "ty1": 6},
                    "heights": {
                        "file": "heights.bin",
                        "order": "tile-row-major, ty ascending, then tx ascending",
                        "tiles": len(tiles),
                        "sha256": hashlib.sha256(raw).hexdigest(),
                    },
                }
            )
        )
        return d

    def four(self) -> np.ndarray:
        tiles = np.zeros((4, N * N), dtype=np.int16)
        tiles[0] = known_tile().reshape(-1)
        tiles[2] = 1044  # a flat tile, twice: one file
        tiles[3] = 1044
        return tiles

    def test_zeros_have_no_file_and_twins_share_one(self):
        d = self.world(self.four())
        index = package.build("sea-to-sky", d)
        names = index["names"]
        self.assertEqual(names[1], "")
        self.assertEqual(names[2], names[3])
        self.assertEqual(index["files"], 2)
        self.assertEqual(sorted(p.stem for p in (d / "tiles").glob("*.bin")), sorted({names[0], names[2]}))

    def test_every_file_is_named_for_what_it_holds_and_decodes_to_its_tile(self):
        tiles = self.four()
        d = self.world(tiles)
        index = package.build("sea-to-sky", d)
        for k, name in enumerate(index["names"]):
            if not name:
                self.assertFalse(tiles[k].any())
                continue
            data = (d / "tiles" / f"{name}.bin").read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest()[: package.NAME_HEX], name)
            np.testing.assert_array_equal(package.decode(data).reshape(-1), tiles[k])

    def test_the_index_names_the_heights_it_was_cut_from(self):
        d = self.world(self.four())
        index = package.build("sea-to-sky", d)
        manifest = json.loads((d / "manifest.json").read_text())
        self.assertEqual(index["heightsSha256"], manifest["heights"]["sha256"])
        self.assertEqual(index["window"], manifest["window"])
        self.assertEqual(index["codec"], "delta-planes-gzip")
        on_disk = json.loads((d / "tiles" / "index.json").read_text())
        self.assertEqual(on_disk, index)

    def test_a_rebuild_removes_what_it_no_longer_names(self):
        d = self.world(self.four())
        first = package.build("sea-to-sky", d)
        tiles = self.four()
        tiles[0] += 1
        raw = tiles.astype("<i2").tobytes()
        (d / "heights.bin").write_bytes(raw)
        manifest = json.loads((d / "manifest.json").read_text())
        manifest["heights"]["sha256"] = hashlib.sha256(raw).hexdigest()
        (d / "manifest.json").write_text(json.dumps(manifest))
        second = package.build("sea-to-sky", d)
        self.assertNotEqual(first["names"][0], second["names"][0])
        self.assertFalse((d / "tiles" / f"{first['names'][0]}.bin").exists())
        self.assertEqual(len(list((d / "tiles").glob("*.bin"))), 2)

    def test_it_refuses_heights_its_manifest_does_not_name(self):
        d = self.world(self.four())
        (d / "heights.bin").write_bytes(np.ones((4, N * N), dtype="<i2").tobytes())
        with self.assertRaises(SystemExit):
            package.build("sea-to-sky", d)


class TestAPublishedPackage(unittest.TestCase):
    """What a built world's package delivers, where one is built."""

    def test_each_file_is_the_tile_heights_bin_holds(self):
        checked = 0
        for world in sorted((ROOT / "dist-world").glob("*/tiles/index.json")):
            index = json.loads(world.read_text())
            heights = world.parents[1] / "heights.bin"
            raw = heights.read_bytes()
            if hashlib.sha256(raw).hexdigest() != index["heightsSha256"]:
                continue  # stale, which the engine refuses; not this test's case
            tiles = np.frombuffer(raw, dtype="<i2").reshape(-1, N * N)
            # All of them: the country's 7,245 take under half a second.
            for k in range(len(tiles)):
                name = index["names"][k]
                with self.subTest(world=world.parents[1].name, tile=k):
                    if not name:
                        self.assertFalse(tiles[k].any())
                    else:
                        data = (world.parent / f"{name}.bin").read_bytes()
                        np.testing.assert_array_equal(package.decode(data).reshape(-1), tiles[k])
                checked += 1
        if checked == 0:
            self.skipTest("no world with a current package is built here")


if __name__ == "__main__":
    unittest.main(verbosity=2)
