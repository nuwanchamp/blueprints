import { addDays, todayISO } from './date'

/** An inclusive range of business days. */
export interface Period {
  from: string
  to: string
}

export type PresetId = 'today' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom'
export const PRESETS: PresetId[] = ['today', 'last30', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'custom']

const pad = (n: number) => String(n).padStart(2, '0')
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number]

export const monthStart = (iso: string) => {
  const [y, m] = parts(iso)
  return `${y}-${pad(m)}-01`
}

export const monthEnd = (iso: string) => {
  const [y, m] = parts(iso)
  return addDays(`${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01`, -1)
}

export const yearStart = (iso: string) => `${parts(iso)[0]}-01-01`
export const yearEnd = (iso: string) => `${parts(iso)[0]}-12-31`

/** The first day of the month before the one containing `iso`. */
export const previousMonthStart = (iso: string) => monthStart(addDays(monthStart(iso), -1))

/** Number of days in the period, counting both ends. */
export function dayCount(p: Period): number {
  const ms = (iso: string) => Date.UTC(...(([y, m, d]) => [y, m - 1, d] as [number, number, number])(parts(iso)))
  return Math.round((ms(p.to) - ms(p.from)) / 86_400_000) + 1
}

export function presetPeriod(id: Exclude<PresetId, 'custom'>, today: string = todayISO()): Period {
  switch (id) {
    case 'today':
      return { from: today, to: today }
    case 'last30':
      return { from: addDays(today, -29), to: today }
    case 'thisMonth':
      return { from: monthStart(today), to: today }
    case 'lastMonth': {
      const start = previousMonthStart(today)
      return { from: start, to: monthEnd(start) }
    }
    case 'thisYear':
      return { from: yearStart(today), to: today }
    case 'lastYear': {
      const prev = addDays(yearStart(today), -1)
      return { from: yearStart(prev), to: yearEnd(prev) }
    }
  }
}

/** The stretch of the same length straight before this one, for "compared with the previous period". */
export function previousPeriod(p: Period): Period {
  const n = dayCount(p)
  return { from: addDays(p.from, -n), to: addDays(p.from, -1) }
}

export type GroupBy = 'day' | 'month' | 'year'

/** A sensible way to group a period: days for a month or less, months for up to about a year, years beyond that. */
export function defaultGroupBy(p: Period): GroupBy {
  const n = dayCount(p)
  return n <= 62 ? 'day' : n <= 800 ? 'month' : 'year'
}

/** The bucket a day belongs to: the day itself, 'YYYY-MM' or 'YYYY'. */
export function bucketKey(date: string, by: GroupBy): string {
  return by === 'day' ? date : by === 'month' ? date.slice(0, 7) : date.slice(0, 4)
}
