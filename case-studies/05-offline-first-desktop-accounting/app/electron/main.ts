// Daybook desktop app: one window showing the same React app, with the database as a file this process owns.

import { execFile } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import type { Request } from '../src/db/protocol'
import { AdminPin, BUILT_IN_PIN } from './adminPin'
import type { RetentionPolicy } from '../src/features/backup/retention'
import { BackupFolder } from './backupFolder'
import { Db, DbStartError } from './db'
import { bookmarkPages } from './pdfOutline'
import { Updater } from './updater'

// The data folder is always "Daybook" (Windows: %APPDATA%\Daybook), whatever the project folder is called.
// Tests and a second install can point the app at a folder of their own.
app.setName('Daybook')
app.setPath('userData', process.env.DAYBOOK_USER_DATA ? resolve(process.env.DAYBOOK_USER_DATA) : join(app.getPath('appData'), 'Daybook'))

const DIST = resolve(__dirname, '..', 'dist')
const DEV_URL = process.env.DAYBOOK_DEV_URL // e.g. http://127.0.0.1:5173 while developing
const APP_URL = 'app://daybook/'
// How long the loading screen shows at least: the logo finishes drawing in about this time (public/splash.html)
const SPLASH_MS = Number(process.env.DAYBOOK_SPLASH_MS ?? 4300)

// The built app is served from app://daybook/, a secure origin of its own, so it behaves as it does on localhost
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// Only one Daybook at a time: a second start brings the open window forward instead of opening the file twice
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let win: BrowserWindow | null = null
  let db: Db | undefined
  // Set when the database can't be opened: the window then shows startup-error.html, which can still install an update
  let startError: { code: string; detail: string } | null = null
  let folder: BackupFolder
  // Set once an update has made its backup, so closing for the installer doesn't make a second one
  let backedUpForUpdate = false

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  /** The loading screen: the animated logo in a small frameless window, open while the app starts behind it. */
  const createSplash = () => {
    const splash = new BrowserWindow({
      // a wide, short card in the middle of the screen, like the Photoshop and Office splash screens
      width: 720,
      height: 450,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      center: true,
      show: false,
      title: 'Daybook',
      backgroundColor: '#f7f6f2',
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    })
    splash.once('ready-to-show', () => splash.show())
    splash.webContents.on('will-navigate', (e) => e.preventDefault())
    splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    void splash.loadURL(`${DEV_URL ? `${DEV_URL}/` : APP_URL}splash.html?v=${encodeURIComponent(app.getVersion())}`)
    return splash
  }

  /** Shows the app once it has painted and the logo has had its moment, fading the loading screen out first. */
  const revealAfterSplash = async (main: BrowserWindow, splash: BrowserWindow) => {
    const started = Date.now()
    await new Promise<void>((done) => main.once('ready-to-show', () => done()))
    await new Promise((done) => setTimeout(done, Math.max(0, SPLASH_MS - (Date.now() - started))))
    if (!splash.isDestroyed()) {
      await splash.webContents.executeJavaScript("document.body.classList.add('leaving')").catch(() => undefined)
      await new Promise((done) => setTimeout(done, 280))
    }
    if (!main.isDestroyed()) main.show()
    if (!splash.isDestroyed()) splash.destroy()
  }

  const createWindow = () => {
    win = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 800,
      minHeight: 560,
      title: 'Daybook',
      backgroundColor: '#f4f3f1',
      show: false,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    })
    // The app never opens other sites inside its window; links to the web go to the normal browser
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(APP_URL) && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault()
    })
    win.on('closed', () => (win = null))
    void win.loadURL(startError ? `${DEV_URL ? `${DEV_URL}/` : APP_URL}startup-error.html` : (DEV_URL ?? APP_URL))
  }

  void app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const path = decodeURIComponent(new URL(req.url).pathname)
      let file = resolve(DIST, `.${path}`)
      if (file !== DIST && !file.startsWith(DIST + sep)) return new Response('Not found', { status: 404 })
      // Routes such as /daily are pages of the one-page app
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
      return net.fetch(pathToFileURL(file).toString())
    })

    const data = app.getPath('userData')
    try {
      db = new Db(join(data, 'daybook.sqlite3'))
    } catch (e) {
      startError = e instanceof DbStartError ? { code: e.code, detail: e.detail } : { code: 'openFailed', detail: String(e) }
      console.error('The database could not be opened:', e)
    }
    folder = new BackupFolder(join(data, 'settings.json'))
    // Backups start in Documents\Daybook Backups, so closing a day never asks where to save; Settings can move them
    folder.useDefaultOnFirstStart(process.env.DAYBOOK_DEFAULT_BACKUPS ?? join(app.getPath('documents'), 'Daybook Backups'))

    ipcMain.handle('db', (_e, req: Request) => (db ? db.handle(req) : { id: req.id, ok: false, error: 'The database is not open' }))
    ipcMain.handle('startError', () => startError)
    ipcMain.handle('dataFile', () => join(data, 'daybook.sqlite3'))
    ipcMain.handle('backup:getFolder', () => folder.get())
    ipcMain.handle('backup:forgetFolder', () => folder.set(null))
    ipcMain.handle('backup:chooseFolder', async (_e, title: string) => {
      // Tests can't click a system dialog, so they name the folder up front
      const picked = process.env.DAYBOOK_TEST_PICK_FOLDER
        ? [process.env.DAYBOOK_TEST_PICK_FOLDER]
        : (await dialog.showOpenDialog(win!, { title, properties: ['openDirectory', 'createDirectory'] })).filePaths
      if (!picked?.[0]) return null
      folder.set(picked[0])
      return folder.get()
    })
    ipcMain.handle('backup:write', (_e, sub: string, name: string, bytes: Uint8Array) => folder.write(sub, name, bytes))
    ipcMain.handle('backup:read', (_e, sub: string, name: string) => folder.read(sub, name))
    ipcMain.handle('backup:list', (_e, sub: string) => folder.list(sub))
    // Save as PDF: the page as it prints (its print styles, no background fills, like Print), written where the person
    // chooses. Headings become the PDF's bookmarks.
    // No printer margins: the page's print styles set its own (index.css)
    const toPdf = () => win!.webContents.printToPDF({ pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, generateTaggedPDF: true, generateDocumentOutline: true })
    // Where each of these headings lands, so a contents page can show real page numbers before the real print
    ipcMain.handle('pdf:pages', async (_e, headings: string[]) => {
      if (!win) return {}
      const pages = [...bookmarkPages(await toPdf())]
      // Matched by its start: a bookmark's title can carry more of the heading's surroundings than its own text
      return Object.fromEntries(headings.map((h) => [h, pages.find(([title]) => title === h || title.startsWith(h))?.[1] ?? null]))
    })
    const savedPdfs = new Set<string>()
    ipcMain.handle('pdf:save', async (_e, name: string, title: string) => {
      if (!win) return null
      const file = /^[\w.-]+\.pdf$/.test(name) ? name : 'daybook.pdf'
      // Tests can't click a system dialog, so they name the folder up front
      const path = process.env.DAYBOOK_TEST_SAVE_PDF
        ? join(process.env.DAYBOOK_TEST_SAVE_PDF, file)
        : (await dialog.showSaveDialog(win, { title, defaultPath: join(app.getPath('documents'), file), filters: [{ name: 'PDF', extensions: ['pdf'] }] })).filePath
      if (!path) return null
      writeFileSync(path, await toPdf())
      savedPdfs.add(path)
      return path
    })
    // Opens only a PDF this app has just saved, never any path the page names. Returns '' or what went wrong.
    ipcMain.handle('pdf:open', (_e, path: string) => (savedPdfs.has(path) ? openFile(path) : 'Not a PDF saved here'))
    ipcMain.handle('backup:prune', () => pruneQuietly(folder))
    ipcMain.handle('backup:usage', () => folder.usage())
    ipcMain.handle('backup:getRetention', () => folder.retention())

    const pin = new AdminPin(BUILT_IN_PIN, join(data, 'update-lock.json'))
    // Fewer backups kept means old ones get deleted, so changing it needs the admin PIN like an update does
    ipcMain.handle('backup:setRetention', (_e, token: string, policy: Partial<RetentionPolicy>) => {
      pin.check(token)
      const saved = folder.setRetention(policy)
      pruneQuietly(folder)
      return saved
    })
    const updater = new Updater(
      pin,
      join(data, 'update.log'),
      (s) => win?.webContents.send('update:status', s),
      () => {
        // A failed backup stops the update; the installed version keeps running
        if (db && folder.get()) backupOnClose(db, folder, 'beforeUpdate')
        backedUpForUpdate = true
      },
    )
    ipcMain.handle('update:getStatus', () => updater.getStatus())
    ipcMain.handle('update:check', () => updater.check())
    ipcMain.handle('update:unlock', (_e, value: string) => pin.unlock(value))
    ipcMain.handle('update:download', (_e, token: string) => updater.download(token))
    ipcMain.handle('update:install', (_e, token: string) => updater.install(token))

    // No File / Edit / View bar: the app has its own navigation. Copy and paste still work in fields.
    if (!DEV_URL) Menu.setApplicationMenu(null)
    const splash = createSplash()
    createWindow()
    void revealAfterSplash(win!, splash)
    updater.start()
  })

  app.on('window-all-closed', () => app.quit())

  // Closing the app leaves one more checked backup in the folder, whatever happened during the day
  app.on('will-quit', () => {
    try {
      if (db && folder?.get() && !backedUpForUpdate) backupOnClose(db, folder, 'appClose')
    } catch (e) {
      console.error('Backup on close failed:', e)
    }
    db?.close()
  })
}

/**
 * Opens a file in the computer's own app for it. On Linux, shell.openPath can wait for ever without opening
 * anything, so it goes through xdg-open, as double-clicking it in the file manager would.
 */
function openFile(path: string): Promise<string> {
  if (process.platform !== 'linux') return shell.openPath(path)
  return new Promise((done) => execFile('xdg-open', [path], { timeout: 15_000 }, (err) => done(err ? err.message : '')))
}

/** Old backups are tidied after each new one; a problem tidying never spoils the backup itself. */
function pruneQuietly(folder: BackupFolder): string[] {
  try {
    return folder.get() ? folder.prune() : []
  } catch (e) {
    console.error('Removing old backups failed:', e)
    return []
  }
}

function backupOnClose(db: Db, folder: BackupFolder, reason: 'appClose' | 'beforeUpdate') {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const file = `daybook-${day}-${time}-${reason === 'beforeUpdate' ? 'before-update' : 'on-close'}.sqlite3`
  const { bytes, info } = db.export()
  folder.write('database', file, bytes)
  folder.write('database', file.replace(/\.sqlite3$/, '.json'), new TextEncoder().encode(JSON.stringify({ app: 'Daybook', reason, createdAt: now.toISOString(), ...info }, null, 2)))
  if (folder.read('database', file).byteLength !== bytes.byteLength) throw new Error('backup file did not match')
  const record = { at: `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}`, where: 'folder', folder: folder.get()?.name, file, reason }
  db.handle({ id: 0, op: 'query', sql: "INSERT INTO app_setting (key, value) VALUES ('last_backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", bind: [JSON.stringify(record)] })
  pruneQuietly(folder)
}
