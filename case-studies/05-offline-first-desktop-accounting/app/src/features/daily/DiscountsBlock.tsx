import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Input } from '@/components/ui/Field'
import { TrashIcon } from '@/components/ui/icons'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { deleteDiscount, saveDiscount } from '@/db/repo/daily'
import { RepoError } from '@/db/repo/expenses'
import { formatAed } from '@/lib/money'
import { TotalLine, errorText } from './components'
import type { DailyCtx } from './useDailyData'

interface FormErrors {
  reason?: string
  amount?: string
  other?: string
}

/**
 * Discounts given today. A memo beside the sales: sales are entered as received, so these are never
 * subtracted again and never change the expected cash.
 */
export function DiscountsBlock({ ctx }: { ctx: DailyCtx }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const { master, data, rec, by, closed, date } = ctx

  const [reasonId, setReasonId] = useState<number | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [errors, setErrors] = useState<FormErrors>({})
  const [confirming, setConfirming] = useState<number | null>(null)

  async function add() {
    const missing: FormErrors = {}
    if (reasonId == null) missing.reason = t('errors.chooseReason')
    if (!amount) missing.amount = t('errors.amountInvalid')
    if (missing.reason || missing.amount) {
      setErrors(missing)
      return
    }
    try {
      await saveDiscount({ date, reasonId: reasonId!, amountFils: amount!, note })
      setReasonId(null)
      setAmount(null)
      setNote('')
      setErrors({})
      setFormKey((k) => k + 1)
    } catch (e) {
      setErrors({ other: errorText(e, t) })
    }
    await ctx.reload()
  }

  async function remove(id: number) {
    try {
      await deleteDiscount(date, id)
    } catch (e) {
      setErrors({ other: e instanceof RepoError ? t(e.key) : t('common.saveFailed') })
    }
    setConfirming(null)
    await ctx.reload()
  }

  return (
    <section className="border-t border-line px-5 py-4" aria-labelledby="discounts-heading">
      <h3 id="discounts-heading" className="text-sm font-semibold">
        {t('daily.discounts.title')}
      </h3>
      <p className="mt-0.5 max-w-xl text-xs text-muted">{t('daily.discounts.hint')}</p>

      {!closed && (
        <div key={formKey} className="mt-3 flex flex-col gap-3 rounded-lg bg-page p-4">
          {master.discountReasons.some((r) => r.active) ? (
            <>
              <div className="flex flex-col gap-1.5">
                <ChipGroup
                  label={t('daily.discounts.reason')}
                  value={reasonId}
                  onChange={(id) => {
                    setReasonId(id)
                    setErrors((e) => ({ ...e, reason: undefined }))
                  }}
                  options={master.discountReasons.filter((r) => r.active).map((r) => ({ value: r.id as number | null, label: name(r) }))}
                />
                {errors.reason && (
                  <p role="alert" className="text-xs font-semibold text-loss">
                    {errors.reason}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <Input
                  aria-label={t('daily.discounts.note')}
                  placeholder={t('daily.discounts.note')}
                  maxLength={120}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void add()}
                  className="min-w-48 flex-1"
                />
                <div className="w-44">
                  <MoneyInput
                    label={t('daily.discounts.amount')}
                    value={amount}
                    onCommit={(v) => {
                      setAmount(v)
                      if (v) setErrors((e) => ({ ...e, amount: undefined }))
                    }}
                    onEnter={() => void add()}
                  />
                  {errors.amount && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-loss">
                      {errors.amount}
                    </p>
                  )}
                </div>
                <Button onClick={() => void add()}>{t('daily.discounts.add')}</Button>
              </div>
              {errors.other && (
                <p role="alert" className="text-xs font-semibold text-loss">
                  {errors.other}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{t('daily.discounts.noReasons')}</p>
          )}
        </div>
      )}

      {data.discounts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('daily.discounts.empty')}</p>
      ) : (
        <ul className="mt-3 border-t border-line">
          {data.discounts.map((d) => {
            const r = by.discountReason.get(d.reasonId)
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-2">
                <div className="min-w-40 flex-1">
                  <p className="text-sm font-medium">{r ? name(r) : '—'}</p>
                  {d.note && <p className="text-xs text-muted">{d.note}</p>}
                </div>
                <p className="w-32 text-right text-sm font-semibold tabular-nums">{formatAed(d.amountFils)}</p>
                {!closed &&
                  (confirming === d.id ? (
                    <div className="flex items-center gap-1" role="group" aria-label={t('daily.expenses.confirmDelete')}>
                      <Button size="sm" aria-label={`${t('daily.expenses.confirmYes')}: ${r ? name(r) : ''}`} onClick={() => void remove(d.id)}>
                        {t('common.yes')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>
                        {t('common.no')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-[#b3261e] hover:bg-[#fbeae8]"
                      aria-label={`${t('daily.discounts.delete')}: ${r ? name(r) : ''}`}
                      title={t('daily.discounts.delete')}
                      onClick={() => setConfirming(d.id)}
                    >
                      <TrashIcon />
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}

      <TotalLine className="mt-3" label={t('daily.discounts.total')} value={formatAed(rec.discountsFils)} testId="total-discounts" />
    </section>
  )
}
