// Messages between the UI thread and the SQLite worker.

export type Bind = (string | number | null)[]
export type Statement = { sql: string; bind?: Bind }

/** opfs: browser storage; file: the desktop app's SQLite file; memory: nothing is kept */
export type StorageMode = 'opfs' | 'file' | 'memory'

/** What a database file holds, read from a backup or the live data. */
export interface BackupInfo {
  schemaVersion: number
  sizeBytes: number
  days: number
  closedDays: number
  firstDay: string | null
  lastClosedDay: string | null
  sales: number
  expenses: number
  cashMovements: number
}

export type Request =
  | { id: number; op: 'init' }
  | { id: number; op: 'query'; sql: string; bind?: Bind }
  | { id: number; op: 'tx'; stmts: Statement[] }
  | { id: number; op: 'export' }
  | { id: number; op: 'inspect'; bytes: Uint8Array }
  | { id: number; op: 'restore'; bytes: Uint8Array }

export type Response =
  | { id: number; ok: true; rows?: Record<string, unknown>[]; storage?: StorageMode; lastId?: number; bytes?: Uint8Array; info?: BackupInfo }
  | { id: number; ok: false; error: string; locked?: boolean; code?: string }
