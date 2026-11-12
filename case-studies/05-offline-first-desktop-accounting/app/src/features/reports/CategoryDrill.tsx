import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ChevronIcon } from '@/components/ui/icons'
import type { ExpenseLine } from '@/db/repo/reports'
import { plainAmount } from '@/lib/csv'
import { formatBucket, formatDate } from '@/lib/date'
import { formatAed } from '@/lib/money'
import type { GroupBy } from '@/lib/period'
import { bucketKey } from '@/lib/period'
import { sharePct } from '@/lib/reportMath'
import { cn } from '@/lib/cn'
import { CsvButton, SectionCard, Table, Td, Th } from './ui'
import type { ReportData } from './useReport'

interface Sub {
  key: string
  label: string
  totalFils: number
  lines: ExpenseLine[]
}

export interface Group {
  key: string
  label: string
  totalFils: number
  count: number
  /** Sub-categories, biggest first. */
  subs: Sub[]
  /** Expenses booked straight on the main category (one that has no sub-categories). */
  own: ExpenseLine[]
}

/**
 * The expenses of the period grouped by main category, then sub-category, then the individual expenses.
 * Biggest first at every level. An expense with no category sits in its own "Uncategorised" group.
 */
export function groupExpenses(data: ReportData, name: (r: { nameEn: string; nameZh: string }) => string, uncategorisedLabel: string): Group[] {
  const byId = new Map(data.categories.map((c) => [c.id, c]))
  const groups = new Map<string, Group>()
  const subMaps = new Map<string, Map<string, Sub>>()

  for (const line of data.expenseLines) {
    const cat = line.categoryId === null ? undefined : byId.get(line.categoryId)
    const top = cat ? (cat.parentId === null ? cat : byId.get(cat.parentId)) : undefined
    const gKey = top ? String(top.id) : 'none'
    let g = groups.get(gKey)
    if (!g) {
      g = { key: gKey, label: top ? name(top) : uncategorisedLabel, totalFils: 0, count: 0, subs: [], own: [] }
      groups.set(gKey, g)
      subMaps.set(gKey, new Map())
    }
    g.totalFils += line.amountFils
    g.count += 1
    if (cat && cat.parentId !== null) {
      const subs = subMaps.get(gKey)!
      let s = subs.get(String(cat.id))
      if (!s) {
        s = { key: String(cat.id), label: name(cat), totalFils: 0, lines: [] }
        subs.set(s.key, s)
        g.subs.push(s)
      }
      s.totalFils += line.amountFils
      s.lines.push(line)
    } else {
      g.own.push(line)
    }
  }
  const out = [...groups.values()]
  for (const g of out) g.subs.sort((a, b) => b.totalFils - a.totalFils)
  return out.sort((a, b) => b.totalFils - a.totalFils)
}

const pct = (v: number) => `${v.toFixed(1)}%`

export function CategoryDrill({ data, groups, fileName }: { data: ReportData; groups: Group[]; fileName: string }) {
  const { t, i18n } = useTranslation()
  const lang: 'en' | 'zh' = i18n.language === 'zh' ? 'zh' : 'en'
  const name = (r: { nameEn: string; nameZh: string }) => (lang === 'zh' ? r.nameZh : r.nameEn)
  const accountById = new Map(data.accounts.map((a) => [a.id, a]))
  const [open, setOpen] = useState<Set<string>>(new Set())

  const total = groups.reduce((s, g) => s + g.totalFils, 0)
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  const allKeys = groups.flatMap((g) => [`g:${g.key}`, ...g.subs.map((s) => `s:${g.key}:${s.key}`)])
  const allOpen = allKeys.length > 0 && allKeys.every((k) => open.has(k))

  // One row per expense with its main category and sub-category: the shape a spreadsheet can pivot
  const csv = [
    [t('reports.cols.mainCategory'), t('reports.cols.subCategory'), t('reports.cols.date'), t('reports.cols.market'), t('reports.cols.account'), t('reports.cols.receipt'), t('reports.cols.note'), t('reports.cols.amount')],
    ...groups.flatMap((g) => [
      ...g.subs.flatMap((s) => s.lines.map((l) => [g.label, s.label, l.date, l.supplier, accountById.get(l.paidFromId) ? name(accountById.get(l.paidFromId)!) : '', l.reference, l.note, plainAmount(l.amountFils)])),
      ...g.own.map((l) => [g.label, '', l.date, l.supplier, accountById.get(l.paidFromId) ? name(accountById.get(l.paidFromId)!) : '', l.reference, l.note, plainAmount(l.amountFils)]),
    ]),
  ]

  const LineRow = ({ line, depth }: { line: ExpenseLine; depth: number }) => (
    <tr className="bg-white">
      <Td>
        <div style={{ paddingLeft: depth * 22 + 22 }}>
          <Link className="text-[13px] font-medium underline" to={`/daily?date=${line.date}&step=expenses`}>
            {formatDate(line.date, lang)}
          </Link>
          <span className="ml-2 text-[13px]">{line.supplier || <span className="text-muted">{t('reports.noMarket')}</span>}</span>
          <p className="text-xs text-muted">{[accountById.get(line.paidFromId) ? name(accountById.get(line.paidFromId)!) : '', line.reference, line.note].filter(Boolean).join(' · ')}</p>
        </div>
      </Td>
      <Td />
      <Td num>{formatAed(line.amountFils)}</Td>
      <Td />
    </tr>
  )

  const Head = ({ rowKey, depth, label, count, totalFils, strong }: { rowKey: string; depth: number; label: string; count: number; totalFils: number; strong?: boolean }) => {
    const expanded = open.has(rowKey)
    return (
      <tr className={depth === 0 ? 'bg-tint' : 'bg-page'}>
        <Td className="p-0">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => toggle(rowKey)}
            style={{ paddingLeft: 8 + depth * 22 }}
            className={cn('flex min-h-11 w-full cursor-pointer items-center gap-2 pr-2 text-left hover:underline', strong ? 'font-bold' : 'font-semibold')}
          >
            <ChevronIcon open={expanded} aria-hidden />
            {label}
          </button>
        </Td>
        <Td num>{count}</Td>
        <Td num strong>
          {formatAed(totalFils)}
        </Td>
        <Td num>{pct(sharePct(totalFils, total))}</Td>
      </tr>
    )
  }

  return (
    <SectionCard
      title={t('reports.byMainCategory')}
      subtitle={t('reports.byMainCategoryHint')}
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={() => setOpen(allOpen ? new Set() : new Set(allKeys))}>
            {allOpen ? t('reports.collapseAll') : t('reports.expandAll')}
          </Button>
          <CsvButton filename={fileName} rows={csv} />
        </>
      }
    >
      <Table label={t('reports.byMainCategory')}>
        <thead>
          <tr>
            <Th>{t('reports.cols.categoryDetail')}</Th>
            <Th num>{t('reports.cols.entries')}</Th>
            <Th num>{t('reports.cols.amount')}</Th>
            <Th num>{t('reports.cols.share')}</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <Head rowKey={`g:${g.key}`} depth={0} label={g.label} count={g.count} totalFils={g.totalFils} strong />
              {open.has(`g:${g.key}`) && (
                <>
                  {g.subs.map((s) => (
                    <Fragment key={s.key}>
                      <Head rowKey={`s:${g.key}:${s.key}`} depth={1} label={s.label} count={s.lines.length} totalFils={s.totalFils} />
                      {open.has(`s:${g.key}:${s.key}`) && s.lines.map((l) => <LineRow key={l.id} line={l} depth={1} />)}
                    </Fragment>
                  ))}
                  {g.own.map((l) => (
                    <LineRow key={l.id} line={l} depth={0} />
                  ))}
                </>
              )}
            </Fragment>
          ))}
          {groups.length === 0 && (
            <tr>
              <Td colSpan={4} className="text-muted">
                {t('dashboard.empty')}
              </Td>
            </tr>
          )}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr className="bg-page">
              <Td strong>{t('reports.totalExpenses')}</Td>
              <Td num strong>
                {groups.reduce((s, g) => s + g.count, 0)}
              </Td>
              <Td num strong data-testid="sum-expenses">
                {formatAed(total)}
              </Td>
              <Td num strong>
                {pct(100)}
              </Td>
            </tr>
          </tfoot>
        )}
      </Table>
    </SectionCard>
  )
}

/** Main categories down the side, days, months or years across the top, so a trend in one category is easy to see. */
export function CategoryMatrix({ data, groups, by, fileName }: { data: ReportData; groups: Group[]; by: GroupBy; fileName: string }) {
  const { t, i18n } = useTranslation()
  const lang: 'en' | 'zh' = i18n.language === 'zh' ? 'zh' : 'en'

  const lineGroup = new Map<number, string>()
  for (const g of groups) {
    for (const l of [...g.own, ...g.subs.flatMap((s) => s.lines)]) lineGroup.set(l.id, g.key)
  }
  const keys = [...new Set(data.expenseLines.map((l) => bucketKey(l.date, by)))].sort()
  const cell = new Map<string, number>()
  for (const l of data.expenseLines) {
    const k = `${lineGroup.get(l.id)}|${bucketKey(l.date, by)}`
    cell.set(k, (cell.get(k) ?? 0) + l.amountFils)
  }
  const colTotal = (k: string) => groups.reduce((s, g) => s + (cell.get(`${g.key}|${k}`) ?? 0), 0)
  const label = (k: string) => formatBucket(k, by, lang)
  const total = groups.reduce((s, g) => s + g.totalFils, 0)

  const csv = [
    [t('reports.cols.mainCategory'), ...keys, t('reports.total')],
    ...groups.map((g) => [g.label, ...keys.map((k) => plainAmount(cell.get(`${g.key}|${k}`) ?? 0)), plainAmount(g.totalFils)]),
    [t('reports.total'), ...keys.map((k) => plainAmount(colTotal(k))), plainAmount(total)],
  ]

  return (
    <SectionCard
      title={t('reports.overTime')}
      subtitle={t('reports.overTimeHint', { by: t(`period.by.${by}`).toLowerCase() })}
      actions={<CsvButton filename={fileName} rows={csv} />}
    >
      {/* On screen periods run across; on paper they run down, since a month of days can't fit across a page */}
      <div className="print:hidden">
        <Table label={t('reports.overTime')}>
          <thead>
            <tr>
              <Th className="sticky left-0 bg-white">{t('reports.cols.mainCategory')}</Th>
              {keys.map((k) => (
                <Th num key={k}>
                  {label(k)}
                </Th>
              ))}
              <Th num>{t('reports.total')}</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <Td strong className="sticky left-0 bg-white whitespace-nowrap">
                  {g.label}
                </Td>
                {keys.map((k) => (
                  <Td num key={k}>
                    {cell.has(`${g.key}|${k}`) ? formatAed(cell.get(`${g.key}|${k}`)!) : <span className="text-muted">—</span>}
                  </Td>
                ))}
                <Td num strong>
                  {formatAed(g.totalFils)}
                </Td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <Td colSpan={2} className="text-muted">
                  {t('dashboard.empty')}
                </Td>
              </tr>
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="bg-page">
                <Td strong className="sticky left-0 bg-page">
                  {t('reports.total')}
                </Td>
                {keys.map((k) => (
                  <Td num strong key={k}>
                    {formatAed(colTotal(k))}
                  </Td>
                ))}
                <Td num strong>
                  {formatAed(total)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
      {groups.length > 0 && (
        <div className="hidden print:block" data-testid="over-time-print">
          <Table label={t('reports.overTime')}>
            <thead>
              <tr>
                <Th>{t('reports.cols.period')}</Th>
                {groups.map((g) => (
                  <Th num key={g.key}>
                    {g.label}
                  </Th>
                ))}
                <Th num>{t('reports.total')}</Th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <Td>{label(k)}</Td>
                  {groups.map((g) => (
                    <Td num key={g.key}>
                      {cell.has(`${g.key}|${k}`) ? formatAed(cell.get(`${g.key}|${k}`)!) : '—'}
                    </Td>
                  ))}
                  <Td num strong>
                    {formatAed(colTotal(k))}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <Td strong>{t('reports.total')}</Td>
                {groups.map((g) => (
                  <Td num strong key={g.key}>
                    {formatAed(g.totalFils)}
                  </Td>
                ))}
                <Td num strong>
                  {formatAed(total)}
                </Td>
              </tr>
            </tfoot>
          </Table>
        </div>
      )}
    </SectionCard>
  )
}
