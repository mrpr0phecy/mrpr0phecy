#!/usr/bin/env python3
"""measure.py — the hero, measured instead of eyeballed.

    python3 brand/measure.py            # needs fonttools (see brand/README.md)
    python3 brand/measure.py --strings  # no fonttools: just print what it reads

AGENTS.md asks for a look at the hub pages at 360 px and 1440 px. When there is
no browser to hand, this is the next best thing and it is honest about what it
is: real Inter advance widths (out of the shipped variable font) against the
clamp() values in home.css, at ten widths from 320 px to 1920 px. Every string
that has to fit on one line is reported with the width it needs and the width
it has.

It is a narrowing tool, not a substitute for looking: it cannot see a colour, a
z-order, an overlap or a font that failed to load. If a browser is available,
look.

The strings it measures are READ OUT OF index.html, not copied into this file.
They used to be six constants here, and two of them had drifted: it was
measuring "Search 1220 tools…" while the page said 1250, and a keyboard-hint
line the page no longer carried ("b keep in your toolbox" against the page's
"b toolbox"). A measuring tool that measures copy the site does not have
answers a question nobody asked, and it does it silently. Deriving them means
the only way this tool can disagree with the page is if it cannot find the
string at all — which is a loud failure (exit 1), not a quiet wrong number.
`--strings` exercises exactly that, and needs no fonttools.
"""
from __future__ import annotations

import os
import re
import sys
import tempfile
import html as _html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOFF2 = os.path.join(ROOT, "fonts", "inter-latin.woff2")
PAGE = os.path.join(ROOT, "index.html")


def _fonttools():
    """Imported on demand: `--strings` must work where fonttools is absent."""
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
    except ImportError:  # pragma: no cover - environment dependent
        raise SystemExit("measure.py needs fonttools for the width tables "
                         "(pip install fonttools). `--strings` needs nothing.")
    return TTFont, instantiateVariableFont


def _static(weight: int) -> str:
    """Pillow-less: fonttools reads the shipped variable woff2 and writes a
    static instance the width tables can be read from."""
    TTFont, instantiateVariableFont = _fonttools()
    out = os.path.join(tempfile.gettempdir(), f"measure-inter-{weight}.ttf")
    if not os.path.exists(out):
        f = TTFont(WOFF2)
        f.flavor = None
        instantiateVariableFont(f, {"wght": weight}, inplace=True, updateFontNames=False)
        f.save(out)
    return out


_FONTS: dict[int, str] = {}
_font_cache: dict[int, object] = {}
_cache: dict[tuple[int, str], float] = {}


def _fonts() -> dict[int, str]:
    """Built on first use, so importing this module costs nothing."""
    if not _FONTS:
        _FONTS.update({w: _static(w) for w in (400, 500, 600, 700, 800, 900)})
    return _FONTS


def advance(weight: int, text: str) -> float:
    """Width of `text` in em units at Inter weight `weight`."""
    key = (weight, text)
    if key in _cache:
        return _cache[key]
    TTFont, _ = _fonttools()
    font = _font_cache.get(weight)
    if font is None:
        font = _font_cache[weight] = TTFont(_fonts()[weight])
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upem = font["head"].unitsPerEm
    total = 0.0
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            raise SystemExit(f"Inter has no glyph for {char!r} — measure again")
        total += hmtx[name][0]
    _cache[key] = total / upem
    return _cache[key]


def px(em: float, font_px: float, tracking_em: float = 0.0, chars: int = 0) -> float:
    return em * font_px + tracking_em * font_px * chars


def clamp(lo: float, preferred_vw: float, hi: float, vw: float, base: float = 0.0) -> float:
    """CSS clamp(lo, base + preferred_vw, hi) resolved at a viewport width."""
    return max(lo, min(hi, base + preferred_vw * vw / 100))


WIDTHS = [320, 360, 390, 414, 480, 560, 768, 1024, 1440, 1920]

SEP_SPAN = re.compile(r'<span class="hero-fact-sep"[^>]*>\s*</span>')


def _missing(what: str) -> SystemExit:
    return SystemExit(
        f"measure.py: could not find {what} in index.html.\n"
        f"The hero changed shape. Fix THIS tool — do not paste the string back "
        f"in, or it goes back to measuring copy the site does not have.")


def _text(page: str, pattern: str, what: str, upper: bool = False) -> str:
    """The visible text of a hero element, tags stripped and entities decoded.

    Tags are removed WITHOUT substituting a space: the page writes
    `<kbd>j</kbd>/<kbd>k</kbd>` for "j/k", and inserting a space there would
    measure "j / k" — a longer string than anyone sees. The markup's own
    whitespace is what separates the words.
    """
    m = re.search(pattern, page, re.S)
    if not m:
        raise _missing(what)
    value = _html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))
    value = re.sub(r"\s+", " ", value).strip()
    return value.upper() if upper else value


def _span_inner(page: str, cls: str, what: str) -> str:
    """The inner HTML of the first `<span class="cls">`, nested spans included.

    A non-greedy `(.*?)</span>` stops at the first nested `</span>` — which is
    how this tool once measured "THE MOST" as the whole wordmark — so the spans
    are counted instead."""
    start = page.find(f'<span class="{cls}">')
    if start < 0:
        raise _missing(what)
    pos = depth = 0
    body_start = page.index(">", start) + 1
    pos = body_start
    depth = 1
    for tag in re.finditer(r"<(/?)span\b[^>]*>", page[body_start:]):
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            return page[body_start:body_start + tag.start()]
    raise _missing(what)


def _lockup_lines(page: str, cls: str, what: str) -> list[str]:
    """The wordmark's lines (each `.wm-line`), visible text, uppercased as the
    CSS renders them."""
    inner = _span_inner(page, cls, what)
    lines = []
    for m in re.finditer(r'<span class="wm-line">', inner):
        line = _span_inner(inner[m.start():], "wm-line", what)
        text = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", "", line))).strip()
        lines.append(text.upper())
    if not lines:
        raise _missing(f"{what} (no .wm-line spans)")
    return lines


def hero_strings() -> dict[str, str]:
    """Every string this tool measures, read out of index.html.

    Derived, never duplicated: the CSS applies text-transform: uppercase to
    the wordmarks, and the fact row's separators are empty spans that the
    stylesheet renders as a middot, so both are reproduced here rather than
    typed.
    """
    page = open(PAGE, encoding="utf-8").read()

    facts_m = re.search(r'<p class="hero-facts">(.*?)</p>', page, re.S)
    if not facts_m:
        raise _missing("the hero facts row")
    facts = _html.unescape(re.sub(r"<[^>]+>", "", SEP_SPAN.sub(" ·", facts_m.group(1))))
    facts = re.sub(r"\s+", " ", facts).strip()

    ph = re.search(r'id="tool-search"[^>]*?placeholder="([^"]*)"', page, re.S)
    if not ph:
        raise _missing("the search placeholder")

    return {
        "WORDMARK": " / ".join(_lockup_lines(page, "hero-wordmark", "the wordmark")),
        "H1": _text(page, r'class="futuristic-title">(.*?)</h1>', "the hero headline"),
        "SUBTITLE": _text(page, r'class="hero-subtitle">(.*?)</p>', "the hero subtitle"),
        "FACTS": facts,
        "KEYS": _text(page, r'class="hero-keys">(.*?)</p>', "the keyboard-hint line"),
        "FOOTER_MARK": " / ".join(_lockup_lines(page, "footer-wordmark", "the footer wordmark")),
        "PLACEHOLDER": _html.unescape(ph.group(1)),
    }


STRINGS = hero_strings()
WORDMARK, H1, SUBTITLE = STRINGS["WORDMARK"], STRINGS["H1"], STRINGS["SUBTITLE"]
FACTS, KEYS, FOOTER_MARK = STRINGS["FACTS"], STRINGS["KEYS"], STRINGS["FOOTER_MARK"]
PLACEHOLDER = STRINGS["PLACEHOLDER"]
WORDMARK_LINES, FOOTER_LINES = WORDMARK.split(" / "), FOOTER_MARK.split(" / ")

ORDER = ("WORDMARK", "H1", "SUBTITLE", "FACTS", "KEYS", "FOOTER_MARK", "PLACEHOLDER")

if "--strings" in sys.argv or "--check" in sys.argv:
    # Both are fonttools-free (the font tables are only built when a width is
    # actually asked for), and both exist so that this tool going stale is
    # caught by verify.sh rather than by a human noticing the numbers.
    #   --strings  show me the copy it is measuring
    #   --check    assert it can still read that copy, in one line
    if "--strings" in sys.argv:
        for k in ORDER:
            print(f"  {k:<12} {STRINGS[k]}")
    print(f"MEASURE STRINGS OK — {len(STRINGS)} string(s) read from index.html.")
    raise SystemExit(0)

print(f"{'vw':>5} {'line':<11} {'size':>6} {'text':>7} {'avail':>7}  verdict")
problems = []
for vw in WIDTHS:
    # The hero's content box: page padding is clamp(14px, 4vw, 24px) a side.
    pad = clamp(14, 4, 24, vw)
    hero = vw - 2 * pad

    # The brand lockup (home.css "brand lockup"): mark clamp(38px, 9.5vw, 46px),
    # then 12 px + 1 px hairline + 12 px, then the wordmark's longer line —
    # each .wm-line is white-space: nowrap, so this must fit or it overflows.
    mark = clamp(38, 9.5, 46, vw)
    wm_size = clamp(0.7 * 16, 2.1, 0.8 * 16, vw)
    wm_w = max(px(advance(800, line), wm_size, 0.14, len(line)) for line in WORDMARK_LINES)
    avail = hero - mark - 25
    ok = wm_w <= avail
    print(f"{vw:>5} {'wordmark':<11} {wm_size:>6.1f} {wm_w:>7.0f} {avail:>7.0f}  {'fits' if ok else 'OVERFLOWS'}")
    if not ok:
        problems.append((vw, 'wordmark', wm_w, avail))

    # The title: max-width 22ch, centred, and free to wrap (text-wrap: balance).
    title_size = clamp(1.6 * 16, 6.4, 3.35 * 16, vw)
    box = min(hero, 26 * advance(800, "0") * title_size)
    line = px(advance(800, H1), title_size, -0.035, len(H1))
    print(f"{vw:>5} {'title':<11} {title_size:>6.1f} {line:>7.0f} {box:>7.0f}  "
          f"{'1 line' if line <= box else f'{line / box:.1f} lines'}")

    # The standfirst: max-width 62ch.
    sub_size = clamp(0.95 * 16, 2.4, 1.1 * 16, vw)
    box = min(hero, 62 * advance(400, "0") * sub_size)
    line = px(advance(400, SUBTITLE), sub_size)
    print(f"{vw:>5} {'subtitle':<11} {sub_size:>6.1f} {line:>7.0f} {box:>7.0f}  "
          f"{'1 line' if line <= box else f'{line / box:.1f} lines'}")

    # The search placeholder: the field is max-width 640, minus its padding.
    field = min(hero, 640)
    field_pad = clamp(46, 11, 68, vw)
    avail = field - 2 * field_pad
    need = px(advance(400, PLACEHOLDER), 16)
    verdict = 'fits' if need <= avail else 'clips (as before this change)'
    print(f"{vw:>5} {'placeholder':<11} {16:>6.1f} {need:>7.0f} {avail:>7.0f}  {verdict}")

    # The two quiet lines under the search box.
    facts_size = clamp(0.78 * 16, 2.1, 0.86 * 16, vw)
    need = px(advance(600, FACTS), facts_size) + 8 + 8
    print(f"{vw:>5} {'facts':<11} {facts_size:>6.1f} {need:>7.0f} {hero:>7.0f}  "
          f"{'fits' if need <= hero else 'WRAPS (wraps by design: flex-wrap)'}")
    keys_size = 0.78 * 16
    need = px(advance(500, KEYS), keys_size) + 6 * 12
    print(f"{vw:>5} {'keys':<11} {keys_size:>6.1f} {need:>7.0f} {hero:>7.0f}  "
          f"{'fits' if need <= hero else 'WRAPS (wraps by design)'}")

    # The footer lockup: a 30 px mark, 10 + 1 + 10 px of divider, 0.66rem.
    need = 30 + 21 + max(px(advance(800, line), 0.66 * 16, 0.14, len(line)) for line in FOOTER_LINES)
    print(f"{vw:>5} {'footer':<11} {0.66 * 16:>6.1f} {need:>7.0f} {hero:>7.0f}  "
          f"{'fits' if need <= hero else 'OVERFLOWS'}")
    if need > hero:
        problems.append((vw, 'footer', need, hero))
    print()

print("PROBLEMS:", problems or "none")
