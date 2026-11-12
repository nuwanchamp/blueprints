// The backup folder the person chose, remembered for this computer, and the only place the page may write files.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { backupsToDelete, clampRetention, DEFAULT_RETENTION, type RetentionPolicy } from '../src/features/backup/retention'

const SUBFOLDERS = new Set(['database', 'excel'])
const SAFE_NAME = /^[\w.-]+$/

export class BackupFolder {
  constructor(private readonly configFile: string) {}

  /** On the first start there is no settings file yet: back up into the given folder until the person picks another. */
  useDefaultOnFirstStart(path: string) {
    if (!existsSync(this.configFile)) this.set(path)
  }

  private settings(): { backupFolder?: string | null; retention?: Partial<RetentionPolicy> } {
    try {
      return JSON.parse(readFileSync(this.configFile, 'utf8'))
    } catch {
      return {}
    }
  }

  private save(patch: Record<string, unknown>) {
    writeFileSync(this.configFile, JSON.stringify({ ...this.settings(), ...patch }, null, 2))
  }

  get(): { name: string; path: string } | null {
    const { backupFolder } = this.settings()
    return backupFolder ? { name: basename(backupFolder) || backupFolder, path: backupFolder } : null
  }

  set(path: string | null) {
    this.save({ backupFolder: path })
  }

  /** How long old backups are kept on this computer (never below the minimum). */
  retention(): RetentionPolicy {
    return clampRetention(this.settings().retention ?? DEFAULT_RETENTION)
  }

  setRetention(p: Partial<RetentionPolicy>): RetentionPolicy {
    const policy = clampRetention(p)
    this.save({ retention: policy })
    return policy
  }

  /**
   * Deletes the old database backups the retention rules no longer keep, each with its .json note. Only runs after
   * a new backup was written and read back, and only touches files named like Daybook backups.
   */
  prune(now = new Date()): string[] {
    const names = this.list('database')
    const gone = backupsToDelete(names, this.retention(), now)
    for (const name of gone) {
      rmSync(this.target('database', name), { force: true })
      const note = name.replace(/\.sqlite3$/, '.json')
      if (names.includes(note)) rmSync(this.target('database', note), { force: true })
    }
    return gone
  }

  /** How many database backups the folder holds and their size, for the Backup page. */
  usage(): { count: number; bytes: number } {
    if (!this.get()) return { count: 0, bytes: 0 }
    let count = 0
    let bytes = 0
    for (const name of this.list('database')) {
      if (name.endsWith('.sqlite3')) count++
      bytes += statSync(this.target('database', name)).size
    }
    return { count, bytes }
  }

  /** Resolves database/<name> or excel/<name> under the folder; anything else (.., slashes, other folders) is refused. */
  private target(sub: string, name?: string): string {
    const folder = this.get()
    if (!folder) throw new Error('No backup folder chosen')
    if (!SUBFOLDERS.has(sub)) throw new Error(`Not a backup subfolder: ${sub}`)
    if (name !== undefined && (!SAFE_NAME.test(name) || name.startsWith('.'))) throw new Error(`Not a backup file name: ${name}`)
    return name === undefined ? join(folder.path, sub) : join(folder.path, sub, name)
  }

  /** Writes the whole file beside its final name, then renames it in, so a half-written backup never has the real name. */
  write(sub: string, name: string, bytes: Uint8Array) {
    const dir = this.target(sub)
    mkdirSync(dir, { recursive: true })
    const file = this.target(sub, name)
    writeFileSync(`${file}.part`, bytes)
    renameSync(`${file}.part`, file)
  }

  read(sub: string, name: string): Uint8Array {
    return new Uint8Array(readFileSync(this.target(sub, name)))
  }

  list(sub: string): string[] {
    const dir = this.target(sub)
    return existsSync(dir) ? readdirSync(dir).filter((n) => SAFE_NAME.test(n) && !n.endsWith('.part')) : []
  }
}
