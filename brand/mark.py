"""The mark — geometry, and the rasteriser every shipped icon comes out of.

One drawing, every file. `gen_assets.py` writes them all from this module:

    logo-mark.svg / favicon.svg   the mark as vector (written by gen_assets.py,
                                  from the same constants below)
    favicon.ico                   16 / 32 / 48 px
    icon-192.png, icon-512.png    PWA, Android, store listings
    icon-maskable-512.png         PWA maskable (safe zone respected)
    apple-touch-icon.png          180 px, opaque — iOS composites transparency
                                  onto black, so it gets a background of its own
    logo-mark-mono-*.svg          the one-colour reduction, for print and for
                                  surfaces the tile cannot sit on
    logo-lockup-*.svg             mark + wordmark, outlines, no font required

Coordinate space is the mark's own 32x32 box, scaled to whatever pixel size is
asked for, drawn at 8x and box-filtered down — cheap, high-quality AA.

## The drawing, and why it is drawn this way

An **aperture**: an ink disc at the optical centre of the tile, a white
four-point spark inside it, and an ink needle to the bottom-right. The needle is
what makes it read as *search*; the spark is the answer; the disc is the
aperture the answer arrives through.

The glyph is **ink on the accent gradient, never white on it**. That was the
2026-09-24 change and it fixed the one thing that was actually broken about the
old mark: white over the top-left of the gradient (`#6ff0ff`) is about 1.4:1
contrast — at 16 px the ring dissolved into the tile and the icon read as a grey
smudge. Ink (`#071019`) over the same spot is about 14:1, so the same drawing
survives the favicon, and the interior is opaque rather than a translucent fill
that tinted toward grey.

Everything is centred on (16, 16). The old mark sat 2 units up and to the left
to make room for its handle; the needle here leaves the disc's own edge instead,
so the glyph has no reason to be off-centre.

To change the mark: edit the numbers here, run `python3 brand/gen_assets.py`
(see brand/README.md for the two pip packages it needs) and
`python3 brand/check-mark.py` to prove the SVG and the rasters still agree.
Nothing else in the repository knows what the logo looks like.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

# ----------------------------------------------------------------- geometry --
BOX = 32.0

TILE_RADIUS = 9.2                 # squircle-ish rounded square

# The aperture: an opaque ink disc, centred.
DISC_CENTRE = (16.0, 16.0)
DISC_RADIUS = 7.8

# The spark: four tips at the compass points, quadratic sides. The waist is the
# distance from the centre to each 45-degree control point, so it is the only
# number that decides how much the sides cave in.
SPARK_RADIUS = 4.85
SPARK_WAIST = 2.30

# The needle: out of the disc's own edge on the 45-degree diagonal, so the two
# shapes are one silhouette rather than a circle beside a stick.
NEEDLE_FROM = (21.5, 21.5)
NEEDLE_TO = (25.9, 25.9)
NEEDLE_WIDTH = 2.9

# Reticle ticks — four short bars outside the disc at N/E/S/W — were drawn here
# on 2026-09-24 and removed the same day. At 24 px and above they earn their
# place (they are what makes the mark read as an instrument rather than a
# button), but a browser renders the *same* file at 16 px in the tab, and at
# 16 px a 1.35-unit bar is under a pixel wide: four grey smudges around the
# disc, which is the exact defect this redesign set out to remove. Keeping the
# tab crisp was worth more than the ticks, so the canonical drawing has none.
# The instrument feel lives in the page's own chrome instead, where it scales.

# The one-colour reduction draws the disc as a ring of this width instead of a
# filled disc (so it needs no knockout) — same centre, same radius, same spark,
# same needle. That is the whole of the difference between the two files.
RING_STROKE = 2.5

# Cyan (the site's accent, #2dd4ff) through to a deeper azure. These three
# values are also the site's palette — they are not a second, private colour.
GRADIENT = [
    (0.00, (111, 240, 255)),
    (0.42, (45, 212, 255)),
    (1.00, (47, 107, 255)),
]
GRADIENT_ANGLE = 45.0             # light from the top-left (matches the SVG's 0,0 -> 1,1)
GLOSS_TOP = 0.16                  # white sheen across the top of the tile (was 0.20;
                                  # with a solid ink disc on top the extra sheen read
                                  # as a haze rather than as glass)

INK = (7, 16, 25)                 # #071019 — the glyph, and the mono-dark colour
PAPER = (255, 255, 255)           # the spark, and the mono-light colour
TILE_INK = (10, 15, 20)           # the opaque background iOS/maskable icons need


def linear_gradient(size: int, stops, angle_deg: float) -> Image.Image:
    """An RGB linear gradient, size x size, drawn in the mark's 32-unit box."""
    xs = np.linspace(0.0, 1.0, size, dtype=np.float32)
    ys = np.linspace(0.0, 1.0, size, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(xs, ys)
    angle = math.radians(angle_deg)
    t = grid_x * math.cos(angle) + grid_y * math.sin(angle)
    t = (t - t.min()) / (t.max() - t.min() or 1.0)

    positions = np.array([p for p, _ in stops], dtype=np.float32)
    colours = np.array([c for _, c in stops], dtype=np.float32)
    channels = [np.interp(t, positions, colours[:, i]) for i in range(3)]
    array = np.stack(channels, axis=-1).astype(np.uint8)
    return Image.fromarray(array, "RGB")


def spark_points(cx: float, cy: float, radius: float, waist: float,
                 scale: float = 1.0) -> list[tuple[float, float]]:
    """A four-point spark: quadratic curves between the four tips, sampled.

    The SVG's spark path is this construction written as four `Q` commands, so
    the two agree to ~0.0002 of a unit (brand/check-mark.py proves it).
    """
    points: list[tuple[float, float]] = []
    angles = [270.0, 0.0, 90.0, 180.0]          # up, right, down, left (screen coords)
    for index, start in enumerate(angles):
        end = angles[(index + 1) % 4]
        # Control point sits on the 45 deg bisector, `waist` from the centre.
        bisector = start + 45.0
        ctrl = (
            cx + waist * scale * math.cos(math.radians(bisector)),
            cy + waist * scale * math.sin(math.radians(bisector)),
        )
        p0 = (
            cx + radius * scale * math.cos(math.radians(start)),
            cy + radius * scale * math.sin(math.radians(start)),
        )
        p2 = (
            cx + radius * scale * math.cos(math.radians(end)),
            cy + radius * scale * math.sin(math.radians(end)),
        )
        for step in range(0, 33):
            u = step / 32.0
            inv = 1.0 - u
            x = inv * inv * p0[0] + 2 * inv * u * ctrl[0] + u * u * p2[0]
            y = inv * inv * p0[1] + 2 * inv * u * ctrl[1] + u * u * p2[1]
            points.append((x, y))
    return points


def _spark_polygon(cx: float, cy: float, radius: float, waist: float,
                   scale: float) -> list[tuple[float, float]]:
    """Kept as the old name too: it is the same construction."""
    return spark_points(cx, cy, radius, waist, scale)


def glyph_layer(canvas: int, *, colour=INK, ring: bool = False,
                stroke_scale: float = 1.0) -> Image.Image:
    """The glyph alone, on transparency, drawn at `canvas` pixels — no resize.

    This is the one place the glyph is drawn. `render_glyph` wraps it for the
    standalone (mono) case; `render_mark` calls it directly with the same canvas
    the tile was drawn on, so the glyph and the tile are always the same
    resolution and the same scale. Compositing a finished, already-resized glyph
    into the supersampled tile was a real bug on 2026-09-24: it landed at 1/8
    scale in the top-left corner.

    `ring=True` draws the aperture as a ring of RING_STROKE instead of a filled
    disc — the one-colour reduction, which needs no knockout.
    """
    scale = canvas / BOX
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    fill = tuple(colour) + (255,) if len(colour) == 3 else tuple(colour)

    if ring:
        width = max(1, int(round(RING_STROKE * stroke_scale * scale)))
        r = DISC_RADIUS * scale
        cx, cy = DISC_CENTRE[0] * scale, DISC_CENTRE[1] * scale
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=fill, width=width)
    else:
        r = DISC_RADIUS * scale
        cx, cy = DISC_CENTRE[0] * scale, DISC_CENTRE[1] * scale
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)

    # The spark: drawn in the tile colour when the glyph is a disc (it is a
    # knockout), and in the glyph colour when it is a ring (there is nothing to
    # knock out of).
    spark_colour = PAPER if not ring else colour
    polygon = [(x * scale, y * scale) for x, y in
               spark_points(DISC_CENTRE[0], DISC_CENTRE[1], SPARK_RADIUS,
                            SPARK_WAIST, 1.0)]
    draw.polygon(polygon, fill=tuple(spark_colour) + (255,))

    # The needle.
    needle_px = max(1, int(round(NEEDLE_WIDTH * stroke_scale * scale)))
    x0, y0 = NEEDLE_FROM[0] * scale, NEEDLE_FROM[1] * scale
    x1, y1 = NEEDLE_TO[0] * scale, NEEDLE_TO[1] * scale
    draw.line((x0, y0, x1, y1), fill=fill, width=needle_px)
    for (px, py) in ((x0, y0), (x1, y1)):
        draw.ellipse((px - needle_px / 2, py - needle_px / 2,
                      px + needle_px / 2, py + needle_px / 2), fill=fill)

    return image


def render_glyph(size: int, *, supersample: int = 8, colour=INK,
                 ring: bool = False, stroke_scale: float = 1.0) -> Image.Image:
    """The standalone glyph at `size` px — the mono mark, and the test surface.

    Drawn at `supersample`x and box-filtered down, exactly like the tile.
    """
    canvas = int(round(size * supersample))
    image = glyph_layer(canvas, colour=colour, ring=ring,
                        stroke_scale=stroke_scale)
    return image.resize((size, size), Image.LANCZOS)


def render_mark(size: int, *, supersample: int = 8, spark: bool = True,
                tile: bool = True, radius_scale: float = 1.0,
                background: tuple[int, int, int, int] | None = None,
                inset: float = 0.0, gloss: bool = True) -> Image.Image:
    """The mark at `size` px.

    `inset` shrinks the tile inside the canvas (the maskable icon's safe zone,
    the Apple touch icon). One geometry at every size on purpose: the favicon,
    the raster icons and the hero lockup are then literally the same drawing,
    and a change to the mark cannot drift between them.
    """
    scale = size * supersample / BOX
    canvas = int(round(size * supersample))

    image = Image.new("RGBA", (canvas, canvas), background or (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")

    margin = inset * canvas
    inner = canvas - 2 * margin
    inner_scale = (inner / canvas) * scale

    if tile:
        pixels = int(round(inner))
        radius = TILE_RADIUS * inner_scale * radius_scale
        gradient = np.asarray(linear_gradient(pixels, GRADIENT, GRADIENT_ANGLE))
        shape = Image.new("L", (pixels, pixels), 0)
        ImageDraw.Draw(shape).rounded_rectangle(
            (0, 0, pixels - 1, pixels - 1), radius=radius, fill=255)
        shape = np.asarray(shape)

        tile_layer = np.zeros((pixels, pixels, 4), dtype=np.uint8)
        tile_layer[..., :3] = gradient
        tile_layer[..., 3] = shape
        image.alpha_composite(Image.fromarray(tile_layer, "RGBA"), (int(round(margin)),) * 2)

        if gloss:
            # A vertical white sheen, faded out as it runs down the tile, inside
            # the same rounded rect. Composited, not pasted: paste() with a mask
            # copies the colour and throws the source alpha away.
            rows = np.linspace(1.0, 0.0, pixels, dtype=np.float32)
            sheen = np.zeros((pixels, pixels, 4), dtype=np.uint8)
            sheen[..., :3] = 255
            sheen[..., 3] = ((np.clip(rows, 0, 1) ** 1.4)[:, None]
                             * (shape / 255.0) * GLOSS_TOP * 255).astype(np.uint8)
            image.alpha_composite(Image.fromarray(sheen, "RGBA"), (int(round(margin)),) * 2)

    if spark:
        # The glyph is drawn at the tile's own resolution inside the tile's
        # inset box: a maskable icon crops the tile, and the glyph has to shrink
        # with it or the crop eats the needle.
        inner_canvas = int(round(canvas * (1 - 2 * inset)))
        glyph = glyph_layer(inner_canvas, colour=INK, ring=False)
        image.alpha_composite(glyph, (int(round(margin)),) * 2)

    return image.resize((size, size), Image.LANCZOS)


def render_monochrome(size: int, colour, *, supersample: int = 8) -> Image.Image:
    """The one-colour mark: ring, spark and needle in `colour`, no tile.

    Used by press, print and anything the tile cannot sit on. It is the same
    geometry as the primary mark with the disc drawn as a ring (see RING_STROKE).
    """
    return render_glyph(size, supersample=supersample, colour=colour, ring=True)


def render_source(size: int, **kwargs) -> Image.Image:
    """The same mark, but on an opaque background — what Apple's touch icon and
    the maskable PWA icon need (transparency must not be load-bearing)."""
    kwargs.setdefault("background", TILE_INK + (255,))
    return render_mark(size, **kwargs)
