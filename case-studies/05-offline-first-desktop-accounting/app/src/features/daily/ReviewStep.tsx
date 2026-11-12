import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icons'
import { CircleCheck, FileSpreadsheet, Lock, LockOpen } from 'lucide-react'
import { Callout } from '@/components/ui/Callout'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { backupClosedDay, downloadDayExcel } from '@/features/backup/afterClose'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { closeDay, reopenDay, setCountedCash, setDayNote } from '@/db/repo/daily'
import { formatAed } from '@/lib/money'
import { VarianceMessage } from './CashStep'
import { salesRows } from './salesRows'
import { CategoriseRow } from './Uncategorised'
import { Notice, StepCard, StepNav, errorText, type StepId } from './components'
import type { DailyCtx } from './useDailyData'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {/* Dim strips on every other line, so the eye can follow a label across to its amount */}
      <div className="flex flex-col gap-1 [&>[data-row]:nth-child(odd)]:bg-page [&>[data-row]:hover]:bg-tint">{children}</div>
    </section>
  )
}

function Row({ label, value, strong, total, indent = 0 }: { label: string; value: string; strong?: boolean; total?: boolean; indent?: number }) {
  // A section total is set apart: bigger, on a tinted strip with an ink edge
  if (total)
    return (
      <div className="my-1.5 flex items-center justify-between gap-4 rounded-lg bg-tint px-4 py-3 shadow-[inset_4px_0_0_0_var(--color-ink)]">
        <span className="text-base font-bold">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
    )
  return (
    <div data-row className="-mx-3 flex min-h-9 items-center justify-between gap-4 rounded-md py-1 pr-3 text-sm" style={{ paddingLeft: 12 + indent * 16 }}>
      <span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span>
      <span className={strong ? 'font-bold tabular-nums' : 'font-medium tabular-nums'}>{value}</span>
    </div>
  )
}

export function ReviewStep({ ctx, onStep }: { ctx: DailyCtx; onStep: (s: StepId) => void }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const { data, by, rec, closed, date } = ctx
  const [note, setNote] = useState(data.day.note)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => setNote(data.day.note), [data.day.note])

  // Totals per top-level category (a sub-category rolls up into its parent)
  const byCategory = new Map<string, number>()
  for (const e of data.expenses) {
    const c = e.categoryId === null ? undefined : by.category.get(e.categoryId)
    const top = c?.parentId == null ? c : by.category.get(c.parentId)
    const label = top ? name(top) : t('daily.expenses.uncategorised')
    byCategory.set(label, (byCategory.get(label) ?? 0) + e.amountFils)
  }
  const byAccount = new Map<string, number>()
  for (const e of data.expenses) {
    const a = by.account.get(e.paidFromId)
    const label = a ? name(a) : '—'
    byAccount.set(label, (byAccount.get(label) ?? 0) + e.amountFils)
  }

  const uncategorisedToday = data.expenses.filter((e) => e.categoryId === null)
  const byDiscountReason = new Map<string, number>()
  for (const d of data.discounts) {
    const r = by.discountReason.get(d.reasonId)
    const label = r ? name(r) : '—'
    byDiscountReason.set(label, (byDiscountReason.get(label) ?? 0) + d.amountFils)
  }
  const needsNote = rec.status === 'alert' && !note.trim()
  const tipsOver = data.sales.filter((s) => s.tipFils > s.amountFils)
  const problems = [
    ...tipsOver.map((s) =>
      t('daily.review.checkTips', { channel: by.channel.get(s.channelId) ? name(by.channel.get(s.channelId)!) : '', tips: formatAed(s.tipFils), total: formatAed(s.amountFils) }),
    ),
    data.sales.length === 0 && t('daily.review.checkSales'),
    data.day.countedCashFils === null && t('daily.review.checkCount'),
    needsNote && t('daily.review.checkVariance'),
    uncategorisedToday.length > 0 && t('daily.review.checkUncategorised', { count: uncategorisedToday.length }),
  ].filter((x): x is string => Boolean(x))
  // No sales and uncategorised expenses are warnings only; an uncounted drawer, an unexplained variance or tips above
  // a card total block closing
  const blocked = data.day.countedCashFils === null || needsNote || tipsOver.length > 0

  async function act(fn: () => Promise<void>) {
    try {
      await fn()
      setNotice(null)
    } catch (e) {
      setNotice(errorText(e, t))
    }
    await ctx.reload()
  }

  return (
    <StepCard title={t('daily.review.title')} description={t('daily.review.description')}>
      {closed && (
        <Notice>
          {t('daily.closedBanner')} {data.day.closedAt && t('daily.review.closedAt', { when: data.day.closedAt })}
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}

      <Block title={t('daily.review.salesByChannel')}>
        {data.sales.length === 0 && <p className="text-sm text-muted">{t('daily.review.none')}</p>}
        {salesRows(ctx.master.channels, data.sales)
          .filter((r) => r.subtotalFils > 0)
          .map((r) => (
            <Row key={`${r.kind}${r.channel.id}`} indent={r.depth} strong={r.kind === 'group' && r.depth === 0} label={name(r.channel)} value={formatAed(r.subtotalFils)} />
          ))}
        <Row label={t('daily.sales.total')} value={formatAed(rec.totalSalesFils)} total />
        {rec.tipsFils > 0 && (
          <>
            <Row label={t('daily.sales.tipsTotal')} value={formatAed(rec.tipsFils)} />
            {data.sales
              .filter((s) => s.tipFils > 0 && s.tipFils <= s.amountFils)
              .map((s) => (
                <Row key={`tip${s.channelId}`} indent={1} label={ctx.by.channel.get(s.channelId) ? name(ctx.by.channel.get(s.channelId)!) : ''} value={formatAed(s.tipFils)} />
              ))}
            <Row label={t('daily.sales.received')} value={formatAed(rec.receivedFils)} />
          </>
        )}
        {rec.discountsFils > 0 && (
          <>
            <Row label={t('daily.discounts.title')} value={formatAed(rec.discountsFils)} />
            <Row label={t('daily.discounts.gross')} value={formatAed(rec.grossSalesFils)} />
          </>
        )}
      </Block>

      {data.discounts.length > 0 && (
        <Block title={t('daily.review.discountsByReason')}>
          {[...byDiscountReason].map(([label, fils]) => (
            <Row key={label} label={label} value={formatAed(fils)} />
          ))}
          <Row label={t('daily.discounts.total')} value={formatAed(rec.discountsFils)} total />
        </Block>
      )}

      {uncategorisedToday.length > 0 && (
        <Block title={t('daily.review.needsCategory')}>
          <p className="mb-1 text-xs text-muted">{t('daily.review.needsCategoryHint')}</p>
          <ul>
            {uncategorisedToday.map((e) => (
              <CategoriseRow key={e.id} ctx={ctx} item={{ ...e, id: e.id }} />
            ))}
          </ul>
        </Block>
      )}

      <Block title={t('daily.review.expensesByCategory')}>
        {byCategory.size === 0 && <p className="text-sm text-muted">{t('daily.review.none')}</p>}
        {[...byCategory].map(([label, fils]) => (
          <Row key={label} label={label} value={formatAed(fils)} />
        ))}
        <Row label={t('daily.expenses.total')} value={formatAed(rec.totalExpensesFils)} total />
      </Block>

      <Block title={t('daily.review.expensesByAccount')}>
        {byAccount.size === 0 && <p className="text-sm text-muted">{t('daily.review.none')}</p>}
        {[...byAccount].map(([label, fils]) => (
          <Row key={label} label={label} value={formatAed(fils)} />
        ))}
      </Block>

      <Block title={t('daily.review.reconciliation')}>
        <Row label={t('daily.summary.opening')} value={formatAed(data.day.openingFloatFils)} />
        <Row label={t('daily.summary.cashSales')} value={formatAed(rec.cashSalesFils)} />
        <Row label={t('daily.summary.cashIn')} value={formatAed(rec.cashInFils)} />
        <Row label={t('daily.summary.available')} value={formatAed(rec.availableFils)} strong />
        <Row label={t('daily.summary.drawerExpenses')} value={formatAed(rec.drawerExpensesFils)} />
        <Row label={t('daily.summary.cashOut')} value={formatAed(rec.cashOutFils)} />
        <Row label={t('daily.summary.expected')} value={formatAed(rec.expectedCashFils)} total />
        {closed ? (
          data.day.countedCashFils !== null && <Row label={t('daily.summary.counted')} value={formatAed(data.day.countedCashFils)} strong />
        ) : (
          // Count and confirm here, without going back a step
          <div className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-tint p-4">
            <div>
              <p className="text-sm font-semibold">{t('daily.cash.counted')}</p>
              <p className="max-w-md text-xs text-muted">{t('daily.cash.countedHint')}</p>
            </div>
            <MoneyInput big label={t('daily.cash.counted')} value={data.day.countedCashFils} onCommit={(v) => act(() => setCountedCash(date, v))} className="w-60" />
          </div>
        )}
        <div className="mt-2">
          <VarianceMessage ctx={ctx} />
        </div>
      </Block>

      <Block title={t('daily.review.dayNote')}>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">{t('daily.review.dayNoteHint')}</span>
          <textarea
            rows={3}
            value={note}
            disabled={closed}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note.trim() !== data.day.note && void act(() => setDayNote(date, note))}
            className="w-full rounded-lg border border-control bg-white p-3 text-sm disabled:bg-tint"
          />
        </label>
      </Block>

      <Block title={t('daily.review.checklist')}>
        {problems.length === 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon icon={CircleCheck} className="text-ok" />
            {t('daily.review.ready')}
          </p>
        ) : (
          <Callout tone="warn" className="py-3 text-sm">
            <ul className={cn(problems.length > 1 && 'list-disc pl-5')}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {closed ? (
            <Button variant="secondary" onClick={() => void act(() => reopenDay(date))}>
              <Icon icon={LockOpen} size={16} />
              {t('daily.review.reopen')}
            </Button>
          ) : (
            <Button
              disabled={blocked}
              onClick={() =>
                void act(async () => {
                  // Save a note typed just before pressing Close
                  if (note.trim() !== data.day.note) await setDayNote(date, note)
                  await closeDay(date)
                  // Every closed day leaves a backup behind (and its Excel copy); a failed backup must not undo the close
                  await backupClosedDay(date, t, zh ? 'zh' : 'en')
                })
              }
            >
              <Icon icon={Lock} size={16} />
              {t('daily.review.closeDay')}
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={() => void downloadDayExcel(date, t, zh ? 'zh' : 'en')}>
            <Icon icon={FileSpreadsheet} size={16} />
            {t('backup.downloadDay')}
          </Button>
        </div>
      </Block>
      <StepNav step="review" onStep={onStep} />
    </StepCard>
  )
}
