import { describe, expect, it } from 'vitest'
import { backupsToDelete, clampRetention, DEFAULT_RETENTION, KEEP_NEWEST, MIN_RETENTION, parseBackupName } from './retention'

const pad = (n: number) => String(n).padStart(2, '0')
const name = (d: Date, suffix = '-on-close') =>
  `daybook-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${suffix}.sqlite3`
const NOW = new Date(2028, 10, 2, 18, 0, 0)
const daysAgo = (days: number, hour = 12) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, hour, 0, 0)

/** Three backups a day (morning close, day close, evening close) for `days` days back. */
const history = (days: number) => Array.from({ length: days }, (_, d) => [9, 15, 22].map((h) => name(daysAgo(d + 1, h)))).flat()

describe('backup retention', () => {
  it('reads the time from a backup name and ignores other files', () => {
    expect(parseBackupName('daybook-2026-11-02-164220-on-close.sqlite3')?.at).toEqual(new Date(2026, 10, 2, 16, 42, 20))
    expect(parseBackupName('daybook-2026-11-02-164220-before-update.sqlite3')?.special).toBe(true)
    expect(parseBackupName('daybook-2026-11-02-164220.json')).toBeNull()
    expect(parseBackupName('my-notes.sqlite3')).toBeNull()
  })

  it('keeps everything from the last 14 days, then one a day, then one a week, then one a month', () => {
    const files = history(3 * 365)
    const gone = new Set(backupsToDelete(files, DEFAULT_RETENTION, NOW))
    const kept = files.filter((f) => !gone.has(f))
    const within = (list: string[], lo: number, hi: number) =>
      list.filter((f) => {
        const age = (NOW.getTime() - parseBackupName(f)!.at.getTime()) / 864e5
        return age > lo && age <= hi
      }).length
    const keptAgo = (lo: number, hi: number) => within(kept, lo, hi)
    expect(keptAgo(0, 14)).toBe(within(files, 0, 14))
    expect(keptAgo(15, 90)).toBeGreaterThanOrEqual(74)
    expect(keptAgo(15, 90)).toBeLessThanOrEqual(76)
    expect(keptAgo(91, 730)).toBeGreaterThanOrEqual(90)
    expect(keptAgo(91, 730)).toBeLessThanOrEqual(93)
    expect(keptAgo(731, 3 * 365 + 1)).toBeGreaterThanOrEqual(11)
    expect(keptAgo(731, 3 * 365 + 1)).toBeLessThanOrEqual(13)
    // Three years of three backups a day comes down to about 230 files
    expect(kept.length).toBeLessThan(250)
  })

  it('keeps the newest of each day', () => {
    const files = [9, 15, 22].map((h) => name(daysAgo(30, h)))
    expect(backupsToDelete([...files, ...history(0)], DEFAULT_RETENTION, NOW).length).toBe(0) // fewer than KEEP_NEWEST
    const many = [...files, ...Array.from({ length: KEEP_NEWEST }, (_, i) => name(daysAgo(0, 8 + i)))]
    expect(backupsToDelete(many, DEFAULT_RETENTION, NOW).sort()).toEqual([name(daysAgo(30, 9)), name(daysAgo(30, 15))].sort())
  })

  it('always keeps the newest ten, even when the clock makes them look old', () => {
    const old = Array.from({ length: 12 }, (_, i) => name(daysAgo(2000 + i)))
    const gone = backupsToDelete(old, { ...DEFAULT_RETENTION, monthlyMonths: 12 }, NOW)
    expect(gone.length).toBe(2)
    expect(gone).not.toContain(old[0])
  })

  it('keeps backups made before a restore or an update for the whole weekly period', () => {
    const special = name(daysAgo(200, 10), '-before-update')
    const sameWeek = name(daysAgo(200, 22))
    const recent = Array.from({ length: KEEP_NEWEST }, (_, i) => name(daysAgo(0, 8 + i)))
    const gone = backupsToDelete([special, sameWeek, ...recent], DEFAULT_RETENTION, NOW)
    expect(gone).not.toContain(special)
  })

  it('never goes below the minimum, whatever is asked for', () => {
    expect(clampRetention({ keepAllDays: 0, dailyDays: 1, weeklyDays: 2, monthlyMonths: 1 })).toEqual(MIN_RETENTION)
    expect(clampRetention({ keepAllDays: 60, dailyDays: 30 }).dailyDays).toBe(60)
    expect(clampRetention({ monthlyMonths: 0 }).monthlyMonths).toBe(0)
    expect(clampRetention({ keepAllDays: Number.NaN })).toEqual(DEFAULT_RETENTION)
  })
})
