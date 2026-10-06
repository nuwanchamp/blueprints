#!/usr/bin/env python3
"""Generate stand-in media so the project runs without the original art, voice and video.

The original assets are not published. This reads tools/asset-manifest.json (path, size,
duration) and creates a placeholder at every path that doesn't already exist, so any file you
drop into Assets/ yourself is left alone.

  PNG / JPEG : flat coloured rectangle of the original size (stdlib; JPEG needs ffmpeg)
  MP3        : silence of the original length   (needs ffmpeg)
  OGV        : plain colour video, silent audio (needs ffmpeg with libtheora + libvorbis)

Usage (from the game/ folder):  python3 tools/make_placeholders.py
"""
import json
import shutil
import struct
import subprocess
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PALETTE = [(255, 143, 171), (107, 127, 215), (6, 214, 160), (244, 162, 89), (255, 209, 102)]


def write_png(path, w, h, rgba):
    row = b"\x00" + bytes(rgba) * w
    raw = zlib.compress(row * h, 9)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def main():
    manifest = json.loads((ROOT / "tools" / "asset-manifest.json").read_text())
    need_ffmpeg = any(not (ROOT / p).exists() and not p.endswith(".png") for p in manifest)
    if need_ffmpeg and not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is required for audio/video placeholders: install it and re-run.")
    made = 0
    for i, (rel, info) in enumerate(manifest.items()):
        path = ROOT / rel
        if path.exists():
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        r, g, b = PALETTE[i % len(PALETTE)]
        ext = path.suffix.lower()
        if ext == ".png":
            write_png(path, info["w"], info["h"], (r, g, b, 140))
        elif ext in (".jpg", ".jpeg"):
            ffmpeg("-f", "lavfi", "-i", f"color=c=0x{r:02x}{g:02x}{b:02x}:s={info['w']}x{info['h']}",
                   "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", str(path))
        elif ext == ".mp3":
            ffmpeg("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(info["seconds"]),
                   "-c:a", "libmp3lame", "-b:a", "32k", str(path))
        elif ext == ".ogv":
            w, h = info["w"] // 4 * 2, info["h"] // 4 * 2   # small, even dimensions
            ffmpeg("-f", "lavfi", "-i", f"color=c=0x{r:02x}{g:02x}{b:02x}:s={w}x{h}:r=15",
                   "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(info["seconds"]),
                   "-c:v", "libtheora", "-q:v", "3", "-c:a", "libvorbis", "-q:a", "0", str(path))
        made += 1
    print(f"created {made} placeholder files ({len(manifest) - made} already present)")


if __name__ == "__main__":
    main()
