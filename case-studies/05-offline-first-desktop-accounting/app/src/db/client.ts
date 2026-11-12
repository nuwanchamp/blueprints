import type { BackupInfo, Bind, Request, Response, Statement, StorageMode } from './protocol'

export class DbLockedError extends Error {}

/** A backup file was refused or could not be checked; `code` is a key under backup.errors. */
export class BackupFileError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

type Pending = { resolve: (r: Extract<Response, { ok: true }>) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Response>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg)
    else p.reject(toError(msg))
  }
  return worker
}

function toError(msg: Extract<Response, { ok: false }>): Error {
  return msg.locked ? new DbLockedError(msg.error) : msg.code ? new BackupFileError(msg.code) : new Error(msg.error)
}

function send(req: Distribute<Request>, transfer: Transferable[] = []): Promise<Extract<Response, { ok: true }>> {
  // In the desktop app the database is a file the main process owns; the page only sends it requests
  const native = typeof window !== 'undefined' ? window.daybookNative : undefined
  if (native) {
    return native.db({ ...req, id: nextId++ } as Request).then((msg) => (msg.ok ? msg : Promise.reject(toError(msg))))
  }
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...req, id }, transfer)
  })
}

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never

/** Opens the database (runs migrations on first use) and reports where it is stored. */
export async function openDb(): Promise<StorageMode> {
  const r = await send({ op: 'init' })
  return r.storage ?? 'memory'
}

export async function query<T = Record<string, unknown>>(sql: string, bind?: Bind): Promise<T[]> {
  const r = await send({ op: 'query', sql, bind })
  return (r.rows ?? []) as T[]
}

/** Runs one write and returns the new row id (when it was an INSERT). */
export async function run(sql: string, bind?: Bind): Promise<number> {
  const r = await send({ op: 'query', sql, bind })
  return r.lastId ?? 0
}

/** Runs several statements atomically. */
export async function transaction(stmts: Statement[]): Promise<void> {
  await send({ op: 'tx', stmts })
}

/** A full copy of the live database, already checked by opening it again. */
export async function exportDb(): Promise<{ bytes: Uint8Array; info: BackupInfo }> {
  const r = await send({ op: 'export' })
  return { bytes: r.bytes!, info: r.info! }
}

/** Checks a backup file and says what it holds, without changing anything. */
export async function inspectBackup(bytes: Uint8Array): Promise<BackupInfo> {
  const r = await send({ op: 'inspect', bytes: bytes.slice() })
  return r.info!
}

/** Replaces all data on this device with the backup. */
export async function restoreDb(bytes: Uint8Array): Promise<BackupInfo> {
  const copy = bytes.slice()
  const r = await send({ op: 'restore', bytes: copy }, [copy.buffer])
  return r.info!
}
