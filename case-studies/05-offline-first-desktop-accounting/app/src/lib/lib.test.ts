import { describe, expect, it } from 'vitest'
import { reconcile } from './calc'
import { addDays, formatDay, isValidISODate, todayISO } from './date'
import { formatAed, formatFils, parseFils } from './money'

describe('parseFils', () => {
  it('reads what people type', () => {
    expect(parseFils('450')).toBe(45000)
    expect(parseFils('450.5')).toBe(45050)
    expect(parseFils('450.05')).toBe(45005)
    expect(parseFils('1,234.50')).toBe(123450)
    expect(parseFils('.5')).toBe(50)
    expect(parseFils(' AED 12 ')).toBe(1200)
    expect(parseFils('0')).toBe(0)
  })
  it('rejects anything else', () => {
    for (const bad of ['', ' ', '.', '-5', '1.234', 'abc', '12a', '1..2', '1e3']) expect(parseFils(bad)).toBeNull()
  })
  it('has no floating-point drift', () => {
    expect(parseFils('0.1')! + parseFils('0.2')!).toBe(30)
    expect(parseFils('19.99')).toBe(1999)
  })
})

describe('formatFils', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatFils(0)).toBe('0.00')
    expect(formatFils(5)).toBe('0.05')
    expect(formatFils(123456)).toBe('1,234.56')
    expect(formatFils(-2000)).toBe('−20.00')
    expect(formatAed(34068648)).toBe('AED 340,686.48')
  })
})

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidISODate('2026-10-26')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('26/10/2026')).toBe(false)
    expect(isValidISODate(null)).toBe(false)
  })
  it('steps across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('uses the local calendar day', () => {
    expect(todayISO(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26')
  })
  it('formats for each language', () => {
    expect(formatDay('2026-10-26', 'en')).toContain('26/10/2026')
    expect(formatDay('2026-10-26', 'zh')).toContain('10月26日')
  })
})

describe('reconcile', () => {
  const base = { openingFloatFils: 50000, countedCashFils: null, alertFils: 2000 }

  it('takes card tips off the sales and shows them on their own, without touching the drawer', () => {
    const r = reconcile({
      ...base,
      sales: [
        { amountFils: 342000, countsInDrawer: true }, // cash
        { amountFils: 520000, tipFils: 20000, countsInDrawer: false }, // Visa: machine total incl. AED 200 tips
        { amountFils: 105000, tipFils: 5000, countsInDrawer: false }, // Mastercard
      ],
      expenses: [],
      movements: [],
      discounts: [],
    })
    expect(r.receivedFils).toBe(967000)
    expect(r.tipsFils).toBe(25000)
    expect(r.totalSalesFils).toBe(942000)
    expect(r.otherSalesFils).toBe(600000)
    expect(r.cashSalesFils).toBe(342000)
    expect(r.expectedCashFils).toBe(50000 + 342000)
  })

  it('leaves tips out until the card total covers them, so sales never go below zero', () => {
    const r = reconcile({
      ...base,
      sales: [
        { amountFils: 0, tipFils: 20000, countsInDrawer: false }, // tips typed first, total not yet
        { amountFils: 10000, tipFils: 5000, countsInDrawer: false },
      ],
      expenses: [],
      movements: [],
      discounts: [],
    })
    expect(r.tipsFils).toBe(5000)
    expect(r.totalSalesFils).toBe(5000)
    expect(r.otherSalesFils).toBe(5000)
  })

  it('computes expected cash from the drawer movements only', () => {
    const r = reconcile({
      ...base,
      sales: [
        { amountFils: 342000, countsInDrawer: true }, // cash
        { amountFils: 500000, countsInDrawer: false }, // card
        { amountFils: 250000, countsInDrawer: false }, // delivery platform
      ],
      expenses: [
        { amountFils: 8500, affectsDrawer: true },
        { amountFils: 12000, affectsDrawer: false }, // petty cash: not from the drawer
        { amountFils: 15000, affectsDrawer: true },
      ],
      movements: [
        { amountFils: 10000, direction: 'in' },
        { amountFils: 200000, direction: 'out' },
      ],
      discounts: [],
    })
    expect(r.totalSalesFils).toBe(1092000)
    expect(r.cashSalesFils).toBe(342000)
    expect(r.otherSalesFils).toBe(750000)
    expect(r.totalExpensesFils).toBe(35500)
    expect(r.drawerExpensesFils).toBe(23500)
    expect(r.otherExpensesFils).toBe(12000)
    // before deductions: 500.00 + 3,420.00 + 100.00
    expect(r.availableFils).toBe(402000)
    // then - 235.00 - 2,000.00
    expect(r.expectedCashFils).toBe(178500)
    expect(r.varianceFils).toBeNull()
    expect(r.status).toBe('uncounted')
  })

  it('classifies the variance', () => {
    const open = { ...base, sales: [], expenses: [], movements: [], discounts: [] }
    expect(reconcile({ ...open, countedCashFils: 50000 })).toMatchObject({ varianceFils: 0, status: 'balanced' })
    expect(reconcile({ ...open, countedCashFils: 48000 })).toMatchObject({ varianceFils: -2000, status: 'within' })
    expect(reconcile({ ...open, countedCashFils: 52000 })).toMatchObject({ varianceFils: 2000, status: 'within' })
    expect(reconcile({ ...open, countedCashFils: 47999 })).toMatchObject({ varianceFils: -2001, status: 'alert' })
    expect(reconcile({ ...open, countedCashFils: 60000 })).toMatchObject({ varianceFils: 10000, status: 'alert' })
  })

  it('handles an empty day', () => {
    const r = reconcile({ ...base, sales: [], expenses: [], movements: [], discounts: [], countedCashFils: null })
    expect(r.expectedCashFils).toBe(50000)
    expect(r.availableFils).toBe(50000) // nothing to deduct, so the same
    expect(r.totalSalesFils).toBe(0)
  })

  it('discounts are a memo: they never change the expected cash', () => {
    const day = {
      ...base,
      sales: [{ amountFils: 90000, countsInDrawer: true }], // 100.00 order, 10.00 discount, 90.00 received in cash
      expenses: [],
      movements: [],
    }
    const without = reconcile({ ...day, discounts: [] })
    const withDiscount = reconcile({ ...day, discounts: [{ amountFils: 10000 }, { amountFils: 2550 }] })
    expect(withDiscount.expectedCashFils).toBe(without.expectedCashFils)
    expect(withDiscount.expectedCashFils).toBe(140000) // 500.00 + 900.00
    expect(withDiscount.totalSalesFils).toBe(90000) // sales stay as received
    expect(withDiscount.discountsFils).toBe(12550)
    expect(withDiscount.grossSalesFils).toBe(102550) // received + discounts
    expect(without.grossSalesFils).toBe(90000)
  })
})
