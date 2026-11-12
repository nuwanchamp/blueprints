import { exportDb } from '@/db/client'
import { setLastBackup, type BackupReason, type LastBackup } from '@/db/repo/backup'
import type { BackupInfo } from '@/db/protocol'
import { downloadBlob } from '@/lib/xlsx'
import { nativeFolderHandle } from './nativeFolder'

// ---- the chosen backup folder ----
// A folder handle cannot go into SQLite, so this device keeps it in IndexedDB. Losing it only means choosing the folder again.

type Permission = 'granted' | 'denied' | 'prompt'
interface FolderHandle extends FileSystemDirectoryHandle {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<Permission>
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<Permission>
}
type PickerWindow = Window & { showDirectoryPicker?: (o: { id?: string; mode?: 'readwrite' }) => Promise<FolderHandle> }

/** Chrome and Edge can save into a folder; other browsers fall back to downloads. */
export const canUseFolder = () => Boolean(window.daybookNative) || typeof (window as PickerWindow).showDirectoryPicker === 'function'

const IDB = 'daybook-device'
const STORE = 'handles'
const KEY = 'backupFolder'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    d.close()
  }
}

export async function getFolder(): Promise<FolderHandle | null> {
  const native = window.daybookNative
  if (native) {
    const f = await native.backup.getFolder()
    return f ? (nativeFolderHandle(native, f) as FolderHandle) : null
  }
  try {
    return ((await idbDo('readonly', (s) => s.get(KEY))) as FolderHandle | undefined) ?? null
  } catch {
    return null
  }
}

/** Asks the person to pick a folder. Returns null when they cancel. */
export async function chooseFolder(): Promise<FolderHandle | null> {
  const native = window.daybookNative
  if (native) {
    const f = await native.backup.chooseFolder('Choose backup folder / 选择备份文件夹')
    return f ? (nativeFolderHandle(native, f) as FolderHandle) : null
  }
  const pick = (window as PickerWindow).showDirectoryPicker
  if (!pick) return null
  let h: FolderHandle
  try {
    h = await pick({ id: 'daybook-backups', mode: 'readwrite' })
  } catch {
    return null // cancelled
  }
  await idbDo('readwrite', (s) => s.put(h, KEY))
  return h
}

export async function forgetFolder() {
  if (window.daybookNative) return window.daybookNative.backup.forgetFolder()
  try {
    await idbDo('readwrite', (s) => s.delete(KEY))
  } catch {
    // nothing stored
  }
}

/** Whether the app may write into the folder now; `ask` shows the browser's permission prompt (needs a click). */
export async function folderPermission(h: FolderHandle, ask: boolean): Promise<Permission> {
  try {
    let p: Permission = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
    if (p !== 'granted' && ask && h.requestPermission) p = await h.requestPermission({ mode: 'readwrite' })
    return p
  } catch {
    return 'prompt' // asking needs a recent click
  }
}

// ---- making a backup ----

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const localTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

/** The folder accepted the file but did not keep it as written (seen with Google Drive mounted in the Files app). */
export class FolderWriteError extends Error {}

async function sameBytes(a: Blob, b: Blob) {
  if (a.size !== b.size) return false
  const [x, y] = await Promise.all([a.slice(0, 64).arrayBuffer(), b.slice(0, 64).arrayBuffer()])
  return new Uint8Array(x).every((v, i) => v === new Uint8Array(y)[i])
}

/** Writes a file, then reads it back: a backup only counts once the folder really holds it. */
async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob) {
  const f = await dir.getFileHandle(name, { create: true })
  const w = await f.createWritable()
  await w.write(data)
  await w.close()
  const back = await (await dir.getFileHandle(name)).getFile()
  if (!(await sameBytes(back, data))) throw new FolderWriteError(name)
}

export const BACKUP_EVENT = 'daybook:backup'

/**
 * Copies the whole database, checked, into the backup folder (database/ plus a small .json note), or downloads it
 * when there is no folder or no permission. Records where it went, so the app can show the last backup.
 */
export async function makeBackup(reason: BackupReason, opts: { ask: boolean }): Promise<LastBackup & { info: BackupInfo }> {
  const { bytes, info } = await exportDb()
  const now = new Date()
  const file = `daybook-${stamp(now)}${reason === 'beforeRestore' ? '-before-restore' : ''}.sqlite3`
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' })
  const note = new Blob([JSON.stringify({ app: 'Daybook', reason, createdAt: now.toISOString(), ...info }, null, 2)], { type: 'application/json' })

  let record: LastBackup | null = null
  let folderProblem = false
  const folder = await getFolder()
  if (folder && (await folderPermission(folder, opts.ask)) === 'granted') {
    try {
      const dir = await folder.getDirectoryHandle('database', { create: true })
      await writeFile(dir, file, blob)
      await writeFile(dir, file.replace(/\.sqlite3$/, '.json'), note)
      record = { at: localTime(now), where: 'folder', folder: folder.name, file, reason }
      // The new backup is written and read back, so old ones the retention rules don't keep can go
      await window.daybookNative?.backup.prune().catch(() => undefined)
    } catch (e) {
      // folder gone (drive unplugged), or it doesn't keep what is written: fall back to a download
      record = null
      folderProblem = e instanceof FolderWriteError
    }
  }
  if (!record) {
    downloadBlob(file, blob)
    record = { at: localTime(now), where: 'download', file, reason, ...(folderProblem ? { folderProblem } : {}) }
  }
  await setLastBackup(record)
  window.dispatchEvent(new Event(BACKUP_EVENT))
  return { ...record, info }
}

/**
 * Saves one day's workbook into the folder's excel/ subfolder (replacing that day's earlier copy), or downloads it.
 * The database backup is the one that restores; this copy is for people to open in Excel.
 */
export async function saveDayExcel(date: string, blob: Blob, opts: { ask: boolean }): Promise<{ file: string; where: 'folder' | 'download'; folder?: string }> {
  const file = `daybook-${date}.xlsx`
  const folder = await getFolder()
  if (folder && (await folderPermission(folder, opts.ask)) === 'granted') {
    try {
      await writeFile(await folder.getDirectoryHandle('excel', { create: true }), file, blob)
      return { file, where: 'folder', folder: folder.name }
    } catch {
      // folder gone: download instead
    }
  }
  downloadBlob(file, blob)
  return { file, where: 'download' }
}

/**
 * Adds an Excel copy for every closed day that has none in the folder yet, so days closed earlier (or while the
 * folder was unplugged) catch up. Only writes into a folder that is already allowed; never downloads a pile of files.
 * Returns how many were added.
 */
export async function fillMissingDayExcel(closedDays: string[], build: (date: string) => Promise<Blob>): Promise<number> {
  const folder = await getFolder()
  if (!folder || (await folderPermission(folder, false)) !== 'granted') return 0
  try {
    const dir = await folder.getDirectoryHandle('excel', { create: true })
    const have = new Set<string>()
    for await (const entry of (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) have.add(entry.name)
    let added = 0
    for (const date of closedDays) {
      const file = `daybook-${date}.xlsx`
      if (have.has(file)) continue
      await writeFile(dir, file, await build(date))
      added++
    }
    return added
  } catch {
    return 0
  }
}

/** The backups already in the folder, newest first (only when the folder may be read without asking). */
export async function listFolderBackups(h: FolderHandle): Promise<{ name: string; file: () => Promise<File> }[]> {
  if ((await folderPermission(h, false)) !== 'granted') return []
  try {
    const dir = await h.getDirectoryHandle('database')
    const out: { name: string; file: () => Promise<File> }[] = []
    for await (const entry of (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.sqlite3')) out.push({ name: entry.name, file: () => (entry as FileSystemFileHandle).getFile() })
    }
    return out.sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

/** Days since the last backup, by calendar date (0 = today). */
export function backupAgeDays(b: LastBackup, today = new Date()): number {
  const then = new Date(`${b.at.slice(0, 10)}T00:00:00`)
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((now.getTime() - then.getTime()) / 86400000)
}
