"""The mark — geometry, and the rasteriser every shipped icon comes out of.

One drawing, six files. `gen_assets.py` writes them all from this module:

    logo-mark.svg / favicon.svg   the mark as vector (written by gen_assets.py,
                                  from the same constants below)
    favicon.ico                   16 / 32 / 48 px
    icon-192.png, icon-512.png    PWA, Android, store listings
    icon-maskable-512.png         PWA maskable (safe zone respected)
    apple-touch-icon.png          180 px, opaque — iOS composites transparency
                                  onto black, so it gets a background of its own

Coordinate space is the mark's own 32x32 box, scaled to whatever pixel size is
asked for, drawn at 8x and box-filtered down — cheap, high-quality AA.

To change the mark: edit the numbers here, run
`python3 brand/gen_assets.py` (see brand/README.md for the two pip packages it
needs) and `python3 brand/check-mark.py` to prove the SVG and the rasters still
agree. Nothing else in the repository knows what the logo looks like.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

# ----------------------------------------------------------------- geometry --
BOX = 32.0

TILE_RADIUS = 9.4                 # squircle-ish rounded square
LENS_CENTRE = (14.0, 14.0)
LENS_RADIUS = 6.9
LENS_STROKE = 2.8
HANDLE_WIDTH = 3.1
HANDLE_FROM = (19.3, 19.3)
HANDLE_TO = (24.75, 24.75)
SPARK_RADIUS = 3.95               # tip distance from the lens centre
SPARK_WAIST = 1.72                # quadratic control point at the 45 deg points
LENS_FILL = (7, 21, 44, 165)      # the dark interior that makes the ring read
GLYPH_SCALE = 0.94                # the whole glyph, about the tile centre

# Cyan (the site's accent, #2dd4ff) through to a deeper azure. These three
# values are also the site's palette — they are not a second, private colour.
GRADIENT = [
    (0.00, (111, 240, 255)),
    (0.42, (45, 212, 255)),
    (1.00, (47, 107, 255)),
]
GRADIENT_ANGLE = 45.0             # light from the top-left (matches the SVG's 0,0 -> 1,1)
GLOSS_TOP = 0.20                  # white sheen across the top of the tile


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


def _spark_polygon(cx: float, cy: float, radius: float, waist: float,
                   scale: float) -> list[tuple[float, float]]:
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
    g: dict = {}
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

    centre = BOX / 2.0

    def point(x: float, y: float) -> tuple[float, float]:
        """Mark coordinates -> canvas pixels, scaled about the tile centre."""
        sx = centre + (x - centre) * GLYPH_SCALE
        sy = centre + (y - centre) * GLYPH_SCALE
        return (margin + sx * inner_scale, margin + sy * inner_scale)

    cx, cy = point(*LENS_CENTRE)
    lens_fill_r = LENS_RADIUS * GLYPH_SCALE * inner_scale
    lens_outer = (LENS_RADIUS + LENS_STROKE / 2) * GLYPH_SCALE * inner_scale

    # Lens interior first, then the ring on top of it.
    draw.ellipse((cx - lens_fill_r, cy - lens_fill_r, cx + lens_fill_r, cy + lens_fill_r),
                 fill=LENS_FILL)
    draw.ellipse((cx - lens_outer, cy - lens_outer, cx + lens_outer, cy + lens_outer),
                 outline=(255, 255, 255, 255),
                 width=max(1, int(round(LENS_STROKE * GLYPH_SCALE * inner_scale))))

    # Handle: a fat rounded capsule out of the bottom-right of the lens.
    handle_px = max(1, int(round(HANDLE_WIDTH * GLYPH_SCALE * inner_scale)))
    x0, y0 = point(*HANDLE_FROM)
    x1, y1 = point(*HANDLE_TO)
    draw.line((x0, y0, x1, y1), fill=(255, 255, 255, 255), width=handle_px)
    for (px, py) in ((x0, y0), (x1, y1)):
        draw.ellipse((px - handle_px / 2, py - handle_px / 2, px + handle_px / 2, py + handle_px / 2),
                     fill=(255, 255, 255, 255))

    if spark:
        polygon = [point(x, y) for x, y in
                   _spark_polygon(LENS_CENTRE[0], LENS_CENTRE[1],
                                  SPARK_RADIUS, SPARK_WAIST, GLYPH_SCALE)]
        draw.polygon(polygon, fill=(255, 255, 255, 255))

    return image.resize((size, size), Image.LANCZOS)


def render_source(size: int, **kwargs) -> Image.Image:
    """The same mark, but on an opaque background — what Apple's touch icon and
    the maskable PWA icon need (transparency must not be load-bearing)."""
    kwargs.setdefault("background", (10, 15, 20, 255))
    return render_mark(size, **kwargs)
