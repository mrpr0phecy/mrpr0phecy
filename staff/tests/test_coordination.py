"""Temporary repositories only; never switch the real session branch."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

STAFF = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STAFF))
import scan
import coordinate

BRANCH = "arena/01a07ea6-mrpr0phecy"
NOW = datetime(2026, 9, 8, 2, 0, tzinfo=timezone.utc)


class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="staff-coordination-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-b", BRANCH)
        self.git("config", "user.name", "Staff test")
        self.git("config", "user.email", "staff-test@example.invalid")
        (self.root / "scripts").mkdir()
        (self.root / "scripts/ai-staff.json").write_text(json.dumps({"members": [{"id": "delivery"}, {"id": "privacy"}]}))
        (self.root / "shared.txt").write_text("original\n")
        (self.root / "delete-me.txt").write_text("tracked\n")
        (self.root / ".gitignore").write_text("ai-developer/\n")
        self.git("add", ".")
        self.git("commit", "-qm", "Base")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.git("update-ref", "refs/remotes/origin/main", self.base)

    def git(self, *args, input=None, env=None):
        result = subprocess.run(["git", *args], cwd=self.root, capture_output=True, text=True,
                                input=input, env={**os.environ, **(env or {})})
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def peer(self, changes, name="arena/peer-session", parent=True):
        # Build a commit via a separate index, without any checkout/branch switch.
        with tempfile.TemporaryDirectory(prefix="staff-index-") as temp:
            env = {"GIT_INDEX_FILE": str(Path(temp) / "index")}
            self.git("read-tree", self.base, env=env)
            for file, content in changes.items():
                blob = self.git("hash-object", "-w", "--stdin", input=content).strip()
                self.git("update-index", "--add", "--cacheinfo", "100644", blob, file, env=env)
            tree = self.git("write-tree", env=env).strip()
            args = ["commit-tree", tree]
            if parent:
                args += ["-p", self.base]
            commit = self.git(*args, input=f"Peer {name}\n").strip()
            self.git("update-ref", f"refs/remotes/origin/{name}", commit)
            return commit

    def report(self):
        return scan.build(self.root, now=NOW)

    def save_peer_claim(self, branch="arena/peer-session", expires=None):
        claim = {"version": 1, "branch": branch, "role": "privacy", "task": "Review shared files",
                 "status": "active", "files": ["scripts/"], "updatedAt": NOW.isoformat(),
                 "expiresAt": (expires or NOW + timedelta(hours=12)).isoformat()}
        folder = self.root / "staff/claims"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / scan.claim_filename(branch)).write_text(json.dumps(claim))
        return claim

    def test_default_scan_is_offline_and_does_not_create_refs(self):
        before = self.git("show-ref")
        calls = []
        original = scan.git

        def recording(*args, **kwargs):
            calls.append(args[1])
            return original(*args, **kwargs)

        with patch.object(scan, "git", recording):
            report = self.report()
        self.assertNotIn("fetch", calls)
        self.assertNotIn("tag", calls)
        self.assertNotIn("checkout", calls)
        self.assertEqual(before, self.git("show-ref"))
        self.assertIn("cached", report["remoteState"])

    def test_empty_diffs_do_not_fall_back_to_whole_tree_differences(self):
        self.peer({})
        (self.root / "shared.txt").write_text("main advanced\n")
        self.git("add", ".")
        self.git("commit", "-qm", "Advance current branch")
        self.git("update-ref", "refs/remotes/origin/main", self.git("rev-parse", "HEAD").strip())
        peer = next(r for r in self.report()["branches"] if r["branch"] == "arena/peer-session")
        self.assertEqual(peer["files"], [])
        self.assertEqual(peer["state"], "no-unique-diff")

    def test_merged_ancestors_are_not_active_conflicts(self):
        self.git("update-ref", "refs/remotes/origin/arena/merged-session", self.base)
        (self.root / "shared.txt").write_text("new main\n")
        self.git("add", ".")
        self.git("commit", "-qm", "Advance")
        self.git("update-ref", "refs/remotes/origin/main", self.git("rev-parse", "HEAD").strip())
        peer = next(r for r in self.report()["branches"] if r["branch"] == "arena/merged-session")
        self.assertEqual(peer["state"], "merged")
        self.assertEqual(peer["files"], [])
        self.assertEqual(self.report()["mine"], [])

    def test_dirty_staged_deleted_and_untracked_paths_are_included(self):
        self.peer({"shared.txt": "peer", "new file.txt": "peer new", "delete-me.txt": "peer edited"})
        (self.root / "shared.txt").write_text("my staged update")
        self.git("add", "shared.txt")
        (self.root / "new file.txt").write_text("my untracked update")
        (self.root / "delete-me.txt").unlink()
        report = self.report()
        self.assertEqual(set(report["dirtyFiles"]), {"shared.txt", "new file.txt", "delete-me.txt"})
        self.assertEqual(set(report["mine"][0]["files"]), set(report["dirtyFiles"]))

    def test_unknown_ancestry_is_explicit_not_a_claim_of_active_work(self):
        self.peer({"shared.txt": "unrelated tree"}, parent=False)
        (self.root / "shared.txt").write_text("local update")
        report = self.report()
        peer = next(r for r in report["branches"] if not r["current"])
        self.assertTrue(report["uncertain"])
        self.assertEqual(peer["state"], "unknown")
        self.assertIn("tree-only", peer["comparison"])
        self.assertTrue(report["mine"][0]["uncertain"])
        self.assertNotIn("Safe to push", scan.render(report))

    def test_unicode_and_space_paths_are_not_git_quoted(self):
        file = "scripts/évidence report.txt"
        self.peer({file: "peer"})
        (self.root / file).write_text("local")
        self.assertIn(file, self.report()["mine"][0]["files"])

    def test_branch_identity_is_not_truncated(self):
        self.peer({"shared.txt": "one"}, "arena/01a07ea6-alpha")
        self.peer({"shared.txt": "two"}, "arena/01a07ea6-beta")
        branches = {r["branch"] for r in self.report()["branches"]}
        self.assertEqual(len(branches), 3)

    def test_claim_and_release_require_explicit_handover(self):
        claim = coordinate.claim_work(self.root, "delivery", "Improve evidence", ["staff/", "scripts/"], now=NOW)
        self.assertEqual(claim["branch"], BRANCH)
        self.assertEqual(claim["status"], "active")
        with self.assertRaises(ValueError):
            coordinate.update_claim(self.root, "release", summary="Done", now=NOW)
        released = coordinate.update_claim(self.root, "release", summary="Tests added", validation="Tests pass", next_steps="Human review; not merged", now=NOW + timedelta(hours=1))
        self.assertEqual(released["status"], "released")
        self.assertIn("not merged", released["handover"]["next"])
        self.assertEqual(self.git("rev-parse", "--abbrev-ref", "HEAD").strip(), BRANCH)

    def test_active_claim_cannot_be_silently_overwritten(self):
        coordinate.claim_work(self.root, "delivery", "Improve evidence", ["staff/"], now=NOW)
        with self.assertRaisesRegex(ValueError, "already has an active"):
            coordinate.claim_work(self.root, "privacy", "Different work", ["scripts/"], now=NOW)

    def test_expired_claim_is_visible_and_cannot_be_quietly_renewed(self):
        coordinate.claim_work(self.root, "delivery", "Improve evidence", ["staff/"], hours=1, now=NOW)
        later = NOW + timedelta(hours=2)
        self.assertTrue(scan.build(self.root, now=later)["claims"][0]["expired"])
        with self.assertRaisesRegex(ValueError, "expired"):
            coordinate.update_claim(self.root, "renew", now=later)

    def test_overlapping_active_and_expired_claims_need_documented_review(self):
        for expiry in (NOW + timedelta(hours=12), NOW - timedelta(hours=1)):
            with self.subTest(expiry=expiry):
                self.save_peer_claim(expires=expiry)
                with self.assertRaisesRegex(ValueError, "Coordinate before claiming"):
                    coordinate.claim_work(self.root, "delivery", "Audit scripts", ["scripts/ai-staff.json"], now=NOW)
        claim = coordinate.claim_work(self.root, "delivery", "Audit scripts", ["scripts/ai-staff.json"], acknowledge="Reviewed the expired claim and coordinated the scope on the board.", now=NOW)
        self.assertTrue(claim["coordination"]["concerns"])
        self.assertTrue(claim["coordination"]["acknowledgement"])

    def test_unknown_roles_traversal_git_and_globs_are_rejected(self):
        with self.assertRaises(ValueError):
            coordinate.claim_work(self.root, "invented", "Task", ["staff/"], now=NOW)
        for file in ("../outside", "/absolute", ".git/config", "scripts/../../other", "cards/*", "scripts//bad", "bad\nfile"):
            with self.subTest(file=file), self.assertRaises(ValueError):
                coordinate.claim_work(self.root, "delivery", "Task", [file], now=NOW)

    def test_malformed_claims_make_scan_incomplete_not_silently_clean(self):
        folder = self.root / "staff/claims"
        folder.mkdir(parents=True)
        (folder / "broken.json").write_text('{"version": 99}')
        report = self.report()
        self.assertTrue(report["uncertain"])
        self.assertTrue(report["warnings"])

    def test_peer_claim_is_read_from_its_branch_even_before_merge(self):
        branch = "arena/peer-session"
        claim = {"version": 1, "branch": branch, "role": "privacy", "task": "Claim without implementation",
                 "status": "active", "files": ["scripts/"], "updatedAt": NOW.isoformat(),
                 "expiresAt": (NOW + timedelta(hours=12)).isoformat()}
        self.peer({"staff/claims/" + scan.claim_filename(branch): json.dumps(claim)}, branch)
        (self.root / "scripts/ai-staff.json").write_text('{"local":true}')
        report = self.report()
        self.assertTrue(any(hit["source"] == "active claim" for hit in report["mine"]))

    def test_missing_base_is_an_error_not_empty_success(self):
        self.git("update-ref", "-d", "refs/remotes/origin/main")
        with self.assertRaises(scan.GitError):
            self.report()

    def test_directory_scopes_do_not_match_similar_names(self):
        self.assertTrue(scan.overlaps("staff/", "staff/BOARD.md"))
        self.assertFalse(scan.overlaps("staff/", "staffing.txt"))
        self.assertFalse(scan.overlaps("cards/tax.html", "cards/tax.html.bak"))

    def test_claim_filename_encoding_is_reversible_and_collision_free(self):
        self.assertNotEqual(scan.claim_filename("arena/foo--bar"), scan.claim_filename("arena/foo/bar"))
        self.assertNotIn("/", scan.claim_filename(BRANCH))


class CountPlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("staff_count_planner_test", STAFF.parent / "scripts/sync-counts.py")
        cls.counts = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.counts)

    def test_named_count_chrome_is_covered_by_the_canonical_planner(self):
        before = '<span id="count-all">708</span><strong id="heroToolCount">999+</strong> Free Tools'
        after, changes = self.counts.fix_text(before, 1165)
        self.assertIn('id="count-all">1165<', after)
        self.assertIn('id="heroToolCount">1165+<', after)
        self.assertEqual(len(changes), 2)

    def test_numeric_counts_do_not_rewrite_history_prices_or_unrelated_ids(self):
        before = 'On 2026-09-03 there were 644 tools.\n<span id="price">999</span>\nKeep 700 tools. <!-- historical-count -->'
        after, changes = self.counts.fix_text(before, 1165)
        self.assertEqual(before, after)
        self.assertEqual(changes, [])


if __name__ == "__main__":
    unittest.main()
