/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { assertSqliteHeader, BackupError, describe as describeDb, sameContents, type ReadDb } from './describe'
import { applyMigrations, type MigrationDb } from './migrations'
import type { BackupInfo, Request, Response, StorageMode } from './protocol'

const DB_NAME = '/daybook.sqlite3'

let sqlite3: Sqlite3Static
let pool: SAHPoolUtil | null = null
let db: Database
let storage: StorageMode = 'memory'

const asMigrationDb = (d: Database) => d as unknown as MigrationDb

function openMain() {
  db = pool ? new pool.OpfsSAHPoolDb(DB_NAME) : new sqlite3.oo1.DB(':memory:', 'ct')
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(asMigrationDb(db), Number(db.selectValue('PRAGMA user_version')))
}

const ready = (async () => {
  sqlite3 = await sqlite3InitModule()
  try {
    // One OPFS file per device. The pool allows a single open connection, so a second tab fails here.
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'daybook-pool', directory: '/daybook', clearOnInit: false })
    storage = 'opfs'
  } catch (e) {
    if (/lock|access handle|NoModificationAllowed|InvalidStateError/i.test(String(e))) {
      throw Object.assign(new Error(String(e)), { locked: true })
    }
    // No OPFS in this browser: keep working, but nothing is saved
    pool = null
    storage = 'memory'
  }
  openMain()
})()

/** Opens a copy of a database file in memory, without touching the live data. */
function openBytes(bytes: Uint8Array): Database {
  assertSqliteHeader(bytes)
  const copy = new sqlite3.oo1.DB(':memory:', 'ct')
  const p = sqlite3.wasm.allocFromTypedArray(bytes)
  const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
  const rc = sqlite3.capi.sqlite3_deserialize(copy.pointer!, 'main', p, bytes.byteLength, bytes.byteLength, flags)
  if (rc !== 0) {
    copy.close()
    throw new BackupError('corrupt')
  }
  return copy
}

/** The live or copied database, seen through the two reads the shared checks need. */
const reader = (d: Database): ReadDb => ({ value: (sql) => d.selectValue(sql), values: (sql) => d.selectValues(sql) })

const describe = (d: Database, sizeBytes: number) => describeDb(reader(d), sizeBytes)

/** Inspects a backup file, then closes the copy. */
function inspect(bytes: Uint8Array): BackupInfo {
  const copy = openBytes(bytes)
  try {
    return describe(copy, bytes.byteLength)
  } finally {
    copy.close()
  }
}

/** A full copy of the live database, checked by opening it again before it is handed over. */
function exportDb(): { bytes: Uint8Array; info: BackupInfo } {
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!)
  const info = inspect(bytes)
  if (!sameContents(info, describe(db, bytes.byteLength))) throw new BackupError('verifyFailed')
  return { bytes, info }
}

/** Replaces the live database with a checked backup, then brings it up to this app's schema. */
async function restoreDb(bytes: Uint8Array): Promise<BackupInfo> {
  inspect(bytes) // refuse before anything is replaced
  db.close()
  if (pool) {
    await pool.importDb(DB_NAME, bytes)
    openMain()
  } else {
    db = openBytes(bytes)
    db.exec('PRAGMA foreign_keys = ON')
    applyMigrations(asMigrationDb(db), Number(db.selectValue('PRAGMA user_version')))
  }
  return describe(db, bytes.byteLength)
}

async function handle(req: Request): Promise<{ reply: Response; transfer?: Transferable[] }> {
  await ready
  if (req.op === 'init') return { reply: { id: req.id, ok: true, storage } }
  if (req.op === 'query') {
    const rows = db.exec({ sql: req.sql, bind: req.bind, rowMode: 'object', returnValue: 'resultRows' }) as Record<string, unknown>[]
    return { reply: { id: req.id, ok: true, rows, lastId: Number(db.selectValue('SELECT last_insert_rowid()')) } }
  }
  if (req.op === 'export') {
    const { bytes, info } = exportDb()
    return { reply: { id: req.id, ok: true, bytes, info }, transfer: [bytes.buffer] }
  }
  if (req.op === 'inspect') return { reply: { id: req.id, ok: true, info: inspect(req.bytes) } }
  if (req.op === 'restore') return { reply: { id: req.id, ok: true, info: await restoreDb(req.bytes) } }
  db.exec('BEGIN')
  try {
    for (const s of req.stmts) db.exec({ sql: s.sql, bind: s.bind })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { reply: { id: req.id, ok: true, lastId: Number(db.selectValue('SELECT last_insert_rowid()')) } }
}

// One request at a time: a restore swaps the database, so nothing may run against it halfway through
let queue: Promise<unknown> = Promise.resolve()

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data
  queue = queue.then(async () => {
    try {
      const { reply, transfer } = await handle(req)
      self.postMessage(reply, { transfer: transfer ?? [] })
    } catch (err) {
      self.postMessage({
        id: req.id,
        ok: false,
        error: String(err),
        locked: Boolean((err as { locked?: boolean }).locked),
        code: err instanceof BackupError ? err.code : undefined,
      } satisfies Response)
    }
  })
}
