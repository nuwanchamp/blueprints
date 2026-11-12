import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { formatAed, formatFils, parseFils } from '@/lib/money'

interface Props {
  totalFils: number | null
  tipFils: number
  channelName: string
  disabled?: boolean
  onCommit: (totalFils: number, tipFils: number) => void | Promise<void>
}

/**
 * A Visa or Mastercard amount: looks like one field ("AED 3,000.00 − tips 100.00") but is two, the machine's total
 * and the tips inside it. Tab moves from one to the other; nobody types a minus. Both are checked and saved
 * together when focus leaves the field, so a half-typed pair is never flagged.
 */
export function CardTipInput({ totalFils, tipFils, channelName, disabled, onCommit }: Props) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const typing = useRef(false)
  const show = (fils: number | null) => (fils === null || fils === 0 ? '' : formatFils(fils))
  const [total, setTotal] = useState(show(totalFils))
  const [tip, setTip] = useState(show(tipFils))
  const [error, setError] = useState<'invalid' | 'tipOver' | null>(null)

  // Follow the saved values unless the person is in the field, so a rejected pair stays on screen with its error
  useEffect(() => {
    if (typing.current) return
    setTotal(show(totalFils))
    setTip(show(tipFils))
    setError(null)
  }, [totalFils, tipFils])

  function leave(e: FocusEvent) {
    // Moving between the two parts is still inside the field
    if (box.current?.contains(e.relatedTarget as Node | null)) return
    typing.current = false
    const totalIn = total.trim() === '' ? 0 : parseFils(total)
    const tipIn = tip.trim() === '' ? 0 : parseFils(tip)
    if (totalIn === null || tipIn === null) return setError('invalid')
    if (tipIn > totalIn) return setError('tipOver')
    setError(null)
    setTotal(show(totalIn))
    setTip(show(tipIn))
    if (totalIn !== (totalFils ?? 0) || tipIn !== tipFils) void onCommit(totalIn, tipIn)
  }

  const part = 'min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-muted disabled:cursor-not-allowed'
  const errorId = `card-error-${channelName}`
  const hasTotal = totalFils !== null && totalFils > 0
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div
        ref={box}
        onFocus={() => (typing.current = true)}
        onBlur={leave}
        className={cn(
          'flex h-11 w-72 items-center gap-2 rounded-lg border bg-white px-3 focus-within:outline-2 focus-within:outline-offset-2',
          error ? 'border-2 border-loss focus-within:outline-loss' : 'border-control focus-within:outline-ink',
          disabled && 'bg-tint',
        )}
      >
        <span className="text-sm font-medium text-muted" aria-hidden>
          AED
        </span>
        <input
          aria-label={`${t('daily.sales.amount')}: ${channelName}`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={total}
          placeholder="0.00"
          onChange={(e) => setTotal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          className={cn(part, 'flex-1')}
        />
        <span className="text-sm font-semibold text-muted" aria-hidden>
          −
        </span>
        <span className="text-xs font-medium text-muted" aria-hidden>
          {t('daily.sales.tipsWord')}
        </span>
        <input
          aria-label={`${t('daily.sales.tipsWord')}: ${channelName}`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error === 'tipOver' ? true : undefined}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={tip}
          placeholder="0.00"
          onChange={(e) => setTip(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          className={cn(part, 'w-20')}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-loss">
          {t(error === 'tipOver' ? 'errors.tipOverTotal' : 'errors.amountInvalid')}
        </p>
      ) : (
        hasTotal && (
          <p className="text-xs text-muted tabular-nums" data-testid={`card-result-${channelName}`}>
            {tipFils > 0 ? t('daily.sales.cardResult', { sales: formatAed(totalFils - tipFils), tips: formatAed(tipFils) }) : t('daily.sales.cardNoTips', { sales: formatAed(totalFils) })}
          </p>
        )
      )}
    </div>
  )
}
