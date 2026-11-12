import { useCallback, useEffect, useMemo, useState } from 'react'
import { listExpenseCategories, listExpenseTypes, type ExpenseCategory, type ExpenseType } from '@/db/repo/expenses'
import { getAlertFils, listSuppliers, listUncategorised, loadDay, type DayData, type SupplierSuggestion, type UncategorisedExpense } from '@/db/repo/daily'
import {
  listCashReasons,
  listDiscountReasons,
  listIncomeChannels,
  listPaidFromAccounts,
  type CashReason,
  type DiscountReason,
  type IncomeChannel,
  type PaidFromAccount,
} from '@/db/repo/master'
import { reconcile, type Reconciliation } from '@/lib/calc'

export interface Master {
  channels: IncomeChannel[]
  categories: ExpenseCategory[]
  types: ExpenseType[]
  accounts: PaidFromAccount[]
  reasons: CashReason[]
  discountReasons: DiscountReason[]
  alertFils: number
}

async function loadMaster(): Promise<Master> {
  const [channels, categories, types, accounts, reasons, discountReasons, alertFils] = await Promise.all([
    listIncomeChannels(),
    listExpenseCategories(),
    listExpenseTypes(),
    listPaidFromAccounts(),
    listCashReasons(),
    listDiscountReasons(),
    getAlertFils(),
  ])
  return { channels, categories, types, accounts, reasons, discountReasons, alertFils }
}

export interface DailyCtx {
  date: string
  master: Master
  data: DayData
  /** Uncategorised expenses on every day, not just this one. */
  uncategorised: UncategorisedExpense[]
  /** Markets and suppliers used before, for the search-select. */
  suppliers: SupplierSuggestion[]
  rec: Reconciliation
  closed: boolean
  reload: () => Promise<void>
  /** Lookups by id, including inactive records, so old entries still show their names. */
  by: {
    channel: Map<number, IncomeChannel>
    category: Map<number, ExpenseCategory>
    type: Map<number, ExpenseType>
    account: Map<number, PaidFromAccount>
    reason: Map<number, CashReason>
    discountReason: Map<number, DiscountReason>
  }
}

/** Puts a loaded day together with its lookups and the cash reconciliation. */
function buildCtx(date: string, master: Master, day: DayData, uncategorised: UncategorisedExpense[], suppliers: SupplierSuggestion[], reload: () => Promise<void>): DailyCtx {
  const by = {
    channel: new Map(master.channels.map((x) => [x.id, x])),
    category: new Map(master.categories.map((x) => [x.id, x])),
    type: new Map(master.types.map((x) => [x.id, x])),
    account: new Map(master.accounts.map((x) => [x.id, x])),
    reason: new Map(master.reasons.map((x) => [x.id, x])),
    discountReason: new Map(master.discountReasons.map((x) => [x.id, x])),
  }
  const { sales, expenses, movements, discounts } = day
  const rec = reconcile({
    openingFloatFils: day.day.openingFloatFils,
    countedCashFils: day.day.countedCashFils,
    alertFils: master.alertFils,
    sales: sales.map((s) => ({ amountFils: s.amountFils, tipFils: s.tipFils, countsInDrawer: by.channel.get(s.channelId)?.countsInDrawer ?? false })),
    expenses: expenses.map((e) => ({ amountFils: e.amountFils, affectsDrawer: by.account.get(e.paidFromId)?.affectsDrawer ?? false })),
    movements: movements.map((m) => ({ amountFils: m.amountFils, direction: by.reason.get(m.reasonId)?.direction ?? 'in' })),
    discounts: discounts.map((d) => ({ amountFils: d.amountFils })),
  })
  return { date, master, data: day, uncategorised, suppliers, rec, closed: day.day.status === 'closed', reload, by }
}

/** Loads one day straight from the database, outside React (for the day's Excel copy after closing it). */
export async function loadDailyCtx(date: string): Promise<DailyCtx> {
  const [m, d] = await Promise.all([loadMaster(), loadDay(date)])
  return buildCtx(date, m, d, [], [], async () => {})
}

/** Loads one business day plus the master lists it needs, and works out the cash reconciliation. */
export function useDailyData(date: string): { ctx: DailyCtx | null; error: string | null } {
  const [master, setMaster] = useState<Master | null>(null)
  const [data, setData] = useState<{ date: string; day: DayData; uncategorised: UncategorisedExpense[]; suppliers: SupplierSuggestion[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [m, d, u, sup] = await Promise.all([loadMaster(), loadDay(date), listUncategorised(), listSuppliers()])
      setMaster(m)
      setData({ date, day: d, uncategorised: u, suppliers: sup })
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [date])

  useEffect(() => {
    void reload()
  }, [reload])

  const ctx = useMemo<DailyCtx | null>(() => {
    // `data` can still belong to the previous date for one render after the date changes
    if (!master || !data || data.date !== date) return null
    return buildCtx(date, master, data.day, data.uncategorised, data.suppliers, reload)
  }, [master, data, date, reload])

  return { ctx, error }
}
