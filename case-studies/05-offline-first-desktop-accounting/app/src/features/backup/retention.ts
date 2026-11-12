// Which old database backups to delete, like log retention: recent backups are all kept, older ones are thinned
// to one a day, then one a week, then one a month. Plain code with no file access, so the rules are easy to test.

export interface RetentionPolicy {
  /** Every backup from these last days is kept */
  keepAllDays: number
  /** Up to this age, the newest backup of each day */
  dailyDays: number
  /** Up to this age, the newest backup of each week */
  weeklyDays: number
  /** Up to this many months, the newest backup of each month; 0 keeps one a month for ever */
  monthlyMonths: number
}

export const DEFAULT_RETENTION: RetentionPolicy = { keepAllDays: 14, dailyDays: 90, weeklyDays: 730, monthlyMonths: 0 }

/** Nobody can set less than this: a mistaken setting must not wipe the history. */
export const MIN_RETENTION: RetentionPolicy = { keepAllDays: 7, dailyDays: 30, weeklyDays: 90, monthlyMonths: 12 }

/** The newest backups are kept whatever their dates say (a wrong clock on the PC must not delete them). */
export const KEEP_NEWEST = 10

const DAY = 24 * 60 * 60 * 1000

/** Puts a policy in order: whole numbers, each tier at least the minimum and no shorter than the one before. */
export function clampRetention(p: Partial<RetentionPolicy>): RetentionPolicy {
  const n = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback)
  const keepAllDays = Math.max(MIN_RETENTION.keepAllDays, n(p.keepAllDays, DEFAULT_RETENTION.keepAllDays))
  const dailyDays = Math.max(MIN_RETENTION.dailyDays, keepAllDays, n(p.dailyDays, DEFAULT_RETENTION.dailyDays))
  const weeklyDays = Math.max(MIN_RETENTION.weeklyDays, dailyDays, n(p.weeklyDays, DEFAULT_RETENTION.weeklyDays))
  const months = n(p.monthlyMonths, DEFAULT_RETENTION.monthlyMonths)
  const monthlyMonths = months <= 0 ? 0 : Math.max(MIN_RETENTION.monthlyMonths, Math.ceil(weeklyDays / 30), months)
  return { keepAllDays, dailyDays, weeklyDays, monthlyMonths }
}

// daybook-2026-11-02-164220.sqlite3, daybook-2026-11-02-164220-on-close.sqlite3, …-before-restore, …-before-update
const NAME = /^daybook-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(-[a-z-]+)?\.sqlite3$/

export interface BackupFile {
  name: string
  at: Date
  /** Made before a restore or an update: the copies people go back to after a mistake, kept longer */
  special: boolean
}

/** Reads a backup's time from its name; anything that isn't a Daybook backup gives null and is never touched. */
export function parseBackupName(name: string): BackupFile | null {
  const m = NAME.exec(name)
  if (!m) return null
  const at = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  if (Number.isNaN(at.getTime())) return null
  return { name, at, special: m[7] === '-before-restore' || m[7] === '-before-update' }
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** The Monday that starts the backup's week */
const weekKey = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)))
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

/** The .sqlite3 backups to delete from `names` (other files are ignored), keeping the newest of each day/week/month. */
export function backupsToDelete(names: string[], policy: RetentionPolicy, now: Date): string[] {
  const p = clampRetention(policy)
  const files = names
    .map(parseBackupName)
    .filter((f): f is BackupFile => f !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
  const taken = new Set<string>()
  const remove: string[] = []
  files.forEach((f, i) => {
    const age = (now.getTime() - f.at.getTime()) / DAY
    let bucket: string | null
    if (i < KEEP_NEWEST || age <= p.keepAllDays || (f.special && age <= p.weeklyDays)) bucket = null
    else if (age <= p.dailyDays) bucket = `d${dayKey(f.at)}`
    else if (age <= p.weeklyDays) bucket = `w${weekKey(f.at)}`
    else if (p.monthlyMonths === 0 || age <= p.monthlyMonths * 30.44) bucket = `m${monthKey(f.at)}`
    else return void remove.push(f.name)
    // Newest first, so the first backup seen in a day, week or month is the one that stays
    if (bucket === null) return
    if (taken.has(bucket)) remove.push(f.name)
    else taken.add(bucket)
  })
  return remove
}
