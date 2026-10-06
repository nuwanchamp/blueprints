# Fun Labs: the game

A Godot 4 project: Unit 1 teaches the mouse (10 levels), Unit 2 teaches the keyboard (10 levels
plus Speed Round and Word Train practice modes). See the
[case study](../README.md) for why it is built the way it is.

The original art, narration and videos are not published, so a fresh checkout has none of them.
Step 3 below generates stand-ins, and the game is fully playable with them (silent, flat-colour
sprites). Verified on Godot 4.7 stable (Linux): all 50 scenes load without errors.

## Requirements

| Tool | Version | Why |
|---|---|---|
| [Godot](https://godotengine.org/download) | **4.7** (standard build, not .NET) | Runs and edits the project |
| Python | 3.8+ | Runs the placeholder generator |
| ffmpeg | any recent, with libtheora, libvorbis, libmp3lame | Makes placeholder audio and video |

Install ffmpeg: `sudo apt install ffmpeg` (Debian/Ubuntu), `brew install ffmpeg` (macOS),
`winget install ffmpeg` (Windows). A package-manager build normally has all three codecs.

## Setup

1. **Get the code** and enter this folder:
   ```bash
   git clone https://github.com/nuwanchamp/blueprints.git
   cd blueprints/case-studies/03-kids-ict-game-adaptive-pedagogy/game
   ```
2. **Install Godot 4.7** and make sure you can launch it (put it on your PATH as `godot`, or note
   where the executable is).
3. **Generate placeholder media** (about 20 seconds, around 2 MB):
   ```bash
   python3 tools/make_placeholders.py
   ```
   It only creates files that are missing, so your own assets are never overwritten.
4. **Import and run.** Either open it in the editor:
   - launch Godot, click **Import**, choose `project.godot`, then press **F5**; or from a terminal:
   ```bash
   godot --path . --import     # first run only: imports the assets
   godot --path .              # runs the game
   ```
   The first open takes a minute while Godot imports assets.

## Controls and developer shortcuts

The game is played with the mouse (Unit 1) and keyboard (Unit 2). These shortcuts work on any
screen:

| Keys | Action |
|---|---|
| Ctrl+N / Ctrl+P | Next / previous screen (Unit 1 sequence only) |
| Ctrl+R | Restart the current level |
| Ctrl+Shift+R | Restart the whole game and reset all stars |
| Ctrl+M | Jump to the unit menu |

Every level is always open from the level menu, so you can jump straight to the one you want.

## Customising it

- **Words for Word Train:** edit `Data/word_practice_words.tsv` (`WORD<tab>LEVEL`, 1 easy to
  3 tricky). Invalid lines are skipped; an empty file falls back to a built-in list.
- **Round lengths:** edit `Data/practice_settings.cfg` (`words_per_round`, `round_seconds`).
- **Without rebuilding a shipped game:** place a copy of either file next to the exported
  executable. It overrides the bundled one.
- **Your own art and voice:** put files at the paths listed in `tools/asset-manifest.json`
  (for example `Assets/unit2-level3/watch-me-jump.mp3`), then reopen the editor to re-import.
  Existing files are kept when you re-run the placeholder generator.
- **Progress:** stars are saved to Godot's `user://` folder (`star_chart.cfg`); Ctrl+Shift+R resets it.

## Exporting a build

Install the export templates (Editor > Manage Export Templates), then Project > Export > Add a
preset (for example Windows Desktop) and export. No export preset is committed, since paths and
signing are machine-specific. The project uses the GL Compatibility renderer, so it runs on modest
hardware.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Errors like "Failed loading resource: res://Assets/..." | Run `python3 tools/make_placeholders.py`, then reopen the editor |
| `ffmpeg is required...` | Install ffmpeg (see Requirements) and re-run |
| Warning "invalid UID ... using text path instead" | Harmless: the placeholder files have new IDs and Godot falls back to the path |
| Opens with a "project was made for a newer version" prompt | Use Godot 4.7 or later; the project is tagged 4.7 |
| Videos or audio silent | Expected with placeholders; add your own files at the same paths |
| Windows: `python3` not found | Use `py tools/make_placeholders.py` |

## Layout

```
game/
  project.godot        entry: Scenes/init-screen.tscn; autoloads StarChart, GameNav, Confetti
  Scenes/              38 scene files for screens and levels (unit1-*, unit2-*)
  Scripts/             one script per level plus the autoloads (star_chart.gd, game_nav.gd)
  Data/                editable word list and practice settings
  Assets/              Coiny font only; media generated or supplied by you
  tools/               make_placeholders.py and asset-manifest.json
```
