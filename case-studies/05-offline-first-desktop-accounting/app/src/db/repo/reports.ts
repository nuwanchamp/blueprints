import { query } from '../client'
import type { Period } from '@/lib/period'

// Read-only queries behind the dashboard and the reports.
// By default only closed days count: a day that is still being entered is a draft, not a result.

const IN_PERIOD = `d.business_date BETWEEN ? AND ? AND (? = 1 OR d.status = 'closed')`
const args = (p: Period, includeOpen: boolean) => [p.from, p.to, includeOpen ? 1 : 0]
const n = (v: unknown) => Number(v ?? 0)
// Card tips count only once the total covers them (see countedTip in lib/calc.ts)
const TIP = `CASE WHEN s.tip_fils <= s.amount_fils THEN s.tip_fils ELSE 0 END`

export interface DaySummary {
  date: string
  status: 'open' | 'closed'
  openingFils: number
  countedFils: number | null
  /** After card tips */
  salesFils: number
  /** Card tips (for staff, not sales) */
  tipsFils: number
  cashSalesFils: number
  discountsFils: number
  expensesFils: number
  drawerExpensesFils: number
  cashInFils: number
  cashOutFils: number
  note: string
}

/** One row per business day in the period, with its sales, expenses and cash figures. */
export async function daySummaries(p: Period, includeOpen: boolean): Promise<DaySummary[]> {
  const rows = await query(
    `SELECT d.business_date AS date, d.status, d.opening_float_fils AS opening, d.counted_cash_fils AS counted, d.note,
       COALESCE((SELECT SUM(s.amount_fils - ${TIP}) FROM sale s WHERE s.business_date = d.business_date), 0) AS sales,
       COALESCE((SELECT SUM(${TIP}) FROM sale s WHERE s.business_date = d.business_date), 0) AS tips,
       COALESCE((SELECT SUM(s.amount_fils - ${TIP}) FROM sale s JOIN income_channel c ON c.id = s.channel_id
                  WHERE s.business_date = d.business_date AND c.counts_in_drawer = 1), 0) AS cash_sales,
       COALESCE((SELECT SUM(x.amount_fils) FROM discount x WHERE x.business_date = d.business_date), 0) AS discounts,
       COALESCE((SELECT SUM(e.amount_fils) FROM expense e WHERE e.business_date = d.business_date), 0) AS expenses,
       COALESCE((SELECT SUM(e.amount_fils) FROM expense e JOIN paid_from_account a ON a.id = e.paid_from_id
                  WHERE e.business_date = d.business_date AND a.affects_drawer = 1), 0) AS drawer_expenses,
       COALESCE((SELECT SUM(m.amount_fils) FROM cash_movement m JOIN cash_movement_reason r ON r.id = m.reason_id
                  WHERE m.business_date = d.business_date AND r.direction = 'in'), 0) AS cash_in,
       COALESCE((SELECT SUM(m.amount_fils) FROM cash_movement m JOIN cash_movement_reason r ON r.id = m.reason_id
                  WHERE m.business_date = d.business_date AND r.direction = 'out'), 0) AS cash_out
     FROM daily_close d WHERE ${IN_PERIOD} ORDER BY d.business_date`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({
    date: String(r.date),
    status: r.status === 'closed' ? 'closed' : 'open',
    openingFils: n(r.opening),
    countedFils: r.counted == null ? null : n(r.counted),
    salesFils: n(r.sales),
    tipsFils: n(r.tips),
    cashSalesFils: n(r.cash_sales),
    discountsFils: n(r.discounts),
    expensesFils: n(r.expenses),
    drawerExpensesFils: n(r.drawer_expenses),
    cashInFils: n(r.cash_in),
    cashOutFils: n(r.cash_out),
    note: String(r.note ?? ''),
  }))
}

export interface AmountRow {
  id: number | null
  amountFils: number
  count: number
}

/** Sales after card tips, added up per income channel (leaf and parent alike; the report rolls them up). */
export async function salesByChannel(p: Period, includeOpen: boolean): Promise<AmountRow[]> {
  const rows = await query(
    `SELECT s.channel_id AS id, SUM(s.amount_fils - ${TIP}) AS amount, COUNT(*) AS cnt
       FROM sale s JOIN daily_close d ON d.business_date = s.business_date
      WHERE ${IN_PERIOD} GROUP BY s.channel_id`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({ id: Number(r.id), amountFils: n(r.amount), count: n(r.cnt) }))
}

export interface SaleCell {
  date: string
  channelId: number
  amountFils: number
}

/** Every sale entry, after card tips: one amount per day per channel. */
export async function salesByDayChannel(p: Period, includeOpen: boolean): Promise<SaleCell[]> {
  const rows = await query(
    `SELECT s.business_date AS date, s.channel_id AS channel, s.amount_fils - ${TIP} AS amount
       FROM sale s JOIN daily_close d ON d.business_date = s.business_date
      WHERE ${IN_PERIOD} ORDER BY s.business_date, s.channel_id`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({ date: String(r.date), channelId: Number(r.channel), amountFils: n(r.amount) }))
}

/** Expenses per category; id null means "uncategorised". */
export async function expensesByCategory(p: Period, includeOpen: boolean): Promise<AmountRow[]> {
  const rows = await query(
    `SELECT e.category_id AS id, SUM(e.amount_fils) AS amount, COUNT(*) AS cnt
       FROM expense e JOIN daily_close d ON d.business_date = e.business_date
      WHERE ${IN_PERIOD} GROUP BY e.category_id`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({ id: r.id == null ? null : Number(r.id), amountFils: n(r.amount), count: n(r.cnt) }))
}

export async function expensesByAccount(p: Period, includeOpen: boolean): Promise<AmountRow[]> {
  const rows = await query(
    `SELECT e.paid_from_id AS id, SUM(e.amount_fils) AS amount, COUNT(*) AS cnt
       FROM expense e JOIN daily_close d ON d.business_date = e.business_date
      WHERE ${IN_PERIOD} GROUP BY e.paid_from_id ORDER BY amount DESC`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({ id: Number(r.id), amountFils: n(r.amount), count: n(r.cnt) }))
}

export interface SupplierTotal {
  /** Empty string when the expense had no market name. */
  name: string
  amountFils: number
  count: number
}

/** Spending per market or supplier; names that differ only by case count as one. */
export async function expensesBySupplier(p: Period, includeOpen: boolean): Promise<SupplierTotal[]> {
  const rows = await query(
    `SELECT MAX(e.supplier) AS name, SUM(e.amount_fils) AS amount, COUNT(*) AS cnt
       FROM expense e JOIN daily_close d ON d.business_date = e.business_date
      WHERE ${IN_PERIOD} GROUP BY lower(trim(e.supplier)) ORDER BY amount DESC`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({ name: String(r.name ?? '').trim(), amountFils: n(r.amount), count: n(r.cnt) }))
}

export async function discountsByReason(p: Period, includeOpen: boolean): Promise<AmountRow[]> {
  const rows = await query(
    `SELECT x.reason_id AS id, SUM(x.amount_fils) AS amount, COUNT(*) AS cnt
       FROM discount x JOIN daily_close d ON d.business_date = x.business_date
      WHERE ${IN_PERIOD} GROUP BY x.reason_id ORDER BY amount DESC`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({ id: Number(r.id), amountFils: n(r.amount), count: n(r.cnt) }))
}

export interface ExpenseLine {
  id: number
  date: string
  supplier: string
  categoryId: number | null
  paidFromId: number
  reference: string
  note: string
  amountFils: number
}

/** Every expense in the period, in the order entered. */
export async function expenseLines(p: Period, includeOpen: boolean): Promise<ExpenseLine[]> {
  const rows = await query(
    `SELECT e.* FROM expense e JOIN daily_close d ON d.business_date = e.business_date
      WHERE ${IN_PERIOD} ORDER BY e.business_date, e.id`,
    args(p, includeOpen),
  )
  return rows.map((r) => ({
    id: n(r.id),
    date: String(r.business_date),
    supplier: String(r.supplier),
    categoryId: r.category_id == null ? null : n(r.category_id),
    paidFromId: n(r.paid_from_id),
    reference: String(r.reference),
    note: String(r.note),
    amountFils: n(r.amount_fils),
  }))
}

export interface PeriodHealth {
  /** Days in the period that are still open and so not counted (when closed days only are shown). */
  openDays: number
  /** Expenses in the counted days that have no category yet. */
  uncategorised: number
}

export async function periodHealth(p: Period, includeOpen: boolean): Promise<PeriodHealth> {
  const [open] = await query(`SELECT COUNT(*) AS c FROM daily_close d WHERE d.business_date BETWEEN ? AND ? AND d.status = 'open'`, [p.from, p.to])
  const [unc] = await query(
    `SELECT COUNT(*) AS c FROM expense e JOIN daily_close d ON d.business_date = e.business_date WHERE ${IN_PERIOD} AND e.category_id IS NULL`,
    args(p, includeOpen),
  )
  return { openDays: includeOpen ? 0 : n(open.c), uncategorised: n(unc.c) }
}
