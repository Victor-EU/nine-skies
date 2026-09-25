"""Stage 12b — the south's composite. Runs without the archive or the network."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_NUMPY = False

try:
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if HAVE_NUMPY:
    from nineskies import composite, imagery  # noqa: E402

#: One 90 m hero tile at Tiger Leaping Gorge, in UTM zone 47.
EPSG = 32647


def item(id_, month, clear, tile="47RPK", cover=0.5, sun=70):
    return {
        "id": id_, "datetime": f"2021-{month:02d}-10T04:00:00Z", "tile": tile, "epsg": EPSG,
        "cover": cover, "clear": clear, "sun": sun,
    }


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestChoosing(unittest.TestCase):
    def test_a_month_at_a_time_round_the_year(self):
        items = [item(f"w{k}", 12, 0.99 - k / 100) for k in range(10)] + [item("s0", 7, 0.5), item("s1", 7, 0.4)]
        chosen = composite.select(items, 3)
        # Each month's clearest, then each month's second: a murky July's
        # second before a clear December's second.
        self.assertEqual({i["id"] for i in chosen}, {"w0", "s0", "s1"})
        self.assertEqual({i["id"] for i in composite.select(items, 4)}, {"w0", "s0", "s1", "w1"})

    def test_each_tile_has_its_own_quota_and_the_murky_are_left(self):
        items = [item(f"a{k}", 1 + k, 0.9) for k in range(5)] + [item(f"b{k}", 1 + k, 0.9, tile="47RNK") for k in range(5)]
        items.append(item("murk", 6, composite.MIN_CLEAR - 0.01))
        items.append(item("winter", 12, 0.99, sun=composite.MIN_SUN_DEG - 1))
        chosen = composite.select(items, 4)
        self.assertEqual(len(chosen), 8)
        self.assertFalse({"murk", "winter"} & {i["id"] for i in chosen})


@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheGrid(unittest.TestCase):
    area = imagery.Area("t", "hero", 11_520, 256, 89, 1, 1) if HAVE_NUMPY else None

    def test_the_grid_is_on_the_passes_pixels_and_holds_the_area(self):
        from rasterio.crs import CRS
        from rasterio.warp import transform_bounds
        from nineskies import grid

        g = composite.utm_grid(self.area, EPSG, 20)
        self.assertEqual(g.west % 20, 0)
        self.assertEqual(g.north % 20, 0)
        w, s, e, n = transform_bounds(CRS.from_proj4(grid.ALBERS_PROJ4), CRS.from_epsg(EPSG), *self.area.bounds_m())
        self.assertLessEqual(g.west, w)
        self.assertGreaterEqual(g.east, e)
        self.assertLessEqual(g.south, s)
        self.assertGreaterEqual(g.north, n)

    def test_passes_are_kept_by_the_resolution_they_were_read_at(self):
        # F89 read the 90 m lattice's areas at 20 m; F91 reads them all at 10 m.
        self.assertEqual(composite.READ_M, 10)
        self.assertEqual(composite.window_path("a", "p", Path("/r")).parent.name, "windows-10m")

    def test_a_pass_is_read_where_it_meets_the_grid(self):
        from affine import Affine

        g = composite.UtmGrid(EPSG, 20, 600_000, 3_000_000, 100, 50)
        tile = Affine(10, 0, 599_980, 0, -10, 3_000_020)  # an MGRS tile's origin
        self.assertEqual(composite.source_window(g, tile, (10_980, 10_980)), (2, 2, 200, 100))
        # Off the tile's east edge: clipped, in whole grid pixels.
        edge = composite.UtmGrid(EPSG, 20, 599_980 + 109_000, 3_000_000, 100, 50)
        c, r, w, h = composite.source_window(edge, tile, (10_980, 10_980))
        self.assertEqual((c, w), (10_900, 80))
        far = composite.UtmGrid(EPSG, 20, 800_000, 3_000_000, 10, 10)
        self.assertIsNone(composite.source_window(far, tile, (10_980, 10_980)))
        with self.assertRaises(ValueError):
            composite.source_window(g, Affine(10, 0, 599_990, 0, -10, 3_000_020), (10_980, 10_980))


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheMedian(unittest.TestCase):
    def test_the_median_of_the_clear_views_only(self):
        stack = np.array([[[10]], [[40]], [[20]], [[255]], [[255]]], np.uint8)
        self.assertEqual(composite.median_of(stack, np.array([[3]]))[0, 0], 20)
        self.assertEqual(composite.median_of(stack[[0, 1, 3]], np.array([[2]]))[0, 0], 25)

    def test_a_cloud_takes_its_margin_with_it(self):
        scl = np.full((40, 40), 4, np.uint8)
        scl[20, 20] = 9
        rgb = np.full((3, 40, 40), 50, np.uint8)
        mask = composite.clear_mask(scl, rgb, 20)
        margin = composite.CLOUD_MARGIN_M // 20
        self.assertFalse(mask[20, 20 + margin])
        self.assertTrue(mask[20, 20 + margin + 1])
        scl[0, 0] = 7  # unclassified is not clear, and not cloud
        self.assertFalse(composite.clear_mask(scl, rgb, 20)[0, 0])
        self.assertTrue(composite.clear_mask(scl, rgb, 20)[0, 2])


@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheComposite(unittest.TestCase):
    area = imagery.Area("t", "hero", 11_520, 256, 89, 1, 1) if HAVE_NUMPY else None

    def pass_file(self, root, g, id_, value, scl, skip=0):
        """A pass covering the grid's west half and a little more, from `skip` rows down."""
        from affine import Affine

        path = composite.window_path(self.area.key, id_, root)
        path.parent.mkdir(parents=True, exist_ok=True)
        w, h = g.width // 2 + 10, g.height - skip
        profile = dict(driver="GTiff", width=w, height=h, count=4, dtype="uint8", crs=f"EPSG:{EPSG}",
                       transform=Affine(g.res, 0, g.west, 0, -g.res, g.north - g.res * skip))
        with rasterio.open(path, "w", **profile) as ds:
            ds.write(np.full((3, h, w), value, np.uint8), [1, 2, 3])
            ds.write(scl(h, w), 4)

    def test_the_median_of_each_pixels_clear_views_on_the_grid(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            here = composite.source_dir(self.area.key, root)
            here.mkdir(parents=True)
            ids = ["p1", "p2", "p3", "p4", "p5"]
            (here / "items.json").write_text(json.dumps([dict(item(i, 1 + k, 0.9), visual="", scl="", cloud=1) for k, i in enumerate(ids)]))
            (here / "probe.json").write_text(json.dumps({i: {"cover": 0.5, "clear": 0.9} for i in ids}))
            g = composite.utm_grid(self.area, EPSG, composite.READ_M)
            clear = lambda h, w: np.full((h, w), 4, np.uint8)  # noqa: E731

            def cloud_north(h, w):
                scl = clear(h, w)
                scl[: h // 2] = 9
                return scl

            self.pass_file(root, g, "p1", 30, clear)
            self.pass_file(root, g, "p2", 60, clear)
            self.pass_file(root, g, "p3", 90, clear)
            self.pass_file(root, g, "p4", 250, cloud_north)  # cloud over the north: left out there
            # A pass that starts partway down a strip, below the north's cloud.
            self.pass_file(root, g, "p5", 200, clear, skip=g.height // 2 + 100)
            out = composite.build(self.area, root, strip=64)
            with rasterio.open(out) as ds:
                data = ds.read()
                self.assertEqual(ds.crs.to_epsg(), EPSG)
            north, south = 10, g.height - 10
            self.assertEqual(data[3, north, 5], 3)
            self.assertEqual(data[0, north, 5], 60)
            self.assertEqual(data[3, south, 5], 5)
            self.assertEqual(data[0, south, 5], 90)
            middle = g.height // 2 + 50  # clear of p4's cloud and its margin, above p5
            self.assertEqual(data[3, middle, 5], 4)
            self.assertEqual(data[0, middle, 5], 75)  # 60 and 90
            self.assertEqual(data[3, g.height // 2 + 100, 5], 5)
            self.assertEqual(data[3, north, g.width - 5], 0)  # no pass reaches the east
            # Read back onto the colour grid: seen only where the passes are.
            rgb, seen = imagery.composite_on(self.area, root)
            self.assertEqual(rgb.shape, (3, self.area.height, self.area.width))
            self.assertTrue(seen[:, :20].all())
            self.assertFalse(seen[:, -20:].any())
            with self.assertRaises(FileNotFoundError):
                composite.load_tone(root)


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheSeam(unittest.TestCase):
    def test_the_archives_tones_become_the_mosaics(self):
        rng = np.random.default_rng(2)
        target = [rng.normal(90, 20, 5000).astype(np.float32) for _ in range(3)]
        linear = [(t - 40) * 0.5 for t in target]  # darker, flatter, as reflectance is
        tone = imagery.fit_tone(linear, target)
        self.assertAlmostEqual(tone[0]["gain"], 2.0, places=3)
        self.assertAlmostEqual(tone[0]["offset"], 40.0, places=1)
        image = np.stack(linear).reshape(3, 50, 100)
        mapped = imagery.apply_tone(image, tone)
        bulk = image <= np.array([t["knee"] for t in tone])[:, None, None]
        np.testing.assert_allclose(mapped[bulk], np.stack(target).reshape(3, 50, 100)[bulk], atol=0.5)
        # Past the knee, eased into white rather than clipped.
        bright = imagery.apply_tone(np.full((3, 1, 1), 250, np.float32), tone)
        self.assertLess(bright[0, 0, 0], 255)
        self.assertGreater(bright[0, 0, 0], np.percentile(target[0], 90))
        # A fleck of the mosaic's cloud barely moves the line.
        cloudy = [t.copy() for t in target]
        cloudy[0][:80] = 250
        self.assertAlmostEqual(imagery.fit_tone(linear, cloudy)[0]["gain"], 2.0, delta=0.1)

    def test_only_the_tone_crosses_at_the_edge(self):
        area = imagery.Area("t", "hero", 11_520, 0, 0, 1, 1)
        archive = np.full((3, area.height, area.width), 100, np.float32)
        archive[:, ::7, ::7] = 160  # detail
        mosaic = np.full_like(archive, 120)
        out = imagery.meet_the_mosaic(archive, mosaic, np.ones(archive.shape[1:], bool), area)
        # On the west edge, shifted by the difference of the two tones ...
        self.assertAlmostEqual(float(out[0, 128, 1] - archive[0, 128, 1]), 120 - float(archive.mean()), delta=1.5)
        # ... and its detail kept.
        self.assertAlmostEqual(float(out[0, 126, 0] - out[0, 127, 0]), float(archive[0, 126, 0] - archive[0, 127, 0]), delta=0.5)
        np.testing.assert_array_equal(out[:, 128, 128], archive[:, 128, 128])  # the middle untouched

    def test_the_edge_leans_to_the_mosaic(self):
        area = imagery.Area("t", "hero-30m", 3_840, 0, 0, 2, 2)
        t = imagery.edge_weight(area, feather_m=600)
        self.assertEqual(t[0, 256], 0.0)
        self.assertEqual(t[256, 256], 1.0)
        self.assertEqual(t[40, 256], 1.0)  # 40 samples of 15 m
        self.assertTrue(0 < t[20, 256] < 1)


@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheCountry(unittest.TestCase):
    """The southern scenes' country tiles, from whole passes at 160 m (F90)."""

    tile = (46, 16)  # the country tile round Tiger Leaping Gorge, in UTM zone 47

    def bbox(self):
        lons, lats = imagery.boundary_lonlat(imagery.country_area(*self.tile))
        return [float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())]

    def packs(self, root):
        path = Path(root) / "packs.json"
        path.write_text(json.dumps({"scenes": [
            {"id": "karst", "tiles": [*self.tile]},
            {"id": "loess", "tiles": [60, 40]},
        ]}))
        return path

    def test_the_region_is_the_southern_scenes_tiles(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(composite.country_region(self.packs(tmp)), {self.tile})

    def test_the_catalogue_grows_by_the_tiles_no_cached_pass_covers(self):
        """F98: a scene added to the region is searched; the tiles searched
        before are not, so the passes their colour was chosen from stay."""
        from unittest import mock

        near = self.bbox()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            here = composite.source_dir(composite.COUNTRY, root)
            here.mkdir(parents=True)
            old = dict(item("old", 4, 0, tile="47RPL"), bbox=near, cloud=5, nodata=0)
            (here / "items.json").write_text(json.dumps([old]))
            new = dict(item("new", 5, 0, tile="45RVL"), bbox=[86.5, 27.8, 87.5, 28.8], cloud=5, nodata=0)
            restated = dict(old, cloud=50)  # the catalogue's record of a cached pass, changed since
            asked = []

            def search(bbox, query):
                asked.append(bbox)
                return [new, restated]

            with mock.patch.object(composite, "search_items", search):
                items = composite.country_catalogue({self.tile, (60, 40)}, workers=1, root=root)
                self.assertEqual(len(asked), 1)  # one block, the new tile's
                self.assertEqual([i["id"] for i in items], ["new", "old"])
                self.assertEqual(next(i for i in items if i["id"] == "old")["cloud"], 5)
                # Recorded as searched: the new tile, and every tile the cached pass covers.
                searched = set(map(tuple, json.loads((here / "searched.json").read_text())))
                self.assertLessEqual({self.tile, (60, 40)}, searched)
                # Asked again, nothing is searched.
                composite.country_catalogue({self.tile, (60, 40)}, workers=1, root=root)
                self.assertEqual(len(asked), 1)

    def test_a_passs_orbit_from_its_product_name(self):
        self.assertEqual(composite.relative_orbit({"s2:product_uri": "S2A_MSIL2A_20241229T035151_N0511_R104_T47RPK_20241229T073649.SAFE"}), 104)
        self.assertIsNone(composite.relative_orbit({}))

    def test_each_sentinel_tile_takes_its_clearest_round_the_year(self):
        region = {self.tile}
        near = self.bbox()
        far = [near[0] + 20, near[1], near[2] + 20, near[3]]
        items = [
            dict(item(f"a{m}", m, 0, tile="47RPL"), bbox=near, cloud=5, nodata=0) for m in (4, 5, 6)
        ] + [
            dict(item("a-edge", 4, 0, tile="47RPL"), bbox=near, cloud=0, nodata=90),  # mostly outside the swath
            dict(item("elsewhere", 4, 0, tile="49RDH"), bbox=far, cloud=0, nodata=0),
        ]
        chosen = [i["id"] for i in composite.select_country(items, region, per_orbit=3)]
        self.assertEqual(chosen, ["a4", "a5", "a6"])
        # A second orbit over the same tile has its own quota.
        items += [dict(item(f"b{m}", m, 0, tile="47RPL"), bbox=near, cloud=5, nodata=60, orbit=147) for m in (7, 8)]
        chosen = [i["id"] for i in composite.select_country(items, region, per_orbit=3)]
        self.assertEqual(chosen, ["a4", "a5", "a6", "b7", "b8"])

    def test_a_country_tile_takes_the_median_of_its_sentinel_tiles(self):
        from affine import Affine
        from rasterio.crs import CRS
        from rasterio.warp import transform_bounds
        from nineskies import grid

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packs = self.packs(tmp)
            here = composite.source_dir(composite.COUNTRY, root)
            (here / "windows").mkdir(parents=True)
            area = imagery.country_area(*self.tile)
            w, s, e, n = transform_bounds(CRS.from_proj4(grid.ALBERS_PROJ4), CRS.from_epsg(EPSG), *area.bounds_m())
            res = 160.0
            west, north = w - 2000, n + 2000
            width, height = int((e - w + 4000) / res), int((n - s + 4000) / res)
            items = []
            for k, (value, scl) in enumerate([(40, 4), (60, 4), (200, 5), (250, 9)]):
                id_ = f"p{k}"
                items.append(dict(item(id_, 4 + k, 0, tile="47RPL"), bbox=self.bbox(), cloud=5, nodata=0, visual="", scl="", orbit=104))
                profile = dict(driver="GTiff", width=width, height=height, count=4, dtype="uint8",
                               crs=f"EPSG:{EPSG}", transform=Affine(res, 0, west, 0, -res, north))
                with rasterio.open(here / "windows" / f"{id_}.tif", "w", **profile) as ds:
                    ds.write(np.full((3, height, width), value, np.uint8), [1, 2, 3])
                    ds.write(np.full((height, width), scl, np.uint8), 4)
            (here / "items.json").write_text(json.dumps(items))
            composite.build_country(packs, root)
            rgb, seen = imagery.country_archive_on(area, root)
            self.assertTrue(seen.all())
            np.testing.assert_allclose(rgb[:, 128, 128], 60, atol=0.5)  # 40, 60, 200; the cloud left out
            # A country tile outside the region keeps the mosaic.
            self.assertIsNone(imagery.country_archive_on(imagery.country_area(60, 40), root))
            # A hero area inside takes it, for its edge to meet.
            hero = imagery.Area("h", "hero", 11_520, 256, 89, 1, 1)
            self.assertTrue(imagery.country_archive_on(hero, root)[1].all())



@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheSouthernRails(unittest.TestCase):
    """F95: the archive at 10 m over the southern rails' sub-tiles."""

    def test_each_southern_country_tile_composites_the_rectangle_of_its_sub_tiles(self):
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp) / "index.json"
            packs.write_text(json.dumps({"scenes": [{"near": [21, 38, 23, 39, 8, 5]}]}))
            with mock.patch.object(imagery, "archive_region", return_value={(5, 9)}):
                areas = composite.near_areas(packs)
        self.assertEqual(len(areas), 1)  # tile (2, 1) is the mosaic's
        a = areas[0]
        self.assertEqual((a.key, a.lattice, a.tx0, a.ty0, a.tiles_x, a.tiles_y), ("near-5_9", "near", 21, 38, 3, 2))
        # Keyed as the country tile's near view reads it, and reaching a whole colour sample past its edge.
        self.assertEqual(a.key, imagery.near_view(5, 9).key)
        self.assertEqual(a.cell_m, 250.0)
        g = composite.utm_grid(a, EPSG, composite.READ_M)
        self.assertGreater((g.east - g.west) * (g.north - g.south), (3 * 16_000 + 500) * (2 * 16_000 + 500))


    def test_the_southern_rails_passes_are_chosen_by_orbit_and_kept_by_zone(self):
        near = imagery.Area("near-5_9", "near", 16_000, 21, 38, 3, 2, cells=64)
        hero = imagery.Area("t", "hero", 11_520, 256, 89, 1, 1)

        def item(n: int, tile: str, orbit: int, epsg: int, month: int) -> dict:
            return {"id": f"p{n:03}", "tile": tile, "orbit": orbit, "epsg": epsg, "datetime": f"2020-{month:02}-01", "cover": 1.0, "clear": 0.9, "sun": 60}

        # One tile seen by two orbits, the first seeing it clearer; another tile in the next zone.
        items = [item(n, "48RYU", 4, 32648, 1 + n % 12) for n in range(40)]
        items += [item(100 + n, "48RYU", 104, 32648, 1 + n % 12) for n in range(40)]
        items += [item(200 + n, "49RBP", 4, 32649, 1 + n % 12) for n in range(40)]
        for i in items[:40]:
            i["clear"] = 1.0
        chosen = composite.choose(near, items)
        by = {(i["tile"], i["orbit"]) for i in chosen}
        self.assertEqual(by, {("48RYU", 4), ("48RYU", 104), ("49RBP", 4)})
        self.assertEqual(len(chosen), 3 * composite.NEAR_PER_TILE)
        # A hero area takes each tile's clearest, whichever orbit sees it.
        self.assertEqual(len(composite.choose(hero, items)), composite.PER_TILE + 40)
        self.assertEqual(composite.zones(near, chosen), [(32648, "near-5_9"), (32649, "near-5_9-32649")])
        self.assertEqual(composite.zones(hero, chosen), [(32648, "t")])


if __name__ == "__main__":
    unittest.main()
