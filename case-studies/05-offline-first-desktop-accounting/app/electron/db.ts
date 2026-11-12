// The desktop app's database: one SQLite file on disk, opened by Node's built-in SQLite in the main process.
// It answers the same requests as the browser worker (src/db/worker.ts), so the page code does not change.

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { assertSqliteHeader, BackupError, describe as describeDb, sameContents, type ReadDb } from '../src/db/describe'
import { applyMigrations, MIGRATIONS, type MigrationDb } from '../src/db/migrations'
import type { BackupInfo, Bind, Request, Response } from '../src/db/protocol'

type Row = Record<string, unknown>

/** node:sqlite rows have no prototype; plain objects travel over IPC without surprises. */
const plain = (r: unknown): Row => ({ ...(r as Row) })

const reader = (d: DatabaseSync): ReadDb => ({
  value: (sql) => {
    const r = d.prepare(sql).get() as Row | undefined
    return r ? Object.values(r)[0] : undefined
  },
  values: (sql) => (d.prepare(sql).all() as Row[]).map((r) => Object.values(r)[0]),
})

/** The slice of the database that the shared migrations use (written for sqlite-wasm's API). */
function migrationDb(d: DatabaseSync): MigrationDb {
  return {
    exec: (opts) => {
      if (typeof opts === 'string') return d.exec(opts)
      const { sql, bind } = opts as { sql: string; bind?: Bind }
      return d.prepare(sql).run(...(bind ?? []))
    },
    selectValue: (sql) => reader(d).value(sql),
    selectObjects: (sql, bind) => (d.prepare(sql).all(...((bind ?? []) as Bind)) as Row[]).map(plain),
  }
}

/** Why the database couldn't be opened; the app shows a screen for it instead of the normal pages. */
export class DbStartError extends Error {
  constructor(
    public code: 'newer' | 'upgradeFailed' | 'openFailed',
    public detail: string,
  ) {
    super(`${code}: ${detail}`)
  }
}

/** How many copies from before an upgrade are kept in the data folder */
const KEEP_PRE_UPGRADE = 5

export class Db {
  private db!: DatabaseSync

  constructor(private readonly file: string) {
    this.open()
  }

  private open() {
    try {
      this.db = new DatabaseSync(this.file)
      this.db.exec('PRAGMA foreign_keys = ON')
    } catch (e) {
      throw new DbStartError('openFailed', String(e))
    }
    const version = Number(reader(this.db).value('PRAGMA user_version'))
    // Data from a newer Daybook has tables this version doesn't know; working on it could damage it
    if (version > MIGRATIONS.length) {
      this.db.close()
      throw new DbStartError('newer', `data version ${version}, this app knows up to ${MIGRATIONS.length}`)
    }
    if (version > 0 && version < MIGRATIONS.length) this.copyBeforeUpgrade(version)
    try {
      applyMigrations(migrationDb(this.db), version)
    } catch (e) {
      // Each step is rolled back, so the file is still as it was before this start
      this.db.close()
      throw new DbStartError('upgradeFailed', String(e))
    }
  }

  /** A plain copy of the file before upgrade steps run, in the data folder (the backup folder may be unplugged). */
  private copyBeforeUpgrade(version: number) {
    const dir = join(dirname(this.file), 'before-upgrade')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(this.file, join(dir, `daybook-${stamp}-from-v${version}.sqlite3`))
    const old = readdirSync(dir).filter((n) => n.endsWith('.sqlite3')).sort().reverse().slice(KEEP_PRE_UPGRADE)
    for (const n of old) rmSync(join(dir, n), { force: true })
  }

  close() {
    this.db.close()
  }

  private describe(d: DatabaseSync, size: number) {
    return describeDb(reader(d), size)
  }

  /** Checks a backup's bytes in a separate in-memory copy, never touching the live file. */
  inspect(bytes: Uint8Array): BackupInfo {
    assertSqliteHeader(bytes)
    const copy = new DatabaseSync(':memory:')
    try {
      try {
        copy.deserialize(bytes)
      } catch {
        throw new BackupError('corrupt')
      }
      return this.describe(copy, bytes.byteLength)
    } finally {
      copy.close()
    }
  }

  /** A full copy of the live database, checked by opening it again. */
  export(): { bytes: Uint8Array; info: BackupInfo } {
    const bytes = new Uint8Array(this.db.serialize())
    const info = this.inspect(bytes)
    if (!sameContents(info, this.describe(this.db, bytes.byteLength))) throw new BackupError('verifyFailed')
    return { bytes, info }
  }

  /** Replaces the file with a checked backup (written beside it, then renamed in), and upgrades it if older. */
  restore(bytes: Uint8Array): BackupInfo {
    this.inspect(bytes)
    const tmp = `${this.file}.restoring`
    writeFileSync(tmp, bytes)
    this.db.close()
    for (const extra of ['-journal', '-wal', '-shm']) if (existsSync(this.file + extra)) rmSync(this.file + extra)
    renameSync(tmp, this.file)
    this.open()
    return this.describe(this.db, bytes.byteLength)
  }

  handle(req: Request): Response {
    try {
      if (req.op === 'init') return { id: req.id, ok: true, storage: 'file' }
      if (req.op === 'query') {
        const stmt = this.db.prepare(req.sql)
        if (stmt.columns().length > 0) {
          const rows = (stmt.all(...(req.bind ?? [])) as Row[]).map(plain)
          return { id: req.id, ok: true, rows, lastId: Number(reader(this.db).value('SELECT last_insert_rowid()')) }
        }
        const r = stmt.run(...(req.bind ?? []))
        return { id: req.id, ok: true, rows: [], lastId: Number(r.lastInsertRowid) }
      }
      if (req.op === 'tx') {
        this.db.exec('BEGIN')
        try {
          for (const s of req.stmts) this.db.prepare(s.sql).run(...(s.bind ?? []))
          this.db.exec('COMMIT')
        } catch (err) {
          this.db.exec('ROLLBACK')
          throw err
        }
        return { id: req.id, ok: true, lastId: Number(reader(this.db).value('SELECT last_insert_rowid()')) }
      }
      if (req.op === 'export') return { id: req.id, ok: true, ...this.export() }
      if (req.op === 'inspect') return { id: req.id, ok: true, info: this.inspect(req.bytes) }
      return { id: req.id, ok: true, info: this.restore(req.bytes) }
    } catch (err) {
      return { id: req.id, ok: false, error: String(err), code: err instanceof BackupError ? err.code : undefined }
    }
  }
}
