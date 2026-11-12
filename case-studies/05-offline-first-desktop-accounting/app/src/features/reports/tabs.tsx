import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ChevronIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { plainAmount } from '@/lib/csv'
import { formatBucket, formatDate } from '@/lib/date'
import { formatAed } from '@/lib/money'
import { bucketize, cashVariance, expectedCash, flattenRolled, rollUp, sharePct, totalsOf } from '@/lib/reportMath'
import { buildTree, flatten } from '@/lib/tree'
import { CategoryDrill, CategoryMatrix, groupExpenses } from './CategoryDrill'
import { TrendChart } from './charts'
import { lossText, signedAed } from './format'
import { CsvButton, SectionCard, Table, Td, Th } from './ui'
import type { PeriodState } from './usePeriod'
import type { ReportData } from './useReport'

interface Props {
  data: ReportData
  state: PeriodState
}

function useNames() {
  const { t, i18n } = useTranslation()
  const lang: 'en' | 'zh' = i18n.language === 'zh' ? 'zh' : 'en'
  const name = (r: { nameEn: string; nameZh: string }) => (lang === 'zh' ? r.nameZh : r.nameEn)
  return { t, lang, name }
}

const fileName = (what: string, data: ReportData) => `daybook-${what}-${data.period.from}_${data.period.to}.csv`
const pct = (v: number) => `${v.toFixed(1)}%`

// ---------------------------------------------------------------- Summary

export function SummaryTab({ data, state }: Props) {
  const { t, lang } = useNames()
  const buckets = bucketize(data.days, state.groupBy)
  const total = totalsOf(data.days)
  const label = (key: string) => formatBucket(key, state.groupBy, lang)

  const csv = [
    [t('reports.cols.period'), t('reports.cols.days'), t('dashboard.sales'), t('reports.cols.tips'), t('dashboard.discounts'), t('reports.cols.gross'), t('dashboard.expenses'), t('dashboard.profitLoss'), t('reports.cols.margin')],
    ...buckets.map((b) => [b.key, b.days, plainAmount(b.salesFils), plainAmount(b.tipsFils), plainAmount(b.discountsFils), plainAmount(b.grossFils), plainAmount(b.expensesFils), plainAmount(b.profitFils), b.marginPct ?? '']),
    [t('reports.total'), total.days, plainAmount(total.salesFils), plainAmount(total.tipsFils), plainAmount(total.discountsFils), plainAmount(total.grossFils), plainAmount(total.expensesFils), plainAmount(total.profitFils), total.marginPct ?? ''],
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('dashboard.trendTitle')} subtitle={t('dashboard.trendSubtitle', { by: t(`period.by.${state.groupBy}`).toLowerCase() })}>
        <TrendChart buckets={buckets} by={state.groupBy} />
      </SectionCard>
      <SectionCard title={t('reports.summaryTitle', { by: t(`period.by.${state.groupBy}`).toLowerCase() })} actions={<CsvButton filename={fileName('summary', data)} rows={csv} />}>
        <Table label={t('reports.tabs.summary')}>
          <thead>
            <tr>
              <Th>{t('reports.cols.period')}</Th>
              <Th num>{t('reports.cols.days')}</Th>
              <Th num>{t('dashboard.sales')}</Th>
              <Th num>{t('reports.cols.tips')}</Th>
              <Th num>{t('dashboard.discounts')}</Th>
              <Th num>{t('reports.cols.gross')}</Th>
              <Th num>{t('dashboard.expenses')}</Th>
              <Th num>{t('dashboard.profitLoss')}</Th>
              <Th num>{t('reports.cols.margin')}</Th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key}>
                <Td>{label(b.key)}</Td>
                <Td num>{b.days}</Td>
                <Td num>{formatAed(b.salesFils)}</Td>
                <Td num>{formatAed(b.tipsFils)}</Td>
                <Td num>{formatAed(b.discountsFils)}</Td>
                <Td num>{formatAed(b.grossFils)}</Td>
                <Td num>{formatAed(b.expensesFils)}</Td>
                <Td num strong className={lossText(b.profitFils)}>
                  {signedAed(b.profitFils)}
                </Td>
                <Td num>{b.marginPct === null ? '—' : pct(b.marginPct)}</Td>
              </tr>
            ))}
            {buckets.length === 0 && (
              <tr>
                <Td colSpan={9} className="text-muted">
                  {t('dashboard.empty')}
                </Td>
              </tr>
            )}
          </tbody>
          {buckets.length > 0 && (
            <tfoot>
              <tr className="bg-page">
                <Td strong>{t('reports.total')}</Td>
                <Td num strong>
                  {total.days}
                </Td>
                <Td num strong data-testid="sum-sales">
                  {formatAed(total.salesFils)}
                </Td>
                <Td num strong data-testid="sum-tips">
                  {formatAed(total.tipsFils)}
                </Td>
                <Td num strong>
                  {formatAed(total.discountsFils)}
                </Td>
                <Td num strong>
                  {formatAed(total.grossFils)}
                </Td>
                <Td num strong>
                  {formatAed(total.expensesFils)}
                </Td>
                <Td num strong className={lossText(total.profitFils)}>
                  {signedAed(total.profitFils)}
                </Td>
                <Td num strong>
                  {total.marginPct === null ? '—' : pct(total.marginPct)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
        <p className="mt-3 text-xs text-muted">{t('dashboard.note')}</p>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------- Sales

export function SalesTab({ data }: Props) {
  const { t, lang, name } = useNames()
  const total = totalsOf(data.days)
  const byId = new Map(data.channels.map((c) => [c.id, c]))
  const pathOf = (id: number): string => {
    const c = byId.get(id)!
    return c.parentId === null ? name(c) : `${pathOf(c.parentId)} › ${name(c)}`
  }

  // 1. by channel, as a tree
  const amounts = new Map(data.salesByChannel.map((r) => [r.id!, r.amountFils]))
  const entries = new Map(data.salesByChannel.map((r) => [r.id!, r.count]))
  const rolled = flattenRolled(rollUp(data.channels, amounts))
  const channelCsv = [
    [t('reports.cols.channel'), t('reports.cols.entries'), t('reports.cols.amount'), t('reports.cols.share')],
    ...rolled.map((n) => [pathOf(n.item.id), entries.get(n.item.id) ?? '', plainAmount(n.totalFils), sharePct(n.totalFils, total.salesFils)]),
  ]

  // 2. each sale entry: one row per day, one column per channel that had sales
  const cell = new Map<string, number>()
  for (const c of data.saleCells) cell.set(`${c.date}|${c.channelId}`, c.amountFils)
  const used = new Set(data.saleCells.map((c) => c.channelId))
  const columns = flatten(buildTree(data.channels)).filter((n) => used.has(n.item.id)).map((n) => n.item)
  const dayDiscount = (date: string) => data.days.find((d) => d.date === date)?.discountsFils ?? 0
  const matrixCsv = [
    ['', ...columns.map((c) => pathOf(c.id)), t('dashboard.discounts'), t('reports.totalSales')],
    ...data.days.map((d) => [d.date, ...columns.map((c) => plainAmount(cell.get(`${d.date}|${c.id}`) ?? 0)), plainAmount(d.discountsFils), plainAmount(d.salesFils)]),
    [t('reports.total'), ...columns.map((c) => plainAmount(data.saleCells.filter((x) => x.channelId === c.id).reduce((s, x) => s + x.amountFils, 0))), plainAmount(total.discountsFils), plainAmount(total.salesFils)],
  ]

  const reasonById = new Map(data.discountReasons.map((r) => [r.id, r]))
  const discountsCsv = [[t('reports.cols.reason'), t('reports.cols.entries'), t('reports.cols.amount')], ...data.discounts.map((r) => [reasonById.get(r.id!) ? name(reasonById.get(r.id!)!) : '', r.count, plainAmount(r.amountFils)])]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('reports.salesByChannel')} actions={<CsvButton filename={fileName('sales-by-channel', data)} rows={channelCsv} />}>
        <Table label={t('reports.salesByChannel')}>
          <thead>
            <tr>
              <Th>{t('reports.cols.channel')}</Th>
              <Th num>{t('reports.cols.entries')}</Th>
              <Th num>{t('reports.cols.amount')}</Th>
              <Th num>{t('reports.cols.share')}</Th>
            </tr>
          </thead>
          <tbody>
            {rolled.map((n) => (
              <tr key={n.item.id} className={n.depth === 0 ? 'bg-tint' : undefined}>
                <Td strong={n.depth === 0} className="min-w-56">
                  <span style={{ paddingLeft: n.depth * 18 }}>{name(n.item)}</span>
                </Td>
                <Td num>{entries.get(n.item.id) ?? '—'}</Td>
                <Td num strong={n.depth === 0}>
                  {formatAed(n.totalFils)}
                </Td>
                <Td num>{pct(sharePct(n.totalFils, total.salesFils))}</Td>
              </tr>
            ))}
            {rolled.length === 0 && (
              <tr>
                <Td colSpan={4} className="text-muted">
                  {t('dashboard.empty')}
                </Td>
              </tr>
            )}
          </tbody>
          {rolled.length > 0 && (
            <tfoot>
              <tr className="bg-page">
                <Td strong>{t('reports.totalSales')}</Td>
                <Td />
                <Td num strong>
                  {formatAed(total.salesFils)}
                </Td>
                <Td num strong>
                  {pct(100)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </SectionCard>

      <SectionCard title={t('reports.eachSale')} subtitle={t('reports.eachSaleHint')} actions={<CsvButton filename={fileName('sales-by-day', data)} rows={matrixCsv} />}>
        <Table label={t('reports.eachSale')}>
          <thead>
            <tr>
              <Th className="sticky left-0 bg-white">{t('reports.cols.date')}</Th>
              {columns.map((c) => (
                <Th num key={c.id}>
                  <span title={pathOf(c.id)}>{name(c)}</span>
                </Th>
              ))}
              <Th num>{t('dashboard.discounts')}</Th>
              <Th num>{t('reports.totalSales')}</Th>
            </tr>
          </thead>
          <tbody>
            {data.days.map((d) => (
              <tr key={d.date}>
                <Td className="sticky left-0 bg-white whitespace-nowrap">
                  <Link className="font-medium underline" to={`/daily?date=${d.date}&step=sales`}>
                    {formatDate(d.date, lang)}
                  </Link>
                </Td>
                {columns.map((c) => (
                  <Td num key={c.id}>
                    {cell.has(`${d.date}|${c.id}`) ? formatAed(cell.get(`${d.date}|${c.id}`)!) : <span className="text-muted">—</span>}
                  </Td>
                ))}
                <Td num>{dayDiscount(d.date) ? formatAed(dayDiscount(d.date)) : <span className="text-muted">—</span>}</Td>
                <Td num strong>
                  {formatAed(d.salesFils)}
                </Td>
              </tr>
            ))}
          </tbody>
          {data.days.length > 0 && (
            <tfoot>
              <tr className="bg-page">
                <Td strong className="sticky left-0 bg-page">
                  {t('reports.total')}
                </Td>
                {columns.map((c) => (
                  <Td num strong key={c.id}>
                    {formatAed(data.saleCells.filter((x) => x.channelId === c.id).reduce((s, x) => s + x.amountFils, 0))}
                  </Td>
                ))}
                <Td num strong>
                  {formatAed(total.discountsFils)}
                </Td>
                <Td num strong>
                  {formatAed(total.salesFils)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </SectionCard>

      <SectionCard title={t('reports.discountsByReason')} subtitle={t('daily.discounts.hint')} actions={<CsvButton filename={fileName('discounts', data)} rows={discountsCsv} />}>
        <Table label={t('reports.discountsByReason')}>
          <thead>
            <tr>
              <Th>{t('reports.cols.reason')}</Th>
              <Th num>{t('reports.cols.entries')}</Th>
              <Th num>{t('reports.cols.amount')}</Th>
            </tr>
          </thead>
          <tbody>
            {data.discounts.map((r) => (
              <tr key={r.id}>
                <Td>{reasonById.get(r.id!) ? name(reasonById.get(r.id!)!) : '—'}</Td>
                <Td num>{r.count}</Td>
                <Td num>{formatAed(r.amountFils)}</Td>
              </tr>
            ))}
            {data.discounts.length === 0 && (
              <tr>
                <Td colSpan={3} className="text-muted">
                  {t('daily.discounts.empty')}
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------- Expenses

const LINE_LIMIT = 500

export function ExpensesTab({ data, state }: Props) {
  const { t, lang, name } = useNames()
  const total = totalsOf(data.days)
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const accountById = new Map(data.accounts.map((a) => [a.id, a]))
  const pathOf = (id: number | null): string => {
    if (id === null) return t('reports.uncategorised')
    const c = catById.get(id)
    if (!c) return '—'
    return c.parentId === null ? name(c) : `${pathOf(c.parentId)} › ${name(c)}`
  }

  const categoryGroups = groupExpenses(data, name, t('reports.uncategorised'))
  const accountCsv = [[t('reports.cols.account'), t('reports.cols.entries'), t('reports.cols.amount'), t('reports.cols.share')], ...data.expensesByAccount.map((r) => [accountById.get(r.id!) ? name(accountById.get(r.id!)!) : '', r.count, plainAmount(r.amountFils), sharePct(r.amountFils, total.expensesFils)])]
  const supplierCsv = [[t('reports.cols.market'), t('reports.cols.entries'), t('reports.cols.amount'), t('reports.cols.share')], ...data.suppliers.map((s) => [s.name || t('reports.noMarket'), s.count, plainAmount(s.amountFils), sharePct(s.amountFils, total.expensesFils)])]
  const linesCsv = [
    [t('reports.cols.date'), t('reports.cols.market'), t('reports.cols.category'), t('reports.cols.account'), t('reports.cols.receipt'), t('reports.cols.note'), t('reports.cols.amount')],
    ...data.expenseLines.map((l) => [l.date, l.supplier, pathOf(l.categoryId), accountById.get(l.paidFromId) ? name(accountById.get(l.paidFromId)!) : '', l.reference, l.note, plainAmount(l.amountFils)]),
  ]

  // every expense, grouped by day with the day's total
  const shown = data.expenseLines.slice(0, LINE_LIMIT)
  const groups: { date: string; lines: typeof shown; sum: number }[] = []
  for (const l of shown) {
    const g = groups[groups.length - 1]
    if (g && g.date === l.date) {
      g.lines.push(l)
      g.sum += l.amountFils
    } else groups.push({ date: l.date, lines: [l], sum: l.amountFils })
  }

  // Days start folded, except a day holding an uncategorised expense: that one needs a look
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const isOpen = (g: (typeof groups)[number]) => toggled[g.date] ?? g.lines.some((l) => l.categoryId === null)
  const setAll = (open: boolean) => setToggled(Object.fromEntries(groups.map((g) => [g.date, open])))

  const Share = ({ v }: { v: number }) => <Td num>{pct(sharePct(v, total.expensesFils))}</Td>

  return (
    <div className="flex flex-col gap-4">
      <CategoryDrill data={data} groups={categoryGroups} fileName={fileName('expenses-by-category', data)} />
      <CategoryMatrix data={data} groups={categoryGroups} by={state.groupBy} fileName={fileName('expenses-by-category-over-time', data)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t('reports.expensesByAccount')} actions={<CsvButton filename={fileName('expenses-by-account', data)} rows={accountCsv} />}>
          <Table label={t('reports.expensesByAccount')}>
            <thead>
              <tr>
                <Th>{t('reports.cols.account')}</Th>
                <Th num>{t('reports.cols.entries')}</Th>
                <Th num>{t('reports.cols.amount')}</Th>
                <Th num>{t('reports.cols.share')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.expensesByAccount.map((r) => (
                <tr key={r.id}>
                  <Td>{accountById.get(r.id!) ? name(accountById.get(r.id!)!) : '—'}</Td>
                  <Td num>{r.count}</Td>
                  <Td num>{formatAed(r.amountFils)}</Td>
                  <Share v={r.amountFils} />
                </tr>
              ))}
              {data.expensesByAccount.length === 0 && (
                <tr>
                  <Td colSpan={4} className="text-muted">
                    {t('dashboard.empty')}
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </SectionCard>

        <SectionCard title={t('reports.topMarkets')} subtitle={t('reports.topMarketsHint')} actions={<CsvButton filename={fileName('expenses-by-market', data)} rows={supplierCsv} />}>
          <Table label={t('reports.topMarkets')}>
            <thead>
              <tr>
                <Th>{t('reports.cols.market')}</Th>
                <Th num>{t('reports.cols.entries')}</Th>
                <Th num>{t('reports.cols.amount')}</Th>
                <Th num>{t('reports.cols.share')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.slice(0, 15).map((s, i) => (
                <tr key={`${s.name}${i}`}>
                  <Td className={s.name ? undefined : 'text-muted'}>{s.name || t('reports.noMarket')}</Td>
                  <Td num>{s.count}</Td>
                  <Td num>{formatAed(s.amountFils)}</Td>
                  <Share v={s.amountFils} />
                </tr>
              ))}
              {data.suppliers.length === 0 && (
                <tr>
                  <Td colSpan={4} className="text-muted">
                    {t('dashboard.empty')}
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </SectionCard>
      </div>

      <SectionCard title={t('reports.everyExpense')} subtitle={t('reports.everyExpenseHint')} actions={
          <span className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAll(true)}>
              {t('reports.expandAll')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAll(false)}>
              {t('reports.collapseAll')}
            </Button>
            <CsvButton filename={fileName('expenses', data)} rows={linesCsv} />
          </span>
        }>
        <Table label={t('reports.everyExpense')}>
          <thead>
            <tr>
              <Th>{t('reports.cols.market')}</Th>
              <Th>{t('reports.cols.category')}</Th>
              <Th>{t('reports.cols.account')}</Th>
              <Th>{t('reports.cols.receipt')}</Th>
              <Th num>{t('reports.cols.amount')}</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.date}>
                <tr className="bg-tint">
                  <Td strong colSpan={4} className="py-1">
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={isOpen(g)}
                        aria-label={`${formatDate(g.date, lang)}: ${t('reports.itemsCount', { count: g.lines.length })}`}
                        onClick={() => setToggled((x) => ({ ...x, [g.date]: !isOpen(g) }))}
                        className="-ml-1 flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-line"
                      >
                        <ChevronIcon open={isOpen(g)} />
                      </button>
                      <Link className="underline" to={`/daily?date=${g.date}&step=expenses`}>
                        {formatDate(g.date, lang)}
                      </Link>
                      <span className="text-xs font-normal text-muted">{t('reports.itemsCount', { count: g.lines.length })}</span>
                    </span>
                  </Td>
                  <Td num strong className="py-1">
                    {formatAed(g.sum)}
                  </Td>
                </tr>
                {isOpen(g) &&
                  g.lines.map((l) => (
                    <tr key={l.id}>
                      <Td className={cn('py-1', l.supplier ? undefined : 'text-muted')}>
                        <span className="pl-9">{l.supplier || t('reports.noMarket')}</span>
                        {l.note && <span className="block pl-9 text-xs text-muted">{l.note}</span>}
                      </Td>
                      <Td className={cn('py-1', l.categoryId === null && 'font-semibold')}>{pathOf(l.categoryId)}</Td>
                      <Td className="py-1">{accountById.get(l.paidFromId) ? name(accountById.get(l.paidFromId)!) : '—'}</Td>
                      <Td className="py-1">{l.reference}</Td>
                      <Td num className="py-1">
                        {formatAed(l.amountFils)}
                      </Td>
                    </tr>
                  ))}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-muted">
                  {t('dashboard.empty')}
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        {data.expenseLines.length > LINE_LIMIT && <p className="mt-3 text-xs font-medium">{t('reports.lineLimit', { shown: LINE_LIMIT, total: data.expenseLines.length })}</p>}
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------- Daily log

export function DaysTab({ data }: Props) {
  const { t, lang } = useNames()
  const total = totalsOf(data.days)
  const csv = [
    [t('reports.cols.date'), t('reports.cols.status'), t('dashboard.sales'), t('dashboard.discounts'), t('dashboard.expenses'), t('dashboard.profitLoss'), t('reports.cols.opening'), t('reports.cols.expected'), t('reports.cols.counted'), t('reports.cols.difference'), t('reports.cols.note')],
    ...data.days.map((d) => [d.date, d.status, plainAmount(d.salesFils), plainAmount(d.discountsFils), plainAmount(d.expensesFils), plainAmount(d.salesFils - d.expensesFils), plainAmount(d.openingFils), plainAmount(expectedCash(d)), d.countedFils === null ? '' : plainAmount(d.countedFils), cashVariance(d) === null ? '' : plainAmount(cashVariance(d)!), d.note]),
  ]
  return (
    <SectionCard title={t('reports.tabs.days')} subtitle={t('reports.daysHint')} actions={<CsvButton filename={fileName('daily-log', data)} rows={csv} />}>
      <Table label={t('reports.tabs.days')}>
        <thead>
          <tr>
            <Th>{t('reports.cols.date')}</Th>
            <Th>{t('reports.cols.status')}</Th>
            <Th num>{t('dashboard.sales')}</Th>
            <Th num>{t('dashboard.discounts')}</Th>
            <Th num>{t('dashboard.expenses')}</Th>
            <Th num>{t('dashboard.profitLoss')}</Th>
            <Th num>{t('reports.cols.expected')}</Th>
            <Th num>{t('reports.cols.counted')}</Th>
            <Th num>{t('reports.cols.difference')}</Th>
            <Th>{t('reports.cols.note')}</Th>
          </tr>
        </thead>
        <tbody>
          {data.days.map((d) => {
            const v = cashVariance(d)
            return (
              <tr key={d.date}>
                <Td className="whitespace-nowrap">
                  <Link className="font-medium underline" to={`/daily?date=${d.date}&step=review`}>
                    {formatDate(d.date, lang)}
                  </Link>
                </Td>
                <Td>{d.status === 'closed' ? t('daily.status.closed') : t('daily.status.open')}</Td>
                <Td num>{formatAed(d.salesFils)}</Td>
                <Td num>{d.discountsFils ? formatAed(d.discountsFils) : '—'}</Td>
                <Td num>{formatAed(d.expensesFils)}</Td>
                <Td num strong className={lossText(d.salesFils - d.expensesFils)}>
                  {signedAed(d.salesFils - d.expensesFils)}
                </Td>
                <Td num>{formatAed(expectedCash(d))}</Td>
                <Td num>{d.countedFils === null ? '—' : formatAed(d.countedFils)}</Td>
                <Td num strong={v !== null && Math.abs(v) > data.alertFils}>
                  {v === null ? '—' : signedAed(v)}
                </Td>
                <Td className="max-w-64 text-[13px]">{d.note}</Td>
              </tr>
            )
          })}
          {data.days.length === 0 && (
            <tr>
              <Td colSpan={10} className="text-muted">
                {t('dashboard.empty')}
              </Td>
            </tr>
          )}
        </tbody>
        {data.days.length > 0 && (
          <tfoot>
            <tr className="bg-page">
              <Td strong colSpan={2}>
                {t('reports.total')} ({total.days})
              </Td>
              <Td num strong>
                {formatAed(total.salesFils)}
              </Td>
              <Td num strong>
                {formatAed(total.discountsFils)}
              </Td>
              <Td num strong>
                {formatAed(total.expensesFils)}
              </Td>
              <Td num strong className={lossText(total.profitFils)}>
                {signedAed(total.profitFils)}
              </Td>
              <Td colSpan={4} />
            </tr>
          </tfoot>
        )}
      </Table>
    </SectionCard>
  )
}
