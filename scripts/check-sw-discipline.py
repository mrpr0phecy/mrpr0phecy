#!/usr/bin/env python3
"""check-sw-discipline.py — the service worker may stall a page, never cause it.

This guard exists because of a bug that was reported three times before it was
fixed. The worker answered a click, and after roughly five clicks the tab went
white, then showed a page nobody had asked for. Nothing in the old gate could
see it: every rule below is a property the shipped code violated while all of
its tests stayed green.

Each rule is a shape the network layer must keep. They are cheap, textual and
deliberately boring — the point is that re-introducing one is a build failure
with a sentence about the user-visible consequence attached, not a design
review. Run with:

    python3 scripts/check-sw-discipline.py            # checks ./sw.js
    python3 scripts/check-sw-discipline.py --file X   # checks X (used by tests)

  1. fetch-signal       every fetch() carries an AbortSignal. A fetch nobody can
                        cancel holds an origin socket until the browser gives up
                        (~300 s); six of those and the next click queues behind
                        them. That queue WAS the stall.
  2. cache-guarded      every caches.* call is inside try/catch or has .catch().
                        An uncaught quota error rejected respondWith(), which
                        Chromium renders as "this page isn't working" — and a
                        failed activate leaves the worker uninstalled for the
                        rest of the session.
  3. finite-waits       every wait/limit constant is a finite positive number.
                        One unbounded await on a slow response is enough to hang
                        a page forever.
  4. no-index-swap      the cached index may only substitute for a navigation
                        when the browser says it is offline. Serving index.html
                        for /tool.html?card=x while online is "it doesn't load
                        the page I selected", at an address bar that contradicts
                        the content.
  5. wrapped-dispatch   all respondWith() calls live inside route(), which the
                        fetch listener calls inside try/catch, so a throwing
                        worker hands the request back to the browser instead of
                        failing it.
  6. bounded-backlog    background refreshes share one bounded queue, and every
                        navigation clears it: speculative work must never be able
                        to outlive the page view that queued it.
  7. escape-hatch       repeated fallbacks disarm the worker (cool-off marker +
                        registration.unregister()) and mp:stats reports what it
                        did. When the worker is the problem, it must be able to
                        stop being the problem without a deploy.
  8. prefetch-through   hover prefetches of documents are passed to the browser
                        (req.mode !== 'navigate' && req.destination ===
                        'document'); intercepting them doubles the traffic a
                        hover-prefetching page generates.
  9. store-200          only status 200 is written to a cache, so an error page
                        cannot be stored and replayed as "content".
"""
import math
import re
import sys

FETCH_CALL = re.compile(r"\bfetch\(")
CACHE_CALL = re.compile(r"\b(?:caches\.open|cache\.(?:match|put|keys|delete|addAll))\(")
NUM_CONST = re.compile(
    r"^const\s+([A-Z][A-Z0-9_]*_(?:MS|LIMIT|BACKLOG|ENTRIES|EVERY))\s*=\s*([^;]+);",
    re.M,
)


def mask(text):
    """`text` with comments blanked out (offsets and line numbers preserved).

    Prose in this file explains the bug in detail and mentions fetch() while
    doing it; a guard that flags comments is a guard people switch off. Strings
    are skipped so a URL's `//` does not start a comment.
    """
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in "\"'`":
            q, i = c, i + 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == q:
                    i += 1
                    break
                i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if text[k] != "\n":
                    out[k] = " "
            i = j
            continue
        i += 1
    return "".join(out)


def number(expr):
    """Value of a `123 * 45 + 6` expression, or None if it is anything else.
    Deliberately not eval(): the guard has to be readable at a glance, and an
    expression it cannot understand is itself the thing worth flagging."""
    if not re.fullmatch(r"[\d_+* ]+", expr):
        return None
    total = 0
    for part in expr.split("+"):
        factor = 1
        for term in part.strip().split("*"):
            term = term.strip().replace("_", "")
            if not term.isdigit():
                return None
            factor *= int(term)
        total += factor
    return float(total)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def statement(text, pos):
    """The enclosing statement, from the start of its line to the `;` that ends
    it at depth 0 — chained continuations (`).catch(() => null)`) included, so
    a guard on the statement sees the whole expression."""
    start = text.rfind("\n", 0, pos) + 1
    depth = 0
    i = pos
    end = min(len(text), start + 2000)
    while i < end:
        c = text[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        elif c == ";" and depth <= 0:
            return text[start : i + 1]
        i += 1
    return text[start:end]


def try_spans(text):
    """(start, end) of every `try { ... }` block, brace-balanced."""
    out = []
    for m in re.finditer(r"\btry\s*\{", text):
        depth = 0
        k = text.index("{", m.start())
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    out.append((m.start(), k))
                    break
            k += 1
    return out


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def block(text, opener):
    """(start, end) offsets of the balanced block that `opener` begins, or None."""
    i = text.find(opener)
    if i < 0:
        return None
    j = text.find("{", i)
    if j < 0:
        return None
    depth = 0
    k = j
    while k < len(text):
        if text[k] == "{":
            depth += 1
        elif text[k] == "}":
            depth -= 1
            if depth == 0:
                return (i, k + 1)
        k += 1
    return None


def function_span(text, name):
    """Span of a top-level `function name(` / `async function name(` definition."""
    for m in re.finditer(
        r"^(?:async\s+)?function\s+" + re.escape(name) + r"\s*\(", text, re.M
    ):
        j = text.find("{", m.end() - 1)
        depth = 0
        k = j
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    return (m.start(), k + 1)
            k += 1
    return None


def check(src):
    """Return [(line, rule, message)]. `src` is the real file text."""
    text = mask(src)
    out = []
    bad = out.append

    def num(pos):
        return line_of(text, pos)

    # 1 ─ every fetch is cancellable ───────────────────────────────────────────
    for m in FETCH_CALL.finditer(text):
        if re.search(r"\bfunction\s+$", text[max(0, m.start() - 12): m.start()]):
            continue
        stmt = statement(text, m.start())
        if "signal" not in stmt:
            bad((num(m.start()), "fetch-signal",
                 "a fetch() with no signal cannot be aborted; add `signal: ctl.signal`. "
                 "An uncancellable request holds an origin socket and the next click queues "
                 "behind it"))

    # 2 ─ no cache call may reject the response ────────────────────────────────
    spans = try_spans(text)
    for m in CACHE_CALL.finditer(text):
        stmt = statement(text, m.start())
        if ".catch(" in stmt or any(a <= m.start() <= b for a, b in spans):
            continue
        bad((num(m.start()), "cache-guarded",
             "this cache call can reject (quota, private mode) and take respondWith() "
             "down with it; wrap it in try/catch or use openCache()/matchQuietly()/store()"))

    # 3 ─ nothing waits forever ────────────────────────────────────────────────
    for m in NUM_CONST.finditer(text):
        name, expr = m.group(1), m.group(2).strip()
        val = number(expr)
        if val is None or not math.isfinite(val) or val <= 0:
            bad((num(m.start()), "finite-waits",
                 f"{name} = {expr!r} is not a finite positive number; a bound that is "
                 "Infinity, a string or something computed can hang a page forever"))

    # 4 ─ the index is an offline fallback, never an online substitute ─────────
    for m in re.finditer(r"\bcachedIndex\(\)", text):
        if re.search(r"\bfunction\s+$", text[max(0, m.start() - 12): m.start()]):
            continue                    # the definition, not a use
        head = "\n".join(text[: m.start()].splitlines()[-6:])
        if "onLine" not in head:
            bad((num(m.start()), "no-index-swap",
                 "cachedIndex() must be guarded by a navigator.onLine check — substituting "
                 "the index for a page that exists is the reported 'wrong page' bug"))

    # 5 ─ a throwing worker bows out instead of failing the request ────────────
    listener = block(text, "self.addEventListener('fetch'")
    route = function_span(text, "route")
    if not route:
        bad((1, "wrapped-dispatch",
             "no top-level `function route(event)` — the fetch listener must delegate so a "
             "synchronous throw can be caught and the request left to the browser"))
    if listener and route:
        body = text[listener[0]: listener[1]]
        for need, why in (("try {", "no try around the call"),
                          ("route(event)", "the listener does not call route(event)"),
                          ("catch", "no catch: a throw becomes a browser error page")):
            if need not in body:
                bad((num(listener[0]), "wrapped-dispatch", f"the fetch listener has {why}"))
    for m in re.finditer(r"\.respondWith\(", text):
        if route and not (route[0] <= m.start() <= route[1]):
            bad((num(m.start()), "wrapped-dispatch",
                 "respondWith() outside route() is not covered by the catch that keeps the "
                 "worker from being the cause; move it inside"))

    # 6 ─ background work is bounded and cleared by navigation ─────────────────
    nav = function_span(text, "navigateFast")
    if "clearBacklog()" not in (text[nav[0]: nav[1]] if nav else ""):
        bad((num(nav[0]) if nav else 1, "bounded-backlog",
             "navigateFast() must call clearBacklog(): queued refreshes from the previous "
             "page view are the traffic that blocks this one"))
    for name in ("BACKGROUND_LIMIT", "BACKGROUND_BACKLOG"):
        if not re.search(r"^const\s+" + name + r"\s*=", text, re.M):
            bad((1, "bounded-backlog", f"{name} is missing — the refresh queue is unbounded"))

    # 7 ─ the escape hatch ─────────────────────────────────────────────────────
    if "unregister()" not in text:
        bad((1, "escape-hatch",
             "the worker never gives up: after repeated fallbacks it must registration"
             "().unregister() so the site works without it"))
    for needle, label in (("COOLOFF_KEY", "the cool-off marker"),
                          ("mp:stats", "the mp:stats diagnostics message"),
                          ("STUCK_LIMIT", "the stuck-navigation limit")):
        if needle not in text:
            bad((1, "escape-hatch", f"{label} is missing"))
    act = function_span(text, "activate") or block(text, "self.addEventListener('activate'")
    if act and "readCooloff" not in text[act[0]: act[1]]:
        bad((num(act[0]), "escape-hatch",
             "activate must call readCooloff(), or a page reload re-arms a worker that "
             "disarmed itself and the cool-off only lasts until the next navigation"))

    # 8 ─ hover prefetches stay the browser's job ──────────────────────────────
    if not re.search(r"mode\s*!==\s*'navigate'\s*&&\s*\w+\.destination\s*===\s*'document'", text):
        bad((1, "prefetch-through",
             "no passthrough for non-navigation document requests (hover prefetches): "
             "intercepting them doubles the traffic a prefetching page generates"))

    # 9 ─ never cache an error page ────────────────────────────────────────────
    st = function_span(text, "store")
    if not st or "status !== 200" not in text[st[0]: st[1]]:
        bad((num(st[0]) if st else 1, "store-200",
             "store() must write only status 200 responses, or a 404/500 gets replayed "
             "as the page for that URL"))

    return sorted(out)


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(__doc__.strip())
        print("\nusage: check-sw-discipline.py [--file PATH]   (default: ./sw.js)")
        return 0
    path = "sw.js"
    if "--file" in argv:
        i = argv.index("--file")
        if i + 1 >= len(argv):
            print("check-sw-discipline.py: --file needs a path", file=sys.stderr)
            return 2
        path = argv[i + 1]
    elif len(argv) > 1:
        path = argv[1]
    try:
        text = read(path)
    except OSError as e:
        print(f"check-sw-discipline.py: cannot read {path}: {e}", file=sys.stderr)
        return 2
    found = check(text)
    for line, rule, message in found:
        print(f"{path}:{line}: {rule}: {message}")
    if found:
        print(f"\n{len(found)} service-worker discipline violation(s). The rules and the "
              f"failures they prevent are documented in {__file__.split('/')[-1]}.")
        return 1
    print(f"{path}: service-worker discipline OK (9 rules)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
