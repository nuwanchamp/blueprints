// Checks a database copy (a backup, or the live data) and says what it holds. Shared by the browser worker
// (sqlite-wasm) and the desktop app (node:sqlite), so both accept and refuse exactly the same files.

import { MIGRATIONS } from './migrations'
import type { BackupInfo } from './protocol'

/** A backup problem the UI explains in words; `code` is a key under backup.errors. */
export class BackupError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

/** The two reads `describe` needs, whichever SQLite build is underneath. */
export interface ReadDb {
  value: (sql: string) => unknown
  values: (sql: string) => unknown[]
}

const HEADER = 'SQLite format 3\0'

/** Refuses anything that is not an SQLite file before it is opened at all. */
export function assertSqliteHeader(bytes: Uint8Array) {
  if (bytes.byteLength < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== HEADER) throw new BackupError('notSqlite')
}

const REQUIRED = ['daily_close', 'sale', 'expense', 'cash_movement', 'app_setting', 'expense_category']

/** What a database holds, after checking it is a sound Daybook database this version of the app can open. */
export function describe(d: ReadDb, sizeBytes: number): BackupInfo {
  let integrity: unknown
  try {
    integrity = d.value('PRAGMA integrity_check')
  } catch {
    throw new BackupError('corrupt')
  }
  if (integrity !== 'ok') throw new BackupError('corrupt')
  const tables = new Set(d.values("SELECT name FROM sqlite_master WHERE type = 'table'") as string[])
  if (!REQUIRED.every((t) => tables.has(t))) throw new BackupError('notDaybook')
  const schemaVersion = Number(d.value('PRAGMA user_version'))
  if (schemaVersion > MIGRATIONS.length) throw new BackupError('newer')
  const count = (sql: string) => Number(d.value(sql) ?? 0)
  return {
    schemaVersion,
    sizeBytes,
    days: count('SELECT COUNT(*) FROM daily_close'),
    closedDays: count("SELECT COUNT(*) FROM daily_close WHERE status = 'closed'"),
    firstDay: (d.value('SELECT MIN(business_date) FROM daily_close') as string | null | undefined) ?? null,
    lastClosedDay: (d.value("SELECT MAX(business_date) FROM daily_close WHERE status = 'closed'") as string | null | undefined) ?? null,
    sales: count('SELECT COUNT(*) FROM sale'),
    expenses: count('SELECT COUNT(*) FROM expense'),
    cashMovements: count('SELECT COUNT(*) FROM cash_movement'),
  }
}

/** True when two descriptions hold the same data (used to check a fresh backup against the live database). */
export const sameContents = (a: BackupInfo, b: BackupInfo) =>
  a.schemaVersion === b.schemaVersion && a.days === b.days && a.closedDays === b.closedDays && a.sales === b.sales && a.expenses === b.expenses && a.cashMovements === b.cashMovements
