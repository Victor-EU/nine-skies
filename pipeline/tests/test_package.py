"""Stage 11's package: the tiles (F67) and the horizon field (F69).

The codec is checked against itself at the ends of Int16, against the files the
engine's own test decodes, and -- on a machine with a world -- against the
`heights.bin` and `horizon.bin` a package claims to deliver.
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
FIELD_FIXTURE = ROOT / "test" / "terrain" / "fieldCodec.fixture.bin"
N = package.SAMPLES
#: The field fixture's shape: wider than it is tall, as the horizon field is,
#: so a decoder that swapped the two would read it wrong rather than luckily.
FIELD_W, FIELD_H = 9, 4


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


def known_field() -> np.ndarray:
    """The field the second fixture holds. `tileCodec.test.ts` builds it too."""
    r, c = np.mgrid[0:FIELD_H, 0:FIELD_W]
    t = ((r * 131 + c * 71 + r * c * 3) % 9000 - 200).astype(np.int16)
    t[0, 0] = -32768
    t[FIELD_H - 1, FIELD_W - 1] = 32767
    t[1, 0] = 32767
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

    def test_a_field_that_is_not_square_round_trips(self):
        rng = np.random.default_rng(11)
        field = rng.integers(-32768, 32768, (553, 841)).astype(np.int16)
        np.testing.assert_array_equal(package.decode(package.encode(field, 841), 841), field)
        d = package.delta(field, 841)
        self.assertEqual(int(d[3, 0]), int(np.int16(int(field[3, 0]) - int(field[2, 0]))))

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

    def test_the_field_fixture_holds_the_known_field(self):
        data = FIELD_FIXTURE.read_bytes()
        np.testing.assert_array_equal(package.decode(data, FIELD_W), known_field())
        self.assertEqual(data, package.encode(known_field(), FIELD_W))


class TestPacking(unittest.TestCase):
    def world(self, tiles: np.ndarray, field: np.ndarray | None = None) -> Path:
        d = Path(tempfile.mkdtemp())
        raw = tiles.astype("<i2").tobytes()
        (d / "heights.bin").write_bytes(raw)
        field = known_field() if field is None else field
        horizon = field.astype("<i2").tobytes()
        (d / "horizon.bin").write_bytes(horizon)
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
                    "horizon": {
                        "file": "horizon.bin",
                        "width": field.shape[1],
                        "height": field.shape[0],
                        "sha256": hashlib.sha256(horizon).hexdigest(),
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
        self.assertEqual(
            sorted(p.stem for p in (d / "tiles").glob("*.bin")),
            sorted({names[0], names[2], index["horizon"]["name"]}),
        )

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
        self.assertEqual(len(list((d / "tiles").glob("*.bin"))), 3)  # and the horizon field

    def test_the_horizon_field_is_one_file_the_index_names(self):
        d = self.world(self.four())
        index = package.build("sea-to-sky", d)
        entry = index["horizon"]
        manifest = json.loads((d / "manifest.json").read_text())
        self.assertEqual(entry["sha256"], manifest["horizon"]["sha256"])
        self.assertEqual((entry["width"], entry["height"]), (FIELD_W, FIELD_H))
        data = (d / "tiles" / f"{entry['name']}.bin").read_bytes()
        self.assertEqual(entry["bytes"], len(data))
        self.assertEqual(hashlib.sha256(data).hexdigest()[: package.NAME_HEX], entry["name"])
        np.testing.assert_array_equal(package.decode(data, FIELD_W), known_field())
        # Counted apart from the tiles, which is what `files` and `bytes` are.
        self.assertEqual(index["files"], 2)

    def test_it_refuses_a_horizon_field_its_manifest_does_not_name(self):
        d = self.world(self.four())
        (d / "horizon.bin").write_bytes(np.ones((FIELD_H, FIELD_W), dtype="<i2").tobytes())
        with self.assertRaises(SystemExit):
            package.build("sea-to-sky", d)

    def test_it_refuses_heights_its_manifest_does_not_name(self):
        d = self.world(self.four())
        (d / "heights.bin").write_bytes(np.ones((4, N * N), dtype="<i2").tobytes())
        with self.assertRaises(SystemExit):
            package.build("sea-to-sky", d)


WATER_FIXTURE = ROOT / "test" / "terrain" / "waterCodec.fixture.bin"
ENGINE_WATER = ROOT / "engine" / "src" / "terrain" / "water.ts"


def known_water() -> np.ndarray:
    """The tile the water fixture holds. `water.test.ts` builds the same one."""
    k = np.arange(N * N * 4)
    return ((k * 37 + 11) % 256).astype(np.uint8).reshape(N, N, 4)


class TestWater(unittest.TestCase):
    """The water layer a file per wet tile (F72)."""

    def world(self, heights: np.ndarray, water_tiles: np.ndarray, heights_sha: str | None = None) -> Path:
        from nineskies import water

        d = TestPacking.world(self, heights)
        raw = water_tiles.astype(np.uint8).tobytes()
        (d / "water.bin").write_bytes(raw)
        manifest = json.loads((d / "manifest.json").read_text())
        (d / "water.json").write_text(
            json.dumps(
                {
                    "file": "water.bin",
                    "layout": water.LAYOUT,
                    "channels": water.CHANNELS,
                    "offsetStepM": water.OFFSET_STEP_M,
                    "offsetZero": water.OFFSET_ZERO,
                    "reachM": water.REACH_M,
                    "classes": {"land": water.LAND, "sea": water.SEA, "lake": water.LAKE},
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "heightsSha256": heights_sha or manifest["heights"]["sha256"],
                }
            )
        )
        return d

    def four(self) -> np.ndarray:
        from nineskies import water

        tiles = np.zeros((4, N, N, 4), dtype=np.uint8)
        tiles[..., :2] = water.OFFSET_ZERO
        tiles[0, 10:20, 10:20, 3] = water.LAKE
        tiles[0, 30, :, 2] = 4  # a river's reach across it
        tiles[2:, ..., 3] = water.SEA  # open sea, twice: one file
        return tiles

    def test_the_fixture_is_the_known_tile_as_the_encoder_writes_it(self):
        self.assertEqual(package.encode_water(known_water()), WATER_FIXTURE.read_bytes())

    def test_a_wet_tile_has_a_file_a_dry_one_none_and_all_the_sea_one(self):
        heights = TestPacking.four(self)
        d = self.world(heights, self.four())
        index = package.build("sea-to-sky", d)
        names = index["water"]["names"]
        self.assertEqual(names[1], "")
        self.assertEqual(names[2], names[3])
        self.assertEqual(index["water"]["files"], 2)
        for k in (0, 2):
            data = (d / "tiles" / f"{names[k]}.bin").read_bytes()
            np.testing.assert_array_equal(package.decode_water(data), self.four()[k])
        self.assertEqual(index["water"]["codec"], package.WATER_CODEC)
        self.assertEqual(index["water"]["heightsSha256"], index["heightsSha256"])

    def test_water_cut_against_other_heights_is_refused(self):
        d = self.world(TestPacking.four(self), self.four(), heights_sha="0" * 64)
        with self.assertRaises(SystemExit):
            package.build("sea-to-sky", d)

    def test_a_world_nobody_ran_water_on_has_no_layer(self):
        d = TestPacking.world(self, TestPacking.four(self))
        self.assertNotIn("water", package.build("sea-to-sky", d))

    def test_the_engine_reads_the_offsets_the_pipeline_writes(self):
        import re

        from nineskies import water

        text = ENGINE_WATER.read_text()

        def constant(name: str) -> str:
            found = re.search(rf"export const {name} = ([^;]+);", text)
            self.assertIsNotNone(found, name)
            return found.group(1).strip()

        self.assertEqual(float(constant("OFFSET_STEP_M")), water.OFFSET_STEP_M)
        self.assertEqual(int(constant("OFFSET_ZERO")), water.OFFSET_ZERO)
        self.assertEqual(constant("REACH_M"), f"{water.REACH_UNITS} * OFFSET_STEP_M")
        self.assertEqual(int(constant("WATER_SEA")), water.SEA)
        self.assertEqual(int(constant("WATER_LAKE")), water.LAKE)


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
            entry = index.get("horizon")
            if entry is not None:
                with self.subTest(world=world.parents[1].name, horizon=entry["name"]):
                    raw = (world.parents[1] / "horizon.bin").read_bytes()
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), entry["sha256"])
                    data = (world.parent / f"{entry['name']}.bin").read_bytes()
                    np.testing.assert_array_equal(
                        package.decode(data, entry["width"]).reshape(-1),
                        np.frombuffer(raw, dtype="<i2"),
                    )
            checked += 1
        if checked == 0:
            self.skipTest("no world with a current package is built here")


if __name__ == "__main__":
    unittest.main(verbosity=2)
