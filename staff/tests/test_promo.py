"""Promo autopilot tests — run by verify.sh via unittest discovery.

Covers the deterministic core (picks, copy, feeds, pages, publishers). All
offline: the publishers are exercised through a fake transport. Freshness
checks (is the feed/spotlight stale?) are deliberately NOT here — a stale
feed must page the promo workflow, never block an unrelated PR's merge gate.
"""
import datetime
import json
import os
import re
import sys
import tempfile
import unittest
import xml.dom.minidom

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from promo import catalogue, check as promo_check, feeds, pick, post, spotlight, words as promo_copy  # noqa: E402

try:
    import PIL  # noqa: F401
    from promo import card
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class TestCatalogue(unittest.TestCase):
    def test_tools_shape(self):
        tools = catalogue.load_tools()
        self.assertGreater(len(tools), 1000)
        for tool in tools[:20]:
            self.assertIn("name", tool)
            self.assertRegex(tool["name"], r"^[a-z0-9][a-z0-9\-]*$")

    def test_tracks_shape(self):
        tracks = catalogue.load_tracks()
        self.assertGreaterEqual(len(tracks), 40)
        for track in tracks:
            self.assertRegex(track["youtube_id"], r"^[A-Za-z0-9_-]{11}$")
            self.assertTrue(track["title"])

    def test_plain_strips_emoji(self):
        self.assertEqual(catalogue.plain("🏋️ Weightlifting Score"), "Weightlifting Score")

    def test_short_breaks_at_word_boundary(self):
        self.assertEqual(catalogue.short("one two three four", 12), "one two…")


class TestPick(unittest.TestCase):
    def test_deterministic(self):
        tools = catalogue.load_tools()
        day = datetime.date(2027, 5, 4)
        self.assertEqual(pick.pick_tool(day, tools)["name"],
                         pick.pick_tool(day, tools)["name"])

    def test_no_repeats_within_a_year(self):
        tools = catalogue.load_tools()
        start = datetime.date(2026, 1, 1)
        seen = {pick.pick_tool(start + datetime.timedelta(days=i), tools)["name"]
                for i in range(365)}
        self.assertEqual(len(seen), 365)

    def test_queue_override_wins(self):
        tools = catalogue.load_tools()
        day = datetime.date(2026, 9, 11)
        queue = {"tools": {day.isoformat(): tools[5]["name"]}, "tracks": {}}
        self.assertEqual(pick.pick_tool(day, tools, queue)["name"], tools[5]["name"])

    def test_queue_unknown_slug_fails_loudly(self):
        with self.assertRaises(SystemExit):
            pick.pick_tool(datetime.date(2026, 9, 11), catalogue.load_tools(),
                           {"tools": {"2026-09-11": "no-such-tool"}, "tracks": {}})

    def test_track_rotation_covers_weeks(self):
        tracks = catalogue.load_tracks()
        start = datetime.date(2026, 1, 5)  # a Monday
        seen = {pick.pick_track(start + datetime.timedelta(weeks=w), tracks)["youtube_id"]
                for w in range(len(tracks))}
        self.assertEqual(len(seen), len(tracks))


class TestCopy(unittest.TestCase):
    def test_every_tool_and_track_posts_cleanly(self):
        tools = catalogue.load_tools()
        for tool in tools:  # all 1119: lengths + banned phrases (asserted inside)
            url = catalogue.tool_url(tool["name"])
            cat = tool.get("category") or "General"
            self.assertLessEqual(len(promo_copy.tool_short(tool, url)), 280)
            self.assertLessEqual(
                len(promo_copy.tool_mastodon(tool, url, cat)), 500)
            promo_copy.tool_linkedin(tool, url, cat, len(tools))
        for track in catalogue.load_tracks():
            track = {**track, "url": catalogue.track_url(track["youtube_id"])}
            self.assertLessEqual(len(promo_copy.track_post(track, "2026-W01")), 280)

    def test_linkedin_carries_the_funnel(self):
        tools = catalogue.load_tools()
        tool = tools[0]
        text = promo_copy.tool_linkedin(tool, catalogue.tool_url(tool["name"]),
                                        "General", len(tools))
        self.assertIn("£99/year", text)
        self.assertIn("/embed.html", text)


class TestCard(unittest.TestCase):
    @unittest.skipUnless(HAS_PIL, "Pillow not installed")
    def test_png_card_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "card.png")
            card.render_png(eyebrow="Tool of the day", title="Sleep Calculator",
                            subtitle="Calculate optimal wake-up times.",
                            footer="Friday 11 September 2026", out=out)
            with open(out, "rb") as fh:
                magic = fh.read(8)
            self.assertEqual(magic, b"\x89PNG\r\n\x1a\n")
            from PIL import Image
            self.assertEqual(Image.open(out).size, (1200, 630))

    def test_svg_fallback_always_works(self):
        from promo.card import render_svg
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "card.svg")
            render_svg(eyebrow="e", title="t", subtitle="s", footer="f", out=out)
            self.assertIn("<svg", open(out, encoding="utf-8").read())


class FakeTransport:
    """Canned ATProto + Mastodon responses; records request bodies."""
    def __init__(self, already_posted=False, url=""):
        self.bodies = []
        self.url = url
        self.already_posted = already_posted

    def __call__(self, method, url, *, headers=None, body=None, timeout=30):
        self.bodies.append((method, url, body))
        if "createSession" in url:
            return 200, json.dumps({"did": "did:plc:test", "accessJwt": "t"}).encode()
        if "getAuthorFeed" in url:
            feed = [{"post": {"record": {"text": f"pick {self.url}",
                                         "createdAt": f"{datetime.date.today().isoformat()}T00:00:00Z"}}}] \
                if self.already_posted else []
            return 200, json.dumps({"feed": feed}).encode()
        if "uploadBlob" in url:
            return 200, json.dumps({"blob": {"ref": "b"}}).encode()
        if "createRecord" in url:
            return 200, json.dumps({"uri": "at://x"}).encode()
        if "verify_credentials" in url:
            return 200, json.dumps({"id": "42"}).encode()
        if re.search(r"/statuses\?limit", url):
            items = [{"content": f"<p>pick {self.url}</p>",
                      "created_at": f"{datetime.date.today().isoformat()}T00:00:00Z"}] \
                if self.already_posted else []
            return 200, json.dumps(items).encode()
        if "/api/v2/media" in url:
            return 200, json.dumps({"id": "7"}).encode()
        if "/api/v1/statuses" in url:
            return 201, json.dumps({"id": "9"}).encode()
        raise AssertionError(f"unexpected call: {method} {url}")


class TestPost(unittest.TestCase):
    URL = catalogue.tool_url("sleep-calculator")
    TEXT = f"🛠️ Tool of the day: Sleep Calculator\nFree.\n{URL}"

    def setUp(self):
        self.fake = FakeTransport(url=self.URL)
        self._real, post._TRANSPORT = post._TRANSPORT, self.fake
        os.environ.update(BLUESKY_HANDLE="h", BLUESKY_APP_PASSWORD="p",
                          MASTODON_INSTANCE="mastodon.social",
                          MASTODON_ACCESS_TOKEN="t")

    def tearDown(self):
        post._TRANSPORT = self._real
        for key in ("BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD",
                    "MASTODON_INSTANCE", "MASTODON_ACCESS_TOKEN"):
            os.environ.pop(key, None)

    def test_bluesky_facet_points_at_url(self):
        receipt = post.bsky_post(self.TEXT, self.URL, b"PNG", "alt", live=True)
        self.assertEqual(receipt["status"], "posted")
        record = json.loads(self.fake.bodies[-1][2])["record"]
        facet = record["facets"][0]
        span = self.TEXT.encode("utf-8")[facet["index"]["byteStart"]:
                                        facet["index"]["byteEnd"]].decode()
        self.assertEqual(span, self.URL)
        self.assertEqual(record["embed"]["images"][0]["alt"], "alt")

    def test_bluesky_idempotent(self):
        post._TRANSPORT = FakeTransport(already_posted=True, url=self.URL)
        receipt = post.bsky_post(self.TEXT, self.URL, None, "alt", live=True)
        self.assertEqual(receipt["status"], "already-posted")

    def test_mastodon_media_flow(self):
        receipt = post.masto_post(self.TEXT, self.URL, b"PNG", "alt", live=True)
        self.assertEqual(receipt["status"], "posted")
        posted = [b for m, u, b in self.fake.bodies
                  if m == "POST" and u.endswith("/api/v1/statuses")][0]
        self.assertIn("media_ids", posted.decode())

    def test_mastodon_idempotent(self):
        post._TRANSPORT = FakeTransport(already_posted=True, url=self.URL)
        receipt = post.masto_post(self.TEXT, self.URL, None, "alt", live=True)
        self.assertEqual(receipt["status"], "already-posted")

    def test_missing_secrets_skip(self):
        for key in ("BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD",
                    "MASTODON_INSTANCE", "MASTODON_ACCESS_TOKEN"):
            del os.environ[key]
        self.assertEqual(post.bsky_post(self.TEXT, self.URL, None, "a", live=True)["status"],
                         "no-secrets")
        self.assertEqual(post.masto_post(self.TEXT, self.URL, None, "a", live=True)["status"],
                         "no-secrets")


class TestFeeds(unittest.TestCase):
    def test_feed_builds_valid_xml(self):
        day = datetime.date(2026, 9, 11)
        xml_text = feeds.build(day)
        self.assertIn("scripts/promo/feeds.py", xml_text)
        doc = xml.dom.minidom.parseString(xml_text)
        items = doc.getElementsByTagName("item")
        self.assertEqual(len(items), 10)  # 7 picks + track + 2 evergreens
        self.assertIn(str(len(catalogue.load_tools())), xml_text)


class TestSpotlight(unittest.TestCase):
    def test_spotlight_page(self):
        day = datetime.date(2026, 9, 11)
        tools = catalogue.load_tools()
        page = spotlight.build_spotlight(day, tools)
        tool = pick.pick_tool(day, tools)
        self.assertIn(catalogue.tool_url(tool["name"]), page)
        self.assertIn('rel="canonical"', page)
        self.assertIn("application/ld+json", page)

    def test_week_page(self):
        monday = datetime.date(2026, 9, 7)
        fname, page = spotlight.build_week_page(monday, catalogue.load_tools())
        self.assertEqual(fname, "week-2026-W37.html")
        self.assertEqual(page.count('class="card"'), 8)  # 7 picks + track
        self.assertIn("youtube.com/watch", page)


class TestCheck(unittest.TestCase):
    def test_tracks_and_queue(self):
        self.assertTrue(promo_check.check_tracks()[0])
        self.assertTrue(promo_check.check_queue()[0])

    def test_copy_sweep(self):
        self.assertTrue(promo_check.check_copy()[0])


if __name__ == "__main__":
    unittest.main()
