#!/usr/bin/env python3
"""Generates the Kestiv icon set from the K staircase grid (12x14 units). Run from web/: python3 scripts/icons.py"""
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

BRASS = (0xD9, 0xA4, 0x41, 255)
NIGHT = (0x0B, 0x0D, 0x0C, 255)
PATH = "M0,0H2V6H4V4H6V2H8V0H12V2H10V4H8V6H6V8H8V10H10V12H12V14H8V12H6V10H4V8H2V14H0Z"
# Same shape as PATH, as rectangles (x0, y0, x1, y1) in grid units.
RECTS = [(0, 0, 2, 14), (2, 6, 6, 8), (4, 4, 8, 6), (6, 2, 10, 4), (8, 0, 12, 2), (4, 8, 8, 10), (6, 10, 10, 12), (8, 12, 12, 14)]

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
PUBLIC = ROOT / "public"


def draw_k(img: Image.Image, unit: float, ox: float, oy: float) -> None:
    d = ImageDraw.Draw(img)
    for x0, y0, x1, y1 in RECTS:
        d.rectangle(
            [round(ox + x0 * unit), round(oy + y0 * unit), round(ox + x1 * unit) - 1, round(oy + y1 * unit) - 1],
            fill=BRASS,
        )


def tile(size: int) -> Image.Image:
    """Rounded night tile (viewBox -2 -1 16 16, rx 2) with the K on whole-unit offsets."""
    unit = size / 16
    ss = 8
    big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    ImageDraw.Draw(big).rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=2 * unit * ss, fill=NIGHT)
    img = big.resize((size, size), Image.LANCZOS)
    draw_k(img, unit, 2 * unit, 1 * unit)
    return img


def square(size: int) -> Image.Image:
    """Full-bleed night square, K centred (viewBox -6.5 -5.5 25 25). No transparency."""
    unit = size / 25
    img = Image.new("RGBA", (size, size), NIGHT)
    draw_k(img, unit, 6.5 * unit, 5.5 * unit)
    return img.convert("RGB").convert("RGBA")


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_ico(path: Path, sizes: list[int]) -> None:
    frames = [png_bytes(tile(s)) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries = b""
    for s, data in zip(sizes, frames):
        entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path.write_bytes(header + entries + b"".join(frames))


def main() -> None:
    (APP / "icon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -1 16 16" shape-rendering="crispEdges">'
        '<rect x="-2" y="-1" width="16" height="16" rx="2" fill="#0B0D0C"/>'
        f'<path d="{PATH}" fill="#D9A441"/></svg>\n'
    )
    write_ico(APP / "favicon.ico", [16, 32, 48])
    (APP / "apple-icon.png").write_bytes(png_bytes(square(180).convert("RGB")))
    PUBLIC.mkdir(exist_ok=True)
    for s in (192, 512):
        (PUBLIC / f"icon-{s}.png").write_bytes(png_bytes(square(s).convert("RGB")))


if __name__ == "__main__":
    main()
