import type { TFunction } from 'i18next'
import { countedTip } from '@/lib/calc'
import type { DailyCtx } from '@/features/daily/useDailyData'
import { plainAmount } from '@/lib/csv'
import type { Sheet } from '@/lib/xlsx'

type Named = { nameEn: string; nameZh: string; parentId?: number | null }

/**
 * One business day as spreadsheet sheets: the summary with the cash reconciliation, then every sale, discount,
 * expense and cash movement. Names follow the language on screen; amounts are plain numbers.
 */
export function daySheets(ctx: DailyCtx, t: TFunction, lang: 'en' | 'zh'): Sheet[] {
  const { data, rec, by } = ctx
  const name = (r: Named | undefined) => (r ? (lang === 'zh' ? r.nameZh : r.nameEn) : '—')
  const path = <T extends Named>(map: Map<number, T>, id: number | null): string => {
    if (id === null) return t('reports.uncategorised')
    const r = map.get(id)
    if (!r) return '—'
    return r.parentId == null ? name(r) : `${path(map, r.parentId)} › ${name(r)}`
  }
  const amt = plainAmount
  const x = (k: string) => t(`backup.excel.${k}`)

  const summary: Sheet = {
    name: x('summary'),
    rows: [
      [x('item'), x('value')],
      [x('date'), ctx.date],
      [x('status'), t(ctx.closed ? 'daily.status.closed' : 'daily.status.open')],
      [x('closedAt'), data.day.closedAt ?? ''],
      [x('totalSales'), amt(rec.totalSalesFils)],
      [x('cashSales'), amt(rec.cashSalesFils)],
      [x('otherSales'), amt(rec.otherSalesFils)],
      [x('cardTips'), amt(rec.tipsFils)],
      [x('received'), amt(rec.receivedFils)],
      [x('discounts'), amt(rec.discountsFils)],
      [x('grossSales'), amt(rec.grossSalesFils)],
      [x('totalExpenses'), amt(rec.totalExpensesFils)],
      [x('drawerExpenses'), amt(rec.drawerExpensesFils)],
      [x('otherExpenses'), amt(rec.otherExpensesFils)],
      [x('profitLoss'), amt(rec.totalSalesFils - rec.totalExpensesFils)],
      [x('openingFloat'), amt(data.day.openingFloatFils)],
      [x('cashIn'), amt(rec.cashInFils)],
      [x('cashOut'), amt(rec.cashOutFils)],
      [x('expected'), amt(rec.expectedCashFils)],
      [x('counted'), data.day.countedCashFils === null ? '' : amt(data.day.countedCashFils)],
      [x('difference'), rec.varianceFils === null ? '' : amt(rec.varianceFils)],
      [x('note'), data.day.note],
    ],
  }
  const sales: Sheet = {
    name: x('sales'),
    // Amount is as received (a card total includes its tips); sales after tips is what counts as sales
    rows: [
      [x('channel'), x('amount'), x('tips'), x('afterTips')],
      ...data.sales
        .filter((s) => s.amountFils !== 0)
        .map((s) => [path(by.channel, s.channelId), amt(s.amountFils), amt(countedTip(s.amountFils, s.tipFils)), amt(s.amountFils - countedTip(s.amountFils, s.tipFils))]),
    ],
  }
  const discounts: Sheet = {
    name: x('discountsSheet'),
    rows: [[x('reason'), x('note'), x('amount')], ...data.discounts.map((d) => [name(by.discountReason.get(d.reasonId)), d.note, amt(d.amountFils)])],
  }
  const expenses: Sheet = {
    name: x('expenses'),
    rows: [
      [x('supplier'), x('category'), x('paidFrom'), x('receipt'), x('note'), x('amount')],
      ...data.expenses.map((e) => [e.supplier, path(by.category, e.categoryId), name(by.account.get(e.paidFromId)), e.reference, e.note, amt(e.amountFils)]),
    ],
  }
  const cash: Sheet = {
    name: x('cash'),
    rows: [
      [x('reason'), x('direction'), x('note'), x('amount')],
      ...data.movements.map((m) => {
        const r = by.reason.get(m.reasonId)
        return [name(r), r ? t(`cashReasons.${r.direction}`) : '', m.note, amt(m.amountFils)]
      }),
    ],
  }
  return [summary, sales, discounts, expenses, cash]
}
