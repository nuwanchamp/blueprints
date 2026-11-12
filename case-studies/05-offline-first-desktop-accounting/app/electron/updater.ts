// Updates from GitHub Releases. Anyone can see that a new version exists; only the admin PIN downloads and installs it.
// Nothing installs by itself: closing the app as staff leaves the running version as it is.

import { appendFileSync } from 'node:fs'
import { app } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from '../src/native'
import type { AdminPin } from './adminPin'

const FIRST_CHECK_MS = 30 * 1000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/** Release notes come as HTML (or a list of them); the page shows plain text. */
function notesText(info: UpdateInfo): string | undefined {
  const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note ?? '').join('\n\n') : info.releaseNotes
  if (!raw) return undefined
  return raw
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class Updater {
  private status: UpdateStatus
  /** Updates work in the installed Windows app and the Linux AppImage; tests and development builds never go online. */
  private readonly on: boolean

  constructor(
    private readonly pin: AdminPin,
    private readonly logFile: string,
    private readonly send: (s: UpdateStatus) => void,
    /** Runs before the installer takes over: the same backup the app makes when it closes. */
    private readonly beforeInstall: () => void,
  ) {
    this.on = app.isPackaged && (process.platform === 'win32' || Boolean(process.env.APPIMAGE)) && !process.env.DAYBOOK_NO_UPDATE
    this.status = { state: this.on ? 'idle' : 'off', current: app.getVersion(), canInstall: pin.enabled }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = { info: (m) => this.log('info', m), warn: (m) => this.log('warn', m), error: (m) => this.log('error', m), debug: () => undefined }
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', () => this.set({ state: 'ready', percent: 100 }))
  }

  private log(level: string, message: unknown) {
    try {
      appendFileSync(this.logFile, `${new Date().toISOString()} ${level} ${String(message)}\n`)
    } catch {
      // the log is a help, never a reason to fail
    }
  }

  private set(patch: Partial<UpdateStatus>) {
    this.status = { ...this.status, ...patch }
    this.send(this.status)
  }

  getStatus() {
    return this.status
  }

  start() {
    if (!this.on) return
    setTimeout(() => void this.check(), FIRST_CHECK_MS)
    setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  /** Looks for a newer release. Never downloads; an update already on its way or ready is left alone. */
  async check(): Promise<UpdateStatus> {
    if (!this.on || ['checking', 'downloading', 'ready'].includes(this.status.state)) return this.status
    this.set({ state: 'checking', error: undefined })
    try {
      const result = await autoUpdater.checkForUpdates()
      const checkedAt = new Date().toISOString()
      if (result?.isUpdateAvailable) this.set({ state: 'available', version: result.updateInfo.version, notes: notesText(result.updateInfo), checkedAt })
      else this.set({ state: 'none', version: undefined, notes: undefined, checkedAt })
    } catch (e) {
      this.log('error', e)
      this.set({ state: 'error', error: e instanceof Error ? e.message : String(e), checkedAt: new Date().toISOString() })
    }
    return this.status
  }

  async download(token: unknown) {
    this.pin.check(token)
    if (this.status.state !== 'available') throw new Error('No update to download')
    this.set({ state: 'downloading', percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      this.log('error', e)
      this.set({ state: 'available', error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }

  install(token: unknown) {
    this.pin.check(token)
    if (this.status.state !== 'ready') throw new Error('The update is not downloaded yet')
    this.log('info', `installing ${this.status.version}`)
    this.beforeInstall()
    // Silent install (Windows) or the AppImage swapped in place (Linux), then Daybook opens again on the new version
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }
}
