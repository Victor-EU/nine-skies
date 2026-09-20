"""The committed source digests, and the chain they close (D24).

None of this needs the rasters, the network or a built world, which is the
point: these are the checks that run where the 13.9 GB is not. What they
cannot do is compare a digest to the mirror -- that happens on the machine
holding the tiles, at `make sources` and again at every build -- so what is
asserted here is that the committed artefacts still agree with each other.

The link that matters is the last one. A route section names the source set
its ground came from; the record names the same set; if a world is rebuilt
from different rasters and the section re-cut without re-recording, or the
record re-taken without re-cutting, these two numbers part company and this
is what says so.
"""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SECTIONS = ROOT / "content" / "sections"

HEX32 = re.compile(r"^[0-9a-f]{32}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


class RecordTest(unittest.TestCase):
    def setUp(self) -> None:
        self.doc = sources.read(ROOT)

    def test_the_record_is_present_and_shaped(self) -> None:
        self.assertEqual(self.doc["version"], sources.SOURCES_VERSION)
        self.assertTrue(self.doc["bucket"].startswith("https://"))
        self.assertTrue(self.doc["digests"], "no source digests committed")
        for name, entry in self.doc["digests"].items():
            with self.subTest(name):
                self.assertGreater(entry["bytes"], 0)
                self.assertRegex(entry["md5"], HEX32)
                self.assertRegex(entry["sha256"], HEX64)

    def test_both_digests_are_kept_because_they_do_different_jobs(self) -> None:
        """MD5 is the mirror's word; SHA-256 is what local checks use."""
        entries = list(self.doc["digests"].values())
        self.assertEqual(len(entries), len({e["md5"] for e in entries}))
        self.assertEqual(len(entries), len({e["sha256"] for e in entries}))


class SetDigestTest(unittest.TestCase):
    """`digest_of` has to notice membership, or the chain link is decorative."""

    DIGESTS = {
        "a": {"sha256": "1" * 64},
        "b": {"sha256": "2" * 64},
        "c": {"sha256": "3" * 64},
    }

    def test_order_does_not_matter(self) -> None:
        self.assertEqual(
            sources.digest_of(["a", "b", "c"], self.DIGESTS),
            sources.digest_of(["c", "a", "b"], self.DIGESTS),
        )

    def test_dropping_a_tile_moves_it(self) -> None:
        self.assertNotEqual(
            sources.digest_of(["a", "b", "c"], self.DIGESTS),
            sources.digest_of(["a", "b"], self.DIGESTS),
        )

    def test_changing_a_tile_moves_it(self) -> None:
        swapped = {**self.DIGESTS, "b": {"sha256": "4" * 64}}
        self.assertNotEqual(
            sources.digest_of(["a", "b", "c"], self.DIGESTS),
            sources.digest_of(["a", "b", "c"], swapped),
        )

    def test_a_tile_with_no_recorded_digest_is_not_silently_skipped(self) -> None:
        # Otherwise an unrecorded tile and an absent one would give the same
        # number, and a corridor built from tiles nobody hashed would look
        # exactly like one built from fewer tiles that somebody did.
        self.assertNotEqual(
            sources.digest_of(["a", "b"], self.DIGESTS),
            sources.digest_of(["a", "b", "zzz"], self.DIGESTS),
        )


class ChainTest(unittest.TestCase):
    """Every committed section names a source set the record also names."""

    def test_sections_and_the_record_agree_on_what_was_built_from(self) -> None:
        found = sorted(SECTIONS.glob("*.json"))
        self.assertTrue(found, f"no committed sections under {SECTIONS}")
        corridors = sources.read(ROOT).get("corridors", {})
        for path in found:
            section = json.loads(path.read_text())
            cut = section["cutFrom"]
            with self.subTest(section["expedition"]):
                recorded = corridors.get(cut["corridor"])
                self.assertIsNotNone(
                    recorded,
                    f"{cut['corridor']} has no recorded source set; run `make sources`",
                )
                self.assertEqual(
                    cut["sourceSha256"],
                    recorded["sha256"],
                    f"{section['expedition']} was cut from a different set of rasters "
                    "than the record describes — re-run `make sources`, or re-cut",
                )


if __name__ == "__main__":
    unittest.main()
