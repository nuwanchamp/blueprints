import { useEffect, useState } from 'react'
import { getAlertFils } from '@/db/repo/daily'
import { listExpenseCategories, type ExpenseCategory } from '@/db/repo/expenses'
import {
  listDiscountReasons,
  listIncomeChannels,
  listPaidFromAccounts,
  type DiscountReason,
  type IncomeChannel,
  type PaidFromAccount,
} from '@/db/repo/master'
import {
  daySummaries,
  discountsByReason,
  expenseLines,
  expensesByAccount,
  expensesByCategory,
  expensesBySupplier,
  periodHealth,
  salesByChannel,
  salesByDayChannel,
  type AmountRow,
  type DaySummary,
  type ExpenseLine,
  type PeriodHealth,
  type SaleCell,
  type SupplierTotal,
} from '@/db/repo/reports'
import { previousPeriod, type Period } from '@/lib/period'

export interface ReportData {
  period: Period
  includeOpen: boolean
  days: DaySummary[]
  /** The stretch of the same length just before, for "compared with". */
  previousDays: DaySummary[]
  salesByChannel: AmountRow[]
  expensesByCategory: AmountRow[]
  expensesByAccount: AmountRow[]
  suppliers: SupplierTotal[]
  discounts: AmountRow[]
  health: PeriodHealth
  alertFils: number
  /** Only loaded for the reports page: every sale entry and every expense. */
  saleCells: SaleCell[]
  expenseLines: ExpenseLine[]
  channels: IncomeChannel[]
  categories: ExpenseCategory[]
  accounts: PaidFromAccount[]
  discountReasons: DiscountReason[]
}

async function load(period: Period, includeOpen: boolean, detail: boolean): Promise<ReportData> {
  const prev = previousPeriod(period)
  const [days, previousDays, byChannel, byCategory, byAccount, suppliers, discounts, health, alertFils, channels, categories, accounts, discountReasons, cells, lines] =
    await Promise.all([
      daySummaries(period, includeOpen),
      daySummaries(prev, includeOpen),
      salesByChannel(period, includeOpen),
      expensesByCategory(period, includeOpen),
      expensesByAccount(period, includeOpen),
      expensesBySupplier(period, includeOpen),
      discountsByReason(period, includeOpen),
      periodHealth(period, includeOpen),
      getAlertFils(),
      listIncomeChannels(),
      listExpenseCategories(),
      listPaidFromAccounts(),
      listDiscountReasons(),
      detail ? salesByDayChannel(period, includeOpen) : Promise.resolve([] as SaleCell[]),
      detail ? expenseLines(period, includeOpen) : Promise.resolve([] as ExpenseLine[]),
    ])
  return {
    period,
    includeOpen,
    days,
    previousDays,
    salesByChannel: byChannel,
    expensesByCategory: byCategory,
    expensesByAccount: byAccount,
    suppliers,
    discounts,
    health,
    alertFils,
    saleCells: cells,
    expenseLines: lines,
    channels,
    categories,
    accounts,
    discountReasons,
  }
}

/**
 * Loads one report. While a new period loads, the previous result stays on screen (`loading` is true) so the page
 * does not jump or flash.
 */
export function useReport(period: Period, includeOpen: boolean, detail: boolean) {
  const key = `${period.from}|${period.to}|${includeOpen}|${detail}`
  const [state, setState] = useState<{ key: string; data: ReportData } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    load(period, includeOpen, detail).then(
      (data) => {
        if (current) {
          setState({ key, data })
          setError(null)
        }
      },
      (e: unknown) => current && setError(String(e)),
    )
    return () => {
      current = false
    }
    // `key` stands for period, includeOpen and detail
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data: state?.data ?? null, loading: state?.key !== key, error }
}
