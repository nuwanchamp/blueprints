import { Link } from 'react-router-dom'
import { Icon } from '@/components/ui/icons'
import { TriangleAlert } from 'lucide-react'
import { Callout } from '@/components/ui/Callout'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/date'
import { formatAed } from '@/lib/money'
import { dayCount, previousPeriod } from '@/lib/period'
import { bucketize, cashVariance, flattenRolled, pctChange, rollUp, totalsOf } from '@/lib/reportMath'
import { cn } from '@/lib/cn'
import { ChartDefs, ProfitChart, RankedBars, TrendChart, type RankedRow } from './charts'
import { lossText, signedAed } from './format'
import { PeriodBar, PrintHeader } from './PeriodBar'
import { DeltaText, HeroTile, SectionCard, StatTile, Table, Td, Th } from './ui'
import { usePeriod } from './usePeriod'
import { useReport, type ReportData } from './useReport'

export function DashboardPage() {
  const { t } = useTranslation()
  const state = usePeriod()
  const { data, loading, error } = useReport(state.period, state.includeOpen, false)

  return (
    <div className="flex flex-col gap-5">
      <ChartDefs />
      <header>
        <h1 className="font-serif text-[28px] leading-tight font-semibold">{t('dashboard.title')}</h1>
        <p className="mt-1.5 text-sm text-muted print:hidden">{t('dashboard.description')}</p>
      </header>

      <PeriodBar state={state} loading={loading} pdfName="dashboard" />
      <PrintHeader title={t('dashboard.title')} state={state} />

      {error && (
        <Callout tone="error" role="alert" className="text-sm">
          {error}
        </Callout>
      )}
      {!data && !error && <p className="text-sm text-muted">{t('common.loading')}</p>}
      {data && (
        // The previous result stays on screen, a little faded, while a new period loads
        <div className={cn('flex flex-col gap-5 transition-opacity', loading && 'opacity-60')}>
          <Body data={data} state={state} />
        </div>
      )}
    </div>
  )
}

function Body({ data, state }: { data: ReportData; state: ReturnType<typeof usePeriod> }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  const name = (r: { nameEn: string; nameZh: string }) => (lang === 'zh' ? r.nameZh : r.nameEn)
  const days = dayCount(previousPeriod(data.period))

  const cur = totalsOf(data.days)
  const prev = totalsOf(data.previousDays)
  const buckets = bucketize(data.days, state.groupBy)

  const variances = data.days.map((d) => ({ d, v: cashVariance(d) })).filter((x): x is { d: (typeof data.days)[number]; v: number } => x.v !== null)
  const cashDiff = variances.reduce((s, x) => s + x.v, 0)
  const overAllowance = variances.filter((x) => Math.abs(x.v) > data.alertFils).length

  // Sales by channel: a section per top-level channel (Dine in, Delivery), then one bar per second-level channel
  // (Card, Cash, Keeta, ...) split by the channels under it (Visa, Mastercard)
  const channelNodes = rollUp(data.channels, new Map(data.salesByChannel.map((r) => [r.id!, r.amountFils])))
  const barOf = (n: (typeof channelNodes)[number]): RankedRow => ({
    key: String(n.item.id),
    label: name(n.item),
    amountFils: n.totalFils,
    segments: flattenRolled([n])
      .filter((x) => x.ownFils > 0)
      .map((x) => ({ key: String(x.item.id), label: name(x.item), amountFils: x.ownFils }))
      .sort((a, b) => b.amountFils - a.amountFils),
  })
  const salesRows: RankedRow[] = [...channelNodes]
    .sort((a, b) => b.totalFils - a.totalFils)
    .flatMap((top) =>
      top.children.length === 0
        ? [barOf(top)]
        : [
            { key: `h${top.item.id}`, label: name(top.item), amountFils: top.totalFils, heading: true },
            ...top.children.map(barOf).sort((a, b) => b.amountFils - a.amountFils),
          ],
    )

  // Expenses by category, rolled up to the top level (Food & beverage, Staff, ...)
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const topOf = (id: number | null) => {
    let c = id === null ? undefined : catById.get(id)
    while (c?.parentId != null) c = catById.get(c.parentId)
    return c
  }
  // Within each top category, the biggest 4 sub-categories get their own shade and the rest are grouped as "Other"
  const SHOWN = 4
  const byTop = new Map<string, { label: string; amountFils: number; parts: Map<string, { label: string; amountFils: number }> }>()
  for (const r of data.expensesByCategory) {
    const top = topOf(r.id)
    const key = top ? String(top.id) : 'none'
    const label = top ? name(top) : t('reports.uncategorised')
    const entry = byTop.get(key) ?? { label, amountFils: 0, parts: new Map() }
    entry.amountFils += r.amountFils
    const sub = r.id !== null && top && r.id !== top.id ? catById.get(r.id) : undefined
    const partKey = sub ? String(sub.id) : 'direct'
    const part = entry.parts.get(partKey) ?? { label: sub ? name(sub) : t('dashboard.noSubCategory'), amountFils: 0 }
    part.amountFils += r.amountFils
    entry.parts.set(partKey, part)
    byTop.set(key, entry)
  }
  const expenseRows: RankedRow[] = [...byTop.entries()]
    .map(([key, v]) => {
      const parts = [...v.parts.entries()].map(([k, p]) => ({ key: k, ...p })).sort((a, b) => b.amountFils - a.amountFils)
      const rest = parts.slice(SHOWN)
      const segments =
        rest.length > 1 ? [...parts.slice(0, SHOWN), { key: 'other', label: t('dashboard.otherSubCategories'), amountFils: rest.reduce((s, p) => s + p.amountFils, 0) }] : parts
      return { key, label: v.label, amountFils: v.amountFils, strong: true, segments }
    })
    .sort((a, b) => b.amountFils - a.amountFils)

  const recent = [...data.days].reverse().slice(0, 10)
  const nothing = data.days.length === 0

  return (
    <>
      {/* things a stakeholder should know before trusting the numbers */}
      {(data.health.openDays > 0 || data.health.uncategorised > 0 || overAllowance > 0) && (
        <div role="status" aria-label={t('dashboard.attention')} className="flex items-start gap-3 rounded-xl border border-warn-line bg-warn-tint p-4 text-sm text-warn">
          {/* level with the first message, which sits beside a 44px button when it is the open-days one */}
          <span className={cn('flex shrink-0 items-center', data.health.openDays > 0 ? 'h-11' : 'h-5')}>
            <Icon icon={TriangleAlert} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {data.health.openDays > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">{t('dashboard.openDays', { count: data.health.openDays })}</p>
                <Button size="sm" variant="secondary" className="print:hidden" onClick={() => state.setIncludeOpen(true)}>
                  {t('dashboard.includeThem')}
                </Button>
              </div>
            )}
            {data.health.uncategorised > 0 && <p className="font-semibold">{t('dashboard.uncategorised', { count: data.health.uncategorised })}</p>}
            {overAllowance > 0 && <p className="font-semibold">{t('dashboard.varianceDays', { count: overAllowance })}</p>}
          </div>
        </div>
      )}

      {nothing ? (
        <SectionCard title={t('dashboard.title')}>
          <p className="py-6 text-sm text-muted">{t('dashboard.empty')}</p>
        </SectionCard>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
            <HeroTile label={cur.profitFils < 0 ? t('dashboard.loss') : t('dashboard.profit')} value={signedAed(cur.profitFils)} testId="kpi-profit" loss={cur.profitFils < 0}>
              <p className="mt-2 text-sm font-medium">
                {cur.marginPct === null ? '—' : t('dashboard.margin', { value: cur.marginPct.toFixed(1) })}
              </p>
              <DeltaText pct={pctChange(cur.profitFils, prev.profitFils)} days={days} />
            </HeroTile>
            <StatTile label={t('dashboard.netSales')} value={formatAed(cur.salesFils)} testId="kpi-sales">
              <DeltaText pct={pctChange(cur.salesFils, prev.salesFils)} days={days} />
            </StatTile>
            <StatTile label={t('dashboard.expenses')} value={formatAed(cur.expensesFils)} testId="kpi-expenses">
              <DeltaText pct={pctChange(cur.expensesFils, prev.expensesFils)} days={days} />
            </StatTile>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label={t('dashboard.discounts')} value={formatAed(cur.discountsFils)} testId="kpi-discounts">
              <p className="mt-1 text-xs text-muted">{t('dashboard.grossNote', { amount: formatAed(cur.grossFils) })}</p>
            </StatTile>
            <StatTile label={t('dashboard.cashDifference')} value={signedAed(cashDiff)} testId="kpi-cash">
              <p className="mt-1 text-xs text-muted">{t('dashboard.cashDifferenceNote', { count: overAllowance })}</p>
            </StatTile>
            <StatTile label={t('dashboard.daysCounted')} value={String(cur.days)} testId="kpi-days">
              <p className="mt-1 text-xs text-muted">{state.includeOpen ? t('dashboard.daysIncludeOpen') : t('dashboard.daysClosedOnly')}</p>
            </StatTile>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t('dashboard.trendTitle')} subtitle={t('dashboard.trendSubtitle', { by: t(`period.by.${state.groupBy}`).toLowerCase() })}>
              <TrendChart buckets={buckets} by={state.groupBy} />
            </SectionCard>
            <SectionCard title={t('dashboard.profitTitle')} subtitle={t('dashboard.profitSubtitle')}>
              <ProfitChart buckets={buckets} by={state.groupBy} />
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t('dashboard.salesByChannel')} actions={<Link className="text-[13px] font-semibold underline" to={`/reports?tab=sales&${searchOf(state)}`}>{t('dashboard.details')}</Link>}>
              <RankedBars rows={salesRows} empty={t('dashboard.empty')} />
            </SectionCard>
            <SectionCard title={t('dashboard.expensesByCategory')} actions={<Link className="text-[13px] font-semibold underline" to={`/reports?tab=expenses&${searchOf(state)}`}>{t('dashboard.details')}</Link>}>
              <RankedBars rows={expenseRows} empty={t('dashboard.empty')} />
            </SectionCard>
          </div>

          <SectionCard
            title={t('dashboard.daysTitle')}
            actions={<Link className="text-[13px] font-semibold underline" to={`/reports?tab=days&${searchOf(state)}`}>{t('dashboard.viewAll')}</Link>}
          >
            <Table label={t('dashboard.daysTitle')}>
              <thead>
                <tr>
                  <Th>{t('reports.cols.date')}</Th>
                  <Th>{t('reports.cols.status')}</Th>
                  <Th num>{t('dashboard.sales')}</Th>
                  <Th num>{t('dashboard.expenses')}</Th>
                  <Th num>{t('dashboard.profitLoss')}</Th>
                  <Th num>{t('dashboard.cashDifference')}</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => {
                  const v = cashVariance(d)
                  return (
                    <tr key={d.date}>
                      <Td>
                        <Link className="font-medium underline" to={`/daily?date=${d.date}&step=review`}>
                          {formatDate(d.date, lang)}
                        </Link>
                      </Td>
                      <Td>{d.status === 'closed' ? t('daily.status.closed') : t('daily.status.open')}</Td>
                      <Td num>{formatAed(d.salesFils)}</Td>
                      <Td num>{formatAed(d.expensesFils)}</Td>
                      <Td num strong className={lossText(d.salesFils - d.expensesFils)}>
                        {signedAed(d.salesFils - d.expensesFils)}
                      </Td>
                      <Td num>{v === null ? '—' : signedAed(v)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </SectionCard>

          <p className="text-xs text-muted">{t('dashboard.note')}</p>
        </>
      )}
    </>
  )
}

/** The current period as address parameters, so a link carries it to the reports. */
export function searchOf(state: ReturnType<typeof usePeriod>): string {
  const p = new URLSearchParams({ range: state.range })
  if (state.range === 'custom') {
    p.set('from', state.period.from)
    p.set('to', state.period.to)
  }
  if (state.includeOpen) p.set('open', '1')
  p.set('by', state.groupBy)
  return p.toString()
}
