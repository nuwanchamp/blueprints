# Daybook desktop app (Electron)

The desktop app is the same React app in its own window. The difference is where the data lives:

| | Browser version | Desktop app |
|---|---|---|
| Database | Inside the browser's private storage (OPFS) | A normal file: `%APPDATA%\Daybook\daybook.sqlite3` on Windows, `~/.config/Daybook/daybook.sqlite3` on Linux |
| Lost if browser data is cleared | Yes | No |
| Backup folder | Chrome folder permission, asked again after each restart | Any folder, no prompts. Starts as `Documents\Daybook Backups` |
| Backups made | Backup now, day close | Backup now, day close, **and every time the app is closed** |

The page code is shared. `src/db/client.ts` sends each database request either to the browser worker or, inside the app, to the main process (`electron/db.ts`, using Node's built-in `node:sqlite`). Both sides check backups with the same rules (`src/db/describe.ts`).

## Commands

| Command | What it does |
|---|---|
| `npm run electron:build` | Builds the page (`dist/`) and the main process (`dist-electron/`) |
| `npm run electron:start` | Runs the built app |
| `npm run electron:dev` | Runs the app against the Vite dev server (start `npm run dev` first) |
| `npm run e2e:electron` | Desktop tests: data survives a restart, backups, restore (needs `electron:build` first) |
| `npm run dist:win` | Windows installer → `release/Daybook Setup <version>.exe` (**run on Windows**) |
| `npm run dist:linux` | Linux AppImage → `release/Daybook-<version>.AppImage` |

`Daybook.exe` gets the Daybook icon and version details on any system. The **installer** (NSIS) also needs Wine when it's built on Linux (`sudo apt install wine64`). Without Wine, `npx electron-builder --win zip` makes a portable zip (`release/Daybook-<version>-win.zip`; unzip and run `Daybook.exe`).

## Installing on the counter PC (Windows)

1. On a Windows machine with Node 20+: `npm ci`, then `npm run dist:win`.
2. Run `release\Daybook Setup <version>.exe` on the counter PC. It installs for the current user and adds desktop and Start menu shortcuts.
3. Open Daybook. Go to **Settings → Backup & restore** and pick a backup folder on a USB drive or second disk instead of the default one in Documents.

Uninstalling leaves the data and the backups in place.

## Updates

New versions come as GitHub releases. Anyone can **check** for an update, but only the manager can **install** one, using the admin PIN.

- The app checks 30 seconds after it opens, every 4 hours after that, and when someone presses **Settings → Updates → Check for updates**. Finding an update downloads nothing. Every page then shows a short line saying a new version is available.
- **Install update…** asks for the admin PIN. A right PIN downloads the update, then **Back up and restart** makes the close-time backup, installs silently and opens Daybook again. Five wrong tries lock the PIN for 15 minutes, and the lock survives a restart.
- Closing the app never installs anything. The PIN check and the approval it gives (valid for 10 minutes) are in the main process (`electron/adminPin.ts`, `electron/updater.ts`), so the page can't skip them.
- The installed Windows app and the Linux AppImage update. Development builds and tests (`DAYBOOK_NO_UPDATE=1`) show "Updates are switched off". The AppImage is a handy way to try an update without a Windows PC.
- What happens is logged in `%APPDATA%\Daybook\update.log`. Wrong tries and the lock are kept in `update-lock.json` beside it.

### The admin PIN

The PIN is the `DAYBOOK_ADMIN_PIN` secret of the GitHub repo. `scripts/build-electron.mjs` turns it into a salted scrypt hash inside `main.cjs`, and the PIN itself never ships. Staff can't set or change it. To change it, change the secret and release a new version (installing that version still needs the old PIN). Use 6 or more characters, not only digits. A build without the secret (any local build) can't install updates.

### Making a release

1. Raise `version` in `package.json` and commit.
2. `git tag v0.1.5 && git push --follow-tags`. `.github/workflows/release.yml` runs on Windows: typecheck, tests, the PIN hash, then `electron-builder --win nsis --publish always`. It uploads `Daybook Setup <version>.exe`, its `.blockmap` and `latest.yml`. Then a Linux job adds `Daybook-<version>.AppImage` and `latest-linux.yml` to the same release. The tag must match the version.
3. Write what changed in the release text on GitHub. The manager sees it before installing.

Rules:
- Never go back a version. A bad release is fixed by releasing a higher one.
- Database changes only add new steps to `src/db/migrations.ts`. Never edit an existing step.
- If data has to come back, restore the backup that was made just before the install.

### First-time setup

1. Make a **public** GitHub repo for the installers only (for example `daybook-releases`). The code can stay private. Put its owner and name in `electron-builder.yml` → `publish`.
2. In the code repo's settings, add the secrets `GH_TOKEN` (a token that can write releases to the releases repo) and `DAYBOOK_ADMIN_PIN`.
3. On the counter PC, the copy unzipped from `Daybook-<version>-win.zip` can't update itself. Close it (this makes a backup), run `Daybook Setup 0.1.4.exe` from the first release, open Daybook and check the data. Then delete the old unzipped folder and its shortcut. The data in `%APPDATA%\Daybook` is used by both, so nothing has to be moved.

The installer is not code-signed, so Windows SmartScreen warns on the first manual install ("More info → Run anyway"). Updates after that install silently.

## Keeping old backups (retention)

Every backup is a full copy of the database, so without a limit the backup folder grows a little faster each year (about 8–10 GB after two years at three backups a day). After each new backup has been written and read back, the app deletes old backups the rules no longer keep. It works like log retention (`src/features/backup/retention.ts`):

| Age | Kept (defaults) | Lowest allowed |
|---|---|---|
| up to 14 days | every backup | 7 days |
| up to 90 days | the newest of each day | 30 days |
| up to 730 days | the newest of each week | 90 days |
| older | the newest of each month, for ever (0) | 12 months, or 0 = for ever |

- The newest 10 backups are always kept, whatever their dates say (a wrong PC clock can't delete them).
- Backups made before a restore or an update are kept for the whole weekly period.
- Only files named like Daybook backups in `database/` are deleted, each with its `.json` note. Excel day copies and anything else in the folder stay.
- **Settings → Backup & restore → Keeping old backups** shows the rules and how much space the backups take. Changing the rules needs the admin PIN, because keeping fewer deletes old backups straight away. The rules are saved in `settings.json` in the data folder.
- Only the desktop app tidies up. The browser version leaves its folder alone.

## When the data can't be opened

If the database can't be opened at start, the app shows `public/startup-error.html` instead of the normal pages. The data file is left as it was, and the page can still check for and install an update (with the admin PIN), which is usually the fix:

- **Data from a newer Daybook** (its version number is higher than this app knows, for example after an older installer was run): refused, never opened for writing.
- **An upgrade step failed:** each step is rolled back, so the file stays as it was. Before any upgrade step runs, a plain copy of the file is saved in `before-upgrade\` in the data folder (the newest 5 are kept), even when the backup folder is unplugged.
- **The file can't be opened at all:** the same screen, with the error text to pass on.

## Moving data from the browser version

1. In the browser version: **Settings → Backup & restore → Backup now**. This saves a `daybook-….sqlite3` file.
2. In the desktop app: **Settings → Backup & restore → Choose a backup file**, pick that file, check the summary, then **Restore this backup**.

## Notes

- On start, a small loading screen plays the animated logo (`public/splash.html`, using `public/assets/daybook-logo-animated.svg`) once, in about 4 seconds, while the app opens behind it. The app appears as the logo fades out. `DAYBOOK_SPLASH_MS` changes the minimum time (`0` skips the wait).
- Only one Daybook window can run at a time. Starting it again brings the open window forward.
- The window can't open other websites. Links to the web open in the normal browser.
- The page has no access to the computer except a short, fixed list of calls (`electron/preload.ts`). File writes are limited to the `database` and `excel` subfolders of the chosen backup folder.
- The app icon (`build/icon.png`, `build/icon.ico`) is enlarged from the 180 px logo. Replace it with a 512 px or larger version for a sharp icon.
