"""Stage 3's vectors: a fetch that names its licence, and bytes that hash to
the publisher's own digest (F59, D60).

Nothing here talks to a publisher. A local HTTP server plays each of the
three -- B2's SHA-1 header, S3's MD5 ETag, figshare's API -- serving a few
kilobytes whose digests the test knows. What is asserted is the part between a
response and the record: which requests are made, which bytes are kept, and
which are refused. The first class is the one that matters: until a command
names the source's licence, nothing is requested at all.
"""

from __future__ import annotations

import hashlib
import http.server
import json
import sys
import tempfile
import threading
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import vectors  # noqa: E402

PAYLOAD = b"a river network, standing in for ninety megabytes of one\n" * 400


def sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args) -> None:  # the suite's output is the suite's
        pass

    def _respond(self, send_body: bool) -> None:
        server: Publisher = self.server  # type: ignore[assignment]
        server.hits.append((self.command, self.path))
        server.agents.add(self.headers.get("User-Agent", ""))
        if self.path in server.api:
            body = json.dumps(server.api[self.path]).encode()
            headers: dict[str, str] = {"Content-Type": "application/json"}
        elif self.path in server.files:
            body, headers = server.files[self.path]
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        if send_body:
            self.wfile.write(server.bodies.get(self.path, body))

    def do_HEAD(self) -> None:
        self._respond(send_body=False)

    def do_GET(self) -> None:
        self._respond(send_body=True)


class Publisher(http.server.ThreadingHTTPServer):
    """Serves files with the headers a publisher would, and counts requests.

    `bodies` lets a GET send different bytes from the ones its HEAD described,
    which is a transfer going wrong or a file replaced between the two.
    """

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), Handler)
        self.files: dict[str, tuple[bytes, dict[str, str]]] = {}
        self.bodies: dict[str, bytes] = {}
        self.api: dict[str, object] = {}
        self.hits: list[tuple[str, str]] = []
        self.agents: set[str] = set()

    def url(self, path: str) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}{path}"


class PublisherCase(unittest.TestCase):
    def setUp(self) -> None:
        self.publisher = Publisher()
        self.thread = threading.Thread(
            target=self.publisher.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True
        )
        self.thread.start()
        self.temp = tempfile.TemporaryDirectory()
        self.dest = Path(self.temp.name)

    def tearDown(self) -> None:
        self.publisher.shutdown()
        self.publisher.server_close()
        self.temp.cleanup()

    def b2(self, served_sha1: str | None = None) -> vectors.Source:
        """HydroRIVERS as B2 serves it, pinned to the payload's SHA-1."""
        self.publisher.files["/rivers.zip"] = (
            PAYLOAD,
            {"x-bz-content-sha1": served_sha1 or sha1(PAYLOAD)},
        )
        return replace(
            vectors.BY_ID["hydrorivers-as"],
            url=self.publisher.url("/rivers.zip"),
            bytes=len(PAYLOAD),
            pin=("sha1", sha1(PAYLOAD)),
        )

    def s3(self) -> vectors.Source:
        self.publisher.files["/lakes.zip"] = (PAYLOAD, {"ETag": f'"{md5(PAYLOAD)}"'})
        return replace(
            vectors.BY_ID["ne-lakes"],
            url=self.publisher.url("/lakes.zip"),
            bytes=len(PAYLOAD),
            pin=("md5", md5(PAYLOAD)),
        )

    def figshare(self) -> vectors.Source:
        source = vectors.BY_ID["riveratlas"]
        self.publisher.files["/ndownloader/files/1"] = (PAYLOAD, {})
        self.publisher.api["/v2/articles/1"] = {
            "files": [
                {"name": "RiverATLAS_Catalog_v10.pdf", "size": 1, "computed_md5": "0" * 32},
                {"name": source.filename, "size": len(PAYLOAD), "computed_md5": md5(PAYLOAD)},
            ]
        }
        return replace(
            source,
            url=self.publisher.url("/ndownloader/files/1"),
            api=self.publisher.url("/v2/articles/1"),
            bytes=len(PAYLOAD),
            pin=("md5", md5(PAYLOAD)),
        )


class TestTheLicenceIsNamedFirst(PublisherCase):
    def test_nothing_is_requested_until_the_command_names_the_licence(self) -> None:
        source = self.b2()
        with self.assertRaises(vectors.Refused) as caught:
            vectors.fetch(source, accept="", dest=self.dest)
        self.assertIn("--accept hydrosheds-v1", str(caught.exception))
        self.assertEqual(self.publisher.hits, [])
        self.assertEqual(list(self.dest.iterdir()), [])

    def test_naming_another_licence_is_refused_the_same_way(self) -> None:
        source = self.b2()
        with self.assertRaises(vectors.Refused) as caught:
            vectors.fetch(source, accept="public-domain", dest=self.dest)
        self.assertIn("not --accept public-domain", str(caught.exception))
        self.assertEqual(self.publisher.hits, [])

    def test_a_public_domain_file_is_named_too(self) -> None:
        """No terms are accepted, and the command still says which it is under."""
        source = self.s3()
        with self.assertRaises(vectors.Refused):
            vectors.fetch(source, accept="cc-by-4.0", dest=self.dest)
        vectors.fetch(source, accept="public-domain", dest=self.dest)
        self.assertEqual((self.dest / source.filename).read_bytes(), PAYLOAD)


class TestTheBytesAreTheOnesPriced(PublisherCase):
    def test_a_b2_file_arrives_when_it_hashes_to_the_publishers_sha1(self) -> None:
        source = self.b2()
        entry = vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)
        self.assertEqual((self.dest / source.filename).read_bytes(), PAYLOAD)
        self.assertEqual(entry["sha1"], sha1(PAYLOAD))
        self.assertEqual(entry["sha256"], hashlib.sha256(PAYLOAD).hexdigest())
        self.assertEqual(self.publisher.hits, [("HEAD", "/rivers.zip"), ("GET", "/rivers.zip")])

    def test_an_s3_file_is_held_to_its_etag(self) -> None:
        source = self.s3()
        entry = vectors.fetch(source, accept="public-domain", dest=self.dest)
        self.assertEqual(entry["md5"], md5(PAYLOAD))

    def test_figshare_is_asked_through_its_api_and_never_sent_a_head(self) -> None:
        source = self.figshare()
        entry = vectors.fetch(source, accept="cc-by-4.0", dest=self.dest)
        self.assertEqual(entry["md5"], md5(PAYLOAD))
        self.assertEqual(
            self.publisher.hits,
            [("GET", "/v2/articles/1"), ("GET", "/ndownloader/files/1")],
        )

    def test_a_file_replaced_under_the_same_name_is_refused_before_the_download(self) -> None:
        source = self.b2(served_sha1="f" * 40)
        with self.assertRaises(vectors.Refused) as caught:
            vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)
        self.assertIn("nothing was downloaded", str(caught.exception))
        self.assertEqual(self.publisher.hits, [("HEAD", "/rivers.zip")])
        self.assertFalse((self.dest / source.filename).exists())

    def test_bytes_that_do_not_hash_to_the_pin_are_never_written(self) -> None:
        """The HEAD agrees and the transfer does not: nothing is kept, not even a part."""
        source = self.b2()
        spoiled = bytearray(PAYLOAD)
        spoiled[100] ^= 0x01
        self.publisher.bodies["/rivers.zip"] = bytes(spoiled)
        with self.assertRaises(OSError) as caught:
            vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest, retries=1)
        self.assertIn("hash to", str(caught.exception))
        self.assertEqual(list(self.dest.iterdir()), [])

    def test_every_request_says_it_is_the_pipeline(self) -> None:
        """data.hydrosheds.org refuses `Python-urllib/3` outright (F59)."""
        vectors.fetch(self.b2(), accept="hydrosheds-v1", dest=self.dest)
        vectors.fetch(self.figshare(), accept="cc-by-4.0", dest=self.dest)
        self.assertEqual(self.publisher.agents, {vectors.USER_AGENT})

    def test_a_file_already_here_is_not_asked_for_again(self) -> None:
        source = self.b2()
        first = vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)
        requests = len(self.publisher.hits)
        second = vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)
        self.assertEqual(first, second)
        self.assertEqual(len(self.publisher.hits), requests)

    def test_a_file_uploaded_in_parts_serves_no_sha1_and_is_not_fetched_on_trust(self) -> None:
        source = self.b2(served_sha1="none")
        self.assertEqual(
            vectors.check(source), [f"{source.id}: serves no sha1, so the pin cannot be compared"]
        )
        with self.assertRaises(vectors.Refused):
            vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)


class TestServedDigests(unittest.TestCase):
    def test_b2_names_a_whole_file_sha1_a_second_way_for_a_large_file(self) -> None:
        digest = sha1(PAYLOAD)
        self.assertEqual(vectors.served_digest("b2", {"X-Bz-Content-Sha1": digest}), digest)
        self.assertEqual(
            vectors.served_digest(
                "b2", {"x-bz-content-sha1": "none", "X-Bz-Info-Large_File_Sha1": digest}
            ),
            digest,
        )
        self.assertIsNone(vectors.served_digest("b2", {"x-bz-content-sha1": "none"}))

    def test_an_s3_multipart_etag_is_not_an_md5(self) -> None:
        self.assertEqual(vectors.served_digest("s3", {"ETag": f'"{md5(PAYLOAD)}"'}), md5(PAYLOAD))
        self.assertIsNone(vectors.served_digest("s3", {"ETag": f'"{md5(PAYLOAD)}-12"'}))


class TestTheRecord(PublisherCase):
    def test_the_record_keeps_the_licence_beside_the_bytes(self) -> None:
        source = self.b2()
        entry = vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)
        doc = vectors.record(vectors.read(self.dest), source, entry)
        path, changed = vectors.write(doc, self.dest)
        self.assertTrue(changed)
        self.assertEqual(vectors.read(self.dest), doc)
        kept = doc["digests"]["hydrorivers-as"]
        self.assertEqual(kept["licence"], "hydrosheds-v1")
        self.assertEqual(kept["bytes"], len(PAYLOAD))
        # One line per source, so a second fetch reads as a one-line diff.
        lines = path.read_text().splitlines()
        self.assertEqual(sum('"hydrorivers-as"' in line for line in lines), 1)
        self.assertEqual(vectors.write(doc, self.dest), (path, False))

    def test_a_file_that_rots_on_disk_is_named(self) -> None:
        source = self.b2()
        entry = vectors.fetch(source, accept="hydrosheds-v1", dest=self.dest)
        doc = vectors.record({"version": 1, "digests": {}}, source, entry)
        self.assertEqual(vectors.verify(self.dest, doc), [])
        target = self.dest / source.filename
        rotten = bytearray(target.read_bytes())
        rotten[-1] ^= 0x01
        target.write_bytes(bytes(rotten))
        [problem] = vectors.verify(self.dest, doc)
        self.assertIn("sha256", problem)
        target.unlink()
        self.assertEqual(
            vectors.verify(self.dest, doc), ["hydrorivers-as: recorded but not on disk"]
        )


class TestThePriceList(unittest.TestCase):
    def test_every_source_is_pinned_to_a_digest_of_the_right_length(self) -> None:
        ids = [source.id for source in vectors.SOURCES]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(
            len({source.filename for source in vectors.SOURCES}), len(vectors.SOURCES)
        )
        for source in vectors.SOURCES:
            with self.subTest(source.id):
                algorithm, digest = source.pin
                self.assertRegex(digest, f"^[0-9a-f]{{{vectors.HEX[algorithm]}}}$")
                self.assertGreater(source.bytes, 0)
                self.assertIn(source.publisher, {"b2", "s3", "figshare"})
                self.assertEqual(source.publisher == "figshare", source.api is not None)
                self.assertTrue(source.url.startswith("https://"))

    def test_the_price_list_needs_nobody_else(self) -> None:
        """It is printed from the pins; the network is `--check`'s, not its."""
        text = vectors.price_list()
        for source in vectors.SOURCES:
            self.assertIn(f"{source.id}  ", text)
            self.assertIn(source.pin[1], text)
        self.assertEqual(text.count("downloading is acceptance"), 2)
        self.assertIn("ACCEPT=<licence>", text)


if __name__ == "__main__":
    unittest.main()
