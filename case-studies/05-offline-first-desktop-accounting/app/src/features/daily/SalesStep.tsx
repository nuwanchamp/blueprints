import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { saveCardSale, saveSale, setOpeningFloat } from '@/db/repo/daily'
import { cn } from '@/lib/cn'
import { formatAed } from '@/lib/money'
import { Notice, StepCard, StepNav, TotalLine, errorText, type StepId } from './components'
import { CardTipInput } from './CardTipInput'
import { DiscountsBlock } from './DiscountsBlock'
import { salesRows } from './salesRows'
import type { DailyCtx } from './useDailyData'

export function SalesStep({ ctx, onStep }: { ctx: DailyCtx; onStep: (s: StepId) => void }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const [notice, setNotice] = useState<string | null>(null)
  const { master, data, rec, closed, date } = ctx

  const rows = salesRows(master.channels, data.sales)
  const tipOf = new Map(data.sales.map((s) => [s.channelId, s.tipFils]))

  async function guard(fn: () => Promise<void>) {
    try {
      await fn()
      setNotice(null)
    } catch (e) {
      setNotice(errorText(e, t))
    }
    await ctx.reload()
  }

  return (
    <StepCard title={t('daily.sales.title')} description={t('daily.sales.description')}>
      {notice && <Notice>{notice}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line bg-page px-5 py-3">
        <div>
          <p className="text-sm font-semibold">{t('daily.sales.openingFloat')}</p>
          <p className="max-w-md text-xs text-muted">{t('daily.sales.openingHint')}</p>
        </div>
        <MoneyInput
          label={t('daily.sales.openingFloat')}
          value={data.day.openingFloatFils}
          emptyAs="zero"
          disabled={closed}
          onCommit={(v) => guard(() => setOpeningFloat(date, v ?? 0))}
          className="w-48"
        />
      </div>

      {rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">{t('daily.sales.noChannels')}</p>}
      <ul>
        {rows.map((r) => {
          const { channel: c, depth } = r
          const label = zh ? c.nameZh : c.nameEn
          const indent = { paddingLeft: 20 + depth * 20 }
          if (r.kind === 'group') {
            return (
              <li
                key={`g${c.id}`}
                data-testid={`group-${c.nameEn}`}
                style={indent}
                className={cn('flex min-h-11 items-center justify-between gap-4 border-b border-line pr-5', depth === 0 ? 'bg-tint' : 'bg-page')}
              >
                <span className={cn('text-sm', depth === 0 ? 'font-bold' : 'font-semibold')}>{label}</span>
                <span className="text-sm font-semibold tabular-nums">{formatAed(r.subtotalFils)}</span>
              </li>
            )
          }
          // Visa and Mastercard: the machine's total and the tips inside it, in one field with two parts
          const card = c.takesTips && r.kind === 'entry'
          return (
            <li key={`${r.kind}${c.id}`} style={indent} className="flex min-h-16 items-center justify-between gap-4 border-b border-line py-2 pr-5">
              <div className="min-w-0">
                <p className={c.active ? 'text-sm font-medium' : 'text-sm font-medium text-muted'}>
                  {label}
                  {r.kind === 'earlier' && <span className="ml-2 text-xs font-normal text-muted">{t('daily.sales.earlier')}</span>}
                </p>
                {card && <p className="text-xs text-muted">{t('daily.sales.cardHint')}</p>}
              </div>
              {card ? (
                <CardTipInput
                  channelName={c.nameEn}
                  totalFils={r.ownFils}
                  tipFils={tipOf.get(c.id) ?? 0}
                  disabled={closed}
                  onCommit={(total, tip) => guard(() => saveCardSale(date, c.id, total, tip))}
                />
              ) : (
                <MoneyInput
                  label={`${t('daily.sales.amount')}: ${c.nameEn}`}
                  value={r.ownFils}
                  emptyAs="zero"
                  disabled={closed}
                  onCommit={(v) => guard(() => saveSale(date, c.id, v ?? 0))}
                  className="w-48 shrink-0"
                />
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('daily.sales.cashPart')}</dt>
          <dd className="font-medium tabular-nums">{formatAed(rec.cashSalesFils)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('daily.sales.otherPart')}</dt>
          <dd className="font-medium tabular-nums">{formatAed(rec.otherSalesFils)}</dd>
        </div>
      </dl>
      <TotalLine label={t('daily.sales.total')} value={formatAed(rec.totalSalesFils)} testId="total-sales" />
      <dl className="flex flex-col gap-1.5 text-sm">
        {rec.tipsFils > 0 && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('daily.sales.tipsTotal')}</dt>
              <dd className="font-medium tabular-nums" data-testid="card-tips">
                {formatAed(rec.tipsFils)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('daily.sales.received')}</dt>
              <dd className="font-medium tabular-nums">{formatAed(rec.receivedFils)}</dd>
            </div>
          </>
        )}
        {rec.discountsFils > 0 && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('daily.discounts.title')}</dt>
              <dd className="font-medium tabular-nums">{formatAed(rec.discountsFils)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('daily.discounts.gross')}</dt>
              <dd className="font-medium tabular-nums" data-testid="gross-sales">
                {formatAed(rec.grossSalesFils)}
              </dd>
            </div>
          </>
        )}
      </dl>
      </div>
      <DiscountsBlock ctx={ctx} />
      <StepNav step="sales" onStep={onStep} />
    </StepCard>
  )
}
