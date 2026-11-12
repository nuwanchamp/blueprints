"""Generate the stand-in brand assets (logos, report-cover art, app icons, splash logo).

The original product shipped with its client's own logo and artwork. Those are not part of this repo, so this script
draws neutral replacements into the same file names and sizes the app expects.

    python3 tools/make_placeholders.py        # needs Pillow: pip install pillow
"""
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets"
BUILD = ROOT / "build"
INK, PAPER, DARK = (21, 20, 19), (243, 237, 224), (43, 38, 35)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=size)


def mark(d: ImageDraw.ImageDraw, cx: int, cy: int, s: int, fg, bg) -> None:
    """An open ledger: two pages, ruled lines, a spine."""
    w, h = int(s * 0.9), int(s * 0.66)
    x0, y0 = cx - w // 2, cy - h // 2
    t = max(2, s // 28)
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=s // 14, outline=fg, width=t)
    d.line([cx, y0, cx, y0 + h], fill=fg, width=t)
    for i in range(1, 5):
        y = y0 + i * h // 5
        d.line([x0 + w // 12, y, cx - w // 12, y], fill=fg, width=max(1, t // 2))
        d.line([cx + w // 12, y, x0 + w - w // 12, y], fill=fg, width=max(1, t // 2))
    d.rectangle([cx - t, y0 - t, cx + t, y0 + h + t], fill=fg)
    d.rectangle([cx - t // 2, y0 - t, cx + t // 2, y0 + h + t], fill=bg)


def logo(size: int, fg, bg, mode: str) -> Image.Image:
    img = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(img)
    mark(d, size // 2, int(size * 0.42), int(size * 0.62), fg, bg)
    f = font(int(size * 0.13))
    text = "DAYBOOK"
    tw = d.textlength(text, font=f)
    d.text(((size - tw) / 2, size * 0.76), text, font=f, fill=fg)
    return img.convert("L") if mode == "L" else img


def painting(w: int = 744, h: int = 2048) -> Image.Image:
    """Soft ruled paper with a few ink bands. Light base, because the cover multiplies it onto cream."""
    rnd = random.Random(7)
    img = Image.new("RGB", (w, h), (247, 243, 234))
    d = ImageDraw.Draw(img, "RGBA")
    for y in range(60, h, 46):
        d.line([0, y, w, y], fill=(120, 110, 95, 40), width=2)
    for _ in range(9):
        x, bw = rnd.randint(-40, w - 80), rnd.randint(40, 220)
        y0 = rnd.randint(0, h - 600)
        d.rectangle([x, y0, x + bw, y0 + rnd.randint(300, 900)], fill=(60 + rnd.randint(0, 40), 55, 50, rnd.randint(18, 46)))
    d.rectangle([w - 14, 0, w, h], fill=(*INK, 160))
    return img


def splash_svg() -> str:
    paths = (
        '<path d="M60 90 h280 a20 20 0 0 1 20 20 v190 a20 20 0 0 1 -20 20 h-280 a20 20 0 0 1 -20 -20 v-190 a20 20 0 0 1 20 -20 z"/>'
        '<path d="M200 90 v230"/>'
        + "".join(f'<path d="M{60 + 16} {130 + i * 40} h{104}"/><path d="M{216} {130 + i * 40} h{104}"/>' for i in range(4))
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 420" width="400" height="420" role="img" aria-label="Daybook logo">
<title>Daybook</title>
<style>
#type path{{fill:none;stroke:#666;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:draw 4s ease-out infinite}}
@keyframes draw{{0%{{stroke-dashoffset:1;fill-opacity:0}}70%{{stroke-dashoffset:0}}100%{{stroke-dashoffset:0}}}}
</style>
<g id="type">{paths.replace('<path ', '<path pathLength="1" ')}</g>
<text x="200" y="395" text-anchor="middle" font-family="Inter, sans-serif" font-size="34" letter-spacing="8" fill="#666">DAYBOOK</text>
</svg>
"""


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    logo(180, INK, (255, 255, 255), "L").save(ASSETS / "white-logo.jpg", quality=92)
    logo(180, (255, 255, 255), DARK, "RGB").save(ASSETS / "dark-logo.jpg", quality=92)
    painting().save(ASSETS / "report-cover-painting.jpg", quality=88, progressive=True)
    (ASSETS / "daybook-logo-animated.svg").write_text(splash_svg(), encoding="utf-8")
    icon = logo(512, (255, 255, 255), DARK, "RGB")
    icon.save(BUILD / "icon.png")
    icon.save(BUILD / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("wrote", *sorted(p.name for p in [*ASSETS.iterdir(), *BUILD.iterdir()]))


if __name__ == "__main__":
    main()
