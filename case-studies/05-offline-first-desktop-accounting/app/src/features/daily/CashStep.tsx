import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Input } from '@/components/ui/Field'
import { TrashIcon } from '@/components/ui/icons'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { deleteMovement, saveMovement, setCountedCash } from '@/db/repo/daily'
import { RepoError } from '@/db/repo/expenses'
import { formatAed } from '@/lib/money'
import { Notice, StepCard, StepNav, TotalLine, errorText, type StepId } from './components'
import type { DailyCtx } from './useDailyData'

interface FormErrors {
  reason?: string
  amount?: string
  note?: string
  other?: string
}

export function VarianceMessage({ ctx, onTint }: { ctx: DailyCtx; onTint?: boolean }) {
  const { t } = useTranslation()
  const { rec, master } = ctx
  const abs = Math.abs(rec.varianceFils ?? 0)
  const side = (rec.varianceFils ?? 0) < 0 ? t('daily.cash.short') : t('daily.cash.over')
  // Status is spelled out in words, not shown by colour alone
  const text =
    rec.status === 'uncounted'
      ? t('daily.cash.uncounted')
      : rec.status === 'balanced'
        ? t('daily.cash.balanced')
        : rec.status === 'within'
          ? `${formatAed(abs)} ${side}. ${t('daily.cash.within', { amount: formatAed(master.alertFils) })}`
          : `${formatAed(abs)} ${side}. ${t('daily.cash.alert', { amount: formatAed(master.alertFils) })}`
  return (
    <p role="status" data-status={rec.status} className={rec.status === 'alert' ? 'rounded-lg border-2 border-ink bg-white px-3 py-2 text-[13px] font-semibold' : onTint ? 'rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium' : 'rounded-lg bg-tint px-3 py-2 text-[13px] font-medium'}>
      {text}
    </p>
  )
}

export function CashStep({ ctx, onStep }: { ctx: DailyCtx; onStep: (s: StepId) => void }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const { master, data, by, rec, closed, date } = ctx

  // The first active reason (Float top-up) is selected until another is picked
  const [picked, setReasonId] = useState<number | null>(null)
  const reasonId = picked ?? master.reasons.find((r) => r.active)?.id ?? null
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const reason = reasonId == null ? null : by.reason.get(reasonId)
  const dir = (d: 'in' | 'out') => (d === 'in' ? t('cashReasons.in') : t('cashReasons.out'))

  async function guard(fn: () => Promise<void>) {
    try {
      await fn()
      setNotice(null)
    } catch (e) {
      setNotice(errorText(e, t))
    }
    await ctx.reload()
  }

  async function add() {
    // Say exactly what is missing, next to the field it belongs to
    const missing: FormErrors = {}
    if (reasonId == null) missing.reason = t('errors.chooseReason')
    if (!amount) missing.amount = t('errors.amountInvalid')
    if (missing.reason || missing.amount) {
      setFormErrors(missing)
      return
    }
    try {
      await saveMovement({ date, reasonId: reasonId!, amountFils: amount!, note })
      setReasonId(null)
      setAmount(null)
      setNote('')
      setFormErrors({})
      setFormKey((k) => k + 1)
    } catch (e) {
      const key = e instanceof RepoError ? e.key : ''
      const text = errorText(e, t)
      setFormErrors(key === 'errors.noteRequired' ? { note: text } : key === 'errors.amountInvalid' ? { amount: text } : key === 'errors.reasonInvalid' ? { reason: text } : { other: text })
    }
    await ctx.reload()
  }

  return (
    <StepCard title={t('daily.cash.title')} description={t('daily.cash.description')}>
      {notice && <Notice>{notice}</Notice>}

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-sm font-semibold">{t('daily.cash.movements')}</h3>

        {!closed && (
          <div key={formKey} className="mt-3 flex flex-col gap-3 rounded-lg bg-page p-4">
            {master.reasons.some((r) => r.active) ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <ChipGroup
                    label={t('daily.cash.reason')}
                    value={reasonId}
                    onChange={(id) => {
                      setReasonId(id)
                      setFormErrors((e) => ({ ...e, reason: undefined, note: undefined }))
                    }}
                    options={master.reasons.filter((r) => r.active).map((r) => ({ value: r.id as number | null, label: `${name(r)} (${dir(r.direction)})` }))}
                  />
                  {formErrors.reason && (
                    <p role="alert" className="text-xs font-semibold text-loss">
                      {formErrors.reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-48 flex-1">
                    <Input
                      aria-label={t('daily.cash.note')}
                      invalid={!!formErrors.note}
                      placeholder={reason?.noteRequired ? `${t('daily.cash.note')} — ${t('daily.cash.noteRequired')}` : t('daily.cash.note')}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value)
                        setFormErrors((x) => ({ ...x, note: undefined }))
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && void add()}
                    />
                    {formErrors.note && (
                      <p role="alert" className="mt-1 text-xs font-semibold text-loss">
                        {formErrors.note}
                      </p>
                    )}
                  </div>
                  <div className="w-44">
                    <MoneyInput
                      label={t('daily.cash.amount')}
                      value={amount}
                      onCommit={(v) => {
                        setAmount(v)
                        if (v) setFormErrors((e) => ({ ...e, amount: undefined }))
                      }}
                      onEnter={() => void add()}
                    />
                    {formErrors.amount && (
                      <p role="alert" className="mt-1 text-xs font-semibold text-loss">
                        {formErrors.amount}
                      </p>
                    )}
                  </div>
                  <Button onClick={() => void add()}>{t('daily.cash.addMovement')}</Button>
                </div>
                {formErrors.other && (
                  <p role="alert" className="text-xs font-semibold text-loss">
                    {formErrors.other}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">{t('daily.cash.noReasons')}</p>
            )}
          </div>
        )}

        {data.movements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('daily.cash.movementEmpty')}</p>
        ) : (
          <ul className="mt-3 border-t border-line">
            {data.movements.map((m) => {
              const r = by.reason.get(m.reasonId)
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">{r ? name(r) : '—'}</p>
                    <p className="text-xs text-muted">{[r && dir(r.direction), m.note].filter(Boolean).join(' · ')}</p>
                  </div>
                  <p className="w-32 text-right text-sm font-semibold tabular-nums">
                    {r?.direction === 'out' ? '−' : '+'} {formatAed(m.amountFils)}
                  </p>
                  {!closed &&
                    (confirming === m.id ? (
                      <div className="flex items-center gap-2" role="group" aria-label={t('daily.expenses.confirmDelete')}>
                        <Button size="sm" onClick={() => void guard(() => deleteMovement(date, m.id)).then(() => setConfirming(null))}>
                          {t('daily.expenses.confirmYes')}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>
                          {t('daily.expenses.keep')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-[#b3261e] hover:bg-[#fbeae8]"
                        aria-label={`${t('daily.cash.delete')}: ${r ? name(r) : ''}`}
                        title={t('daily.cash.delete')}
                        onClick={() => setConfirming(m.id)}
                      >
                        <TrashIcon />
                      </Button>
                    ))}
                </li>
              )
            })}
          </ul>
        )}

        {/* Totals of the movements, so the list adds up like the expenses list does */}
        <dl className="mt-3 flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t('daily.cash.totalAdded')}</dt>
            <dd className="font-medium tabular-nums" data-testid="total-cash-added">
              {formatAed(rec.cashInFils)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t('daily.cash.totalTakenOut')}</dt>
            <dd className="font-medium tabular-nums" data-testid="total-cash-out">
              {formatAed(rec.cashOutFils)}
            </dd>
          </div>
        </dl>
        <TotalLine
          className="mt-3"
          label={t('daily.cash.net')}
          testId="net-cash-movements"
          value={rec.cashInFils === rec.cashOutFils ? formatAed(0) : `${rec.cashInFils > rec.cashOutFils ? '+' : '−'} ${formatAed(Math.abs(rec.cashInFils - rec.cashOutFils))}`}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-tint p-5" data-testid="count-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('daily.cash.counted')}</h3>
            <p className="max-w-md text-xs text-muted">{t('daily.cash.countedHint')}</p>
          </div>
          <MoneyInput
            big
            label={t('daily.cash.counted')}
            value={data.day.countedCashFils}
            disabled={closed}
            onCommit={(v) => guard(() => setCountedCash(date, v))}
            className="w-60"
          />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t('daily.cash.expected')}</span>
          <span className="font-semibold tabular-nums" data-testid="expected-cash">
            {formatAed(rec.expectedCashFils)}
          </span>
        </div>
        <VarianceMessage ctx={ctx} onTint />
        </div>
      </div>
      <StepNav step="cash" onStep={onStep} />
    </StepCard>
  )
}
