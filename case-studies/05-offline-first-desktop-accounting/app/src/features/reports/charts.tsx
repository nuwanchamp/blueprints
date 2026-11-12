import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarProps } from 'recharts'
import { Button } from '@/components/ui/Button'
import { formatBucket } from '@/lib/date'
import { formatAed } from '@/lib/money'
import type { GroupBy } from '@/lib/period'
import type { Bucket } from '@/lib/reportMath'
import { compactAed, niceTicks, signedAed } from './format'

// Brand colours only. Two series are told apart by lightness, a hatch pattern and a legend, never by hue alone.
const INK = '#151413'
const GREY = '#8a857e'
const GRID = '#e4e1dc'
const MUTED = '#66615b'
const LOSS = '#b3261e'

/** The hatch fill for the "expenses" series. Defined once; charts and legend swatches point at it by id. */
export function ChartDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        <pattern id="hatch-expenses" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={GREY} />
          <rect width="2" height="6" fill="#ffffff" fillOpacity="0.55" />
        </pattern>
      </defs>
    </svg>
  )
}

/** Profit bars are ink; a bar below the line is a loss and is red. */
function ProfitShape(props: unknown) {
  const v = (props as { value?: number | number[] }).value
  const neg = (Array.isArray(v) ? v[1] : (v ?? 0)) < 0
  return EndRounded({ ...(props as object), fill: neg ? LOSS : INK })
}

/** A bar whose far end is rounded 4px and whose baseline end is square. Works above and below zero. */
function EndRounded(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, fill, value } = props as { x?: number; y?: number; width?: number; height?: number; fill?: string; value?: number | number[] }
  if (!width || !height) return null
  const neg = (Array.isArray(value) ? value[1] : (value ?? 0)) < 0
  const top = Math.min(y, y + height)
  const h = Math.abs(height)
  const r = Math.min(4, width / 2, h)
  const d = neg
    ? `M${x},${top} h${width} v${h - r} a${r},${r} 0 0 1 ${-r},${r} h${-(width - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} Z`
    : `M${x},${top + h} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} Z`
  return <path d={d} fill={fill} />
}

function Swatch({ kind }: { kind: 'ink' | 'hatch' | 'loss' }) {
  return (
    <svg width="14" height="14" aria-hidden="true" className="shrink-0">
      <rect width="14" height="14" rx="3" fill={kind === 'ink' ? INK : kind === 'loss' ? LOSS : 'url(#hatch-expenses)'} />
    </svg>
  )
}

export function Legend({ items }: { items: { kind: 'ink' | 'hatch' | 'loss'; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-[13px]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <Swatch kind={i.kind} />
          <span>{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

interface Row {
  key: string
  label: string
  sales: number
  expenses: number
  profit: number
}

function useRows(buckets: Bucket[], by: GroupBy): Row[] {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  return buckets.map((b) => ({ key: b.key, label: formatBucket(b.key, by, lang), sales: b.salesFils, expenses: b.expensesFils, profit: b.profitFils }))
}

/** Value first, name second, with a short key in the series' own style. */
function TipRow({ kind, label, value, loss }: { kind: 'ink' | 'hatch' | 'loss' | 'none'; label: string; value: string; loss?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-xs text-muted">
        {kind !== 'none' && <Swatch kind={kind} />}
        {label}
      </span>
      <span className={`text-sm font-bold ${loss ? 'text-loss' : ''}`}>{value}</span>
    </div>
  )
}

function Tip({ active, payload, show }: { active?: boolean; payload?: { payload: Row }[]; show: 'trend' | 'profit' }) {
  const { t } = useTranslation()
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="min-w-48 rounded-lg border border-line bg-white p-3 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-muted">{row.label}</p>
      {show === 'trend' && <TipRow kind="ink" label={t('dashboard.sales')} value={formatAed(row.sales)} />}
      {show === 'trend' && <TipRow kind="hatch" label={t('dashboard.expenses')} value={formatAed(row.expenses)} />}
      <TipRow kind={show === 'profit' ? (row.profit < 0 ? 'loss' : 'ink') : 'none'} label={row.profit < 0 ? t('dashboard.loss') : t('dashboard.profit')} value={signedAed(row.profit)} loss={row.profit < 0} />
    </div>
  )
}

const axis = { fill: MUTED, fontSize: 12 }

function Frame({ children, height = 280, label }: { children: ReactNode; height?: number; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

/** Sales and expenses side by side for each day, month or year. */
export function TrendChart({ buckets, by }: { buckets: Bucket[]; by: GroupBy }) {
  const { t } = useTranslation()
  const rows = useRows(buckets, by)
  const ticks = niceTicks(0, Math.max(0, ...rows.flatMap((r) => [r.sales, r.expenses])))
  const [table, setTable] = useState(false)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Legend items={[{ kind: 'ink', label: t('dashboard.sales') }, { kind: 'hatch', label: t('dashboard.expenses') }]} />
        <Button size="sm" variant="secondary" className="print:hidden" aria-pressed={table} onClick={() => setTable((v) => !v)}>
          {table ? t('dashboard.viewChart') : t('dashboard.viewTable')}
        </Button>
      </div>
      {table ? (
        <ChartTable rows={rows} />
      ) : (
        <Frame label={t('dashboard.trendTitle')}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={axis} interval="preserveStartEnd" minTickGap={16} />
            <YAxis ticks={ticks} domain={[ticks[0], ticks[ticks.length - 1]]} tickFormatter={compactAed} tickLine={false} axisLine={false} width={48} tick={axis} />
            <Tooltip cursor={{ fill: INK, fillOpacity: 0.05 }} content={<Tip show="trend" />} isAnimationActive={false} />
            <Bar dataKey="sales" fill={INK} maxBarSize={24} shape={EndRounded as BarProps['shape']} isAnimationActive={false} />
            <Bar dataKey="expenses" fill="url(#hatch-expenses)" maxBarSize={24} shape={EndRounded as BarProps['shape']} isAnimationActive={false} />
          </BarChart>
        </Frame>
      )}
    </div>
  )
}

/** Profit above the line, loss below it. One series, so no legend: the card title says what it is. */
export function ProfitChart({ buckets, by }: { buckets: Bucket[]; by: GroupBy }) {
  const { t } = useTranslation()
  const rows = useRows(buckets, by)
  const ticks = niceTicks(Math.min(0, ...rows.map((r) => r.profit)), Math.max(0, ...rows.map((r) => r.profit)))
  const [table, setTable] = useState(false)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Legend items={[{ kind: 'ink', label: t('dashboard.profit') }, { kind: 'loss', label: t('dashboard.loss') }]} />
        <Button size="sm" variant="secondary" className="print:hidden" aria-pressed={table} onClick={() => setTable((v) => !v)}>
          {table ? t('dashboard.viewChart') : t('dashboard.viewTable')}
        </Button>
      </div>
      {table ? (
        <ChartTable rows={rows} profitOnly />
      ) : (
        <Frame label={t('dashboard.profitTitle')}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} interval="preserveStartEnd" minTickGap={16} />
            <YAxis ticks={ticks} domain={[ticks[0], ticks[ticks.length - 1]]} tickFormatter={compactAed} tickLine={false} axisLine={false} width={48} tick={axis} />
            <ReferenceLine y={0} stroke={INK} strokeWidth={1} />
            <Tooltip cursor={{ fill: INK, fillOpacity: 0.05 }} content={<Tip show="profit" />} isAnimationActive={false} />
            <Bar dataKey="profit" fill={INK} maxBarSize={24} shape={ProfitShape as BarProps['shape']} isAnimationActive={false} />
          </BarChart>
        </Frame>
      )}
    </div>
  )
}

/** The table behind a chart, so every value can be read without hovering. */
function ChartTable({ rows, profitOnly }: { rows: Row[]; profitOnly?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-xs text-muted">
          <tr>
            <th className="py-1.5 text-left font-semibold">{t('reports.cols.period')}</th>
            {!profitOnly && <th className="py-1.5 text-right font-semibold">{t('dashboard.sales')}</th>}
            {!profitOnly && <th className="py-1.5 text-right font-semibold">{t('dashboard.expenses')}</th>}
            <th className="py-1.5 text-right font-semibold">{t('dashboard.profitLoss')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-1.5">{r.label}</td>
              {!profitOnly && <td className="py-1.5 text-right tabular-nums">{formatAed(r.sales)}</td>}
              {!profitOnly && <td className="py-1.5 text-right tabular-nums">{formatAed(r.expenses)}</td>}
              <td className={`py-1.5 text-right font-semibold tabular-nums ${r.profit < 0 ? 'text-loss' : ''}`}>{signedAed(r.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface RankedRow {
  key: string
  label: string
  amountFils: number
  /** Indent level, for a branch under a group. */
  depth?: number
  /** Marks a group heading, shown bold. */
  strong?: boolean
  /** A section heading (Dine in, Delivery) over the bars that follow: its total and share, no bar of its own. */
  heading?: boolean
  /** Splits the bar into parts (sub-categories), biggest first. Shades step from dark to light in this order. */
  segments?: { key: string; label: string; amountFils: number }[]
}

// One grey family, dark to light, so the bars stay on-brand. Each part also gets its name and amount below the bar.
const SHADES = ['#151413', '#4A4641', '#7A756E', '#A8A39C', '#CFCBC5']

/**
 * Horizontal bars for "where did it come from / go". One series, one colour, sorted by the caller.
 * The value sits at the tip of the bar, so nothing depends on hovering.
 */
export function RankedBars({ rows, empty }: { rows: RankedRow[]; empty: string }) {
  const { t } = useTranslation()
  if (rows.length === 0) return <p className="py-6 text-sm text-muted">{empty}</p>
  const bars = rows.filter((r) => !r.heading)
  const max = Math.max(...bars.map((r) => Math.abs(r.amountFils)), 1)
  const total = bars.filter((r) => !r.depth).reduce((s, r) => s + r.amountFils, 0)
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const share = total > 0 ? Math.round((r.amountFils / total) * 1000) / 10 : 0
        if (r.heading) {
          return (
            <li key={r.key} role="presentation" className="mt-2 flex items-baseline justify-between gap-4 border-b border-ink pb-1 first:mt-0">
              <h3 className="text-sm font-bold">{r.label}</h3>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-bold">{formatAed(r.amountFils)}</span>
                <span className="ml-2 text-xs text-muted">{t('reports.percent', { value: share.toFixed(1) })}</span>
              </span>
            </li>
          )
        }
        return (
          <li key={r.key} style={{ paddingLeft: (r.depth ?? 0) * 16 }} title={`${r.label}: ${formatAed(r.amountFils)} (${share}%)`}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className={r.strong ? 'font-semibold' : 'text-muted'}>{r.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{formatAed(r.amountFils)}</span>
                <span className="ml-2 text-xs text-muted">{t('reports.percent', { value: share.toFixed(1) })}</span>
              </span>
            </div>
            <div className="print-exact mt-1 h-2">
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-r-[4px]" style={{ width: `${Math.max(1, (Math.abs(r.amountFils) / max) * 100)}%` }}>
                {r.segments && r.segments.length > 1 ? (
                  r.segments.map((g, i) => (
                    <div
                      key={g.key}
                      data-testid="bar-segment"
                      title={`${g.label}: ${formatAed(g.amountFils)}`}
                      className="h-2 min-w-[2px]"
                      style={{ flexGrow: g.amountFils, flexBasis: 0, background: SHADES[Math.min(i, SHADES.length - 1)] }}
                    />
                  ))
                ) : (
                  <div className="h-2 w-full bg-ink" />
                )}
              </div>
            </div>
            {r.segments && r.segments.length > 1 && (
              <ul className="print-exact mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                {r.segments.map((g, i) => (
                  <li key={g.key} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5 rounded-[2px] border border-line" style={{ background: SHADES[Math.min(i, SHADES.length - 1)] }} />
                    {g.label} <span className="tabular-nums">{formatAed(g.amountFils)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
