import { describe, expect, it } from 'vitest'
import type { DaySummary } from '@/db/repo/reports'
import { downloadCsv, plainAmount, toCsv } from './csv'
import { addDays } from './date'
import { bucketKey, dayCount, defaultGroupBy, monthEnd, monthStart, presetPeriod, previousPeriod } from './period'
import { niceTicks } from '@/features/reports/format'
import { bucketize, cashVariance, expectedCash, flattenRolled, pctChange, rollUp, sharePct, totalsOf } from './reportMath'

const day = (date: string, o: Partial<DaySummary> = {}): DaySummary => ({
  date,
  status: 'closed',
  openingFils: 0,
  countedFils: null,
  salesFils: 0,
  tipsFils: 0,
  cashSalesFils: 0,
  discountsFils: 0,
  expensesFils: 0,
  drawerExpensesFils: 0,
  cashInFils: 0,
  cashOutFils: 0,
  note: '',
  ...o,
})

describe('periods', () => {
  const today = '2026-10-26'
  it('presets', () => {
    expect(presetPeriod('today', today)).toEqual({ from: '2026-10-26', to: '2026-10-26' })
    expect(presetPeriod('thisMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-26' })
    expect(presetPeriod('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetPeriod('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-10-26' })
    expect(presetPeriod('lastYear', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(presetPeriod('last30', today)).toEqual({ from: '2026-09-27', to: '2026-10-26' })
  })
  it('last month wraps over a year end and handles leap years', () => {
    expect(presetPeriod('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetPeriod('lastMonth', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthEnd('2026-12-10')).toBe('2026-12-31')
    expect(monthStart('2026-12-10')).toBe('2026-12-01')
  })
  it('counts days inclusively and finds the period before', () => {
    expect(dayCount({ from: '2026-10-01', to: '2026-10-31' })).toBe(31)
    expect(dayCount({ from: '2026-10-26', to: '2026-10-26' })).toBe(1)
    expect(dayCount({ from: '2028-02-01', to: '2028-02-29' })).toBe(29)
    expect(previousPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-08-31', to: '2026-09-30' })
    expect(previousPeriod({ from: '2026-10-26', to: '2026-10-26' })).toEqual({ from: '2026-10-25', to: '2026-10-25' })
  })
  it('chooses how to group and names the bucket', () => {
    expect(defaultGroupBy({ from: '2026-10-01', to: '2026-10-31' })).toBe('day')
    expect(defaultGroupBy({ from: '2026-01-01', to: '2026-10-26' })).toBe('month')
    expect(defaultGroupBy({ from: '2020-01-01', to: '2026-10-26' })).toBe('year')
    expect(bucketKey('2026-10-26', 'day')).toBe('2026-10-26')
    expect(bucketKey('2026-10-26', 'month')).toBe('2026-10')
    expect(bucketKey('2026-10-26', 'year')).toBe('2026')
    expect(addDays('2026-10-26', 0)).toBe('2026-10-26')
  })
})

describe('totals and profit', () => {
  it('profit is sales received minus all expenses; a loss is negative', () => {
    const t = totalsOf([day('2026-10-01', { salesFils: 170000, expensesFils: 80000, discountsFils: 5000 }), day('2026-10-02', { salesFils: 10000, expensesFils: 40000 })])
    expect(t.salesFils).toBe(180000)
    expect(t.expensesFils).toBe(120000)
    expect(t.profitFils).toBe(60000)
    expect(t.grossFils).toBe(185000)
    expect(t.marginPct).toBe(33.3)
    expect(t.days).toBe(2)
    expect(totalsOf([day('2026-10-03', { salesFils: 10000, expensesFils: 40000 })]).profitFils).toBe(-30000)
  })
  it('has no margin without sales and survives an empty period', () => {
    expect(totalsOf([]).marginPct).toBeNull()
    expect(totalsOf([day('2026-10-03', { expensesFils: 100 })]).marginPct).toBeNull()
    expect(totalsOf([])).toMatchObject({ salesFils: 0, profitFils: 0, days: 0 })
  })
  it('groups by day, month and year, oldest first', () => {
    const days = [day('2026-10-02', { salesFils: 200 }), day('2025-12-31', { salesFils: 50 }), day('2026-10-01', { salesFils: 100 }), day('2026-09-15', { salesFils: 25 })]
    expect(bucketize(days, 'day').map((b) => [b.key, b.salesFils])).toEqual([['2025-12-31', 50], ['2026-09-15', 25], ['2026-10-01', 100], ['2026-10-02', 200]])
    expect(bucketize(days, 'month').map((b) => [b.key, b.salesFils, b.days])).toEqual([['2025-12', 50, 1], ['2026-09', 25, 1], ['2026-10', 300, 2]])
    expect(bucketize(days, 'year').map((b) => [b.key, b.salesFils])).toEqual([['2025', 50], ['2026', 325]])
  })
  it('percent change', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
    expect(pctChange(10, 0)).toBeNull()
    expect(pctChange(-50, -100)).toBe(50)
    expect(sharePct(1, 3)).toBe(33.3)
    expect(sharePct(5, 0)).toBe(0)
  })
})

describe('cash variance per day', () => {
  it('matches the daily close arithmetic', () => {
    const d = day('2026-10-01', { openingFils: 50000, cashSalesFils: 100000, cashInFils: 10000, drawerExpensesFils: 30000, cashOutFils: 20000, countedFils: 109000 })
    expect(expectedCash(d)).toBe(110000)
    expect(cashVariance(d)).toBe(-1000)
    expect(cashVariance({ ...d, countedFils: null })).toBeNull()
  })
})

describe('rolling a tree up', () => {
  const items = [
    { id: 1, parentId: null }, // Dine in
    { id: 2, parentId: 1 }, // Card
    { id: 3, parentId: 2 }, // Visa
    { id: 4, parentId: 2 }, // Mastercard
    { id: 5, parentId: 1 }, // Cash
    { id: 6, parentId: null }, // Delivery
    { id: 7, parentId: 6 }, // Keeta (no sales)
  ]
  it('adds each branch up and hides empty ones', () => {
    const rolled = rollUp(items, new Map([[3, 500], [4, 250], [5, 1000]]))
    expect(rolled.map((r) => [r.item.id, r.totalFils])).toEqual([[1, 1750]])
    const flat = flattenRolled(rolled)
    expect(flat.map((r) => [r.item.id, r.depth, r.totalFils])).toEqual([[1, 0, 1750], [2, 1, 750], [3, 2, 500], [4, 2, 250], [5, 1, 1000]])
  })
  it('keeps an entry made on a channel that was split later', () => {
    const rolled = rollUp(items, new Map([[2, 100], [3, 500]]))
    const card = flattenRolled(rolled).find((r) => r.item.id === 2)!
    expect(card.ownFils).toBe(100)
    expect(card.totalFils).toBe(600)
  })
})

describe('csv', () => {
  it('quotes what a spreadsheet would split, and keeps Chinese intact', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'line\nbreak', null, 5]])).toBe('a,"b,c","say ""hi""","line\nbreak",,5')
    expect(toCsv([['堂食', 1], ['x', 2]])).toBe('堂食,1\r\nx,2')
  })
  it('writes amounts as plain numbers, not formatted money', () => {
    expect(plainAmount(123456)).toBe('1234.56')
    expect(plainAmount(5)).toBe('0.05')
    expect(plainAmount(-2050)).toBe('-20.50')
    expect(plainAmount(0)).toBe('0.00')
    expect(typeof downloadCsv).toBe('function')
  })
})

describe('axis ticks', () => {
  it('are round numbers that cover 0 and the data', () => {
    expect(niceTicks(0, 230_000)).toEqual([0, 100_000, 200_000, 300_000]) // AED 0, 1K, 2K, 3K
    expect(niceTicks(0, 220_000)).toEqual([0, 100_000, 200_000, 300_000])
    expect(niceTicks(0, 1_150_000)).toEqual([0, 500_000, 1_000_000, 1_500_000])
    expect(niceTicks(0, 60_000)).toEqual([0, 20_000, 40_000, 60_000])
    expect(niceTicks(0, 9_000)).toEqual([0, 2_500, 5_000, 7_500, 10_000])
  })
  it('include the loss side when there are losses', () => {
    const t = niceTicks(-30_000, 90_000)
    expect(t[0]).toBeLessThan(0)
    expect(t).toContain(0)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(90_000)
  })
  it('gives an empty chart a usable axis', () => {
    expect(niceTicks(0, 0)).toEqual([0, 100_000])
  })
})
