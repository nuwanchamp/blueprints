import { run, query } from '../client'

/** Where and when the last backup on this device was written. */
export interface LastBackup {
  /** local time, 'YYYY-MM-DD HH:MM' */
  at: string
  where: 'folder' | 'download'
  /** the backup folder's name, when it went to the folder */
  folder?: string
  file: string
  reason: BackupReason
  /** the folder took the file but didn't keep it, so it was downloaded instead */
  folderProblem?: boolean
}

export type BackupReason = 'manual' | 'dayClose' | 'beforeRestore' | 'appClose' | 'beforeUpdate'

export async function getLastBackup(): Promise<LastBackup | null> {
  const [r] = await query<{ value: string }>("SELECT value FROM app_setting WHERE key = 'last_backup'")
  if (!r) return null
  try {
    return JSON.parse(r.value) as LastBackup
  } catch {
    return null
  }
}

export async function setLastBackup(b: LastBackup) {
  await run("INSERT INTO app_setting (key, value) VALUES ('last_backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(b)])
}

/** Whether closing a day also saves that day as an Excel workbook (on unless switched off). */
export async function getDayExcelOn(): Promise<boolean> {
  const [r] = await query<{ value: string }>("SELECT value FROM app_setting WHERE key = 'backup_day_excel'")
  return r ? r.value !== '0' : true
}

export async function setDayExcelOn(on: boolean) {
  await run("INSERT INTO app_setting (key, value) VALUES ('backup_day_excel', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [on ? '1' : '0'])
}

/** Every closed business day, oldest first. */
export async function listClosedDays(): Promise<string[]> {
  const rows = await query<{ d: string }>("SELECT business_date AS d FROM daily_close WHERE status = 'closed' ORDER BY business_date")
  return rows.map((r) => r.d)
}
